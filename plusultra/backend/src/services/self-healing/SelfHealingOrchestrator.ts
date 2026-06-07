/**
 * Self-Healing Orchestrator
 *
 * Main coordinator for the self-healing system.
 * Orchestrates: Error Detection → Analysis → TCI Fix → Validation → Deployment → Monitoring
 */

import { prisma } from '../../lib/prisma';
import { sentryWebhookService, type ProcessedError } from './SentryWebhookService';
import { errorAnalysisService, type ErrorContext } from './ErrorAnalysisService';
import { fixValidationService } from './FixValidationService';
import { autoDeploymentService, type DeploymentStrategy } from './AutoDeploymentService';
import { healingAttemptTracker } from './HealingAttemptTracker';
import { healingNotificationService } from './HealingNotificationService';
import { TCI6LayerOrchestrator } from '../tci/TCI6LayerOrchestrator';
import { monitoringService } from '../monitoring/MonitoringService';

export interface HealingResult {
  attemptId: string;
  success: boolean;
  confidence: number;
  fixApplied: boolean;
  deployed: boolean;
  rolledBack: boolean;
  error?: string;
  duration: number;
}

export interface HealingOptions {
  triggerSource?: 'auto' | 'manual' | 'scheduled';
  requireApproval?: boolean;
  skipValidation?: boolean;
  deployEnvironment?: 'staging' | 'production';
  projectRoot?: string;
}

export class SelfHealingOrchestrator {
  private tciOrchestrator: TCI6LayerOrchestrator;
  private activeHealings: Map<string, boolean> = new Map();
  private circuitBreaker: Map<string, { failures: number; lastFailure: number }> = new Map();

  // Configuration
  private readonly CIRCUIT_BREAKER_THRESHOLD = 3;
  private readonly CIRCUIT_BREAKER_RESET_TIME = 300000; // 5 minutes
  private readonly DEFAULT_MIN_CONFIDENCE = 0.85;

  constructor() {
    this.tciOrchestrator = new TCI6LayerOrchestrator();
    console.log('[Self-Healing] Orchestrator initialized');
  }

  /**
   * Main entry point: Process error and attempt healing
   */
  async handleError(
    errorId: string,
    options: HealingOptions = {}
  ): Promise<HealingResult | null> {
    const startTime = Date.now();

    try {
      console.log(`[Self-Healing] Starting healing process for error ${errorId}`);

      // Check if already healing this error
      if (this.activeHealings.has(errorId)) {
        console.log(`[Self-Healing] Error ${errorId} already being healed`);
        return null;
      }

      // Check circuit breaker
      if (this.isCircuitOpen(errorId)) {
        console.log(`[Self-Healing] Circuit breaker open for error ${errorId}`);
        return null;
      }

      // Mark as actively healing
      this.activeHealings.set(errorId, true);

      // Step 1: Check if healing should be triggered
      const shouldHeal = await sentryWebhookService.shouldTriggerHealing(errorId);
      if (!shouldHeal) {
        console.log(`[Self-Healing] Healing not triggered for error ${errorId}`);
        this.activeHealings.delete(errorId);
        return null;
      }

      // Step 2: Get error details
      const error = await sentryWebhookService.getErrorDetails(errorId);
      if (!error) {
        throw new Error(`Error ${errorId} not found`);
      }

      // Step 3: Update error status
      await prisma.sentryError.update({
        where: { id: errorId },
        data: { status: 'healing' },
      });

      // Step 4: Create healing attempt record
      const attempt = await prisma.healingAttempt.create({
        data: {
          errorId,
          triggerSource: options.triggerSource || 'auto',
          status: 'analyzing',
          fixCode: '', // Will be filled by TCI
          fixDescription: '', // Will be filled by TCI
          confidence: 0, // Will be filled by TCI
        },
      });

      console.log(`[Self-Healing] Created healing attempt ${attempt.id}`);

      // Notify: Attempt started
      healingNotificationService.notifyAttemptStarted(attempt.id).catch(err =>
        console.error('Notification error:', err)
      );

      try {
        // Step 5: Analyze error context
        const errorContext = await errorAnalysisService.analyzeError(
          errorId,
          options.projectRoot
        );

        if (!errorContext) {
          throw new Error('Failed to analyze error context');
        }

        // Step 6: Generate fix using TCI
        const fix = await this.generateFix(errorContext, attempt.id);

        if (!fix || fix.confidence < this.DEFAULT_MIN_CONFIDENCE) {
          // Low confidence - require human review
          await this.requestHumanReview(attempt.id, fix);

          this.activeHealings.delete(errorId);
          return {
            attemptId: attempt.id,
            success: false,
            confidence: fix?.confidence || 0,
            fixApplied: false,
            deployed: false,
            rolledBack: false,
            error: 'Confidence too low - requires human review',
            duration: Date.now() - startTime,
          };
        }

        // Step 7: Validate fix (if not skipped)
        if (!options.skipValidation) {
          const validationResult = await this.validateFix(
            attempt.id,
            errorContext,
            fix.code
          );

          if (!validationResult.passed) {
            throw new Error(`Fix validation failed: ${validationResult.error}`);
          }
        }

        // Step 8: Deploy fix (if approval not required)
        const config = await this.getHealingConfig(error.projectId);
        const shouldDeploy =
          !options.requireApproval &&
          !config?.requireApproval &&
          fix.confidence >= (config?.minConfidence || this.DEFAULT_MIN_CONFIDENCE);

        let deployed = false;
        if (shouldDeploy) {
          deployed = await this.deployFix(
            attempt.id,
            errorContext,
            fix.code,
            options.deployEnvironment || 'staging'
          );
        }

        // Step 9: Mark as complete
        await prisma.healingAttempt.update({
          where: { id: attempt.id },
          data: {
            status: deployed ? 'deployed' : 'testing',
            completedAt: new Date(),
            duration: Date.now() - startTime,
          },
        });

        // Step 10: Update error status
        await prisma.sentryError.update({
          where: { id: errorId },
          data: {
            status: deployed ? 'healed' : 'healing',
            resolved: deployed,
            resolvedAt: deployed ? new Date() : null,
          },
        });

        // Track success
        await this.trackHealingMetrics(attempt.id, true);
        this.resetCircuitBreaker(errorId);

        // Notify: Success (deployed or ready for deployment)
        if (deployed) {
          healingNotificationService.notifyFixDeployed(attempt.id).catch(err =>
            console.error('Notification error:', err)
          );
        } else {
          healingNotificationService.notifyAttemptSuccess(attempt.id).catch(err =>
            console.error('Notification error:', err)
          );
        }

        this.activeHealings.delete(errorId);

        console.log(`[Self-Healing] ✅ Successfully healed error ${errorId}`);

        return {
          attemptId: attempt.id,
          success: true,
          confidence: fix.confidence,
          fixApplied: true,
          deployed,
          rolledBack: false,
          duration: Date.now() - startTime,
        };

      } catch (error: any) {
        // Handle failure
        await prisma.healingAttempt.update({
          where: { id: attempt.id },
          data: {
            status: 'failed',
            completedAt: new Date(),
            duration: Date.now() - startTime,
            metadata: { error: error.message },
          },
        });

        await prisma.sentryError.update({
          where: { id: errorId },
          data: { status: 'failed' },
        });

        // Track failure
        await this.trackHealingMetrics(attempt.id, false);
        this.recordCircuitBreakerFailure(errorId);

        // Notify: Attempt failed
        healingNotificationService.notifyAttemptFailed(attempt.id, error.message).catch(err =>
          console.error('Notification error:', err)
        );

        this.activeHealings.delete(errorId);

        console.error(`[Self-Healing] ❌ Failed to heal error ${errorId}:`, error);

        return {
          attemptId: attempt.id,
          success: false,
          confidence: 0,
          fixApplied: false,
          deployed: false,
          rolledBack: false,
          error: error.message,
          duration: Date.now() - startTime,
        };
      }

    } catch (error: any) {
      this.activeHealings.delete(errorId);
      console.error(`[Self-Healing] Critical error:`, error);
      return null;
    }
  }

  /**
   * Generate fix using TCI
   */
  private async generateFix(
    errorContext: ErrorContext,
    attemptId: string
  ): Promise<{ code: string; description: string; confidence: number; analysisId: string } | null> {
    console.log(`[Self-Healing] Generating fix with TCI...`);

    // Build error report for TCI
    const errorReport = await errorAnalysisService.buildErrorReport(errorContext);

    // Run TCI analysis with error context
    const tciResult = await this.tciOrchestrator.analyze(errorContext.fileContent, {
      mode: 'full', // Always use full analysis for production errors
      language: errorContext.language,
      implementFixes: true, // We want TCI to generate the fix
    }) as any;

    if (!tciResult.report.implementation) {
      throw new Error('TCI failed to generate fix');
    }

    const fix = {
      code: tciResult.report.implementation.improvedCode,
      description: tciResult.report.implementation.explanation,
      confidence: tciResult.report.verdict.confidence,
      analysisId: tciResult.analysis.id,
    };

    // Update healing attempt with fix details
    await prisma.healingAttempt.update({
      where: { id: attemptId },
      data: {
        analysisId: fix.analysisId,
        fixCode: fix.code,
        fixDescription: fix.description,
        confidence: fix.confidence,
        status: 'testing',
      },
    });

    console.log(`[Self-Healing] ✅ Fix generated (confidence: ${(fix.confidence * 100).toFixed(0)}%)`);

    return fix;
  }

  /**
   * Validate fix in sandbox
   */
  private async validateFix(
    attemptId: string,
    errorContext: ErrorContext,
    fixCode: string
  ): Promise<{ passed: boolean; error?: string }> {
    console.log(`[Self-Healing] Validating fix in sandbox...`);

    try {
      // Run validation in isolated sandbox
      const validationResult = await fixValidationService.validateFix(
        attemptId,
        errorContext,
        fixCode,
        {
          timeout: 120000, // 2 minutes
          memory: '512m',
          cpu: '1.0',
        }
      );

      // Update healing attempt with validation results
      await prisma.healingAttempt.update({
        where: { id: attemptId },
        data: {
          testsPassed: validationResult.passed,
          testsRun: validationResult.testsRun,
          testsFailed: validationResult.testsFailed,
          validationLogs: validationResult.logs,
        },
      });

      if (!validationResult.passed) {
        console.warn(
          `[Self-Healing] Validation failed: ${validationResult.testsFailed}/${validationResult.testsRun} tests failed`
        );
        return {
          passed: false,
          error: validationResult.error || 'Tests failed',
        };
      }

      console.log(
        `[Self-Healing] ✅ Validation passed: ${validationResult.testsPassed}/${validationResult.testsRun} tests passed`
      );

      return { passed: true };

    } catch (error: any) {
      console.error(`[Self-Healing] Validation error:`, error);

      await prisma.healingAttempt.update({
        where: { id: attemptId },
        data: {
          testsPassed: false,
          testsRun: 0,
          testsFailed: 1,
          validationLogs: error.message,
        },
      });

      return {
        passed: false,
        error: error.message,
      };
    }
  }

  /**
   * Deploy fix to environment
   */
  private async deployFix(
    attemptId: string,
    errorContext: ErrorContext,
    fixCode: string,
    environment: string
  ): Promise<boolean> {
    console.log(`[Self-Healing] Deploying fix to ${environment}...`);

    try {
      // Determine deployment strategy based on environment
      const strategy: DeploymentStrategy =
        environment === 'production' ? 'blue_green' : 'immediate';

      // Deploy using AutoDeploymentService
      const deploymentResult = await autoDeploymentService.deploy(
        attemptId,
        errorContext,
        fixCode,
        {
          strategy,
          environment: environment as 'staging' | 'production',
          autoRollback: true,
          rollbackThreshold: 0.05, // 5% error rate increase triggers rollback
          healthCheckTimeout: 60000, // 1 minute
        }
      );

      // Update healing attempt with deployment results
      await prisma.healingAttempt.update({
        where: { id: attemptId },
        data: {
          deployed: deploymentResult.success && !deploymentResult.rolledBack,
          deploymentId: deploymentResult.deploymentId,
          status: deploymentResult.success ? 'deployed' : 'failed',
          rolledBack: deploymentResult.rolledBack,
          rollbackReason: deploymentResult.rolledBack ? deploymentResult.error : null,
          metadata: {
            deploymentMetrics: deploymentResult.metrics,
            healthCheckPassed: deploymentResult.healthCheckPassed,
          },
        },
      });

      if (deploymentResult.rolledBack) {
        console.warn(`[Self-Healing] Deployment rolled back: ${deploymentResult.error}`);

        // Notify: Rollback triggered
        healingNotificationService.notifyRollbackTriggered(
          attemptId,
          deploymentResult.error || 'Health check failed'
        ).catch(err => console.error('Notification error:', err));

        return false;
      }

      console.log(`[Self-Healing] ✅ Successfully deployed fix to ${environment}`);
      return deploymentResult.success;

    } catch (error: any) {
      console.error(`[Self-Healing] Deployment failed:`, error);

      // Mark deployment as failed
      await prisma.healingAttempt.update({
        where: { id: attemptId },
        data: {
          deployed: false,
          status: 'failed',
          metadata: { deploymentError: error.message },
        },
      });

      return false;
    }
  }

  /**
   * Request human review for low-confidence fix
   */
  private async requestHumanReview(
    attemptId: string,
    fix: any
  ): Promise<void> {
    console.log(`[Self-Healing] Requesting human review for attempt ${attemptId}`);

    await prisma.healingAttempt.update({
      where: { id: attemptId },
      data: {
        status: 'pending',
        metadata: { requiresApproval: true, reason: 'Low confidence' },
      },
    });

    // Notify: Human review required
    const reason = `Fix confidence ${fix?.confidence ? (fix.confidence * 100).toFixed(0) + '%' : 'unknown'} below threshold (${(this.DEFAULT_MIN_CONFIDENCE * 100).toFixed(0)}%)`;
    healingNotificationService.notifyHumanReviewRequired(attemptId, reason).catch(err =>
      console.error('Notification error:', err)
    );
  }

  /**
   * Get healing configuration for project
   */
  private async getHealingConfig(projectId: string | null) {
    if (!projectId) return null;

    return await prisma.healingConfig.findUnique({
      where: { projectId },
    });
  }

  /**
   * Track healing metrics
   */
  private async trackHealingMetrics(attemptId: string, success: boolean): Promise<void> {
    // Use HealingAttemptTracker for comprehensive metrics tracking
    await healingAttemptTracker.trackAttempt(attemptId, success);
  }

  /**
   * Circuit breaker: Check if circuit is open
   */
  private isCircuitOpen(errorId: string): boolean {
    const breaker = this.circuitBreaker.get(errorId);
    if (!breaker) return false;

    // Reset if enough time has passed
    if (Date.now() - breaker.lastFailure > this.CIRCUIT_BREAKER_RESET_TIME) {
      this.circuitBreaker.delete(errorId);
      return false;
    }

    return breaker.failures >= this.CIRCUIT_BREAKER_THRESHOLD;
  }

  /**
   * Circuit breaker: Record failure
   */
  private recordCircuitBreakerFailure(errorId: string): void {
    const breaker = this.circuitBreaker.get(errorId) || { failures: 0, lastFailure: 0 };
    breaker.failures++;
    breaker.lastFailure = Date.now();
    this.circuitBreaker.set(errorId, breaker);

    if (breaker.failures >= this.CIRCUIT_BREAKER_THRESHOLD) {
      console.warn(`[Self-Healing] Circuit breaker opened for error ${errorId}`);
    }
  }

  /**
   * Circuit breaker: Reset on success
   */
  private resetCircuitBreaker(errorId: string): void {
    this.circuitBreaker.delete(errorId);
  }

  /**
   * Get healing statistics
   */
  async getStats(projectId?: string): Promise<any> {
    const where: any = projectId ? { error: { projectId } } : {};

    const totalAttempts = await prisma.healingAttempt.count({ where });
    const successfulAttempts = await prisma.healingAttempt.count({
      where: { ...where, status: 'deployed' },
    });
    const failedAttempts = await prisma.healingAttempt.count({
      where: { ...where, status: 'failed' },
    });

    return {
      totalAttempts,
      successfulAttempts,
      failedAttempts,
      successRate: totalAttempts > 0 ? successfulAttempts / totalAttempts : 0,
      activeHealings: this.activeHealings.size,
    };
  }
}

export const selfHealingOrchestrator = new SelfHealingOrchestrator();

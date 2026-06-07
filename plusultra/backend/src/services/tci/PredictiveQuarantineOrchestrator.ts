import { TCIPredictionService, PredictionResult } from '../temporal/enterprise/TCIPredictionService';
import { ModelQuarantineLayer } from './ModelQuarantineLayer';
import { TCIEnvelopeService, TCIEnvelope, TCIContext } from '../temporal/TCIEnvelopeService';

export interface CodeContext {
  targetFile: string;
  environment?: string;
  previousEnvelopeId?: string;
  projectId?: string;
  workspaceId?: string;
  userId?: string;
}

export interface CodeGenerationResult {
  code: string;
  confidence: number;
  explanation: string;
  tokensUsed?: number;
  processingTime?: number;
}

export interface PredictiveGenerationResult {
  envelope: TCIEnvelope;
  prediction: PredictionResult;
  quarantined: boolean;
  suggestedFixes?: string[];
  riskMitigation?: string[];
}

/**
 * Predictive Quarantine Orchestrator
 *
 * Implements the core TCI workflow:
 * 1. Generate code with AI model
 * 2. Predict downstream impact
 * 3. Quarantine if risk > threshold
 * 4. Auto-generate fixes
 * 5. Update envelope with decision
 */
export class PredictiveQuarantineOrchestrator {
  private readonly riskThresholds = {
    critical: 0.8,  // Auto-quarantine
    high: 0.6,      // Require human review
    medium: 0.4,    // Flag for review
    low: 0.2        // Auto-approve
  };

  constructor(
    private readonly predictionService: TCIPredictionService,
    private readonly quarantineLayer: ModelQuarantineLayer,
    private readonly envelopeService: TCIEnvelopeService
  ) {}

  /**
   * Generate code with predictive quarantine logic
   * This is the main entry point for the TCI predictive workflow
   */
  async generateWithPrediction(
    model: string,
    intent: string,
    context: CodeContext,
    generateCodeFn: (intent: string, context: CodeContext) => Promise<CodeGenerationResult>
  ): Promise<PredictiveGenerationResult> {
    const startTime = Date.now();

    try {
      // 1. Generate initial code using provided generation function
      console.log(`🤖 ${model} generating code for: ${intent}`);
      const initialCode = await generateCodeFn(intent, context);

      // 2. Create TCI envelope
      const tciContext: TCIContext = {
        user_id: context.userId,
        workspace_id: context.workspaceId,
        project_id: context.projectId,
        environment: (context.environment as 'development' | 'staging' | 'production') || 'development'
      };

      const envelope = await this.envelopeService.createEnvelope(
        model,
        {
          text: intent,
          category: 'code_generation',
          confidence: initialCode.confidence
        },
        {
          prompt: intent,
          context: context,
          previous_envelope_id: context.previousEnvelopeId
        },
        {
          files: [context.targetFile],
          explanation: initialCode.explanation,
          changes: [{
            file_path: context.targetFile,
            change_type: 'create',
            diff: initialCode.code,
            lines_added: initialCode.code.split('\n').length
          }],
          metrics: {
            tokens_used: initialCode.tokensUsed || 0,
            processing_time: initialCode.processingTime || 0,
            confidence_score: initialCode.confidence
          }
        },
        tciContext
      );

      console.log(`📦 Created envelope: ${envelope.envelope_id}`);

      // 3. Predict downstream impact
      console.log(`🔮 Predicting impact for envelope: ${envelope.envelope_id}`);
      const prediction = await this.predictionService.predict({
        changeId: envelope.envelope_id,
        context: {
          filePaths: [context.targetFile],
          environment: context.environment
        },
        predictionTypes: ['regression_risk', 'security_risk', 'deployment_risk', 'performance']
      });

      // 4. Assess risk level
      const riskLevel = prediction.overall.riskLevel;
      const riskScore = this.calculateRiskScore(prediction);
      const requiresQuarantine = riskLevel === 'high' || riskLevel === 'critical';

      console.log(`📊 Risk assessment: ${riskLevel} (score: ${riskScore.toFixed(2)})`);

      if (requiresQuarantine) {
        return await this.handleHighRisk(model, envelope, prediction, initialCode, tciContext);
      } else {
        return await this.handleLowRisk(envelope, prediction, initialCode, tciContext);
      }

    } catch (error) {
      console.error(`❌ Predictive generation failed:`, error);
      throw new Error(`Predictive generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Handle high-risk code generation
   */
  private async handleHighRisk(
    model: string,
    envelope: TCIEnvelope,
    prediction: PredictionResult,
    initialCode: CodeGenerationResult,
    context: TCIContext
  ): Promise<PredictiveGenerationResult> {
    const riskLevel = prediction.overall.riskLevel;

    console.log(`🚨 HIGH RISK DETECTED - Quarantining model: ${model}`);

    // 1. Quarantine the model
    this.quarantineLayer.quarantineModel(
      model,
      `High risk prediction: ${riskLevel} - ${prediction.overall.recommendation}`
    );

    // 2. Generate suggested fixes
    const suggestedFixes = this.generateSuggestedFixes(initialCode.code, prediction);
    const riskMitigation = this.generateRiskMitigation(prediction);

    // 3. Update envelope decision
    await this.envelopeService.updateEnvelopeDecision(
      envelope.envelope_id,
      {
        approved: false,
        requires_human_review: true,
        review_reason: `Quarantined due to ${riskLevel} risk: ${prediction.overall.recommendation}`,
        risk_level: riskLevel,
        policy_violations: this.extractPolicyViolations(prediction)
      },
      context
    );

    console.log(`✅ Envelope quarantined with ${suggestedFixes.length} suggested fixes`);

    return {
      envelope,
      prediction,
      quarantined: true,
      suggestedFixes,
      riskMitigation
    };
  }

  /**
   * Handle low-risk code generation
   */
  private async handleLowRisk(
    envelope: TCIEnvelope,
    prediction: PredictionResult,
    initialCode: CodeGenerationResult,
    context: TCIContext
  ): Promise<PredictiveGenerationResult> {
    console.log(`✅ LOW RISK - Auto-approving envelope: ${envelope.envelope_id}`);

    // Update envelope decision (approved)
    await this.envelopeService.updateEnvelopeDecision(
      envelope.envelope_id,
      {
        approved: true,
        requires_human_review: false,
        risk_level: prediction.overall.riskLevel
      },
      context
    );

    return {
      envelope,
      prediction,
      quarantined: false
    };
  }

  /**
   * Calculate overall risk score from prediction results
   */
  private calculateRiskScore(prediction: PredictionResult): number {
    let maxRisk = 0;

    // Regression risk
    if (prediction.predictions.regressionRisk?.probability) {
      maxRisk = Math.max(maxRisk, prediction.predictions.regressionRisk.probability);
    }

    // Deployment risk
    if (prediction.predictions.deploymentRisk?.rollbackProbability) {
      maxRisk = Math.max(maxRisk, prediction.predictions.deploymentRisk.rollbackProbability);
    }

    // Security risk (normalized to 0-1)
    if (prediction.predictions.securityRisk?.score) {
      maxRisk = Math.max(maxRisk, prediction.predictions.securityRisk.score / 100);
    }

    // Performance degradation (normalized to 0-1)
    if (prediction.predictions.performance?.latencyDelta && prediction.predictions.performance.latencyDelta > 50) {
      maxRisk = Math.max(maxRisk, Math.min(prediction.predictions.performance.latencyDelta / 100, 1.0));
    }

    return maxRisk;
  }

  /**
   * Generate suggested fixes based on prediction results
   */
  private generateSuggestedFixes(code: string, prediction: PredictionResult): string[] {
    const fixes: string[] = [];

    // Regression risk fixes
    if (prediction.predictions.regressionRisk) {
      fixes.push(...prediction.predictions.regressionRisk.mitigation);

      if (prediction.predictions.regressionRisk.affectedTests.length > 0) {
        fixes.push(
          `Run affected tests: ${prediction.predictions.regressionRisk.affectedTests.slice(0, 3).join(', ')}`
        );
      }
    }

    // Security fixes
    if (prediction.predictions.securityRisk) {
      for (const vuln of prediction.predictions.securityRisk.vulnerabilities) {
        if (vuln.severity === 'critical' || vuln.severity === 'high') {
          fixes.push(`[${vuln.severity.toUpperCase()}] Fix ${vuln.type}: ${vuln.description}`);
        }
      }
    }

    // Performance fixes
    if (prediction.predictions.performance && prediction.predictions.performance.latencyDelta > 50) {
      fixes.push(`Optimize code to reduce latency delta of ${prediction.predictions.performance.latencyDelta}ms`);
      fixes.push('Consider caching, algorithmic improvements, or lazy loading');
    }

    // Deployment fixes
    if (prediction.predictions.deploymentRisk) {
      fixes.push(...prediction.predictions.deploymentRisk.mitigation);
    }

    return fixes;
  }

  /**
   * Generate risk mitigation strategies
   */
  private generateRiskMitigation(prediction: PredictionResult): string[] {
    const mitigation: string[] = [];

    const riskLevel = prediction.overall.riskLevel;

    if (riskLevel === 'critical') {
      mitigation.push('🚨 CRITICAL: Requires senior developer or architect review');
      mitigation.push('🔒 Block deployment until all critical issues resolved');
      mitigation.push('🧪 Run full test suite in staging environment');
    } else if (riskLevel === 'high') {
      mitigation.push('⚠️ HIGH RISK: Requires peer review and additional testing');
      mitigation.push('🔄 Consider incremental rollout with feature flags');
      mitigation.push('📊 Monitor closely post-deployment');
    }

    // Add specific mitigation based on risk type
    if (prediction.predictions.securityRisk && prediction.predictions.securityRisk.score > 70) {
      mitigation.push('🔐 Security review required before merge');
      mitigation.push('🛡️ Run security scans (SAST/DAST)');
    }

    if (prediction.predictions.deploymentRisk && prediction.predictions.deploymentRisk.rollbackProbability > 0.3) {
      mitigation.push('📋 Prepare detailed rollback plan');
      mitigation.push('⏰ Schedule deployment during low-traffic window');
    }

    return mitigation;
  }

  /**
   * Extract policy violations from prediction
   */
  private extractPolicyViolations(prediction: PredictionResult): string[] {
    const violations: string[] = [];

    if (prediction.predictions.securityRisk) {
      for (const vuln of prediction.predictions.securityRisk.vulnerabilities) {
        if (vuln.severity === 'critical' || vuln.severity === 'high') {
          violations.push(`${vuln.type}: ${vuln.description}`);
        }
      }
    }

    return violations;
  }

  /**
   * Get quarantine status for a model
   */
  getQuarantineStatus(model: string) {
    return this.quarantineLayer.getQuarantineStatus(model);
  }

  /**
   * Release a model from quarantine manually
   */
  releaseModelFromQuarantine(model: string, reason: string = 'Manual release'): boolean {
    return this.quarantineLayer.releaseFromQuarantine(model, reason);
  }
}

export default PredictiveQuarantineOrchestrator;

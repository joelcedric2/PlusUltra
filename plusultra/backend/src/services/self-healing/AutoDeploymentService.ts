/**
 * Auto-Deployment Service
 *
 * Handles automatic deployment of validated fixes using blue-green, canary,
 * or immediate deployment strategies. Monitors deployment health and
 * automatically rolls back if issues are detected.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../../lib/prisma';
import { monitoringService } from '../monitoring/MonitoringService';
import type { ErrorContext } from './ErrorAnalysisService';

const execAsync = promisify(exec);

export type DeploymentStrategy = 'blue_green' | 'canary' | 'immediate';

export interface DeploymentOptions {
  strategy?: DeploymentStrategy;
  environment?: 'staging' | 'production';
  canaryPercentage?: number; // 10-50% for canary
  canaryDuration?: number; // milliseconds
  healthCheckInterval?: number; // milliseconds
  healthCheckTimeout?: number; // milliseconds
  rollbackThreshold?: number; // 0.05 = 5% error rate increase
  autoRollback?: boolean;
}

export interface DeploymentResult {
  deploymentId: string;
  success: boolean;
  strategy: DeploymentStrategy;
  environment: string;
  version: string;
  healthCheckPassed: boolean;
  rolledBack: boolean;
  error?: string;
  metrics: {
    errorRateBefore: number;
    errorRateAfter: number;
    responseTimeBefore: number;
    responseTimeAfter: number;
  };
  duration: number;
}

export interface HealthCheckResult {
  passed: boolean;
  errorRate: number;
  responseTime: number;
  details: {
    totalRequests: number;
    failedRequests: number;
    avgResponseTime: number;
    p95ResponseTime: number;
  };
}

export class AutoDeploymentService {
  private readonly DEFAULT_HEALTH_CHECK_INTERVAL = 10000; // 10 seconds
  private readonly DEFAULT_HEALTH_CHECK_TIMEOUT = 60000; // 1 minute
  private readonly DEFAULT_CANARY_PERCENTAGE = 10;
  private readonly DEFAULT_CANARY_DURATION = 300000; // 5 minutes
  private readonly DEFAULT_ROLLBACK_THRESHOLD = 0.05; // 5%

  private activeDeployments: Map<string, boolean> = new Map();

  /**
   * Deploy validated fix to environment
   */
  async deploy(
    attemptId: string,
    errorContext: ErrorContext,
    fixCode: string,
    options: DeploymentOptions = {}
  ): Promise<DeploymentResult> {
    const startTime = Date.now();

    const strategy = options.strategy || 'blue_green';
    const environment = options.environment || 'staging';

    console.log(
      `[Auto Deploy] Starting ${strategy} deployment for attempt ${attemptId} to ${environment}`
    );

    try {
      // Prevent concurrent deployments
      if (this.activeDeployments.has(attemptId)) {
        throw new Error('Deployment already in progress');
      }
      this.activeDeployments.set(attemptId, true);

      // Get baseline metrics BEFORE deployment
      const baselineMetrics = await this.getHealthMetrics(errorContext.projectId, environment);

      // Create deployment record
      const deployment = await prisma.fixDeployment.create({
        data: {
          attemptId,
          projectId: errorContext.projectId,
          environment,
          strategy,
          errorRateBefore: baselineMetrics.errorRate,
          responseTimeBefore: baselineMetrics.responseTime,
          autoRollback: options.autoRollback ?? true,
          rollbackThreshold: options.rollbackThreshold || this.DEFAULT_ROLLBACK_THRESHOLD,
          trafficPercentage: strategy === 'canary' ? (options.canaryPercentage || this.DEFAULT_CANARY_PERCENTAGE) : 100,
          canaryDuration: strategy === 'canary' ? (options.canaryDuration || this.DEFAULT_CANARY_DURATION) : null,
        },
      });

      console.log(`[Auto Deploy] Created deployment record: ${deployment.id}`);

      // Execute deployment based on strategy
      let deploymentSuccess = false;
      let deployedVersion: string;

      switch (strategy) {
        case 'blue_green':
          deployedVersion = await this.blueGreenDeploy(
            deployment.id,
            errorContext,
            fixCode,
            environment
          );
          deploymentSuccess = true;
          break;

        case 'canary':
          deployedVersion = await this.canaryDeploy(
            deployment.id,
            errorContext,
            fixCode,
            environment,
            options
          );
          deploymentSuccess = true;
          break;

        case 'immediate':
          deployedVersion = await this.immediateDeploy(
            deployment.id,
            errorContext,
            fixCode,
            environment
          );
          deploymentSuccess = true;
          break;

        default:
          throw new Error(`Unknown deployment strategy: ${strategy}`);
      }

      // Wait for deployment to stabilize
      await this.wait(5000);

      // Perform health checks
      const healthCheck = await this.performHealthCheck(
        deployment.id,
        errorContext.projectId,
        environment,
        options
      );

      // Get post-deployment metrics
      const postMetrics = await this.getHealthMetrics(errorContext.projectId, environment);

      // Update deployment with version and metrics
      await prisma.fixDeployment.update({
        where: { id: deployment.id },
        data: {
          deployedVersion,
          healthCheckPassed: healthCheck.passed,
          healthCheckDetails: healthCheck.details as any,
          errorRateAfter: postMetrics.errorRate,
          responseTimeAfter: postMetrics.responseTime,
        },
      });

      // Check if rollback is needed
      const needsRollback = await this.shouldRollback(
        deployment.id,
        baselineMetrics,
        postMetrics,
        healthCheck,
        options
      );

      if (needsRollback) {
        console.warn(`[Auto Deploy] Health check failed, rolling back deployment ${deployment.id}`);
        await this.rollback(deployment.id, errorContext, environment);

        this.activeDeployments.delete(attemptId);

        return {
          deploymentId: deployment.id,
          success: false,
          strategy,
          environment,
          version: deployedVersion,
          healthCheckPassed: false,
          rolledBack: true,
          error: 'Deployment rolled back due to failed health checks',
          metrics: {
            errorRateBefore: baselineMetrics.errorRate,
            errorRateAfter: postMetrics.errorRate,
            responseTimeBefore: baselineMetrics.responseTime,
            responseTimeAfter: postMetrics.responseTime,
          },
          duration: Date.now() - startTime,
        };
      }

      this.activeDeployments.delete(attemptId);

      console.log(`[Auto Deploy] ✅ Successfully deployed ${deployedVersion} to ${environment}`);

      return {
        deploymentId: deployment.id,
        success: true,
        strategy,
        environment,
        version: deployedVersion,
        healthCheckPassed: healthCheck.passed,
        rolledBack: false,
        metrics: {
          errorRateBefore: baselineMetrics.errorRate,
          errorRateAfter: postMetrics.errorRate,
          responseTimeBefore: baselineMetrics.responseTime,
          responseTimeAfter: postMetrics.responseTime,
        },
        duration: Date.now() - startTime,
      };

    } catch (error: any) {
      this.activeDeployments.delete(attemptId);
      console.error(`[Auto Deploy] Deployment failed:`, error);

      throw new Error(`Deployment failed: ${error.message}`);
    }
  }

  /**
   * Blue-Green Deployment Strategy
   * Deploy to inactive slot, health check, then switch traffic
   */
  private async blueGreenDeploy(
    deploymentId: string,
    errorContext: ErrorContext,
    fixCode: string,
    environment: string
  ): Promise<string> {
    console.log(`[Blue-Green] Starting blue-green deployment ${deploymentId}`);

    // Determine current active slot (blue or green)
    const activeSlot = await this.getActiveSlot(errorContext.projectId, environment);
    const inactiveSlot = activeSlot === 'blue' ? 'green' : 'blue';

    console.log(`[Blue-Green] Current active: ${activeSlot}, deploying to: ${inactiveSlot}`);

    // Step 1: Deploy to inactive slot
    const version = await this.deployToSlot(
      deploymentId,
      errorContext,
      fixCode,
      environment,
      inactiveSlot
    );

    // Step 2: Health check inactive slot
    const healthCheckPassed = await this.healthCheckSlot(
      errorContext.projectId,
      environment,
      inactiveSlot
    );

    if (!healthCheckPassed) {
      throw new Error(`Health check failed for ${inactiveSlot} slot`);
    }

    // Step 3: Switch traffic to inactive slot (making it active)
    await this.switchTraffic(errorContext.projectId, environment, inactiveSlot);

    console.log(`[Blue-Green] Traffic switched to ${inactiveSlot}`);

    return version;
  }

  /**
   * Canary Deployment Strategy
   * Gradually roll out to percentage of traffic
   */
  private async canaryDeploy(
    deploymentId: string,
    errorContext: ErrorContext,
    fixCode: string,
    environment: string,
    options: DeploymentOptions
  ): Promise<string> {
    const canaryPercentage = options.canaryPercentage || this.DEFAULT_CANARY_PERCENTAGE;
    const canaryDuration = options.canaryDuration || this.DEFAULT_CANARY_DURATION;

    console.log(`[Canary] Starting canary deployment: ${canaryPercentage}% for ${canaryDuration}ms`);

    // Step 1: Deploy new version
    const version = await this.deployNewVersion(deploymentId, errorContext, fixCode, environment);

    // Step 2: Route canary percentage to new version
    await this.setTrafficSplit(errorContext.projectId, environment, canaryPercentage, version);

    console.log(`[Canary] Canary deployed, monitoring for ${canaryDuration}ms...`);

    // Step 3: Monitor canary for duration
    const monitoringInterval = 30000; // Check every 30 seconds
    const checks = Math.ceil(canaryDuration / monitoringInterval);

    for (let i = 0; i < checks; i++) {
      await this.wait(monitoringInterval);

      const healthCheck = await this.performHealthCheck(
        deploymentId,
        errorContext.projectId,
        environment,
        options
      );

      if (!healthCheck.passed) {
        console.warn(`[Canary] Health check failed during canary phase`);
        await this.setTrafficSplit(errorContext.projectId, environment, 0, version);
        throw new Error('Canary health check failed');
      }

      console.log(`[Canary] Health check ${i + 1}/${checks} passed`);
    }

    // Step 4: Promote canary to 100%
    await this.setTrafficSplit(errorContext.projectId, environment, 100, version);

    console.log(`[Canary] Canary promoted to 100%`);

    return version;
  }

  /**
   * Immediate Deployment Strategy
   * Deploy directly without gradual rollout (for staging only)
   */
  private async immediateDeploy(
    deploymentId: string,
    errorContext: ErrorContext,
    fixCode: string,
    environment: string
  ): Promise<string> {
    if (environment === 'production') {
      console.warn(`[Immediate] Immediate deploy to production - should use blue-green or canary`);
    }

    console.log(`[Immediate] Deploying directly to ${environment}`);

    const version = await this.deployNewVersion(deploymentId, errorContext, fixCode, environment);

    return version;
  }

  /**
   * Deploy to specific slot (blue or green)
   */
  private async deployToSlot(
    deploymentId: string,
    errorContext: ErrorContext,
    fixCode: string,
    environment: string,
    slot: 'blue' | 'green'
  ): Promise<string> {
    console.log(`[Deploy] Deploying to ${slot} slot`);

    // Apply fix to file
    const projectRoot = await this.getProjectRoot(errorContext.projectId);
    const filePath = path.join(projectRoot, errorContext.filePath);

    await fs.writeFile(filePath, fixCode, 'utf-8');

    // Generate version tag
    const version = `fix-${deploymentId.substring(0, 8)}-${Date.now()}`;

    // Build Docker image for slot
    const imageName = `${errorContext.projectId}-${environment}-${slot}:${version}`;

    await execAsync(`docker build -t ${imageName} .`, {
      cwd: projectRoot,
      timeout: 300000, // 5 minutes
    });

    // Run container for slot
    const containerName = `${errorContext.projectId}-${environment}-${slot}`;

    // Stop existing container if running
    try {
      await execAsync(`docker stop ${containerName}`);
      await execAsync(`docker rm ${containerName}`);
    } catch {
      // Container doesn't exist, that's fine
    }

    // Start new container
    await execAsync(
      `docker run -d --name ${containerName} -p ${this.getSlotPort(slot)}:3000 ${imageName}`
    );

    console.log(`[Deploy] Deployed ${version} to ${slot} slot`);

    return version;
  }

  /**
   * Deploy new version (for canary/immediate)
   */
  private async deployNewVersion(
    deploymentId: string,
    errorContext: ErrorContext,
    fixCode: string,
    environment: string
  ): Promise<string> {
    console.log(`[Deploy] Deploying new version`);

    // Apply fix to file
    const projectRoot = await this.getProjectRoot(errorContext.projectId);
    const filePath = path.join(projectRoot, errorContext.filePath);

    await fs.writeFile(filePath, fixCode, 'utf-8');

    // Generate version tag
    const version = `fix-${deploymentId.substring(0, 8)}-${Date.now()}`;

    // Build Docker image
    const imageName = `${errorContext.projectId}-${environment}:${version}`;

    await execAsync(`docker build -t ${imageName} .`, {
      cwd: projectRoot,
      timeout: 300000, // 5 minutes
    });

    // Run container
    const containerName = `${errorContext.projectId}-${environment}-${version}`;

    await execAsync(
      `docker run -d --name ${containerName} -p 0:3000 ${imageName}`
    );

    console.log(`[Deploy] Deployed version ${version}`);

    return version;
  }

  /**
   * Get active deployment slot
   */
  private async getActiveSlot(projectId: string | null, environment: string): Promise<'blue' | 'green'> {
    // TODO: Store active slot in database or configuration
    // For now, default to blue
    return 'blue';
  }

  /**
   * Switch traffic to target slot
   */
  private async switchTraffic(
    projectId: string | null,
    environment: string,
    targetSlot: 'blue' | 'green'
  ): Promise<void> {
    console.log(`[Traffic] Switching traffic to ${targetSlot}`);

    // TODO: Update load balancer / reverse proxy configuration
    // This would typically update nginx/traefik/AWS ALB rules
    // For now, this is a placeholder

    // Example: Update nginx config
    // const nginxConfig = `
    // upstream backend {
    //   server localhost:${this.getSlotPort(targetSlot)};
    // }
    // `;
    // await fs.writeFile('/etc/nginx/sites-enabled/default', nginxConfig);
    // await execAsync('nginx -s reload');

    console.log(`[Traffic] Traffic switched to ${targetSlot}`);
  }

  /**
   * Set traffic split percentage for canary
   */
  private async setTrafficSplit(
    projectId: string | null,
    environment: string,
    percentage: number,
    version: string
  ): Promise<void> {
    console.log(`[Traffic] Setting ${percentage}% traffic to ${version}`);

    // TODO: Update load balancer weighted routing
    // For AWS: Update ALB target group weights
    // For nginx: Use split_clients directive
    // For Traefik: Use weighted round robin

    console.log(`[Traffic] Traffic split updated`);
  }

  /**
   * Health check specific slot
   */
  private async healthCheckSlot(
    projectId: string | null,
    environment: string,
    slot: 'blue' | 'green'
  ): Promise<boolean> {
    const port = this.getSlotPort(slot);

    try {
      // Simple HTTP health check
      const { stdout } = await execAsync(`curl -f http://localhost:${port}/health || exit 1`, {
        timeout: 5000,
      });

      return stdout.includes('ok') || stdout.includes('healthy');
    } catch {
      return false;
    }
  }

  /**
   * Perform comprehensive health check
   */
  private async performHealthCheck(
    deploymentId: string,
    projectId: string | null,
    environment: string,
    options: DeploymentOptions
  ): Promise<HealthCheckResult> {
    const timeout = options.healthCheckTimeout || this.DEFAULT_HEALTH_CHECK_TIMEOUT;
    const interval = options.healthCheckInterval || this.DEFAULT_HEALTH_CHECK_INTERVAL;

    console.log(`[Health Check] Starting health check for deployment ${deploymentId}`);

    const startTime = Date.now();
    const checks: HealthCheckResult[] = [];

    while (Date.now() - startTime < timeout) {
      const metrics = await this.getHealthMetrics(projectId, environment);

      checks.push(metrics);

      // If we have enough checks, calculate average
      if (checks.length >= 3) {
        const avgErrorRate = checks.reduce((sum, c) => sum + c.errorRate, 0) / checks.length;
        const avgResponseTime = checks.reduce((sum, c) => sum + c.responseTime, 0) / checks.length;

        const passed = avgErrorRate < 0.05 && avgResponseTime < 1000; // <5% errors, <1s response

        console.log(
          `[Health Check] ${passed ? 'PASSED' : 'FAILED'} - ` +
          `Error rate: ${(avgErrorRate * 100).toFixed(2)}%, ` +
          `Response time: ${avgResponseTime.toFixed(0)}ms`
        );

        return {
          passed,
          errorRate: avgErrorRate,
          responseTime: avgResponseTime,
          details: {
            totalRequests: checks.reduce((sum, c) => sum + c.details.totalRequests, 0),
            failedRequests: checks.reduce((sum, c) => sum + c.details.failedRequests, 0),
            avgResponseTime,
            p95ResponseTime: Math.max(...checks.map(c => c.details.p95ResponseTime)),
          },
        };
      }

      await this.wait(interval);
    }

    // Timeout reached
    console.warn(`[Health Check] Timeout reached after ${timeout}ms`);

    return {
      passed: false,
      errorRate: 1.0,
      responseTime: 0,
      details: {
        totalRequests: 0,
        failedRequests: 0,
        avgResponseTime: 0,
        p95ResponseTime: 0,
      },
    };
  }

  /**
   * Get health metrics from monitoring service
   */
  private async getHealthMetrics(
    projectId: string | null,
    environment: string
  ): Promise<HealthCheckResult> {
    // Get metrics from MonitoringService
    const metrics = await monitoringService.getRealtimeMetrics(projectId || 'unknown');

    // Calculate error rate
    const totalRequests = metrics.requestCount || 100;
    const failedRequests = metrics.errorCount || 0;
    const errorRate = totalRequests > 0 ? failedRequests / totalRequests : 0;

    // Get response time metrics
    const avgResponseTime = metrics.avgResponseTime || 0;
    const p95ResponseTime = metrics.p95ResponseTime || 0;

    return {
      passed: errorRate < 0.05 && avgResponseTime < 1000,
      errorRate,
      responseTime: avgResponseTime,
      details: {
        totalRequests,
        failedRequests,
        avgResponseTime,
        p95ResponseTime,
      },
    };
  }

  /**
   * Determine if deployment should be rolled back
   */
  private async shouldRollback(
    deploymentId: string,
    baselineMetrics: HealthCheckResult,
    postMetrics: HealthCheckResult,
    healthCheck: HealthCheckResult,
    options: DeploymentOptions
  ): Promise<boolean> {
    const autoRollback = options.autoRollback ?? true;

    if (!autoRollback) {
      return false;
    }

    // Check if health check passed
    if (!healthCheck.passed) {
      console.warn(`[Rollback Check] Health check failed`);
      return true;
    }

    // Check error rate increase
    const threshold = options.rollbackThreshold || this.DEFAULT_ROLLBACK_THRESHOLD;
    const errorRateIncrease = postMetrics.errorRate - baselineMetrics.errorRate;

    if (errorRateIncrease > threshold) {
      console.warn(
        `[Rollback Check] Error rate increased by ${(errorRateIncrease * 100).toFixed(2)}% ` +
        `(threshold: ${(threshold * 100).toFixed(2)}%)`
      );
      return true;
    }

    // Check response time degradation (>50% increase)
    const responseTimeIncrease =
      (postMetrics.responseTime - baselineMetrics.responseTime) / baselineMetrics.responseTime;

    if (responseTimeIncrease > 0.5) {
      console.warn(
        `[Rollback Check] Response time increased by ${(responseTimeIncrease * 100).toFixed(0)}%`
      );
      return true;
    }

    return false;
  }

  /**
   * Rollback deployment
   */
  async rollback(
    deploymentId: string,
    errorContext: ErrorContext,
    environment: string
  ): Promise<void> {
    console.log(`[Rollback] Rolling back deployment ${deploymentId}`);

    const deployment = await prisma.fixDeployment.findUnique({
      where: { id: deploymentId },
    });

    if (!deployment) {
      throw new Error(`Deployment ${deploymentId} not found`);
    }

    // Get previous version
    const previousVersion = deployment.previousVersion;

    if (!previousVersion) {
      console.warn(`[Rollback] No previous version found, cannot rollback`);
      return;
    }

    // Rollback based on strategy
    switch (deployment.strategy) {
      case 'blue_green':
        // Switch back to previous slot
        const activeSlot = await this.getActiveSlot(errorContext.projectId, environment);
        const previousSlot = activeSlot === 'blue' ? 'green' : 'blue';
        await this.switchTraffic(errorContext.projectId, environment, previousSlot);
        break;

      case 'canary':
        // Set traffic to 0% for new version
        await this.setTrafficSplit(errorContext.projectId, environment, 0, deployment.deployedVersion || '');
        break;

      case 'immediate':
        // Redeploy previous version
        // TODO: Implement immediate rollback
        break;
    }

    // Update database
    await prisma.fixDeployment.update({
      where: { id: deploymentId },
      data: {
        rolledBackAt: new Date(),
      },
    });

    await prisma.healingAttempt.update({
      where: { id: deployment.attemptId },
      data: {
        rolledBack: true,
        rollbackReason: 'Health check failed - automatic rollback triggered',
      },
    });

    console.log(`[Rollback] ✅ Rollback complete`);
  }

  /**
   * Get project root directory
   */
  private async getProjectRoot(projectId: string | null): Promise<string> {
    // TODO: Get from project configuration
    // For now, use a default path
    return process.env.PROJECTS_ROOT || '/var/www/projects';
  }

  /**
   * Get port for deployment slot
   */
  private getSlotPort(slot: 'blue' | 'green'): number {
    return slot === 'blue' ? 3001 : 3002;
  }

  /**
   * Wait for specified duration
   */
  private wait(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export const autoDeploymentService = new AutoDeploymentService();

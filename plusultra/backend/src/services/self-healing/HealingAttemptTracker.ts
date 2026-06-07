/**
 * Healing Attempt Tracker
 *
 * Tracks healing attempts, success/failure rates, and provides analytics
 * for monitoring the self-healing system's performance over time.
 */

import { prisma } from '../../lib/prisma';

export interface HealingStats {
  totalAttempts: number;
  successfulAttempts: number;
  failedAttempts: number;
  rolledBackAttempts: number;
  pendingAttempts: number;
  successRate: number;
  deploymentSuccessRate: number;
  avgConfidence: number;
  avgTimeToFix: number;
  avgTimeToValidate: number;
  avgTimeToDeploy: number;
  errorsByType: Record<string, number>;
  errorsByEnvironment: Record<string, number>;
  healingTrends: {
    date: Date;
    attempts: number;
    successes: number;
    failures: number;
  }[];
}

export interface AttemptMetrics {
  attemptId: string;
  duration: number;
  timeToAnalysis: number;
  timeToValidation: number;
  timeToDeployment: number;
  confidence: number;
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  errorRateBefore: number;
  errorRateAfter: number;
  errorRateImprovement: number;
}

export class HealingAttemptTracker {
  /**
   * Track a healing attempt (success or failure)
   */
  async trackAttempt(
    attemptId: string,
    success: boolean,
    metadata?: Record<string, any>
  ): Promise<void> {
    const attempt = await prisma.healingAttempt.findUnique({
      where: { id: attemptId },
      include: {
        error: true,
        deployment: true,
      },
    });

    if (!attempt) {
      console.error(`[Healing Tracker] Attempt ${attemptId} not found`);
      return;
    }

    // Update daily metrics
    await this.updateDailyMetrics(attempt, success);

    // Track attempt in history
    await this.recordAttemptHistory(attempt, success, metadata);

    console.log(
      `[Healing Tracker] Tracked ${success ? 'successful' : 'failed'} attempt ${attemptId}`
    );
  }

  /**
   * Update daily healing metrics
   */
  private async updateDailyMetrics(attempt: any, success: boolean): Promise<void> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const projectId = attempt.error.projectId;

    // Find or create today's metrics
    const existingMetrics = await prisma.healingMetrics.findFirst({
      where: {
        date: today,
        projectId: projectId,
      },
    });

    if (existingMetrics) {
      // Update existing metrics
      const totalAttempts = existingMetrics.totalAttempts + 1;
      const successfulAttempts = success
        ? existingMetrics.successfulAttempts + 1
        : existingMetrics.successfulAttempts;
      const failedAttempts = success
        ? existingMetrics.failedAttempts
        : existingMetrics.failedAttempts + 1;
      const rolledBackAttempts = attempt.rolledBack
        ? existingMetrics.rolledBackAttempts + 1
        : existingMetrics.rolledBackAttempts;

      // Calculate running averages
      const avgConfidence = this.calculateRunningAverage(
        existingMetrics.avgConfidence || 0,
        existingMetrics.totalAttempts,
        attempt.confidence
      );

      const avgTimeToFix = attempt.duration
        ? this.calculateRunningAverage(
            existingMetrics.avgTimeToFix || 0,
            existingMetrics.totalAttempts,
            attempt.duration
          )
        : existingMetrics.avgTimeToFix;

      await prisma.healingMetrics.update({
        where: { id: existingMetrics.id },
        data: {
          totalAttempts,
          successfulAttempts,
          failedAttempts,
          rolledBackAttempts,
          avgConfidence,
          avgTimeToFix,
          successRate: totalAttempts > 0 ? successfulAttempts / totalAttempts : 0,
          deploymentSuccessRate:
            totalAttempts > 0 ? (successfulAttempts - rolledBackAttempts) / totalAttempts : 0,
          totalErrors: existingMetrics.totalErrors + 1,
          healedErrors: success ? existingMetrics.healedErrors + 1 : existingMetrics.healedErrors,
          unhealedErrors: success
            ? existingMetrics.unhealedErrors
            : existingMetrics.unhealedErrors + 1,
        },
      });
    } else {
      // Create new metrics for today
      await prisma.healingMetrics.create({
        data: {
          date: today,
          projectId,
          totalAttempts: 1,
          successfulAttempts: success ? 1 : 0,
          failedAttempts: success ? 0 : 1,
          rolledBackAttempts: attempt.rolledBack ? 1 : 0,
          avgConfidence: attempt.confidence,
          avgTimeToFix: attempt.duration || 0,
          successRate: success ? 1.0 : 0.0,
          deploymentSuccessRate: success && !attempt.rolledBack ? 1.0 : 0.0,
          totalErrors: 1,
          healedErrors: success ? 1 : 0,
          unhealedErrors: success ? 0 : 1,
        },
      });
    }
  }

  /**
   * Record attempt in history for detailed analytics
   */
  private async recordAttemptHistory(
    attempt: any,
    success: boolean,
    metadata?: Record<string, any>
  ): Promise<void> {
    // This could be stored in a separate AttemptHistory table
    // For now, we're using the metadata field in HealingAttempt
    const historyEntry = {
      trackedAt: new Date().toISOString(),
      success,
      ...metadata,
    };

    await prisma.healingAttempt.update({
      where: { id: attempt.id },
      data: {
        metadata: {
          ...(attempt.metadata || {}),
          history: historyEntry,
        },
      },
    });
  }

  /**
   * Get healing statistics for a project or globally
   */
  async getStats(projectId?: string, days: number = 30): Promise<HealingStats> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const where: any = projectId ? { error: { projectId } } : {};

    // Get attempt counts
    const totalAttempts = await prisma.healingAttempt.count({ where });
    const successfulAttempts = await prisma.healingAttempt.count({
      where: { ...where, status: 'deployed' },
    });
    const failedAttempts = await prisma.healingAttempt.count({
      where: { ...where, status: 'failed' },
    });
    const rolledBackAttempts = await prisma.healingAttempt.count({
      where: { ...where, rolledBack: true },
    });
    const pendingAttempts = await prisma.healingAttempt.count({
      where: { ...where, status: 'pending' },
    });

    // Get average metrics
    const attempts = await prisma.healingAttempt.findMany({
      where: {
        ...where,
        completedAt: { gte: startDate },
      },
      include: {
        error: true,
        deployment: true,
      },
    });

    const avgConfidence =
      attempts.length > 0
        ? attempts.reduce((sum, a) => sum + a.confidence, 0) / attempts.length
        : 0;

    const attemptsWithDuration = attempts.filter(a => a.duration);
    const avgTimeToFix =
      attemptsWithDuration.length > 0
        ? attemptsWithDuration.reduce((sum, a) => sum + (a.duration || 0), 0) /
          attemptsWithDuration.length
        : 0;

    // Calculate time breakdowns (placeholder - would need more detailed tracking)
    const avgTimeToValidate = avgTimeToFix * 0.3; // Rough estimate
    const avgTimeToDeploy = avgTimeToFix * 0.2; // Rough estimate

    // Get errors by type
    const errorsByType: Record<string, number> = {};
    for (const attempt of attempts) {
      const type = attempt.error.errorType;
      errorsByType[type] = (errorsByType[type] || 0) + 1;
    }

    // Get errors by environment
    const errorsByEnvironment: Record<string, number> = {};
    for (const attempt of attempts) {
      const env = attempt.error.environment;
      errorsByEnvironment[env] = (errorsByEnvironment[env] || 0) + 1;
    }

    // Get healing trends (daily breakdown)
    const metrics = await prisma.healingMetrics.findMany({
      where: {
        projectId: projectId || undefined,
        date: { gte: startDate },
      },
      orderBy: { date: 'asc' },
    });

    const healingTrends = metrics.map(m => ({
      date: m.date,
      attempts: m.totalAttempts,
      successes: m.successfulAttempts,
      failures: m.failedAttempts,
    }));

    return {
      totalAttempts,
      successfulAttempts,
      failedAttempts,
      rolledBackAttempts,
      pendingAttempts,
      successRate: totalAttempts > 0 ? successfulAttempts / totalAttempts : 0,
      deploymentSuccessRate:
        totalAttempts > 0 ? (successfulAttempts - rolledBackAttempts) / totalAttempts : 0,
      avgConfidence,
      avgTimeToFix,
      avgTimeToValidate,
      avgTimeToDeploy,
      errorsByType,
      errorsByEnvironment,
      healingTrends,
    };
  }

  /**
   * Get detailed metrics for a specific attempt
   */
  async getAttemptMetrics(attemptId: string): Promise<AttemptMetrics | null> {
    const attempt = await prisma.healingAttempt.findUnique({
      where: { id: attemptId },
      include: {
        error: true,
        deployment: true,
      },
    });

    if (!attempt) return null;

    const deployment = attempt.deployment;

    // Calculate time breakdowns
    const duration = attempt.duration || 0;
    const timeToAnalysis = duration * 0.4; // Rough estimate
    const timeToValidation = duration * 0.3;
    const timeToDeployment = duration * 0.3;

    // Calculate error rate improvement
    const errorRateBefore = deployment?.errorRateBefore || 0;
    const errorRateAfter = deployment?.errorRateAfter || 0;
    const errorRateImprovement = errorRateBefore - errorRateAfter;

    return {
      attemptId: attempt.id,
      duration,
      timeToAnalysis,
      timeToValidation,
      timeToDeployment,
      confidence: attempt.confidence,
      testsRun: attempt.testsRun,
      testsPassed: attempt.testsPassed ? attempt.testsRun - attempt.testsFailed : 0,
      testsFailed: attempt.testsFailed,
      errorRateBefore,
      errorRateAfter,
      errorRateImprovement,
    };
  }

  /**
   * Get top healing patterns (most common error types that are successfully healed)
   */
  async getTopHealingPatterns(projectId?: string, limit: number = 10): Promise<any[]> {
    const where = projectId ? { projectId } : {};

    const successfulAttempts = await prisma.healingAttempt.findMany({
      where: {
        status: 'deployed',
        rolledBack: false,
      },
      include: {
        error: true,
      },
    });

    // Group by error type
    const patterns: Record<string, { count: number; avgConfidence: number; avgDuration: number }> =
      {};

    for (const attempt of successfulAttempts) {
      const error = (attempt as any).error;
      if (!error) continue;

      const type = error.errorType;

      if (!patterns[type]) {
        patterns[type] = { count: 0, avgConfidence: 0, avgDuration: 0 };
      }

      patterns[type].count++;
      patterns[type].avgConfidence += attempt.confidence;
      patterns[type].avgDuration += attempt.duration || 0;
    }

    // Calculate averages and sort by count
    const result = Object.entries(patterns)
      .map(([type, data]) => ({
        errorType: type,
        count: data.count,
        avgConfidence: data.avgConfidence / data.count,
        avgDuration: data.avgDuration / data.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, limit);

    return result;
  }

  /**
   * Get healing failure reasons
   */
  async getFailureReasons(projectId?: string): Promise<Record<string, number>> {
    const where = projectId ? { error: { projectId } } : {};

    const failedAttempts = await prisma.healingAttempt.findMany({
      where: {
        ...where,
        status: 'failed',
      },
    });

    const reasons: Record<string, number> = {};

    for (const attempt of failedAttempts) {
      const reason = attempt.rollbackReason || 'Unknown';
      reasons[reason] = (reasons[reason] || 0) + 1;
    }

    return reasons;
  }

  /**
   * Calculate running average
   */
  private calculateRunningAverage(
    currentAverage: number,
    currentCount: number,
    newValue: number
  ): number {
    return (currentAverage * currentCount + newValue) / (currentCount + 1);
  }

  /**
   * Reset metrics for a project (admin function)
   */
  async resetMetrics(projectId: string): Promise<void> {
    await prisma.healingMetrics.deleteMany({
      where: { projectId },
    });

    console.log(`[Healing Tracker] Reset metrics for project ${projectId}`);
  }

  /**
   * Export metrics to JSON (for reporting)
   */
  async exportMetrics(projectId?: string, days: number = 30): Promise<string> {
    const stats = await this.getStats(projectId, days);
    const topPatterns = await this.getTopHealingPatterns(projectId);
    const failureReasons = await this.getFailureReasons(projectId);

    const report = {
      generatedAt: new Date().toISOString(),
      projectId: projectId || 'all',
      period: `Last ${days} days`,
      stats,
      topPatterns,
      failureReasons,
    };

    return JSON.stringify(report, null, 2);
  }
}

export const healingAttemptTracker = new HealingAttemptTracker();

/**
 * Self-Healing Dashboard Service
 *
 * Provides comprehensive dashboard data for admin monitoring of the
 * self-healing system. Includes real-time status, metrics, trends, and alerts.
 */

import { prisma } from '../../lib/prisma';
import { healingAttemptTracker } from './HealingAttemptTracker';

export interface DashboardData {
  overview: {
    totalErrors: number;
    activeHealings: number;
    healedToday: number;
    failedToday: number;
    successRate: number;
    avgTimeToFix: number;
  };
  recentAttempts: Array<{
    id: string;
    errorType: string;
    errorMessage: string;
    environment: string;
    status: string;
    confidence: number;
    startedAt: Date;
    duration: number | null;
    rolledBack: boolean;
  }>;
  errorTrends: Array<{
    date: Date;
    totalErrors: number;
    healedErrors: number;
    failedErrors: number;
  }>;
  topErrorTypes: Array<{
    errorType: string;
    count: number;
    healedCount: number;
    failedCount: number;
    successRate: number;
  }>;
  environmentStats: Array<{
    environment: string;
    totalAttempts: number;
    successfulAttempts: number;
    failedAttempts: number;
    successRate: number;
  }>;
  systemHealth: {
    circuitBreakersOpen: number;
    pendingReviews: number;
    deploymentsToday: number;
    rollbacksToday: number;
    avgConfidence: number;
  };
  alerts: Array<{
    severity: 'info' | 'warning' | 'error' | 'critical';
    message: string;
    timestamp: Date;
    metadata?: any;
  }>;
}

export interface DetailedAttemptView {
  attempt: {
    id: string;
    errorId: string;
    status: string;
    confidence: number;
    startedAt: Date;
    completedAt: Date | null;
    duration: number | null;
    triggerSource: string;
    rolledBack: boolean;
    rollbackReason: string | null;
  };
  error: {
    errorType: string;
    errorMessage: string;
    stackTrace: string;
    filePath: string | null;
    lineNumber: number | null;
    environment: string;
    occurrenceCount: number;
  };
  fix: {
    fixCode: string;
    fixDescription: string;
    confidence: number;
  };
  validation: {
    testsPassed: boolean;
    testsRun: number;
    testsFailed: number;
    validationLogs: string | null;
  };
  deployment: {
    deployed: boolean;
    deploymentId: string | null;
    strategy: string | null;
    healthCheckPassed: boolean;
    errorRateBefore: number | null;
    errorRateAfter: number | null;
    rollback: {
      rolledBack: boolean;
      reason: string | null;
      timestamp: Date | null;
    };
  };
  timeline: Array<{
    stage: string;
    timestamp: Date;
    status: 'success' | 'failure' | 'in_progress';
    details: string;
  }>;
}

export class SelfHealingDashboard {
  /**
   * Get comprehensive dashboard data
   */
  async getDashboardData(projectId?: string, days: number = 7): Promise<DashboardData> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const where = projectId ? { error: { projectId } } : {};

    // Get overview metrics
    const overview = await this.getOverviewMetrics(projectId);

    // Get recent attempts
    const recentAttempts = await this.getRecentAttempts(projectId, 10);

    // Get error trends
    const errorTrends = await this.getErrorTrends(projectId, days);

    // Get top error types
    const topErrorTypes = await this.getTopErrorTypes(projectId, 10);

    // Get environment stats
    const environmentStats = await this.getEnvironmentStats(projectId);

    // Get system health
    const systemHealth = await this.getSystemHealth(projectId);

    // Get alerts
    const alerts = await this.getAlerts(projectId);

    return {
      overview,
      recentAttempts,
      errorTrends,
      topErrorTypes,
      environmentStats,
      systemHealth,
      alerts,
    };
  }

  /**
   * Get overview metrics
   */
  private async getOverviewMetrics(projectId?: string): Promise<DashboardData['overview']> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const where = projectId ? { projectId } : {};

    // Total errors
    const totalErrors = await prisma.sentryError.count({ where });

    // Active healings
    const activeHealings = await prisma.healingAttempt.count({
      where: {
        ...where,
        status: { in: ['analyzing', 'testing', 'deploying'] },
      },
    });

    // Healed today
    const healedToday = await prisma.healingAttempt.count({
      where: {
        ...where,
        status: 'deployed',
        startedAt: { gte: today },
      },
    });

    // Failed today
    const failedToday = await prisma.healingAttempt.count({
      where: {
        ...where,
        status: 'failed',
        startedAt: { gte: today },
      },
    });

    // Success rate (last 30 days)
    const stats = await healingAttemptTracker.getStats(projectId, 30);

    return {
      totalErrors,
      activeHealings,
      healedToday,
      failedToday,
      successRate: stats.successRate,
      avgTimeToFix: stats.avgTimeToFix,
    };
  }

  /**
   * Get recent healing attempts
   */
  private async getRecentAttempts(
    projectId?: string,
    limit: number = 10
  ): Promise<DashboardData['recentAttempts']> {
    const where = projectId ? { error: { projectId } } : {};

    const attempts = await prisma.healingAttempt.findMany({
      where,
      include: {
        error: {
          select: {
            errorType: true,
            errorMessage: true,
            environment: true,
          },
        },
      },
      orderBy: { startedAt: 'desc' },
      take: limit,
    });

    return attempts.map(a => ({
      id: a.id,
      errorType: a.error.errorType,
      errorMessage: a.error.errorMessage.substring(0, 100),
      environment: a.error.environment,
      status: a.status,
      confidence: a.confidence,
      startedAt: a.startedAt,
      duration: a.duration,
      rolledBack: a.rolledBack,
    }));
  }

  /**
   * Get error trends over time
   */
  private async getErrorTrends(
    projectId?: string,
    days: number = 7
  ): Promise<DashboardData['errorTrends']> {
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const metrics = await prisma.healingMetrics.findMany({
      where: {
        projectId: projectId || undefined,
        date: { gte: startDate },
      },
      orderBy: { date: 'asc' },
    });

    return metrics.map(m => ({
      date: m.date,
      totalErrors: m.totalErrors,
      healedErrors: m.healedErrors,
      failedErrors: m.unhealedErrors,
    }));
  }

  /**
   * Get top error types by frequency
   */
  private async getTopErrorTypes(
    projectId?: string,
    limit: number = 10
  ): Promise<DashboardData['topErrorTypes']> {
    const where = projectId ? { projectId } : {};

    // Get all errors grouped by type
    const errors = await prisma.sentryError.groupBy({
      by: ['errorType'],
      where,
      _count: {
        id: true,
      },
      orderBy: {
        _count: {
          id: 'desc',
        },
      },
      take: limit,
    });

    // For each error type, get healing stats
    const result = await Promise.all(
      errors.map(async err => {
        const totalAttempts = await prisma.healingAttempt.count({
          where: {
            error: {
              ...where,
              errorType: err.errorType,
            },
          },
        });

        const healedCount = await prisma.healingAttempt.count({
          where: {
            error: {
              ...where,
              errorType: err.errorType,
            },
            status: 'deployed',
            rolledBack: false,
          },
        });

        const failedCount = await prisma.healingAttempt.count({
          where: {
            error: {
              ...where,
              errorType: err.errorType,
            },
            status: 'failed',
          },
        });

        return {
          errorType: err.errorType,
          count: err._count.id,
          healedCount,
          failedCount,
          successRate: totalAttempts > 0 ? healedCount / totalAttempts : 0,
        };
      })
    );

    return result;
  }

  /**
   * Get statistics by environment
   */
  private async getEnvironmentStats(
    projectId?: string
  ): Promise<DashboardData['environmentStats']> {
    const where = projectId ? { projectId } : {};

    const environments = await prisma.sentryError.groupBy({
      by: ['environment'],
      where,
    });

    const result = await Promise.all(
      environments.map(async env => {
        const totalAttempts = await prisma.healingAttempt.count({
          where: {
            error: {
              ...where,
              environment: env.environment,
            },
          },
        });

        const successfulAttempts = await prisma.healingAttempt.count({
          where: {
            error: {
              ...where,
              environment: env.environment,
            },
            status: 'deployed',
            rolledBack: false,
          },
        });

        const failedAttempts = await prisma.healingAttempt.count({
          where: {
            error: {
              ...where,
              environment: env.environment,
            },
            status: 'failed',
          },
        });

        return {
          environment: env.environment,
          totalAttempts,
          successfulAttempts,
          failedAttempts,
          successRate: totalAttempts > 0 ? successfulAttempts / totalAttempts : 0,
        };
      })
    );

    return result;
  }

  /**
   * Get system health indicators
   */
  private async getSystemHealth(projectId?: string): Promise<DashboardData['systemHealth']> {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const where = projectId ? { error: { projectId } } : {};

    // Circuit breakers (errors with too many failures)
    const circuitBreakersOpen = await prisma.sentryError.count({
      where: {
        ...where,
        status: 'cooldown',
      },
    });

    // Pending reviews
    const pendingReviews = await prisma.healingAttempt.count({
      where: {
        ...where,
        status: 'pending',
      },
    });

    // Deployments today
    const deploymentsToday = await prisma.healingAttempt.count({
      where: {
        ...where,
        status: 'deployed',
        startedAt: { gte: today },
      },
    });

    // Rollbacks today
    const rollbacksToday = await prisma.healingAttempt.count({
      where: {
        ...where,
        rolledBack: true,
        startedAt: { gte: today },
      },
    });

    // Average confidence (last 24 hours)
    const recentAttempts = await prisma.healingAttempt.findMany({
      where: {
        ...where,
        startedAt: { gte: today },
      },
    });

    const avgConfidence =
      recentAttempts.length > 0
        ? recentAttempts.reduce((sum, a) => sum + a.confidence, 0) / recentAttempts.length
        : 0;

    return {
      circuitBreakersOpen,
      pendingReviews,
      deploymentsToday,
      rollbacksToday,
      avgConfidence,
    };
  }

  /**
   * Get system alerts
   */
  private async getAlerts(projectId?: string): Promise<DashboardData['alerts']> {
    const alerts: DashboardData['alerts'] = [];
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const where = projectId ? { error: { projectId } } : {};

    // Check for high failure rate
    const totalToday = await prisma.healingAttempt.count({
      where: { ...where, startedAt: { gte: today } },
    });

    const failedToday = await prisma.healingAttempt.count({
      where: { ...where, status: 'failed', startedAt: { gte: today } },
    });

    if (totalToday > 5 && failedToday / totalToday > 0.5) {
      alerts.push({
        severity: 'error',
        message: `High failure rate: ${((failedToday / totalToday) * 100).toFixed(0)}% of healing attempts failed today`,
        timestamp: new Date(),
        metadata: { failedToday, totalToday },
      });
    }

    // Check for circuit breakers
    const circuitBreakers = await prisma.sentryError.count({
      where: { ...where, status: 'cooldown' },
    });

    if (circuitBreakers > 0) {
      alerts.push({
        severity: 'warning',
        message: `${circuitBreakers} error(s) are in circuit breaker cooldown`,
        timestamp: new Date(),
        metadata: { circuitBreakers },
      });
    }

    // Check for pending reviews
    const pendingReviews = await prisma.healingAttempt.count({
      where: { ...where, status: 'pending' },
    });

    if (pendingReviews > 3) {
      alerts.push({
        severity: 'warning',
        message: `${pendingReviews} healing attempts require human review`,
        timestamp: new Date(),
        metadata: { pendingReviews },
      });
    }

    // Check for recent rollbacks
    const recentRollbacks = await prisma.healingAttempt.count({
      where: {
        ...where,
        rolledBack: true,
        startedAt: { gte: today },
      },
    });

    if (recentRollbacks > 2) {
      alerts.push({
        severity: 'error',
        message: `${recentRollbacks} deployment(s) rolled back today`,
        timestamp: new Date(),
        metadata: { recentRollbacks },
      });
    }

    // Check for low confidence trends
    const recentAttempts = await prisma.healingAttempt.findMany({
      where: { ...where, startedAt: { gte: today } },
      select: { confidence: true },
    });

    if (recentAttempts.length > 0) {
      const avgConfidence =
        recentAttempts.reduce((sum, a) => sum + a.confidence, 0) / recentAttempts.length;

      if (avgConfidence < 0.7) {
        alerts.push({
          severity: 'warning',
          message: `Low average fix confidence: ${(avgConfidence * 100).toFixed(0)}%`,
          timestamp: new Date(),
          metadata: { avgConfidence },
        });
      }
    }

    return alerts.sort((a, b) => {
      const severityOrder = { critical: 0, error: 1, warning: 2, info: 3 };
      return severityOrder[a.severity] - severityOrder[b.severity];
    });
  }

  /**
   * Get detailed view of a specific attempt
   */
  async getDetailedAttemptView(attemptId: string): Promise<DetailedAttemptView | null> {
    const attempt = await prisma.healingAttempt.findUnique({
      where: { id: attemptId },
      include: {
        error: true,
        deployment: true,
      },
    });

    if (!attempt) return null;

    // Build timeline
    const timeline: DetailedAttemptView['timeline'] = [
      {
        stage: 'Error Detected',
        timestamp: attempt.error.firstSeen,
        status: 'success',
        details: `${attempt.error.errorType}: ${attempt.error.errorMessage}`,
      },
      {
        stage: 'Healing Started',
        timestamp: attempt.startedAt,
        status: 'success',
        details: `Triggered by ${attempt.triggerSource}`,
      },
    ];

    if (attempt.analysisId) {
      timeline.push({
        stage: 'TCI Analysis',
        timestamp: attempt.startedAt,
        status: 'success',
        details: `Generated fix with ${(attempt.confidence * 100).toFixed(0)}% confidence`,
      });
    }

    if (attempt.testsRun > 0) {
      timeline.push({
        stage: 'Validation',
        timestamp: attempt.startedAt,
        status: attempt.testsPassed ? 'success' : 'failure',
        details: `${attempt.testsRun - attempt.testsFailed}/${attempt.testsRun} tests passed`,
      });
    }

    if (attempt.deployed) {
      timeline.push({
        stage: 'Deployment',
        timestamp: attempt.deployment?.deployedAt || attempt.completedAt || new Date(),
        status: attempt.rolledBack ? 'failure' : 'success',
        details: `Deployed using ${attempt.deployment?.strategy || 'unknown'} strategy`,
      });
    }

    if (attempt.rolledBack) {
      timeline.push({
        stage: 'Rollback',
        timestamp: attempt.deployment?.rolledBackAt || attempt.completedAt || new Date(),
        status: 'failure',
        details: attempt.rollbackReason || 'Automatic rollback triggered',
      });
    }

    if (attempt.completedAt) {
      timeline.push({
        stage: 'Completed',
        timestamp: attempt.completedAt,
        status: attempt.status === 'deployed' && !attempt.rolledBack ? 'success' : 'failure',
        details: `Status: ${attempt.status}`,
      });
    }

    return {
      attempt: {
        id: attempt.id,
        errorId: attempt.errorId,
        status: attempt.status,
        confidence: attempt.confidence,
        startedAt: attempt.startedAt,
        completedAt: attempt.completedAt,
        duration: attempt.duration,
        triggerSource: attempt.triggerSource,
        rolledBack: attempt.rolledBack,
        rollbackReason: attempt.rollbackReason,
      },
      error: {
        errorType: attempt.error.errorType,
        errorMessage: attempt.error.errorMessage,
        stackTrace: attempt.error.stackTrace,
        filePath: attempt.error.filePath,
        lineNumber: attempt.error.lineNumber,
        environment: attempt.error.environment,
        occurrenceCount: attempt.error.occurrenceCount,
      },
      fix: {
        fixCode: attempt.fixCode,
        fixDescription: attempt.fixDescription,
        confidence: attempt.confidence,
      },
      validation: {
        testsPassed: attempt.testsPassed,
        testsRun: attempt.testsRun,
        testsFailed: attempt.testsFailed,
        validationLogs: attempt.validationLogs,
      },
      deployment: {
        deployed: attempt.deployed,
        deploymentId: attempt.deploymentId,
        strategy: attempt.deployment?.strategy || null,
        healthCheckPassed: attempt.deployment?.healthCheckPassed || false,
        errorRateBefore: attempt.deployment?.errorRateBefore || null,
        errorRateAfter: attempt.deployment?.errorRateAfter || null,
        rollback: {
          rolledBack: attempt.rolledBack,
          reason: attempt.rollbackReason,
          timestamp: attempt.deployment?.rolledBackAt || null,
        },
      },
      timeline,
    };
  }

  /**
   * Export dashboard data to JSON
   */
  async exportDashboardData(projectId?: string, days: number = 30): Promise<string> {
    const data = await this.getDashboardData(projectId, days);

    return JSON.stringify(
      {
        exportedAt: new Date().toISOString(),
        projectId: projectId || 'all',
        period: `Last ${days} days`,
        ...data,
      },
      null,
      2
    );
  }
}

export const selfHealingDashboard = new SelfHealingDashboard();

import * as Sentry from '@sentry/node';
import { NodeSDK } from '@opentelemetry/sdk-node';
import { getNodeAutoInstrumentations } from '@opentelemetry/auto-instrumentations-node';
import { OTLPTraceExporter } from '@opentelemetry/exporter-otlp-grpc';
import { BatchSpanProcessor } from '@opentelemetry/sdk-trace-node';
import { SpanExporter } from '@opentelemetry/sdk-trace-base';
import { PostHog } from 'posthog-node';

export interface TelemetryEvent {
  event: string;
  userId?: string;
  projectId?: string;
  sessionId?: string;
  properties: Record<string, any>;
  timestamp?: Date;
}

export interface PerformanceMetrics {
  responseTime: number;
  memoryUsage: number;
  cpuUsage: number;
  errorRate: number;
  userSatisfaction?: number;
}

export class MonitoringService {
  private posthog: PostHog;
  private sdk!: NodeSDK;
  private isInitialized: boolean = false;

  constructor() {
    this.posthog = new PostHog(
      process.env.POSTHOG_API_KEY!,
      {
        host: process.env.POSTHOG_HOST || 'https://app.posthog.com',
        requestTimeout: 10000,
        maxCacheSize: 1000,
      }
    );

    this.initializeOpenTelemetry();
    this.initializeSentry();
  }

  private initializeOpenTelemetry(): void {
    const traceExporter = new OTLPTraceExporter({
      url: process.env.OTLP_ENDPOINT || 'http://localhost:4317',
    }) as any; // Type assertion to handle version conflicts

    this.sdk = new NodeSDK({
      serviceName: 'plusultra-backend',
      traceExporter,
      spanProcessor: new BatchSpanProcessor(traceExporter),
      instrumentations: [getNodeAutoInstrumentations()],
    });
  }

  private initializeSentry(): void {
    Sentry.init({
      dsn: process.env.SENTRY_DSN,
      environment: process.env.NODE_ENV || 'development',
      tracesSampleRate: 1.0,
      profilesSampleRate: 1.0,
      beforeSend: (event) => {
        // Filter out sensitive data
        if (event.request?.data) {
          delete event.request.data;
        }
        return event;
      },
    });
  }

  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await this.sdk.start();
      this.isInitialized = true;
      console.log('Monitoring service initialized');
    } catch (error) {
      console.error('Failed to initialize monitoring service:', error);
    }
  }

  // Event tracking for analytics
  async trackEvent(event: TelemetryEvent): Promise<void> {
    const { event: eventName, userId, projectId, sessionId, properties, timestamp } = event;

    try {
      // Send to PostHog for analytics
      this.posthog.capture({
        distinctId: userId || 'anonymous',
        event: eventName,
        properties: {
          ...properties,
          projectId,
          sessionId,
          timestamp: timestamp || new Date(),
        },
      });

      // Send to OpenTelemetry for tracing
      // This would be handled by the automatic instrumentation

      console.log(`Tracked event: ${eventName}`, { userId, projectId, properties });
    } catch (error) {
      console.error('Failed to track event:', error);
    }
  }

  // Performance monitoring
  async recordPerformanceMetrics(metrics: PerformanceMetrics): Promise<void> {
    try {
      // Send performance metrics to PostHog
      this.posthog.capture({
        distinctId: 'system',
        event: 'performance_metrics',
        properties: {
          ...metrics,
          timestamp: new Date(),
        },
      });

      // Send to Sentry for monitoring
      if (metrics.errorRate > 0.1) { // High error rate threshold
        Sentry.withScope((scope) => {
          scope.setTag('metric_type', 'error_rate');
          Sentry.captureMessage(`High error rate detected: ${metrics.errorRate}`, 'warning');
        });
      }

      // Log for debugging
      console.log('Performance metrics recorded:', metrics);
    } catch (error) {
      console.error('Failed to record performance metrics:', error);
    }
  }

  // Error tracking
  async captureError(error: Error, context?: Record<string, any>): Promise<void> {
    try {
      // Send to Sentry for error tracking
      Sentry.withScope((scope) => {
        if (context) {
          Object.keys(context).forEach(key => {
            scope.setTag(key, context[key]);
          });
        }
        Sentry.captureException(error);
      });

      // Also send to PostHog for analytics
      this.posthog.capture({
        distinctId: 'system',
        event: 'error_occurred',
        properties: {
          error: error.message,
          stack: error.stack,
          ...context,
          timestamp: new Date(),
        },
      });

      console.error('Error captured:', error, context);
    } catch (monitoringError) {
      console.error('Failed to capture error:', monitoringError);
    }
  }

  // User journey tracking
  async trackUserJourney(userId: string, journey: string, step: string, metadata?: Record<string, any>): Promise<void> {
    await this.trackEvent({
      event: `journey_${journey}_${step}`,
      userId,
      properties: {
        journey,
        step,
        ...metadata,
      },
    });
  }

  // AI model performance tracking
  async trackAIModelPerformance(
    model: string,
    task: string,
    duration: number,
    tokensUsed: number,
    success: boolean,
    error?: string
  ): Promise<void> {
    await this.trackEvent({
      event: 'ai_model_performance',
      properties: {
        model,
        task,
        duration,
        tokensUsed,
        success,
        error,
      },
    });
  }

  // Code generation metrics
  async trackCodeGeneration(
    userId: string,
    projectId: string,
    language: string,
    fileCount: number,
    linesOfCode: number,
    duration: number,
    success: boolean
  ): Promise<void> {
    await this.trackEvent({
      event: 'code_generation',
      userId,
      projectId,
      properties: {
        language,
        fileCount,
        linesOfCode,
        duration,
        success,
      },
    });
  }

  // Feature usage tracking
  async trackFeatureUsage(userId: string, feature: string, action: string, metadata?: Record<string, any>): Promise<void> {
    await this.trackEvent({
      event: `feature_${feature}_${action}`,
      userId,
      properties: metadata || {},
    });
  }

  // Get analytics summary (for dashboard)
  async getAnalyticsSummary(timeRange: string = '24h'): Promise<any> {
    // This would typically query PostHog or a data warehouse
    // For now, return a placeholder structure
    return {
      totalEvents: 0,
      uniqueUsers: 0,
      topFeatures: [],
      errorRate: 0,
      avgResponseTime: 0,
      timeRange
    };
  }

  // Performance forecasting based on historical data
  async predictPerformance(hours: number = 24): Promise<PerformanceMetrics> {
    // This would analyze historical metrics and predict future performance
    // For now, return current metrics as prediction
    const currentMetrics = await this.getCurrentMetrics();

    return {
      ...currentMetrics,
      // Simple prediction: assume slight degradation over time
      errorRate: Math.min(currentMetrics.errorRate * 1.1, 1.0),
      responseTime: currentMetrics.responseTime * 1.05,
    };
  }

  private async getCurrentMetrics(): Promise<PerformanceMetrics> {
    // Get current system metrics
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    return {
      responseTime: 500, // Placeholder
      memoryUsage: Math.round(memUsage.heapUsed / memUsage.heapTotal * 100),
      cpuUsage: Math.round((cpuUsage.user + cpuUsage.system) / 1000000), // Convert to percentage
      errorRate: 0.02, // Placeholder - 2% error rate
    };
  }

  // User feedback collection
  async collectUserFeedback(
    userId: string,
    projectId: string,
    rating: number,
    feedback?: string,
    category?: string
  ): Promise<void> {
    await this.trackEvent({
      event: 'user_feedback',
      userId,
      projectId,
      properties: {
        rating,
        feedback,
        category,
      },
    });

    // Send high-priority feedback to Sentry for immediate attention
    if (rating <= 2) {
      Sentry.withScope((scope) => {
        scope.setTag('feedback_type', 'negative');
        scope.setLevel('warning');
        Sentry.captureMessage(`Negative feedback received: ${feedback}`, 'warning');
      });
    }
  }

  // Self-Healing System Metrics
  async trackHealingAttempt(
    attemptId: string,
    errorType: string,
    environment: string,
    status: 'started' | 'success' | 'failed' | 'rolled_back',
    metadata?: {
      confidence?: number;
      duration?: number;
      testsRun?: number;
      testsPassed?: number;
      deploymentStrategy?: string;
    }
  ): Promise<void> {
    await this.trackEvent({
      event: `healing_attempt_${status}`,
      projectId: metadata?.deploymentStrategy || 'unknown',
      properties: {
        attemptId,
        errorType,
        environment,
        status,
        ...metadata,
      },
    });

    // Send critical events to Sentry
    if (status === 'failed' || status === 'rolled_back') {
      Sentry.withScope((scope) => {
        scope.setTag('healing_status', status);
        scope.setTag('error_type', errorType);
        scope.setTag('environment', environment);
        Sentry.captureMessage(
          `Self-healing ${status}: ${errorType}`,
          status === 'failed' ? 'error' : 'warning'
        );
      });
    }
  }

  async trackHealingSuccess(
    errorType: string,
    duration: number,
    confidence: number,
    environment: string
  ): Promise<void> {
    await this.trackEvent({
      event: 'healing_success',
      properties: {
        errorType,
        duration,
        confidence,
        environment,
        timestamp: new Date(),
      },
    });
  }

  async trackHealingFailure(
    errorType: string,
    reason: string,
    environment: string,
    attemptNumber: number
  ): Promise<void> {
    await this.trackEvent({
      event: 'healing_failure',
      properties: {
        errorType,
        reason,
        environment,
        attemptNumber,
        timestamp: new Date(),
      },
    });
  }

  async trackHealingDeployment(
    deploymentId: string,
    strategy: string,
    environment: string,
    success: boolean,
    metrics?: {
      errorRateBefore: number;
      errorRateAfter: number;
      responseTimeBefore: number;
      responseTimeAfter: number;
    }
  ): Promise<void> {
    await this.trackEvent({
      event: 'healing_deployment',
      properties: {
        deploymentId,
        strategy,
        environment,
        success,
        ...metrics,
      },
    });

    // Calculate improvement metrics
    if (metrics) {
      const errorRateImprovement =
        ((metrics.errorRateBefore - metrics.errorRateAfter) / metrics.errorRateBefore) * 100;
      const responseTimeImprovement =
        ((metrics.responseTimeBefore - metrics.responseTimeAfter) / metrics.responseTimeBefore) *
        100;

      console.log(`[Healing Metrics] Deployment ${deploymentId}:`, {
        errorRateImprovement: `${errorRateImprovement.toFixed(1)}%`,
        responseTimeImprovement: `${responseTimeImprovement.toFixed(1)}%`,
      });
    }
  }

  async trackHealingRollback(
    deploymentId: string,
    reason: string,
    environment: string,
    errorRateIncrease: number
  ): Promise<void> {
    await this.trackEvent({
      event: 'healing_rollback',
      properties: {
        deploymentId,
        reason,
        environment,
        errorRateIncrease,
        timestamp: new Date(),
      },
    });

    // Send to Sentry as warning
    Sentry.withScope((scope) => {
      scope.setTag('deployment_id', deploymentId);
      scope.setTag('environment', environment);
      scope.setLevel('warning');
      Sentry.captureMessage(`Healing deployment rolled back: ${reason}`, 'warning');
    });
  }

  // Get real-time metrics for health checks
  async getRealtimeMetrics(projectId: string): Promise<{
    errorRate: number;
    responseTime: number;
    requestCount: number;
    errorCount: number;
    avgResponseTime: number;
    p95ResponseTime: number;
  }> {
    // In production, this would query your metrics backend (Prometheus, CloudWatch, etc.)
    // For now, return simulated metrics based on system state
    const currentMetrics = await this.getCurrentMetrics();

    // Simulate request metrics (in production, get from actual metrics store)
    const requestCount = Math.floor(Math.random() * 1000) + 100; // 100-1100 requests
    const errorCount = Math.floor(requestCount * currentMetrics.errorRate);

    return {
      errorRate: currentMetrics.errorRate,
      responseTime: currentMetrics.responseTime,
      requestCount,
      errorCount,
      avgResponseTime: currentMetrics.responseTime,
      p95ResponseTime: currentMetrics.responseTime * 1.5, // P95 is typically 1.5x average
    };
  }

  // Get healing system health metrics
  async getHealingSystemHealth(): Promise<{
    totalAttempts: number;
    successRate: number;
    avgTimeToFix: number;
    activeHealings: number;
    circuitBreakersOpen: number;
  }> {
    // This would query the healing metrics from database
    // For now, return placeholder data
    return {
      totalAttempts: 0,
      successRate: 0,
      avgTimeToFix: 0,
      activeHealings: 0,
      circuitBreakersOpen: 0,
    };
  }

  // Cleanup and shutdown
  async shutdown(): Promise<void> {
    try {
      await this.sdk.shutdown();
      this.posthog.shutdown();
      console.log('Monitoring service shut down');
    } catch (error) {
      console.error('Error shutting down monitoring service:', error);
    }
  }
}

export const monitoringService = new MonitoringService();
export default MonitoringService;

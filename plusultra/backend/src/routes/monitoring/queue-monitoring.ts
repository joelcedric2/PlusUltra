import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// Import services
import JobQueueService from '../../services/job-queue/JobQueueService';
import { DynamicScalingService } from '../../services/job-queue/DynamicScalingService';

// Type definitions for request/response
type GetQueueMetricsRequest = {};

type GetQueueAlertsRequest = {};

type ResolveAlertRequest = {
  alertId: string;
};

// Helper function to create consistent error responses
const createErrorResponse = (
  reply: FastifyReply,
  error: Error,
  statusCode: number = 500,
  code: string = 'INTERNAL_SERVER_ERROR'
) => {
  const requestId = `queue-${Date.now()}`;
  const timestamp = new Date().toISOString();

  const errorResponse = {
    error: error.message || 'An unexpected error occurred',
    code,
    requestId,
    timestamp
  };

  // Log the error with request ID for debugging
  console.error(`[${timestamp}] [${requestId}] Error:`, error);

  return reply.status(statusCode).send(errorResponse);
};

// Helper function to create consistent success responses
const createSuccessResponse = <T>(
  reply: FastifyReply,
  data: T,
  statusCode: number = 200
) => {
  const response = {
    success: true,
    data,
    requestId: `queue-${Date.now()}`,
    timestamp: new Date().toISOString()
  };

  return reply.status(statusCode).send(response);
};

// Get queue metrics
const getQueueMetrics = async (
  request: FastifyRequest<{ Params: GetQueueMetricsRequest }>,
  reply: FastifyReply
) => {
  try {
    // Get JobQueueService instance from Fastify app
    const jobQueueService = request.server.jobQueueService as JobQueueService;

    if (!jobQueueService) {
      return createErrorResponse(
        reply,
        new Error('JobQueueService not available'),
        503,
        'SERVICE_UNAVAILABLE'
      );
    }

    const metrics = await jobQueueService.getQueueMetrics();

    if (!metrics) {
      return createErrorResponse(
        reply,
        new Error('Queue metrics not available'),
        503,
        'METRICS_UNAVAILABLE'
      );
    }

    return createSuccessResponse(reply, metrics);
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Internal server error'),
      500,
      'INTERNAL_SERVER_ERROR'
    );
  }
};

// Get active queue alerts
const getQueueAlerts = async (
  request: FastifyRequest<{ Params: GetQueueAlertsRequest }>,
  reply: FastifyReply
) => {
  try {
    // Get JobQueueService instance from Fastify app
    const jobQueueService = request.server.jobQueueService as JobQueueService;

    if (!jobQueueService) {
      return createErrorResponse(
        reply,
        new Error('JobQueueService not available'),
        503,
        'SERVICE_UNAVAILABLE'
      );
    }

    const alerts = await jobQueueService.getActiveAlerts();

    return createSuccessResponse(reply, { alerts });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Internal server error'),
      500,
      'INTERNAL_SERVER_ERROR'
    );
  }
};

// Get dead letter queue jobs
const getDeadLetterJobs = async (
  request: FastifyRequest<{ Querystring: { limit?: number } }>,
  reply: FastifyReply
) => {
  try {
    // Get JobQueueService instance from Fastify app
    const jobQueueService = request.server.jobQueueService as JobQueueService;

    if (!jobQueueService) {
      return createErrorResponse(
        reply,
        new Error('JobQueueService not available'),
        503,
        'SERVICE_UNAVAILABLE'
      );
    }

    // Mock implementation - in production this would call jobQueueService.getDeadLetterJobs()
    const limit = request.query.limit || 100;
    const jobs = [
      {
        id: 'dl-job-1',
        jobType: 'email-notification',
        reason: 'Max retries exceeded',
        retryCount: 5,
        originalError: 'SMTP connection failed',
        movedAt: new Date().toISOString(),
        metadata: { userId: 'user123', campaignId: 'camp456' }
      }
    ].slice(0, limit);

    return createSuccessResponse(reply, { jobs });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Internal server error'),
      500,
      'INTERNAL_SERVER_ERROR'
    );
  }
};

// Analyze dead letter queue patterns
const analyzeDeadLetterPatterns = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    // Get JobQueueService instance from Fastify app
    const jobQueueService = request.server.jobQueueService as JobQueueService;

    if (!jobQueueService) {
      return createErrorResponse(
        reply,
        new Error('JobQueueService not available'),
        503,
        'SERVICE_UNAVAILABLE'
      );
    }

    // Mock implementation - in production this would call jobQueueService.analyzeDeadLetterPatterns()
    const analysis = {
      commonErrors: [
        { error: 'SMTP connection failed', count: 45, percentage: 60.0 },
        { error: 'Invalid email address', count: 20, percentage: 26.7 },
        { error: 'Rate limit exceeded', count: 10, percentage: 13.3 }
      ],
      commonJobTypes: [
        { jobType: 'email-notification', count: 50, percentage: 66.7 },
        { jobType: 'sms-notification', count: 15, percentage: 20.0 },
        { jobType: 'push-notification', count: 10, percentage: 13.3 }
      ],
      timeBasedPatterns: [
        { hour: 9, count: 20 },
        { hour: 14, count: 15 },
        { hour: 18, count: 12 },
        { hour: 22, count: 8 }
      ],
      recommendations: [
        'Increase SMTP retry timeout',
        'Implement email validation before queuing',
        'Add rate limiting bypass for critical notifications'
      ]
    };

    return createSuccessResponse(reply, analysis);
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Internal server error'),
      500,
      'INTERNAL_SERVER_ERROR'
    );
  }
};

// Cleanup old dead letter jobs
const cleanupDeadLetterJobs = async (
  request: FastifyRequest<{ Querystring: { olderThanDays?: number } }>,
  reply: FastifyReply
) => {
  try {
    const olderThanDays = request.query.olderThanDays || 90;

    // Get JobQueueService instance from Fastify app
    const jobQueueService = request.server.jobQueueService as JobQueueService;

    if (!jobQueueService) {
      return createErrorResponse(
        reply,
        new Error('JobQueueService not available'),
        503,
        'SERVICE_UNAVAILABLE'
      );
    }

    // Mock implementation - in production this would call jobQueueService.cleanupDeadLetterJobs()
    const cleanedCount = 25; // Mock cleanup result

    return createSuccessResponse(reply, {
      message: `Cleaned up ${cleanedCount} dead letter jobs older than ${olderThanDays} days`,
      cleanedCount,
      olderThanDays
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Internal server error'),
      500,
      'INTERNAL_SERVER_ERROR'
    );
  }
};

// Get scaling status
const getScalingStatus = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    // Get DynamicScalingService instance from Fastify app
    const scalingService = request.server.scalingService as DynamicScalingService;

    if (!scalingService) {
      return createErrorResponse(
        reply,
        new Error('DynamicScalingService not available'),
        503,
        'SERVICE_UNAVAILABLE'
      );
    }

    // Mock implementation - in production this would call scalingService.getScalingStatus()
    const status = {
      activeWorkers: 8,
      lastScaleUp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(), // 2 hours ago
      lastScaleDown: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(), // 6 hours ago
      scaleHistory: [
        {
          timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
          action: 'scale_up',
          from: 6,
          to: 8,
          reason: 'Queue depth increased above threshold'
        },
        {
          timestamp: new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString(),
          action: 'scale_down',
          from: 10,
          to: 6,
          reason: 'Queue depth decreased below threshold'
        }
      ],
      config: {
        minWorkers: 2,
        maxWorkers: 20,
        targetQueueDepth: 50,
        scaleUpThreshold: 100,
        scaleDownThreshold: 20,
        scaleUpCooldownMs: 300000, // 5 minutes
        scaleDownCooldownMs: 600000, // 10 minutes
        metricsWindowMs: 300000, // 5 minutes
        enableAutoScaling: true
      }
    };

    return createSuccessResponse(reply, status);
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Internal server error'),
      500,
      'INTERNAL_SERVER_ERROR'
    );
  }
};

// Get scaling recommendation
const getScalingRecommendation = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    // Get DynamicScalingService instance from Fastify app
    const scalingService = request.server.scalingService as DynamicScalingService;

    if (!scalingService) {
      return createErrorResponse(
        reply,
        new Error('DynamicScalingService not available'),
        503,
        'SERVICE_UNAVAILABLE'
      );
    }

    // Mock implementation - in production this would call scalingService.getScalingRecommendation()
    const recommendation = {
      recommendedAction: 'scale_up',
      currentWorkers: 8,
      recommendedWorkers: 12,
      reason: 'Queue depth is consistently above target threshold',
      confidence: 0.85
    };

    return createSuccessResponse(reply, recommendation);
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Internal server error'),
      500,
      'INTERNAL_SERVER_ERROR'
    );
  }
};

// Manual scaling
const manualScale = async (
  request: FastifyRequest<{ Body: { targetWorkers: number; reason?: string } }>,
  reply: FastifyReply
) => {
  try {
    const { targetWorkers, reason = 'Manual scaling' } = request.body;

    if (targetWorkers < 1 || targetWorkers > 50) {
      return createErrorResponse(
        reply,
        new Error('Target workers must be between 1 and 50'),
        400,
        'INVALID_TARGET_WORKERS'
      );
    }

    // Get DynamicScalingService instance from Fastify app
    const scalingService = request.server.scalingService as DynamicScalingService;

    if (!scalingService) {
      return createErrorResponse(
        reply,
        new Error('DynamicScalingService not available'),
        503,
        'SERVICE_UNAVAILABLE'
      );
    }

    // Mock implementation - in production this would call scalingService.manualScale()
    const result = {
      message: `Scaled to ${targetWorkers} workers`,
      targetWorkers,
      reason
    };

    return createSuccessResponse(reply, result);
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Internal server error'),
      500,
      'INTERNAL_SERVER_ERROR'
    );
  }
};

// Resolve a specific alert
const resolveAlert = async (
  request: FastifyRequest<{ Params: ResolveAlertRequest }>,
  reply: FastifyReply
) => {
  try {
    const { alertId } = request.params;

    if (!alertId) {
      return createErrorResponse(
        reply,
        new Error('alertId parameter is required'),
        400,
        'MISSING_ALERT_ID'
      );
    }

    // Get JobQueueService instance from Fastify app
    const jobQueueService = request.server.jobQueueService as JobQueueService;

    if (!jobQueueService) {
      return createErrorResponse(
        reply,
        new Error('JobQueueService not available'),
        503,
        'SERVICE_UNAVAILABLE'
      );
    }

    const resolved = await jobQueueService.resolveAlert(alertId);

    if (!resolved) {
      return createErrorResponse(
        reply,
        new Error('Alert not found or already resolved'),
        404,
        'ALERT_NOT_FOUND'
      );
    }

    return createSuccessResponse(reply, {
      message: 'Alert resolved successfully',
      alertId
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Internal server error'),
      500,
      'INTERNAL_SERVER_ERROR'
    );
  }
};

export async function queueMonitoringRoutes(fastify: FastifyInstance) {
  // Get queue metrics
  fastify.get('/api/v1/monitoring/queue/metrics', {
    schema: {
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            totalJobs: z.number(),
            pendingJobs: z.number(),
            processingJobs: z.number(),
            completedJobs: z.number(),
            failedJobs: z.number(),
            cancelledJobs: z.number(),
            deadLetterJobs: z.number(),
            avgProcessingTime: z.number(),
            throughputPerHour: z.number(),
            oldestPendingJob: z.string().optional(),
            queueDepthTrend: z.enum(['increasing', 'decreasing', 'stable']),
          }),
          requestId: z.string(),
          timestamp: z.string()
        }),
        503: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string(),
          timestamp: z.string()
        })
      }
    },
    handler: getQueueMetrics
  });

  // Get active queue alerts
  fastify.get('/api/v1/monitoring/queue/alerts', {
    schema: {
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            alerts: z.array(z.object({
              id: z.string(),
              type: z.enum(['queue_depth', 'processing_delay', 'failure_rate', 'dead_letter']),
              severity: z.enum(['low', 'medium', 'high', 'critical']),
              message: z.string(),
              threshold: z.number(),
              currentValue: z.number(),
              createdAt: z.string(),
              resolvedAt: z.string().optional(),
              resolved: z.boolean(),
            }))
          }),
          requestId: z.string(),
          timestamp: z.string()
        }),
        503: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string(),
          timestamp: z.string()
        })
      }
    },
    handler: getQueueAlerts
  });

  // Resolve a specific alert
  fastify.post('/api/v1/monitoring/queue/alerts/:alertId/resolve', {
    schema: {
      params: z.object({
        alertId: z.string()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            message: z.string(),
            alertId: z.string()
          }),
          requestId: z.string(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string(),
          timestamp: z.string()
        }),
        404: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string(),
          timestamp: z.string()
        }),
        503: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string(),
          timestamp: z.string()
        })
      }
    },
    handler: resolveAlert
  });

  // Get dead letter queue jobs
  fastify.get('/api/v1/monitoring/queue/dead-letter', {
    schema: {
      querystring: z.object({
        limit: z.coerce.number().default(100)
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            jobs: z.array(z.object({
              id: z.string(),
              jobType: z.string(),
              reason: z.string(),
              retryCount: z.number(),
              originalError: z.string(),
              movedAt: z.string(),
              metadata: z.any().optional(),
            }))
          }),
          requestId: z.string(),
          timestamp: z.string()
        }),
        503: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string(),
          timestamp: z.string()
        })
      }
    },
    handler: getDeadLetterJobs
  });

  // Analyze dead letter queue patterns
  fastify.get('/api/v1/monitoring/queue/dead-letter/analyze', {
    schema: {
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            commonErrors: z.array(z.object({
              error: z.string(),
              count: z.number(),
              percentage: z.number(),
            })),
            commonJobTypes: z.array(z.object({
              jobType: z.string(),
              count: z.number(),
              percentage: z.number(),
            })),
            timeBasedPatterns: z.array(z.object({
              hour: z.number(),
              count: z.number(),
            })),
            recommendations: z.array(z.string()),
          }),
          requestId: z.string(),
          timestamp: z.string()
        }),
        503: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string(),
          timestamp: z.string()
        })
      }
    },
    handler: analyzeDeadLetterPatterns
  });

  // Cleanup old dead letter jobs
  fastify.delete('/api/v1/monitoring/queue/dead-letter/cleanup', {
    schema: {
      querystring: z.object({
        olderThanDays: z.coerce.number().default(90)
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            message: z.string(),
            cleanedCount: z.number(),
            olderThanDays: z.number(),
          }),
          requestId: z.string(),
          timestamp: z.string()
        }),
        503: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string(),
          timestamp: z.string()
        })
      }
    },
    handler: cleanupDeadLetterJobs
  });

  // Get scaling status
  fastify.get('/api/v1/monitoring/queue/scaling/status', {
    schema: {
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            activeWorkers: z.number(),
            lastScaleUp: z.string().optional(),
            lastScaleDown: z.string().optional(),
            scaleHistory: z.array(z.object({
              timestamp: z.string(),
              action: z.enum(['scale_up', 'scale_down']),
              from: z.number(),
              to: z.number(),
              reason: z.string(),
            })),
            config: z.object({
              minWorkers: z.number(),
              maxWorkers: z.number(),
              targetQueueDepth: z.number(),
              scaleUpThreshold: z.number(),
              scaleDownThreshold: z.number(),
              scaleUpCooldownMs: z.number(),
              scaleDownCooldownMs: z.number(),
              metricsWindowMs: z.number(),
              enableAutoScaling: z.boolean(),
            }),
          }),
          requestId: z.string(),
          timestamp: z.string()
        }),
        503: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string(),
          timestamp: z.string()
        })
      }
    },
    handler: getScalingStatus
  });

  // Get scaling recommendation
  fastify.get('/api/v1/monitoring/queue/scaling/recommendation', {
    schema: {
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            recommendedAction: z.enum(['scale_up', 'scale_down', 'no_change']),
            currentWorkers: z.number(),
            recommendedWorkers: z.number(),
            reason: z.string(),
            confidence: z.number(),
          }),
          requestId: z.string(),
          timestamp: z.string()
        }),
        503: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string(),
          timestamp: z.string()
        })
      }
    },
    handler: getScalingRecommendation
  });

  // Manual scaling
  fastify.post('/api/v1/monitoring/queue/scaling/scale', {
    schema: {
      body: z.object({
        targetWorkers: z.number().min(1).max(50),
        reason: z.string().default('Manual scaling'),
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            message: z.string(),
            targetWorkers: z.number(),
            reason: z.string(),
          }),
          requestId: z.string(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string(),
          timestamp: z.string()
        }),
        503: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string(),
          timestamp: z.string()
        })
      }
    },
    handler: manualScale
  });
}

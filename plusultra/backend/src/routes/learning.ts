import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import LearningAgentService, {
  UsagePattern,
  ModelPerformance,
  LearningInsight,
  FineTuneDataset
} from '../services/learning/LearningAgentService';
import { z } from 'zod';
import { usagePatternSchema, modelPerformanceSchema } from '../schemas/index';
import { v4 as uuidv4 } from 'uuid';

// Type definitions for request/response
type RecordPatternRequest = {
  userId: string;
  sessionId: string;
  timestamp: string;
  feature: string;
  action: string;
  metadata: Record<string, any>;
  outcome: 'success' | 'error' | 'partial';
  duration: number;
  tokensUsed: number;
};

type RecordPerformanceRequest = {
  model: string;
  taskType: string;
  successRate: number;
  averageTokens: number;
  averageLatency: number;
  errorRate: number;
  userSatisfaction: number;
  sampleSize: number;
};

type GetInsightsRequest = {
  type?: 'pattern' | 'improvement' | 'optimization' | 'issue';
  category?: 'code-quality' | 'user-experience' | 'performance' | 'reliability';
  minConfidence?: number;
  limit?: number;
};

type GenerateDatasetRequest = {
  model: string;
  taskType: string;
  sampleCount?: number;
};

type ExportDataRequest = {
  format?: 'json' | 'csv';
};

type CleanupRequest = {
  maxAge?: number;
};

// Error response type
interface ErrorResponse {
  error: string;
  code: string;
  requestId: string;
  timestamp: string;
  details?: any;
}

// Success response type
interface SuccessResponse<T = any> {
  success: true;
  data: T;
  requestId: string;
  timestamp: string;
}

// Helper function to create consistent error responses
const createErrorResponse = (
  reply: FastifyReply,
  error: Error,
  statusCode: number = 500,
  code: string = 'INTERNAL_SERVER_ERROR'
) => {
  const requestId = uuidv4();
  const timestamp = new Date().toISOString();

  const errorResponse: ErrorResponse = {
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
  const response: SuccessResponse<T> = {
    success: true,
    data,
    requestId: uuidv4(),
    timestamp: new Date().toISOString()
  };

  return reply.status(statusCode).send(response);
};

// Record usage pattern
const recordUsagePattern = async (
  request: FastifyRequest<{ Body: RecordPatternRequest }>,
  reply: FastifyReply
) => {
  try {
    const pattern = { ...request.body, timestamp: new Date(request.body.timestamp) };
    const learningService = new LearningAgentService();

    await learningService.recordUsagePattern(pattern as UsagePattern);

    return createSuccessResponse(reply, {
      message: 'Usage pattern recorded successfully',
      patternId: uuidv4()
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Failed to record pattern'),
      400,
      'PATTERN_RECORD_FAILED'
    );
  }
};

// Record model performance
const recordModelPerformance = async (
  request: FastifyRequest<{ Body: RecordPerformanceRequest }>,
  reply: FastifyReply
) => {
  try {
    const performance = request.body;
    const learningService = new LearningAgentService();

    await learningService.recordModelPerformance(performance as ModelPerformance);

    return createSuccessResponse(reply, {
      message: 'Model performance recorded successfully',
      model: performance.model,
      taskType: performance.taskType
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Failed to record performance'),
      400,
      'PERFORMANCE_RECORD_FAILED'
    );
  }
};

// Get learning insights
const getLearningInsights = async (
  request: FastifyRequest<{ Querystring: GetInsightsRequest }>,
  reply: FastifyReply
) => {
  try {
    const filters = request.query;
    const learningService = new LearningAgentService();

    const insights = await learningService.getLearningInsights({
      type: filters.type,
      category: filters.category,
      minConfidence: filters.minConfidence,
      limit: filters.limit
    });

    return createSuccessResponse(reply, {
      insights,
      count: insights.length,
      filters: filters
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Failed to get insights'),
      400,
      'INSIGHTS_FETCH_FAILED'
    );
  }
};

// Generate fine-tuning dataset
const generateFineTuneDataset = async (
  request: FastifyRequest<{ Body: GenerateDatasetRequest }>,
  reply: FastifyReply
) => {
  try {
    const { model, taskType, sampleCount = 1000 } = request.body;
    const learningService = new LearningAgentService();

    const dataset = await learningService.generateFineTuneDataset(model, taskType, sampleCount);

    return createSuccessResponse(reply, {
      dataset: {
        model: dataset.model,
        taskType: dataset.taskType,
        sampleCount: dataset.samples.length,
        qualityScore: dataset.metadata.qualityScore,
        version: dataset.metadata.version,
        createdAt: dataset.metadata.createdAt
      }
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Dataset generation failed'),
      400,
      'DATASET_GENERATION_FAILED'
    );
  }
};

// Get model performance summary
const getModelPerformanceSummary = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const learningService = new LearningAgentService();
    const performance = await learningService.getModelPerformanceSummary();

    return createSuccessResponse(reply, {
      performance,
      count: performance.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Failed to get performance summary'),
      400,
      'PERFORMANCE_SUMMARY_FAILED'
    );
  }
};

// Generate optimization suggestions
const generateOptimizationSuggestions = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const learningService = new LearningAgentService();
    const suggestions = await learningService.generateOptimizationSuggestions();

    return createSuccessResponse(reply, {
      suggestions,
      count: suggestions.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Failed to generate suggestions'),
      400,
      'SUGGESTIONS_GENERATION_FAILED'
    );
  }
};

// Export learning data
const exportLearningData = async (
  request: FastifyRequest<{ Body: ExportDataRequest }>,
  reply: FastifyReply
) => {
  try {
    const { format = 'json' } = request.body;
    const learningService = new LearningAgentService();

    const data = await learningService.exportLearningData(format);

    return createSuccessResponse(reply, {
      format,
      data,
      timestamp: new Date().toISOString(),
      size: JSON.stringify(data).length
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Data export failed'),
      400,
      'DATA_EXPORT_FAILED'
    );
  }
};

// Cleanup old data
const cleanupOldData = async (
  request: FastifyRequest<{ Body: CleanupRequest }>,
  reply: FastifyReply
) => {
  try {
    const { maxAge = 30 * 24 * 60 * 60 * 1000 } = request.body; // 30 days default
    const learningService = new LearningAgentService();

    await learningService.cleanupOldData(maxAge);

    return createSuccessResponse(reply, {
      message: 'Cleanup completed successfully',
      maxAge: maxAge / (24 * 60 * 60 * 1000), // Convert to days for response
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Cleanup failed'),
      400,
      'CLEANUP_FAILED'
    );
  }
};

// Get learning statistics
const getLearningStatistics = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const learningService = new LearningAgentService();

    // Get statistics from the service (assuming it has public methods to access these)
    // For now, we'll create a mock response based on the service structure
    const stats = {
      patterns: {
        total: 0, // Would come from learningService.getPatternCount()
        uniqueUsers: 0 // Would come from learningService.getUniqueUserCount()
      },
      performance: {
        models: 0 // Would come from learningService.getModelCount()
      },
      insights: {
        total: 0, // Would come from learningService.getInsightCount()
        byType: {},
        byCategory: {}
      },
      datasets: 0 // Would come from learningService.getDatasetCount()
    };

    return createSuccessResponse(reply, {
      statistics: stats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Failed to get statistics'),
      400,
      'STATISTICS_FETCH_FAILED'
    );
  }
};

export default async function learningRoutes(fastify: FastifyInstance) {
  // Record usage pattern
  fastify.post('/api/v1/learning/record-pattern', {
    schema: {
      body: usagePatternSchema,
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            message: z.string(),
            patternId: z.string().uuid()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: recordUsagePattern
  });

  // Record model performance
  fastify.post('/api/v1/learning/record-performance', {
    schema: {
      body: modelPerformanceSchema,
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            message: z.string(),
            model: z.string(),
            taskType: z.string()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string()
        })
      }
    },
    handler: recordModelPerformance
  });

  // Get learning insights
  fastify.get('/api/v1/learning/insights', {
    schema: {
      querystring: z.object({
        type: z.enum(['pattern', 'improvement', 'optimization', 'issue']).optional(),
        category: z.enum(['code-quality', 'user-experience', 'performance', 'reliability']).optional(),
        minConfidence: z.string().transform(val => parseFloat(val)).optional(),
        limit: z.string().transform(val => parseInt(val)).optional()
      }).optional(),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            insights: z.array(z.any()),
            count: z.number(),
            filters: z.any()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string()
        })
      }
    },
    handler: getLearningInsights
  });

  // Generate fine-tuning dataset
  fastify.post('/api/v1/learning/generate-dataset', {
    schema: {
      body: z.object({
        model: z.string(),
        taskType: z.string(),
        sampleCount: z.number().min(100).max(5000).optional()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            dataset: z.object({
              model: z.string(),
              taskType: z.string(),
              sampleCount: z.number(),
              qualityScore: z.number(),
              version: z.string(),
              createdAt: z.string()
            })
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string()
        })
      }
    },
    handler: generateFineTuneDataset
  });

  // Get model performance summary
  fastify.get('/api/v1/learning/performance-summary', {
    schema: {
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            performance: z.array(z.any()),
            count: z.number(),
            timestamp: z.string()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string()
        })
      }
    },
    handler: getModelPerformanceSummary
  });

  // Generate optimization suggestions
  fastify.get('/api/v1/learning/optimization-suggestions', {
    schema: {
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            suggestions: z.array(z.any()),
            count: z.number(),
            timestamp: z.string()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string()
        })
      }
    },
    handler: generateOptimizationSuggestions
  });

  // Export learning data
  fastify.post('/api/v1/learning/export', {
    schema: {
      body: z.object({
        format: z.enum(['json', 'csv']).optional()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            format: z.string(),
            data: z.any(),
            timestamp: z.string(),
            size: z.number()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string()
        })
      }
    },
    handler: exportLearningData
  });

  // Cleanup old data
  fastify.post('/api/v1/learning/cleanup', {
    schema: {
      body: z.object({
        maxAge: z.number().optional() // milliseconds
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            message: z.string(),
            maxAge: z.number(),
            timestamp: z.string()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string()
        })
      }
    },
    handler: cleanupOldData
  });

  // Get learning statistics
  fastify.get('/api/v1/learning/statistics', {
    schema: {
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            statistics: z.object({
              patterns: z.object({
                total: z.number(),
                uniqueUsers: z.number()
              }),
              performance: z.object({
                models: z.number()
              }),
              insights: z.object({
                total: z.number(),
                byType: z.record(z.number()),
                byCategory: z.record(z.number())
              }),
              datasets: z.number()
            }),
            timestamp: z.string()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string()
        })
      }
    },
    handler: getLearningStatistics
  });
}

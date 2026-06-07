import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { modelVotingTelemetry } from '../../services/ai/ModelVotingTelemetry';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

// Request/Response types
interface GetAnalyticsRequest {
  startDate?: string;
  endDate?: string;
}

interface GetTaskTypeAnalyticsRequest {
  taskType: 'code_generation' | 'app_design' | 'project_planning' | 'debugging' | 'optimization';
  startDate?: string;
  endDate?: string;
}

interface GetUnderperformingRequest {
  minMonths?: number;
  minWinRate?: number;
}

interface CalculateSavingsRequest {
  model: 'claude' | 'gpt5' | 'gemini' | 'grok' | 'deepseek';
  monthlyVolume: number;
}

// Error response type
interface ErrorResponse {
  error: string;
  code: string;
  requestId: string;
  timestamp: string;
}

// Success response type
interface SuccessResponse<T = any> {
  success: true;
  data: T;
  requestId: string;
  timestamp: string;
}

// Helper function to create error responses
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
    timestamp,
  };

  console.error(`[${timestamp}] [${requestId}] Error:`, error);
  return reply.status(statusCode).send(errorResponse);
};

// Helper function to create success responses
const createSuccessResponse = <T>(reply: FastifyReply, data: T, statusCode: number = 200) => {
  const response: SuccessResponse<T> = {
    success: true,
    data,
    requestId: uuidv4(),
    timestamp: new Date().toISOString(),
  };

  return reply.status(statusCode).send(response);
};

export async function modelTelemetryRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/v1/ai/telemetry/analytics
   * Get comprehensive model voting analytics
   */
  fastify.get<{ Querystring: GetAnalyticsRequest }>(
    '/api/v1/ai/telemetry/analytics',
    {
      schema: {
        querystring: z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      try {
        const { startDate, endDate } = request.query;

        const start = startDate ? new Date(startDate) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000); // Default: 90 days ago
        const end = endDate ? new Date(endDate) : new Date();

        const analytics = await modelVotingTelemetry.getAnalytics(start, end);

        return createSuccessResponse(reply, analytics);
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to get analytics'),
          400,
          'ANALYTICS_FETCH_FAILED'
        );
      }
    }
  );

  /**
   * GET /api/v1/ai/telemetry/task-type/:taskType
   * Get win rates for specific task type
   */
  fastify.get<{ Params: { taskType: string }; Querystring: Omit<GetTaskTypeAnalyticsRequest, 'taskType'> }>(
    '/api/v1/ai/telemetry/task-type/:taskType',
    {
      schema: {
        params: z.object({
          taskType: z.enum(['code_generation', 'app_design', 'project_planning', 'debugging', 'optimization']),
        }),
        querystring: z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      try {
        const { taskType } = request.params;
        const { startDate, endDate } = request.query;

        const start = startDate ? new Date(startDate) : new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
        const end = endDate ? new Date(endDate) : new Date();

        const data = await modelVotingTelemetry.getModelWinRateByTaskType(
          taskType as any,
          start,
          end
        );

        return createSuccessResponse(reply, data);
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to get task type analytics'),
          400,
          'TASK_TYPE_ANALYTICS_FAILED'
        );
      }
    }
  );

  /**
   * GET /api/v1/ai/telemetry/underperforming
   * Identify models that rarely win votes
   */
  fastify.get<{ Querystring: GetUnderperformingRequest }>(
    '/api/v1/ai/telemetry/underperforming',
    {
      schema: {
        querystring: z.object({
          minMonths: z.number().optional(),
          minWinRate: z.number().optional(),
        }),
      },
    },
    async (request, reply) => {
      try {
        const { minMonths = 3, minWinRate = 0.15 } = request.query;

        const result = await modelVotingTelemetry.identifyUnderperformingModels(
          minMonths,
          minWinRate
        );

        return createSuccessResponse(reply, result);
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to identify underperforming models'),
          400,
          'UNDERPERFORMING_CHECK_FAILED'
        );
      }
    }
  );

  /**
   * POST /api/v1/ai/telemetry/cost-savings
   * Calculate cost savings from dropping a model
   */
  fastify.post<{ Body: CalculateSavingsRequest }>(
    '/api/v1/ai/telemetry/cost-savings',
    {
      schema: {
        body: z.object({
          model: z.enum(['claude', 'gpt5', 'gemini', 'grok', 'deepseek']),
          monthlyVolume: z.number().positive(),
        }),
      },
    },
    async (request, reply) => {
      try {
        const { model, monthlyVolume } = request.body;

        const savings = modelVotingTelemetry.calculateCostSavings(model, monthlyVolume);

        return createSuccessResponse(reply, savings);
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to calculate cost savings'),
          400,
          'COST_CALCULATION_FAILED'
        );
      }
    }
  );

  /**
   * GET /api/v1/ai/telemetry/recommendations
   * Get task-specific model recommendations
   */
  fastify.get(
    '/api/v1/ai/telemetry/recommendations',
    async (request, reply) => {
      try {
        const recommendations = await modelVotingTelemetry.getTaskSpecificRecommendations();

        return createSuccessResponse(reply, recommendations);
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to get recommendations'),
          400,
          'RECOMMENDATIONS_FETCH_FAILED'
        );
      }
    }
  );
}

export default modelTelemetryRoutes;

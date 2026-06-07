import { UserRole } from '../../lib/auth';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { modelQuarantine } from '../../services/ai/ModelQuarantineService';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

// Request/Response types
interface GetConfidenceLogsRequest {
  startDate?: string;
  endDate?: string;
  limit?: number;
}

interface AdminReleaseRequest {
  model: 'claude' | 'gpt5' | 'gemini' | 'grok' | 'deepseek';
}

interface GetModelStatsRequest {
  model: 'claude' | 'gpt5' | 'gemini' | 'grok' | 'deepseek';
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

// In-memory confidence log store (in production, this should be in a database)
const confidenceLogs: any[] = [];

export async function confidenceQuarantineRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/v1/ai/confidence/logs
   * Get confidence vote logs for recent orchestrations
   */
  fastify.get<{ Querystring: GetConfidenceLogsRequest }>(
    '/api/v1/ai/confidence/logs',
    {
      schema: {
        querystring: z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
          limit: z.number().optional(),
        }),
      },
    },
    async (request, reply) => {
      try {
        const { startDate, endDate, limit = 50 } = request.query;

        // Filter logs by date range
        let filteredLogs = confidenceLogs;

        if (startDate) {
          const start = new Date(startDate);
          filteredLogs = filteredLogs.filter((log) => new Date(log.timestamp) >= start);
        }

        if (endDate) {
          const end = new Date(endDate);
          filteredLogs = filteredLogs.filter((log) => new Date(log.timestamp) <= end);
        }

        // Sort by timestamp (most recent first) and limit
        const logs = filteredLogs
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
          .slice(0, limit);

        return createSuccessResponse(reply, logs);
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to get confidence logs'),
          400,
          'CONFIDENCE_LOGS_FETCH_FAILED'
        );
      }
    }
  );

  /**
   * GET /api/v1/ai/quarantine/summary
   * Get quarantine status for all models
   */
  fastify.get(
    '/api/v1/ai/quarantine/summary',
    async (request, reply) => {
      try {
        const summary = modelQuarantine.getQuarantineSummary();

        return createSuccessResponse(reply, summary);
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to get quarantine summary'),
          400,
          'QUARANTINE_SUMMARY_FAILED'
        );
      }
    }
  );

  /**
   * GET /api/v1/ai/quarantine/active
   * Get list of currently quarantined models
   */
  fastify.get(
    '/api/v1/ai/quarantine/active',
    async (request, reply) => {
      try {
        const activeQuarantines = modelQuarantine.getActiveQuarantines();

        return createSuccessResponse(reply, { activeQuarantines });
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to get active quarantines'),
          400,
          'ACTIVE_QUARANTINES_FAILED'
        );
      }
    }
  );

  /**
   * GET /api/v1/ai/quarantine/history
   * Get all quarantine records (for admin dashboard)
   */
  fastify.get(
    '/api/v1/ai/quarantine/history',
    async (request, reply) => {
      try {
        const records = modelQuarantine.getAllQuarantineRecords();

        return createSuccessResponse(reply, { records });
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to get quarantine history'),
          400,
          'QUARANTINE_HISTORY_FAILED'
        );
      }
    }
  );

  /**
   * POST /api/v1/ai/quarantine/release
   * Manually release a model from quarantine (admin only)
   */
  fastify.post<{ Body: AdminReleaseRequest }>(
    '/api/v1/ai/quarantine/release',
    {
      preHandler: [fastify.authenticate, async (request, reply) => {
        if (!request.user || request.user.role !== UserRole.ADMIN) {
          return reply.code(403).send({ error: 'Forbidden', message: 'Admin access required' });
        }
      }],
      schema: {
        body: z.object({
          model: z.enum(['claude', 'gpt5', 'gemini', 'grok', 'deepseek']),
        }),
      },
    },
    async (request, reply) => {
      try {
        const { model } = request.body;
        const released = modelQuarantine.releaseFromQuarantine(model);

        if (!released) {
          return reply.status(404).send({
            error: `Model ${model} is not in quarantine`,
            code: 'MODEL_NOT_QUARANTINED',
            requestId: uuidv4(),
            timestamp: new Date().toISOString(),
          });
        }

        return createSuccessResponse(reply, {
          message: `Model ${model} has been released from quarantine`,
          model,
        });
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to release model'),
          400,
          'QUARANTINE_RELEASE_FAILED'
        );
      }
    }
  );

  /**
   * GET /api/v1/ai/quarantine/model/:model/stats
   * Get performance statistics for a specific model
   */
  fastify.get<{ Params: GetModelStatsRequest }>(
    '/api/v1/ai/quarantine/model/:model/stats',
    {
      schema: {
        params: z.object({
          model: z.enum(['claude', 'gpt5', 'gemini', 'grok', 'deepseek']),
        }),
      },
    },
    async (request, reply) => {
      try {
        const { model } = request.params;

        const stats = modelQuarantine.getModelStats(model);

        return createSuccessResponse(reply, { model, stats });
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to get model stats'),
          400,
          'MODEL_STATS_FAILED'
        );
      }
    }
  );

  /**
   * GET /api/v1/ai/quarantine/model/:model/history
   * Get quarantine history for a specific model
   */
  fastify.get<{ Params: GetModelStatsRequest }>(
    '/api/v1/ai/quarantine/model/:model/history',
    {
      schema: {
        params: z.object({
          model: z.enum(['claude', 'gpt5', 'gemini', 'grok', 'deepseek']),
        }),
      },
    },
    async (request, reply) => {
      try {
        const { model } = request.params;

        const history = modelQuarantine.getModelQuarantineHistory(model);

        return createSuccessResponse(reply, {
          model,
          history: history || null,
        });
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to get model quarantine history'),
          400,
          'MODEL_HISTORY_FAILED'
        );
      }
    }
  );
}

// Helper function to log confidence from orchestrator
export function logConfidenceResult(log: any) {
  confidenceLogs.push({
    id: uuidv4(),
    timestamp: new Date().toISOString(),
    ...log,
  });

  // Keep only last 1000 logs in memory
  if (confidenceLogs.length > 1000) {
    confidenceLogs.shift();
  }
}

export default confidenceQuarantineRoutes;

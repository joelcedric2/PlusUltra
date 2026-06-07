import { FastifyInstance, FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { TokenManagementService } from '../services/token/TokenManagementService';
import { TokenDatabaseMigrations } from '../services/token/TokenDatabaseMigrations';
import { v4 as uuidv4 } from 'uuid';

// Type definitions for request/response
type GetTokenPoolRequest = {
  userId: string;
  workspaceId?: string;
};

type GetTokenUsageRequest = {
  userId: string;
  workspaceId?: string;
  days?: number;
};

type GetTokenAlertsRequest = {
  userId: string;
  workspaceId?: string;
};

type GetCostEstimatesRequest = {};

type GetTiersRequest = {};

type RecordUsageRequest = {
  userId: string;
  workspaceId?: string;
  sessionId: string;
  feature: string;
  requests: Array<{
    model: 'GPT5' | 'Claude' | 'Gemini' | 'StarCoder';
    complexity: 'low' | 'medium' | 'high';
    tokens?: number;
  }>;
};

type UpgradeTierRequest = {
  userId: string;
  workspaceId?: string;
  newTier: 'free' | 'starter' | 'pro' | 'enterprise';
};

type PurchaseTokensRequest = {
  userId: string;
  workspaceId?: string;
  tokensToPurchase: number;
};

type MarkAlertsReadRequest = {
  userId: string;
  workspaceId?: string;
};

type ResetPoolsRequest = {};

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

// Get user's token pool
const getTokenPool = async (
  request: FastifyRequest<{ Querystring: GetTokenPoolRequest }>,
  reply: FastifyReply
) => {
  try {
    const { userId, workspaceId } = request.query;

    if (!userId) {
      return createErrorResponse(
        reply,
        new Error('userId is required'),
        400,
        'MISSING_USER_ID'
      );
    }

    const tokenDb = new TokenDatabaseMigrations();
    const pool = await tokenDb.getTokenPool(userId, workspaceId);

    return createSuccessResponse(reply, {
      userId: pool.user_id,
      workspaceId: pool.workspace_id,
      tier: pool.tier,
      monthlyTokens: pool.monthly_tokens,
      usedTokens: pool.used_tokens,
      availableTokens: pool.monthly_tokens - pool.used_tokens,
      resetDate: pool.reset_date,
      rolloverTokens: pool.rollover_tokens
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Failed to get token pool'),
      400,
      'TOKEN_POOL_FETCH_FAILED'
    );
  }
};

// Get token usage statistics
const getTokenUsage = async (
  request: FastifyRequest<{ Querystring: GetTokenUsageRequest }>,
  reply: FastifyReply
) => {
  try {
    const { userId, workspaceId, days = 30 } = request.query;

    if (!userId) {
      return createErrorResponse(
        reply,
        new Error('userId is required'),
        400,
        'MISSING_USER_ID'
      );
    }

    const tokenDb = new TokenDatabaseMigrations();
    const stats = await tokenDb.getTokenStats(userId, workspaceId, days);

    return createSuccessResponse(reply, {
      totalTokens: parseInt(stats.total_tokens) || 0,
      totalCost: parseFloat(stats.total_cost) || 0,
      usageCount: parseInt(stats.total_usages) || 0,
      averageTokensPerUsage: parseFloat(stats.avg_tokens_per_usage) || 0,
      agentBreakdown: stats.agent_breakdown || [],
      featureBreakdown: [], // Would need additional query
      periodDays: stats.period_days || days
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Failed to get token usage'),
      400,
      'TOKEN_USAGE_FETCH_FAILED'
    );
  }
};

// Get token alerts
const getTokenAlerts = async (
  request: FastifyRequest<{ Querystring: GetTokenAlertsRequest }>,
  reply: FastifyReply
) => {
  try {
    const { userId, workspaceId } = request.query;

    if (!userId) {
      return createErrorResponse(
        reply,
        new Error('userId is required'),
        400,
        'MISSING_USER_ID'
      );
    }

    const tokenDb = new TokenDatabaseMigrations();
    const alerts = await tokenDb.getTokenAlerts(userId, workspaceId);

    return createSuccessResponse(reply, {
      alerts: alerts.map(alert => ({
        id: alert.id,
        type: alert.alert_type,
        message: alert.message,
        thresholdPercentage: alert.threshold_percentage,
        currentUsage: alert.current_usage,
        createdAt: alert.created_at
      }))
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Failed to get token alerts'),
      400,
      'TOKEN_ALERTS_FETCH_FAILED'
    );
  }
};

// Get feature cost estimates
const getCostEstimates = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const tokenService = new TokenManagementService();
    const estimates = tokenService.getFeatureCostEstimates();

    return createSuccessResponse(reply, estimates);
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Failed to get cost estimates'),
      400,
      'COST_ESTIMATES_FETCH_FAILED'
    );
  }
};

// Get available tiers
const getTiers = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const tokenService = new TokenManagementService();
    const tiers = tokenService.getTierInfo();

    return createSuccessResponse(reply, tiers);
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Failed to get tiers'),
      400,
      'TIERS_FETCH_FAILED'
    );
  }
};

// Record token usage
const recordTokenUsage = async (
  request: FastifyRequest<{ Body: RecordUsageRequest }>,
  reply: FastifyReply
) => {
  try {
    const { userId, workspaceId, sessionId, feature, requests } = request.body;

    if (!userId || !sessionId || !feature || !requests) {
      return createErrorResponse(
        reply,
        new Error('Missing required fields'),
        400,
        'MISSING_REQUIRED_FIELDS'
      );
    }

    const tokenService = new TokenManagementService();
    const tokenDb = new TokenDatabaseMigrations();

    // Calculate total tokens
    const totalTokens = tokenService.calculateWorkflowCost(
      requests.map(r => ({
        model: r.model as any,
        complexity: r.complexity as any,
        tokens: r.tokens
      })),
      feature
    );

    // Check if user has enough tokens
    const canUse = await tokenService.canPerformAction(userId, totalTokens, workspaceId);
    if (!canUse) {
      return reply.status(402).send({
        success: false,
        error: 'Insufficient tokens',
        required: totalTokens,
        requestId: uuidv4(),
        timestamp: new Date().toISOString()
      });
    }

    // Record usage for each request
    for (const req of requests) {
      await tokenDb.recordTokenUsage(
        userId,
        workspaceId,
        req.tokens || tokenService.calculateRequestCost({
          model: req.model as any,
          complexity: req.complexity as any
        }),
        feature,
        req.model,
        sessionId
      );
    }

    // Get updated pool
    const updatedPool = await tokenDb.getTokenPool(userId, workspaceId);

    return createSuccessResponse(reply, {
      totalTokens,
      remainingTokens: updatedPool.monthly_tokens - updatedPool.used_tokens,
      userId,
      workspaceId,
      feature,
      requestCount: requests.length
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Failed to record token usage'),
      400,
      'TOKEN_USAGE_RECORD_FAILED'
    );
  }
};

// Upgrade user tier
const upgradeTier = async (
  request: FastifyRequest<{ Body: UpgradeTierRequest }>,
  reply: FastifyReply
) => {
  try {
    const { userId, workspaceId, newTier } = request.body;

    if (!userId || !newTier) {
      return createErrorResponse(
        reply,
        new Error('Missing required fields'),
        400,
        'MISSING_REQUIRED_FIELDS'
      );
    }

    const tokenService = new TokenManagementService();
    const updatedPool = await tokenService.upgradeTier(userId, newTier, workspaceId);

    return createSuccessResponse(reply, {
      newTier,
      newTokenPool: updatedPool.monthlyTokens,
      userId,
      workspaceId
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Failed to upgrade tier'),
      400,
      'TIER_UPGRADE_FAILED'
    );
  }
};

// Purchase additional tokens
const purchaseTokens = async (
  request: FastifyRequest<{ Body: PurchaseTokensRequest }>,
  reply: FastifyReply
) => {
  try {
    const { userId, workspaceId, tokensToPurchase } = request.body;

    if (!userId || !tokensToPurchase || tokensToPurchase <= 0) {
      return createErrorResponse(
        reply,
        new Error('Invalid token purchase amount'),
        400,
        'INVALID_PURCHASE_AMOUNT'
      );
    }

    const tokenService = new TokenManagementService();

    // Calculate cost ($0.002 per token)
    const cost = tokensToPurchase * 0.002;

    const updatedPool = await tokenService.purchaseTokens(userId, tokensToPurchase, workspaceId);

    return createSuccessResponse(reply, {
      newTokenPool: updatedPool.monthlyTokens,
      cost,
      tokensPurchased: tokensToPurchase,
      userId,
      workspaceId
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Failed to purchase tokens'),
      400,
      'TOKEN_PURCHASE_FAILED'
    );
  }
};

// Mark alerts as read
const markAlertsRead = async (
  request: FastifyRequest<{ Body: MarkAlertsReadRequest }>,
  reply: FastifyReply
) => {
  try {
    const { userId, workspaceId } = request.body;

    if (!userId) {
      return createErrorResponse(
        reply,
        new Error('userId is required'),
        400,
        'MISSING_USER_ID'
      );
    }

    const tokenDb = new TokenDatabaseMigrations();
    await tokenDb.markAlertsAsRead(userId, workspaceId);

    return createSuccessResponse(reply, {
      alertsMarked: 'all',
      userId,
      workspaceId
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Failed to mark alerts as read'),
      400,
      'ALERTS_MARK_READ_FAILED'
    );
  }
};

// Reset monthly tokens (admin function)
const resetTokenPools = async (
  request: FastifyRequest<{ Body: ResetPoolsRequest }>,
  reply: FastifyReply
) => {
  try {
    const tokenDb = new TokenDatabaseMigrations();
    await tokenDb.resetMonthlyTokens();

    return createSuccessResponse(reply, {
      message: 'Token pools reset successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Failed to reset token pools'),
      400,
      'TOKEN_POOL_RESET_FAILED'
    );
  }
};

export const tokenRoutes: FastifyPluginAsync = async (fastify) => {
  const tokenService = new TokenManagementService();
  const tokenDb = new TokenDatabaseMigrations();

  // Initialize token database tables
  await tokenDb.createTokenTables();

  // GET /api/v1/tokens/pool - Get user's token pool
  fastify.get('/api/v1/tokens/pool', {
    schema: {
      querystring: z.object({
        userId: z.string(),
        workspaceId: z.string().optional()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            userId: z.string(),
            workspaceId: z.string().optional(),
            tier: z.string(),
            monthlyTokens: z.number(),
            usedTokens: z.number(),
            availableTokens: z.number(),
            resetDate: z.string(),
            rolloverTokens: z.number()
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
    handler: getTokenPool
  });

  // GET /api/v1/tokens/usage - Get token usage statistics
  fastify.get('/api/v1/tokens/usage', {
    schema: {
      querystring: z.object({
        userId: z.string(),
        workspaceId: z.string().optional(),
        days: z.number().optional()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            totalTokens: z.number(),
            totalCost: z.number(),
            usageCount: z.number(),
            averageTokensPerUsage: z.number(),
            agentBreakdown: z.array(z.object({
              agent: z.string(),
              tokens: z.number()
            })),
            featureBreakdown: z.array(z.object({
              feature: z.string(),
              tokens: z.number()
            })),
            periodDays: z.number()
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
    handler: getTokenUsage
  });

  // GET /api/v1/tokens/alerts - Get token alerts
  fastify.get('/api/v1/tokens/alerts', {
    schema: {
      querystring: z.object({
        userId: z.string(),
        workspaceId: z.string().optional()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            alerts: z.array(z.object({
              id: z.string(),
              type: z.string(),
              message: z.string(),
              thresholdPercentage: z.number(),
              currentUsage: z.number(),
              createdAt: z.string()
            }))
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
    handler: getTokenAlerts
  });

  // GET /api/v1/tokens/cost-estimates - Get feature cost estimates
  fastify.get('/api/v1/tokens/cost-estimates', {
    schema: {
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.record(z.object({
            min: z.number(),
            max: z.number(),
            typical: z.number()
          })),
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
    handler: getCostEstimates
  });

  // GET /api/v1/tokens/tiers - Get available tiers
  fastify.get('/api/v1/tokens/tiers', {
    schema: {
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.record(z.object({
            monthlyTokens: z.number(),
            price: z.number(),
            features: z.array(z.string())
          })),
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
    handler: getTiers
  });

  // POST /api/v1/tokens/record-usage - Record token usage
  fastify.post('/api/v1/tokens/record-usage', {
    schema: {
      body: z.object({
        userId: z.string(),
        workspaceId: z.string().optional(),
        sessionId: z.string(),
        feature: z.string(),
        requests: z.array(z.object({
          model: z.enum(['GPT5', 'Claude', 'Gemini', 'StarCoder']),
          complexity: z.enum(['low', 'medium', 'high']),
          tokens: z.number().optional()
        }))
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            totalTokens: z.number(),
            remainingTokens: z.number(),
            userId: z.string(),
            workspaceId: z.string().optional(),
            feature: z.string(),
            requestCount: z.number()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        402: z.object({
          success: z.literal(false),
          error: z.string(),
          required: z.number(),
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
    handler: recordTokenUsage
  });

  // POST /api/v1/tokens/upgrade-tier - Upgrade user tier
  fastify.post('/api/v1/tokens/upgrade-tier', {
    schema: {
      body: z.object({
        userId: z.string(),
        workspaceId: z.string().optional(),
        newTier: z.enum(['free', 'starter', 'pro', 'enterprise'])
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            newTier: z.string(),
            newTokenPool: z.number(),
            userId: z.string(),
            workspaceId: z.string().optional()
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
    handler: upgradeTier
  });

  // POST /api/v1/tokens/purchase - Purchase additional tokens
  fastify.post('/api/v1/tokens/purchase', {
    schema: {
      body: z.object({
        userId: z.string(),
        workspaceId: z.string().optional(),
        tokensToPurchase: z.number().positive()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            newTokenPool: z.number(),
            cost: z.number(),
            tokensPurchased: z.number(),
            userId: z.string(),
            workspaceId: z.string().optional()
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
    handler: purchaseTokens
  });

  // POST /api/v1/tokens/mark-alerts-read - Mark alerts as read
  fastify.post('/api/v1/tokens/mark-alerts-read', {
    schema: {
      body: z.object({
        userId: z.string(),
        workspaceId: z.string().optional()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            alertsMarked: z.string(),
            userId: z.string(),
            workspaceId: z.string().optional()
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
    handler: markAlertsRead
  });

  // POST /api/v1/tokens/admin/reset-pools - Reset monthly tokens (admin function)
  fastify.post('/api/v1/tokens/admin/reset-pools', {
    schema: {
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            message: z.string(),
            timestamp: z.string()
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
    handler: resetTokenPools
  });
};

export default tokenRoutes;

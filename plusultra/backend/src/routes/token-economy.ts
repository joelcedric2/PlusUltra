import '../types/fastify';
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import TokenEconomyService from '../services/token/TokenEconomyService';
import { TokenEstimate } from '../services/token/TokenEconomyService';
import Stripe from 'stripe';
import { v4 as uuidv4 } from 'uuid';
import { UserRole } from '../lib/auth'; // Import UserRole
// --- Zod Schemas for Production-Grade Request Validation ---

const estimateTokensSchema = z.object({
  workflow: z.string(),
  complexity: z.enum(['low', 'medium', 'high']).optional()
});

const recordUsageSchema = z.object({
  ownerId: z.string(),
  ownerType: z.enum(['user', 'workspace']),
  tokens: z.number().positive(),
  agent: z.string().optional(),
  feature: z.string().optional(),
  workflowId: z.string().optional(),
  workflowType: z.string().optional()
});

const topupSchema = z.object({
  ownerId: z.string(),
  ownerType: z.enum(['user', 'workspace']),
  tokenAmount: z.number().positive(),
  paymentMethodId: z.string().optional()
});

const toggleAutoTopupSchema = z.object({
  enabled: z.boolean(),
  ownerId: z.string().optional(),
  ownerType: z.enum(['user', 'workspace']).optional()
});

const creditTokensSchema = z.object({
  ownerId: z.string(),
  ownerType: z.enum(['user', 'workspace']),
  tokens: z.number().positive(),
  reason: z.string(),
  adminId: z.string()
});

const checkOperationSchema = z.object({
  ownerId: z.string().optional(),
  ownerType: z.enum(['user', 'workspace']).optional(),
  workflowType: z.string(),
  complexity: z.enum(['low', 'medium', 'high']).optional()
});

// Type definitions for request/response
type GetBillingStatusRequest = {
  ownerId?: string;
  ownerType?: 'user' | 'workspace';
};

type EstimateTokensRequest = {
  workflow: string;
  complexity?: 'low' | 'medium' | 'high';
};

type RecordUsageRequest = {
  ownerId: string;
  ownerType: 'user' | 'workspace';
  tokens: number;
  agent?: string;
  feature?: string;
  workflowId?: string;
  workflowType?: string;
};

type TopupRequest = {
  ownerId: string;
  ownerType: 'user' | 'workspace';
  tokenAmount: number;
  paymentMethodId?: string;
};

type ToggleAutoTopupRequest = {
  enabled: boolean;
  ownerId?: string;
  ownerType?: 'user' | 'workspace';
};

type CreditTokensRequest = {
  ownerId: string;
  ownerType: 'user' | 'workspace';
  tokens: number;
  reason: string;
  adminId: string;
};

type CheckOperationRequest = {
  ownerId?: string;
  ownerType?: 'user' | 'workspace';
  workflowType: string;
  complexity?: 'low' | 'medium' | 'high';
};

type StripeWebhookRequest = {
  type: string;
  data: {
    object: any;
  };
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

// Get billing status
const getBillingStatus = async (
  request: FastifyRequest<{ Querystring: GetBillingStatusRequest }>,
  reply: FastifyReply
) => {
  try {
    const { ownerId, ownerType = 'user' } = request.query;

    // In a real app, get owner from authenticated user/workspace
    const resolvedOwnerId = ownerId || (request as any).user?.id || (request as any).workspace?.id;
    const resolvedOwnerType = ownerType || ((request as any).workspace ? 'workspace' : 'user');

    if (!resolvedOwnerId) {
      return createErrorResponse(
        reply,
        new Error('Owner ID required'),
        400,
        'MISSING_OWNER_ID'
      );
    }

    const tokenService = new TokenEconomyService((request.server as any).prisma);
    const status = await tokenService.getBillingStatus(resolvedOwnerId, resolvedOwnerType);

    if (!status) {
      return createErrorResponse(
        reply,
        new Error('No active subscription found'),
        404,
        'NO_ACTIVE_SUBSCRIPTION'
      );
    }

    return createSuccessResponse(reply, {
      billing: status,
      ownerId: resolvedOwnerId,
      ownerType: resolvedOwnerType
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Failed to get billing status'),
      400,
      'BILLING_STATUS_FAILED'
    );
  }
};

// Estimate tokens for a workflow
const estimateTokens = async (
  request: FastifyRequest<{ Body: EstimateTokensRequest }>,
  reply: FastifyReply
) => {
  try {
    const { workflow, complexity = 'medium' } = request.body;

    const tokenService = new TokenEconomyService((request.server as any).prisma);
    const estimate = await tokenService.estimateTokens(workflow, complexity);

    return createSuccessResponse(reply, {
      estimate,
      workflow,
      complexity
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Estimation failed'),
      400,
      'ESTIMATION_FAILED'
    );
  }
};

// Record token usage (atomic consumption)
const recordTokenUsage = async (
  request: FastifyRequest<{ Body: RecordUsageRequest }>,
  reply: FastifyReply
) => {
  try {
    const usageData = request.body;

    const tokenService = new TokenEconomyService((request.server as any).prisma);
    const result = await tokenService.consumeTokens(
      usageData.ownerId,
      usageData.ownerType,
      usageData.tokens,
      {
        agent: usageData.agent,
        feature: usageData.feature,
        workflowId: usageData.workflowId,
        workflowType: usageData.workflowType
      }
    );

    if (!result.success) {
      return reply.status(402).send({
        success: false,
        blocked: result.blocked,
        reason: result.reason,
        actions: result.actions,
        estimated: result.estimated,
        tokensRemaining: result.tokensRemaining,
        requestId: uuidv4(),
        timestamp: new Date().toISOString()
      });
    }

    return createSuccessResponse(reply, {
      consumption: result,
      ownerId: usageData.ownerId,
      ownerType: usageData.ownerType,
      tokensConsumed: usageData.tokens
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Token consumption failed'),
      400,
      'TOKEN_CONSUMPTION_FAILED'
    );
  }
};

// Create token top-up payment intent
const createTopup = async (
  request: FastifyRequest<{ Body: TopupRequest }>,
  reply: FastifyReply
) => {
  try {
    const { ownerId, ownerType, tokenAmount, paymentMethodId } = request.body;

    // Calculate price (simplified - you'd want dynamic pricing)
    const pricePerToken = 0.0001; // $0.0001 per token
    const amountCents = Math.round(tokenAmount * pricePerToken * 100);

    // Create Stripe PaymentIntent
    const paymentIntent = await (request.server as any).stripe.paymentIntents.create({
      amount: amountCents,
      currency: 'usd',
      metadata: {
        ownerId,
        ownerType,
        tokenAmount: tokenAmount.toString(),
        purchaseType: 'topup'
      },
      automatic_payment_methods: {
        enabled: true,
      },
      ...(paymentMethodId && { payment_method: paymentMethodId })
    });

    return createSuccessResponse(reply, {
      paymentIntent: {
        id: paymentIntent.id,
        clientSecret: paymentIntent.client_secret,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency
      },
      ownerId,
      ownerType,
      tokenAmount
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Top-up creation failed'),
      400,
      'TOPUP_CREATION_FAILED'
    );
  }
};

// Toggle auto-topup
const toggleAutoTopup = async (
  request: FastifyRequest<{ Body: ToggleAutoTopupRequest }>,
  reply: FastifyReply
) => {
  try {
    const { enabled, ownerId, ownerType = 'user' } = request.body;

    // In real app, get from authenticated user/workspace
    const resolvedOwnerId = ownerId || (request as any).user?.id || (request as any).workspace?.id;
    const resolvedOwnerType = ownerType || ((request as any).workspace ? 'workspace' : 'user');

    if (!resolvedOwnerId) {
      return createErrorResponse(
        reply,
        new Error('Owner ID required'),
        400,
        'MISSING_OWNER_ID'
      );
    }

    // Find current subscription
    const subscription = await (request.server as any).prisma.subscription.findFirst({
      where: {
        OR: [
          { userId: resolvedOwnerId },
          { workspaceId: resolvedOwnerId }
        ],
        status: 'active'
      }
    });

    if (!subscription) {
      return createErrorResponse(
        reply,
        new Error('No active subscription found'),
        404,
        'NO_ACTIVE_SUBSCRIPTION'
      );
    }

    // Update auto-topup setting
    await (request.server as any).prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        autoTopupEnabled: enabled,
        updatedAt: new Date()
      }
    });

    return createSuccessResponse(reply, {
      autoTopup: enabled,
      ownerId: resolvedOwnerId,
      ownerType: resolvedOwnerType
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Auto-topup toggle failed'),
      400,
      'AUTO_TOPUP_TOGGLE_FAILED'
    );
  }
};

// Admin: Credit tokens
const creditTokens = async (
  request: FastifyRequest<{ Body: CreditTokensRequest }>,
  reply: FastifyReply
) => {
  try {
    if (!request.user || request.user.role !== UserRole.ADMIN) {
      return reply.code(403).send({ error: 'Forbidden', message: 'Admin access required' });
    }

    const { ownerId, ownerType, tokens, reason, adminId } = request.body;

    const tokenService = new TokenEconomyService((request.server as any).prisma);
    await tokenService.creditTokens(ownerId, ownerType, tokens, adminId, reason);

    return createSuccessResponse(reply, {
      message: `Credited ${tokens} tokens to ${ownerType} ${ownerId}`,
      ownerId,
      ownerType,
      tokens,
      reason,
      adminId
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Token credit failed'),
      400,
      'TOKEN_CREDIT_FAILED'
    );
  }
};

// Check if operation should be blocked
const checkOperation = async (
  request: FastifyRequest<{ Body: CheckOperationRequest }>,
  reply: FastifyReply
) => {
  try {
    const { ownerId, ownerType = 'user', workflowType, complexity = 'medium' } = request.body;

    // In real app, get from authenticated user/workspace
    const resolvedOwnerId = ownerId || (request as any).user?.id || (request as any).workspace?.id;
    const resolvedOwnerType = ownerType || ((request as any).workspace ? 'workspace' : 'user');

    if (!resolvedOwnerId) {
      return createErrorResponse(
        reply,
        new Error('Owner ID required'),
        400,
        'MISSING_OWNER_ID'
      );
    }

    const tokenService = new TokenEconomyService((request.server as any).prisma);
    const check = await tokenService.shouldBlockOperation(
      resolvedOwnerId,
      resolvedOwnerType,
      workflowType,
      complexity
    );

    return createSuccessResponse(reply, {
      check,
      ownerId: resolvedOwnerId,
      ownerType: resolvedOwnerType,
      workflowType,
      complexity
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Operation check failed'),
      400,
      'OPERATION_CHECK_FAILED'
    );
  }
};

export default async function tokenEconomyRoutes(fastify: FastifyInstance) {
  // Webhook handlers (moved inside main function for proper scope)
  async function handleInvoicePaid(fastify: FastifyInstance, invoice: any) {
    // Find subscription by Stripe ID
    const subscription = await fastify.prisma.subscription.findUnique({
      where: { stripeSubscriptionId: invoice.subscription }
    });

    if (!subscription) {
      console.error(`Subscription not found for Stripe ID: ${invoice.subscription}`);
      return;
    }

    // Update subscription status
    await fastify.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'active',
        currentPeriodStart: new Date(invoice.period_start * 1000),
        currentPeriodEnd: new Date(invoice.period_end * 1000),
        updatedAt: new Date()
      }
    });

    // Provision new token pool for the billing period
    const tokenService = new TokenEconomyService(fastify.prisma);
    const plan = await fastify.prisma.plan.findUnique({
      where: { id: subscription.planId }
    });

    if (plan && subscription.userId) {
      await tokenService.provisionTokenPool(
        subscription.id,
        subscription.userId,
        'user',
        new Date(invoice.period_start * 1000),
        new Date(invoice.period_end * 1000),
        plan.tokenPool
      );
    }
  }

  async function handleInvoiceFailed(fastify: FastifyInstance, invoice: any) {
    const subscription = await fastify.prisma.subscription.findUnique({
      where: { stripeSubscriptionId: invoice.subscription }
    });

    if (subscription) {
      const graceExpiresAt = new Date(Date.now() + (subscription.gracePeriodDays * 24 * 60 * 60 * 1000));

      await fastify.prisma.subscription.update({
        where: { id: subscription.id },
        data: {
          status: 'past_due',
          graceExpiresAt,
          updatedAt: new Date()
        }
      });
    }
  }

  async function handleSubscriptionUpdated(fastify: FastifyInstance, subscription: any) {
    const dbSubscription = await fastify.prisma.subscription.findUnique({
      where: { stripeSubscriptionId: subscription.id }
    });

    if (dbSubscription) {
      await fastify.prisma.subscription.update({
        where: { id: dbSubscription.id },
        data: {
          status: subscription.status,
          currentPeriodStart: new Date(subscription.current_period_start * 1000),
          currentPeriodEnd: new Date(subscription.current_period_end * 1000),
          updatedAt: new Date()
        }
      });
    }
  }

  async function handlePaymentIntentSucceeded(fastify: FastifyInstance, paymentIntent: any) {
    const { ownerId, ownerType, tokenAmount, purchaseType } = paymentIntent.metadata;

    if (ownerId && ownerType && tokenAmount) {
      const tokenService = new TokenEconomyService(fastify.prisma);

      await tokenService.creditTokens(
        ownerId,
        ownerType as 'user' | 'workspace',
        parseInt(tokenAmount),
        'system', // No admin for top-ups
        'Top-up purchase',
        purchaseType as 'admin_credit' | 'topup' || 'topup'
      );

      // Record the purchase
      await fastify.prisma.tokenPurchase.create({
        data: {
          subscriptionId: paymentIntent.metadata.subscriptionId,
          ownerId,
          ownerType,
          stripePaymentIntentId: paymentIntent.id,
          purchaseType: 'topup',
          tokensPurchased: parseInt(tokenAmount),
          amountCents: paymentIntent.amount,
          metadata: paymentIntent.metadata
        }
      });
    }
  }

  // Stripe webhook handler (moved inside main function for proper scope)
  async function handleStripeWebhook(
    request: FastifyRequest<{ Body: StripeWebhookRequest }>,
    reply: FastifyReply
  ) {
    try {
      const { type, data } = request.body;
      const stripeEvent = data.object;

      console.log(`Processing Stripe webhook: ${type}`);

      switch (type) {
        case 'invoice.payment_succeeded':
          await handleInvoicePaid(fastify, stripeEvent);
          break;
        case 'invoice.payment_failed':
          await handleInvoiceFailed(fastify, stripeEvent);
          break;
        case 'customer.subscription.updated':
          await handleSubscriptionUpdated(fastify, stripeEvent);
          break;
        case 'payment_intent.succeeded':
          await handlePaymentIntentSucceeded(fastify, stripeEvent);
          break;
        default:
          console.log(`Unhandled webhook type: ${type}`);
      }

      return reply.status(200).send({ received: true });
    } catch (error) {
      console.error('Webhook processing failed:', error);
      return reply.status(500).send({ error: 'Webhook processing failed' });
    }
  }
  // Get billing status
  fastify.get('/api/v1/billing/status', {
    schema: {
      querystring: z.object({
        ownerId: z.string().optional(),
        ownerType: z.enum(['user', 'workspace']).optional()
      }).optional(),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            billing: z.any(),
            ownerId: z.string(),
            ownerType: z.string()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        404: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: getBillingStatus
  });

  // Estimate tokens for a workflow
  fastify.post('/api/v1/tokens/estimate', {
    schema: {
      body: estimateTokensSchema,
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            estimate: z.any(),
            workflow: z.string(),
            complexity: z.string()
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
    handler: estimateTokens
  });

  // Record token usage (atomic consumption)
  fastify.post('/api/v1/tokens/record-usage', {
    schema: {
      body: recordUsageSchema,
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            consumption: z.any(),
            ownerId: z.string(),
            ownerType: z.string(),
            tokensConsumed: z.number()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        402: z.object({
          success: z.literal(false),
          blocked: z.boolean(),
          reason: z.string(),
          actions: z.array(z.string()),
          estimated: z.number(),
          tokensRemaining: z.number(),
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

  // Create token top-up payment intent
  fastify.post('/api/v1/billing/topup', {
    schema: {
      body: topupSchema,
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            paymentIntent: z.object({
              id: z.string(),
              clientSecret: z.string(),
              amount: z.number(),
              currency: z.string()
            }),
            ownerId: z.string(),
            ownerType: z.string(),
            tokenAmount: z.number()
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
    handler: createTopup
  });

  // Toggle auto-topup
  fastify.post('/api/v1/billing/auto-topup/toggle', {
    schema: {
      body: z.object({
        enabled: z.boolean(),
        ownerId: z.string().optional(),
        ownerType: z.enum(['user', 'workspace']).optional()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            autoTopup: z.boolean(),
            ownerId: z.string(),
            ownerType: z.string()
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
        }),
        404: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: toggleAutoTopup
  });

  // Stripe webhook handler
  fastify.post('/api/v1/subscriptions/webhook', {
    schema: {
      body: z.object({
        type: z.string(),
        data: z.object({
          object: z.any()
        })
      }),
      response: {
        200: z.object({
          received: z.literal(true)
        })
      }
    },
    handler: handleStripeWebhook
  });

  // Admin: Credit tokens
  fastify.post('/api/v1/admin/credit-tokens', {
    preHandler: [fastify.authenticate, async (request, reply) => {
      if (!request.user || request.user.role !== UserRole.ADMIN) {
        (reply as any).code(403).send({ error: 'Forbidden', message: 'Admin access required' });
        return;
      }
    }],
    schema: {
      body: creditTokensSchema,
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            message: z.string(),
            ownerId: z.string(),
            ownerType: z.string(),
            tokens: z.number(),
            reason: z.string(),
            adminId: z.string()
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
    handler: creditTokens
  });

  // Check if operation should be blocked
  fastify.post('/api/v1/tokens/check-operation', {
    schema: {
      body: z.object({
        ownerId: z.string().optional(),
        ownerType: z.enum(['user', 'workspace']).optional(),
        workflowType: z.string(),
        complexity: z.enum(['low', 'medium', 'high']).optional()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            check: z.any(),
            ownerId: z.string(),
            ownerType: z.string(),
            workflowType: z.string(),
            complexity: z.string()
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
    handler: checkOperation
  });
}

// Webhook handlers

async function handleInvoicePaid(fastify: FastifyInstance, invoice: any) {
  // Find subscription by Stripe ID
  const subscription = await fastify.prisma.subscription.findUnique({
    where: { stripeSubscriptionId: invoice.subscription }
  });

  if (!subscription) {
    console.error(`Subscription not found for Stripe ID: ${invoice.subscription}`);
    return;
  }

  // Update subscription status
  await fastify.prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: 'active',
      currentPeriodStart: new Date(invoice.period_start * 1000),
      currentPeriodEnd: new Date(invoice.period_end * 1000),
      updatedAt: new Date()
    }
  });

  // Provision new token pool for the billing period
  const tokenService = new TokenEconomyService(fastify.prisma);
  const plan = await fastify.prisma.plan.findUnique({
    where: { id: subscription.planId }
  });

  if (plan && subscription.userId) {
    await tokenService.provisionTokenPool(
      subscription.id,
      subscription.userId,
      'user',
      new Date(invoice.period_start * 1000),
      new Date(invoice.period_end * 1000),
      plan.tokenPool
    );
  }
}

async function handleInvoiceFailed(fastify: FastifyInstance, invoice: any) {
  const subscription = await fastify.prisma.subscription.findUnique({
    where: { stripeSubscriptionId: invoice.subscription }
  });

  if (subscription) {
    const graceExpiresAt = new Date(Date.now() + (subscription.gracePeriodDays * 24 * 60 * 60 * 1000));

    await fastify.prisma.subscription.update({
      where: { id: subscription.id },
      data: {
        status: 'past_due',
        graceExpiresAt,
        updatedAt: new Date()
      }
    });
  }
}

async function handleSubscriptionUpdated(fastify: FastifyInstance, subscription: any) {
  const dbSubscription = await fastify.prisma.subscription.findUnique({
    where: { stripeSubscriptionId: subscription.id }
  });

  if (dbSubscription) {
    await fastify.prisma.subscription.update({
      where: { id: dbSubscription.id },
      data: {
        status: subscription.status,
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        updatedAt: new Date()
      }
    });
  }
}

async function handlePaymentIntentSucceeded(fastify: FastifyInstance, paymentIntent: any) {
  const { ownerId, ownerType, tokenAmount, purchaseType } = paymentIntent.metadata;

  if (ownerId && ownerType && tokenAmount) {
    const tokenService = new TokenEconomyService(fastify.prisma);

    await tokenService.creditTokens(
      ownerId,
      ownerType as 'user' | 'workspace',
      parseInt(tokenAmount),
      'system', // No admin for top-ups
      'Top-up purchase',
      purchaseType as 'admin_credit' | 'topup' || 'topup'
    );

    // Record the purchase
    await fastify.prisma.tokenPurchase.create({
      data: {
        subscriptionId: paymentIntent.metadata.subscriptionId,
        ownerId,
        ownerType,
        stripePaymentIntentId: paymentIntent.id,
        purchaseType: 'topup',
        tokensPurchased: parseInt(tokenAmount),
        amountCents: paymentIntent.amount,
        metadata: paymentIntent.metadata
      }
    });
  }
}

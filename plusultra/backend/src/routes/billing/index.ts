import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { StripeBillingService } from '../../services/billing/StripeBillingService';
import { TokenEconomyService, Tier } from '../../services/billing/TokenEconomyService';
import { enforceTier, TierPresets } from '../../middleware/TierEnforcementMiddleware';

/**
 * Billing Routes
 * Handles subscription management, token usage, and tier information
 */

export async function billingRoutes(fastify: FastifyInstance) {
  const billingService = new StripeBillingService();
  const tokenService = new TokenEconomyService();

  /**
   * GET /api/v1/billing/tiers
   * Get all available tiers and their features
   */
  fastify.get('/api/v1/billing/tiers', async (request, reply) => {
    const tiers = tokenService.getAllTiers();
    reply.send({ tiers });
  });

  /**
   * GET /api/v1/billing/tier/:tier
   * Get specific tier information
   */
  fastify.get<{
    Params: { tier: Tier };
  }>('/api/v1/billing/tier/:tier', async (request, reply) => {
    const { tier } = request.params;
    const tierInfo = tokenService.getTierLimits(tier);

    if (!tierInfo) {
      return reply.code(404).send({ error: 'Tier not found' });
    }

    reply.send({ tier: tierInfo });
  });

  /**
   * GET /api/v1/billing/usage
   * Get current token usage for authenticated user
   */
  fastify.get(
    '/api/v1/billing/usage',
    {
      preHandler: enforceTier({}), // Requires authentication
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request as any).user?.id;

      const usage = await tokenService.getTokenUsage(userId);
      reply.send({ usage });
    }
  );

  /**
   * GET /api/v1/billing/transactions
   * Get token transaction history
   */
  fastify.get<{
    Querystring: {
      limit?: number;
      offset?: number;
      startDate?: string;
      endDate?: string;
    };
  }>(
    '/api/v1/billing/transactions',
    {
      preHandler: enforceTier({}),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request as any).user?.id;
      const { limit, offset, startDate, endDate } = request.query as any;

      const transactions = await tokenService.getTransactionHistory(userId, {
        limit: limit ? parseInt(limit) : 50,
        offset: offset ? parseInt(offset) : 0,
        startDate: startDate ? new Date(startDate) : undefined,
        endDate: endDate ? new Date(endDate) : undefined,
      });

      reply.send({ transactions });
    }
  );

  /**
   * POST /api/v1/billing/estimate
   * Estimate cost for an operation
   */
  fastify.post<{
    Body: {
      prompt: string;
      context?: string;
      maxTokens?: number;
    };
  }>(
    '/api/v1/billing/estimate',
    {
      preHandler: enforceTier({}),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const { prompt, context, maxTokens } = request.body as any;

      const estimate = tokenService.estimateCost(
        tokenService.estimateTokens(prompt, context) + (maxTokens || 1000)
      );

      reply.send({ estimate });
    }
  );

  /**
   * GET /api/v1/billing/subscription
   * Get current subscription
   */
  fastify.get(
    '/api/v1/billing/subscription',
    {
      preHandler: enforceTier({}),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request as any).user?.id;

      const subscription = await billingService.getSubscription(userId);
      reply.send({ subscription });
    }
  );

  /**
   * POST /api/v1/billing/checkout
   * Create Stripe checkout session
   */
  fastify.post<{
    Body: {
      tier: Tier;
      billingCycle: 'monthly' | 'yearly';
    };
  }>(
    '/api/v1/billing/checkout',
    {
      preHandler: enforceTier({}),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request as any).user?.id;
      const { tier, billingCycle } = request.body as any;

      if (tier === 'free') {
        return reply.code(400).send({
          error: 'Cannot create checkout for free tier',
        });
      }

      if (tier === 'enterprise') {
        return reply.send({
          message: 'Please contact sales for enterprise pricing',
          salesEmail: 'sales@plusultra.dev',
        });
      }

      const result = await billingService.createCheckoutSession({
        userId,
        tier,
        billingCycle,
        successUrl: `${process.env.FRONTEND_URL}/billing/success`,
        cancelUrl: `${process.env.FRONTEND_URL}/billing/cancel`,
      });

      if (result.error) {
        return reply.code(500).send({ error: result.error });
      }

      reply.send({ sessionUrl: result.sessionUrl });
    }
  );

  /**
   * POST /api/v1/billing/portal
   * Create billing portal session
   */
  fastify.post(
    '/api/v1/billing/portal',
    {
      preHandler: enforceTier({}),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request as any).user?.id;

      const result = await billingService.createPortalSession({
        userId,
        returnUrl: `${process.env.FRONTEND_URL}/billing`,
      });

      if (result.error) {
        return reply.code(500).send({ error: result.error });
      }

      reply.send({ sessionUrl: result.sessionUrl });
    }
  );

  /**
   * POST /api/v1/billing/change-tier
   * Change subscription tier
   */
  fastify.post<{
    Body: {
      newTier: Tier;
      billingCycle?: 'monthly' | 'yearly';
    };
  }>(
    '/api/v1/billing/change-tier',
    {
      preHandler: enforceTier({}),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request as any).user?.id;
      const { newTier, billingCycle } = request.body as any;

      const result = await billingService.changeSubscription({
        userId,
        newTier,
        billingCycle,
      });

      if (!result.success) {
        return reply.code(500).send({ error: result.error });
      }

      reply.send({ success: true, message: 'Tier changed successfully' });
    }
  );

  /**
   * POST /api/v1/billing/cancel
   * Cancel subscription
   */
  fastify.post<{
    Body: {
      immediately?: boolean;
    };
  }>(
    '/api/v1/billing/cancel',
    {
      preHandler: enforceTier({}),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request as any).user?.id;
      const { immediately } = request.body as any;

      const result = await billingService.cancelSubscription({
        userId,
        immediately,
      });

      if (!result.success) {
        return reply.code(500).send({ error: result.error });
      }

      reply.send({
        success: true,
        message: immediately
          ? 'Subscription canceled immediately'
          : 'Subscription will cancel at period end',
      });
    }
  );

  /**
   * POST /api/v1/billing/reactivate
   * Reactivate canceled subscription
   */
  fastify.post(
    '/api/v1/billing/reactivate',
    {
      preHandler: enforceTier({}),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request as any).user?.id;

      const result = await billingService.reactivateSubscription(userId);

      if (!result.success) {
        return reply.code(500).send({ error: result.error });
      }

      reply.send({ success: true, message: 'Subscription reactivated' });
    }
  );

  /**
   * GET /api/v1/billing/payment-methods
   * Get payment methods
   */
  fastify.get(
    '/api/v1/billing/payment-methods',
    {
      preHandler: enforceTier({}),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request as any).user?.id;

      const paymentMethods = await billingService.getPaymentMethods(userId);
      reply.send({ paymentMethods });
    }
  );

  /**
   * GET /api/v1/billing/invoices
   * Get invoices
   */
  fastify.get<{
    Querystring: { limit?: number };
  }>(
    '/api/v1/billing/invoices',
    {
      preHandler: enforceTier({}),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request as any).user?.id;
      const { limit } = request.query as any;

      const invoices = await billingService.getInvoices(
        userId,
        limit ? parseInt(limit) : 12
      );

      reply.send({ invoices });
    }
  );

  /**
   * POST /api/v1/billing/webhook
   * Stripe webhook handler
   */
  fastify.post(
    '/api/v1/billing/webhook',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const signature = request.headers['stripe-signature'] as string;

      if (!signature) {
        return reply.code(400).send({ error: 'Missing signature' });
      }

      const payload = (request as any).rawBody;

      const result = await billingService.handleWebhook(payload, signature);

      if (!result.handled) {
        return reply.code(400).send({ error: result.error });
      }

      reply.send({ received: true });
    }
  );

  /**
   * POST /api/v1/billing/add-tokens
   * Admin endpoint to add tokens (bonus, refund, etc.)
   */
  fastify.post<{
    Body: {
      userId: string;
      amount: number;
      type: 'refund' | 'bonus' | 'purchase';
      description: string;
      adminKey: string;
    };
  }>('/api/v1/billing/add-tokens', async (request: FastifyRequest, reply: FastifyReply) => {
    const { userId, amount, type, description, adminKey } = request.body as any;

    // Verify admin key
    if (adminKey !== process.env.ADMIN_API_KEY) {
      return reply.code(403).send({ error: 'Forbidden' });
    }

    const result = await tokenService.addTokens({
      userId,
      amount,
      type,
      description,
    });

    if (!result.success) {
      return reply.code(500).send({ error: result.error });
    }

    reply.send({ success: true, message: 'Tokens added successfully' });
  });
}

export default billingRoutes;

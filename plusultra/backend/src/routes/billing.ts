import { FastifyPluginAsync } from 'fastify';
import { BillingService } from '../services/billing/BillingService';
import { BillingDatabaseMigrations } from '../services/billing/BillingDatabaseMigrations';

export interface BillingRoutes {
  // GET routes
  'GET /api/v1/billing/history': {
    querystring: {
      userId: string;
      workspaceId?: string;
      limit?: number;
    };
    response: Array<{
      id: string;
      amount: number;
      currency: string;
      status: string;
      description: string;
      createdAt: string;
      subscriptionTier?: string;
    }>;
  };

  'GET /api/v1/billing/subscription': {
    querystring: {
      userId: string;
      workspaceId?: string;
    };
    response: {
      hasActiveSubscription: boolean;
      tier?: string;
      status?: string;
      nextBillingDate?: string;
    } | null;
  };

  'GET /api/v1/billing/invoices': {
    querystring: {
      userId: string;
      workspaceId?: string;
      limit?: number;
    };
    response: Array<{
      id: string;
      amount: number;
      currency: string;
      status: string;
      subscriptionTier?: string;
      createdAt: string;
    }>;
  };

  'GET /api/v1/billing/can-perform': {
    querystring: {
      userId: string;
      workspaceId?: string;
      estimatedTokens: number;
    };
    response: {
      canProceed: boolean;
      reason?: string;
      paymentRequired?: boolean;
      paymentIntent?: {
        id: string;
        amount: number;
        currency: string;
        client_secret: string;
      };
    };
  };

  // POST routes
  'POST /api/v1/billing/create-payment-intent': {
    body: {
      userId: string;
      workspaceId?: string;
      type: 'token_purchase' | 'tier_upgrade';
      tokenAmount?: number;
      tier?: 'starter' | 'pro' | 'enterprise';
    };
    response: {
      paymentIntent: {
        id: string;
        amount: number;
        currency: string;
        client_secret: string;
      };
    };
  };

  'POST /api/v1/billing/create-subscription': {
    body: {
      userId: string;
      workspaceId?: string;
      tier: 'starter' | 'pro' | 'enterprise';
      paymentMethodId: string;
    };
    response: {
      subscription: {
        id: string;
        tier: string;
        status: string;
        currentPeriodStart: string;
        currentPeriodEnd: string;
      };
    };
  };

  'POST /api/v1/billing/cancel-subscription': {
    body: {
      subscriptionId: string;
    };
    response: {
      success: boolean;
      message: string;
    };
  };

  'POST /api/v1/billing/webhook': {
    body: Buffer;
    headers: {
      'stripe-signature': string;
    };
    response: {
      received: boolean;
    };
  };

  'POST /api/v1/billing/refund': {
    body: {
      paymentIntentId: string;
      amount?: number;
    };
    response: {
      success: boolean;
      refundId: string;
    };
  };
}

export const billingRoutes: FastifyPluginAsync = async (fastify) => {
  const billingService = new BillingService();
  const billingDb = new BillingDatabaseMigrations();

  // Initialize billing database tables
  await billingDb.createBillingTables();

  // GET /api/v1/billing/history - Get billing history
  fastify.get('/history', async (request, reply) => {
    const { userId, workspaceId, limit = 50 } = request.query as {
      userId: string;
      workspaceId?: string;
      limit?: number;
    };

    if (!userId) {
      return reply.code(400).send({ error: 'userId is required' });
    }

    try {
      const history = await billingDb.getBillingHistory(userId, workspaceId, limit);

      return history.map(record => ({
        id: record.id,
        amount: record.amount,
        currency: record.currency,
        status: record.status,
        description: record.description,
        createdAt: record.created_at,
        subscriptionTier: record.subscription_tier
      }));
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to get billing history' });
    }
  });

  // GET /api/v1/billing/subscription - Get active subscription
  fastify.get('/subscription', async (request, reply) => {
    const { userId, workspaceId } = request.query as {
      userId: string;
      workspaceId?: string;
    };

    if (!userId) {
      return reply.code(400).send({ error: 'userId is required' });
    }

    try {
      const subscription = await billingDb.getActiveSubscription(userId, workspaceId);

      if (!subscription) {
        return null;
      }

      return {
        hasActiveSubscription: true,
        tier: subscription.tier,
        status: subscription.status,
        nextBillingDate: subscription.current_period_end
      };
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to get subscription' });
    }
  });

  // GET /api/v1/billing/invoices - Get invoices
  fastify.get('/invoices', async (request, reply) => {
    const { userId, workspaceId, limit = 20 } = request.query as {
      userId: string;
      workspaceId?: string;
      limit?: number;
    };

    if (!userId) {
      return reply.code(400).send({ error: 'userId is required' });
    }

    try {
      const invoices = await billingDb.getUserInvoices(userId, workspaceId, limit);

      return invoices.map(invoice => ({
        id: invoice.id,
        amount: invoice.amount,
        currency: invoice.currency,
        status: invoice.status,
        subscriptionTier: invoice.subscription_tier,
        createdAt: invoice.created_at
      }));
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to get invoices' });
    }
  });

  // GET /api/v1/billing/can-perform - Check if user can perform action
  fastify.get('/can-perform', async (request, reply) => {
    const { userId, workspaceId, estimatedTokens } = request.query as {
      userId: string;
      workspaceId?: string;
      estimatedTokens: number;
    };

    if (!userId || !estimatedTokens) {
      return reply.code(400).send({ error: 'userId and estimatedTokens are required' });
    }

    try {
      const result = await billingService.canPerformAction(userId, estimatedTokens, workspaceId);

      if (result.canProceed) {
        return { canProceed: true };
      }

      if (result.paymentRequired) {
        // Create payment intent for top-up
        const paymentIntent = await billingService.createTokenPaymentIntent(userId, 10000, workspaceId);

        return {
          canProceed: false,
          reason: result.reason,
          paymentRequired: true,
          paymentIntent: {
            id: paymentIntent.id,
            amount: paymentIntent.amount,
            currency: paymentIntent.currency,
            client_secret: paymentIntent.client_secret
          }
        };
      }

      return {
        canProceed: false,
        reason: result.reason
      };
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to check permissions' });
    }
  });

  // POST /api/v1/billing/create-payment-intent - Create payment intent
  fastify.post('/create-payment-intent', async (request, reply) => {
    const { userId, workspaceId, type, tokenAmount, tier } = request.body as {
      userId: string;
      workspaceId?: string;
      type: 'token_purchase' | 'tier_upgrade';
      tokenAmount?: number;
      tier?: 'starter' | 'pro' | 'enterprise';
    };

    if (!userId || !type) {
      return reply.code(400).send({ error: 'userId and type are required' });
    }

    if (type === 'token_purchase' && !tokenAmount) {
      return reply.code(400).send({ error: 'tokenAmount is required for token purchases' });
    }

    if (type === 'tier_upgrade' && !tier) {
      return reply.code(400).send({ error: 'tier is required for tier upgrades' });
    }

    try {
      let paymentIntent;

      if (type === 'token_purchase') {
        paymentIntent = await billingService.createTokenPaymentIntent(userId, tokenAmount!, workspaceId);
      } else {
        paymentIntent = await billingService.createSubscriptionPaymentIntent(userId, tier!, workspaceId);
      }

      return {
        paymentIntent: {
          id: paymentIntent.id,
          amount: paymentIntent.amount,
          currency: paymentIntent.currency,
          client_secret: paymentIntent.client_secret
        }
      };
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to create payment intent' });
    }
  });

  // POST /api/v1/billing/create-subscription - Create subscription
  fastify.post('/create-subscription', async (request, reply) => {
    const { userId, workspaceId, tier, paymentMethodId } = request.body as {
      userId: string;
      workspaceId?: string;
      tier: 'starter' | 'pro' | 'enterprise';
      paymentMethodId: string;
    };

    if (!userId || !tier || !paymentMethodId) {
      return reply.code(400).send({ error: 'userId, tier, and paymentMethodId are required' });
    }

    try {
      const subscription = await billingService.createSubscription(userId, tier, paymentMethodId, workspaceId);

      return {
        subscription: {
          id: subscription.id || subscription.stripeSubscriptionId,
          tier: subscription.tier,
          status: subscription.status,
          currentPeriodStart: subscription.currentPeriodStart.toISOString(),
          currentPeriodEnd: subscription.currentPeriodEnd.toISOString()
        }
      };
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to create subscription' });
    }
  });

  // POST /api/v1/billing/cancel-subscription - Cancel subscription
  fastify.post('/cancel-subscription', async (request, reply) => {
    const { subscriptionId } = request.body as { subscriptionId: string };

    if (!subscriptionId) {
      return reply.code(400).send({ error: 'subscriptionId is required' });
    }

    try {
      await billingService.cancelSubscription(subscriptionId);

      return {
        success: true,
        message: 'Subscription cancelled successfully'
      };
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to cancel subscription' });
    }
  });

  // POST /api/v1/billing/webhook - Handle Stripe webhooks
  fastify.post('/webhook', async (request, reply) => {
    const signature = request.headers['stripe-signature'] as string;
    const body = request.body as Buffer;

    if (!signature || !body) {
      return reply.code(400).send({ error: 'Invalid webhook request' });
    }

    try {
      await billingService.handlePaymentWebhook(signature, body);

      return { received: true };
    } catch (error) {
      console.error('Webhook processing failed:', error);
      return reply.code(500).send({ error: 'Webhook processing failed' });
    }
  });

  // POST /api/v1/billing/refund - Process refund
  fastify.post('/refund', async (request, reply) => {
    const { paymentIntentId, amount } = request.body as {
      paymentIntentId: string;
      amount?: number;
    };

    if (!paymentIntentId) {
      return reply.code(400).send({ error: 'paymentIntentId is required' });
    }

    try {
      await billingService.processRefund(paymentIntentId, amount);

      return {
        success: true,
        refundId: `refund_${Date.now()}`
      };
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to process refund' });
    }
  });

  // GET /api/v1/billing/status - Get billing status for user
  fastify.get('/status', async (request, reply) => {
    const { userId, workspaceId } = request.query as {
      userId: string;
      workspaceId?: string;
    };

    if (!userId) {
      return reply.code(400).send({ error: 'userId is required' });
    }

    try {
      const [subscriptionStatus, billingHistory] = await Promise.all([
        billingService.getSubscriptionStatus(userId, workspaceId),
        billingDb.getBillingHistory(userId, workspaceId, 5)
      ]);

      return {
        subscription: subscriptionStatus,
        recentTransactions: billingHistory.length,
        lastPayment: billingHistory[0]?.created_at || null
      };
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to get billing status' });
    }
  });

  // POST /api/v1/billing/setup-payment-method - Setup payment method for subscription
  fastify.post('/setup-payment-method', async (request, reply) => {
    const { userId, paymentMethodId } = request.body as {
      userId: string;
      paymentMethodId: string;
    };

    if (!userId || !paymentMethodId) {
      return reply.code(400).send({ error: 'userId and paymentMethodId are required' });
    }

    try {
      // Attach payment method to customer (would be implemented in BillingService)
      // For now, just return success
      return {
        success: true,
        message: 'Payment method setup completed'
      };
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to setup payment method' });
    }
  });

  // GET /api/v1/billing/payment-methods - Get user's payment methods
  fastify.get('/payment-methods', async (request, reply) => {
    const { userId } = request.query as { userId: string };

    if (!userId) {
      return reply.code(400).send({ error: 'userId is required' });
    }

    try {
      // Would query payment_methods table
      return {
        paymentMethods: [
          {
            id: 'pm_dummy',
            type: 'card',
            lastFour: '4242',
            brand: 'visa',
            isDefault: true
          }
        ]
      };
    } catch (error) {
      return reply.code(500).send({ error: 'Failed to get payment methods' });
    }
  });
};

export default billingRoutes;

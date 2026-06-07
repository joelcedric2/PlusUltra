import Stripe from 'stripe';
import { BillingDatabaseMigrations } from './BillingDatabaseMigrations';

export interface PaymentIntent {
  id: string;
  amount: number;
  currency: string;
  status: 'requires_payment_method' | 'requires_confirmation' | 'processing' | 'succeeded' | 'canceled' | 'requires_action';
  client_secret: string;
  metadata?: Record<string, any>;
}

export interface BillingRecord {
  id?: string;
  userId: string;
  workspaceId?: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  paymentMethod: 'stripe' | 'paypal' | 'crypto';
  tokensPurchased?: number;
  tierUpgraded?: string;
  description: string;
  stripePaymentId?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

interface BillingRecordRow {
  id?: string;
  user_id: string;
  workspace_id?: string;
  payment_intent_id: string;
  amount: number;
  currency: string;
  status: string;
  payment_method: string;
  tokens_purchased?: number;
  tier_upgraded?: string;
  description: string;
  stripe_payment_id?: string;
  metadata?: any;
  created_at: string;
  updated_at: string;
}

export interface Subscription {
  id?: string;
  userId: string;
  workspaceId?: string;
  stripeSubscriptionId: string;
  tier: 'free' | 'starter' | 'pro' | 'enterprise';
  status: 'active' | 'canceled' | 'past_due' | 'incomplete' | 'trialing';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface BillingConfig {
  stripe: {
    secretKey: string;
    publishableKey: string;
    webhookSecret: string;
  };
  currency: string;
  tokenPrices: {
    10000: number; // $20 for 10K tokens
    50000: number; // $100 for 50K tokens
    100000: number; // $180 for 100K tokens
  };
  tierPrices: {
    starter: number; // $25/month
    pro: number; // $100/month
    enterprise: number; // $1000/month
  };
}

export class BillingService {
  private stripe: Stripe;
  private tokenDb: BillingDatabaseMigrations;
  private config: BillingConfig;

  constructor() {
    this.config = {
      stripe: {
        secretKey: process.env.STRIPE_SECRET_KEY || 'sk_test_dummy',
        publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || 'pk_test_dummy',
        webhookSecret: process.env.STRIPE_WEBHOOK_SECRET || 'whsec_dummy'
      },
      currency: 'usd',
      tokenPrices: {
        10000: 2000, // $20 in cents
        50000: 10000, // $100 in cents
        100000: 18000 // $180 in cents
      },
      tierPrices: {
        starter: 2500, // $25 in cents
        pro: 10000, // $100 in cents
        enterprise: 100000 // $1000 in cents
      }
    };

    this.stripe = new Stripe(this.config.stripe.secretKey, {
      apiVersion: '2025-02-24.acacia'
    });

    this.tokenDb = new BillingDatabaseMigrations();
  }

  // Create payment intent for token purchase
  async createTokenPaymentIntent(
    userId: string,
    tokenAmount: number,
    workspaceId?: string
  ): Promise<PaymentIntent> {
    const amount = this.config.tokenPrices[tokenAmount as keyof typeof this.config.tokenPrices];
    if (!amount) {
      throw new Error(`Invalid token amount: ${tokenAmount}`);
    }

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount,
      currency: this.config.currency,
      metadata: {
        userId,
        workspaceId: workspaceId || '',
        tokenAmount: tokenAmount.toString(),
        type: 'token_purchase'
      }
    });

    // Create billing record
    await this.createBillingRecord({
      userId,
      workspaceId,
      paymentIntentId: paymentIntent.id,
      amount,
      currency: this.config.currency,
      status: 'pending',
      paymentMethod: 'stripe',
      tokensPurchased: tokenAmount,
      description: `Token purchase: ${tokenAmount.toLocaleString()} tokens`,
      stripePaymentId: paymentIntent.id,
      createdAt: new Date()
    });

    return {
      id: paymentIntent.id,
      amount,
      currency: this.config.currency,
      status: paymentIntent.status as any,
      client_secret: paymentIntent.client_secret!,
      metadata: paymentIntent.metadata
    };
  }

  // Create payment intent for tier upgrade
  async createSubscriptionPaymentIntent(
    userId: string,
    tier: 'starter' | 'pro' | 'enterprise',
    workspaceId?: string
  ): Promise<PaymentIntent> {
    const amount = this.config.tierPrices[tier];
    if (!amount) {
      throw new Error(`Invalid tier: ${tier}`);
    }

    const paymentIntent = await this.stripe.paymentIntents.create({
      amount,
      currency: this.config.currency,
      metadata: {
        userId,
        workspaceId: workspaceId || '',
        tier,
        type: 'tier_upgrade'
      }
    });

    // Create billing record
    await this.createBillingRecord({
      userId,
      workspaceId,
      paymentIntentId: paymentIntent.id,
      amount,
      currency: this.config.currency,
      status: 'pending',
      paymentMethod: 'stripe',
      tierUpgraded: tier,
      description: `Tier upgrade to ${tier}`,
      stripePaymentId: paymentIntent.id,
      createdAt: new Date()
    });

    return {
      id: paymentIntent.id,
      amount,
      currency: this.config.currency,
      status: paymentIntent.status as any,
      client_secret: paymentIntent.client_secret!,
      metadata: paymentIntent.metadata
    };
  }

  // Handle Stripe webhook for payment confirmation
  async handlePaymentWebhook(signature: string, body: Buffer): Promise<void> {
    try {
      const event = this.stripe.webhooks.constructEvent(body, signature, this.config.stripe.webhookSecret);

      switch (event.type) {
        case 'payment_intent.succeeded':
          await this.handlePaymentSuccess(event.data.object as Stripe.PaymentIntent);
          break;
        case 'payment_intent.payment_failed':
          await this.handlePaymentFailure(event.data.object as Stripe.PaymentIntent);
          break;
        case 'invoice.payment_succeeded':
          await this.handleSubscriptionPayment(event.data.object as Stripe.Invoice);
          break;
        case 'invoice.payment_failed':
          await this.handleSubscriptionFailure(event.data.object as Stripe.Invoice);
          break;
      }
    } catch (error) {
      console.error('Webhook signature verification failed:', error);
      throw error;
    }
  }

  // Handle successful payment
  private async handlePaymentSuccess(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    const metadata = paymentIntent.metadata || {};

    if (metadata.type === 'token_purchase') {
      const tokenAmount = parseInt(metadata.tokenAmount);
      await this.processTokenPurchase(
        metadata.userId,
        metadata.workspaceId,
        tokenAmount,
        paymentIntent.id
      );
    } else if (metadata.type === 'tier_upgrade') {
      await this.processTierUpgrade(
        metadata.userId,
        metadata.workspaceId,
        metadata.tier as any,
        paymentIntent.id
      );
    }

    // Update billing record
    await this.updateBillingRecord(paymentIntent.id, 'completed');
  }

  // Handle failed payment
  private async handlePaymentFailure(paymentIntent: Stripe.PaymentIntent): Promise<void> {
    await this.updateBillingRecord(paymentIntent.id, 'failed');
  }

  // Handle subscription payment success
  private async handleSubscriptionPayment(invoice: Stripe.Invoice): Promise<void> {
    // Handle successful subscription payment
    // Update subscription status or create billing record
    console.log('Subscription payment succeeded:', invoice.id);
  }

  // Handle subscription payment failure
  private async handleSubscriptionFailure(invoice: Stripe.Invoice): Promise<void> {
    // Update billing record for subscription failure
    if (invoice.payment_intent) {
      await this.updateBillingRecord(invoice.payment_intent as string, 'failed');
    }
  }
  private async processTokenPurchase(
    userId: string,
    workspaceId: string | undefined,
    tokenAmount: number,
    paymentIntentId: string
  ): Promise<void> {
    // Add tokens to user's pool
    const pool = await this.tokenDb.getTokenPool(userId, workspaceId);
    const updatedTokens = pool.monthly_tokens + tokenAmount;

    await this.tokenDb.getTokenPool(userId, workspaceId); // Ensure pool exists

    // Update the pool with additional tokens
    const client = await this.tokenDb.getPool().connect();
    try {
      await client.query(`
        UPDATE token_pools
        SET monthly_tokens = monthly_tokens + $3, last_updated = NOW()
        WHERE user_id = $1 AND (workspace_id = $2 OR (workspace_id IS NULL AND $2 IS NULL))
      `, [userId, workspaceId, tokenAmount]);
    } finally {
      client.release();
    }
  }

  // Process tier upgrade
  private async processTierUpgrade(
    userId: string,
    workspaceId: string | undefined,
    tier: 'starter' | 'pro' | 'enterprise',
    paymentIntentId: string
  ): Promise<void> {
    // Update user's tier
    const client = await this.tokenDb.getPool().connect();
    try {
      await client.query(`
        UPDATE token_pools
        SET tier = $3, monthly_tokens = $4, reset_date = $5, last_updated = NOW()
        WHERE user_id = $1 AND (workspace_id = $2 OR (workspace_id IS NULL AND $2 IS NULL))
      `, [
        userId,
        workspaceId,
        tier,
        this.getTierTokenLimit(tier),
        this.getNextResetDate()
      ]);
    } finally {
      client.release();
    }
  }

  // Create subscription for recurring billing
  async createSubscription(
    userId: string,
    tier: 'starter' | 'pro' | 'enterprise',
    paymentMethodId: string,
    workspaceId?: string
  ): Promise<Subscription> {
    const priceId = this.getTierPriceId(tier);

    const subscription = await this.stripe.subscriptions.create({
      customer: await this.getOrCreateStripeCustomer(userId),
      items: [{ price: priceId }],
      default_payment_method: paymentMethodId,
      metadata: {
        userId,
        workspaceId: workspaceId || '',
        tier
      }
    });

    // Create subscription record
    const subscriptionRecord: Subscription = {
      userId,
      workspaceId,
      stripeSubscriptionId: subscription.id,
      tier,
      status: subscription.status as any,
      currentPeriodStart: new Date(subscription.current_period_start * 1000),
      currentPeriodEnd: new Date(subscription.current_period_end * 1000),
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
      metadata: subscription.metadata,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    // Save to database (would need subscription table)
    await this.saveSubscription(subscriptionRecord);

    return subscriptionRecord;
  }

  // Cancel subscription
  async cancelSubscription(subscriptionId: string): Promise<void> {
    await this.stripe.subscriptions.update(subscriptionId, {
      cancel_at_period_end: true
    });

    // Update database record
    await this.updateSubscriptionStatus(subscriptionId, 'canceled');
  }

  // Get user's active subscription
  async getActiveSubscription(userId: string, workspaceId?: string): Promise<Subscription | null> {
    // Query database for active subscription
    return null; // Implementation would query subscription table
  }

  // Check if user can perform action (considering payment status)
  async canPerformAction(userId: string, estimatedTokens: number, workspaceId?: string): Promise<{
    canProceed: boolean;
    reason?: string;
    paymentRequired?: boolean;
  }> {
    const pool = await this.tokenDb.getTokenPool(userId, workspaceId);

    // Check if user has sufficient tokens
    if (pool.monthly_tokens - pool.used_tokens >= estimatedTokens) {
      return { canProceed: true };
    }

    // Check if user has active subscription
    const subscription = await this.getActiveSubscription(userId, workspaceId);
    if (subscription && subscription.status === 'active') {
      // User has active subscription but insufficient tokens
      return {
        canProceed: false,
        reason: 'Insufficient tokens for this operation',
        paymentRequired: true
      };
    }

    // No active subscription and insufficient tokens
    return {
      canProceed: false,
      reason: 'Payment required: insufficient tokens and no active subscription',
      paymentRequired: true
    };
  }

  // Auto-block expensive operations when limits exceeded
  async checkAndBlockOperation(
    userId: string,
    operation: string,
    estimatedTokens: number,
    workspaceId?: string
  ): Promise<{
    allowed: boolean;
    reason?: string;
    paymentIntent?: PaymentIntent;
  }> {
    const permission = await this.canPerformAction(userId, estimatedTokens, workspaceId);

    if (permission.canProceed) {
      return { allowed: true };
    }

    if (permission.paymentRequired) {
      // Create payment intent for top-up
      try {
        const paymentIntent = await this.createTokenPaymentIntent(userId, 10000, workspaceId);
        return {
          allowed: false,
          reason: 'Payment required for additional tokens',
          paymentIntent
        };
      } catch (error) {
        return {
          allowed: false,
          reason: 'Unable to process payment. Please contact support.'
        };
      }
    }

    return {
      allowed: false,
      reason: permission.reason || 'Operation blocked due to insufficient tokens'
    };
  }

  // Get billing history
  async getBillingHistory(userId: string, workspaceId?: string, limit: number = 50): Promise<BillingRecord[]> {
    const client = await this.tokenDb.getPool().connect();

    try {
      let query = `
        SELECT * FROM billing_records
        WHERE user_id = $1
      `;
      const params = [userId];

      if (workspaceId) {
        query += ` AND workspace_id = $2`;
        params.push(workspaceId);
      }

      query += ` ORDER BY created_at DESC LIMIT ${limit}`;
      const result = await client.query(query, params);
      return result.rows.map((row: BillingRecordRow) => ({
        ...row,
        createdAt: new Date(row.created_at),
      }));
    } finally {
      client.release();
    }
  }

  // Get user's current subscription status
  async getSubscriptionStatus(userId: string, workspaceId?: string): Promise<{
    hasActiveSubscription: boolean;
    tier?: string;
    status?: string;
    nextBillingDate?: Date;
  }> {
    const subscription = await this.getActiveSubscription(userId, workspaceId);

    if (!subscription || subscription.status !== 'active') {
      return { hasActiveSubscription: false };
    }

    return {
      hasActiveSubscription: true,
      tier: subscription.tier,
      status: subscription.status,
      nextBillingDate: subscription.currentPeriodEnd
    };
  }

  // Process refund
  async processRefund(paymentIntentId: string, amount?: number): Promise<void> {
    const paymentIntent = await this.stripe.paymentIntents.retrieve(paymentIntentId);

    if (amount) {
      await this.stripe.refunds.create({
        payment_intent: paymentIntentId,
        amount: Math.round(amount * 100) // Convert to cents
      });
    } else {
      await this.stripe.refunds.create({
        payment_intent: paymentIntentId
      });
    }

    // Update billing record
    await this.updateBillingRecord(paymentIntentId, 'refunded');
  }

  // Helper methods
  private async createBillingRecord(record: Omit<BillingRecord, 'id' | 'updatedAt'>): Promise<void> {
    const client = await this.tokenDb.getPool().connect();

    try {
      await client.query(`
        INSERT INTO billing_records (
          user_id, workspace_id, payment_intent_id, amount, currency, status,
          payment_method, tokens_purchased, tier_upgraded, description,
          stripe_payment_id, metadata, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
      `, [
        record.userId,
        record.workspaceId,
        record.paymentIntentId,
        record.amount,
        record.currency,
        record.status,
        record.paymentMethod,
        record.tokensPurchased,
        record.tierUpgraded,
        record.description,
        record.stripePaymentId,
        JSON.stringify(record.metadata || {}),
        record.createdAt,
        new Date() // updatedAt should be current timestamp
      ]);
    } finally {
      client.release();
    }
  }

  private async updateBillingRecord(paymentIntentId: string, status: BillingRecord['status']): Promise<void> {
    const client = await this.tokenDb.getPool().connect();

    try {
      await client.query(`
        UPDATE billing_records
        SET status = $2, updated_at = NOW()
        WHERE payment_intent_id = $1
      `, [paymentIntentId, status]);
    } finally {
      client.release();
    }
  }

  private async getOrCreateStripeCustomer(userId: string): Promise<string> {
    // In a real implementation, you'd check if customer exists and create if not
    // For now, return a dummy customer ID
    return `cus_${userId}`;
  }

  private getTierPriceId(tier: string): string {
    // In production, these would be actual Stripe Price IDs
    const priceIds = {
      starter: 'price_starter_monthly',
      pro: 'price_pro_monthly',
      enterprise: 'price_enterprise_monthly'
    };

    return priceIds[tier as keyof typeof priceIds] || priceIds.starter;
  }

  private getTierTokenLimit(tier: string): number {
    const limits = {
      free: 50000,
      starter: 250000,
      pro: 1000000,
      enterprise: 10000000
    };

    return limits[tier as keyof typeof limits] || limits.free;
  }

  private getNextResetDate(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }

  private async saveSubscription(subscription: Subscription): Promise<void> {
    // Save to database (would need subscription table implementation)
    console.log('Subscription saved:', subscription);
  }

  private async updateSubscriptionStatus(subscriptionId: string, status: Subscription['status']): Promise<void> {
    // Update subscription status in database
    console.log('Subscription status updated:', subscriptionId, status);
  }
}

export default BillingService;

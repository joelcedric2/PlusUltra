import Stripe from 'stripe';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Tier, TierLimits, TokenEconomyService } from './TokenEconomyService';

/**
 * Stripe Billing Service
 * Manages subscriptions, payments, and tier changes via Stripe
 */

export interface SubscriptionData {
  id: string;
  userId: string;
  stripeSubscriptionId: string;
  stripeCustomerId: string;
  tier: Tier;
  status: 'active' | 'canceled' | 'past_due' | 'incomplete' | 'trialing';
  currentPeriodStart: Date;
  currentPeriodEnd: Date;
  cancelAtPeriodEnd: boolean;
  billingCycle: 'monthly' | 'yearly';
}

export interface PaymentMethod {
  id: string;
  type: 'card' | 'bank_account';
  brand?: string;
  last4: string;
  expiryMonth?: number;
  expiryYear?: number;
  isDefault: boolean;
}

export class StripeBillingService {
  private stripe: Stripe;
  private supabase: SupabaseClient;
  private tokenService: TokenEconomyService;

  // Stripe Price IDs (set these in your Stripe dashboard)
  private priceIds: Record<Tier, { monthly: string; yearly: string }> = {
    free: {
      monthly: '', // Free tier has no price
      yearly: '',
    },
    starter: {
      monthly: process.env.STRIPE_PRICE_STARTER_MONTHLY || 'price_starter_monthly',
      yearly: process.env.STRIPE_PRICE_STARTER_YEARLY || 'price_starter_yearly',
    },
    pro: {
      monthly: process.env.STRIPE_PRICE_PRO_MONTHLY || 'price_pro_monthly',
      yearly: process.env.STRIPE_PRICE_PRO_YEARLY || 'price_pro_yearly',
    },
    enterprise: {
      monthly: '', // Enterprise is custom pricing
      yearly: '',
    },
  };

  constructor() {
    this.stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
      apiVersion: '2025-02-24.acacia' as any,
    });

    this.supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    this.tokenService = new TokenEconomyService();
  }

  /**
   * Create Stripe customer
   */
  async createCustomer(data: {
    userId: string;
    email: string;
    name?: string;
    metadata?: Record<string, string>;
  }): Promise<{ customerId: string; error?: string }> {
    try {
      const customer = await this.stripe.customers.create({
        email: data.email,
        name: data.name,
        metadata: {
          userId: data.userId,
          ...data.metadata,
        },
      });

      // Update user with Stripe customer ID
      await this.supabase
        .from('users')
        .update({ stripe_customer_id: customer.id })
        .eq('id', data.userId);

      return { customerId: customer.id };
    } catch (error) {
      console.error('Failed to create Stripe customer:', error);
      return {
        customerId: '',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Create checkout session
   */
  async createCheckoutSession(data: {
    userId: string;
    tier: Tier;
    billingCycle: 'monthly' | 'yearly';
    successUrl: string;
    cancelUrl: string;
  }): Promise<{ sessionUrl?: string; error?: string }> {
    try {
      // Get or create Stripe customer
      const { data: user } = await this.supabase
        .from('users')
        .select('stripe_customer_id, email')
        .eq('id', data.userId)
        .single();

      let customerId = user?.stripe_customer_id;

      if (!customerId) {
        const result = await this.createCustomer({
          userId: data.userId,
          email: user?.email || '',
        });
        customerId = result.customerId;
      }

      // Get price ID
      const priceId = this.priceIds[data.tier][data.billingCycle];

      if (!priceId) {
        return { error: 'Invalid tier or billing cycle' };
      }

      // Create checkout session
      const session = await this.stripe.checkout.sessions.create({
        customer: customerId,
        mode: 'subscription',
        payment_method_types: ['card'],
        line_items: [
          {
            price: priceId,
            quantity: 1,
          },
        ],
        success_url: data.successUrl,
        cancel_url: data.cancelUrl,
        metadata: {
          userId: data.userId,
          tier: data.tier,
          billingCycle: data.billingCycle,
        },
      });

      return { sessionUrl: session.url || undefined };
    } catch (error) {
      console.error('Failed to create checkout session:', error);
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Create billing portal session
   */
  async createPortalSession(data: {
    userId: string;
    returnUrl: string;
  }): Promise<{ sessionUrl?: string; error?: string }> {
    try {
      const { data: user } = await this.supabase
        .from('users')
        .select('stripe_customer_id')
        .eq('id', data.userId)
        .single();

      if (!user?.stripe_customer_id) {
        return { error: 'No Stripe customer found' };
      }

      const session = await this.stripe.billingPortal.sessions.create({
        customer: user.stripe_customer_id,
        return_url: data.returnUrl,
      });

      return { sessionUrl: session.url };
    } catch (error) {
      console.error('Failed to create portal session:', error);
      return {
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get subscription
   */
  async getSubscription(userId: string): Promise<SubscriptionData | null> {
    try {
      const { data: user } = await this.supabase
        .from('users')
        .select('stripe_customer_id, stripe_subscription_id, tier')
        .eq('id', userId)
        .single();

      if (!user?.stripe_subscription_id) {
        return null;
      }

      const subscription = await this.stripe.subscriptions.retrieve(
        user.stripe_subscription_id
      );

      return {
        id: subscription.id,
        userId,
        stripeSubscriptionId: subscription.id,
        stripeCustomerId: subscription.customer as string,
        tier: user.tier as Tier,
        status: subscription.status as SubscriptionData['status'],
        currentPeriodStart: new Date(subscription.current_period_start * 1000),
        currentPeriodEnd: new Date(subscription.current_period_end * 1000),
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        billingCycle:
          subscription.items.data[0]?.price.recurring?.interval === 'year'
            ? 'yearly'
            : 'monthly',
      };
    } catch (error) {
      console.error('Failed to get subscription:', error);
      return null;
    }
  }

  /**
   * Change subscription tier
   */
  async changeSubscription(data: {
    userId: string;
    newTier: Tier;
    billingCycle?: 'monthly' | 'yearly';
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: user } = await this.supabase
        .from('users')
        .select('stripe_subscription_id, tier')
        .eq('id', data.userId)
        .single();

      if (!user?.stripe_subscription_id) {
        return { success: false, error: 'No active subscription' };
      }

      const subscription = await this.stripe.subscriptions.retrieve(
        user.stripe_subscription_id
      );

      const currentCycle =
        subscription.items.data[0]?.price.recurring?.interval === 'year'
          ? 'yearly'
          : 'monthly';
      const billingCycle = data.billingCycle || currentCycle;

      const newPriceId = this.priceIds[data.newTier][billingCycle];

      if (!newPriceId) {
        return { success: false, error: 'Invalid tier or billing cycle' };
      }

      // Update subscription
      await this.stripe.subscriptions.update(user.stripe_subscription_id, {
        items: [
          {
            id: subscription.items.data[0].id,
            price: newPriceId,
          },
        ],
        proration_behavior: 'always_invoice',
      });

      // Update user tier in database
      await this.supabase
        .from('users')
        .update({ tier: data.newTier })
        .eq('id', data.userId);

      // Reset token balance to new tier limits
      const limits = this.tokenService.getTierLimits(data.newTier);
      await this.supabase
        .from('users')
        .update({ token_balance: limits.tokensPerMonth })
        .eq('id', data.userId);

      return { success: true };
    } catch (error) {
      console.error('Failed to change subscription:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Cancel subscription
   */
  async cancelSubscription(data: {
    userId: string;
    immediately?: boolean;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: user } = await this.supabase
        .from('users')
        .select('stripe_subscription_id')
        .eq('id', data.userId)
        .single();

      if (!user?.stripe_subscription_id) {
        return { success: false, error: 'No active subscription' };
      }

      if (data.immediately) {
        // Cancel immediately
        await this.stripe.subscriptions.cancel(user.stripe_subscription_id);

        // Downgrade to free tier
        await this.supabase
          .from('users')
          .update({
            tier: 'free',
            stripe_subscription_id: null,
          })
          .eq('id', data.userId);
      } else {
        // Cancel at period end
        await this.stripe.subscriptions.update(user.stripe_subscription_id, {
          cancel_at_period_end: true,
        });
      }

      return { success: true };
    } catch (error) {
      console.error('Failed to cancel subscription:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Reactivate canceled subscription
   */
  async reactivateSubscription(
    userId: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { data: user } = await this.supabase
        .from('users')
        .select('stripe_subscription_id')
        .eq('id', userId)
        .single();

      if (!user?.stripe_subscription_id) {
        return { success: false, error: 'No subscription found' };
      }

      await this.stripe.subscriptions.update(user.stripe_subscription_id, {
        cancel_at_period_end: false,
      });

      return { success: true };
    } catch (error) {
      console.error('Failed to reactivate subscription:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get payment methods
   */
  async getPaymentMethods(userId: string): Promise<PaymentMethod[]> {
    try {
      const { data: user } = await this.supabase
        .from('users')
        .select('stripe_customer_id')
        .eq('id', userId)
        .single();

      if (!user?.stripe_customer_id) {
        return [];
      }

      const paymentMethods = await this.stripe.paymentMethods.list({
        customer: user.stripe_customer_id,
        type: 'card',
      });

      const customer = await this.stripe.customers.retrieve(user.stripe_customer_id);

      const defaultPaymentMethodId =
        (customer as any).deleted !== true
          ? (customer as any).invoice_settings?.default_payment_method
          : null;

      return paymentMethods.data.map((pm) => ({
        id: pm.id,
        type: 'card',
        brand: pm.card?.brand,
        last4: pm.card?.last4 || '',
        expiryMonth: pm.card?.exp_month,
        expiryYear: pm.card?.exp_year,
        isDefault: pm.id === defaultPaymentMethodId,
      }));
    } catch (error) {
      console.error('Failed to get payment methods:', error);
      return [];
    }
  }

  /**
   * Get invoices
   */
  async getInvoices(userId: string, limit: number = 12): Promise<any[]> {
    try {
      const { data: user } = await this.supabase
        .from('users')
        .select('stripe_customer_id')
        .eq('id', userId)
        .single();

      if (!user?.stripe_customer_id) {
        return [];
      }

      const invoices = await this.stripe.invoices.list({
        customer: user.stripe_customer_id,
        limit,
      });

      return invoices.data.map((invoice) => ({
        id: invoice.id,
        number: invoice.number,
        amount: invoice.amount_paid / 100,
        currency: invoice.currency,
        status: invoice.status,
        date: new Date(invoice.created * 1000),
        pdfUrl: invoice.invoice_pdf,
        hostedUrl: invoice.hosted_invoice_url,
      }));
    } catch (error) {
      console.error('Failed to get invoices:', error);
      return [];
    }
  }

  /**
   * Handle Stripe webhook
   */
  async handleWebhook(
    payload: string,
    signature: string
  ): Promise<{ handled: boolean; error?: string }> {
    try {
      const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

      if (!webhookSecret) {
        return { handled: false, error: 'Webhook secret not configured' };
      }

      const event = this.stripe.webhooks.constructEvent(
        payload,
        signature,
        webhookSecret
      );

      switch (event.type) {
        case 'checkout.session.completed':
          await this.handleCheckoutCompleted(event.data.object as any);
          break;

        case 'customer.subscription.updated':
          await this.handleSubscriptionUpdated(event.data.object as any);
          break;

        case 'customer.subscription.deleted':
          await this.handleSubscriptionDeleted(event.data.object as any);
          break;

        case 'invoice.payment_succeeded':
          await this.handlePaymentSucceeded(event.data.object as any);
          break;

        case 'invoice.payment_failed':
          await this.handlePaymentFailed(event.data.object as any);
          break;

        default:
          console.log('Unhandled event type:', event.type);
      }

      return { handled: true };
    } catch (error) {
      console.error('Webhook handling failed:', error);
      return {
        handled: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Handle checkout completed
   */
  private async handleCheckoutCompleted(session: any): Promise<void> {
    const userId = session.metadata?.userId;
    const tier = session.metadata?.tier as Tier;

    if (!userId || !tier) {
      console.error('Missing userId or tier in checkout session');
      return;
    }

    // Update user with subscription info
    await this.supabase
      .from('users')
      .update({
        tier,
        stripe_subscription_id: session.subscription,
        stripe_customer_id: session.customer,
      })
      .eq('id', userId);

    // Initialize token balance
    const limits = this.tokenService.getTierLimits(tier);
    await this.supabase
      .from('users')
      .update({ token_balance: limits.tokensPerMonth })
      .eq('id', userId);
  }

  /**
   * Handle subscription updated
   */
  private async handleSubscriptionUpdated(subscription: any): Promise<void> {
    const customerId = subscription.customer;

    // Find user by customer ID
    const { data: user } = await this.supabase
      .from('users')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .single();

    if (!user) {
      console.error('User not found for customer:', customerId);
      return;
    }

    // Update subscription status
    await this.supabase
      .from('users')
      .update({
        stripe_subscription_id: subscription.id,
      })
      .eq('id', user.id);
  }

  /**
   * Handle subscription deleted
   */
  private async handleSubscriptionDeleted(subscription: any): Promise<void> {
    const customerId = subscription.customer;

    const { data: user } = await this.supabase
      .from('users')
      .select('id')
      .eq('stripe_customer_id', customerId)
      .single();

    if (!user) {
      return;
    }

    // Downgrade to free tier
    await this.supabase
      .from('users')
      .update({
        tier: 'free',
        stripe_subscription_id: null,
      })
      .eq('id', user.id);
  }

  /**
   * Handle payment succeeded
   */
  private async handlePaymentSucceeded(invoice: any): Promise<void> {
    console.log('Payment succeeded for invoice:', invoice.id);
    // Could send confirmation email here
  }

  /**
   * Handle payment failed
   */
  private async handlePaymentFailed(invoice: any): Promise<void> {
    console.log('Payment failed for invoice:', invoice.id);
    // Could send notification email here
  }
}

export default StripeBillingService;

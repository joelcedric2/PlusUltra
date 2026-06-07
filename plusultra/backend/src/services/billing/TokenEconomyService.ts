import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Token Economy Service
 * Manages PlusUltra token consumption and tracking
 *
 * Token System Design:
 * - Users see simple numbers: 100, 250, 500 PlusUltra Tokens
 * - Behind the scenes: Variable conversion rates per tier
 * - Real model tokens consumed across all 5 AI models (Claude, GPT-5, Gemini, Grok, DeepSeek)
 *
 * Conversion Rates (1 PlusUltra Token = X real model tokens):
 * - Free: 1 PT = 2,500 real tokens (100 PT = 250,000 real tokens, ~25 requests)
 * - Starter: 1 PT = 2,400 real tokens (250 PT = 600,000 real tokens, ~60 requests)
 * - Pro: 1 PT = 4,000 real tokens (500 PT = 2,000,000 real tokens, ~200 requests)
 * - Enterprise: 1 PT = 10,000 real tokens (Unlimited base: 72M real tokens, ~7,200 requests)
 */

export type Tier = 'free' | 'starter' | 'pro' | 'enterprise';

export interface TierConfig {
  tier: Tier;
  displayTokens: number;           // What user sees
  monthlyAllocation: number;       // Resets monthly
  realTokensPerPlusultraToken: number; // Internal conversion
  totalRealTokens: number;         // Actual API token budget
  estimatedRequests: number;       // Approximate requests
}

export interface TierLimits {
  tier: Tier;
  tokensPerMonth: number; // PlusUltra tokens (what user sees)
  tokenConfig: TierConfig; // Full token configuration
  maxProjects: number;
  maxCollaborators: number;
  storageGB: number;
  hasTCI: boolean;
  hasCustomDomains: boolean;
  hasAdvancedIntegrations: boolean;
  hasCustomBranding: boolean;
  supportSLA: string;
  price: {
    monthly: number;
    yearly: number;
  };
  economics: {
    aiCostPerUser: number;  // Your AI cost per user/month
    targetMargin: number;   // Target profit margin (0-1)
  };
}

export interface TokenUsage {
  userId: string;
  period: {
    start: Date;
    end: Date;
  };
  consumed: {
    plusultraTokens: number;
    breakdown: {
      gpt5Tokens: number;
      claudeTokens: number;
      geminiTokens: number;
      grokTokens: number;
      deepseekTokens: number;
    };
  };
  remaining: number;
  limit: number;
}

export interface TokenTransaction {
  id: string;
  userId: string;
  amount: number; // PlusUltra tokens
  type: 'consumption' | 'refund' | 'bonus' | 'purchase';
  source: 'gpt5' | 'claude' | 'gemini' | 'grok' | 'deepseek' | 'system';
  sourceTokens: number; // Actual API tokens consumed
  description: string;
  metadata?: Record<string, any>;
  timestamp: Date;
}

export class TokenEconomyService {
  private supabase: SupabaseClient;

  // Tier definitions with variable token conversion rates
  private tierLimits: Record<Tier, TierLimits> = {
    free: {
      tier: 'free',
      tokensPerMonth: 100, // PlusUltra tokens shown to user
      tokenConfig: {
        tier: 'free',
        displayTokens: 100,
        monthlyAllocation: 100,
        realTokensPerPlusultraToken: 2500, // 1 PT = 2,500 real tokens
        totalRealTokens: 250000, // 100 * 2,500 = 250K real tokens
        estimatedRequests: 25, // ~25 requests per month
      },
      maxProjects: 1,
      maxCollaborators: 1,
      storageGB: 5,
      hasTCI: false,
      hasCustomDomains: false,
      hasAdvancedIntegrations: false,
      hasCustomBranding: false,
      supportSLA: 'Community (docs only)',
      price: { monthly: 0, yearly: 0 },
      economics: {
        aiCostPerUser: 6.25, // Your cost per user/month
        targetMargin: 0, // 0% margin (loss leader)
      },
    },
    starter: {
      tier: 'starter',
      tokensPerMonth: 250, // PlusUltra tokens shown to user
      tokenConfig: {
        tier: 'starter',
        displayTokens: 250,
        monthlyAllocation: 250,
        realTokensPerPlusultraToken: 2400, // 1 PT = 2,400 real tokens
        totalRealTokens: 600000, // 250 * 2,400 = 600K real tokens
        estimatedRequests: 60, // ~60 requests per month
      },
      maxProjects: 4,
      maxCollaborators: 3, // 1 user + 2 collaborators
      storageGB: 25,
      hasTCI: false,
      hasCustomDomains: true,
      hasAdvancedIntegrations: false,
      hasCustomBranding: false,
      supportSLA: 'Email (3-day)',
      price: { monthly: 25, yearly: 240 },
      economics: {
        aiCostPerUser: 15, // Your cost per user/month
        targetMargin: 0.4, // 40% margin
      },
    },
    pro: {
      tier: 'pro',
      tokensPerMonth: 500, // PlusUltra tokens shown to user (UPDATED from 1000)
      tokenConfig: {
        tier: 'pro',
        displayTokens: 500,
        monthlyAllocation: 500,
        realTokensPerPlusultraToken: 4000, // 1 PT = 4,000 real tokens
        totalRealTokens: 2000000, // 500 * 4,000 = 2M real tokens
        estimatedRequests: 200, // ~200 requests per month
      },
      maxProjects: 10,
      maxCollaborators: 5, // 1 user + 4 collaborators
      storageGB: 100,
      hasTCI: true,
      hasCustomDomains: true,
      hasAdvancedIntegrations: true,
      hasCustomBranding: true,
      supportSLA: 'Priority (2-day)',
      price: { monthly: 200, yearly: 1920 },
      economics: {
        aiCostPerUser: 50, // Your cost per user/month
        targetMargin: 0.75, // 75% margin
      },
    },
    enterprise: {
      tier: 'enterprise',
      tokensPerMonth: -1, // Unlimited (fair use)
      tokenConfig: {
        tier: 'enterprise',
        displayTokens: -1, // Unlimited display
        monthlyAllocation: -1, // Unlimited
        realTokensPerPlusultraToken: 10000, // 1 PT = 10,000 real tokens
        totalRealTokens: 72000000, // 72M base allocation for billing
        estimatedRequests: 7200, // ~7,200 requests per month base
      },
      maxProjects: -1, // Unlimited
      maxCollaborators: -1, // Unlimited
      storageGB: -1, // Unlimited
      hasTCI: true,
      hasCustomDomains: true,
      hasAdvancedIntegrations: true,
      hasCustomBranding: true,
      supportSLA: 'Dedicated (1-day)',
      price: { monthly: 0, yearly: 0 }, // Custom pricing
      economics: {
        aiCostPerUser: 1800, // Base cost per enterprise user/month
        targetMargin: 0.75, // 75% margin
      },
    },
  };

  // Token conversion rates (API tokens per 1 PlusUltra token)
  // Kept for backwards compatibility - prefer using tier-specific conversion
  private readonly TOKEN_CONVERSION_RATE = 1_000_000; // 1 PT = 1M API tokens (legacy)

  constructor(
    supabaseUrl: string = process.env.SUPABASE_URL || '',
    supabaseKey: string = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  ) {
    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Get tier limits
   */
  getTierLimits(tier: Tier): TierLimits {
    return this.tierLimits[tier];
  }

  /**
   * Get all tier information
   */
  getAllTiers(): TierLimits[] {
    return Object.values(this.tierLimits);
  }

  /**
   * Get conversion rate for a specific tier
   */
  getConversionRate(tier: Tier): number {
    return this.tierLimits[tier].tokenConfig.realTokensPerPlusultraToken;
  }

  /**
   * Convert API tokens to PlusUltra tokens (legacy - uses fixed rate)
   * @deprecated Use convertToPlusultraTokensForTier() for tier-specific conversion
   */
  convertToPlusultraTokens(apiTokens: number): number {
    return Math.ceil(apiTokens / this.TOKEN_CONVERSION_RATE);
  }

  /**
   * Convert PlusUltra tokens to API tokens (legacy - uses fixed rate)
   * @deprecated Use convertToApiTokensForTier() for tier-specific conversion
   */
  convertToApiTokens(plusultraTokens: number): number {
    return plusultraTokens * this.TOKEN_CONVERSION_RATE;
  }

  /**
   * Convert API tokens to PlusUltra tokens for a specific tier
   * Uses tier-specific conversion rates for accurate billing
   */
  convertToPlusultraTokensForTier(apiTokens: number, tier: Tier): number {
    const conversionRate = this.getConversionRate(tier);
    return Math.ceil(apiTokens / conversionRate);
  }

  /**
   * Convert PlusUltra tokens to API tokens for a specific tier
   * Uses tier-specific conversion rates for accurate allocation
   */
  convertToApiTokensForTier(plusultraTokens: number, tier: Tier): number {
    const conversionRate = this.getConversionRate(tier);
    return plusultraTokens * conversionRate;
  }

  /**
   * Record token consumption
   * Uses tier-specific conversion rates for accurate billing
   */
  async consumeTokens(data: {
    userId: string;
    apiTokens: number;
    source: 'gpt5' | 'claude' | 'gemini' | 'grok' | 'deepseek';
    description: string;
    metadata?: Record<string, any>;
  }): Promise<{
    success: boolean;
    consumed: number;
    remaining: number;
    error?: string;
  }> {
    try {
      // Get user's tier first
      const { data: user, error: userError } = await this.supabase
        .from('users')
        .select('tier')
        .eq('id', data.userId)
        .single();

      if (userError) {
        throw userError;
      }

      const tier = (user.tier as Tier) || 'free';

      // Convert API tokens to PlusUltra tokens using tier-specific rate
      const plusultraTokens = this.convertToPlusultraTokensForTier(data.apiTokens, tier);

      // Get user's current usage
      const usage = await this.getTokenUsage(data.userId);

      // Check if user has enough tokens
      if (usage.remaining < plusultraTokens) {
        return {
          success: false,
          consumed: 0,
          remaining: usage.remaining,
          error: 'Insufficient tokens',
        };
      }

      // Record transaction
      const { error } = await this.supabase.from('token_transactions').insert({
        user_id: data.userId,
        amount: plusultraTokens,
        type: 'consumption',
        source: data.source,
        source_tokens: data.apiTokens,
        description: data.description,
        metadata: data.metadata || {},
        timestamp: new Date().toISOString(),
      });

      if (error) {
        throw error;
      }

      // Update user's token balance
      await this.updateTokenBalance(data.userId, -plusultraTokens);

      return {
        success: true,
        consumed: plusultraTokens,
        remaining: usage.remaining - plusultraTokens,
      };
    } catch (error) {
      console.error('Failed to consume tokens:', error);
      return {
        success: false,
        consumed: 0,
        remaining: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get token usage for current billing period
   */
  async getTokenUsage(userId: string): Promise<TokenUsage> {
    try {
      // Get current billing period (monthly)
      const now = new Date();
      const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);
      const periodEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);

      // Get user's tier
      const { data: user, error: userError } = await this.supabase
        .from('users')
        .select('tier')
        .eq('id', userId)
        .single();

      if (userError) {
        throw userError;
      }

      const tier = (user.tier as Tier) || 'free';
      const limits = this.getTierLimits(tier);

      // Get transactions for current period
      const { data: transactions, error: txError } = await this.supabase
        .from('token_transactions')
        .select('*')
        .eq('user_id', userId)
        .gte('timestamp', periodStart.toISOString())
        .lte('timestamp', periodEnd.toISOString());

      if (txError) {
        throw txError;
      }

      // Calculate consumption
      let totalConsumed = 0;
      let gpt5Tokens = 0;
      let claudeTokens = 0;
      let geminiTokens = 0;
      let grokTokens = 0;
      let deepseekTokens = 0;

      for (const tx of transactions || []) {
        if (tx.type === 'consumption') {
          totalConsumed += tx.amount;

          switch (tx.source) {
            case 'gpt5':
              gpt5Tokens += tx.source_tokens;
              break;
            case 'claude':
              claudeTokens += tx.source_tokens;
              break;
            case 'gemini':
              geminiTokens += tx.source_tokens;
              break;
            case 'grok':
              grokTokens += tx.source_tokens;
              break;
            case 'deepseek':
              deepseekTokens += tx.source_tokens;
              break;
          }
        }
      }

      const limit = limits.tokensPerMonth === -1 ? Infinity : limits.tokensPerMonth;
      const remaining = limit === Infinity ? Infinity : Math.max(0, limit - totalConsumed);

      return {
        userId,
        period: {
          start: periodStart,
          end: periodEnd,
        },
        consumed: {
          plusultraTokens: totalConsumed,
          breakdown: {
            gpt5Tokens,
            claudeTokens,
            geminiTokens,
            grokTokens,
            deepseekTokens,
          },
        },
        remaining: remaining === Infinity ? -1 : remaining,
        limit: limit === Infinity ? -1 : limit,
      };
    } catch (error) {
      console.error('Failed to get token usage:', error);

      // Return safe default
      return {
        userId,
        period: {
          start: new Date(),
          end: new Date(),
        },
        consumed: {
          plusultraTokens: 0,
          breakdown: {
            gpt5Tokens: 0,
            claudeTokens: 0,
            geminiTokens: 0,
            grokTokens: 0,
            deepseekTokens: 0,
          },
        },
        remaining: 0,
        limit: 0,
      };
    }
  }

  /**
   * Check if user can consume tokens
   * Uses tier-specific conversion rates
   */
  async canConsumeTokens(userId: string, apiTokens: number): Promise<{
    allowed: boolean;
    reason?: string;
  }> {
    // Get user's tier
    const { data: user } = await this.supabase
      .from('users')
      .select('tier')
      .eq('id', userId)
      .single();

    const tier = (user?.tier as Tier) || 'free';

    const usage = await this.getTokenUsage(userId);
    const plusultraTokens = this.convertToPlusultraTokensForTier(apiTokens, tier);

    if (usage.remaining === -1) {
      // Unlimited (enterprise)
      return { allowed: true };
    }

    if (usage.remaining < plusultraTokens) {
      return {
        allowed: false,
        reason: `Insufficient tokens. Required: ${plusultraTokens}, Available: ${usage.remaining}`,
      };
    }

    return { allowed: true };
  }

  /**
   * Add tokens (refund, bonus, purchase)
   */
  async addTokens(data: {
    userId: string;
    amount: number;
    type: 'refund' | 'bonus' | 'purchase';
    description: string;
    metadata?: Record<string, any>;
  }): Promise<{ success: boolean; error?: string }> {
    try {
      const { error } = await this.supabase.from('token_transactions').insert({
        user_id: data.userId,
        amount: data.amount,
        type: data.type,
        source: 'system',
        source_tokens: 0,
        description: data.description,
        metadata: data.metadata || {},
        timestamp: new Date().toISOString(),
      });

      if (error) {
        throw error;
      }

      await this.updateTokenBalance(data.userId, data.amount);

      return { success: true };
    } catch (error) {
      console.error('Failed to add tokens:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get token transaction history
   */
  async getTransactionHistory(
    userId: string,
    options?: {
      limit?: number;
      offset?: number;
      startDate?: Date;
      endDate?: Date;
    }
  ): Promise<TokenTransaction[]> {
    try {
      let query = this.supabase
        .from('token_transactions')
        .select('*')
        .eq('user_id', userId);

      if (options?.startDate) {
        query = query.gte('timestamp', options.startDate.toISOString());
      }

      if (options?.endDate) {
        query = query.lte('timestamp', options.endDate.toISOString());
      }

      query = query.order('timestamp', { ascending: false });

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      if (options?.offset) {
        query = query.range(
          options.offset,
          options.offset + (options.limit || 50) - 1
        );
      }

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return (data || []).map((tx) => ({
        id: tx.id,
        userId: tx.user_id,
        amount: tx.amount,
        type: tx.type,
        source: tx.source,
        sourceTokens: tx.source_tokens,
        description: tx.description,
        metadata: tx.metadata,
        timestamp: new Date(tx.timestamp),
      }));
    } catch (error) {
      console.error('Failed to get transaction history:', error);
      return [];
    }
  }

  /**
   * Reset monthly tokens (called by cron job)
   */
  async resetMonthlyTokens(): Promise<{ success: boolean; usersReset: number }> {
    try {
      // This should be called on the 1st of each month
      const { data: users, error } = await this.supabase
        .from('users')
        .select('id, tier');

      if (error) {
        throw error;
      }

      let usersReset = 0;

      for (const user of users || []) {
        const tier = user.tier as Tier;
        const limits = this.getTierLimits(tier);

        // Reset token balance to tier limit
        await this.supabase
          .from('users')
          .update({ token_balance: limits.tokensPerMonth })
          .eq('id', user.id);

        usersReset++;
      }

      return { success: true, usersReset };
    } catch (error) {
      console.error('Failed to reset monthly tokens:', error);
      return { success: false, usersReset: 0 };
    }
  }

  /**
   * Update user's token balance
   */
  private async updateTokenBalance(
    userId: string,
    delta: number
  ): Promise<void> {
    const { data: user } = await this.supabase
      .from('users')
      .select('token_balance')
      .eq('id', userId)
      .single();

    const currentBalance = user?.token_balance || 0;
    const newBalance = Math.max(0, currentBalance + delta);

    await this.supabase
      .from('users')
      .update({ token_balance: newBalance })
      .eq('id', userId);
  }

  /**
   * Estimate tokens from prompt and context
   */
  estimateTokens(prompt: string, context?: string): number {
    // Rough estimation: 1 token ≈ 4 characters
    const text = prompt + (context || '');
    return Math.ceil(text.length / 4);
  }

  /**
   * Estimate cost for operation across all tiers
   * Shows how much an operation would cost in each tier's tokens
   */
  estimateCost(estimatedApiTokens: number): {
    tiers: Record<Tier, {
      plusultraTokens: number;
      canAfford: boolean;
      percentOfMonthly: number;
    }>;
  } {
    const tiers: Record<Tier, { plusultraTokens: number; canAfford: boolean; percentOfMonthly: number }> = {
      free: {
        plusultraTokens: this.convertToPlusultraTokensForTier(estimatedApiTokens, 'free'),
        canAfford: this.convertToPlusultraTokensForTier(estimatedApiTokens, 'free') <= 100,
        percentOfMonthly: (this.convertToPlusultraTokensForTier(estimatedApiTokens, 'free') / 100) * 100,
      },
      starter: {
        plusultraTokens: this.convertToPlusultraTokensForTier(estimatedApiTokens, 'starter'),
        canAfford: this.convertToPlusultraTokensForTier(estimatedApiTokens, 'starter') <= 250,
        percentOfMonthly: (this.convertToPlusultraTokensForTier(estimatedApiTokens, 'starter') / 250) * 100,
      },
      pro: {
        plusultraTokens: this.convertToPlusultraTokensForTier(estimatedApiTokens, 'pro'),
        canAfford: this.convertToPlusultraTokensForTier(estimatedApiTokens, 'pro') <= 500,
        percentOfMonthly: (this.convertToPlusultraTokensForTier(estimatedApiTokens, 'pro') / 500) * 100,
      },
      enterprise: {
        plusultraTokens: this.convertToPlusultraTokensForTier(estimatedApiTokens, 'enterprise'),
        canAfford: true,
        percentOfMonthly: 0,
      },
    };

    return { tiers };
  }
}

export default TokenEconomyService;

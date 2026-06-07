import { PostgresVectorStore } from '../vector/PostgresVectorStore';
import { BillingService } from '../billing/BillingService';

/**
 * Token usage tracking interface for recording AI interactions
 * Used to monitor token consumption and calculate costs
 */
export interface TokenUsage {
  /** Unique identifier for this usage record (optional, auto-generated) */
  id?: string;
  /** ID of the user who performed the action */
  userId: string;
  /** Workspace ID if the action was performed in a specific workspace */
  workspaceId?: string;
  /** Session ID to group related token usage */
  sessionId: string;
  /** Feature or operation that consumed tokens */
  feature: string;
  /** AI agent/model used (GPT5, Claude, Gemini, StarCoder) */
  agent: 'GPT5' | 'Claude' | 'Gemini' | 'StarCoder';
  /** Number of tokens consumed in this operation */
  tokensUsed: number;
  /** Calculated cost in USD for this token usage */
  cost: number;
  /** Timestamp when the usage occurred */
  timestamp: Date;
  /** Additional metadata for this usage record */
  metadata?: Record<string, any>;
}

/**
 * Token pool configuration for a user or workspace
 * Manages monthly token allocations and usage tracking
 */
export interface TokenPool {
  /** ID of the user this pool belongs to */
  userId: string;
  /** Workspace ID if this is a workspace-specific pool */
  workspaceId?: string;
  /** Current subscription tier (free, starter, pro, enterprise) */
  tier: 'free' | 'starter' | 'pro' | 'enterprise';
  /** Total tokens available in current monthly cycle */
  monthlyTokens: number;
  /** Tokens already consumed in current cycle */
  usedTokens: number;
  /** Date when the token pool resets next */
  resetDate: Date;
  /** Unused tokens carried over from previous cycle (15% of unused tokens) */
  rolloverTokens: number;
  /** Last time this pool was updated */
  lastUpdated: Date;
}

/**
 * AI request specification for token cost calculation
 * Defines the parameters needed to estimate token usage
 */
export interface AIRequest {
  /** AI model/agent to be used */
  model: 'GPT5' | 'Claude' | 'Gemini' | 'StarCoder';
  /** Complexity level of the request (affects token consumption) */
  complexity: 'low' | 'medium' | 'high';
  /** Explicit token count (optional, calculated if not provided) */
  tokens?: number;
}

/**
 * Token cost configuration for different AI agents and features
 * Defines base costs and multipliers for accurate pricing
 */
export interface TokenCostConfig {
  /** Base token costs per agent and complexity level */
  costs: {
    /** GPT-5 costs across complexity levels */
    GPT5: { low: number; medium: number; high: number };
    /** Claude costs across complexity levels */
    Claude: { low: number; medium: number; high: number };
    /** Gemini costs across complexity levels */
    Gemini: { low: number; medium: number; high: number };
    /** StarCoder costs across complexity levels */
    StarCoder: { low: number; medium: number; high: number };
  };

  /** Feature-specific multipliers for additional overhead */
  featureMultipliers: Record<string, number>;

  /** Token pool sizes and pricing for each subscription tier */
  tiers: {
    free: { monthlyTokens: number; price: number };
    starter: { monthlyTokens: number; price: number };
    pro: { monthlyTokens: number; price: number };
    enterprise: { monthlyTokens: number; price: number };
  };
}

/**
 * Core service for managing token allocation, usage tracking, and billing integration
 *
 * This service handles:
 * - Token cost calculation for AI operations
 * - Monthly token pool management and rollover
 * - Usage tracking and analytics
 * - Billing integration for payment processing
 * - Permission checking for token-gated operations
 *
 * The service uses a combination of vector storage for usage history and
 * PostgreSQL for persistent token pool state.
 */
export class TokenManagementService {
  /** Vector store for usage tracking and analytics */
  private vectorStore: PostgresVectorStore;

  /** Billing service for payment processing */
  private billingService: BillingService;

  /** Token cost configuration (costs, multipliers, tier limits) */
  private config: TokenCostConfig;

  /**
   * Initialize the token management service
   * Sets up vector storage, billing integration, and cost configuration
   */
  constructor() {
    this.vectorStore = new PostgresVectorStore();
    this.billingService = new BillingService();

    // Initialize token cost configuration
    this.config = {
      costs: {
        GPT5: { low: 8, medium: 35, high: 70 }, // Reduced by 20-30% to increase adoption
        Claude: { low: 5, medium: 20, high: 40 },
        Gemini: { low: 2, medium: 10, high: 20 },
        StarCoder: { low: 5, medium: 15, high: 30 }
      },
      featureMultipliers: {
        'small-function': 1.0,
        'ui-component': 1.2,
        'small-app': 1.4, // Reduced from 1.5
        'medium-app': 1.8, // Reduced from 2.0
        'complex-app': 2.5, // Reduced from 3.0
        'collaboration': 1.1,
        'export': 1.2,
        'compliance': 1.3,
        'debugging': 1.4,
        'testing': 1.3
      },
      tiers: {
        free: { monthlyTokens: 50000, price: 0 },
        starter: { monthlyTokens: 200000, price: 25 }, // Reduced from 250k
        pro: { monthlyTokens: 800000, price: 100 }, // Reduced from 1M
        enterprise: { monthlyTokens: 8000000, price: 1000 } // Reduced from 10M
      }
    };
  }

  /**
   * Calculate token cost for a single AI request
   * Uses base costs per agent/complexity, or explicit token count if provided
   *
   * @param request AI request specification with model, complexity, and optional token count
   * @returns Number of tokens required for this request
   */
  calculateRequestCost(request: AIRequest): number {
    if (request.tokens) {
      return request.tokens;
    }

    const baseCost = this.config.costs[request.model][request.complexity];
    return Math.round(baseCost);
  }

  /**
   * Calculate total token cost for multiple requests (workflow)
   * Applies feature multipliers and orchestration overhead
   *
   * @param requests Array of AI requests in the workflow
   * @param feature Feature type for multiplier calculation (defaults to 'general')
   * @returns Total token cost including all overhead
   */
  calculateWorkflowCost(requests: AIRequest[], feature: string = 'general'): number {
    const baseCost = requests.reduce((total, request) => {
      return total + this.calculateRequestCost(request);
    }, 0);

    const multiplier = this.config.featureMultipliers[feature] || 1.0;
    const totalCost = Math.round(baseCost * multiplier);

    // Add 5-10% orchestration overhead for multi-agent workflows
    const overhead = Math.round(totalCost * 0.075);
    return totalCost + overhead;
  }

  /**
   * Record token usage for an AI operation
   * Updates both usage tracking and token pool balance
   *
   * @param usage Complete token usage record with all metadata
   */
  async recordTokenUsage(usage: TokenUsage): Promise<void> {
    const usageId = `usage-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    await this.vectorStore.addDocuments([{
      id: usageId,
      content: `Token usage: ${usage.tokensUsed} tokens for ${usage.feature} using ${usage.agent}`,
      metadata: {
        ...usage,
        timestamp: usage.timestamp.toISOString(),
        usageId
      }
    }]);

    // Update token pool
    await this.updateTokenPool(usage.userId, usage.workspaceId, usage.tokensUsed);
  }

  /**
   * Get user's token pool (creates if doesn't exist)
   * Pools are stored as vector documents for analytics
   *
   * @param userId User identifier
   * @param workspaceId Optional workspace identifier
   * @returns Current token pool state
   */
  async getTokenPool(userId: string, workspaceId?: string): Promise<TokenPool> {
    const poolKey = workspaceId ? `pool-${userId}-${workspaceId}` : `pool-${userId}`;

    const existingPools = await this.vectorStore.similaritySearch(
      poolKey,
      { userId, limit: 1 } as any
    );

    if (existingPools.length > 0) {
      const poolData = existingPools[0].metadata as TokenPool;
      return poolData;
    }

    // Create new token pool (default to free tier)
    const newPool: TokenPool = {
      userId,
      workspaceId,
      tier: 'free',
      monthlyTokens: this.config.tiers.free.monthlyTokens,
      usedTokens: 0,
      resetDate: this.getNextResetDate(),
      rolloverTokens: 0,
      lastUpdated: new Date()
    };

    await this.vectorStore.addDocuments([{
      content: `Token pool for ${userId}`,
      metadata: { ...newPool, poolKey }
    }]);

    return newPool;
  }

  /**
   * Update token pool after usage
   * Increments used tokens and saves updated state
   *
   * @param userId User identifier
   * @param workspaceId Optional workspace identifier
   * @param tokensUsed Number of tokens consumed
   */
  private async updateTokenPool(userId: string, workspaceId: string | undefined, tokensUsed: number): Promise<void> {
    const currentPool = await this.getTokenPool(userId, workspaceId);

    const updatedPool: TokenPool = {
      ...currentPool,
      usedTokens: currentPool.usedTokens + tokensUsed,
      lastUpdated: new Date()
    };

    const poolKey = workspaceId ? `pool-${userId}-${workspaceId}` : `pool-${userId}`;

    await this.vectorStore.addDocuments([{
      content: `Updated token pool for ${userId}`,
      metadata: { ...updatedPool, poolKey }
    }]);
  }

  /**
   * Check if user can perform action based on token balance and billing status
   * First checks billing eligibility, then token availability
   *
   * @param userId User identifier
   * @param estimatedTokens Tokens required for the operation
   * @param workspaceId Optional workspace identifier
   * @returns Permission check result with billing/payment requirements
   */
  async canPerformAction(userId: string, estimatedTokens: number, workspaceId?: string): Promise<{
    canProceed: boolean;
    reason?: string;
    paymentRequired?: boolean;
    paymentIntent?: any;
  }> {
    // First check billing status (subscription/payment method)
    const billingCheck = await this.billingService.canPerformAction(userId, estimatedTokens, workspaceId);

    if (!billingCheck.canProceed) {
      return billingCheck;
    }

    // If billing check passes, check token balance
    const pool = await this.getTokenPool(userId, workspaceId);
    const hasTokens = (pool.monthlyTokens - pool.usedTokens) >= estimatedTokens;

    if (hasTokens) {
      return { canProceed: true };
    }

    // Insufficient tokens, but has valid billing setup
    if (billingCheck.canProceed) {
      return {
        canProceed: false,
        reason: 'Insufficient tokens for this operation',
        paymentRequired: true
      };
    }

    // No valid billing setup
    return {
      canProceed: false,
      reason: 'Payment method required for additional tokens',
      paymentRequired: true
    };
  }

  /**
   * Get token usage statistics for analytics
   * Filters by date range and calculates usage patterns
   *
   * @param userId User identifier
   * @param workspaceId Optional workspace identifier
   * @param days Number of days to include in analysis (default: 30)
   * @returns Usage statistics including totals, averages, and breakdowns
   */
  async getTokenUsageStats(userId: string, workspaceId?: string, days: number = 30): Promise<any> {
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const usageData = await this.vectorStore.similaritySearch(
      `usage-${userId}`,
      { userId, workspaceId, limit: 1000 } as any
    );

    const recentUsage = usageData
      .filter(usage => new Date(usage.metadata.timestamp) >= cutoffDate)
      .map(usage => usage.metadata as TokenUsage);

    // Calculate statistics
    const totalTokens = recentUsage.reduce((sum, usage) => sum + usage.tokensUsed, 0);
    const totalCost = recentUsage.reduce((sum, usage) => sum + usage.cost, 0);

    const agentUsage = recentUsage.reduce((acc, usage) => {
      acc[usage.agent] = (acc[usage.agent] || 0) + usage.tokensUsed;
      return acc;
    }, {} as Record<string, number>);

    const featureUsage = recentUsage.reduce((acc, usage) => {
      acc[usage.feature] = (acc[usage.feature] || 0) + usage.tokensUsed;
      return acc;
    }, {} as Record<string, number>);

    return {
      totalTokens,
      totalCost,
      agentUsage,
      featureUsage,
      usageCount: recentUsage.length,
      averageTokensPerUsage: recentUsage.length > 0 ? totalTokens / recentUsage.length : 0
    };
  }

  /**
   * Get user's current subscription tier
   *
   * @param userId User identifier
   * @param workspaceId Optional workspace identifier
   * @returns Current tier name
   */
  async getUserTier(userId: string, workspaceId?: string): Promise<string> {
    const pool = await this.getTokenPool(userId, workspaceId);
    return pool.tier;
  }

  /**
   * Upgrade user's subscription tier
   * Updates token pool limits and saves new configuration
   *
   * @param userId User identifier
   * @param newTier New tier to upgrade to
   * @param workspaceId Optional workspace identifier
   * @returns Updated token pool
   */
  async upgradeTier(userId: string, newTier: 'free' | 'starter' | 'pro' | 'enterprise', workspaceId?: string): Promise<TokenPool> {
    const currentPool = await this.getTokenPool(userId, workspaceId);

    const updatedPool: TokenPool = {
      ...currentPool,
      tier: newTier,
      monthlyTokens: this.config.tiers[newTier].monthlyTokens,
      resetDate: this.getNextResetDate(),
      lastUpdated: new Date()
    };

    const poolKey = workspaceId ? `pool-${userId}-${workspaceId}` : `pool-${userId}`;

    await this.vectorStore.addDocuments([{
      content: `Upgraded ${userId} to ${newTier} tier`,
      metadata: { ...updatedPool, poolKey }
    }]);

    return updatedPool;
  }

  /**
   * Calculate next monthly reset date
   * Tokens reset on the 1st of each month
   *
   * @returns Date of next reset (1st of next month)
   */
  private getNextResetDate(): Date {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return nextMonth;
  }

  /**
   * Create payment intent for additional tokens when limits exceeded
   * Delegates to billing service for Stripe integration
   *
   * @param userId User identifier
   * @param tokenAmount Number of tokens to purchase
   * @param workspaceId Optional workspace identifier
   * @returns Stripe payment intent
   */
  async createPaymentIntentForTokens(
    userId: string,
    tokenAmount: number,
    workspaceId?: string
  ): Promise<any> {
    return await this.billingService.createTokenPaymentIntent(userId, tokenAmount, workspaceId);
  }

  /**
   * Create payment intent for tier upgrade
   * Delegates to billing service for subscription management
   *
   * @param userId User identifier
   * @param tier New tier to subscribe to
   * @param workspaceId Optional workspace identifier
   * @returns Stripe subscription payment intent
   */
  async createPaymentIntentForTierUpgrade(
    userId: string,
    tier: 'starter' | 'pro' | 'enterprise',
    workspaceId?: string
  ): Promise<any> {
    return await this.billingService.createSubscriptionPaymentIntent(userId, tier, workspaceId);
  }

  /**
   * Get billing status for user
   * Provides subscription and payment method information
   *
   * @param userId User identifier
   * @param workspaceId Optional workspace identifier
   * @returns Current billing status
   */
  async getBillingStatus(userId: string, workspaceId?: string): Promise<any> {
    return await this.billingService.getSubscriptionStatus(userId, workspaceId);
  }

  /**
   * Get feature cost estimates based on base costs and multipliers
   * Used by the cost-estimates API endpoint to show typical token usage ranges
   *
   * @returns Record of feature cost estimates with min, max, and typical values
   */
  getFeatureCostEstimates(): Record<string, { min: number; max: number; typical: number }> {
    const estimates: Record<string, { min: number; max: number; typical: number }> = {};

    // Calculate estimates for each feature based on feature multipliers
    Object.entries(this.config.featureMultipliers).forEach(([feature, multiplier]) => {
      // Use average of low complexity costs as minimum estimate
      const minCosts = [
        this.config.costs.GPT5.low,
        this.config.costs.Claude.low,
        this.config.costs.Gemini.low,
        this.config.costs.StarCoder.low
      ];
      const minEstimate = Math.round(Math.min(...minCosts) * multiplier);

      // Use average of high complexity costs as maximum estimate
      const maxCosts = [
        this.config.costs.GPT5.high,
        this.config.costs.Claude.high,
        this.config.costs.Gemini.high,
        this.config.costs.StarCoder.high
      ];
      const maxEstimate = Math.round(Math.max(...maxCosts) * multiplier);

      // Use average of medium complexity costs as typical estimate
      const typicalCosts = [
        this.config.costs.GPT5.medium,
        this.config.costs.Claude.medium,
        this.config.costs.Gemini.medium,
        this.config.costs.StarCoder.medium
      ];
      const typicalEstimate = Math.round(
        typicalCosts.reduce((sum, cost) => sum + cost, 0) / typicalCosts.length * multiplier
      );

      estimates[feature] = {
        min: minEstimate,
        max: maxEstimate,
        typical: typicalEstimate
      };
    });

    return estimates;
  }

  /**
   * Purchase additional tokens for a user
   * Processes payment and updates token pool
   *
   * @param userId User identifier
   * @param tokensToPurchase Number of tokens to purchase
   * @param workspaceId Optional workspace identifier
   * @returns Updated token pool with purchased tokens added
   */
  async purchaseTokens(userId: string, tokensToPurchase: number, workspaceId?: string): Promise<TokenPool> {
    // First check if user can make this purchase (billing setup)
    const billingCheck = await this.billingService.canPerformAction(userId, tokensToPurchase * 0.002, workspaceId);

    if (!billingCheck.canProceed) {
      throw new Error('Payment method required for token purchase');
    }

    // Process the payment for tokens ($0.002 per token)
    const cost = tokensToPurchase * 0.002;
    const paymentIntent = await this.billingService.createTokenPaymentIntent(userId, tokensToPurchase, workspaceId);

    // If payment is successful, update token pool
    if (paymentIntent.status === 'succeeded') {
      const currentPool = await this.getTokenPool(userId, workspaceId);

      const updatedPool: TokenPool = {
        ...currentPool,
        // Add purchased tokens to current monthly allocation
        monthlyTokens: currentPool.monthlyTokens + tokensToPurchase,
        lastUpdated: new Date()
      };

      const poolKey = workspaceId ? `pool-${userId}-${workspaceId}` : `pool-${userId}`;

      await this.vectorStore.addDocuments([{
        content: `Purchased ${tokensToPurchase} tokens for ${userId}`,
        metadata: { ...updatedPool, poolKey }
      }]);

      return updatedPool;
    } else {
      throw new Error('Token purchase payment failed');
    }
  }

  /**
   * Get available tiers with their configurations and features
   * Used by the tiers API endpoint to show subscription options
   *
   * @returns Record of tier information including features
   */
  getTierInfo(): Record<string, { monthlyTokens: number; price: number; features: string[] }> {
    return {
      free: {
        monthlyTokens: this.config.tiers.free.monthlyTokens,
        price: this.config.tiers.free.price,
        features: [
          'Basic AI assistance',
          'Community support',
          'Limited monthly tokens'
        ]
      },
      starter: {
        monthlyTokens: this.config.tiers.starter.monthlyTokens,
        price: this.config.tiers.starter.price,
        features: [
          'Priority AI assistance',
          'Email support',
          'Increased token limit',
          'Advanced features'
        ]
      },
      pro: {
        monthlyTokens: this.config.tiers.pro.monthlyTokens,
        price: this.config.tiers.pro.price,
        features: [
          'Premium AI models',
          'Phone & email support',
          'Higher token limits',
          'Advanced analytics',
          'Custom integrations'
        ]
      },
      enterprise: {
        monthlyTokens: this.config.tiers.enterprise.monthlyTokens,
        price: this.config.tiers.enterprise.price,
        features: [
          'All Pro features',
          'Dedicated support',
          'Custom token limits',
          'SLA guarantee',
          'Advanced security',
          'Custom deployment'
        ]
      }
    };
  }
}

export default TokenManagementService;

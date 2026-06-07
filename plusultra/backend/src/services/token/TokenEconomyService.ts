import { PrismaClient } from '@prisma/client';

export interface TokenConsumptionResult {
  success: boolean;
  reason?: 'insufficient_tokens' | 'subscription_expired' | 'pool_not_found';
  usedTokens?: number;
  totalTokens?: number;
  blocked?: boolean;
  actions?: string[];
  estimated?: number;
  tokensRemaining?: number;
}

export interface TokenEstimate {
  workflow: string;
  complexity: 'low' | 'medium' | 'high';
  estimatedTokens: number;
  breakdown: Array<{
    agent: string;
    complexity: string;
    tokens: number;
  }>;
}

export interface BillingStatus {
  subscription: {
    id: string;
    planId: string;
    status: string;
    currentPeriodStart: Date;
    currentPeriodEnd: Date;
    autoTopup: boolean;
  };
  tokenPool: {
    totalTokens: number;
    usedTokens: number;
    remainingTokens: number;
    periodStart: Date;
    periodEnd: Date;
    rolloverTokens: number;
  };
  usage: {
    thisMonth: number;
    lastMonth: number;
    averageMonthly: number;
  };
}

export class TokenEconomyService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Atomically consume tokens from the current billing period pool
   */
  async consumeTokens(
    ownerId: string,
    ownerType: 'user' | 'workspace',
    tokens: number,
    metadata?: {
      agent?: string;
      feature?: string;
      workflowId?: string;
      workflowType?: string;
    }
  ): Promise<TokenConsumptionResult> {
    try {
      // Get current billing period
      const currentPeriod = await this.getCurrentBillingPeriod(ownerId, ownerType);
      if (!currentPeriod) {
        return {
          success: false,
          reason: 'pool_not_found',
          blocked: true,
          actions: ['billing']
        };
      }

      // Check subscription status
      const subscription = await this.prisma.subscription.findUnique({
        where: { id: currentPeriod.subscriptionId }
      });

      if (!subscription || subscription.status !== 'active') {
        return {
          success: false,
          reason: 'subscription_expired',
          blocked: true,
          actions: ['billing']
        };
      }

      // Atomic consumption attempt
      const result = await this.prisma.$transaction(async (tx: any) => {
        // Try to consume tokens atomically
        const updateResult = await tx.tokenPool.updateMany({
          where: {
            subscriptionId: currentPeriod.subscriptionId,
            ownerId,
            ownerType,
            periodStart: currentPeriod.start,
            usedTokens: {
              lt: currentPeriod.totalTokens // Ensure we don't exceed
            }
          },
          data: {
            usedTokens: {
              increment: tokens
            },
            updatedAt: new Date()
          }
        });

        if (updateResult.count === 0) {
          // No rows updated - insufficient tokens
          return null;
        }

        // Log the usage
        await tx.tokenUsage.create({
          data: {
            subscriptionId: currentPeriod.subscriptionId,
            ownerId,
            ownerType,
            agent: metadata?.agent || 'unknown',
            feature: metadata?.feature || 'unknown',
            workflowType: metadata?.workflowType,
            tokensConsumed: tokens,
            workflowId: metadata?.workflowId,
            metadata: metadata || {}
          }
        });

        return updateResult;
      });

      if (!result) {
        // Transaction failed - insufficient tokens
        const remaining = currentPeriod.totalTokens - currentPeriod.usedTokens;
        return {
          success: false,
          reason: 'insufficient_tokens',
          blocked: true,
          actions: subscription.autoTopupEnabled ? ['pending_autotopup'] : ['billing'],
          estimated: tokens,
          tokensRemaining: Math.max(remaining - tokens, 0)
        };
      }

      return {
        success: true,
        usedTokens: currentPeriod.usedTokens + tokens,
        totalTokens: currentPeriod.totalTokens
      };

    } catch (error) {
      console.error('Token consumption failed:', error);
      return {
        success: false,
        reason: 'pool_not_found',
        blocked: true,
        actions: ['billing']
      };
    }
  }

  /**
   * Estimate tokens required for a workflow
   */
  async estimateTokens(
    workflowType: string,
    complexity: 'low' | 'medium' | 'high' = 'medium'
  ): Promise<TokenEstimate> {
    const workflowCosts = this.getWorkflowCosts();
    const workflow = workflowCosts[workflowType];

    if (!workflow) {
      throw new Error(`Unknown workflow type: ${workflowType}`);
    }

    const breakdown = workflow.calls.map((call: any) => ({
      agent: call.agent,
      complexity: call.complexity,
      tokens: this.getAgentCost(call.agent, call.complexity)
    }));

    const totalTokens = breakdown.reduce((sum: number, item: any) => sum + item.tokens, 0);
    const estimatedTokens = Math.ceil(totalTokens * 1.08); // 8% overhead

    return {
      workflow: workflowType,
      complexity,
      estimatedTokens,
      breakdown
    };
  }

  /**
   * Get current billing status for an owner
   */
  async getBillingStatus(
    ownerId: string,
    ownerType: 'user' | 'workspace'
  ): Promise<BillingStatus | null> {
    try {
      const currentPeriod = await this.getCurrentBillingPeriod(ownerId, ownerType);
      if (!currentPeriod) {
        return null;
      }

      const subscription = await this.prisma.subscription.findUnique({
        where: { id: currentPeriod.subscriptionId },
        include: { plan: true }
      });

      if (!subscription) {
        return null;
      }

      // Calculate usage statistics
      const thisMonthUsage = await this.prisma.tokenUsage.aggregate({
        where: {
          userId: ownerId,
          timestamp: {
            gte: currentPeriod.start,
            lt: currentPeriod.end
          }
        },
        _sum: {
          totalTokens: true
        }
      });

      const lastMonthStart = new Date(currentPeriod.start);
      lastMonthStart.setMonth(lastMonthStart.getMonth() - 1);

      const lastMonthUsage = await this.prisma.tokenUsage.aggregate({
        where: {
          userId: ownerId,
          timestamp: {
            gte: lastMonthStart,
            lt: currentPeriod.start
          }
        },
        _sum: {
          totalTokens: true
        }
      });

      // Calculate average monthly usage (last 3 months)
      const threeMonthsAgo = new Date(currentPeriod.start);
      threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - 3);

      const avgUsage = await this.prisma.tokenUsage.aggregate({
        where: {
          userId: ownerId,
          timestamp: {
            gte: threeMonthsAgo
          }
        },
        _sum: {
          totalTokens: true
        }
      });

      const averageMonthly = avgUsage._sum?.totalTokens
        ? Math.round(avgUsage._sum.totalTokens / 3)
        : 0;

      return {
        subscription: {
          id: subscription.id,
          planId: subscription.planId,
          status: subscription.status,
          currentPeriodStart: subscription.currentPeriodStart || new Date(),
          currentPeriodEnd: subscription.currentPeriodEnd || new Date(),
          autoTopup: subscription.autoTopupEnabled
        },
        tokenPool: {
          totalTokens: currentPeriod.totalTokens,
          usedTokens: currentPeriod.usedTokens,
          remainingTokens: currentPeriod.totalTokens - currentPeriod.usedTokens,
          periodStart: currentPeriod.start,
          periodEnd: currentPeriod.end,
          rolloverTokens: currentPeriod.rolloverTokens
        },
        usage: {
          thisMonth: (thisMonthUsage._sum?.totalTokens || 0),
          lastMonth: (lastMonthUsage._sum?.totalTokens || 0),
          averageMonthly
        }
      };

    } catch (error) {
      console.error('Failed to get billing status:', error);
      return null;
    }
  }

  /**
   * Create or update token pool for a new billing period
   */
  async provisionTokenPool(
    subscriptionId: string,
    ownerId: string,
    ownerType: 'user' | 'workspace',
    periodStart: Date,
    periodEnd: Date,
    totalTokens: number,
    rolloverTokens: number = 0
  ): Promise<void> {
    await this.prisma.tokenPool.upsert({
      where: {
        subscriptionId_owner_period: {
          subscriptionId,
          ownerId,
          ownerType,
          periodStart
        }
      },
      update: {
        totalTokens,
        rolloverTokens,
        periodEnd,
        updatedAt: new Date()
      },
      create: {
        subscriptionId,
        ownerId,
        ownerType,
        periodStart,
        periodEnd,
        totalTokens,
        rolloverTokens,
        usedTokens: 0
      }
    });
  }

  /**
   * Admin function to credit additional tokens
   */
  async creditTokens(
    ownerId: string,
    ownerType: 'user' | 'workspace',
    tokens: number,
    adminId: string,
    reason: string,
    purchaseType: 'admin_credit' | 'topup' = 'admin_credit'
  ): Promise<void> {
    const currentPeriod = await this.getCurrentBillingPeriod(ownerId, ownerType);
    if (!currentPeriod) {
      throw new Error('No active token pool found');
    }

    await this.prisma.$transaction(async (tx: any) => {
      // Update token pool
      await tx.tokenPool.update({
        where: { id: currentPeriod.id },
        data: {
          totalTokens: {
            increment: tokens
          },
          updatedAt: new Date()
        }
      });

      // Record the purchase/credit
      await tx.tokenPurchase.create({
        data: {
          subscriptionId: currentPeriod.subscriptionId,
          ownerId,
          ownerType,
          purchaseType,
          tokensPurchased: tokens,
          amountCents: 0, // Admin credit, no charge
          adminId,
          adminReason: reason,
          metadata: { reason }
        }
      });
    });
  }

  /**
   * Check if operation should be blocked based on token availability
   */
  async shouldBlockOperation(
    ownerId: string,
    ownerType: 'user' | 'workspace',
    workflowType: string,
    complexity: 'low' | 'medium' | 'high' = 'medium'
  ): Promise<{
    blocked: boolean;
    reason?: string;
    actions?: string[];
    estimatedTokens?: number;
    availableTokens?: number;
  }> {
    const billingStatus = await this.getBillingStatus(ownerId, ownerType);
    if (!billingStatus) {
      return {
        blocked: true,
        reason: 'no_subscription',
        actions: ['billing']
      };
    }

    if (billingStatus.subscription.status !== 'active') {
      return {
        blocked: true,
        reason: 'subscription_expired',
        actions: ['billing']
      };
    }

    const estimate = await this.estimateTokens(workflowType, complexity);

    if (billingStatus.tokenPool.remainingTokens < estimate.estimatedTokens) {
      return {
        blocked: true,
        reason: 'insufficient_tokens',
        actions: billingStatus.subscription.autoTopup ? ['pending_autotopup'] : ['billing'],
        estimatedTokens: estimate.estimatedTokens,
        availableTokens: billingStatus.tokenPool.remainingTokens
      };
    }

    return {
      blocked: false,
      estimatedTokens: estimate.estimatedTokens,
      availableTokens: billingStatus.tokenPool.remainingTokens
    };
  }

  // Private helper methods

  private async getCurrentBillingPeriod(
    ownerId: string,
    ownerType: 'user' | 'workspace'
  ) {
    // Get the current subscription
    const subscription = await this.prisma.subscription.findFirst({
      where: {
        OR: [
          { userId: ownerId },
          { workspaceId: ownerId }
        ],
        status: 'active'
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    if (!subscription) {
      return null;
    }

    // Find the current token pool for this billing period
    const currentPeriodStart = new Date(subscription.currentPeriodStart || new Date());
    currentPeriodStart.setUTCHours(0, 0, 0, 0);

    const pool = await this.prisma.tokenPool.findFirst({
      where: {
        subscriptionId: subscription.id,
        ownerId,
        ownerType,
        periodStart: currentPeriodStart
      }
    });

    if (pool) {
      return {
        id: pool.id,
        subscriptionId: subscription.id,
        totalTokens: pool.totalTokens,
        usedTokens: pool.usedTokens,
        start: pool.periodStart,
        end: pool.periodEnd,
        rolloverTokens: pool.rolloverTokens
      };
    }

    return null;
  }

  private getAgentCost(agent: string, complexity: string): number {
    const costs: Record<string, Record<string, number>> = {
      'GPT5': { low: 8, medium: 35, high: 70 },
      'Claude': { low: 5, medium: 20, high: 40 },
      'Gemini': { low: 2, medium: 10, high: 20 },
      'StarCoder': { low: 5, medium: 15, high: 30 }
    };

    return costs[agent]?.[complexity] || 10;
  }

  private getWorkflowCosts(): Record<string, any> {
    return {
      'small_function': {
        calls: [
          { agent: 'StarCoder', complexity: 'low' },
          { agent: 'Claude', complexity: 'low' }
        ]
      },
      'ui_component': {
        calls: [
          { agent: 'GPT5', complexity: 'medium' },
          { agent: 'Claude', complexity: 'medium' }
        ]
      },
      'medium_app': {
        calls: [
          { agent: 'GPT5', complexity: 'high' },
          { agent: 'Claude', complexity: 'medium' },
          { agent: 'Gemini', complexity: 'medium' }
        ]
      },
      'complex_app': {
        calls: [
          { agent: 'GPT5', complexity: 'high' },
          { agent: 'Claude', complexity: 'high' },
          { agent: 'Gemini', complexity: 'high' },
          { agent: 'StarCoder', complexity: 'medium' }
        ]
      },
      'export_react_native': {
        calls: [
          { agent: 'GPT5', complexity: 'medium' },
          { agent: 'Claude', complexity: 'medium' }
        ]
      },
      'export_flutter': {
        calls: [
          { agent: 'GPT5', complexity: 'high' },
          { agent: 'Claude', complexity: 'medium' }
        ]
      },
      'export_swiftui': {
        calls: [
          { agent: 'GPT5', complexity: 'high' },
          { agent: 'Claude', complexity: 'medium' }
        ]
      },
      'eas_build': {
        calls: [
          { agent: 'GPT5', complexity: 'high' },
          { agent: 'Claude', complexity: 'high' }
        ]
      },
      'app_store_submission': {
        calls: [
          { agent: 'GPT5', complexity: 'medium' },
          { agent: 'Claude', complexity: 'medium' }
        ]
      },
      'debugging_analysis': {
        calls: [
          { agent: 'Claude', complexity: 'medium' },
          { agent: 'Gemini', complexity: 'medium' }
        ]
      }
    };
  }
}

export default TokenEconomyService;

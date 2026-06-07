/**
 * Billing & Cost Control Service - Token usage limits and budget management for PlusUltra
 * Implements hard caps, budget alerts, and cost optimization for multi-agent AI usage
 */

export interface TokenBudget {
  userId: string;
  monthlyLimit: number;
  currentUsage: number;
  resetDate: Date;
  tier: 'free' | 'starter' | 'pro' | 'enterprise';
  alerts: {
    enabled: boolean;
    thresholds: number[]; // Percentage thresholds for alerts (50%, 80%, 90%, 95%)
    channels: ('email' | 'dashboard' | 'webhook')[];
  };
  costOptimization: {
    enabled: boolean;
    modelFallback: boolean; // Allow fallback to cheaper models
    batchOptimization: boolean; // Batch requests when possible
    cachingEnabled: boolean; // Use response caching
  };
}

export interface CostAlert {
  id: string;
  userId: string;
  alertType: 'budget_threshold' | 'hard_limit' | 'unusual_spending';
  threshold: number; // Percentage or absolute amount
  triggeredAt: Date;
  acknowledged: boolean;
  resolved: boolean;
  message: string;
  severity: 'info' | 'warning' | 'critical';
}

export interface CostDashboard {
  userId: string;
  period: 'daily' | 'weekly' | 'monthly';
  totalCost: number;
  tokenUsage: number;
  modelBreakdown: Record<string, { cost: number; tokens: number; requests: number }>;
  trends: Array<{ date: string; cost: number; usage: number }>;
  budget: {
    limit: number;
    used: number;
    remaining: number;
    percentage: number;
  };
  optimization: {
    potentialSavings: number;
    recommendations: string[];
  };
}

/**
 * Billing Control Service - Manages token budgets, cost monitoring, and optimization
 */
export class BillingControlService {
  private budgets = new Map<string, TokenBudget>();
  private alerts = new Map<string, CostAlert[]>();
  private usageHistory = new Map<string, Array<{ timestamp: Date; tokens: number; cost: number; model: string }>>();

  // Token costs per model (per 1K tokens) - moved outside class for static access
  private static readonly MODEL_COSTS = {
    'gpt-5': 0.03,      // $0.03 per 1K tokens
    'claude-4.5': 0.025, // $0.025 per 1K tokens
    'gemini-2.5': 0.02,  // $0.02 per 1K tokens
    'starcoder': 0.005   // $0.005 per 1K tokens (local/optimized)
  };

  // Tier limits (monthly)
  private readonly TIER_LIMITS = {
    'free': 50000,       // 50K tokens
    'starter': 250000,   // 250K tokens
    'pro': 1000000,      // 1M tokens
    'enterprise': -1     // Unlimited (-1 means no limit)
  };

  /**
   * Create or update user budget
   */
  async setUserBudget(userId: string, tier: TokenBudget['tier'], customLimit?: number): Promise<void> {
    const monthlyLimit = customLimit || this.TIER_LIMITS[tier];

    const budget: TokenBudget = {
      userId,
      monthlyLimit,
      currentUsage: 0,
      resetDate: this.getNextResetDate(),
      tier,
      alerts: {
        enabled: true,
        thresholds: [50, 80, 90, 95],
        channels: ['dashboard', 'email']
      },
      costOptimization: {
        enabled: true,
        modelFallback: true,
        batchOptimization: true,
        cachingEnabled: true
      }
    };

    this.budgets.set(userId, budget);
    console.log(`💰 Budget set for user ${userId}: ${tier} tier (${monthlyLimit} tokens/month)`);
  }

  /**
   * Record token usage and check budget
   */
  async recordUsage(
    userId: string,
    tokens: number,
    model: string,
    metadata?: { requestId?: string; operation?: string }
  ): Promise<{ allowed: boolean; reason?: string; alert?: CostAlert }> {
    const budget = this.budgets.get(userId);
    if (!budget) {
      await this.setUserBudget(userId, 'free');
      return { allowed: true }; // Allow first-time users
    }

    // Check if unlimited tier
    if (budget.monthlyLimit === -1) {
      await this.addUsageRecord(userId, tokens, model, metadata);
      return { allowed: true };
    }

    // Calculate cost
    const cost = (tokens / 1000) * (BillingControlService.MODEL_COSTS[model as keyof typeof BillingControlService.MODEL_COSTS] || 0.03);

    // Check hard limit
    if (budget.currentUsage + tokens > budget.monthlyLimit) {
      const alert = await this.createAlert(userId, 'hard_limit', 100,
        `Token usage would exceed monthly limit (${budget.currentUsage + tokens} > ${budget.monthlyLimit})`);

      return {
        allowed: false,
        reason: 'Monthly token limit exceeded',
        alert
      };
    }

    // Check soft limits and create alerts
    const newUsage = budget.currentUsage + tokens;
    const usagePercentage = (newUsage / budget.monthlyLimit) * 100;

    for (const threshold of budget.alerts.thresholds) {
      if (usagePercentage >= threshold && budget.currentUsage / budget.monthlyLimit * 100 < threshold) {
        await this.createAlert(userId, 'budget_threshold', threshold,
          `Token usage at ${threshold}% of monthly limit (${newUsage}/${budget.monthlyLimit})`);
        break; // Only trigger one alert per usage record
      }
    }

    // Record usage
    await this.addUsageRecord(userId, tokens, model, metadata);

    return { allowed: true };
  }

  /**
   * Get user's cost dashboard
   */
  async getCostDashboard(userId: string, period: 'daily' | 'weekly' | 'monthly' = 'monthly'): Promise<CostDashboard> {
    const budget = this.budgets.get(userId);
    const history = this.usageHistory.get(userId) || [];

    // Filter history by period
    const now = new Date();
    const periodStart = this.getPeriodStart(now, period);
    const periodHistory = history.filter(h => h.timestamp >= periodStart);

    // Calculate totals
    const totalCost = periodHistory.reduce((sum, h) => sum + h.cost, 0);
    const tokenUsage = periodHistory.reduce((sum, h) => sum + h.tokens, 0);

    // Model breakdown
    const modelBreakdown: Record<string, { cost: number; tokens: number; requests: number }> = {};
    periodHistory.forEach(h => {
      if (!modelBreakdown[h.model]) {
        modelBreakdown[h.model] = { cost: 0, tokens: 0, requests: 0 };
      }
      modelBreakdown[h.model].cost += h.cost;
      modelBreakdown[h.model].tokens += h.tokens;
      modelBreakdown[h.model].requests += 1;
    });

    // Trends (daily aggregation)
    const trends = this.calculateTrends(periodHistory, period);

    // Budget info
    const budgetInfo = budget ? {
      limit: budget.monthlyLimit,
      used: budget.currentUsage,
      remaining: Math.max(0, budget.monthlyLimit - budget.currentUsage),
      percentage: budget.monthlyLimit > 0 ? (budget.currentUsage / budget.monthlyLimit) * 100 : 0
    } : { limit: 0, used: 0, remaining: 0, percentage: 0 };

    // Optimization recommendations
    const optimization = await this.calculateOptimizationRecommendations(userId, periodHistory);

    return {
      userId,
      period,
      totalCost,
      tokenUsage,
      modelBreakdown,
      trends,
      budget: budgetInfo,
      optimization
    };
  }

  /**
   * Get user's active alerts
   */
  async getActiveAlerts(userId: string): Promise<CostAlert[]> {
    const userAlerts = this.alerts.get(userId) || [];
    return userAlerts.filter(alert => !alert.acknowledged && !alert.resolved);
  }

  /**
   * Acknowledge an alert
   */
  async acknowledgeAlert(userId: string, alertId: string): Promise<boolean> {
    const userAlerts = this.alerts.get(userId) || [];
    const alert = userAlerts.find(a => a.id === alertId);

    if (alert) {
      alert.acknowledged = true;
      this.alerts.set(userId, userAlerts);
      return true;
    }

    return false;
  }

  /**
   * Enable/disable cost optimization features
   */
  async updateCostOptimization(userId: string, settings: Partial<TokenBudget['costOptimization']>): Promise<void> {
    const budget = this.budgets.get(userId);
    if (budget) {
      budget.costOptimization = { ...budget.costOptimization, ...settings };
      this.budgets.set(userId, budget);
      console.log(`⚙️ Cost optimization updated for user ${userId}`);
    }
  }

  /**
   * Check if model fallback is allowed for budget optimization
   */
  async canUseModelFallback(userId: string, requestedModel: string, fallbackModel: string): Promise<boolean> {
    const budget = this.budgets.get(userId);
    if (!budget?.costOptimization.enabled || !budget.costOptimization.modelFallback) {
      return false;
    }

    // Check if user is approaching budget limit
    const usagePercentage = (budget.currentUsage / budget.monthlyLimit) * 100;
    const shouldOptimize = usagePercentage > 70; // Fallback when >70% of budget used

    if (shouldOptimize) {
      const requestedCost = BillingControlService.MODEL_COSTS[requestedModel as keyof typeof BillingControlService.MODEL_COSTS] || 0.03;
      const fallbackCost = BillingControlService.MODEL_COSTS[fallbackModel as keyof typeof BillingControlService.MODEL_COSTS] || 0.03;

      // Only fallback if cheaper model is available
      return fallbackCost < requestedCost;
    }

    return false;
  }

  // Private helper methods
  private async addUsageRecord(
    userId: string,
    tokens: number,
    model: string,
    metadata?: { requestId?: string; operation?: string }
  ): Promise<void> {
    const budget = this.budgets.get(userId);
    if (!budget) return;

    const cost = (tokens / 1000) * (BillingControlService.MODEL_COSTS[model as keyof typeof BillingControlService.MODEL_COSTS] || 0.03);

    // Update current usage
    budget.currentUsage += tokens;
    this.budgets.set(userId, budget);

    // Add to history
    const history = this.usageHistory.get(userId) || [];
    history.push({
      timestamp: new Date(),
      tokens,
      cost,
      model
    });

    // Keep only last 90 days of history
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
    const filteredHistory = history.filter(h => h.timestamp >= ninetyDaysAgo);

    this.usageHistory.set(userId, filteredHistory);
  }

  private async createAlert(userId: string, type: CostAlert['alertType'], threshold: number, message: string): Promise<CostAlert> {
    const alert: CostAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      userId,
      alertType: type,
      threshold,
      triggeredAt: new Date(),
      acknowledged: false,
      resolved: false,
      message,
      severity: threshold >= 95 ? 'critical' : threshold >= 80 ? 'warning' : 'info'
    };

    const userAlerts = this.alerts.get(userId) || [];
    userAlerts.push(alert);
    this.alerts.set(userId, userAlerts);

    console.log(`🚨 Cost alert created for user ${userId}: ${message}`);

    return alert;
  }

  private getNextResetDate(): Date {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    return nextMonth;
  }

  private getPeriodStart(date: Date, period: 'daily' | 'weekly' | 'monthly'): Date {
    const now = new Date(date);

    switch (period) {
      case 'daily':
        return new Date(now.getFullYear(), now.getMonth(), now.getDate());
      case 'weekly':
        const weekStart = new Date(now);
        weekStart.setDate(now.getDate() - now.getDay());
        return new Date(weekStart.getFullYear(), weekStart.getMonth(), weekStart.getDate());
      case 'monthly':
        return new Date(now.getFullYear(), now.getMonth(), 1);
    }
  }

  private calculateTrends(history: Array<{ timestamp: Date; tokens: number; cost: number; model: string }>, period: 'daily' | 'weekly' | 'monthly'): Array<{ date: string; cost: number; usage: number }> {
    // Group by day and calculate daily totals
    const dailyTotals = new Map<string, { cost: number; usage: number }>();

    history.forEach(h => {
      const dateKey = h.timestamp.toISOString().split('T')[0];
      const existing = dailyTotals.get(dateKey) || { cost: 0, usage: 0 };
      dailyTotals.set(dateKey, {
        cost: existing.cost + h.cost,
        usage: existing.usage + h.tokens
      });
    });

    // Convert to array and sort by date
    return Array.from(dailyTotals.entries())
      .map(([date, totals]) => ({ date, ...totals }))
      .sort((a, b) => a.date.localeCompare(b.date));
  }

  private async calculateOptimizationRecommendations(
    userId: string,
    history: Array<{ timestamp: Date; tokens: number; cost: number; model: string }>
  ): Promise<{ potentialSavings: number; recommendations: string[] }> {
    const recommendations: string[] = [];
    let potentialSavings = 0;

    // Analyze model usage patterns
    const modelUsage = new Map<string, { tokens: number; cost: number }>();
    history.forEach(h => {
      const existing = modelUsage.get(h.model) || { tokens: 0, cost: 0 };
      modelUsage.set(h.model, {
        tokens: existing.tokens + h.tokens,
        cost: existing.cost + h.cost
      });
    });

    // Check for expensive model overuse
    for (const [model, usage] of modelUsage.entries()) {
      const modelCost = BillingControlService.MODEL_COSTS[model as keyof typeof BillingControlService.MODEL_COSTS] || 0.03;

      // If using expensive models heavily, suggest optimization
      if (modelCost > 0.02 && usage.tokens > 10000) {
        const cheaperAlternative = this.getCheaperAlternative(model);
        if (cheaperAlternative) {
          const potentialSaving = (modelCost - (BillingControlService.MODEL_COSTS[cheaperAlternative as keyof typeof BillingControlService.MODEL_COSTS] || 0.02)) * (usage.tokens / 1000);
          potentialSavings += potentialSaving;
          recommendations.push(`Consider using ${cheaperAlternative} instead of ${model} for non-critical tasks (potential savings: $${potentialSaving.toFixed(2)})`);
        }
      }
    }

    // Check for caching opportunities
    const uniqueRequests = new Set(history.map(h => h.timestamp.getTime())).size;
    if (uniqueRequests < history.length * 0.7) { // More than 30% duplicate requests
      recommendations.push('Enable response caching to reduce repeated API calls');
      potentialSavings += history.reduce((sum, h) => sum + h.cost, 0) * 0.3; // Assume 30% cache hit rate
    }

    return { potentialSavings, recommendations };
  }

  private getCheaperAlternative(model: string): string | null {
    const alternatives: Record<string, string> = {
      'gpt-5': 'gemini-2.5',
      'claude-4.5': 'gemini-2.5'
    };

    return alternatives[model] || null;
  }
}

// Initialize global instance
export const billingControlService = new BillingControlService();

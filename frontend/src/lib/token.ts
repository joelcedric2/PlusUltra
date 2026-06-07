/**
 * Token Service
 * Handles token balance fetching and management
 */

import { apiClient } from './api';

export interface TokenPool {
  userId: string;
  workspaceId?: string;
  tier: string;
  monthlyTokens: number;
  usedTokens: number;
  availableTokens: number;
  resetDate: string;
  rolloverTokens: number;
}

export interface TokenUsage {
  totalTokens: number;
  totalCost: number;
  usageCount: number;
  averageTokensPerUsage: number;
  agentBreakdown: Array<{
    agent: string;
    tokens: number;
  }>;
  featureBreakdown: Array<{
    feature: string;
    tokens: number;
  }>;
  periodDays: number;
}

export interface TokenAlert {
  id: string;
  type: string;
  message: string;
  thresholdPercentage: number;
  currentUsage: number;
  createdAt: string;
}

export class TokenService {
  /**
   * Get user's token pool with balance and tier info
   */
  async getTokenPool(userId: string, workspaceId?: string): Promise<TokenPool> {
    const params = new URLSearchParams({ userId });
    if (workspaceId) {
      params.append('workspaceId', workspaceId);
    }

    const response = await apiClient.get<TokenPool>(`/api/v1/tokens/pool?${params.toString()}`);

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Failed to fetch token pool');
  }

  /**
   * Get token usage statistics
   */
  async getTokenUsage(userId: string, workspaceId?: string, days: number = 30): Promise<TokenUsage> {
    const params = new URLSearchParams({ userId, days: days.toString() });
    if (workspaceId) {
      params.append('workspaceId', workspaceId);
    }

    const response = await apiClient.get<TokenUsage>(`/api/v1/tokens/usage?${params.toString()}`);

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Failed to fetch token usage');
  }

  /**
   * Get token alerts for user
   */
  async getTokenAlerts(userId: string, workspaceId?: string): Promise<TokenAlert[]> {
    const params = new URLSearchParams({ userId });
    if (workspaceId) {
      params.append('workspaceId', workspaceId);
    }

    const response = await apiClient.get<{ alerts: TokenAlert[] }>(
      `/api/v1/tokens/alerts?${params.toString()}`
    );

    if (response.success && response.data) {
      return response.data.alerts;
    }

    throw new Error(response.error || 'Failed to fetch token alerts');
  }

  /**
   * Record token usage for an operation
   */
  async recordUsage(
    userId: string,
    sessionId: string,
    feature: string,
    requests: Array<{
      model: 'GPT5' | 'Claude' | 'Gemini' | 'StarCoder';
      complexity: 'low' | 'medium' | 'high';
      tokens?: number;
    }>,
    workspaceId?: string
  ): Promise<{
    totalTokens: number;
    remainingTokens: number;
    userId: string;
    workspaceId?: string;
    feature: string;
    requestCount: number;
  }> {
    const response = await apiClient.post('/api/v1/tokens/record-usage', {
      userId,
      workspaceId,
      sessionId,
      feature,
      requests,
    });

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Failed to record token usage');
  }

  /**
   * Purchase additional tokens
   */
  async purchaseTokens(
    userId: string,
    tokensToPurchase: number,
    workspaceId?: string
  ): Promise<{
    newTokenPool: number;
    cost: number;
    tokensPurchased: number;
  }> {
    const response = await apiClient.post('/api/v1/tokens/purchase', {
      userId,
      workspaceId,
      tokensToPurchase,
    });

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Failed to purchase tokens');
  }

  /**
   * Calculate percentage of tokens used (for progress bar)
   */
  calculateUsagePercentage(pool: TokenPool): number {
    if (pool.monthlyTokens === 0) return 0;
    return Math.round((pool.usedTokens / pool.monthlyTokens) * 100);
  }

  /**
   * Calculate percentage of tokens remaining (for progress bar display)
   */
  calculateRemainingPercentage(pool: TokenPool): number {
    if (pool.monthlyTokens === 0) return 0;
    return Math.round((pool.availableTokens / pool.monthlyTokens) * 100);
  }

  /**
   * Check if user is running low on tokens (< 20%)
   */
  isLowOnTokens(pool: TokenPool): boolean {
    return this.calculateRemainingPercentage(pool) < 20;
  }

  /**
   * Format token balance for display
   */
  formatTokenBalance(availableTokens: number): string {
    return `${availableTokens.toFixed(1)} left`;
  }
}

export const tokenService = new TokenService();

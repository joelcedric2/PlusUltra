import { Injectable } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface RedisTokenResult {
  success: boolean;
  usedTokens: number;
  totalTokens: number;
  reason?: string;
  periodStart?: string;
  subscriptionId?: string;
}

@Injectable()
export class RedisTokenService {
  private luaScript: string = '';
  private luaSha: string | null = null;

  constructor(
    private readonly redis: any, // Redis client
    private readonly prisma: any // Prisma client
  ) {
    this.loadLuaScript();
  }

  /**
   * Load the Lua script and cache its SHA for performance
   */
  private async loadLuaScript(): Promise<void> {
    try {
      const scriptPath = path.join(__dirname, 'redis-decrement.lua');
      this.luaScript = await fs.readFile(scriptPath, 'utf8');

      // Load script into Redis and get SHA
      this.luaSha = await this.redis.scriptLoad(this.luaScript);
    } catch (error) {
      console.error('Failed to load Redis Lua script:', error);
      throw error;
    }
  }

  /**
   * Atomically consume tokens using Redis Lua script
   */
  async consumeTokensRedis(
    ownerId: string,
    ownerType: 'user' | 'workspace',
    tokens: number,
    metadata?: {
      agent?: string;
      feature?: string;
      workflowId?: string;
    }
  ): Promise<RedisTokenResult> {
    try {
      if (!this.luaSha) {
        await this.loadLuaScript();
      }

      // Create Redis key for token pool
      const currentPeriod = await this.getCurrentRedisPeriod(ownerId, ownerType);
      const poolKey = `token_pool:${ownerType}:${ownerId}:${currentPeriod}`;

      // Execute Lua script
      const result = await this.redis.evalsha(
        this.luaSha,
        1, // Number of keys
        poolKey, // Keys array
        tokens.toString(), // Arguments
        ownerId,
        ownerType,
        Date.now().toString()
      );

      const [success, usedTokens, totalTokens, periodStart, subscriptionId] = result as any[];

      if (success === 0) {
        return {
          success: false,
          usedTokens,
          totalTokens,
          reason: 'insufficient_tokens'
        };
      }

      // Queue reconciliation with PostgreSQL (async)
      this.queuePostgresReconciliation({
        ownerId,
        ownerType,
        tokens,
        periodStart,
        subscriptionId,
        metadata
      }).catch(error => {
        console.error('PostgreSQL reconciliation failed:', error);
      });

      return {
        success: true,
        usedTokens,
        totalTokens,
        periodStart,
        subscriptionId
      };

    } catch (error) {
      console.error('Redis token consumption failed:', error);

      // Fallback to PostgreSQL if Redis fails
      const tokenService = new (require('./TokenEconomyService').default)(this.prisma);
      const result = await tokenService.consumeTokens(ownerId, ownerType, tokens, metadata);

      return {
        success: result.success,
        usedTokens: result.usedTokens,
        totalTokens: result.totalTokens,
        reason: result.reason
      };
    }
  }

  /**
   * Get current billing period key for Redis
   */
  private async getCurrentRedisPeriod(ownerId: string, ownerType: 'user' | 'workspace'): Promise<string> {
    // Get current subscription from PostgreSQL
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
      throw new Error('No active subscription found');
    }

    // Format period as YYYY-MM for Redis keys
    const periodDate = new Date(subscription.currentPeriodStart);
    return `${periodDate.getFullYear()}-${String(periodDate.getMonth() + 1).padStart(2, '0')}`;
  }

  /**
   * Queue PostgreSQL reconciliation for eventual consistency
   */
  private async queuePostgresReconciliation(data: {
    ownerId: string;
    ownerType: 'user' | 'workspace';
    tokens: number;
    periodStart: string;
    subscriptionId: string;
    metadata?: any;
  }): Promise<void> {
    // Add to reconciliation queue (could be Redis list or job queue)
    const reconciliationData = {
      ...data,
      timestamp: Date.now(),
      type: 'token_consumption'
    };

    await this.redis.lpush('token_reconciliation', JSON.stringify(reconciliationData));

    // Trigger reconciliation worker (in production, use a job queue)
    this.triggerReconciliationWorker();
  }

  /**
   * Trigger the reconciliation worker to sync Redis state to PostgreSQL
   */
  private async triggerReconciliationWorker(): Promise<void> {
    // In production, you'd use Bull/Agenda/Bee Queue for this
    // For now, we'll do a simple async reconciliation
    setImmediate(async () => {
      await this.performReconciliation();
    });
  }

  /**
   * Perform reconciliation between Redis and PostgreSQL
   */
  private async performReconciliation(): Promise<void> {
    try {
      const batchSize = 100;

      for (let i = 0; i < batchSize; i++) {
        const item = await this.redis.rpop('token_reconciliation');

        if (!item) break;

        const data = JSON.parse(item);

        await this.prisma.$transaction(async (tx: any) => {
          // Update PostgreSQL token pool
          await tx.tokenPool.updateMany({
            where: {
              subscriptionId: data.subscriptionId,
              ownerId: data.ownerId,
              ownerType: data.ownerType,
              periodStart: new Date(data.periodStart)
            },
            data: {
              usedTokens: {
                increment: data.tokens
              },
              updatedAt: new Date()
            }
          });

          // Log to PostgreSQL audit table
          await tx.tokenUsage.create({
            data: {
              subscriptionId: data.subscriptionId,
              ownerId: data.ownerId,
              ownerType: data.ownerType,
              agent: data.metadata?.agent || 'unknown',
              feature: data.metadata?.feature || 'unknown',
              tokensConsumed: data.tokens,
              workflowId: data.metadata?.workflowId,
              metadata: data.metadata || {}
            }
          });
        });
      }
    } catch (error) {
      console.error('Reconciliation failed:', error);
    }
  }

  /**
   * Initialize Redis token pool from PostgreSQL
   */
  async initializeRedisPool(
    ownerId: string,
    ownerType: 'user' | 'workspace'
  ): Promise<void> {
    try {
      const currentPeriod = await this.getCurrentRedisPeriod(ownerId, ownerType);
      const poolKey = `token_pool:${ownerType}:${ownerId}:${currentPeriod}`;

      // Get current state from PostgreSQL
      const pool = await this.prisma.tokenPool.findFirst({
        where: {
          ownerId,
          ownerType,
          periodStart: new Date(currentPeriod + '-01') // Convert YYYY-MM to date
        }
      });

      if (pool) {
        // Initialize Redis with current PostgreSQL state
        await this.redis.hmset(poolKey, {
          total_tokens: pool.totalTokens.toString(),
          used_tokens: pool.usedTokens.toString(),
          period_start: pool.periodStart.toISOString(),
          subscription_id: pool.subscriptionId
        });
      }
    } catch (error) {
      console.error('Failed to initialize Redis pool:', error);
    }
  }

  /**
   * Get token usage statistics from Redis for fast queries
   */
  async getRedisUsageStats(
    ownerId: string,
    ownerType: 'user' | 'workspace',
    days: number = 30
  ): Promise<{
    totalUsed: number;
    averagePerDay: number;
    peakDay: number;
  }> {
    try {
      const usageKey = `token_usage:${ownerId}:${ownerType}`;
      const cutoffTime = Date.now() - (days * 24 * 60 * 60 * 1000);

      // Get usage entries within time range
      const usageEntries = await this.redis.zrangebyscore(
        usageKey,
        cutoffTime,
        '+inf',
        'WITHSCORES'
      );

      let totalUsed = 0;
      let peakDay = 0;
      const dailyUsage = new Map<string, number>();

      for (let i = 0; i < usageEntries.length; i += 2) {
        const tokens = parseInt(usageEntries[i]);
        const timestamp = parseInt(usageEntries[i + 1]);

        totalUsed += tokens;

        const day = new Date(timestamp).toDateString();
        dailyUsage.set(day, (dailyUsage.get(day) || 0) + tokens);

        if ((dailyUsage.get(day) || 0) > peakDay) {
          peakDay = dailyUsage.get(day) || 0;
        }
      }

      const averagePerDay = dailyUsage.size > 0 ? totalUsed / dailyUsage.size : 0;

      return {
        totalUsed,
        averagePerDay: Math.round(averagePerDay),
        peakDay
      };
    } catch (error) {
      console.error('Failed to get Redis usage stats:', error);
      return {
        totalUsed: 0,
        averagePerDay: 0,
        peakDay: 0
      };
    }
  }
}

export default RedisTokenService;

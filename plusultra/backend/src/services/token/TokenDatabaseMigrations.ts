import { DatabaseMigrations } from '../database/DatabaseMigrations';

/**
 * Database schema and operations for token management system
 * Extends the base DatabaseMigrations class to add token-specific tables and functionality
 */
export class TokenDatabaseMigrations extends DatabaseMigrations {
  /**
   * Create all token-related database tables
   * Sets up schema for usage tracking, token pools, alerts, and analytics
   */
  async createTokenTables(): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Token usage tracking table - records every AI interaction
      await client.query(`
        CREATE TABLE IF NOT EXISTS token_usage (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id TEXT NOT NULL,
          workspace_id TEXT,
          session_id TEXT NOT NULL,
          feature TEXT NOT NULL,
          agent TEXT NOT NULL CHECK (agent IN ('GPT5', 'Claude', 'Gemini', 'StarCoder')),
          tokens_used INTEGER NOT NULL,
          cost DECIMAL(10,4) NOT NULL,
          timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          metadata JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

          CONSTRAINT positive_tokens CHECK (tokens_used > 0),
          CONSTRAINT positive_cost CHECK (cost >= 0)
        );

        CREATE INDEX IF NOT EXISTS idx_token_usage_user_id ON token_usage(user_id);
        CREATE INDEX IF NOT EXISTS idx_token_usage_workspace_id ON token_usage(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_token_usage_timestamp ON token_usage(timestamp);
        CREATE INDEX IF NOT EXISTS idx_token_usage_feature ON token_usage(feature);
        CREATE INDEX IF NOT EXISTS idx_token_usage_agent ON token_usage(agent);
      `);

      // Token pools table - manages user token allocations
      await client.query(`
        CREATE TABLE IF NOT EXISTS token_pools (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id TEXT NOT NULL,
          workspace_id TEXT,
          tier TEXT NOT NULL CHECK (tier IN ('free', 'starter', 'pro', 'enterprise')),
          monthly_tokens INTEGER NOT NULL,
          used_tokens INTEGER NOT NULL DEFAULT 0,
          rollover_tokens INTEGER NOT NULL DEFAULT 0,
          reset_date TIMESTAMPTZ NOT NULL,
          last_updated TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(user_id, workspace_id),

          CONSTRAINT positive_pool_tokens CHECK (monthly_tokens > 0),
          CONSTRAINT valid_used_tokens CHECK (used_tokens >= 0),
          CONSTRAINT valid_rollover_tokens CHECK (rollover_tokens >= 0)
        );

        CREATE INDEX IF NOT EXISTS idx_token_pools_user_id ON token_pools(user_id);
        CREATE INDEX IF NOT EXISTS idx_token_pools_workspace_id ON token_pools(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_token_pools_tier ON token_pools(tier);
        CREATE INDEX IF NOT EXISTS idx_token_pools_reset_date ON token_pools(reset_date);
      `);

      // Token purchases table (for top-ups)
      await client.query(`
        CREATE TABLE IF NOT EXISTS token_purchases (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id TEXT NOT NULL,
          workspace_id TEXT,
          tokens_purchased INTEGER NOT NULL,
          amount_paid DECIMAL(10,2) NOT NULL,
          payment_method TEXT,
          stripe_payment_id TEXT,
          timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

          CONSTRAINT positive_purchase_tokens CHECK (tokens_purchased > 0),
          CONSTRAINT positive_amount CHECK (amount_paid >= 0)
        );

        CREATE INDEX IF NOT EXISTS idx_token_purchases_user_id ON token_purchases(user_id);
        CREATE INDEX IF NOT EXISTS idx_token_purchases_workspace_id ON token_purchases(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_token_purchases_timestamp ON token_purchases(timestamp);
      `);

      // Token alerts table - notifications for usage thresholds
      await client.query(`
        CREATE TABLE IF NOT EXISTS token_alerts (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id TEXT NOT NULL,
          workspace_id TEXT,
          alert_type TEXT NOT NULL CHECK (alert_type IN ('warning', 'critical', 'upgrade')),
          message TEXT NOT NULL,
          threshold_percentage INTEGER,
          current_usage INTEGER,
          is_read BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

          CONSTRAINT valid_usage_percentage CHECK (current_usage >= 0 AND current_usage <= 100)
        );

        CREATE INDEX IF NOT EXISTS idx_token_alerts_user_id ON token_alerts(user_id);
        CREATE INDEX IF NOT EXISTS idx_token_alerts_workspace_id ON token_alerts(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_token_alerts_type ON token_alerts(alert_type);
        CREATE INDEX IF NOT EXISTS idx_token_alerts_read ON token_alerts(is_read);
      `);

      // Create trigger to update updated_at timestamp
      await client.query(`
        CREATE OR REPLACE FUNCTION update_updated_at_column()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ language 'plpgsql';

        DROP TRIGGER IF EXISTS update_token_usage_updated_at ON token_usage;
        CREATE TRIGGER update_token_usage_updated_at
          BEFORE UPDATE ON token_usage
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

        DROP TRIGGER IF EXISTS update_token_pools_updated_at ON token_pools;
        CREATE TRIGGER update_token_pools_updated_at
          BEFORE UPDATE ON token_pools
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

        DROP TRIGGER IF EXISTS update_token_alerts_updated_at ON token_alerts;
        CREATE TRIGGER update_token_alerts_updated_at
          BEFORE UPDATE ON token_alerts
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      `);

      await client.query('COMMIT');
      console.log('✅ Token database tables created successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('❌ Failed to create token tables:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Record a token usage event
   * Inserts usage data and updates token pool balance
   */
  async recordTokenUsage(
    userId: string,
    workspaceId: string | undefined,
    tokensUsed: number,
    feature: string,
    agent: string,
    sessionId: string
  ): Promise<void> {
    const client = await this.pool.connect();

    try {
      // Calculate cost ($0.002 per token)
      const cost = tokensUsed * 0.002;

      // Record usage
      await client.query(`
        INSERT INTO token_usage (user_id, workspace_id, session_id, feature, agent, tokens_used, cost)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
      `, [userId, workspaceId, sessionId, feature, agent, tokensUsed, cost]);

      // Update token pool
      await client.query(`
        UPDATE token_pools
        SET used_tokens = used_tokens + $3, last_updated = NOW()
        WHERE user_id = $1 AND (workspace_id = $2 OR (workspace_id IS NULL AND $2 IS NULL))
      `, [userId, workspaceId, tokensUsed]);

      // Check if alert should be created
      const poolResult = await client.query(`
        SELECT * FROM token_pools
        WHERE user_id = $1 AND (workspace_id = $2 OR (workspace_id IS NULL AND $2 IS NULL))
      `, [userId, workspaceId]);

      if (poolResult.rows.length > 0) {
        const pool = poolResult.rows[0];
        const usagePercent = (pool.used_tokens / pool.monthly_tokens) * 100;

        // Create alerts for high usage thresholds
        if (usagePercent >= 90) {
          await client.query(`
            INSERT INTO token_alerts (user_id, workspace_id, alert_type, message, threshold_percentage, current_usage)
            VALUES ($1, $2, 'critical', 'Token usage is above 90%. Consider upgrading your plan.', 90, $3)
            ON CONFLICT DO NOTHING
          `, [userId, workspaceId, Math.round(usagePercent)]);
        } else if (usagePercent >= 80) {
          await client.query(`
            INSERT INTO token_alerts (user_id, workspace_id, alert_type, message, threshold_percentage, current_usage)
            VALUES ($1, $2, 'warning', 'Token usage is above 80%. Monitor usage and consider upgrading soon.', 80, $3)
            ON CONFLICT DO NOTHING
          `, [userId, workspaceId, Math.round(usagePercent)]);
        }
      }

      console.log(`✅ Recorded ${tokensUsed} tokens used by ${userId} for ${feature}`);
    } catch (error) {
      console.error('❌ Failed to record token usage:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get token usage history for a user
   * Retrieves paginated usage records with optional workspace filtering
   */
  async getTokenUsage(userId: string, workspaceId?: string, limit: number = 100): Promise<any[]> {
    const client = await this.pool.connect();

    try {
      let query = `
        SELECT * FROM token_usage
        WHERE user_id = $1
      `;
      const params = [userId];

      if (workspaceId) {
        query += ` AND workspace_id = $2`;
        params.push(workspaceId);
      }

      query += ` ORDER BY timestamp DESC LIMIT $${params.length + 1}`;
      params.push(limit.toString());

      const result = await client.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('❌ Failed to get token usage:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get or create token pool for user
   * Creates default pool if none exists
   */
  async getTokenPool(userId: string, workspaceId?: string): Promise<any | null> {
    const client = await this.pool.connect();

    try {
      let query = `SELECT * FROM token_pools WHERE user_id = $1`;
      const params = [userId];

      if (workspaceId) {
        query += ` AND workspace_id = $2`;
        params.push(workspaceId);
      }

      const result = await client.query(query, params);

      if (result.rows.length === 0) {
        // Create default pool if it doesn't exist
        const defaultPool = {
          user_id: userId,
          workspace_id: workspaceId || null,
          tier: 'free',
          monthly_tokens: 50000,
          used_tokens: 0,
          rollover_tokens: 0,
          reset_date: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1)
        };

        await client.query(`
          INSERT INTO token_pools (user_id, workspace_id, tier, monthly_tokens, used_tokens, rollover_tokens, reset_date)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
        `, [
          defaultPool.user_id,
          defaultPool.workspace_id,
          defaultPool.tier,
          defaultPool.monthly_tokens,
          defaultPool.used_tokens,
          defaultPool.rollover_tokens,
          defaultPool.reset_date
        ]);

        return defaultPool;
      }

      return result.rows[0];
    } catch (error) {
      console.error('❌ Failed to get token pool:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Update token pool after usage
   * Increments used tokens and updates last modified timestamp
   */
  async updateTokenPool(userId: string, workspaceId: string | undefined, tokensUsed: number): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query(`
        UPDATE token_pools
        SET used_tokens = used_tokens + $3, last_updated = NOW()
        WHERE user_id = $1 AND (workspace_id = $2 OR (workspace_id IS NULL AND $2 IS NULL))
      `, [userId, workspaceId, tokensUsed]);

      console.log(`✅ Updated token pool for ${userId}: +${tokensUsed} tokens used`);
    } catch (error) {
      console.error('❌ Failed to update token pool:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get token alerts for user
   * Returns unread alerts for usage threshold warnings
   */
  async getTokenAlerts(userId: string, workspaceId?: string): Promise<any[]> {
    const client = await this.pool.connect();

    try {
      let query = `SELECT * FROM token_alerts WHERE user_id = $1 AND is_read = false`;
      const params = [userId];

      if (workspaceId) {
        query += ` AND workspace_id = $2`;
        params.push(workspaceId);
      }

      query += ` ORDER BY created_at DESC`;

      const result = await client.query(query, params);
      return result.rows;
    } catch (error) {
      console.error('❌ Failed to get token alerts:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Mark alerts as read for user
   * Updates alert status to prevent repeated notifications
   */
  async markAlertsAsRead(userId: string, workspaceId?: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      let query = `UPDATE token_alerts SET is_read = true WHERE user_id = $1`;
      const params = [userId];

      if (workspaceId) {
        query += ` AND workspace_id = $2`;
        params.push(workspaceId);
      }

      await client.query(query, params);
      console.log(`✅ Marked alerts as read for ${userId}`);
    } catch (error) {
      console.error('❌ Failed to mark alerts as read:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Reset monthly token pools
   * Calculates rollover tokens (15% of unused) and resets counters
   */
  async resetMonthlyTokens(): Promise<void> {
    const client = await this.pool.connect();

    try {
      // Get all pools that need reset
      const poolsToReset = await client.query(`
        SELECT * FROM token_pools WHERE reset_date <= NOW()
      `);

      for (const pool of poolsToReset.rows) {
        // Calculate rollover (15% of unused tokens)
        const unusedTokens = pool.monthly_tokens - pool.used_tokens;
        const rolloverTokens = Math.floor(unusedTokens * 0.15);

        // Reset the pool
        await client.query(`
          UPDATE token_pools
          SET
            used_tokens = 0,
            rollover_tokens = $3,
            monthly_tokens = monthly_tokens + $3,
            reset_date = $4,
            last_updated = NOW()
          WHERE id = $1
        `, [pool.id, rolloverTokens, this.getNextResetDate()]);
      }

      console.log(`✅ Reset ${poolsToReset.rows.length} token pools`);
    } catch (error) {
      console.error('❌ Failed to reset monthly tokens:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Get comprehensive token statistics for analytics
   * Includes usage patterns, agent breakdowns, and cost analysis
   */
  async getTokenStats(userId: string, workspaceId?: string, days: number = 30): Promise<any> {
    const client = await this.pool.connect();

    try {
      const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      let query = `
        SELECT
          COUNT(*) as total_usages,
          SUM(tokens_used) as total_tokens,
          SUM(cost) as total_cost,
          AVG(tokens_used) as avg_tokens_per_usage,
          MAX(timestamp) as last_usage
        FROM token_usage
        WHERE user_id = $1 AND timestamp >= $2
      `;
      const params = [userId, cutoffDate];

      if (workspaceId) {
        query += ` AND workspace_id = $3`;
        params.push(workspaceId);
      }

      const result = await client.query(query, params);

      // Get agent breakdown
      let agentQuery = `
        SELECT agent, SUM(tokens_used) as tokens
        FROM token_usage
        WHERE user_id = $1 AND timestamp >= $2
      `;
      const agentParams = [userId, cutoffDate];

      if (workspaceId) {
        agentQuery += ` AND workspace_id = $3`;
        agentParams.push(workspaceId);
      }

      agentQuery += ` GROUP BY agent ORDER BY tokens DESC`;

      const agentResult = await client.query(agentQuery, agentParams);

      return {
        ...result.rows[0],
        agent_breakdown: agentResult.rows,
        period_days: days
      };
    } catch (error) {
      console.error('❌ Failed to get token stats:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Calculate next monthly reset date
   * Always returns the 1st of the next month
   */
  private getNextResetDate(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 1);
  }
}

export default TokenDatabaseMigrations;

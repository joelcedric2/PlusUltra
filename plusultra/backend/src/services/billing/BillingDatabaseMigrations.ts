import { DatabaseMigrations } from '../database/DatabaseMigrations';

export class BillingDatabaseMigrations extends DatabaseMigrations {
  async createBillingTables(): Promise<void> {
    const client = await this.pool.connect();

    try {
      // Billing records table
      await client.query(`
        CREATE TABLE IF NOT EXISTS billing_records (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id TEXT NOT NULL,
          workspace_id TEXT,
          payment_intent_id TEXT NOT NULL,
          amount DECIMAL(10,2) NOT NULL,
          currency TEXT NOT NULL DEFAULT 'usd',
          status TEXT NOT NULL CHECK (status IN ('pending', 'completed', 'failed', 'refunded')),
          payment_method TEXT NOT NULL CHECK (payment_method IN ('stripe', 'paypal', 'crypto')),
          tokens_purchased INTEGER,
          tier_upgraded TEXT CHECK (tier_upgraded IN ('free', 'starter', 'pro', 'enterprise')),
          description TEXT NOT NULL,
          stripe_payment_id TEXT,
          metadata JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_billing_records_user_id ON billing_records(user_id);
        CREATE INDEX IF NOT EXISTS idx_billing_records_workspace_id ON billing_records(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_billing_records_payment_intent_id ON billing_records(payment_intent_id);
        CREATE INDEX IF NOT EXISTS idx_billing_records_status ON billing_records(status);
        CREATE INDEX IF NOT EXISTS idx_billing_records_created_at ON billing_records(created_at);
      `);

      // Subscriptions table
      await client.query(`
        CREATE TABLE IF NOT EXISTS subscriptions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id TEXT NOT NULL,
          workspace_id TEXT,
          stripe_subscription_id TEXT NOT NULL UNIQUE,
          tier TEXT NOT NULL CHECK (tier IN ('free', 'starter', 'pro', 'enterprise')),
          status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'past_due', 'incomplete', 'trialing')),
          current_period_start TIMESTAMPTZ NOT NULL,
          current_period_end TIMESTAMPTZ NOT NULL,
          cancel_at_period_end BOOLEAN NOT NULL DEFAULT FALSE,
          metadata JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
        CREATE INDEX IF NOT EXISTS idx_subscriptions_workspace_id ON subscriptions(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);
        CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);
        CREATE INDEX IF NOT EXISTS idx_subscriptions_tier ON subscriptions(tier);
      `);

      // Payment methods table
      await client.query(`
        CREATE TABLE IF NOT EXISTS payment_methods (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id TEXT NOT NULL,
          workspace_id TEXT,
          stripe_payment_method_id TEXT NOT NULL,
          type TEXT NOT NULL CHECK (type IN ('card', 'bank_account')),
          last_four TEXT,
          brand TEXT,
          expiry_month INTEGER,
          expiry_year INTEGER,
          is_default BOOLEAN NOT NULL DEFAULT FALSE,
          metadata JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_payment_methods_user_id ON payment_methods(user_id);
        CREATE INDEX IF NOT EXISTS idx_payment_methods_workspace_id ON payment_methods(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_payment_methods_stripe_id ON payment_methods(stripe_payment_method_id);
        CREATE INDEX IF NOT EXISTS idx_payment_methods_default ON payment_methods(is_default);
      `);

      // Invoices table
      await client.query(`
        CREATE TABLE IF NOT EXISTS invoices (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id TEXT NOT NULL,
          workspace_id TEXT,
          stripe_invoice_id TEXT UNIQUE,
          subscription_id UUID REFERENCES subscriptions(id),
          amount DECIMAL(10,2) NOT NULL,
          currency TEXT NOT NULL DEFAULT 'usd',
          status TEXT NOT NULL CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),
          invoice_pdf TEXT,
          hosted_invoice_url TEXT,
          metadata JSONB,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
        CREATE INDEX IF NOT EXISTS idx_invoices_workspace_id ON invoices(workspace_id);
        CREATE INDEX IF NOT EXISTS idx_invoices_stripe_id ON invoices(stripe_invoice_id);
        CREATE INDEX IF NOT EXISTS idx_invoices_subscription_id ON invoices(subscription_id);
        CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
      `);

      // Webhook events table (for Stripe webhook processing)
      await client.query(`
        CREATE TABLE IF NOT EXISTS webhook_events (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          stripe_event_id TEXT NOT NULL UNIQUE,
          event_type TEXT NOT NULL,
          processed BOOLEAN NOT NULL DEFAULT FALSE,
          data JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS idx_webhook_events_stripe_id ON webhook_events(stripe_event_id);
        CREATE INDEX IF NOT EXISTS idx_webhook_events_type ON webhook_events(event_type);
        CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed);
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

        DROP TRIGGER IF EXISTS update_billing_records_updated_at ON billing_records;
        CREATE TRIGGER update_billing_records_updated_at
          BEFORE UPDATE ON billing_records
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

        DROP TRIGGER IF EXISTS update_subscriptions_updated_at ON subscriptions;
        CREATE TRIGGER update_subscriptions_updated_at
          BEFORE UPDATE ON subscriptions
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

        DROP TRIGGER IF EXISTS update_payment_methods_updated_at ON payment_methods;
        CREATE TRIGGER update_payment_methods_updated_at
          BEFORE UPDATE ON payment_methods
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

        DROP TRIGGER IF EXISTS update_invoices_updated_at ON invoices;
        CREATE TRIGGER update_invoices_updated_at
          BEFORE UPDATE ON invoices
          FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
      `);

      console.log('Billing database tables created successfully');
    } finally {
      client.release();
    }
  }

  async getBillingHistory(userId: string, workspaceId?: string, limit: number = 50): Promise<any[]> {
    const client = await this.pool.connect();

    try {
      let query = `
        SELECT br.*, s.tier as subscription_tier, s.status as subscription_status
        FROM billing_records br
        LEFT JOIN subscriptions s ON br.user_id = s.user_id
          AND (br.workspace_id = s.workspace_id OR (br.workspace_id IS NULL AND s.workspace_id IS NULL))
        WHERE br.user_id = $1
      `;
      const params = [userId];
      if (workspaceId) {
        query += ` AND br.workspace_id = $2`;
        params.push(workspaceId);
      }

      query += ` ORDER BY br.created_at DESC LIMIT $${params.length + 1}`;
      params.push(limit.toString());

      const result = await client.query(query, params);
      return result.rows.map(row => ({
        ...row,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at),
        currentPeriodStart: row.current_period_start ? new Date(row.current_period_start) : null,
        currentPeriodEnd: row.current_period_end ? new Date(row.current_period_end) : null
      }));
    } finally {
      client.release();
    }
  }

  async getActiveSubscription(userId: string, workspaceId?: string): Promise<any | null> {
    const client = await this.pool.connect();

    try {
      let query = `
        SELECT * FROM subscriptions
        WHERE user_id = $1 AND status = 'active'
      `;
      const params = [userId];

      if (workspaceId) {
        query += ` AND workspace_id = $2`;
        params.push(workspaceId);
      }

      query += ` ORDER BY created_at DESC LIMIT 1`;

      const result = await client.query(query, params);

      if (result.rows.length === 0) {
        return null;
      }

      const subscription = result.rows[0];
      return {
        ...subscription,
        currentPeriodStart: new Date(subscription.current_period_start),
        currentPeriodEnd: new Date(subscription.current_period_end),
        createdAt: new Date(subscription.created_at),
        updatedAt: new Date(subscription.updated_at)
      };
    } finally {
      client.release();
    }
  }

  async createBillingRecord(record: any): Promise<void> {
    const client = await this.pool.connect();

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
        record.updatedAt
      ]);
    } finally {
      client.release();
    }
  }

  async updateBillingRecord(paymentIntentId: string, status: string): Promise<void> {
    const client = await this.pool.connect();

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

  async createSubscription(subscription: any): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query(`
        INSERT INTO subscriptions (
          user_id, workspace_id, stripe_subscription_id, tier, status,
          current_period_start, current_period_end, cancel_at_period_end,
          metadata, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
      `, [
        subscription.userId,
        subscription.workspaceId,
        subscription.stripeSubscriptionId,
        subscription.tier,
        subscription.status,
        subscription.currentPeriodStart,
        subscription.currentPeriodEnd,
        subscription.cancelAtPeriodEnd,
        JSON.stringify(subscription.metadata || {}),
        subscription.createdAt,
        subscription.updatedAt
      ]);
    } finally {
      client.release();
    }
  }

  async updateSubscriptionStatus(stripeSubscriptionId: string, status: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query(`
        UPDATE subscriptions
        SET status = $2, updated_at = NOW()
        WHERE stripe_subscription_id = $1
      `, [stripeSubscriptionId, status]);
    } finally {
      client.release();
    }
  }

  async saveWebhookEvent(eventId: string, eventType: string, data: any): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query(`
        INSERT INTO webhook_events (stripe_event_id, event_type, data)
        VALUES ($1, $2, $3)
        ON CONFLICT (stripe_event_id) DO NOTHING
      `, [eventId, eventType, JSON.stringify(data)]);
    } finally {
      client.release();
    }
  }

  async markWebhookEventProcessed(eventId: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query(`
        UPDATE webhook_events
        SET processed = TRUE
        WHERE stripe_event_id = $1
      `, [eventId]);
    } finally {
      client.release();
    }
  }

  async getUnprocessedWebhookEvents(): Promise<any[]> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(`
        SELECT * FROM webhook_events
        WHERE processed = FALSE
        ORDER BY created_at ASC
        LIMIT 100
      `);

      return result.rows.map(row => ({
        ...row,
        data: typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
        createdAt: new Date(row.created_at)
      }));
    } finally {
      client.release();
    }
  }

  async getUserInvoices(userId: string, workspaceId?: string, limit: number = 20): Promise<any[]> {
    const client = await this.pool.connect();

    try {
      let query = `
        SELECT i.*, s.tier as subscription_tier
        FROM invoices i
        LEFT JOIN subscriptions s ON i.subscription_id = s.id
        WHERE i.user_id = $1
      `;
      const params = [userId];

      if (workspaceId) {
        query += ` AND i.workspace_id = $2`;
        params.push(workspaceId);
      }

      query += ` ORDER BY i.created_at DESC LIMIT $${params.length + 1}`;
      params.push(limit.toString());

      const result = await client.query(query, params);
      return result.rows.map(row => ({
        ...row,
        createdAt: new Date(row.created_at),
        updatedAt: new Date(row.updated_at)
      }));
    } finally {
      client.release();
    }
  }

  async createInvoice(invoice: any): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query(`
        INSERT INTO invoices (
          user_id, workspace_id, stripe_invoice_id, subscription_id, amount,
          currency, status, invoice_pdf, hosted_invoice_url, metadata, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      `, [
        invoice.userId,
        invoice.workspaceId,
        invoice.stripeInvoiceId,
        invoice.subscriptionId,
        invoice.amount,
        invoice.currency,
        invoice.status,
        invoice.invoicePdf,
        invoice.hostedInvoiceUrl,
        JSON.stringify(invoice.metadata || {}),
        invoice.createdAt,
        invoice.updatedAt
      ]);
    } finally {
      client.release();
    }
  }

  // Provide access to pool for BillingService (temporary solution)
  getPool(): any {
    return this.pool;
  }

  // Token pool management (temporary - should be moved to dedicated service)
  async getTokenPool(userId: string, workspaceId?: string): Promise<any> {
    const client = await this.pool.connect();

    try {
      const searchKey = workspaceId ? `pool-${userId}-${workspaceId}` : `pool-${userId}`;
      const result = await client.query(
        'SELECT metadata FROM vector_store WHERE id = $1',
        [searchKey]
      );

      if (result.rows.length > 0) {
        return result.rows[0].metadata;
      }

      // Return default pool if not found
      return {
        userId,
        workspaceId,
        tier: 'free',
        monthlyTokens: 50000,
        usedTokens: 0,
        resetDate: new Date(),
        rolloverTokens: 0,
        lastUpdated: new Date()
      };
    } finally {
      client.release();
    }
  }
}

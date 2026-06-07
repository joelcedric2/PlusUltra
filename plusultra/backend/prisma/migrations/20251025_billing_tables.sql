-- Migration: Add Billing and Token Economy Tables
-- Created: 2025-10-25

-- Add billing fields to users table
ALTER TABLE users
ADD COLUMN IF NOT EXISTS tier TEXT DEFAULT 'free' CHECK (tier IN ('free', 'starter', 'pro', 'enterprise')),
ADD COLUMN IF NOT EXISTS token_balance INTEGER DEFAULT 100,
ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS stripe_subscription_id TEXT UNIQUE,
ADD COLUMN IF NOT EXISTS last_token_reset_at TIMESTAMPTZ DEFAULT NOW();

-- Create index on tier for faster queries
CREATE INDEX IF NOT EXISTS idx_users_tier ON users(tier);
CREATE INDEX IF NOT EXISTS idx_users_stripe_customer ON users(stripe_customer_id);

-- Create token_transactions table
CREATE TABLE IF NOT EXISTS token_transactions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  amount INTEGER NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('consumption', 'refund', 'bonus', 'purchase')),
  source TEXT NOT NULL CHECK (source IN ('gpt4', 'claude', 'gemini', 'system')),
  source_tokens BIGINT NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  metadata JSONB DEFAULT '{}',
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for token_transactions
CREATE INDEX IF NOT EXISTS idx_token_transactions_user_id ON token_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_token_transactions_timestamp ON token_transactions(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_token_transactions_type ON token_transactions(type);
CREATE INDEX IF NOT EXISTS idx_token_transactions_user_timestamp ON token_transactions(user_id, timestamp DESC);

-- Create subscriptions table (for tracking)
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE NOT NULL,
  stripe_customer_id TEXT NOT NULL,
  tier TEXT NOT NULL CHECK (tier IN ('free', 'starter', 'pro', 'enterprise')),
  status TEXT NOT NULL CHECK (status IN ('active', 'canceled', 'past_due', 'incomplete', 'trialing')),
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly', 'yearly')),
  current_period_start TIMESTAMPTZ NOT NULL,
  current_period_end TIMESTAMPTZ NOT NULL,
  cancel_at_period_end BOOLEAN DEFAULT false,
  canceled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for subscriptions
CREATE INDEX IF NOT EXISTS idx_subscriptions_user_id ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_id ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- Create invoices table
CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  stripe_invoice_id TEXT UNIQUE NOT NULL,
  stripe_subscription_id TEXT,
  amount_paid INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'usd',
  status TEXT NOT NULL CHECK (status IN ('draft', 'open', 'paid', 'void', 'uncollectible')),
  invoice_number TEXT,
  invoice_pdf_url TEXT,
  hosted_invoice_url TEXT,
  period_start TIMESTAMPTZ,
  period_end TIMESTAMPTZ,
  due_date TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for invoices
CREATE INDEX IF NOT EXISTS idx_invoices_user_id ON invoices(user_id);
CREATE INDEX IF NOT EXISTS idx_invoices_stripe_id ON invoices(stripe_invoice_id);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
CREATE INDEX IF NOT EXISTS idx_invoices_paid_at ON invoices(paid_at DESC);

-- Create usage_limits table (for tracking limits breaches)
CREATE TABLE IF NOT EXISTS usage_limits (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  resource_type TEXT NOT NULL CHECK (resource_type IN ('tokens', 'projects', 'collaborators', 'storage')),
  limit_value INTEGER NOT NULL,
  current_value INTEGER NOT NULL DEFAULT 0,
  exceeded_at TIMESTAMPTZ,
  notified_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for usage_limits
CREATE INDEX IF NOT EXISTS idx_usage_limits_user_id ON usage_limits(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_limits_resource_type ON usage_limits(resource_type);
CREATE INDEX IF NOT EXISTS idx_usage_limits_exceeded_at ON usage_limits(exceeded_at) WHERE exceeded_at IS NOT NULL;

-- Create function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create triggers for updated_at
CREATE TRIGGER update_users_updated_at
  BEFORE UPDATE ON users
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_usage_limits_updated_at
  BEFORE UPDATE ON usage_limits
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Create view for monthly token usage
CREATE OR REPLACE VIEW monthly_token_usage AS
SELECT
  user_id,
  DATE_TRUNC('month', timestamp) AS month,
  SUM(CASE WHEN type = 'consumption' THEN amount ELSE 0 END) AS consumed,
  SUM(CASE WHEN type IN ('refund', 'bonus', 'purchase') THEN amount ELSE 0 END) AS added,
  SUM(CASE WHEN source = 'gpt4' AND type = 'consumption' THEN source_tokens ELSE 0 END) AS gpt4_tokens,
  SUM(CASE WHEN source = 'claude' AND type = 'consumption' THEN source_tokens ELSE 0 END) AS claude_tokens,
  SUM(CASE WHEN source = 'gemini' AND type = 'consumption' THEN source_tokens ELSE 0 END) AS gemini_tokens,
  COUNT(*) AS transaction_count
FROM token_transactions
GROUP BY user_id, DATE_TRUNC('month', timestamp);

-- Create view for user billing summary
CREATE OR REPLACE VIEW user_billing_summary AS
SELECT
  u.id AS user_id,
  u.email,
  u.tier,
  u.token_balance,
  u.stripe_customer_id,
  s.stripe_subscription_id,
  s.status AS subscription_status,
  s.billing_cycle,
  s.current_period_end,
  s.cancel_at_period_end,
  COALESCE(mtu.consumed, 0) AS monthly_tokens_consumed,
  CASE
    WHEN u.tier = 'free' THEN 100
    WHEN u.tier = 'starter' THEN 250
    WHEN u.tier = 'pro' THEN 1000
    WHEN u.tier = 'enterprise' THEN -1
  END AS monthly_token_limit,
  (SELECT COUNT(*) FROM projects WHERE owner_id = u.id) AS project_count,
  CASE
    WHEN u.tier = 'free' THEN 1
    WHEN u.tier = 'starter' THEN 4
    WHEN u.tier = 'pro' THEN 10
    WHEN u.tier = 'enterprise' THEN -1
  END AS project_limit
FROM users u
LEFT JOIN subscriptions s ON s.user_id = u.id AND s.status = 'active'
LEFT JOIN monthly_token_usage mtu ON mtu.user_id = u.id
  AND mtu.month = DATE_TRUNC('month', NOW());

-- Grant permissions
GRANT SELECT, INSERT, UPDATE, DELETE ON token_transactions TO authenticated;
GRANT SELECT ON subscriptions TO authenticated;
GRANT SELECT ON invoices TO authenticated;
GRANT SELECT ON usage_limits TO authenticated;
GRANT SELECT ON monthly_token_usage TO authenticated;
GRANT SELECT ON user_billing_summary TO authenticated;

-- Add Row Level Security policies

-- token_transactions: users can only see their own transactions
ALTER TABLE token_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY token_transactions_select_policy ON token_transactions
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY token_transactions_insert_policy ON token_transactions
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- subscriptions: users can only see their own subscriptions
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY subscriptions_select_policy ON subscriptions
  FOR SELECT USING (user_id = auth.uid());

-- invoices: users can only see their own invoices
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;

CREATE POLICY invoices_select_policy ON invoices
  FOR SELECT USING (user_id = auth.uid());

-- usage_limits: users can only see their own limits
ALTER TABLE usage_limits ENABLE ROW LEVEL SECURITY;

CREATE POLICY usage_limits_select_policy ON usage_limits
  FOR SELECT USING (user_id = auth.uid());

-- Add helpful comments
COMMENT ON TABLE token_transactions IS 'Tracks all PlusUltra token consumption and additions';
COMMENT ON COLUMN token_transactions.amount IS 'PlusUltra tokens (1 PT = 1M API tokens)';
COMMENT ON COLUMN token_transactions.source_tokens IS 'Actual API tokens consumed (GPT-4, Claude, Gemini)';

COMMENT ON TABLE subscriptions IS 'Tracks active and historical Stripe subscriptions';
COMMENT ON TABLE invoices IS 'Stores invoice data from Stripe for user reference';
COMMENT ON TABLE usage_limits IS 'Tracks resource usage against tier limits';

COMMENT ON VIEW monthly_token_usage IS 'Aggregated token usage per user per month';
COMMENT ON VIEW user_billing_summary IS 'Comprehensive billing and usage summary for users';

-- Insert default token balances for existing users
UPDATE users
SET token_balance = 100, tier = 'free'
WHERE token_balance IS NULL;

-- Create function to reset monthly tokens (run via cron)
CREATE OR REPLACE FUNCTION reset_monthly_tokens()
RETURNS void AS $$
BEGIN
  UPDATE users
  SET
    token_balance = CASE
      WHEN tier = 'free' THEN 100
      WHEN tier = 'starter' THEN 250
      WHEN tier = 'pro' THEN 1000
      WHEN tier = 'enterprise' THEN 999999
    END,
    last_token_reset_at = NOW()
  WHERE DATE_TRUNC('month', last_token_reset_at) < DATE_TRUNC('month', NOW());
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION reset_monthly_tokens IS 'Resets token balances on the 1st of each month (call via cron)';

-- Migration complete

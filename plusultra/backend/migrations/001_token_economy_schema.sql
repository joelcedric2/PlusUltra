-- PlusUltra Token Economy Database Schema
-- Migration: 001_token_economy_schema.sql

-- =====================================================
-- PLANS TABLE (Canonical tier definitions)
-- =====================================================

CREATE TABLE IF NOT EXISTS plans (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  monthly_price_cents INTEGER,
  token_pool BIGINT NOT NULL,
  projects INTEGER, -- NULL = unlimited
  collaborators INTEGER, -- NULL = unlimited
  storage_gb INTEGER, -- NULL = unlimited
  features JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- =====================================================
-- SUBSCRIPTIONS TABLE (Stripe integration)
-- =====================================================

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  workspace_id UUID REFERENCES workspaces(id) ON DELETE CASCADE,
  stripe_subscription_id TEXT UNIQUE,
  stripe_customer_id TEXT,
  plan_id TEXT NOT NULL REFERENCES plans(id),
  status TEXT NOT NULL CHECK (status IN ('active', 'past_due', 'canceled', 'unpaid', 'incomplete')),
  current_period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  current_period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  trial_start TIMESTAMP WITH TIME ZONE,
  trial_end TIMESTAMP WITH TIME ZONE,
  canceled_at TIMESTAMP WITH TIME ZONE,
  auto_topup_enabled BOOLEAN DEFAULT FALSE,
  auto_topup_amount_tokens INTEGER DEFAULT 100000,
  grace_period_days INTEGER DEFAULT 7,
  grace_expires_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_workspace ON subscriptions(workspace_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe ON subscriptions(stripe_subscription_id);

-- =====================================================
-- TOKEN POOLS TABLE (Billing period scoped)
-- =====================================================

CREATE TABLE IF NOT EXISTS token_pools (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL, -- user_id or workspace_id
  owner_type TEXT NOT NULL CHECK (owner_type IN ('user', 'workspace')),
  period_start TIMESTAMP WITH TIME ZONE NOT NULL,
  period_end TIMESTAMP WITH TIME ZONE NOT NULL,
  total_tokens BIGINT NOT NULL,
  used_tokens BIGINT NOT NULL DEFAULT 0,
  rollover_tokens BIGINT NOT NULL DEFAULT 0,
  rollover_allowed BOOLEAN DEFAULT TRUE,
  last_reset_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_pools_owner_period ON token_pools(owner_id, owner_type, period_start);
CREATE INDEX IF NOT EXISTS idx_token_pools_subscription ON token_pools(subscription_id);

-- =====================================================
-- TOKEN USAGE AUDIT TABLE
-- =====================================================

CREATE TABLE IF NOT EXISTS token_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  owner_id UUID NOT NULL,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('user', 'workspace')),
  agent TEXT NOT NULL,
  feature TEXT NOT NULL,
  workflow_type TEXT,
  tokens_consumed INTEGER NOT NULL,
  workflow_id UUID,
  metadata JSONB DEFAULT '{}',
  ip_address INET,
  user_agent TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_usage_owner_date ON token_usage(owner_id, owner_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_usage_workflow ON token_usage(workflow_id);

-- =====================================================
-- TOKEN PURCHASES TABLE (Top-ups and admin credits)
-- =====================================================

CREATE TABLE IF NOT EXISTS token_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL,
  owner_type TEXT NOT NULL CHECK (owner_type IN ('user', 'workspace')),
  stripe_payment_intent_id TEXT,
  purchase_type TEXT NOT NULL CHECK (purchase_type IN ('topup', 'admin_credit', 'proration')),
  tokens_purchased BIGINT NOT NULL,
  amount_cents INTEGER NOT NULL,
  admin_id UUID REFERENCES users(id),
  admin_reason TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_purchases_owner ON token_purchases(owner_id, owner_type, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_token_purchases_stripe ON token_purchases(stripe_payment_intent_id);

-- =====================================================
-- PRORATION ENTRIES TABLE (Upgrade/downgrade tracking)
-- =====================================================

CREATE TABLE IF NOT EXISTS proration_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id UUID NOT NULL REFERENCES subscriptions(id) ON DELETE CASCADE,
  old_plan_id TEXT NOT NULL REFERENCES plans(id),
  new_plan_id TEXT NOT NULL REFERENCES plans(id),
  proration_type TEXT NOT NULL CHECK (proration_type IN ('upgrade', 'downgrade')),
  prorated_tokens BIGINT NOT NULL,
  prorated_amount_cents INTEGER NOT NULL,
  effective_at TIMESTAMP WITH TIME ZONE NOT NULL,
  applied_at TIMESTAMP WITH TIME ZONE,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_proration_subscription ON proration_entries(subscription_id, created_at DESC);

-- =====================================================
-- SEED DATA: Plans Configuration
-- =====================================================

INSERT INTO plans (id, name, monthly_price_cents, token_pool, projects, collaborators, storage_gb, features) VALUES
('free', 'Free', 0, 50000, 1, 1, 5, '["web-export"]'::jsonb),
('starter', 'Starter', 2500, 250000, 3, 2, 25, '["multi-platform-export", "basic-app-store"]'::jsonb),
('pro', 'Pro', 10000, 1000000, NULL, 5, 100, '["all"]'::jsonb),
('enterprise', 'Enterprise', NULL, 8000000, NULL, NULL, NULL, '["dedicated-instance", "sla", "custom"]'::jsonb)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  monthly_price_cents = EXCLUDED.monthly_price_cents,
  token_pool = EXCLUDED.token_pool,
  projects = EXCLUDED.projects,
  collaborators = EXCLUDED.collaborators,
  storage_gb = EXCLUDED.storage_gb,
  features = EXCLUDED.features,
  updated_at = NOW();

-- =====================================================
-- FUNCTIONS: Utility Functions
-- =====================================================

-- Function to get current billing period start for a subscription
CREATE OR REPLACE FUNCTION get_current_period_start(sub_id UUID)
RETURNS TIMESTAMP WITH TIME ZONE AS $$
DECLARE
  sub_record subscriptions%ROWTYPE;
  period_start TIMESTAMP WITH TIME ZONE;
BEGIN
  SELECT * INTO sub_record FROM subscriptions WHERE id = sub_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Subscription not found';
  END IF;

  -- For monthly subscriptions, period starts on the same day each month
  -- This is a simplified version - you might want more sophisticated logic
  period_start := sub_record.current_period_start;

  RETURN period_start;
END;
$$ LANGUAGE plpgsql;

-- Function to calculate remaining tokens for an owner
CREATE OR REPLACE FUNCTION get_remaining_tokens(own_id UUID, own_type TEXT)
RETURNS BIGINT AS $$
DECLARE
  current_period_start TIMESTAMP WITH TIME ZONE;
  pool_record token_pools%ROWTYPE;
  remaining BIGINT;
BEGIN
  -- Get current period (simplified - you'd want to base this on actual subscription)
  current_period_start := date_trunc('month', NOW());

  SELECT * INTO pool_record
  FROM token_pools
  WHERE owner_id = own_id
    AND owner_type = own_type
    AND period_start = current_period_start
  ORDER BY created_at DESC
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN 0;
  END IF;

  remaining := pool_record.total_tokens - pool_record.used_tokens;
  RETURN GREATEST(remaining, 0);
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- TRIGGERS: Auto-update timestamps
-- =====================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_token_pools_updated_at
  BEFORE UPDATE ON token_pools
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- ROW LEVEL SECURITY (RLS) - Optional but recommended
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_pools ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE token_purchases ENABLE ROW LEVEL SECURITY;

-- Basic RLS policies (customize based on your auth system)
CREATE POLICY "Users can view own subscriptions" ON subscriptions
  FOR SELECT USING (user_id = current_setting('app.current_user_id', TRUE)::UUID);

CREATE POLICY "Users can view own token pools" ON token_pools
  FOR SELECT USING (owner_id = current_setting('app.current_user_id', TRUE)::UUID);

CREATE POLICY "Users can view own token usage" ON token_usage
  FOR SELECT USING (owner_id = current_setting('app.current_user_id', TRUE)::UUID);

-- =====================================================
-- COMMENTS: Additional Notes
-- =====================================================

/*
MIGRATION NOTES:

1. Run this migration after your existing users/subscriptions tables exist
2. The plans table contains your canonical tier definitions - never hardcode these in code
3. Token pools are created per billing period per owner (user or workspace)
4. Atomic consumption happens via UPDATE queries with conditions
5. Consider partitioning token_usage by month for performance
6. The RLS policies assume you have a current_user_id setting - adjust as needed

POST-MIGRATION STEPS:

1. Backfill existing subscriptions with plan_id references
2. Create initial token pools for active subscriptions
3. Set up Stripe webhooks for subscription lifecycle events
4. Configure your application to use the new schema

PERFORMANCE CONSIDERATIONS:

1. token_pools table will be high-write - consider partitioning by period_start
2. token_usage grows fast - partition by created_at monthly
3. The get_remaining_tokens() function is called frequently - consider caching
4. For high concurrency, implement Redis layer as described in the spec
*/

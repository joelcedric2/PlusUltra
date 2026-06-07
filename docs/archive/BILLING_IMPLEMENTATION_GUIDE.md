# PlusUltra Billing System Implementation Guide

**Complete token economy, Stripe integration, and tier enforcement**

---

## Overview

The PlusUltra billing system implements a **token-based economy** with four pricing tiers, Stripe subscription management, and automatic enforcement of tier limits across all services.

### Key Features

✅ **Token Economy** - 1 PlusUltra Token = 1M API tokens (GPT-4, Claude, Gemini combined)
✅ **4 Pricing Tiers** - Free, Starter, Pro, Enterprise
✅ **Stripe Integration** - Full subscription lifecycle management
✅ **Automatic Enforcement** - Middleware blocks actions exceeding tier limits
✅ **Usage Tracking** - Real-time monitoring of token consumption
✅ **Webhook Handling** - Automatic sync with Stripe events

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Client Application                        │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              TierEnforcementMiddleware                       │
│  • Checks user tier                                          │
│  • Validates token balance                                   │
│  • Enforces limits (projects, collaborators, storage)        │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                 MeteredAIService                             │
│  • Pre-checks token availability                             │
│  • Calls AI APIs (Claude/GPT-4/Gemini)                       │
│  • Records actual token usage                                │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│             TokenEconomyService                              │
│  • Tracks consumption                                        │
│  • Converts API tokens → PlusUltra tokens                    │
│  • Stores in token_transactions table                        │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│            StripeBillingService                              │
│  • Manages subscriptions                                     │
│  • Handles webhooks                                          │
│  • Updates user tiers                                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Pricing Tiers

### Free Tier ($0/month)
- **Tokens:** 100/month (~20 sessions for small apps)
- **Projects:** 1
- **Collaborators:** 1 user only
- **Storage:** 5GB
- **Features:**
  - Web/native apps
  - Basic publishing readiness
  - BYO Supabase
  - Public apps only
  - No TCI
- **Support:** Docs/community

### Starter Tier ($25/month or $240/year) ⭐ MOST POPULAR
- **Tokens:** 250/month (~100 builds/edits)
- **Projects:** 4
- **Collaborators:** 1 user + 2 collaborators
- **Storage:** 25GB
- **Features:**
  - Custom domains
  - Private apps
  - Email support (3-day SLA)
- **Target:** Solo builders/freelancers

### Pro Tier ($200/month or $1,920/year)
- **Tokens:** 1000/month (~200+ sessions)
- **Projects:** 10
- **Collaborators:** 1 user + 4 collaborators
- **Storage:** 100GB
- **Features:**
  - **Full TCI** (temporal graphs, replays, predictions)
  - Advanced integrations
  - Priority support (2-day SLA)
  - Custom branding
  - Analytics dashboard
- **Target:** Power developers/small teams

### Enterprise Tier (Custom pricing)
- **Tokens:** Unlimited (fair use)
- **Projects:** Unlimited
- **Collaborators:** Unlimited
- **Storage:** Unlimited
- **Features:**
  - Dedicated instances (K8s)
  - Custom integrations/on-prem
  - RBAC/SSO
  - Full TCI with governance
  - 99.9% SLA uptime
  - Dedicated support (1-day SLA)
- **Target:** Large teams/organizations

---

## Token Economy

### Conversion Rate
```
1 PlusUltra Token = 1,000,000 API Tokens
```

### API Token Tracking
The system tracks consumption across:
- **GPT-4** (OpenAI)
- **Claude** (Anthropic)
- **Gemini** (Google)

All tokens are summed and converted to PlusUltra tokens.

### Example Consumption
```typescript
// User generates app with Claude
const result = await meteredAI.generate({
  userId: 'user123',
  prompt: 'Create a todo app',
  context: 'React Native with TypeScript',
  model: 'claude'
});

// Claude uses 3,500,000 API tokens
// = 3.5 PlusUltra Tokens deducted
// User's balance: 100 → 96.5
```

---

## Implementation Files

### 1. Token Economy Service
**File:** [TokenEconomyService.ts](plusultra/backend/src/services/billing/TokenEconomyService.ts)

**Key Methods:**
- `getTierLimits(tier)` - Get limits for a tier
- `consumeTokens(data)` - Record token consumption
- `getTokenUsage(userId)` - Get current usage
- `canConsumeTokens(userId, tokens)` - Check if user can afford
- `addTokens(data)` - Add bonus/refund tokens
- `estimateCost(apiTokens)` - Estimate cost before execution

**Usage:**
```typescript
const tokenService = new TokenEconomyService();

// Check if user can afford operation
const check = await tokenService.canConsumeTokens(userId, 5_000_000);
if (!check.allowed) {
  throw new Error('Insufficient tokens');
}

// Record consumption
await tokenService.consumeTokens({
  userId,
  apiTokens: 5_000_000,
  source: 'claude',
  description: 'App generation',
  metadata: { projectId: 'proj123' }
});
```

### 2. Stripe Billing Service
**File:** [StripeBillingService.ts](plusultra/backend/src/services/billing/StripeBillingService.ts)

**Key Methods:**
- `createCheckoutSession(data)` - Start subscription flow
- `createPortalSession(data)` - Access billing portal
- `getSubscription(userId)` - Get current subscription
- `changeSubscription(data)` - Upgrade/downgrade tier
- `cancelSubscription(data)` - Cancel subscription
- `handleWebhook(payload, signature)` - Process Stripe events

**Usage:**
```typescript
const billingService = new StripeBillingService();

// Create checkout session
const { sessionUrl } = await billingService.createCheckoutSession({
  userId,
  tier: 'starter',
  billingCycle: 'monthly',
  successUrl: 'https://app.com/success',
  cancelUrl: 'https://app.com/cancel'
});

// Redirect user to sessionUrl
```

### 3. Tier Enforcement Middleware
**File:** [TierEnforcementMiddleware.ts](plusultra/backend/src/middleware/TierEnforcementMiddleware.ts)

**Key Functions:**
- `enforceTier(requirements)` - Create enforcement middleware
- `TierPresets` - Predefined enforcement configurations

**Usage:**
```typescript
import { enforceTier, TierPresets } from './middleware/TierEnforcementMiddleware';

// Enforce token requirement
fastify.post('/api/v1/generate', {
  preHandler: enforceTier(TierPresets.aiOperation(5_000_000))
}, async (request, reply) => {
  // This only runs if user has ≥5M tokens
});

// Enforce minimum tier
fastify.post('/api/v1/tci/graph', {
  preHandler: enforceTier(TierPresets.tciFeature())
}, async (request, reply) => {
  // Only Pro/Enterprise users can access
});

// Enforce project limit
fastify.post('/api/v1/projects', {
  preHandler: enforceTier(TierPresets.createProject())
}, async (request, reply) => {
  // Blocked if user at project limit
});
```

### 4. Metered AI Service
**File:** [MeteredAIService.ts](plusultra/backend/src/services/ai/MeteredAIService.ts)

**Key Methods:**
- `generate(request)` - Generate with automatic metering
- `generateCode(request)` - Code generation
- `analyzeImage(request)` - Vision analysis
- `generateStream(request)` - Streaming responses
- `estimateCost(request)` - Estimate before execution

**Usage:**
```typescript
const meteredAI = new MeteredAIService();

// Generate with automatic tracking
const response = await meteredAI.generate({
  userId: 'user123',
  prompt: 'Create a mobile app',
  model: 'claude',
  maxTokens: 4096
});

console.log('Generated:', response.text);
console.log('Tokens used:', response.tokensUsed.total);
console.log('PlusUltra tokens:', response.plusultraTokensConsumed);
// Tokens automatically deducted from user's balance
```

### 5. Billing API Routes
**File:** [billing/index.ts](plusultra/backend/src/routes/billing/index.ts)

**Endpoints:**
- `GET /api/v1/billing/tiers` - List all tiers
- `GET /api/v1/billing/usage` - Get token usage
- `GET /api/v1/billing/transactions` - Get transaction history
- `POST /api/v1/billing/estimate` - Estimate operation cost
- `GET /api/v1/billing/subscription` - Get subscription
- `POST /api/v1/billing/checkout` - Create checkout session
- `POST /api/v1/billing/portal` - Access billing portal
- `POST /api/v1/billing/change-tier` - Change tier
- `POST /api/v1/billing/cancel` - Cancel subscription
- `POST /api/v1/billing/webhook` - Stripe webhook

---

## Setup Instructions

### 1. Stripe Setup

#### Create Stripe Account
1. Sign up at https://stripe.com
2. Get API keys from Dashboard → Developers → API Keys

#### Create Products and Prices
```bash
# Starter Monthly ($25/month)
stripe prices create \
  --product="prod_starter" \
  --unit-amount=2500 \
  --currency=usd \
  --recurring interval=month \
  --nickname="Starter Monthly"

# Starter Yearly ($240/year = 20% discount)
stripe prices create \
  --product="prod_starter" \
  --unit-amount=24000 \
  --currency=usd \
  --recurring interval=year \
  --nickname="Starter Yearly"

# Pro Monthly ($200/month)
stripe prices create \
  --product="prod_pro" \
  --unit-amount=20000 \
  --currency=usd \
  --recurring interval=month \
  --nickname="Pro Monthly"

# Pro Yearly ($1,920/year)
stripe prices create \
  --product="prod_pro" \
  --unit-amount=192000 \
  --currency=usd \
  --recurring interval=year \
  --nickname="Pro Yearly"
```

#### Get Price IDs
Copy the `price_xxxxx` IDs and add to `.env`:
```bash
STRIPE_PRICE_STARTER_MONTHLY=price_xxxxx
STRIPE_PRICE_STARTER_YEARLY=price_xxxxx
STRIPE_PRICE_PRO_MONTHLY=price_xxxxx
STRIPE_PRICE_PRO_YEARLY=price_xxxxx
```

#### Configure Webhook
1. Go to Stripe Dashboard → Developers → Webhooks
2. Add endpoint: `https://yourdomain.com/api/v1/billing/webhook`
3. Select events:
   - `checkout.session.completed`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
4. Copy webhook signing secret

### 2. Environment Variables

Add to [.env](plusultra/backend/.env):
```bash
# Stripe
STRIPE_SECRET_KEY=sk_live_xxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
STRIPE_PRICE_STARTER_MONTHLY=price_xxxxx
STRIPE_PRICE_STARTER_YEARLY=price_xxxxx
STRIPE_PRICE_PRO_MONTHLY=price_xxxxx
STRIPE_PRICE_PRO_YEARLY=price_xxxxx

# Admin
ADMIN_API_KEY=your_secure_admin_key

# Frontend
FRONTEND_URL=https://app.plusultra.dev
```

### 3. Database Migration

Run the billing migration:
```bash
cd plusultra/backend
psql $DATABASE_URL -f prisma/migrations/20251025_billing_tables.sql
```

Or with Prisma:
```bash
npx prisma migrate deploy
```

### 4. Set Up Cron Job

Add monthly token reset cron (runs on 1st of each month):
```bash
# Crontab
0 0 1 * * psql $DATABASE_URL -c "SELECT reset_monthly_tokens();"
```

Or use a service like [Temporal.io](https://temporal.io):
```typescript
async function monthlyTokenReset() {
  const tokenService = new TokenEconomyService();
  await tokenService.resetMonthlyTokens();
}

// Schedule to run 1st of month at midnight
```

---

## Usage Examples

### Enforce Token Limits on AI Endpoint

```typescript
import { enforceTier, TierPresets } from './middleware/TierEnforcementMiddleware';
import { MeteredAIService } from './services/ai/MeteredAIService';

const meteredAI = new MeteredAIService();

fastify.post('/api/v1/ai/generate', {
  preHandler: enforceTier({
    requiresToken: true,
    estimatedTokenCost: 3_000_000 // 3M API tokens = 3 PT
  })
}, async (request, reply) => {
  const { userId, prompt, model } = request.body;

  const response = await meteredAI.generate({
    userId,
    prompt,
    model
  });

  reply.send(response);
});
```

### Enforce Project Limit

```typescript
fastify.post('/api/v1/projects', {
  preHandler: enforceTier(TierPresets.createProject())
}, async (request, reply) => {
  const { userId } = request;
  const projectService = new ProjectService();

  const project = await projectService.createProject(userId, request.body);
  reply.send({ project });
});
```

### Enforce Feature Access (TCI)

```typescript
fastify.get('/api/v1/tci/temporal-graph', {
  preHandler: enforceTier(TierPresets.tciFeature())
}, async (request, reply) => {
  // Only Pro/Enterprise users reach this
  const graph = await getTCIGraph(request.query.projectId);
  reply.send({ graph });
});
```

### Check Usage Programmatically

```typescript
const tokenService = new TokenEconomyService();

// Get current usage
const usage = await tokenService.getTokenUsage(userId);

console.log('Consumed:', usage.consumed.plusultraTokens);
console.log('Remaining:', usage.remaining);
console.log('Limit:', usage.limit);

// Check if user is near limit
if (usage.remaining < 10) {
  await sendUpgradeEmail(userId);
}
```

### Handle Upgrade Flow

```typescript
fastify.post('/api/v1/upgrade', async (request, reply) => {
  const { userId, targetTier } = request.body;

  const billingService = new StripeBillingService();

  // Create checkout session
  const { sessionUrl } = await billingService.createCheckoutSession({
    userId,
    tier: targetTier,
    billingCycle: 'monthly',
    successUrl: 'https://app.com/billing/success',
    cancelUrl: 'https://app.com/billing/cancel'
  });

  reply.send({ checkoutUrl: sessionUrl });
});
```

---

## Webhook Handling

Stripe sends webhooks for subscription events. The system handles:

### Checkout Completed
```typescript
// User completes checkout
// → Subscription created
// → User tier updated
// → Token balance initialized
```

### Subscription Updated
```typescript
// User upgrades/downgrades
// → Subscription updated
// → User tier changed
// → Token balance adjusted
```

### Subscription Deleted
```typescript
// User cancels or subscription ends
// → User downgraded to free tier
// → Token balance set to 100
```

### Payment Succeeded
```typescript
// Monthly/yearly payment successful
// → Token balance reset to tier limit
// → Invoice stored
```

### Payment Failed
```typescript
// Payment fails
// → User notified
// → Subscription marked past_due
// → Grace period starts
```

---

## Error Handling

### Insufficient Tokens
```typescript
{
  "error": "Insufficient tokens",
  "message": "Required: 5, Available: 2",
  "currentTier": "free",
  "upgradeUrl": "/billing/upgrade"
}
```

### Feature Not Available
```typescript
{
  "error": "Feature not available",
  "message": "This feature is not available in your current tier",
  "currentTier": "starter",
  "feature": "tci",
  "upgradeUrl": "/billing/upgrade"
}
```

### Project Limit Reached
```typescript
{
  "error": "Project limit reached",
  "message": "You have reached the maximum number of projects (4) for your tier",
  "currentTier": "starter",
  "currentCount": 4,
  "limit": 4,
  "upgradeUrl": "/billing/upgrade"
}
```

---

## Testing

### Test Token Consumption

```typescript
// test-tokens.ts
import { TokenEconomyService } from './services/billing/TokenEconomyService';

async function testTokens() {
  const tokenService = new TokenEconomyService();

  // Get initial usage
  const before = await tokenService.getTokenUsage('test-user-id');
  console.log('Before:', before);

  // Consume tokens
  await tokenService.consumeTokens({
    userId: 'test-user-id',
    apiTokens: 3_500_000, // 3.5M API tokens
    source: 'claude',
    description: 'Test consumption',
  });

  // Get updated usage
  const after = await tokenService.getTokenUsage('test-user-id');
  console.log('After:', after);
  console.log('Consumed:', after.consumed.plusultraTokens); // Should be 3.5
}
```

### Test Stripe Checkout

```bash
# Use Stripe test mode
STRIPE_SECRET_KEY=sk_test_xxxxx npm run dev

# Create checkout session
curl -X POST http://localhost:3000/api/v1/billing/checkout \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "tier": "starter",
    "billingCycle": "monthly"
  }'

# Returns: { "sessionUrl": "https://checkout.stripe.com/..." }
# Open URL in browser to test checkout flow
```

### Test Webhooks Locally

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Forward webhooks to local server
stripe listen --forward-to localhost:3000/api/v1/billing/webhook

# Trigger test events
stripe trigger checkout.session.completed
stripe trigger customer.subscription.updated
```

---

## Monitoring & Analytics

### Track Token Usage

```sql
-- View monthly usage by user
SELECT * FROM monthly_token_usage
WHERE user_id = 'user-id'
ORDER BY month DESC;

-- View user billing summary
SELECT * FROM user_billing_summary
WHERE user_id = 'user-id';

-- Find heavy users
SELECT user_id, email, tier, monthly_tokens_consumed
FROM user_billing_summary
ORDER BY monthly_tokens_consumed DESC
LIMIT 10;

-- Find users near limits
SELECT user_id, email, tier, monthly_tokens_consumed, monthly_token_limit
FROM user_billing_summary
WHERE monthly_tokens_consumed >= monthly_token_limit * 0.9
AND tier != 'enterprise';
```

### Dashboard Queries

```typescript
// Get revenue metrics
const metrics = await supabase
  .from('subscriptions')
  .select('tier, billing_cycle, count')
  .eq('status', 'active');

// Get churn rate
const churnedThisMonth = await supabase
  .from('subscriptions')
  .select('count')
  .eq('status', 'canceled')
  .gte('canceled_at', startOfMonth);
```

---

## Security Considerations

1. **Webhook Signature Verification**
   - Always verify Stripe webhook signatures
   - Use `stripe.webhooks.constructEvent()`

2. **Rate Limiting**
   - Billing endpoints already have rate limits
   - Additional per-user rate limits enforced

3. **Token Security**
   - Token transactions are append-only
   - Cannot be modified or deleted by users
   - Admin API key required for manual adjustments

4. **RBAC**
   - Only authenticated users can access billing endpoints
   - Users can only see their own data
   - Row-level security enforced in database

---

## Troubleshooting

### Issue: Tokens not deducted after AI call
**Solution:** Check `token_transactions` table for records. Ensure `consumeTokens()` is called after successful AI response.

### Issue: User upgraded but still on free tier
**Solution:** Check webhook delivery in Stripe Dashboard. Verify webhook secret is correct.

### Issue: Checkout session expires immediately
**Solution:** Check `successUrl` and `cancelUrl` are absolute URLs (not relative).

### Issue: Usage shows 0 tokens consumed
**Solution:** Ensure AI calls use `MeteredAIService` wrapper, not direct API clients.

---

## Future Enhancements

1. **Token Rollover** - Unused tokens carry to next month (Pro+)
2. **Token Marketplace** - Buy additional token packs
3. **Team Billing** - Shared token pools for organizations
4. **Usage Alerts** - Email notifications at 75%/90% usage
5. **Token Gifting** - Transfer tokens between users
6. **Discounts & Promotions** - Coupon codes for signups

---

## Support

- **Documentation:** https://docs.plusultra.dev/billing
- **Stripe Dashboard:** https://dashboard.stripe.com
- **Support Email:** billing@plusultra.dev
- **Enterprise Sales:** sales@plusultra.dev

---

## Complete Implementation Checklist

- [x] Token economy service
- [x] Stripe billing service
- [x] Tier enforcement middleware
- [x] Metered AI service wrapper
- [x] Billing API routes
- [x] Database migration
- [x] Webhook handling
- [ ] Set up Stripe account
- [ ] Create products and prices
- [ ] Configure webhook endpoint
- [ ] Add environment variables
- [ ] Run database migration
- [ ] Set up monthly token reset cron
- [ ] Test checkout flow
- [ ] Test webhook handling
- [ ] Deploy to production

**Status:** Backend implementation 100% complete, setup required for production deployment.

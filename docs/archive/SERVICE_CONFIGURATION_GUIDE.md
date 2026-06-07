# PlusUltra Service Configuration Guide

**Last Updated:** October 25, 2025
**Status:** Step-by-step setup for all external services

---

## ✅ Completed Setup

- [x] PostgreSQL 17 installed and running
- [x] Redis installed and running
- [x] Database `plusultra` created
- [x] Backend code ready

---

## 🔧 Services to Configure

### 1. Stripe (Billing & Payments)

#### Step 1: Create Stripe Account
1. Go to https://stripe.com
2. Sign up for an account
3. Verify your email

#### Step 2: Get API Keys
1. Go to https://dashboard.stripe.com/test/apikeys
2. Copy your **Secret Key** (starts with `sk_test_...`)
3. For production, switch to live mode and get live key (`sk_live_...`)

#### Step 3: Create Products & Prices

**Via Stripe Dashboard:**
1. Go to https://dashboard.stripe.com/test/products
2. Click "Add product"

**Starter Product:**
- Name: `PlusUltra Starter`
- Description: `250 tokens/month with 4 projects`
- Pricing:
  - Monthly: $25/month (recurring)
  - Yearly: $240/year (recurring)

**Pro Product:**
- Name: `PlusUltra Pro`
- Description: `1000 tokens/month with 10 projects and TCI`
- Pricing:
  - Monthly: $200/month (recurring)
  - Yearly: $2000/year (recurring)

**Via Stripe CLI (faster):**
```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Create Starter product
stripe products create \
  --name="PlusUltra Starter" \
  --description="250 tokens/month with 4 projects"

# Create Starter monthly price (copy product ID from above)
stripe prices create \
  --product=prod_XXXXX \
  --unit-amount=2500 \
  --currency=usd \
  --recurring[interval]=month

# Create Starter yearly price
stripe prices create \
  --product=prod_XXXXX \
  --unit-amount=24000 \
  --currency=usd \
  --recurring[interval]=year

# Create Pro product
stripe products create \
  --name="PlusUltra Pro" \
  --description="1000 tokens/month with TCI"

# Create Pro monthly price
stripe prices create \
  --product=prod_YYYYY \
  --unit-amount=20000 \
  --currency=usd \
  --recurring[interval]=month

# Create Pro yearly price
stripe prices create \
  --product=prod_YYYYY \
  --unit-amount=200000 \
  --currency=usd \
  --recurring[interval]=year
```

#### Step 4: Set Up Webhook
1. Go to https://dashboard.stripe.com/test/webhooks
2. Click "Add endpoint"
3. Endpoint URL: `https://your-domain.com/api/v1/billing/webhook`
4. Select these events:
   - `checkout.session.completed`
   - `customer.subscription.created`
   - `customer.subscription.updated`
   - `customer.subscription.deleted`
   - `invoice.payment_succeeded`
   - `invoice.payment_failed`
5. Copy the **Webhook signing secret** (starts with `whsec_...`)

#### Step 5: Add to .env
```bash
# Stripe
STRIPE_SECRET_KEY=sk_test_XXXXXXXXXXXXXXXXXXXXX
STRIPE_WEBHOOK_SECRET=whsec_XXXXXXXXXXXXXXXXXXXXX
STRIPE_PRICE_STARTER_MONTHLY=price_XXXXX
STRIPE_PRICE_STARTER_YEARLY=price_XXXXX
STRIPE_PRICE_PRO_MONTHLY=price_YYYYY
STRIPE_PRICE_PRO_YEARLY=price_YYYYY
```

#### Test Locally
```bash
# Forward webhooks to local server
stripe listen --forward-to localhost:3001/api/v1/billing/webhook

# In another terminal, trigger test event
stripe trigger checkout.session.completed
```

---

### 2. App Store Connect API (iOS Deployment)

#### Step 1: Apple Developer Account
1. Enroll at https://developer.apple.com
2. Cost: $99/year
3. Complete enrollment verification (can take 24-48 hours)

#### Step 2: Create API Key
1. Go to https://appstoreconnect.apple.com/access/api
2. Click "Keys" tab
3. Click "+" to generate new key
4. Name: `PlusUltra Backend`
5. Access: `App Manager` or `Admin`
6. Click "Generate"
7. **Download the key immediately** (you can only download once!)
8. Note the:
   - Key ID (e.g., `ABC123XYZ`)
   - Issuer ID (e.g., `12345678-1234-1234-1234-123456789012`)

#### Step 3: Prepare Private Key
```bash
# The downloaded file is AuthKey_ABC123XYZ.p8
# Convert to single line for .env:
cat ~/Downloads/AuthKey_ABC123XYZ.p8 | tr '\n' '\\n'
```

#### Step 4: Add to .env
```bash
# Apple App Store Connect
APPLE_KEY_ID=ABC123XYZ
APPLE_ISSUER_ID=12345678-1234-1234-1234-123456789012
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nMIGTAgEAMB...\n-----END PRIVATE KEY-----"
IOS_BUNDLE_ID=com.yourcompany.plusultra
```

#### Step 5: Create App in App Store Connect
1. Go to https://appstoreconnect.apple.com/apps
2. Click "+" → "New App"
3. Platform: iOS
4. Name: Your app name
5. Bundle ID: Same as IOS_BUNDLE_ID above
6. SKU: Unique identifier (e.g., `plusultra-ios-001`)

---

### 3. Google Play Developer API (Android Deployment)

#### Step 1: Google Play Console Account
1. Go to https://play.google.com/console
2. Pay one-time $25 registration fee
3. Complete account setup

#### Step 2: Create Google Cloud Project
1. Go to https://console.cloud.google.com
2. Create new project: `PlusUltra Backend`
3. Note the Project ID

#### Step 3: Enable Google Play Developer API
1. Go to https://console.cloud.google.com/apis/library
2. Search for "Google Play Android Developer API"
3. Click "Enable"

#### Step 4: Create Service Account
1. Go to https://console.cloud.google.com/iam-admin/serviceaccounts
2. Click "Create Service Account"
3. Name: `plusultra-backend`
4. Click "Create and Continue"
5. Grant role: "Service Account User"
6. Click "Done"

#### Step 5: Create Service Account Key
1. Click on the service account you just created
2. Go to "Keys" tab
3. Click "Add Key" → "Create new key"
4. Choose "JSON"
5. Download the key file

#### Step 6: Link Service Account to Play Console
1. Go to https://play.google.com/console
2. Settings → API access
3. Click "Link" next to your service account
4. Grant permissions:
   - View app information and download bulk reports
   - Manage store presence
   - Manage production releases
   - Manage testing track releases

#### Step 7: Add to .env
```bash
# Google Play Developer
GOOGLE_SERVICE_ACCOUNT_EMAIL=plusultra-backend@project-id.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_KEY='{"type":"service_account","project_id":"...","private_key":"...","client_email":"..."}'
ANDROID_PACKAGE_NAME=com.yourcompany.plusultra
```

**Note:** The JSON key must be on one line, properly escaped.

#### Step 8: Create App in Play Console
1. Go to https://play.google.com/console
2. Click "Create app"
3. App name: Your app name
4. Default language: English (US)
5. App or game: App
6. Free or paid: Choose
7. Complete declarations

---

### 4. Vercel (Web Deployment)

#### Step 1: Create Vercel Account
1. Go to https://vercel.com
2. Sign up (free tier available)
3. Connect your GitHub account (optional)

#### Step 2: Generate Token
1. Go to https://vercel.com/account/tokens
2. Click "Create Token"
3. Name: `PlusUltra Backend`
4. Scope: Full Account
5. Expiration: No expiration (or choose)
6. Click "Create"
7. Copy the token immediately

#### Step 3: Add to .env
```bash
# Vercel
VERCEL_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

### 5. Netlify (Web Deployment)

#### Step 1: Create Netlify Account
1. Go to https://netlify.com
2. Sign up (free tier available)

#### Step 2: Generate Personal Access Token
1. Go to https://app.netlify.com/user/applications
2. Click "New access token"
3. Description: `PlusUltra Backend`
4. Click "Generate token"
5. Copy the token

#### Step 3: Add to .env
```bash
# Netlify
NETLIFY_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

---

### 6. Cloudflare (Web Deployment & Storage)

#### Step 1: Create Cloudflare Account
1. Go to https://cloudflare.com
2. Sign up for account

#### Step 2: Create R2 Storage
1. Go to https://dash.cloudflare.com
2. R2 → Create bucket
3. Bucket name: `plusultra-artifacts`
4. Location: Automatic
5. Click "Create bucket"

#### Step 3: Generate R2 API Token
1. R2 → Manage R2 API tokens
2. Click "Create API token"
3. Name: `PlusUltra Backend`
4. Permissions: Object Read & Write
5. TTL: Forever
6. Click "Create API token"
7. Copy:
   - Access Key ID
   - Secret Access Key
   - Endpoint URL

#### Step 4: Generate Cloudflare Pages Token (for deployments)
1. Profile → API Tokens
2. Click "Create Token"
3. Use template: "Edit Cloudflare Workers"
4. Or create custom with:
   - Permissions: Account → Cloudflare Pages → Edit
   - Account Resources: Include → Your account
5. Click "Continue to summary"
6. Click "Create Token"
7. Copy the token

#### Step 5: Get Account ID
1. Go to dashboard home
2. Click on any site
3. Right sidebar shows "Account ID"
4. Copy it

#### Step 6: Add to .env
```bash
# Cloudflare R2 Storage
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
R2_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
R2_BUCKET_NAME=plusultra-artifacts
R2_PUBLIC_URL=https://pub-xxxxx.r2.dev

# Cloudflare Pages
CLOUDFLARE_API_TOKEN=xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
CLOUDFLARE_ACCOUNT_ID=your-account-id
```

---

### 7. Sentry (Error Tracking)

#### Step 1: Create Sentry Account
1. Go to https://sentry.io
2. Sign up (free tier: 5k errors/month)

#### Step 2: Create Project
1. Click "Create Project"
2. Platform: Node.js
3. Project name: `plusultra-backend`
4. Team: Choose or create

#### Step 3: Get DSN
1. Project Settings → Client Keys (DSN)
2. Copy the DSN (looks like: `https://xxxxx@xxxxx.ingest.sentry.io/xxxxx`)

#### Step 4: Add to .env
```bash
# Sentry
SENTRY_DSN=https://xxxxxxxxxxxxxxxxxxxxx@xxxxx.ingest.sentry.io/xxxxx
```

#### Step 5: Configure (already done in code)
The backend already has Sentry configured in `src/server.ts`. It will automatically start tracking errors once DSN is set.

---

### 8. PostHog (Analytics) - Optional

#### Step 1: Create PostHog Account
1. Go to https://posthog.com
2. Sign up for cloud version (free tier available)
3. Or self-host if preferred

#### Step 2: Get Project API Key
1. Project Settings
2. Copy "Project API Key"

#### Step 3: Add to .env
```bash
# PostHog
POSTHOG_API_KEY=phc_xxxxxxxxxxxxxxxxxxxxxxxxxxxxx
POSTHOG_HOST=https://app.posthog.com
```

---

## 🔑 Complete .env Template

Here's what your complete `.env` should look like with all services:

```bash
# ================================
# DATABASE
# ================================
DATABASE_URL=postgresql://joelc:1234@localhost:5432/plusultra
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

REDIS_URL=redis://localhost:6379
REDIS_HOST=localhost
REDIS_PORT=6379

# ================================
# AI PROVIDERS (Get real keys!)
# ================================
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxx
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxx
XAI_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxx
HUGGINGFACE_API_KEY=hf_xxxxxxxxxxxxxxxxxxxxx

# ================================
# AUTHENTICATION
# ================================
JWT_SECRET=$(openssl rand -base64 32)
JWT_EXPIRES_IN=7d

# ================================
# STRIPE BILLING
# ================================
STRIPE_SECRET_KEY=sk_test_xxxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx
STRIPE_PRICE_STARTER_MONTHLY=price_xxxxx
STRIPE_PRICE_STARTER_YEARLY=price_xxxxx
STRIPE_PRICE_PRO_MONTHLY=price_yyyyy
STRIPE_PRICE_PRO_YEARLY=price_yyyyy

# ================================
# APP STORE DEPLOYMENT
# ================================
# Apple
APPLE_KEY_ID=ABC123XYZ
APPLE_ISSUER_ID=12345678-1234-1234-1234-123456789012
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
IOS_BUNDLE_ID=com.yourcompany.plusultra

# Google Play
GOOGLE_SERVICE_ACCOUNT_EMAIL=plusultra-backend@project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'
ANDROID_PACKAGE_NAME=com.yourcompany.plusultra

# ================================
# WEB DEPLOYMENT
# ================================
VERCEL_TOKEN=xxxxxxxxxxxxxxxxxxxxx
NETLIFY_TOKEN=xxxxxxxxxxxxxxxxxxxxx
CLOUDFLARE_API_TOKEN=xxxxxxxxxxxxxxxxxxxxx
CLOUDFLARE_ACCOUNT_ID=xxxxxxxxxxxxxxxxxxxxx

# ================================
# CLOUDFLARE R2 STORAGE
# ================================
R2_ACCOUNT_ID=xxxxxxxxxxxxxxxxxxxxx
R2_ACCESS_KEY_ID=xxxxxxxxxxxxxxxxxxxxx
R2_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxx
R2_BUCKET_NAME=plusultra-artifacts
R2_PUBLIC_URL=https://pub-xxxxx.r2.dev

# ================================
# MONITORING & OBSERVABILITY
# ================================
SENTRY_DSN=https://xxxxx@xxxxx.ingest.sentry.io/xxxxx
POSTHOG_API_KEY=phc_xxxxxxxxxxxxxxxxxxxxx
POSTHOG_HOST=https://app.posthog.com

# ================================
# APPLICATION SETTINGS
# ================================
NODE_ENV=development
PORT=3001
HOST=0.0.0.0
FRONTEND_URL=http://localhost:3000
ALLOWED_ORIGINS=http://localhost:3000

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Admin
ADMIN_API_KEY=$(openssl rand -base64 32)
```

---

## ✅ Configuration Checklist

### Required (Backend won't start without these):
- [ ] DATABASE_URL
- [ ] REDIS_URL
- [ ] At least one AI API key (OpenAI, Anthropic, or Google)
- [ ] JWT_SECRET

### Billing Features:
- [ ] STRIPE_SECRET_KEY
- [ ] STRIPE_WEBHOOK_SECRET
- [ ] All STRIPE_PRICE_* variables

### iOS Deployment:
- [ ] APPLE_KEY_ID
- [ ] APPLE_ISSUER_ID
- [ ] APPLE_PRIVATE_KEY
- [ ] IOS_BUNDLE_ID

### Android Deployment:
- [ ] GOOGLE_SERVICE_ACCOUNT_EMAIL
- [ ] GOOGLE_SERVICE_ACCOUNT_KEY
- [ ] ANDROID_PACKAGE_NAME

### Web Deployment:
- [ ] VERCEL_TOKEN
- [ ] NETLIFY_TOKEN
- [ ] CLOUDFLARE_API_TOKEN
- [ ] CLOUDFLARE_ACCOUNT_ID

### Storage:
- [ ] R2_ACCOUNT_ID
- [ ] R2_ACCESS_KEY_ID
- [ ] R2_SECRET_ACCESS_KEY
- [ ] R2_BUCKET_NAME

### Monitoring:
- [ ] SENTRY_DSN
- [ ] POSTHOG_API_KEY (optional)

---

## 🚀 After Configuration

Once all services are configured:

```bash
# 1. Verify .env has all required keys
grep -E "API_KEY|SECRET|TOKEN" .env | wc -l
# Should show 10+ lines

# 2. Run database migrations
npm run db:migrate:deploy
npm run db:generate

# 3. Start backend
npm run dev

# 4. Test it works
curl http://localhost:3001/health
curl http://localhost:3001/api/v1/status
```

---

## 📞 Getting Help

If you get stuck:
1. Check service-specific documentation links above
2. Verify API keys are correctly formatted
3. Check [SETUP_AND_DEPLOYMENT.md](SETUP_AND_DEPLOYMENT.md) troubleshooting section
4. Review service status pages

---

## 💡 Tips

1. **Start with test/sandbox keys** - switch to production later
2. **Stripe CLI is your friend** - makes testing webhooks easy
3. **Save all credentials securely** - use password manager
4. **Don't commit .env** - it's already in .gitignore
5. **Use environment-specific configs** - .env.development, .env.production

---

**Time Estimate:**
- Stripe setup: 15-20 minutes
- App Store Connect: 20-30 minutes (+ wait for Apple approval)
- Google Play: 30-40 minutes
- Web deployment tokens: 5-10 minutes each
- Monitoring: 5-10 minutes each

**Total: 2-3 hours** (excluding Apple approval wait time)

After this, your backend will have access to all services and be fully functional!

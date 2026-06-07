# Quick Guide: Add Your API Keys

Your PlusUltra backend is **plug and play ready**! Just add your API keys to start using it.

## 🚀 Quick Start (5 minutes)

### Step 1: Get Your AI API Keys

You need **at least one** of these:

#### OpenAI (Recommended)
1. Go to https://platform.openai.com/api-keys
2. Click "+ Create new secret key"
3. Copy the key (starts with `sk-proj-...`)

#### Anthropic (Claude)
1. Go to https://console.anthropic.com/settings/keys
2. Click "+ Create Key"
3. Copy the key (starts with `sk-ant-...`)

#### xAI (Grok)
1. Go to https://console.x.ai
2. Navigate to API Keys section
3. Click "Create API Key"
4. Copy the key (starts with `xai-...`)

### Step 2: Add Keys to .env

Edit the `.env` file and replace these lines:

```bash
# Change this:
OPENAI_API_KEY=your-openai-api-key

# To this:
OPENAI_API_KEY=sk-proj-YOUR_ACTUAL_KEY_HERE
```

Do the same for:
- `ANTHROPIC_API_KEY`
- `XAI_API_KEY` (optional - for Grok AI)

### Step 3: Start Backend

```bash
./start.sh
```

That's it! Your backend is now running with AI features enabled.

---

## ✅ Already Configured

These are already set up and ready to use:

- ✅ **PostgreSQL** - Running and database created
- ✅ **Redis** - Running for caching
- ✅ **JWT Secret** - Auto-generated secure secret
- ✅ **Session Secret** - Auto-generated secure secret
- ✅ **Database Migrations** - Schema is ready
- ✅ **Prisma Client** - Generated and configured

---

## 📝 Optional API Keys (Add Later)

These features will work once you add the corresponding API keys:

### Billing (Stripe)
```bash
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
```
👉 See [SERVICE_CONFIGURATION_GUIDE.md](../../SERVICE_CONFIGURATION_GUIDE.md#1-stripe-billing--payments) for setup

### iOS Deployment (App Store Connect)
```bash
APPLE_KEY_ID=ABC123XYZ
APPLE_ISSUER_ID=...
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----..."
```
👉 See [SERVICE_CONFIGURATION_GUIDE.md](../../SERVICE_CONFIGURATION_GUIDE.md#2-app-store-connect-api-ios-deployment) for setup

### Android Deployment (Google Play)
```bash
GOOGLE_SERVICE_ACCOUNT_EMAIL=...
GOOGLE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'
```
👉 See [SERVICE_CONFIGURATION_GUIDE.md](../../SERVICE_CONFIGURATION_GUIDE.md#3-google-play-developer-api-android-deployment) for setup

### Web Deployment
```bash
VERCEL_TOKEN=...
NETLIFY_TOKEN=...
CLOUDFLARE_API_TOKEN=...
```
👉 See [SERVICE_CONFIGURATION_GUIDE.md](../../SERVICE_CONFIGURATION_GUIDE.md#4-vercel-web-deployment) for setup

### Error Tracking (Sentry)
```bash
SENTRY_DSN=https://...@....ingest.sentry.io/...
```
👉 See [SERVICE_CONFIGURATION_GUIDE.md](../../SERVICE_CONFIGURATION_GUIDE.md#7-sentry-error-tracking) for setup

---

## 🧪 Test Your Setup

After adding API keys and starting the backend:

```bash
# Health check
curl http://localhost:3001/health

# Expected: {"status":"OK","timestamp":"..."}

# Backend status
curl http://localhost:3001/api/v1/status

# Expected: {"service":"PlusUltra Backend","version":"1.0.0",...}
```

---

## 🎯 What Works Right Now

With just AI API keys added, you can use:

- ✅ **Code Generation** - AI-powered app creation
- ✅ **Multi-Agent Orchestration** - GPT-5, Claude, Grok
- ✅ **Real-time Collaboration** - WebSocket streaming
- ✅ **Database Operations** - Full CRUD with Prisma
- ✅ **User Authentication** - JWT-based auth
- ✅ **Project Management** - Create and manage projects
- ✅ **Asset Generation** - AI-generated app assets
- ✅ **TCI System** - Temporal Code Intelligence

**What requires additional API keys:**
- ❌ Billing (needs Stripe)
- ❌ App Store deployment (needs Apple/Google)
- ❌ Web deployment (needs Vercel/Netlify)
- ❌ Error tracking (needs Sentry)

---

## 🐛 Troubleshooting

### "API key invalid"
- Make sure you copied the entire key
- Check there are no extra spaces
- Verify the key is for the right service

### "Database connection failed"
- Run: `brew services start postgresql@17`
- Check DATABASE_URL in .env matches your setup

### "Redis connection failed"
- Run: `brew services start redis`
- Verify REDIS_URL is: `redis://localhost:6379`

### "Port 3001 already in use"
- Stop other services on that port
- Or change PORT in .env to 3002

---

## 📚 Next Steps

1. **Add AI API keys** (5 min) ← Start here!
2. **Test basic features** (5 min)
3. **Add optional services** (2-3 hours) - See [SERVICE_CONFIGURATION_GUIDE.md](../../SERVICE_CONFIGURATION_GUIDE.md)
4. **Deploy to production** - See [SETUP_AND_DEPLOYMENT.md](../../SETUP_AND_DEPLOYMENT.md)

---

## 🎉 You're Ready!

Your backend is in **plug and play** state. Just add your API keys and start building!

```bash
./start.sh
```

**Need help?** Check the comprehensive guides:
- [SETUP_AND_DEPLOYMENT.md](../../SETUP_AND_DEPLOYMENT.md)
- [FEATURES_AND_ARCHITECTURE.md](../../FEATURES_AND_ARCHITECTURE.md)
- [SERVICE_CONFIGURATION_GUIDE.md](../../SERVICE_CONFIGURATION_GUIDE.md)

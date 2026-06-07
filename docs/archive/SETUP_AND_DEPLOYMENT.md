# PlusUltra - Complete Setup and Deployment Guide

**Last Updated:** October 25, 2025
**Status:** Production Ready
**Version:** 1.0.0

---

## Table of Contents

1. [Quick Start](#quick-start)
2. [Prerequisites](#prerequisites)
3. [Installation](#installation)
4. [Environment Configuration](#environment-configuration)
5. [Database Setup](#database-setup)
6. [Service Configuration](#service-configuration)
7. [Development Setup](#development-setup)
8. [Production Deployment](#production-deployment)
9. [Testing](#testing)
10. [Troubleshooting](#troubleshooting)
11. [Monitoring & Maintenance](#monitoring--maintenance)

---

## Quick Start

### One-Command Setup (Recommended for Development)

```bash
# Clone repository
git clone https://github.com/your-org/plusultra.git
cd plusultra

# Run automated setup
./scripts/setup-production.sh
```

This script will:
- ✅ Verify Node.js version (18+)
- ✅ Install dependencies
- ✅ Create .env from template
- ✅ Run database migrations
- ✅ Build TypeScript
- ✅ Run test suite

### Manual Quick Start

```bash
cd plusultra/backend

# Install dependencies
npm install

# Configure environment
cp .env.example .env
# Edit .env with your API keys

# Initialize database
npm run db:migrate:deploy
npm run db:generate

# Build and start
npm run build
npm start
```

Server will be running at: `http://localhost:3001`

---

## Prerequisites

### Required Software

1. **Node.js** - Version 18.0 or higher
   ```bash
   node --version  # Should be v18.x or higher
   ```

2. **PostgreSQL** - Version 13 or higher
   ```bash
   psql --version
   ```

3. **Redis** - Version 6.0 or higher
   ```bash
   redis-cli --version
   ```

4. **Docker** - For sandbox features
   ```bash
   docker --version
   ```

5. **Neo4j** - Version 5.0+ (for TCI features)
   ```bash
   # Using Docker
   docker run -p 7474:7474 -p 7687:7687 \
     -e NEO4J_AUTH=neo4j/your-password \
     neo4j:latest
   ```

### Required API Keys

You'll need accounts and API keys for:

**Essential:**
- OpenAI API (GPT models)
- Anthropic API (Claude models)
- xAI Grok API (Grok models)
- Stripe (billing)
- Cloudflare R2 or AWS S3 (storage)
- Pinecone (vector database)
- PostHog (analytics)
- Sentry (error tracking)
- Supabase (backend-as-a-service)-> for users who create their app with PlusUltra



**For App Store Deployment:**
- Apple Developer Account (App Store Connect API)
- Google Play Developer Account
- EAS Build Account (Expo)

**For Web Deployment:**
- Vercel Account
- Netlify Account
- Cloudflare Account

---

## Installation

### Step 1: Clone Repository

```bash
git clone https://github.com/your-org/plusultra.git
cd plusultra/plusultra/backend
```

### Step 2: Install Dependencies

```bash
npm install
```

This will install all required packages including:
- Fastify (web framework)
- Prisma (ORM)
- AI SDKs (OpenAI, Anthropic, Google)
- Neo4j driver
- Stripe SDK
- And 80+ other dependencies

### Step 3: Verify Installation

```bash
npm list --depth=0
```

Should show all dependencies installed without errors.

---

## Environment Configuration

### Step 1: Create Environment File

```bash
cp .env.example .env
```

### Step 2: Configure Core Services

Edit `.env` and add the following:

#### Database Configuration

```bash
# PostgreSQL
DATABASE_URL=postgresql://user:password@localhost:5432/plusultra
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=10

# Redis
REDIS_URL=redis://localhost:6379
REDIS_PASSWORD=your_redis_password  # Optional
REDIS_HOST=localhost
REDIS_PORT=6379

# Neo4j (for TCI features)
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_neo4j_password
```

#### AI Provider Keys

```bash
# OpenAI
OPENAI_API_KEY=sk-proj-xxxxxxxxxxxxxxxxxxxxx

# Anthropic (Claude)
ANTHROPIC_API_KEY=sk-ant-xxxxxxxxxxxxxxxxxxxxx

# xAI Grok (Grok)
XAI_API_KEY=AIzaSyxxxxxxxxxxxxxxxxxxxxx

# HuggingFace (optional - for Starcoder)
HUGGINGFACE_API_KEY=hf_xxxxxxxxxxxxxxxxxxxxx
```

#### Storage Configuration

```bash
# Cloudflare R2 (or S3-compatible)
R2_ACCOUNT_ID=your_account_id
R2_ACCESS_KEY_ID=xxxxxxxxxxxxxxxxxxxxx
R2_SECRET_ACCESS_KEY=xxxxxxxxxxxxxxxxxxxxx
R2_BUCKET_NAME=plusultra-artifacts
R2_PUBLIC_URL=https://pub-xxxxx.r2.dev

# Alternative: AWS S3
# AWS_ACCESS_KEY_ID=xxxxx
# AWS_SECRET_ACCESS_KEY=xxxxx
# AWS_S3_BUCKET=plusultra-storage
# AWS_REGION=us-east-1
```

#### Billing & Payments

```bash
# Stripe
STRIPE_SECRET_KEY=sk_live_xxxxxxxxxxxxxxxxxxxxx
STRIPE_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxxxxxxxxx

# Stripe Price IDs (create these in Stripe Dashboard)
STRIPE_PRICE_STARTER_MONTHLY=price_xxxxx
STRIPE_PRICE_STARTER_YEARLY=price_xxxxx
STRIPE_PRICE_PRO_MONTHLY=price_xxxxx
STRIPE_PRICE_PRO_YEARLY=price_xxxxx
```

#### Authentication

```bash
# JWT
JWT_SECRET=your_super_secure_secret_min_32_characters_long
JWT_EXPIRES_IN=7d

# Supabase (if using)
SUPABASE_URL=https://xxxxx.supabase.co
SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# OAuth Redirect URLs
AUTH_REDIRECT_URL=https://yourapp.com/auth/callback
OAUTH_REDIRECT_URL=https://yourapp.com/oauth/callback
```

#### App Store Deployment

```bash
# Apple App Store Connect
APPLE_KEY_ID=ABC123XYZ
APPLE_ISSUER_ID=12345678-1234-1234-1234-123456789012
APPLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
IOS_BUNDLE_ID=com.yourcompany.app

# Google Play Developer
GOOGLE_SERVICE_ACCOUNT_EMAIL=service@project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_KEY='{"type":"service_account",...}'
ANDROID_PACKAGE_NAME=com.yourcompany.app

# EAS Build
EAS_PROJECT_ID=your-expo-project-id
EXPO_TOKEN=your-expo-token
```

#### Web Deployment

```bash
# Vercel
VERCEL_TOKEN=your-vercel-token

# Netlify
NETLIFY_TOKEN=your-netlify-token

# Cloudflare Pages
CLOUDFLARE_API_TOKEN=your-cloudflare-token
CLOUDFLARE_ACCOUNT_ID=your-account-id
```

#### Monitoring & Observability

```bash
# Sentry (error tracking)
SENTRY_DSN=https://xxxxx@xxxxx.ingest.sentry.io/xxxxx

# PostHog (analytics)
POSTHOG_API_KEY=phc_xxxxxxxxxxxxxxxxxxxxx
POSTHOG_HOST=https://app.posthog.com

# OpenTelemetry
OTEL_EXPORTER_OTLP_ENDPOINT=https://your-otel-collector:4317
```

#### Application Settings

```bash
# Server
NODE_ENV=development
PORT=3001
HOST=0.0.0.0

# Frontend URL
FRONTEND_URL=http://localhost:3000

# CORS
ALLOWED_ORIGINS=http://localhost:3000,https://app.yourcompany.com

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Admin
ADMIN_API_KEY=your_secure_admin_key
```

### Step 3: Validate Configuration

```bash
# Check environment variables are loaded
node -e "require('dotenv').config(); console.log(Object.keys(process.env).filter(k => k.includes('API')).length + ' API keys configured')"
```

---

## Database Setup

### Step 1: Create PostgreSQL Database

```bash
# Using psql
createdb plusultra

# Or via SQL
psql -U postgres -c "CREATE DATABASE plusultra;"
```

### Step 2: Run Migrations

```bash
# Deploy all migrations
npm run db:migrate:deploy

# Generate Prisma client
npm run db:generate
```

### Step 3: Seed Database (Optional)

```bash
npm run db:seed
```

This will create:
- Sample user accounts
- Test projects
- Default tier configurations

### Step 4: Verify Database

```bash
# Open Prisma Studio to view data
npm run db:studio
```

Browser will open at `http://localhost:5555`

---

## Service Configuration

### Redis Setup

#### Local Development

```bash
# Start Redis
redis-server

# Verify connection
redis-cli ping
# Should return: PONG
```

#### Production (Docker)

```bash
docker run -d \
  --name plusultra-redis \
  -p 6379:6379 \
  -v redis-data:/data \
  redis:latest redis-server --appendonly yes
```

### Neo4j Setup (TCI Features)

#### Local Development

```bash
# Start Neo4j
docker run -d \
  --name plusultra-neo4j \
  -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/your-password \
  -v neo4j-data:/data \
  neo4j:latest
```

Access Neo4j Browser: `http://localhost:7474`

#### Initialize Indexes

```bash
# Run initialization script
npx ts-node scripts/init-neo4j.ts
```

This creates:
- Indexes on change IDs and timestamps
- Constraints for uniqueness
- Graph schema optimizations

### Pinecone Setup (Vector Database)

1. Create account at [pinecone.io](https://pinecone.io)
2. Create a new index:
   - Name: `plusultra-vectors`
   - Dimensions: `1536` (for OpenAI embeddings)
   - Metric: `cosine`
   - Environment: `us-east-1-aws`
3. Add API key to `.env`

### Stripe Setup

#### Development Mode

```bash
# Install Stripe CLI
brew install stripe/stripe-cli/stripe

# Login
stripe login

# Forward webhooks to local
stripe listen --forward-to localhost:3001/api/v1/billing/webhook
```

#### Create Products & Prices

```bash
# Create Starter product
stripe products create --name="Starter" --description="250 tokens/month"

# Create price (monthly)
stripe prices create \
  --product=prod_xxxxx \
  --unit-amount=2500 \
  --currency=usd \
  --recurring='{"interval":"month"}'

# Create price (yearly)
stripe prices create \
  --product=prod_xxxxx \
  --unit-amount=24000 \
  --currency=usd \
  --recurring='{"interval":"year"}'
```

Add price IDs to `.env` file.

---

## Development Setup

### Start Development Server

```bash
# With auto-reload
npm run dev
```

Server will restart automatically when you save files.

### Run in Debug Mode

```bash
# VSCode launch.json configuration
{
  "type": "node",
  "request": "launch",
  "name": "Debug Backend",
  "runtimeExecutable": "npm",
  "runtimeArgs": ["run", "dev"],
  "skipFiles": ["<node_internals>/**"]
}
```

### API Testing

#### Using cURL

```bash
# Health check
curl http://localhost:3001/health

# API status
curl http://localhost:3001/api/v1/status

# Generate assets (requires auth)
curl -X POST http://localhost:3001/api/assets/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{"appName":"MyApp","platform":"both"}'
```

#### Using Postman

Import the API collection from `docs/PlusUltra.postman_collection.json`

---

## Production Deployment

### Build for Production

```bash
# Build TypeScript
npm run build

# Verify build
ls -la dist/
```

### Deployment Options

#### Option 1: Docker Deployment

```bash
# Build image
docker build -t plusultra-backend .

# Run container
docker run -d \
  --name plusultra-api \
  -p 3001:3001 \
  --env-file .env \
  --restart unless-stopped \
  plusultra-backend

# View logs
docker logs -f plusultra-api
```

#### Option 2: PM2 (Process Manager)

```bash
# Install PM2 globally
npm install -g pm2

# Start with PM2
pm2 start dist/server.js --name plusultra-backend

# Save PM2 configuration
pm2 save

# Auto-start on reboot
pm2 startup
```

#### Option 3: Railway

```bash
# Install Railway CLI
npm install -g @railway/cli

# Login
railway login

# Create project
railway init

# Add environment variables
railway variables set DATABASE_URL="postgresql://..."
railway variables set OPENAI_API_KEY="sk-..."
# ... add all other variables

# Deploy
railway up
```

#### Option 4: Render

1. Create new Web Service
2. Connect GitHub repository
3. Build command: `npm install && npm run build`
4. Start command: `npm start`
5. Add environment variables in dashboard

#### Option 5: AWS/GCP/Azure

See `DEPLOYMENT_ROADMAP.md` for cloud-specific instructions.

### SSL/TLS Configuration

#### Using Let's Encrypt

```bash
# Install certbot
sudo apt-get install certbot

# Generate certificate
sudo certbot certonly --standalone -d api.yourcompany.com

# Certificates will be in:
# /etc/letsencrypt/live/api.yourcompany.com/
```

Update `.env`:
```bash
SSL_CERT_PATH=/etc/letsencrypt/live/api.yourcompany.com/fullchain.pem
SSL_KEY_PATH=/etc/letsencrypt/live/api.yourcompany.com/privkey.pem
```

### Database Migration (Production)

```bash
# Run migrations
npm run db:migrate:deploy

# NEVER run db:migrate:dev in production!
```

### Monthly Token Reset (Cron Job)

```bash
# Add to crontab
crontab -e

# Add line (runs 1st of month at midnight):
0 0 1 * * psql $DATABASE_URL -c "SELECT reset_monthly_tokens();"
```

---

## Testing

### Run All Tests

```bash
# Unit tests
npm test

# Watch mode
npm run test:watch

# Coverage report
npm run test:coverage
```

### Test Suites

#### Unit Tests
- TCI components
- Token economy
- Billing services
- AI orchestration

#### Integration Tests
- Complete workflows
- API endpoints
- Database operations
- External service mocks

### Test TCI System

```bash
npx ts-node scripts/verify-tci.ts
```

Expected output:
```
🔍 Verifying TCI System...

System Health:
✓ TCI Core: healthy
✓ Quarantine Layer: healthy
✓ Voting System: healthy
✓ Embedding Cache: healthy

✅ TCI System Verified!
```

### Load Testing

```bash
# Install k6
brew install k6

# Run load test
k6 run tests/load/basic-load.js
```

---

## Troubleshooting

### Common Issues

#### 1. "Cannot connect to database"

```bash
# Check PostgreSQL is running
pg_isready

# Check connection string
psql $DATABASE_URL

# Verify DATABASE_URL format
# Should be: postgresql://user:password@host:port/database
```

#### 2. "Redis connection failed"

```bash
# Check Redis is running
redis-cli ping

# Check Redis logs
redis-cli info

# Restart Redis
redis-server --daemonize yes
```

#### 3. "Neo4j connection timeout"

```bash
# Check Neo4j is running
docker ps | grep neo4j

# Check logs
docker logs plusultra-neo4j

# Verify credentials
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your_password
```

#### 4. "Port 3001 already in use"

```bash
# Find process using port
lsof -ti:3001

# Kill process
kill -9 $(lsof -ti:3001)

# Or use different port
PORT=3002 npm start
```

#### 5. "Stripe webhook signature verification failed"

```bash
# Use Stripe CLI for local testing
stripe listen --forward-to localhost:3001/api/v1/billing/webhook

# Copy webhook secret to .env
STRIPE_WEBHOOK_SECRET=whsec_xxxxx
```

#### 6. "TypeScript compilation errors"

```bash
# Clean build
rm -rf dist/
npm run build

# Check TypeScript version
npx tsc --version

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install
```

### Debug Mode

Enable verbose logging:

```bash
LOG_LEVEL=debug npm start
```

### Health Checks

```bash
# Basic health
curl http://localhost:3001/health

# Circuit breaker status
curl http://localhost:3001/health/circuit-breakers

# Database health
curl http://localhost:3001/api/v1/status
```

---

## Monitoring & Maintenance

### Log Files

```bash
# View application logs
pm2 logs plusultra-backend

# View Docker logs
docker logs -f plusultra-api

# Search logs
pm2 logs | grep ERROR
```

### Database Maintenance

```bash
# Vacuum PostgreSQL
psql $DATABASE_URL -c "VACUUM ANALYZE;"

# Check database size
psql $DATABASE_URL -c "SELECT pg_size_pretty(pg_database_size('plusultra'));"

# Backup database
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql
```

### Redis Maintenance

```bash
# Check memory usage
redis-cli info memory

# Flush cache (use carefully!)
redis-cli FLUSHALL

# Save snapshot
redis-cli SAVE
```

### Metrics to Monitor

1. **API Response Times**
   - p50, p95, p99 latencies
   - Target: <200ms for most endpoints

2. **Database Connections**
   - Active connections
   - Connection pool usage
   - Query performance

3. **Memory Usage**
   - Node.js heap size
   - Redis memory
   - Database cache hit ratio

4. **Error Rates**
   - 4xx errors (client errors)
   - 5xx errors (server errors)
   - Target: <0.1% error rate

5. **Token Usage**
   - Tokens consumed per user
   - Users approaching limits
   - Cost per request

### Alerts to Set Up

1. **Critical**
   - Server down (>2 min)
   - Database connection failed
   - Stripe webhook failures

2. **Warning**
   - High error rate (>1%)
   - Slow response times (>500ms)
   - Users hitting token limits

3. **Info**
   - New subscriptions
   - Large token consumption
   - Failed authentication attempts

---

## Security Checklist

### Before Production

- [ ] All API keys in environment variables
- [ ] HTTPS/TLS enabled
- [ ] Rate limiting configured
- [ ] CORS whitelist set for production domains
- [ ] JWT secrets are strong (32+ characters)
- [ ] Database credentials rotated
- [ ] Stripe webhook signature verification enabled
- [ ] Input validation on all endpoints
- [ ] SQL injection protection (Prisma handles this)
- [ ] XSS protection headers (Helmet configured)
- [ ] Audit logging enabled
- [ ] Sentry error tracking configured
- [ ] Regular security updates scheduled

---

## Performance Tuning

### Node.js Optimization

```bash
# Increase heap size for large workloads
NODE_OPTIONS="--max-old-space-size=4096" npm start
```

### Database Optimization

```bash
# Add indexes for common queries
CREATE INDEX idx_projects_user ON projects(user_id);
CREATE INDEX idx_token_usage_user_date ON token_usage(user_id, created_at);
```

### Redis Caching

Enable embedding cache for faster AI queries:

```bash
ENABLE_EMBEDDING_CACHE=true
CACHE_TTL=3600
```

### Job Queue Scaling

```bash
JOB_QUEUE_MIN_WORKERS=2
JOB_QUEUE_MAX_WORKERS=20
JOB_QUEUE_SCALE_UP_THRESHOLD=15
```

---

## Backup Strategy

### Database Backups

```bash
# Daily backup script
#!/bin/bash
BACKUP_DIR="/backups/postgres"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
pg_dump $DATABASE_URL | gzip > $BACKUP_DIR/backup_$TIMESTAMP.sql.gz

# Keep only last 7 days
find $BACKUP_DIR -mtime +7 -delete
```

### File Storage Backups

Cloudflare R2 has automatic redundancy. For additional backup:

```bash
# Sync to S3 glacier for long-term storage
aws s3 sync s3://plusultra-r2-bucket s3://plusultra-backup-glacier \
  --storage-class GLACIER
```

---

## Support & Resources

- **Documentation:** https://docs.plusultra.dev
- **API Reference:** https://api.plusultra.dev/docs
- **Status Page:** https://status.plusultra.dev
- **GitHub Issues:** https://github.com/your-org/plusultra/issues
- **Discord Community:** https://discord.gg/plusultra
- **Email Support:** support@plusultra.dev

---

**Congratulations!** Your PlusUltra backend is now ready for production. For feature details and architecture information, see [FEATURES_AND_ARCHITECTURE.md](FEATURES_AND_ARCHITECTURE.md).

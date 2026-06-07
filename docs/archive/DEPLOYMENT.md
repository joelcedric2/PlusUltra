# PlusUltra API Deployment Guide

Complete guide for deploying PlusUltra API server to production environments.

## Table of Contents
- [Prerequisites](#prerequisites)
- [Environment Setup](#environment-setup)
- [Database Setup](#database-setup)
- [API Server Deployment](#api-server-deployment)
- [Docker Deployment](#docker-deployment)
- [Kubernetes Deployment](#kubernetes-deployment)
- [Monitoring & Observability](#monitoring--observability)
- [Security Checklist](#security-checklist)
- [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Services
- **PostgreSQL** 14+ (recommend managed service like Supabase, AWS RDS, or DigitalOcean)
- **Redis** 6+ (recommend managed service like Upstash, AWS ElastiCache, or Redis Cloud)
- **Node.js** 18+ runtime environment
- **Docker** (for containerized deployments)
- **Domain name** with SSL certificate

### Required API Keys
- OpenAI API key (GPT models)
- Anthropic API key (Claude models)
- Google AI API key (Gemini models)
- Cloudflare R2 or AWS S3 (storage)
- Stripe API keys (payments)
- GitHub OAuth app (authentication)

### Optional Services
- Sentry (error tracking)
- PostHog (analytics)
- Liveblocks (collaboration)
- Supabase Management API (auto-provisioning)

---

## Environment Setup

### 1. Clone Repository

```bash
git clone https://github.com/your-org/plusultra.git
cd plusultra
```

### 2. API Server Environment Variables

Create `/plusultra/backend/.env`:

```bash
# Core Configuration
NODE_ENV=production
PORT=3001
BASE_URL=https://api.your-domain.com

# Database
DATABASE_URL=postgresql://user:password@host:5432/plusultra?schema=public

# Redis
REDIS_URL=redis://default:password@host:6379

# Security
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
ENCRYPTION_KEY=your-encryption-key-32-chars

# AI Providers
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=...

# Storage (Cloudflare R2)
R2_ACCOUNT_ID=your-account-id
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=plusultra-artifacts

# Payment (Stripe)
STRIPE_SECRET_KEY=sk_live_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PUBLISHABLE_KEY=pk_live_...

# GitHub OAuth
GITHUB_CLIENT_ID=...
GITHUB_CLIENT_SECRET=...
GITHUB_CALLBACK_URL=https://your-domain.com/auth/github/callback

# Monitoring (Optional)
SENTRY_DSN=https://...@sentry.io/...
POSTHOG_API_KEY=phc_...
POSTHOG_HOST=https://app.posthog.com

# Email (Optional)
SMTP_HOST=smtp.sendgrid.net
SMTP_PORT=587
SMTP_USER=apikey
SMTP_PASS=...
EMAIL_FROM=noreply@your-domain.com

# Supabase Management (Optional - for auto-provisioning)
SUPABASE_ACCESS_TOKEN=...
SUPABASE_ORG_ID=...

# Rate Limiting
RATE_LIMIT_MAX=100
RATE_LIMIT_WINDOW=60000

# CORS
CORS_ORIGIN=https://your-domain.com

# Temporal (Optional)
TEMPORAL_ADDRESS=localhost:7233
TEMPORAL_NAMESPACE=default

# Docker Sandbox
DOCKER_HOST=unix:///var/run/docker.sock
SANDBOX_TIMEOUT=300000
```

### 3. Client Integration

The PlusUltra API can be consumed by any client application. Use the following endpoints:

- **REST API**: `https://api.your-domain.com/api/v1/*`
- **WebSocket**: `wss://api.your-domain.com/api/v1/realtime/*`
- **Health Check**: `https://api.your-domain.com/health`

See the [API Documentation](plusultra/backend/docs/API.md) for complete endpoint reference.

---

## Database Setup

### 1. Create PostgreSQL Database

```sql
-- Using psql or your database management tool
CREATE DATABASE plusultra;
CREATE USER plusultra_user WITH ENCRYPTED PASSWORD 'your-password';
GRANT ALL PRIVILEGES ON DATABASE plusultra TO plusultra_user;
```

### 2. Run Migrations

```bash
cd plusultra/backend

# Install dependencies
npm install

# Generate Prisma client
npx prisma generate

# Run migrations
npx prisma migrate deploy

# (Optional) Seed initial data
npm run seed
```

### 3. Verify Database

```bash
npx prisma studio
# Opens GUI at http://localhost:5555
```

---

## API Server Deployment

### Option 1: Direct Node.js Deployment

```bash
cd plusultra/backend

# Install production dependencies
npm ci --production

# Build TypeScript
npm run build

# Start server with PM2
npm install -g pm2
pm2 start dist/server.js --name plusultra-backend

# Configure PM2 to start on boot
pm2 startup
pm2 save
```

### Option 2: Docker Deployment

```bash
cd plusultra/backend

# Build image
docker build -t plusultra-backend:latest .

# Run container
docker run -d \
  --name plusultra-backend \
  --env-file .env \
  -p 3001:3001 \
  --restart unless-stopped \
  plusultra-backend:latest

# View logs
docker logs -f plusultra-backend
```

### Option 3: Cloud Platform Deployment

#### Vercel/Railway/Render

1. Connect GitHub repository
2. Set environment variables in dashboard
3. Configure build command: `npm run build`
4. Configure start command: `npm start`
5. Deploy

#### AWS EC2

```bash
# SSH into EC2 instance
ssh -i your-key.pem ubuntu@your-ec2-ip

# Install Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Clone and setup
git clone https://github.com/your-org/plusultra.git
cd plusultra/backend
npm install
npm run build

# Setup systemd service
sudo nano /etc/systemd/system/plusultra-backend.service
```

Systemd service file:
```ini
[Unit]
Description=PlusUltra Backend
After=network.target

[Service]
Type=simple
User=ubuntu
WorkingDirectory=/home/ubuntu/plusultra/backend
ExecStart=/usr/bin/node dist/server.js
Restart=on-failure
Environment=NODE_ENV=production

[Install]
WantedBy=multi-user.target
```

```bash
# Start service
sudo systemctl enable plusultra-backend
sudo systemctl start plusultra-backend
sudo systemctl status plusultra-backend
```

---

## Docker Deployment

### Complete Stack with Docker Compose

Create `docker-compose.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:14
    environment:
      POSTGRES_DB: plusultra
      POSTGRES_USER: plusultra_user
      POSTGRES_PASSWORD: ${DB_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U plusultra_user"]
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    command: redis-server --requirepass ${REDIS_PASSWORD}
    volumes:
      - redis_data:/data
    ports:
      - "6379:6379"
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5

  api:
    build: ./plusultra/backend
    environment:
      DATABASE_URL: postgresql://plusultra_user:${DB_PASSWORD}@postgres:5432/plusultra
      REDIS_URL: redis://default:${REDIS_PASSWORD}@redis:6379
    env_file:
      - ./plusultra/backend/.env
    ports:
      - "3001:3001"
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    restart: unless-stopped
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock # For sandbox features

volumes:
  postgres_data:
  redis_data:
```

Deploy:

```bash
# Create .env file with secrets
echo "DB_PASSWORD=your-db-password" > .env
echo "REDIS_PASSWORD=your-redis-password" >> .env

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f

# Stop all services
docker-compose down
```

---

## Kubernetes Deployment

### 1. Create Kubernetes Manifests

`k8s/deployment.yaml`:

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: plusultra-backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: plusultra-backend
  template:
    metadata:
      labels:
        app: plusultra-backend
    spec:
      containers:
      - name: backend
        image: your-registry/plusultra-backend:latest
        ports:
        - containerPort: 3001
        env:
        - name: DATABASE_URL
          valueFrom:
            secretKeyRef:
              name: plusultra-secrets
              key: database-url
        - name: REDIS_URL
          valueFrom:
            secretKeyRef:
              name: plusultra-secrets
              key: redis-url
        resources:
          requests:
            memory: "512Mi"
            cpu: "500m"
          limits:
            memory: "1Gi"
            cpu: "1000m"
        livenessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /health
            port: 3001
          initialDelaySeconds: 5
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: plusultra-backend
spec:
  selector:
    app: plusultra-backend
  ports:
  - port: 80
    targetPort: 3001
  type: LoadBalancer
```

### 2. Create Secrets

```bash
kubectl create secret generic plusultra-secrets \
  --from-literal=database-url='postgresql://...' \
  --from-literal=redis-url='redis://...' \
  --from-literal=jwt-secret='your-jwt-secret'
```

### 3. Deploy

```bash
kubectl apply -f k8s/deployment.yaml
kubectl get pods
kubectl logs -f deployment/plusultra-backend
```

---

## Monitoring & Observability

### 1. Sentry Setup

```typescript
// Already integrated in code
// Just set environment variable:
SENTRY_DSN=https://...@sentry.io/...
```

### 2. PostHog Analytics

```typescript
// Backend: Already integrated
POSTHOG_API_KEY=phc_...
POSTHOG_HOST=https://app.posthog.com

// Frontend: Already integrated
NEXT_PUBLIC_POSTHOG_KEY=phc_...
```

### 3. Health Checks

```bash
# Backend health
curl https://api.your-domain.com/health

# Response:
{
  "status": "healthy",
  "timestamp": "2025-10-24T...",
  "services": {
    "database": "connected",
    "redis": "connected",
    "ai_providers": "operational"
  }
}
```

### 4. Logs

```bash
# Using PM2
pm2 logs plusultra-backend

# Using Docker
docker logs -f plusultra-backend

# Using Kubernetes
kubectl logs -f deployment/plusultra-backend
```

---

## Security Checklist

### Pre-Deployment

- [ ] All secrets stored in environment variables (not in code)
- [ ] JWT_SECRET is strong and unique (min 32 characters)
- [ ] Database uses strong password
- [ ] Redis requires authentication
- [ ] CORS configured for production domain only
- [ ] Rate limiting enabled
- [ ] HTTPS/TLS certificates configured
- [ ] Database backups configured
- [ ] Firewall rules configured (only ports 80, 443 open)
- [ ] Environment variables validated
- [ ] API keys rotated from development
- [ ] Webhook secrets configured (Stripe, GitHub)

### Post-Deployment

- [ ] SSL certificate valid (check with SSL Labs)
- [ ] Security headers configured (CSP, HSTS, etc.)
- [ ] DDoS protection enabled (Cloudflare, AWS Shield)
- [ ] Monitoring alerts configured
- [ ] Backup strategy tested
- [ ] Incident response plan documented
- [ ] Access logs enabled
- [ ] Regular security audits scheduled

---

## Troubleshooting

### Backend Won't Start

```bash
# Check environment variables
printenv | grep DATABASE_URL

# Check database connection
npx prisma db push

# Check logs
pm2 logs plusultra-backend --lines 100
```

### Database Connection Issues

```bash
# Test connection
psql "postgresql://user:password@host:5432/plusultra"

# Check migrations
npx prisma migrate status

# Reset if needed (CAUTION: destroys data)
npx prisma migrate reset
```

### Redis Connection Issues

```bash
# Test Redis
redis-cli -h host -p 6379 -a password ping

# Should return: PONG
```

### Build Failures

```bash
# Clear caches
rm -rf node_modules package-lock.json
rm -rf .next # Frontend
rm -rf dist  # Backend

# Reinstall
npm install
npm run build
```

### Memory Issues

```bash
# Increase Node.js memory
NODE_OPTIONS="--max-old-space-size=4096" npm start

# Or in PM2
pm2 start dist/server.js --name backend --node-args="--max-old-space-size=4096"
```

### WebSocket Connection Issues

- Ensure your reverse proxy (nginx, ALB) supports WebSocket
- Check CORS settings allow WebSocket connections
- Verify `NEXT_PUBLIC_WS_URL` uses `wss://` (not `ws://`)

---

## Backup & Recovery

### Database Backups

```bash
# Automated daily backup
pg_dump -h host -U user plusultra > backup-$(date +%Y%m%d).sql

# Restore
psql -h host -U user plusultra < backup-20251024.sql
```

### Redis Backups

```bash
# Manual snapshot
redis-cli -h host -a password SAVE

# Automated (in redis.conf)
save 900 1
save 300 10
save 60 10000
```

### R2/S3 Backups

- Enable versioning on bucket
- Configure lifecycle policies
- Use cross-region replication

---

## Performance Optimization

### Backend

- Enable gzip compression
- Configure connection pooling (Prisma)
- Use Redis for caching
- Enable CDN for static assets
- Monitor slow queries

### Frontend

- Enable Next.js image optimization
- Use static generation where possible
- Implement code splitting
- Configure CDN (Vercel, Cloudflare)
- Enable compression

---

## Scaling

### Horizontal Scaling

```bash
# PM2 cluster mode
pm2 start dist/server.js -i max

# Docker Swarm
docker service scale plusultra-backend=5

# Kubernetes
kubectl scale deployment plusultra-backend --replicas=5
```

### Database Scaling

- Enable read replicas
- Use connection pooling (PgBouncer)
- Consider sharding for very large datasets

### Redis Scaling

- Use Redis Cluster for high availability
- Enable persistence (AOF + RDB)
- Configure eviction policies

---

## Support

For deployment issues:
- Check [Troubleshooting](#troubleshooting) section
- Review logs and error messages
- Contact support@plusultra.dev

---

**Deployment Status Checklist**

Before going live:
- [ ] All environment variables set
- [ ] Database migrated
- [ ] SSL certificates valid
- [ ] Health checks passing
- [ ] Monitoring configured
- [ ] Backups enabled
- [ ] Security checklist completed
- [ ] Load testing performed
- [ ] Documentation reviewed
- [ ] Team trained on deployment

**You're ready to deploy!** 🚀

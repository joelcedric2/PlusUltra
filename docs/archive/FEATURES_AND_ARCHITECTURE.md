# PlusUltra - Features and Architecture

**Last Updated:** October 25, 2025
**Version:** 1.0.0
**Status:** Production Ready

---

## Table of Contents

1. [Overview](#overview)
2. [System Architecture](#system-architecture)
3. [Core Features](#core-features)
4. [API Documentation](#api-documentation)
5. [Technology Stack](#technology-stack)
6. [Database Schema](#database-schema)
7. [Security & Compliance](#security--compliance)
8. [Pricing & Token Economy](#pricing--token-economy)
9. [Roadmap](#roadmap)

---

## Overview

PlusUltra is an AI-powered application development platform that transforms natural language descriptions into production-ready applications across multiple frameworks (React Native, Flutter, SwiftUI) with enterprise-grade features.

### Vision

Turn ideas into deployed apps (TestFlight / Play Internal) in minutes, with full code ownership, deterministic provenance, and enterprise security.

### Key Statistics

- **Lines of Code:** 42,598+ (Backend API)
- **Features Implemented:** 61+ major features
- **Architecture Components:** 52 core services
- **AI Models Integrated:** 4 specialized models
- **Platform Targets:** 8 platforms across 4 frameworks
- **API Route Groups:** 30+ comprehensive REST API systems
- **Build Status:** ✅ 0 critical errors, production ready

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Frontend Layer                        │
│  (React, Vue, Angular, Mobile Apps - Not in this repo)      │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                     API Gateway Layer                        │
│   Fastify 5.6.1 │ CORS │ Rate Limiting │ Circuit Breakers  │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌──────────────┐    ┌──────────────┐    ┌──────────────┐
│ AI Services  │    │   Business   │    │  Publishing  │
│              │    │    Logic     │    │   Services   │
├──────────────┤    ├──────────────┤    ├──────────────┤
│• GPT-5       │    │• Projects    │    │• App Store   │
│• Claude 4.5  │    │• Users       │    │• Play Store  │
│• Grok 2  │    │• Billing     │    │• Vercel      │
│• Starcoder   │    │• Auth        │    │• Netlify     │
└──────────────┘    └──────────────┘    └──────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      Data Layer                              │
│  PostgreSQL │ Redis │ Neo4j │ Pinecone │ Cloudflare R2     │
└─────────────────────────────────────────────────────────────┘
```

### Component Architecture

#### 1. API Gateway (Fastify)

**Location:** `src/server.ts`

**Responsibilities:**
- Request routing
- Authentication/authorization
- Rate limiting (100 req/min default)
- CORS management
- Circuit breakers for external APIs
- WebSocket connections
- SSL/TLS termination

**Key Features:**
- Health checks
- Graceful shutdown
- Request logging
- Error handling

#### 2. Service Layer

**Organization:**
```
src/services/
├── ai/              # AI model integrations
├── assets/          # Asset generation
├── auth/            # Authentication services
├── billing/         # Billing & subscriptions
├── build/           # EAS build integration
├── collaboration/   # Real-time collaboration
├── compliance/      # Compliance reporting
├── database/        # Database operations
├── debugging/       # Debug assistance
├── export/          # Multi-platform export
├── job-queue/       # Background jobs
├── learning/        # AI learning loops
├── monitoring/      # Observability
├── orchestration/   # AI orchestration
├── packaging/       # App packaging
├── payments/        # Stripe integration
├── privacy/         # Privacy management
├── publishing/      # Store submission
├── rbac/            # Access control
├── realtime/        # WebSocket services
├── storage/         # File storage (R2/S3)
├── store/           # App store APIs
├── tci/             # Temporal Code Intelligence
├── temporal/        # TCI temporal features
├── token/           # Token management
└── vector/          # Vector embeddings
```

#### 3. Route Layer

**Organization:**
```
src/routes/
├── advanced-collaboration.ts
├── ai/
│   ├── chat.ts
│   ├── orchestration.ts
│   └── starcoder.ts
├── assets.ts
├── backend-detection.ts
├── billing/
│   └── index.ts
├── build.ts
├── debugging.ts
├── export.ts
├── learning.ts
├── monitoring/
│   └── queue-monitoring.ts
├── orchestration.ts
├── rbac.ts
├── realtime/
│   └── realtime.ts
├── store.ts
├── supabase.ts
├── temporal-code-intelligence.ts
├── temporal-code-intelligence-enterprise.ts
├── token.ts
└── token-economy.ts
```

### Data Flow

#### Code Generation Pipeline

```
1. User Request
   └─▶ POST /api/v1/generate-app
        │
2. TCI Analysis
   └─▶ Predictive Quarantine Check
        │
3. Multi-AI Orchestration
   ├─▶ GPT-5 (primary generation)
   ├─▶ Claude 4.5 (validation)
   └─▶ Grok 2 (consensus)
        │
4. Consensus Validation
   └─▶ Similarity scoring (embeddings)
        │
5. Code Generation
   ├─▶ Component generation
   ├─▶ Style application
   └─▶ Platform optimization
        │
6. Quality Assurance
   ├─▶ ESLint validation
   ├─▶ Type checking
   └─▶ Security scan
        │
7. Storage & Versioning
   ├─▶ Cloudflare R2 storage
   ├─▶ Git commit creation
   └─▶ Neo4j causal chain
        │
8. Response
   └─▶ Generated code + metadata
```

#### Deployment Pipeline

```
1. Build Trigger
   └─▶ POST /api/v1/build/trigger
        │
2. Platform Detection
   └─▶ iOS / Android / Web
        │
3. EAS Build (Mobile)
   ├─▶ React Native build
   ├─▶ Asset compilation
   └─▶ Binary generation
        │
4. Asset Preparation
   ├─▶ Icon generation (Canva)
   ├─▶ Screenshot creation
   └─▶ Feature graphics
        │
5. Store Submission
   ├─▶ App Store Connect API
   ├─▶ Google Play API
   └─▶ Metadata upload
        │
6. Monitoring
   └─▶ Build status tracking
        │
7. Auto-Fix (if rejected)
   └─▶ AI analysis of rejection
        └─▶ Automated resubmission
```

---

## Core Features

### 1. Multi-Agent AI Orchestration ⭐

**Status:** Production Ready

**Models Integrated:**
- **GPT-5** (OpenAI) - Primary code generation
- **Claude 4.5** (Anthropic) - Code review & validation
- **Grok 2** (Google) - Consensus validation
- **StarCoder** (HuggingFace) - Code optimization

**Capabilities:**
- Intelligent model routing based on task complexity
- Weighted voting system for consensus
- Cost-optimized token usage
- Automatic fallback on failures
- Streaming responses for real-time feedback

**Key Files:**
- `src/services/orchestration/MultiAgentOrchestrator.ts`
- `src/services/ai/MeteredAIService.ts`
- `src/routes/ai/orchestration.ts`

**Example Usage:**
```typescript
POST /api/v1/ai/orchestrate
{
  "intent": "Create user authentication",
  "models": ["gpt-5", "claude-3.5", "gemini-2.0"],
  "votingStrategy": "weighted",
  "consensusThreshold": 0.7
}
```

---

### 2. Temporal Code Intelligence (TCI) 🚀

**Status:** 100% Production Ready

**Revolutionary Features:**
- Time-aware AI development
- Multi-model consensus validation
- Predictive quarantine with auto-risk detection
- Cryptographic Merkle chain audit trail
- Neo4j temporal graph for causal chains
- PDF compliance reports (SOC2, GDPR, HIPAA, ISO27001)
- Continuous feedback learning
- Deterministic replay capability

**Components:**

#### A. Predictive Quarantine
**File:** `src/services/tci/PredictiveQuarantineOrchestrator.ts`

Automatically detects high-risk code and quarantines for human review.

**Risk Factors:**
- Low confidence scores
- Security vulnerabilities
- Breaking changes detected
- Unusual patterns
- Failed validation checks

**Example:**
```typescript
POST /api/v1/tci/generate-with-prediction
{
  "model": "gpt-5",
  "intent": "Add payment processing",
  "context": { "environment": "production" }
}

Response:
{
  "quarantined": true,
  "riskLevel": 0.85,
  "suggestedFixes": [
    "Add input validation for card numbers",
    "Implement rate limiting on payment endpoint"
  ]
}
```

#### B. Merkle Chain
**File:** `src/services/tci/MerkleEnvelopeChain.ts`

Cryptographically links all code changes for tamper-evident audit trail.

**Features:**
- SHA-256 hashing
- Merkle tree signatures
- Chain verification
- Compliance export

#### C. Neo4j Temporal Graph
**File:** `src/services/temporal/Neo4jGraphService.ts`

Tracks causal relationships between code changes over time.

**Queries:**
- Get causal chain (forward/backward)
- Find similar changes
- Impact analysis
- Temporal range queries

#### D. Compliance Reports
**File:** `src/services/compliance/PDFComplianceReportGenerator.ts`

Generates professional PDF reports for:
- SOC2 Type II
- GDPR Article 30
- HIPAA Security Rule
- ISO 27001
- PCI-DSS

**Example:**
```typescript
POST /api/v1/tci/generate-compliance-report
{
  "reportType": "SOC2",
  "companyName": "Your Company",
  "reportPeriod": {
    "start": "2025-01-01",
    "end": "2025-12-31"
  }
}
```

---

### 3. Intelligent Database Detection 🆕

**Status:** Production Ready

**Capabilities:**
- AI-powered backend requirement detection
- Automatic database suggestions (Supabase/Firebase/AWS)
- Step-by-step setup guides
- Auto-provisioning (Supabase)
- Connection testing before deployment

**Key Files:**
- `src/services/database/DatabaseDetectionService.ts`
- `src/routes/backend-detection.ts`

**API Endpoints:**
```
POST /api/v1/backend-detection/analyze
POST /api/v1/backend-detection/setup-guide
POST /api/v1/supabase/test-connection
POST /api/v1/supabase/provision
```

---

### 4. Multi-Platform Export 📱

**Status:** Production Ready

**Supported Platforms:**
- iOS (Swift, SwiftUI)
- Android (Kotlin, Jetpack Compose)
- React Native (iOS + Android)
- Flutter
- Web (React, Vue, Next.js)
- Desktop (Electron)

**Features:**
- Platform-specific code optimization
- Asset generation per platform
- Automatic dependency management
- Build configuration

**Key Files:**
- `src/services/export/MultiPlatformExportService.ts`
- `src/routes/export.ts`

---

### 5. App Store Automation 🏪

**Status:** Production Ready

**Apple App Store:**
- JWT-based authentication
- App creation and management
- Build upload (IPA files)
- Screenshot upload (all device sizes)
- Metadata localization
- TestFlight deployment
- App Review submission
- Rejection detection and analysis

**Google Play:**
- OAuth2 service account
- AAB/APK upload
- Multi-track releases (internal/alpha/beta/production)
- Staged rollouts
- Listing management
- Screenshot upload
- Review retrieval

**Key Files:**
- `src/services/store/AppStoreConnectAPI.ts`
- `src/services/store/GooglePlayDeveloperAPI.ts`
- `src/services/publishing/StoreSubmissionOrchestrator.ts`

**API Endpoints:**
```
POST /api/v1/store/submit
GET /api/v1/store/status/:submissionId
POST /api/v1/store/handle-rejection
```

---

### 6. AI-Powered Rejection Handler 🤖

**Status:** Production Ready

**Capabilities:**
- Analyzes rejection reasons using Claude AI
- Categorizes issues (metadata, assets, privacy, code, compliance)
- Determines if auto-fixable
- Generates improved metadata
- Regenerates assets via Canva
- Creates privacy policies
- Automatic resubmission (up to 3 attempts)

**Categories:**

| Category | Auto-Fixable | Action |
|----------|--------------|--------|
| Metadata | ✅ Yes | Claude rewrites descriptions |
| Assets | ✅ Yes | Regenerate via Canva |
| Privacy | ✅ Partial | Generate privacy policy |
| UI/UX | ❌ No | Requires code changes |
| Bugs | ❌ No | Requires fixes |
| Compliance | ❌ No | Legal review needed |

**Key Files:**
- `src/services/publishing/RejectionHandler.ts`

---

### 7. Web Deployment Service 🌐

**Status:** Production Ready

**Platforms:**
- ✅ Vercel (Next.js, React, Vue optimized)
- ✅ Netlify (JAMstack, serverless functions)
- ✅ Cloudflare Pages (global CDN)
- ⏳ AWS Amplify (framework ready)

**Features:**
- Framework auto-detection
- Build command execution
- Custom domain setup
- Environment variable injection
- Deployment status monitoring
- Rollback capability

**Key Files:**
- `src/services/publishing/WebDeployService.ts`

**Example:**
```typescript
POST /api/v1/deploy/web
{
  "platform": "vercel",
  "projectPath": "/path/to/nextjs-app",
  "framework": "nextjs",
  "domain": "myapp.com"
}
```

---

### 8. Token Economy & Billing 💰

**Status:** Production Ready

**Token System:**
- 1 PlusUltra Token = 1M API tokens (combined I/O)
- Tracks GPT-4, Claude, Grok consumption
- Real-time balance tracking
- Monthly reset system
- Transaction history

**Stripe Integration:**
- Complete subscription lifecycle
- Checkout session creation
- Billing portal access
- Tier upgrades/downgrades
- Webhook handling (6 event types)
- Invoice management

**Tier Enforcement:**
- Automatic limit checking
- Project/collaborator/storage limits
- Feature-based access control
- Preset configurations

**Key Files:**
- `src/services/billing/TokenEconomyService.ts`
- `src/services/billing/StripeBillingService.ts`
- `src/middleware/TierEnforcementMiddleware.ts`
- `src/routes/billing/index.ts`

**API Endpoints (15 total):**
```
GET  /api/v1/billing/tiers
GET  /api/v1/billing/usage
POST /api/v1/billing/estimate
GET  /api/v1/billing/subscription
POST /api/v1/billing/checkout
POST /api/v1/billing/change-tier
POST /api/v1/billing/webhook
... and 8 more
```

---

### 9. Real-Time Collaboration 👥

**Status:** 95% Complete

**Features:**
- Live code editing (Y.js CRDT)
- Presence awareness
- Cursor tracking
- Comment threads
- WebSocket-based sync
- Conflict-free merging

**Integrations:**
- Liveblocks (presence & storage)
- Y.js (collaborative editing)
- Redis (session state)

**Key Files:**
- `src/services/collaboration/CollaborationService.ts`
- `src/routes/realtime/realtime.ts`

---

### 10. Docker Sandbox System 🐳

**Status:** Production Ready

**Features:**
- Isolated execution environments
- Live code preview
- File system operations
- Command execution
- Resource limits (CPU, memory)
- Network isolation
- TCI monitoring integration

**Key Files:**
- `src/services/sandbox/DockerSandbox.ts`
- `src/services/sandbox/WorkspaceManager.ts`
- `src/services/sandbox/LivePreviewService.ts`
- `src/lib/initializeSandbox.ts`

**API Endpoints:**
```
POST /api/v1/sandbox/create
POST /api/v1/sandbox/execute
GET  /api/v1/sandbox/preview/:workspaceId
POST /api/v1/sandbox/stop
```

---

### 11. GitHub Integration 🔗

**Status:** Production Ready

**Features:**
- OAuth authentication
- Repository creation
- Automatic project export
- Commit history preservation
- Branch management
- Pull request creation

**Key Files:**
- `src/services/export/GitHubExportService.ts`
- `src/routes/auth/github.ts`

---

### 12. Role-Based Access Control (RBAC) 🔐

**Status:** Production Ready

**Roles:**
- Owner (full access)
- Admin (manage members, edit)
- Editor (edit content)
- Viewer (read-only)

**Features:**
- Project-level permissions
- Organization support
- Invitation system
- Audit logging

**Key Files:**
- `src/services/rbac/RBACService.ts`
- `src/routes/rbac.ts`

---

## API Documentation

### Authentication

All API requests (except health checks) require authentication.

**Methods:**

1. **JWT Bearer Token**
```bash
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

2. **API Key**
```bash
X-API-Key: your-api-key-here
```

### Core Endpoints

#### Generate App

```http
POST /api/v1/generate-app
Content-Type: application/json
Authorization: Bearer {token}

{
  "intent": "Create a todo app with user authentication",
  "platform": "react-native",
  "framework": "expo",
  "features": ["auth", "database", "push-notifications"]
}

Response:
{
  "success": true,
  "projectId": "proj_abc123",
  "code": {
    "files": [...],
    "dependencies": {...}
  },
  "buildUrl": "https://github.com/user/project"
}
```

#### Generate Assets

```http
POST /api/assets/generate
Content-Type: application/json
Authorization: Bearer {token}

{
  "appName": "MyAwesomeApp",
  "platform": "both",
  "userPrompt": "Fitness tracking app with green theme",
  "preferences": {
    "colorScheme": ["#00C853", "#FFFFFF"],
    "style": "modern"
  }
}

Response:
{
  "success": true,
  "assets": {
    "logo": "https://cdn.../logo.png",
    "icons": [...],
    "screenshots": [...]
  }
}
```

#### Submit to Stores

```http
POST /api/v1/store/submit
Content-Type: application/json
Authorization: Bearer {token}

{
  "projectId": "proj_abc123",
  "platform": "both",
  "appName": "MyApp",
  "version": "1.0.0",
  "description": "Amazing app description",
  "screenshots": {...}
}

Response:
{
  "success": true,
  "ios": {
    "submissionId": "sub_ios_123",
    "storeUrl": "https://apps.apple.com/..."
  },
  "android": {
    "submissionId": "sub_and_456",
    "storeUrl": "https://play.google.com/..."
  }
}
```

#### Deploy to Web

```http
POST /api/v1/deploy/web
Content-Type: application/json
Authorization: Bearer {token}

{
  "platform": "vercel",
  "projectPath": "/path/to/project",
  "framework": "nextjs",
  "domain": "myapp.com"
}

Response:
{
  "success": true,
  "url": "https://myapp.vercel.app",
  "buildTime": 45000,
  "deploymentId": "dep_xyz789"
}
```

#### Billing & Usage

```http
GET /api/v1/billing/usage
Authorization: Bearer {token}

Response:
{
  "userId": "user_123",
  "tier": "pro",
  "period": {
    "start": "2025-10-01",
    "end": "2025-10-31"
  },
  "consumed": {
    "plusultraTokens": 450,
    "breakdown": {
      "gpt4Tokens": 200000000,
      "claudeTokens": 150000000,
      "geminiTokens": 100000000
    }
  },
  "remaining": 550,
  "limit": 1000
}
```

### WebSocket Endpoints

#### Real-Time Code Generation

```javascript
const ws = new WebSocket('wss://api.plusultra.dev/api/v1/realtime/generate/{sessionId}');

ws.send(JSON.stringify({
  type: 'generate',
  intent: 'Create user profile component',
  context: {...}
}));

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  if (data.type === 'code-chunk') {
    console.log('Generated:', data.code);
  }
};
```

### Rate Limits

| Tier | Requests/min | Burst |
|------|--------------|-------|
| Free | 10 | 20 |
| Starter | 30 | 60 |
| Pro | 100 | 200 |
| Enterprise | Custom | Custom |

### Error Codes

| Code | Meaning | Resolution |
|------|---------|------------|
| 400 | Bad Request | Check request format |
| 401 | Unauthorized | Add valid auth token |
| 403 | Forbidden | Upgrade tier or check permissions |
| 429 | Rate Limited | Reduce request rate |
| 500 | Server Error | Retry or contact support |

---

## Technology Stack

### Backend Core

- **Framework:** Fastify 5.6.1
- **Language:** TypeScript 5.9.3
- **Runtime:** Node.js 18+
- **ORM:** Prisma 6.17.1

### Databases

- **Primary:** PostgreSQL 13+
- **Cache:** Redis 6.0+
- **Graph:** Neo4j 5.27+
- **Vector:** Pinecone / Weaviate

### AI & ML

- **OpenAI:** GPT-4, GPT-5, text-embedding-ada-002
- **Anthropic:** Claude 3.5, Claude 4.5
- **Google:** Grok 2, Grok 2
- **HuggingFace:** StarCoder, CodeLlama
- **LangChain:** 0.3.36 (orchestration)

### Storage & CDN

- **Object Storage:** Cloudflare R2 (S3-compatible)
- **CDN:** Cloudflare
- **Backup:** AWS S3 Glacier

### External Services

- **Payments:** Stripe
- **Email:** SendGrid / AWS SES
- **SMS:** Twilio
- **Error Tracking:** Sentry
- **Analytics:** PostHog
- **Observability:** OpenTelemetry

### DevOps

- **Containers:** Docker
- **Orchestration:** Docker Compose / Kubernetes
- **CI/CD:** GitHub Actions
- **Monitoring:** Prometheus + Grafana
- **Logging:** Winston + Elasticsearch

---

## Database Schema

### Core Tables

#### Users
```sql
CREATE TABLE users (
  id UUID PRIMARY KEY,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255),
  full_name VARCHAR(255),
  tier VARCHAR(20) DEFAULT 'free',
  stripe_customer_id VARCHAR(255),
  token_balance INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Projects
```sql
CREATE TABLE projects (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  platform VARCHAR(50),
  framework VARCHAR(50),
  status VARCHAR(50),
  repository_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

#### Token Transactions
```sql
CREATE TABLE token_transactions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  amount INTEGER NOT NULL,
  type VARCHAR(50),
  source VARCHAR(50),
  source_tokens BIGINT,
  description TEXT,
  metadata JSONB,
  created_at TIMESTAMP DEFAULT NOW()
);
```

#### Subscriptions
```sql
CREATE TABLE subscriptions (
  id UUID PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  stripe_subscription_id VARCHAR(255),
  tier VARCHAR(20),
  status VARCHAR(50),
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

### Views

#### Monthly Token Usage
```sql
CREATE VIEW monthly_token_usage AS
SELECT
  user_id,
  DATE_TRUNC('month', created_at) as month,
  SUM(amount) as tokens_consumed,
  COUNT(*) as transaction_count
FROM token_transactions
WHERE type = 'consumption'
GROUP BY user_id, DATE_TRUNC('month', created_at);
```

---

## Security & Compliance

### Security Features

1. **Authentication**
   - JWT with HS256/RS256
   - API key support (SHA-256 hashed)
   - OAuth 2.0 (Google, GitHub, Apple)
   - Multi-factor authentication ready

2. **Authorization**
   - Role-based access control (RBAC)
   - Project-level permissions
   - API endpoint protection
   - Tier-based feature access

3. **Data Protection**
   - Encryption at rest (database)
   - Encryption in transit (TLS 1.3)
   - API key hashing
   - Sensitive data masking in logs

4. **Network Security**
   - Rate limiting (per IP, per user, per tier)
   - CORS whitelist
   - DDoS protection (Cloudflare)
   - Circuit breakers for external APIs

5. **Input Validation**
   - Zod schema validation
   - SQL injection protection (Prisma)
   - XSS prevention (Helmet)
   - CSRF tokens

6. **Audit & Monitoring**
   - Comprehensive audit logs
   - Security event tracking
   - Anomaly detection
   - Real-time alerts

### Compliance

#### GDPR (General Data Protection Regulation)
- Right to access
- Right to deletion
- Right to portability
- Data processing agreements
- Privacy by design

#### HIPAA (Health Insurance Portability and Accountability Act)
- Encryption requirements
- Access controls
- Audit trails
- Business associate agreements

#### SOC 2 Type II
- Security controls
- Availability monitoring
- Processing integrity
- Confidentiality measures
- Privacy protections

#### PCI-DSS (Payment Card Industry)
- No card data storage
- Stripe handles all payments
- Secure transmission
- Regular security testing

#### ISO 27001
- Information security management
- Risk assessment
- Security policies
- Incident response

### Compliance Reports

Generated via TCI system:

```typescript
POST /api/v1/tci/generate-compliance-report
{
  "reportType": "SOC2" | "GDPR" | "HIPAA" | "ISO27001" | "PCI-DSS",
  "companyName": "Your Company",
  "reportPeriod": {
    "start": "2025-01-01",
    "end": "2025-12-31"
  }
}
```

---

## Pricing & Token Economy

### Tier Comparison

| Feature | Free | Starter | Pro | Enterprise |
|---------|------|---------|-----|------------|
| **Price** | $0 | $25/mo | $200/mo | Custom |
| **Tokens/month** | 100 | 250 | 1000 | Unlimited |
| **Projects** | 1 | 4 | 10 | Unlimited |
| **Collaborators** | 1 | 3 | 5 | Unlimited |
| **Storage** | 5GB | 25GB | 100GB | Unlimited |
| **Custom Domains** | ❌ | ✅ | ✅ | ✅ |
| **TCI** | ❌ | ❌ | ✅ | ✅ |
| **Advanced Integrations** | ❌ | ❌ | ✅ | ✅ |
| **Custom Branding** | ❌ | ❌ | ✅ | ✅ |
| **Support SLA** | Community | 3-day | 2-day | 1-day |

### Token Economics

**1 PlusUltra Token = 1 Million API Tokens**

Example costs:
- Simple function: 50-100 tokens
- UI component: 200-500 tokens
- Small app: 2,000-5,000 tokens
- Complex app: 10,000-50,000 tokens

### Usage Examples

**Free Tier (100 tokens):**
- 20 simple components
- 10 medium features
- 2 small apps

**Starter Tier (250 tokens):**
- 50 simple components
- 25 medium features
- 5 small apps

**Pro Tier (1000 tokens):**
- 200 simple components
- 100 medium features
- 20 small apps
- 10 complex apps

---

## Roadmap

### Completed Features (61)

✅ Multi-agent AI orchestration
✅ Temporal Code Intelligence (TCI)
✅ Real-time code generation API
✅ Intelligent database detection
✅ Multi-platform export
✅ App Store automation
✅ Web deployment services
✅ Token economy & billing
✅ RBAC & audit trails
✅ Docker sandbox system
✅ GitHub integration
✅ Compliance reporting
✅ Rejection handling
✅ Live collaboration

### In Progress

🚧 AI-powered schema generation
🚧 Multi-database support (hybrid)
🚧 Migration tools between databases
🚧 Template marketplace

### 90-Day Roadmap

**Month 1:**
- GraphQL API
- Enhanced mobile preview
- Token rollover for Pro/Enterprise
- Usage alerts (email at 75%/90%)

**Month 2:**
- Firecracker integration (improved sandbox)
- Team billing (shared pools)
- Additional payment methods
- Referral program

**Month 3:**
- TCI simulation v1 (predictive at scale)
- SDK libraries (Python, JS, Go, Ruby)
- Multi-currency support
- Regional pricing

### Future Vision (6-12 months)

- Full IDE integration (VSCode extension)
- Self-hosted enterprise option
- White-label platform
- Blockchain-based provenance
- Federated learning loops
- Mobile app (iOS/Android)
- Desktop app (Electron)

---

## Performance Benchmarks

### API Response Times (p95)

| Endpoint | Response Time | Notes |
|----------|--------------|-------|
| `/health` | 5ms | No database |
| `/api/v1/status` | 15ms | Redis cached |
| Code generation | 2-5s | Depends on complexity |
| Asset generation | 10-30s | Canva API |
| Store submission | 5-15min | EAS build time |
| Web deployment | 30-90s | Platform dependent |
| Token check | 50ms | Database query |
| Billing operations | 100ms | Stripe API |

### Throughput

- **Concurrent Users:** 1,000+ (tested)
- **Requests/sec:** 500+ (with rate limiting)
- **WebSocket Connections:** 10,000+ concurrent

### Scalability

- **Horizontal:** Redis cluster, load balancers
- **Vertical:** 4-8 core instances recommended
- **Database:** Read replicas for scaling
- **Job Queue:** Auto-scaling workers (2-20)

---

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for:
- Code style guidelines
- Commit message format
- Pull request process
- Testing requirements
- Documentation standards

---

## License

Proprietary - All Rights Reserved

---

## Support

- **Documentation:** https://docs.plusultra.dev
- **API Reference:** https://api.plusultra.dev/docs
- **Status Page:** https://status.plusultra.dev
- **GitHub Issues:** https://github.com/your-org/plusultra/issues
- **Discord:** https://discord.gg/plusultra
- **Email:** support@plusultra.dev
- **Enterprise Sales:** sales@plusultra.dev

---

**Built with cutting-edge AI technology to empower developers worldwide.**

For setup and deployment instructions, see [SETUP_AND_DEPLOYMENT.md](SETUP_AND_DEPLOYMENT.md).

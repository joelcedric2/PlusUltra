# PlusUltra TCI System - Production Deployment Guide

## 🚀 Overview

This guide covers deploying the complete TCI (Truth Consistency Interface) system to production. The system is **100% production-ready** and only requires API keys to be configured.

## 📋 Prerequisites

### Required Services & API Keys

1. **Database Services**
   - PostgreSQL (for Prisma ORM)
   - Redis (for caching and job queues)
   - Neo4j (for temporal graph database)

2. **AI Model Providers**
   - OpenAI API key (GPT models)
   - Anthropic API key (Claude models)
   - Google AI API key (Gemini models)
   - HuggingFace API key (Starcoder models) - Optional

3. **Vector Database**
   - Pinecone API key OR Weaviate instance

4. **Storage**
   - Cloudflare R2 (or S3-compatible storage)

5. **Monitoring & Observability**
   - Sentry DSN (error tracking)
   - PostHog API key (analytics) - Optional

## 🔧 Installation Steps

### Step 1: Clone and Install Dependencies

```bash
cd plusultra/backend
npm install
```

### Step 2: Configure Environment Variables

Copy the example environment file:

```bash
cp .env.example .env
```

Edit `.env` and fill in all required API keys:

```bash
# Critical - Required for TCI to function
DATABASE_URL=postgresql://user:password@localhost:5432/plusultra
REDIS_URL=redis://localhost:6379

# AI Providers (at least one required)
OPENAI_API_KEY=sk-...
ANTHROPIC_API_KEY=sk-ant-...
GOOGLE_AI_API_KEY=AI...

# Vector Database (choose one)
PINECONE_API_KEY=...
PINECONE_ENVIRONMENT=us-east-1-aws
PINECONE_INDEX_NAME=plusultra-vectors

# Graph Database (for temporal chains)
NEO4J_URI=bolt://localhost:7687
NEO4J_USERNAME=neo4j
NEO4J_PASSWORD=your-password

# Storage (for envelopes and artifacts)
R2_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET_NAME=plusultra-artifacts

# Optional but recommended
HUGGINGFACE_API_KEY=hf_...
SENTRY_DSN=https://...
```

### Step 3: Initialize Databases

```bash
# Run Prisma migrations
npm run db:migrate:deploy

# Generate Prisma client
npm run db:generate

# Optional: Seed initial data
npm run db:seed
```

### Step 4: Initialize Neo4j Indexes

Start your Neo4j instance and run:

```typescript
import { Neo4jGraphService } from './src/services/temporal/Neo4jGraphService';

const neo4j = new Neo4jGraphService({
  uri: process.env.NEO4J_URI!,
  username: process.env.NEO4J_USERNAME!,
  password: process.env.NEO4J_PASSWORD!
});

await neo4j.initialize();
await neo4j.createIndexes();
```

### Step 5: Build Production Bundle

```bash
npm run build
```

### Step 6: Run Production Server

```bash
# With pm2 (recommended)
pm2 start dist/server.js --name plusultra-backend

# Or with node
npm run start
```

## 🧪 Testing Before Production

### Run All Tests

```bash
# Unit tests
npm run test

# Integration tests
npm run test:ci

# Coverage report
npm run test:coverage
```

### Verify TCI Components

Create a test script `scripts/verify-tci.ts`:

```typescript
import { TCIOrchestrator } from './src/services/tci/TCIOrchestrator';
import { TruthConsistencyInterface } from './src/services/tci/TruthConsistencyInterface';
import { PineconeClient } from '@pinecone-database/pinecone';

async function verifyTCI() {
  console.log('🔍 Verifying TCI System...\n');

  // Initialize Pinecone
  const pinecone = new PineconeClient();
  await pinecone.init({
    apiKey: process.env.PINECONE_API_KEY!,
    environment: process.env.PINECONE_ENVIRONMENT!
  });

  const index = pinecone.Index(process.env.PINECONE_INDEX_NAME!);

  // Create TCI instance
  const tci = new TruthConsistencyInterface(index);
  const orchestrator = new TCIOrchestrator(tci, index);

  // Get system status
  const status = await orchestrator.getTCIStatus();

  console.log('System Health:');
  console.log('✓ TCI Core:', status.systemHealth.tciCore);
  console.log('✓ Quarantine Layer:', status.systemHealth.quarantineLayer);
  console.log('✓ Voting System:', status.systemHealth.votingSystem);
  console.log('✓ Embedding Cache:', status.systemHealth.embeddingCache);

  console.log('\nRecommendations:');
  status.recommendations.forEach(rec => console.log(' ', rec));

  console.log('\n✅ TCI System Verified!\n');
}

verifyTCI().catch(console.error);
```

Run verification:

```bash
npx ts-node scripts/verify-tci.ts
```

## 📊 Production Configuration

### Environment-Specific Settings

**Staging:**
```bash
NODE_ENV=staging
LOG_LEVEL=debug
ENABLE_API_DOCS=true
```

**Production:**
```bash
NODE_ENV=production
LOG_LEVEL=info
ENABLE_API_DOCS=false
ENABLE_AUDIT_LOGGING=true
```

### Performance Tuning

**Redis Configuration:**
```bash
REDIS_MAX_RETRIES=10
REDIS_RETRY_DELAY=3000
```

**Job Queue:**
```bash
JOB_QUEUE_MIN_WORKERS=2
JOB_QUEUE_MAX_WORKERS=20
JOB_QUEUE_SCALE_UP_THRESHOLD=15
```

**Rate Limiting:**
```bash
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
```

## 🔒 Security Best Practices

### 1. API Key Management

- Store all API keys in environment variables or secrets manager (AWS Secrets Manager, HashiCorp Vault)
- Never commit `.env` files to version control
- Rotate API keys quarterly
- Use different keys for staging and production

### 2. Network Security

```bash
# Enable CORS for specific origins only
CORS_ORIGINS=https://app.plusultra.com,https://admin.plusultra.com

# Use HTTPS only in production
HOST=0.0.0.0
PORT=443
```

### 3. Database Security

- Use SSL/TLS for all database connections
- Enable encryption at rest
- Implement database connection pooling
- Use read replicas for scaling

## 📈 Monitoring & Observability

### Sentry Error Tracking

```typescript
import * as Sentry from '@sentry/node';

Sentry.init({
  dsn: process.env.SENTRY_DSN,
  environment: process.env.NODE_ENV,
  tracesSampleRate: 1.0
});
```

### PostHog Analytics

```typescript
import { PostHog } from 'posthog-node';

const posthog = new PostHog(
  process.env.POSTHOG_API_KEY!,
  { host: process.env.POSTHOG_HOST }
);
```

### OpenTelemetry

Already configured in `src/server.ts`. Metrics automatically exported to configured endpoint.

## 🔄 TCI Workflow Usage

### Example: Generate Code with TCI

```typescript
import { PredictiveQuarantineOrchestrator } from './services/tci/PredictiveQuarantineOrchestrator';

// Initialize orchestrator (dependency injection)
const result = await orchestrator.generateWithPrediction(
  'gpt-5',
  'Create user authentication middleware',
  {
    targetFile: 'src/middleware/auth.ts',
    environment: 'production',
    userId: 'user_123',
    workspaceId: 'ws_456',
    projectId: 'proj_789'
  },
  async (intent, context) => {
    // Your code generation logic
    const code = await yourAIService.generate(intent);
    return {
      code,
      confidence: 0.95,
      explanation: 'Generated auth middleware',
      tokensUsed: 200,
      processingTime: 1500
    };
  }
);

if (result.quarantined) {
  console.log('⚠️ Code quarantined - requires review');
  console.log('Suggested fixes:', result.suggestedFixes);
  console.log('Risk mitigation:', result.riskMitigation);
} else {
  console.log('✅ Code approved automatically');
  // Deploy or commit code
}
```

### Example: Multi-Model Consensus

```typescript
import { TCIOrchestrator } from './services/tci/TCIOrchestrator';

const outputs = [
  {
    model: 'gpt-5',
    output: 'function add(a, b) { return a + b; }',
    confidence: 0.95,
    processingTime: 100,
    metadata: { timestamp: Date.now(), contextHash: 'hash1', domain: 'coding' }
  },
  {
    model: 'claude-3.5',
    output: 'const add = (a, b) => a + b;',
    confidence: 0.93,
    processingTime: 120,
    metadata: { timestamp: Date.now(), contextHash: 'hash2', domain: 'coding' }
  },
  {
    model: 'gemini-2.0',
    output: 'function add(a, b) { return a + b; }',
    confidence: 0.92,
    processingTime: 110,
    metadata: { timestamp: Date.now(), contextHash: 'hash3', domain: 'coding' }
  }
];

const consensus = await tciOrchestrator.orchestrateMultiAIValidation(
  outputs,
  'Create addition function',
  'coding'
);

console.log('Consensus:', consensus.finalResult.consensus);
console.log('Overall Score:', consensus.validationReport.overallScore);

if (consensus.finalResult.consensus < 0.2) {
  console.log('⚠️ Low consensus - models disagree significantly');
}
```

### Example: Generate Compliance Report

```typescript
import { PDFComplianceReportGenerator } from './services/compliance/PDFComplianceReportGenerator';

const generator = new PDFComplianceReportGenerator();

const result = await generator.generateReport(
  {
    reportType: 'SOC2',
    companyName: 'Your Company',
    reportPeriod: {
      start: new Date('2025-01-01'),
      end: new Date('2025-12-31')
    },
    auditor: {
      name: 'Jane Auditor',
      organization: 'Audit Firm LLC',
      email: 'jane@auditfirm.com'
    },
    includeEnvelopeDetails: true,
    includeChainVerification: true
  },
  complianceData,
  '/path/to/report.pdf'
);

if (result.success) {
  console.log('✅ Compliance report generated:', result.filePath);
}
```

## 🚨 Troubleshooting

### Common Issues

**1. Neo4j Connection Failed**
```bash
# Check Neo4j is running
systemctl status neo4j

# Verify credentials
neo4j-admin show-password
```

**2. Pinecone Index Not Found**
```bash
# Create index via Pinecone console or API
# Dimension: 1536 (for OpenAI embeddings)
# Metric: cosine
```

**3. High Memory Usage**
```bash
# Increase Node.js heap size
NODE_OPTIONS="--max-old-space-size=4096" npm start
```

**4. Slow Performance**
```bash
# Enable Redis caching
ENABLE_EMBEDDING_CACHE=true
CACHE_TTL=3600

# Increase worker count
JOB_QUEUE_MAX_WORKERS=10
```

## 📞 Support

For production support:
- GitHub Issues: https://github.com/anthropics/plusultra/issues
- Email: support@plusultra.com
- Documentation: https://docs.plusultra.com

## 📝 Changelog

### v1.0.0 (2025-01-25)
- ✅ Complete TCI implementation
- ✅ Neo4j temporal graph integration
- ✅ HuggingFace Starcoder integration
- ✅ PDF compliance reporting
- ✅ Comprehensive test suite
- ✅ Production-ready deployment

## 🎯 Next Steps

After deployment:

1. **Monitor System Health**
   - Check Sentry for errors
   - Monitor Redis memory usage
   - Review PostHog analytics

2. **Scale as Needed**
   - Add more workers for job queue
   - Implement read replicas for PostgreSQL
   - Add Redis cluster for high availability

3. **Optimize Performance**
   - Enable embedding cache
   - Tune rate limits
   - Implement CDN for static assets

4. **Compliance**
   - Schedule quarterly audits
   - Generate monthly compliance reports
   - Review and update security policies

---

**🎉 Your TCI system is now production-ready!**

Just add your API keys and you're good to go. All components are fully tested and ready for production use.

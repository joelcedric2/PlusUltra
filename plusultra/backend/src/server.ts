/// <reference path="./types/fastify.d.ts" />
// Type augmentations are loaded from ./types/fastify.d.ts via the reference directive above
import Fastify from 'fastify';
import cors from '@fastify/cors';
import redis from '@fastify/redis';
import websocket from '@fastify/websocket';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import dotenv from 'dotenv';
import { IncomingMessage } from 'http';
import fs from 'fs';
import path from 'path';
import { PrismaClient } from '@prisma/client';
import Stripe from 'stripe';
import { orchestrationRoutes } from './routes/orchestration';
import { authRoutes as githubAuthRoutes } from './routes/auth/github'; // Existing GitHub auth routes
import emailPasswordAuthRoutes from './routes/auth'; // My new email/password auth routes
import { basicAuthRoutes, projectRoutes } from './routes/projects';
import { sandboxRoutes } from './routes/sandbox';
import { realtimeRoutes } from './routes/realtime/realtime';
import { tokenRoutes } from './routes/token';
import temporalCodeIntelligenceEnterpriseRoutes from './routes/temporal-code-intelligence-enterprise';
import { queueMonitoringRoutes } from './routes/monitoring/queue-monitoring';
import blindJudgeRoutes from './routes/blind-judge';
import googleDocsCollaborationRoutes from './routes/realtime/google-docs-collaboration';
import tciChatRoutes from './routes/tci-chat';
import aiEraCollaborationRoutes from './routes/ai-era-collaboration';
import { contactRoutes } from './routes/contact';
import { modelTelemetryRoutes } from './routes/ai/model-telemetry';
import { confidenceQuarantineRoutes } from './routes/ai/confidence-quarantine';
import { settingsRoutes } from './routes/settings';
import { revenueAnalyticsRoutes } from './routes/admin/revenue-analytics';
import tci6LayerRoutes from './routes/tci-6layer';
import tciDashboardRoutes from './routes/admin/tci-dashboard';
import collaborationRoutes from './routes/realtime-collaboration';
import selfHealingRoutes from './routes/self-healing';
import { hostingRoutes } from './routes/hosting';
import authPlugin from './plugins/auth'; // My new auth plugin

// Check if SSL certificates exist for HTTPS
const getSSLConfig = () => {
  const sslCertPath = process.env.SSL_CERT_PATH;
  const sslKeyPath = process.env.SSL_KEY_PATH;

  if (sslCertPath && sslKeyPath && fs.existsSync(sslCertPath) && fs.existsSync(sslKeyPath)) {
    return {
      key: fs.readFileSync(sslKeyPath),
      cert: fs.readFileSync(sslCertPath)
    };
  }

  // Check for Let's Encrypt certificates
  const letsEncryptPath = '/etc/letsencrypt/live';
  if (fs.existsSync(letsEncryptPath)) {
    const domains = fs.readdirSync(letsEncryptPath);
    if (domains.length > 0) {
      const domain = domains[0]; // Use first available domain
      const certPath = path.join(letsEncryptPath, domain, 'fullchain.pem');
      const keyPath = path.join(letsEncryptPath, domain, 'privkey.pem');

      if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
        return {
          key: fs.readFileSync(keyPath),
          cert: fs.readFileSync(certPath)
        };
      }
    }
  }

  return null; // No SSL certificates found
};

// Circuit breaker implementation for external API calls
class CircuitBreaker {
  private failureCount = 0;
  private lastFailureTime = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';

  constructor(
    private failureThreshold: number = 5,
    private recoveryTimeout: number = 60000, // 1 minute
    private monitoringPeriod: number = 300000 // 5 minutes
  ) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime > this.recoveryTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN - service unavailable');
      }
    }

    try {
      const result = await operation();

      if (this.state === 'HALF_OPEN') {
        this.state = 'CLOSED';
        this.failureCount = 0;
      }

      return result;
    } catch (error) {
      this.recordFailure();
      throw error;
    }
  }

  private recordFailure() {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
      console.warn(`Circuit breaker OPEN for service after ${this.failureCount} failures`);
    }
  }

  getState() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      lastFailureTime: this.lastFailureTime
    };
  }
}

// Global circuit breakers for external services
export const circuitBreakers = {
  openai: new CircuitBreaker(3, 30000, 120000), // 3 failures, 30s recovery, 2min monitoring
  stripe: new CircuitBreaker(5, 60000, 300000), // 5 failures, 1min recovery, 5min monitoring
  github: new CircuitBreaker(3, 30000, 120000), // 3 failures, 30s recovery, 2min monitoring
  supabase: new CircuitBreaker(5, 60000, 300000), // 5 failures, 1min recovery, 5min monitoring
};

// Decorate Fastify instance with circuit breakers and external services
declare module 'fastify' {
  interface FastifyInstance {
    circuitBreakers: typeof circuitBreakers;
    jobQueueService: any; // We'll properly type this when we have the full service
    scalingService: any; // We'll properly type this when we have the full service
    prisma: PrismaClient;
    stripe: Stripe;
  }
}

const sslConfig = getSSLConfig();

const fastify = Fastify({
  logger: true,
  ...(sslConfig && { https: sslConfig }), // Enable HTTPS if certificates are available
});

// Initialize Prisma client
const prisma = new PrismaClient({
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});
fastify.decorate('prisma', prisma);

// Initialize Stripe client
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || '', {
  apiVersion: '2025-02-24.acacia',
});
fastify.decorate('stripe', stripe);

// Add circuit breakers to Fastify instance
fastify.decorate('circuitBreakers', circuitBreakers);

// Async initialization function to handle top-level awaits
async function initializeServer() {
// Register security headers
await fastify.register(helmet, {
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      scriptSrc: ["'self'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "https:", "wss:"],
      fontSrc: ["'self'", "https:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // Disable for now as it might break some features
});

// Register CORS (updated for HTTPS)
await fastify.register(cors, {
  origin: (origin, cb) => {
    // Allow requests with no origin (mobile apps, Postman, etc.)
    if (!origin) return cb(null, true);

    // In production, specify allowed origins
    if (process.env.NODE_ENV === 'production') {
      const allowedOrigins = process.env.ALLOWED_ORIGINS?.split(',') || [];
      if (allowedOrigins.includes(origin)) {
        return cb(null, true);
      }
      return cb(new Error('Not allowed by CORS'), false);
    }

    // In development, allow all origins
    return cb(null, true);
  },
  credentials: true
});

// Register rate limiting to prevent abuse and implement backpressure
await fastify.register(rateLimit, {
  max: 100, // Maximum 100 requests per time window
  timeWindow: 60000, // 60 seconds (1 minute) time window
  cache: 10000, // Cache size for rate limit storage
  keyGenerator: (request) => {
    // Use IP address for rate limiting, fallback to a default key
    return request.ip || 'anonymous';
  },
  errorResponseBuilder: (request, context) => {
    return {
      error: 'Rate limit exceeded',
      code: 'RATE_LIMIT_EXCEEDED',
      message: `Too many requests. Maximum ${context.max} requests per minute allowed.`,
      retryAfter: Math.ceil(context.ttl / 1000), // Seconds until reset
      requestId: 'rate-limit-' + Date.now(),
      timestamp: new Date().toISOString()
    };
  },
  allowList: (request) => {
    // Allow health checks and status endpoints
    return request.url === '/health' || request.url.startsWith('/api/v1/status');
  }
});

// Register Redis plugin for session management
await fastify.register(redis, {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT || '6379'),
  password: process.env.REDIS_PASSWORD
});

// Register WebSocket support (updated for HTTPS)
await fastify.register(websocket, {
  options: {
    maxPayload: 1048576, // 1MB max payload
    verifyClient: (info: { origin: string; secure: boolean; req: IncomingMessage }) => {
      // Add any WebSocket authentication logic here
      return true;
    }
  }
});

// Health check endpoint
fastify.get('/health', async (request, reply) => {
  return { status: 'OK', timestamp: new Date().toISOString() };
});

// Circuit breaker status endpoint
fastify.get('/health/circuit-breakers', async (request, reply) => {
  const circuitBreakerStatuses = {
    openai: fastify.circuitBreakers.openai.getState(),
    stripe: fastify.circuitBreakers.stripe.getState(),
    github: fastify.circuitBreakers.github.getState(),
    supabase: fastify.circuitBreakers.supabase.getState(),
    timestamp: new Date().toISOString()
  };

  return {
    status: 'OK',
    data: circuitBreakerStatuses,
    timestamp: new Date().toISOString()
  };
});

// API routes will go here
fastify.get('/api/v1/status', async (request, reply) => {
  return {
    service: 'PlusUltra Backend',
    version: '1.0.0',
    status: 'running',
    ssl: !!sslConfig,
    features: ['orchestration', 'github-auth', 'realtime-generation', 'sandbox-testing', 'project-management', 'token-management', 'token-economy', 'temporal-code-intelligence', 'temporal-code-intelligence-enterprise', 'tci-6-layer-analysis', 'billing-payments', 'eas-build', 'app-store-deployment', 'supabase-provisioning', 'predictive-debugging', 'app-store-automation', 'multi-platform-export', 'learning-agent', 'rbac-audit', 'advanced-collaboration', 'job-queue-monitoring', 'subdomain-hosting']
  };
});

// Initialize JobQueueService for monitoring
const jobQueueService = new (await import('./services/job-queue/JobQueueService')).JobQueueService(
  // We'll need to pass proper dependencies here in a real implementation
  {} as any, // prismaService placeholder
  console, // logger placeholder
);
fastify.decorate('jobQueueService', jobQueueService);

// Initialize DynamicScalingService for auto-scaling
const scalingService = new (await import('./services/job-queue/DynamicScalingService')).DynamicScalingService(
  jobQueueService,
  {
    minWorkers: 1,
    maxWorkers: 10,
    targetQueueDepth: 50,
    scaleUpThreshold: 100,
    scaleDownThreshold: 20,
  }
);
fastify.decorate('scalingService', scalingService);

await fastify.register(authPlugin); // Register my new auth plugin

// Register orchestration routes
await fastify.register(orchestrationRoutes);

// Register authentication routes
await fastify.register(emailPasswordAuthRoutes, { prefix: '/api/v1/auth' }); // My new email/password auth routes
await fastify.register(githubAuthRoutes, { prefix: '/api/v1/auth/github' }); // Existing GitHub auth routes

// Register project management routes
await fastify.register(projectRoutes);

// Register sandbox routes
await fastify.register(sandboxRoutes);

// Register realtime routes
await fastify.register(realtimeRoutes);

// Register token management routes
await fastify.register(tokenRoutes);

// Register temporal code intelligence enterprise routes
await fastify.register(temporalCodeIntelligenceEnterpriseRoutes);

// Register queue monitoring routes
await fastify.register(queueMonitoringRoutes);

// Register blind judge routes
await fastify.register(blindJudgeRoutes, { prefix: '/api/v1/blind-judge' });

// Register Google Docs-style collaboration routes
await fastify.register(googleDocsCollaborationRoutes, { prefix: '/api/v1/realtime' });

// Register TCI Chat Assistant routes
await fastify.register(tciChatRoutes, { prefix: '/api/v1/tci-chat' });

// Register TCI 6-Layer Analysis routes
await fastify.register(tci6LayerRoutes);

// Register AI-Era Collaboration routes
await fastify.register(aiEraCollaborationRoutes, { prefix: '/api/v1/ai-collab' });

// Register contact form routes
await fastify.register(contactRoutes);

// Register user settings routes
await fastify.register(settingsRoutes);

// Register admin revenue analytics routes
await fastify.register(revenueAnalyticsRoutes);

// Register admin TCI dashboard routes
await fastify.register(tciDashboardRoutes);

// Register AI model telemetry routes
await fastify.register(modelTelemetryRoutes);

// Register AI confidence and quarantine routes
await fastify.register(confidenceQuarantineRoutes);

// Register Real-Time Collaboration routes
await fastify.register(collaborationRoutes);

// Register Self-Healing routes
await fastify.register(selfHealingRoutes);

// Register Subdomain Hosting routes
await fastify.register(hostingRoutes);

// Register backend detection routes
const backendDetectionRoutes = await import('./routes/backend-detection');
await fastify.register(backendDetectionRoutes.default);
}

// Start server
const start = async () => {
  try {
    const port = parseInt(process.env.PORT || '3001');
    const protocol = sslConfig ? 'https' : 'http';

    await fastify.listen({ port, host: '0.0.0.0' });

    if (sslConfig) {
      console.log(`🚀 PlusUltra Backend server running on ${protocol}://localhost:${port}`);
      console.log(`🔒 SSL/TLS encryption enabled`);
    } else {
      console.log(`🚀 PlusUltra Backend server running on ${protocol}://localhost:${port}`);
      console.log(`⚠️  Warning: No SSL certificates found. Running in HTTP mode only.`);
    }

    console.log(`📡 WebSocket endpoint: ${protocol === 'https' ? 'wss' : 'ws'}://localhost:${port}/api/v1/realtime/generate/:sessionId`);

    // Initialize Collaboration WebSocket Server
    const { CollaborationWebSocketServer } = await import('./services/collaboration/CollaborationWebSocketServer');
    new CollaborationWebSocketServer(fastify.server);
    console.log(`🤝 Collaboration WebSocket server initialized on /collaboration/ws`);
  } catch (err) {
    fastify.log.error(err);
    process.exit(1);
  }
};

// Initialize and start the server
initializeServer().then(async () => {
  // Initialize Pinecone for TCI pattern storage
  console.log('[Server] Initializing Pinecone vector database...');
  const { pineconeService } = await import('./services/vector/PineconeService');
  await pineconeService.initialize().catch((err) => {
    console.warn('[Server] Pinecone initialization failed, TCI will use PostgreSQL only:', err.message);
  });

  start();
}).catch((err) => {
  console.error('Failed to initialize server:', err);
  process.exit(1);
});

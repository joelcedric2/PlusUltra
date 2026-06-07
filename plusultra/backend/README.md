# PlusUltra Backend

**Status:** ✅ **PLUG AND PLAY READY** - Just add your API keys!

Enterprise-grade AI-powered application development platform backend built with Fastify, TypeScript, and modern AI orchestration.

---

## 🚀 Quick Start (5 Minutes)

**Your backend is completely set up!** Just add AI API keys and start:

```bash
# 1. Add API keys to .env (see ADD_API_KEYS.md)
# 2. Run the startup script
./start.sh
# 3. Backend will be running at http://localhost:3001
```

✅ **Already Done:**
- PostgreSQL database created and running
- Redis installed and running
- Database migrations completed
- Prisma client generated
- TypeScript compiled
- Secure secrets auto-generated
- One-command startup ready

👉 **See [ADD_API_KEYS.md](ADD_API_KEYS.md) for 5-minute setup guide**

---

## Features

- 🤖 **Multi-Agent AI Orchestration** - Intelligent routing across GPT-5, Claude 4.5, Grok 2, and StarCoder
- ⏱️ **Temporal Code Intelligence (TCI)** - Understand code evolution and simulate changes
- 🔄 **Real-time Collaboration** - Multi-user code editing with Yjs CRDT
- 📱 **Multi-Platform Export** - Generate iOS, Android, Web, and Desktop apps
- 🚀 **Automated Deployment** - App Store and Google Play submission automation
- 💰 **Token Economy** - Usage-based billing with Stripe integration
- 🔒 **Enterprise Security** - RBAC, audit logging, and compliance reporting (GDPR, HIPAA, SOX)
- 📊 **Advanced Monitoring** - OpenTelemetry, Sentry, and PostHog integration

## Architecture

```
Backend/
├── src/
│   ├── orchestration/       # Multi-agent workflow orchestration
│   ├── services/            # Core business logic services
│   │   ├── ai/             # AI model routing and product management
│   │   ├── temporal/       # TCI and code intelligence
│   │   ├── collaboration/  # Real-time collaboration
│   │   ├── build/          # EAS and mobile builds
│   │   ├── export/         # Multi-platform export
│   │   ├── token/          # Token economy and billing
│   │   ├── sandbox/        # Isolated code execution
│   │   └── ...
│   ├── routes/             # API route handlers
│   ├── schemas/            # Zod validation schemas
│   └── server.ts           # Fastify server entry point
├── migrations/             # Database migrations
└── tests/                  # Test suites
```

## Prerequisites

- Node.js 18+ or Bun runtime
- PostgreSQL 14+
- Redis 6+
- Docker (for sandbox execution)
- Supabase account (optional, for managed database)

## Quick Start

### 1. Install Dependencies

```bash
npm install
# or
bun install
```

### 2. Environment Setup

Copy the example environment file and configure:

```bash
cp .env.example .env
```

**Required Environment Variables:**
- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `OPENAI_API_KEY` - OpenAI API key
- `ANTHROPIC_API_KEY` - Anthropic API key
- `XAI_API_KEY` - xAI Grok API key
- `R2_ACCESS_KEY_ID` & `R2_SECRET_ACCESS_KEY` - Cloudflare R2 credentials
- `STRIPE_SECRET_KEY` - Stripe API key
- `JWT_SECRET` - Secret for JWT tokens (min 32 characters)

See [`.env.example`](.env.example) for full configuration options.

### 3. Database Setup

**Initial Setup:**

1. Create the database (if not already created):
   ```bash
   /opt/homebrew/opt/postgresql@17/bin/psql postgres -c "CREATE DATABASE plusultra;"
   ```

2. Update `.env` with your database credentials:
   ```
   DATABASE_URL=postgresql://YOUR_USER:YOUR_PASSWORD@localhost:5432/plusultra
   ```

3. Generate Prisma Client:
   ```bash
   npm run db:generate
   ```

4. Run migrations:
   ```bash
   npm run db:migrate
   # or for production:
   npm run db:migrate:deploy
   ```

**Database Scripts:**
- `npm run db:migrate` - Create and apply a new migration
- `npm run db:migrate:deploy` - Apply migrations in production
- `npm run db:generate` - Generate Prisma Client
- `npm run db:push` - Push schema changes without creating migrations (dev only)
- `npm run db:studio` - Open Prisma Studio (GUI for database)
- `npm run db:reset` - Reset database (⚠️ destroys all data)

**Database Schema:**

The database includes:
- **User Management**: Users, sessions, API keys
- **Organizations**: Multi-tenant organization support
- **Projects**: Project management with environments
- **Database Provisioning**: Automated database creation and management
- **Build & Deployment**: CI/CD tracking
- **AI & Code Generation**: Code generation history and embeddings with pgvector
- **Token Economy**: Usage tracking and billing
- **GitHub Integration**: Repository connections
- **Audit & Analytics**: Compliance and monitoring

**Extensions:**
- **pgvector**: Vector similarity search for AI embeddings (1536 dimensions)
- **PostGIS**: Geospatial data types and functions

### 4. Build & Run

**Development:**
```bash
npm run dev
# or
bun --watch src/server.ts
```

**Production:**
```bash
npm run build
npm start
# or
bun run build
bun run start
```

The server will start on `http://localhost:3000` (or the port specified in `.env`).

## API Documentation

### Core Endpoints

#### Application Orchestration
- `POST /api/v1/generate-app` - Generate application from natural language
- `GET /api/v1/workflow/:workflowId` - Get workflow status
- `POST /api/v1/workflow/:workflowId/cancel` - Cancel workflow
- `GET /api/v1/orchestration/health` - Health check

#### Real-time Code Generation
- `WS /api/v1/realtime/generate/:sessionId` - WebSocket code generation
- `POST /api/v1/realtime/session` - Create generation session

#### Temporal Code Intelligence (TCI)
- `POST /api/v1/temporal/query` - Query code evolution
- `POST /api/v1/temporal/ingest` - Ingest code changes
- `POST /api/v1/temporal/simulate` - Simulate code changes
- `POST /api/v1/temporal/replay` - Replay code evolution

#### Token Economy & Billing
- `GET /api/v1/token-economy/billing-status` - Get billing status
- `POST /api/v1/token-economy/estimate-tokens` - Estimate token usage
- `POST /api/v1/token-economy/record-usage` - Record token usage
- `POST /api/v1/token-economy/topup` - Top up token balance

#### Export & Deployment
- `POST /api/v1/export/single-platform` - Export to single platform
- `POST /api/v1/export/multi-platform` - Export to multiple platforms
- `POST /api/v1/build/configure` - Configure EAS build
- `POST /api/v1/build/trigger` - Trigger mobile build
- `POST /api/v1/store/submit` - Submit to app stores

#### RBAC & Compliance
- `POST /api/v1/rbac/check-permission` - Check user permissions
- `GET /api/v1/rbac/audit` - Get audit logs
- `POST /api/v1/rbac/compliance-report` - Generate compliance report

See [API Documentation](./docs/API.md) for detailed endpoint specifications.

## Production Deployment

### Docker Deployment

Build the Docker image:
```bash
docker build -t plusultra-backend .
```

Run with docker-compose:
```bash
docker-compose up -d
```

### Environment-Specific Configuration

**Production Checklist:**
- ✅ Set `NODE_ENV=production`
- ✅ Configure all required API keys and secrets
- ✅ Enable SSL/TLS certificates
- ✅ Set up proper CORS origins
- ✅ Configure rate limiting
- ✅ Enable monitoring and logging
- ✅ Set up backup strategy for databases
- ✅ Configure auto-scaling for job workers

### Monitoring & Observability

The backend includes comprehensive monitoring:

- **Error Tracking**: Sentry integration
- **Metrics**: OpenTelemetry with Prometheus
- **Logging**: Structured JSON logs
- **Analytics**: PostHog integration
- **Health Checks**: `/health` endpoint

### Security Considerations

1. **API Keys**: Store all API keys in environment variables or secrets manager
2. **Authentication**: JWT-based authentication with secure secrets
3. **Rate Limiting**: Configured per-route rate limits
4. **CORS**: Whitelist specific origins in production
5. **Data Encryption**: Enable encryption at rest and in transit
6. **Audit Logging**: All sensitive operations are logged

## Development

### Running Tests

```bash
npm test
# or
bun test
```

### Code Quality

```bash
# Linting
npm run lint

# Type checking
npm run type-check

# Format code
npm run format
```

### Adding New Routes

1. Create route file in `src/routes/`
2. Define Zod schemas in `src/schemas/`
3. Implement service logic in `src/services/`
4. Register route in `src/server.ts`

### Adding New Services

1. Create service class in appropriate `src/services/` subdirectory
2. Follow dependency injection pattern
3. Add proper TypeScript types
4. Include error handling and logging

## Troubleshooting

### Common Issues

**Build Errors:**
- Ensure all dependencies are installed: `npm install`
- Clear build cache: `rm -rf dist && npm run build`

**Database Connection:**
- Verify `DATABASE_URL` is correct
- Check PostgreSQL is running: `pg_isready`
- Run migrations: `npx prisma migrate deploy`

**API Keys:**
- Verify all required API keys are set in `.env`
- Check API key permissions and quotas
- Ensure keys are for correct environment (dev/prod)

**Docker Sandbox:**
- Ensure Docker daemon is running
- Check Docker socket permissions
- Verify available disk space for containers

## Performance Optimization

### Caching Strategy
- Redis caching for frequently accessed data
- Embedding cache for vector operations
- Response caching for static endpoints

### Scaling
- Horizontal scaling with load balancer
- Dynamic worker scaling based on queue depth
- Database read replicas for read-heavy workloads
- CDN for static assets

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit changes: `git commit -m 'Add amazing feature'`
4. Push to branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

## License

[Your License Here]

## Support

For issues and questions:
- GitHub Issues: [Link to issues]
- Documentation: [Link to docs]
- Email: support@plusultra.com

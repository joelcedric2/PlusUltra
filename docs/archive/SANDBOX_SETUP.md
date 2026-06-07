# PlusUltra Sandbox Setup Guide

Complete guide for setting up and running the PlusUltra Docker Sandbox System.

## Prerequisites

- Docker Engine 20.10+ (with Docker Compose V2)
- Node.js 20+
- Redis 7+
- PostgreSQL 15+
- At least 8GB RAM
- 20GB free disk space

## Quick Start

### 1. Clone and Install

```bash
git clone https://github.com/your-org/plusultra.git
cd plusultra
cd plusultra/backend
npm install
```

### 2. Environment Configuration

Copy the environment template:

```bash
cp .env.example .env
```

Edit `.env` and configure at minimum:

```bash
# Database
DATABASE_URL=postgresql://plusultra:password@localhost:5432/plusultra
REDIS_URL=redis://localhost:6379

# Docker Sandbox
DOCKER_SOCKET_PATH=/var/run/docker.sock
WORKSPACE_BASE_PATH=/tmp/plusultra-workspaces
PREVIEW_PORT_RANGE_START=3000
PREVIEW_PORT_RANGE_END=4000

# GitHub Integration
GITHUB_CLIENT_ID=your_github_oauth_app_id
GITHUB_CLIENT_SECRET=your_github_oauth_app_secret
GITHUB_REDIRECT_URI=http://localhost:3000/auth/github/callback
```

### 3. Build Docker Images

Build the sandbox container images:

```bash
cd docker
chmod +x build-images.sh
./build-images.sh
```

This creates three images:
- `plusultra/nextjs-sandbox:latest`
- `plusultra/react-native-sandbox:latest`
- `plusultra/expo-sandbox:latest`

### 4. Start Services

#### Option A: Using Docker Compose (Recommended for Development)

```bash
# From project root
docker-compose up -d

# Check logs
docker-compose logs -f backend

# Stop services
docker-compose down
```

This starts:
- PostgreSQL (port 5432)
- Redis (port 6379)
- Neo4j (ports 7474, 7687)
- PlusUltra Backend (port 3000)

#### Option B: Standalone (Manual Setup)

1. Start databases:
```bash
# PostgreSQL
docker run -d --name postgres \
  -e POSTGRES_DB=plusultra \
  -e POSTGRES_USER=plusultra \
  -e POSTGRES_PASSWORD=password \
  -p 5432:5432 \
  postgres:15-alpine

# Redis
docker run -d --name redis \
  -p 6379:6379 \
  redis:7-alpine

# Neo4j (optional, for TCI)
docker run -d --name neo4j \
  -e NEO4J_AUTH=neo4j/password \
  -p 7474:7474 \
  -p 7687:7687 \
  neo4j:5-community
```

2. Run database migrations:
```bash
npm run db:migrate
```

3. Start backend:
```bash
npm run dev
```

### 5. Verify Installation

Check health endpoint:

```bash
curl http://localhost:3000/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-01-20T10:00:00.000Z",
  "uptime": 123.456,
  "services": {
    "redis": true,
    "docker": true
  }
}
```

## Testing the Sandbox

### Create a Test Workspace

```bash
curl -X POST http://localhost:3000/api/v1/sandbox/workspace \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "test-project-123",
    "userId": "test-user-456",
    "name": "My Test App",
    "framework": "nextjs",
    "projectPath": "/path/to/generated/project"
  }'
```

Response:
```json
{
  "success": true,
  "workspace": {
    "id": "ws_test-user-456_test-project-123_1234567890",
    "userId": "test-user-456",
    "projectId": "test-project-123",
    "name": "My Test App",
    "framework": "nextjs",
    "status": "ready",
    "previewUrl": "http://localhost:3042",
    "createdAt": "2025-01-20T10:00:00.000Z"
  }
}
```

### View Live Preview

Open the preview URL in your browser:
```
http://localhost:3042
```

### WebSocket Connection

```javascript
const ws = new WebSocket('ws://localhost:3000/api/v1/sandbox/preview/ws_test-user-456_test-project-123_1234567890?userId=test-user-456');

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Received:', data);
};

ws.send(JSON.stringify({
  type: 'getLogs'
}));
```

### Update Files (Hot Reload)

```bash
curl -X POST http://localhost:3000/api/v1/sandbox/workspace/{workspaceId}/files \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "test-user-456",
    "files": {
      "pages/index.js": "export default function Home() { return <h1>Updated!</h1>; }"
    }
  }'
```

The preview will automatically reload with changes.

## Running Tests

```bash
# Unit tests
npm test

# Integration tests (requires Docker)
npm run test:integration

# With coverage
npm run test:coverage
```

## Production Deployment

### 1. Build Production Images

```bash
cd docker
./build-images.sh --tag v1.0.0 --push
```

### 2. Environment Configuration

Update production `.env`:

```bash
NODE_ENV=production
DOCKER_SOCKET_PATH=/var/run/docker.sock

# Use production database
DATABASE_URL=postgresql://user:pass@prod-db:5432/plusultra
REDIS_URL=redis://prod-redis:6379

# Increase limits for production
DEFAULT_MEMORY_LIMIT=2g
DEFAULT_CPU_LIMIT=2
WORKSPACE_TTL=7200

# Security
TCI_AUTO_FIX_ENABLED=true
ENABLE_AUDIT_LOGGING=true
```

### 3. Deploy with Docker Compose

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### 4. Kubernetes Deployment (Optional)

See [kubernetes/README.md](kubernetes/README.md) for Kubernetes deployment guide.

## Monitoring

### Check Active Workspaces

```bash
curl http://localhost:3000/api/v1/sandbox/workspaces?userId=test-user-456
```

### View Workspace Logs

```bash
curl http://localhost:3000/api/v1/sandbox/workspace/{workspaceId}/logs?tail=100
```

### Resource Usage

```bash
curl http://localhost:3000/api/v1/sandbox/workspace/{workspaceId}/stats
```

### Health Check

```bash
curl http://localhost:3000/api/v1/sandbox/workspace/{workspaceId}/health
```

## Troubleshooting

### Docker Connection Failed

**Error:** `Failed to connect to Docker`

**Solution:**
```bash
# Check Docker is running
docker ps

# Check socket permissions
ls -l /var/run/docker.sock

# Add user to docker group (Linux)
sudo usermod -aG docker $USER
newgrp docker
```

### Port Already in Use

**Error:** `Port 3042 already in use`

**Solution:**
```bash
# Find process using port
lsof -i :3042

# Kill process
kill -9 <PID>

# Or change port range in .env
PREVIEW_PORT_RANGE_START=4000
PREVIEW_PORT_RANGE_END=5000
```

### Container Won't Start

**Error:** `Container failed to become ready`

**Solution:**
```bash
# Check container logs
docker logs plusultra-ws_{workspaceId}

# Check image exists
docker images | grep plusultra

# Rebuild images
cd docker && ./build-images.sh
```

### Out of Memory

**Error:** `Container killed (OOM)`

**Solution:**
```bash
# Increase Docker memory limit
# Docker Desktop: Settings → Resources → Memory

# Or increase per-workspace limit in .env
DEFAULT_MEMORY_LIMIT=2g
```

### Redis Connection Failed

**Error:** `Redis connection refused`

**Solution:**
```bash
# Check Redis is running
docker ps | grep redis

# Start Redis
docker-compose up -d redis

# Test connection
redis-cli ping
```

## Performance Optimization

### Image Optimization

Pre-pull images on server startup:

```bash
docker pull plusultra/nextjs-sandbox:latest
docker pull plusultra/react-native-sandbox:latest
docker pull plusultra/expo-sandbox:latest
```

### Resource Limits

Adjust based on your server capacity:

```bash
# .env
DEFAULT_MEMORY_LIMIT=1g    # Lower for more concurrent workspaces
DEFAULT_CPU_LIMIT=0.5      # Allow 2 workspaces per CPU core
```

### Cleanup Schedule

Adjust cleanup intervals:

```bash
# .env
WORKSPACE_CLEANUP_INTERVAL=180000      # 3 minutes
WORKSPACE_MAX_INACTIVE_TIME=1800000    # 30 minutes
```

## Security Best Practices

1. **Never run Docker in privileged mode**
2. **Use non-root users in containers**
3. **Limit resource usage per workspace**
4. **Enable audit logging in production**
5. **Validate user input before file operations**
6. **Use secrets management for sensitive data**
7. **Enable HTTPS in production**
8. **Implement rate limiting per user**

## Scaling

### Horizontal Scaling

1. Run multiple backend instances
2. Use Redis for shared state
3. Load balance with Nginx/HAProxy
4. Each instance can handle 20-50 concurrent workspaces

### Kubernetes

For 1000+ concurrent users, deploy on Kubernetes:

```bash
kubectl apply -f kubernetes/
```

See [SANDBOX_ARCHITECTURE.md](SANDBOX_ARCHITECTURE.md) for scaling strategies.

## Support

- Documentation: [SANDBOX_ARCHITECTURE.md](SANDBOX_ARCHITECTURE.md)
- GitHub Integration: [GITHUB_INTEGRATION.md](plusultra/backend/GITHUB_INTEGRATION.md)
- Issues: https://github.com/your-org/plusultra/issues

## Next Steps

1. ✅ Set up local development environment
2. ✅ Build and test sandbox images
3. ✅ Create your first workspace
4. ✅ Test hot reload and live preview
5. ✅ Configure GitHub integration
6. 🚀 Deploy to production

---

**Ready to build the future of software development!** 🎉

# PlusUltra Sandbox Architecture

## 🎯 Vision: Zero-Config, Instant App Deployment

PlusUltra's Docker/Kubernetes sandbox system transforms AI-generated code into **live, running applications** in seconds. Users see their apps instantly, with zero setup required.

## 🏗 Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    PlusUltra Platform                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  User Prompt → PIC Generates Code → Docker Sandbox →        │
│                                      Live Running App        │
│                                                              │
├─────────────────────────────────────────────────────────────┤
│                     Core Components                          │
├───────────────┬──────────────────┬───────────────────────────┤
│ Docker        │ Workspace        │ Live Preview              │
│ Sandbox       │ Manager          │ Service                   │
│ Service       │                  │                           │
├───────────────┼──────────────────┼───────────────────────────┤
│               │                  │                           │
│ TCI Sandbox   │ API Routes       │ WebSocket                 │
│ Monitor       │                  │ Connections               │
│               │                  │                           │
└───────────────┴──────────────────┴───────────────────────────┘
```

## 🔥 The User Experience

### Workflow: From Prompt to Live App

```
1. User: "Build a meditation timer app"
   ↓
2. PIC generates complete React Native codebase
   ↓
3. Docker container spins up (5 seconds)
   ↓
4. App automatically runs on port 3XXX
   ↓
5. Live preview appears in PlusUltra UI
   ↓
6. User: "Make the background blue"
   ↓
7. Code updates, hot reload triggered
   ↓
8. User sees blue background instantly
   ↓
9. TCI monitors for errors, auto-fixes issues
   ↓
10. User: "Deploy to App Store"
    ↓
11. One-click submission via EAS Build
```

**Total time from prompt to live app: ~30 seconds**

## 📦 Core Components

### 1. DockerSandboxService
**Location:** [src/services/sandbox/DockerSandboxService.ts](plusultra/backend/src/services/sandbox/DockerSandboxService.ts)

**Purpose:** Low-level Docker container orchestration

**Features:**
- Creates isolated containers per workspace
- Manages container lifecycle (start, stop, restart, destroy)
- Port allocation (3000-4000 range)
- Resource limits (CPU, memory)
- File system mounting
- Container health monitoring
- Log streaming
- Command execution inside containers

**Container Configuration:**
```typescript
{
  Image: 'plusultra/nextjs-sandbox:latest',
  Memory: '1g',
  NanoCpus: 1e9, // 1 CPU
  PortBindings: { '3000/tcp': [{ HostPort: '3000' }] },
  Binds: ['/workspace:/app:rw'],
  WorkingDir: '/app',
  Cmd: ['npm', 'run', 'dev']
}
```

### 2. WorkspaceManager
**Location:** [src/services/sandbox/WorkspaceManager.ts](plusultra/backend/src/services/sandbox/WorkspaceManager.ts)

**Purpose:** High-level workspace management

**Features:**
- One workspace per user session
- Workspace lifecycle management
- Redis-backed persistence
- File hot-reloading
- Activity tracking
- Automatic cleanup of inactive workspaces (1 hour TTL)
- User access control

**Workspace Model:**
```typescript
{
  id: 'ws_user123_project456_1234567890',
  userId: 'user123',
  projectId: 'project456',
  name: 'Meditation Timer',
  framework: 'react-native',
  status: 'ready',
  previewUrl: 'http://localhost:3042',
  createdAt: Date,
  lastActivityAt: Date
}
```

### 3. LivePreviewService
**Location:** [src/services/sandbox/LivePreviewService.ts](plusultra/backend/src/services/sandbox/LivePreviewService.ts)

**Purpose:** Real-time preview and WebSocket communication

**Features:**
- WebSocket connections for live updates
- Reverse proxy to container preview
- Log streaming to frontend
- Hot reload triggers
- Resource stats broadcasting
- Multi-client support (multiple users viewing same workspace)
- Buffered logs for late connections

**WebSocket Events:**
```typescript
// Server → Client
{ type: 'log', data: { message: 'App started', level: 'info' } }
{ type: 'error', data: { message: 'Build failed', level: 'error' } }
{ type: 'reload', data: { reason: 'files_updated' } }
{ type: 'status', data: { status: 'running' } }
{ type: 'stats', data: { cpu: 45, memory: 512, network: {...} } }

// Client → Server
{ type: 'execute', command: ['npm', 'install', 'axios'] }
{ type: 'restart' }
{ type: 'getLogs' }
```

### 4. TCISandboxMonitor
**Location:** [src/services/sandbox/TCISandboxMonitor.ts](plusultra/backend/src/services/sandbox/TCISandboxMonitor.ts)

**Purpose:** Temporal Code Intelligence integration for self-healing

**Features:**
- Real-time error detection from logs
- Performance monitoring
- Security issue detection
- Auto-fix suggestions
- Automatic fix application
- Fix verification
- Rollback on failure

**TCI Issue Detection:**
```typescript
{
  id: 'issue_123',
  type: 'error',
  severity: 'critical',
  title: 'Cannot find module "axios"',
  autoFixable: true,
  suggestedFix: 'Install missing dependency',
  file: 'src/api.ts',
  line: 12
}
```

**Auto-Fix Flow:**
```
1. Detect error in logs
2. Classify error type
3. Generate fix
4. Apply fix to workspace files
5. Trigger hot reload
6. Wait 5 seconds
7. Verify issue resolved
8. If not resolved → rollback
```

## 🔌 API Endpoints

All endpoints defined in [src/routes/sandbox.ts](plusultra/backend/src/routes/sandbox.ts)

### Workspace Management

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/sandbox/workspace` | POST | Create new workspace |
| `/api/v1/sandbox/workspace/:id` | GET | Get workspace details |
| `/api/v1/sandbox/workspaces?userId=X` | GET | List user workspaces |
| `/api/v1/sandbox/workspace/:id/files` | POST | Update files (hot reload) |
| `/api/v1/sandbox/workspace/:id/restart` | POST | Restart workspace |
| `/api/v1/sandbox/workspace/:id/stop` | POST | Stop workspace |
| `/api/v1/sandbox/workspace/:id` | DELETE | Delete workspace |
| `/api/v1/sandbox/workspace/:id/logs` | GET | Get container logs |
| `/api/v1/sandbox/workspace/:id/stats` | GET | Get resource stats |
| `/api/v1/sandbox/workspace/:id/execute` | POST | Execute command |

### TCI Monitoring

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/sandbox/workspace/:id/health` | GET | Get health status |
| `/api/v1/sandbox/workspace/:id/issues` | GET | Get detected issues |
| `/api/v1/sandbox/workspace/:id/fixes` | GET | Get applied fixes |

### Live Preview

| Endpoint | Protocol | Description |
|----------|----------|-------------|
| `/api/v1/sandbox/preview/:id` | WebSocket | Live preview connection |
| `/api/v1/sandbox/proxy/:id/*` | HTTP | Proxy to container |

## 🐳 Docker Images

### Base Images

Each framework has a custom Docker image with hot-reload support:

**Next.js Sandbox** (`plusultra/nextjs-sandbox:latest`)
```dockerfile
FROM node:20-alpine
WORKDIR /app
RUN npm install -g next@latest
EXPOSE 3000
CMD ["npm", "run", "dev"]
```

**React Native/Expo Sandbox** (`plusultra/react-native-sandbox:latest`)
```dockerfile
FROM node:20
WORKDIR /app
RUN npm install -g expo-cli react-native-cli
EXPOSE 8081 19000 19001 19002
CMD ["npm", "start"]
```

### Image Building

Images should be pre-built and cached to minimize startup time.

## 📊 Resource Management

### Per-Workspace Limits

```typescript
{
  memory: '1g',    // 1GB RAM
  cpu: '1',        // 1 CPU core
  disk: '5g',      // 5GB disk space
  ports: 1,        // One exposed port
  ttl: 3600        // 1 hour idle timeout
}
```

### Scaling Strategy

**Phase 1: Single Server (MVP)**
- Docker Compose on one powerful server
- Support 20-50 concurrent workspaces
- Cost: ~$50-100/month (DigitalOcean/Hetzner)

**Phase 2: Multi-Server (Growth)**
- Multiple servers with load balancing
- Redis for distributed state
- Support 200-500 concurrent workspaces
- Cost: ~$300-500/month

**Phase 3: Kubernetes (Scale)**
- Auto-scaling based on demand
- Multi-region deployment
- Support 1000+ concurrent workspaces
- Cost: Variable based on usage

## 🔄 Hot Reload Workflow

```
User edits code in PlusUltra UI
↓
Frontend sends file updates via API
↓
WorkspaceManager.updateWorkspaceFiles()
↓
Files written to mounted volume
↓
Container's file watcher detects changes
↓
Framework triggers hot reload (Next.js/Expo)
↓
LivePreviewService broadcasts reload event
↓
Frontend refreshes preview iframe
↓
User sees changes instantly
```

## 🛡 Security Considerations

### Container Isolation

1. **Network Isolation**
   - Containers cannot access each other
   - Outbound internet allowed (for npm installs)
   - No privileged mode

2. **File System**
   - Read-only root filesystem
   - Workspace directory is read-write
   - No access to host filesystem

3. **Resource Limits**
   - CPU and memory caps prevent DoS
   - Automatic cleanup of inactive containers

4. **User Permissions**
   - Non-root user inside container
   - No sudo access
   - Limited syscalls

### Access Control

```typescript
// Verify user owns workspace before any operation
const workspace = await workspaceManager.getWorkspace(workspaceId);
if (workspace.userId !== userId) {
  throw new Error('Access denied');
}
```

## 🧪 Testing Strategy

### Unit Tests

```typescript
// Test workspace creation
const workspace = await workspaceManager.createWorkspace(
  'user123',
  'project456',
  'Test App',
  'nextjs',
  '/path/to/code'
);
expect(workspace.status).toBe('ready');
expect(workspace.previewUrl).toMatch(/http:\/\/localhost:\d+/);
```

### Integration Tests

```typescript
// Test full workflow
1. Create workspace
2. Wait for container ready
3. Send file update
4. Verify hot reload
5. Check logs for errors
6. Destroy workspace
```

### Load Tests

- Simulate 50 concurrent workspaces
- Monitor resource usage
- Test auto-scaling
- Verify cleanup works

## 📈 Monitoring & Observability

### Metrics to Track

```typescript
// System Metrics
- activeWorkspaces: number
- totalContainers: number
- avgCpuUsage: percentage
- avgMemoryUsage: MB
- diskUsage: GB

// Workspace Metrics (per workspace)
- uptime: milliseconds
- errorCount: number
- restartCount: number
- lastActivity: timestamp

// TCI Metrics
- issuesDetected: number
- fixesApplied: number
- fixSuccessRate: percentage
```

### Logging

```typescript
// Structured logs
{
  level: 'info',
  service: 'WorkspaceManager',
  action: 'create_workspace',
  workspaceId: 'ws_123',
  userId: 'user_456',
  duration: 5432,  // ms
  timestamp: '2025-01-20T10:30:00Z'
}
```

## 🚀 Deployment

### Environment Variables

```bash
# Docker
DOCKER_SOCKET_PATH=/var/run/docker.sock
WORKSPACE_BASE_PATH=/tmp/plusultra-workspaces

# Ports
PREVIEW_PORT_RANGE_START=3000
PREVIEW_PORT_RANGE_END=4000

# Resource Limits
DEFAULT_MEMORY_LIMIT=1g
DEFAULT_CPU_LIMIT=1
WORKSPACE_TTL=3600

# Redis
REDIS_URL=redis://localhost:6379

# TCI
TCI_AUTO_FIX_ENABLED=true
TCI_MONITOR_INTERVAL=10000
```

### Startup Sequence

```typescript
1. Initialize Docker connection
2. Pull required images
3. Create WorkspaceManager
4. Create LivePreviewService
5. Create TCISandboxMonitor
6. Register API routes
7. Start cleanup jobs
8. Ready to accept requests
```

## 💡 Future Enhancements

### Near-Term (0-3 months)

- [ ] GPU access for ML apps
- [ ] Multi-container workspaces (app + database)
- [ ] Snapshot/restore functionality
- [ ] Collaborative editing (multiple users per workspace)
- [ ] Custom environment variables

### Mid-Term (3-6 months)

- [ ] Kubernetes deployment
- [ ] Auto-scaling based on demand
- [ ] Multi-region support
- [ ] CDN for preview assets
- [ ] Advanced TCI with AI-powered fixes

### Long-Term (6-12 months)

- [ ] Mobile device preview (iOS/Android simulators)
- [ ] Production deployment from sandbox
- [ ] Blue-green deployments
- [ ] A/B testing infrastructure
- [ ] Global edge network

## 📚 Code Examples

### Creating a Workspace

```typescript
const workspace = await workspaceManager.createWorkspace(
  userId,
  projectId,
  'My Awesome App',
  'nextjs',
  '/generated/code/path',
  { theme: 'dark', ai_model: 'gpt-4' }
);

console.log(`Preview URL: ${workspace.previewUrl}`);
```

### WebSocket Connection (Frontend)

```typescript
const ws = new WebSocket(
  `ws://localhost:3000/api/v1/sandbox/preview/${workspaceId}?userId=${userId}`
);

ws.onmessage = (event) => {
  const data = JSON.parse(event.data);

  switch (data.type) {
    case 'log':
      console.log(data.data.message);
      break;
    case 'error':
      console.error(data.data.message);
      break;
    case 'reload':
      window.location.reload();
      break;
    case 'stats':
      updateResourceChart(data.data);
      break;
  }
};

// Execute command
ws.send(JSON.stringify({
  type: 'execute',
  command: ['npm', 'install', 'axios']
}));
```

### Hot Reload

```typescript
// Update files
await fetch(`/api/v1/sandbox/workspace/${workspaceId}/files`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId,
    files: {
      'src/App.tsx': updatedCode,
      'src/styles.css': updatedStyles
    }
  })
});

// Files are updated, hot reload triggered automatically
```

## 🎓 Learning Resources

- [Docker Documentation](https://docs.docker.com/)
- [Kubernetes Basics](https://kubernetes.io/docs/tutorials/kubernetes-basics/)
- [Next.js Fast Refresh](https://nextjs.org/docs/architecture/fast-refresh)
- [Expo Development Builds](https://docs.expo.dev/develop/development-builds/introduction/)

## 🤝 Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines on:
- Adding new framework support
- Optimizing container startup time
- Implementing new TCI auto-fixes
- Improving resource efficiency

---

## 💎 The Bottom Line

PlusUltra's sandbox architecture is **the secret sauce** that makes the platform magical:

- **PIC** (AI Orchestration) = The brain that generates code
- **Sandbox** (Docker/K8s) = The body that executes code
- **TCI** (Temporal Code Intelligence) = The nervous system that learns and heals

Together, they create an **end-to-end software development lifecycle** that requires **zero technical knowledge** from users.

**Type a prompt → See a running app → Deploy to production**

*All in under 60 seconds.*

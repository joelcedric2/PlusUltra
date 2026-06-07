import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import Redis from 'ioredis';
import { DockerSandboxService } from '../src/services/sandbox/DockerSandboxService';
import { WorkspaceManager } from '../src/services/sandbox/WorkspaceManager';
import { LivePreviewService } from '../src/services/sandbox/LivePreviewService';
import { TCISandboxMonitor } from '../src/services/sandbox/TCISandboxMonitor';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Sandbox Integration Tests', () => {
  let redis: Redis;
  let dockerSandbox: DockerSandboxService;
  let workspaceManager: WorkspaceManager;
  let livePreview: LivePreviewService;
  let tciMonitor: TCISandboxMonitor;
  let testWorkspaceId: string;
  let testProjectPath: string;

  beforeAll(async () => {
    // Initialize Redis
    redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

    // Initialize services
    dockerSandbox = new DockerSandboxService({
      socketPath: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock'
    });

    workspaceManager = new WorkspaceManager(dockerSandbox, redis);
    livePreview = new LivePreviewService(workspaceManager);
    tciMonitor = new TCISandboxMonitor(workspaceManager, livePreview);

    // Create test project
    testProjectPath = path.join('/tmp', `test-project-${Date.now()}`);
    await createTestProject(testProjectPath);
  });

  afterAll(async () => {
    // Cleanup
    if (testWorkspaceId) {
      try {
        await workspaceManager.destroyWorkspace(testWorkspaceId);
      } catch (error) {
        console.error('Error cleaning up workspace:', error);
      }
    }

    await workspaceManager.shutdown();
    await livePreview.shutdown();
    await tciMonitor.shutdown();
    await redis.quit();

    // Remove test project
    try {
      await fs.rm(testProjectPath, { recursive: true, force: true });
    } catch (error) {
      console.error('Error removing test project:', error);
    }
  });

  describe('Workspace Lifecycle', () => {
    it('should create a workspace successfully', async () => {
      const workspace = await workspaceManager.createWorkspace(
        'test-user-123',
        'test-project-456',
        'Test App',
        'nextjs',
        testProjectPath
      );

      testWorkspaceId = workspace.id;

      expect(workspace).toBeDefined();
      expect(workspace.id).toBeTruthy();
      expect(workspace.userId).toBe('test-user-123');
      expect(workspace.projectId).toBe('test-project-456');
      expect(workspace.framework).toBe('nextjs');
      expect(workspace.status).toBe('ready');
      expect(workspace.previewUrl).toMatch(/http:\/\/localhost:\d+/);
    }, 120000); // 2 minute timeout for container startup

    it('should retrieve workspace by ID', async () => {
      const workspace = await workspaceManager.getWorkspace(testWorkspaceId);

      expect(workspace).toBeDefined();
      expect(workspace?.id).toBe(testWorkspaceId);
    });

    it('should list user workspaces', async () => {
      const workspaces = await workspaceManager.getUserWorkspaces('test-user-123');

      expect(workspaces).toBeDefined();
      expect(workspaces.length).toBeGreaterThan(0);
      expect(workspaces.some(w => w.id === testWorkspaceId)).toBe(true);
    });

    it('should update workspace files', async () => {
      const files = new Map([
        ['src/test.js', 'console.log("Hello from test");']
      ]);

      await workspaceManager.updateWorkspaceFiles(testWorkspaceId, files);

      // Verify file was updated
      const logs = await workspaceManager.getWorkspaceLogs(testWorkspaceId, 10);
      expect(logs).toBeDefined();
    });

    it('should restart workspace', async () => {
      const workspace = await workspaceManager.restartWorkspace(testWorkspaceId);

      expect(workspace).toBeDefined();
      expect(workspace.status).toBe('ready');
    }, 60000);

    it('should get workspace logs', async () => {
      const logs = await workspaceManager.getWorkspaceLogs(testWorkspaceId, 50);

      expect(logs).toBeDefined();
      expect(Array.isArray(logs)).toBe(true);
    });

    it('should get workspace stats', async () => {
      const stats = await workspaceManager.getWorkspaceStats(testWorkspaceId);

      expect(stats).toBeDefined();
      expect(stats.cpu).toBeGreaterThanOrEqual(0);
      expect(stats.memory).toBeGreaterThan(0);
      expect(stats.network).toBeDefined();
    });

    it('should execute command in workspace', async () => {
      const output = await workspaceManager.executeCommand(testWorkspaceId, ['echo', 'test']);

      expect(output).toBeDefined();
      expect(output).toContain('test');
    });
  });

  describe('TCI Monitoring', () => {
    it('should start monitoring workspace', async () => {
      await tciMonitor.startMonitoring(testWorkspaceId);

      // Wait a bit for monitoring to run
      await new Promise(resolve => setTimeout(resolve, 15000));

      const issues = tciMonitor.getWorkspaceIssues(testWorkspaceId);
      expect(issues).toBeDefined();
      expect(Array.isArray(issues)).toBe(true);
    }, 30000);

    it('should perform health check', async () => {
      const health = await tciMonitor.performHealthCheck(testWorkspaceId);

      expect(health).toBeDefined();
      expect(health.workspaceId).toBe(testWorkspaceId);
      expect(health.status).toBeDefined();
      expect(health.metrics).toBeDefined();
      expect(health.metrics.performanceScore).toBeGreaterThanOrEqual(0);
      expect(health.metrics.performanceScore).toBeLessThanOrEqual(100);
    });

    it('should stop monitoring workspace', () => {
      tciMonitor.stopMonitoring(testWorkspaceId);
      // No error means success
      expect(true).toBe(true);
    });
  });

  describe('Docker Sandbox', () => {
    it('should list active sandboxes', async () => {
      const sandboxes = await dockerSandbox.listSandboxes();

      expect(sandboxes).toBeDefined();
      expect(Array.isArray(sandboxes)).toBe(true);
    });

    it('should get sandbox status', async () => {
      const status = await dockerSandbox.getStatus(testWorkspaceId);

      expect(status).toBeDefined();
      expect(status.workspaceId).toBe(testWorkspaceId);
      expect(status.status).toBeDefined();
    });
  });

  describe('Cleanup', () => {
    it('should stop workspace', async () => {
      await workspaceManager.stopWorkspace(testWorkspaceId);

      const workspace = await workspaceManager.getWorkspace(testWorkspaceId);
      expect(workspace?.status).toBe('stopped');
    });

    it('should destroy workspace', async () => {
      await workspaceManager.destroyWorkspace(testWorkspaceId);

      const workspace = await workspaceManager.getWorkspace(testWorkspaceId);
      expect(workspace).toBeNull();
    });
  });
});

/**
 * Helper function to create a test Next.js project
 */
async function createTestProject(projectPath: string): Promise<void> {
  await fs.mkdir(projectPath, { recursive: true });

  // Create package.json
  const packageJson = {
    name: 'test-nextjs-app',
    version: '1.0.0',
    scripts: {
      dev: 'next dev',
      build: 'next build',
      start: 'next start'
    },
    dependencies: {
      next: 'latest',
      react: 'latest',
      'react-dom': 'latest'
    }
  };

  await fs.writeFile(
    path.join(projectPath, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  );

  // Create pages directory
  await fs.mkdir(path.join(projectPath, 'pages'), { recursive: true });

  // Create index page
  const indexPage = `
export default function Home() {
  return (
    <div>
      <h1>Test Next.js App</h1>
      <p>This is a test application for sandbox testing.</p>
    </div>
  );
}
  `;

  await fs.writeFile(
    path.join(projectPath, 'pages', 'index.js'),
    indexPage
  );

  // Create API health check
  await fs.mkdir(path.join(projectPath, 'pages', 'api'), { recursive: true });

  const apiHealth = `
export default function handler(req, res) {
  res.status(200).json({ status: 'ok' });
}
  `;

  await fs.writeFile(
    path.join(projectPath, 'pages', 'api', 'health.js'),
    apiHealth
  );
}

import { DockerSandboxService, SandboxConfig, SandboxStatus } from './DockerSandboxService';
import { EventEmitter } from 'events';
import Redis from 'ioredis';

export interface Workspace {
  id: string;
  userId: string;
  projectId: string;
  name: string;
  framework: 'nextjs' | 'react-native' | 'expo';
  status: 'initializing' | 'ready' | 'error' | 'stopped';
  sandboxStatus?: SandboxStatus;
  createdAt: Date;
  lastActivityAt: Date;
  previewUrl?: string;
  metadata?: Record<string, any>;
}

export interface WorkspaceActivity {
  workspaceId: string;
  action: 'created' | 'started' | 'stopped' | 'updated' | 'destroyed' | 'error';
  timestamp: Date;
  metadata?: Record<string, any>;
}

/**
 * WorkspaceManager
 * Manages user workspaces and their associated Docker sandboxes
 * One workspace per user session - contains the running app and all project files
 */
export class WorkspaceManager extends EventEmitter {
  private sandboxService: DockerSandboxService;
  private redis: Redis;
  private workspaces: Map<string, Workspace> = new Map();
  private readonly WORKSPACE_TTL = 3600; // 1 hour in seconds
  private readonly CLEANUP_INTERVAL = 300000; // 5 minutes in ms

  constructor(sandboxService: DockerSandboxService, redis: Redis) {
    super();
    this.sandboxService = sandboxService;
    this.redis = redis;

    // Set up event listeners
    this.setupEventListeners();

    // Start periodic cleanup
    this.startCleanupJob();
  }

  /**
   * Create a new workspace for a user
   */
  async createWorkspace(
    userId: string,
    projectId: string,
    name: string,
    framework: 'nextjs' | 'react-native' | 'expo',
    projectPath: string,
    metadata?: Record<string, any>
  ): Promise<Workspace> {
    try {
      const workspaceId = `ws_${userId}_${projectId}_${Date.now()}`;

      const workspace: Workspace = {
        id: workspaceId,
        userId,
        projectId,
        name,
        framework,
        status: 'initializing',
        createdAt: new Date(),
        lastActivityAt: new Date(),
        metadata
      };

      // Store workspace in memory and Redis
      this.workspaces.set(workspaceId, workspace);
      await this.saveWorkspaceToRedis(workspace);

      // Create Docker sandbox
      const sandboxConfig: SandboxConfig = {
        userId,
        projectId,
        workspaceId,
        framework,
        memory: '1g',
        cpu: '1'
      };

      const sandboxStatus = await this.sandboxService.createSandbox(sandboxConfig, projectPath);

      // Update workspace with sandbox info
      workspace.sandboxStatus = sandboxStatus;
      workspace.status = sandboxStatus.status === 'running' ? 'ready' : 'error';
      workspace.previewUrl = sandboxStatus.previewUrl;

      await this.saveWorkspaceToRedis(workspace);
      this.emit('workspace:created', workspace);

      return workspace;
    } catch (error) {
      console.error('Error creating workspace:', error);
      throw error;
    }
  }

  /**
   * Get workspace by ID
   */
  async getWorkspace(workspaceId: string): Promise<Workspace | undefined> {
    // Check memory cache first
    let workspace = this.workspaces.get(workspaceId);
    if (workspace) {
      await this.updateActivity(workspaceId);
      return workspace;
    }

    // Check Redis
    workspace = await this.loadWorkspaceFromRedis(workspaceId);
    if (workspace) {
      this.workspaces.set(workspaceId, workspace);
      await this.updateActivity(workspaceId);
      return workspace;
    }

    return undefined;
  }

  /**
   * Get all workspaces for a user
   */
  async getUserWorkspaces(userId: string): Promise<Workspace[]> {
    const pattern = `workspace:ws_${userId}_*`;
    const keys = await this.redis.keys(pattern);

    const workspaces: Workspace[] = [];
    for (const key of keys) {
      const workspaceId = key.replace('workspace:', '');
      const workspace = await this.getWorkspace(workspaceId);
      if (workspace) {
        workspaces.push(workspace);
      }
    }

    return workspaces;
  }

  /**
   * Get workspace for a specific project
   */
  async getProjectWorkspace(userId: string, projectId: string): Promise<Workspace | null> {
    const workspaces = await this.getUserWorkspaces(userId);
    return workspaces.find(ws => ws.projectId === projectId) || null;
  }

  /**
   * Update workspace files (triggers hot reload)
   */
  async updateWorkspaceFiles(
    workspaceId: string,
    files: Map<string, string>
  ): Promise<void> {
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    await this.sandboxService.updateFiles(workspaceId, files);
    await this.updateActivity(workspaceId);

    this.emit('workspace:updated', {
      workspaceId,
      files: Array.from(files.keys())
    });
  }

  /**
   * Restart workspace sandbox
   */
  async restartWorkspace(workspaceId: string): Promise<Workspace> {
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    workspace.status = 'initializing';
    await this.saveWorkspaceToRedis(workspace);

    const sandboxStatus = await this.sandboxService.restartSandbox(workspaceId);

    workspace.sandboxStatus = sandboxStatus;
    workspace.status = sandboxStatus.status === 'running' ? 'ready' : 'error';
    workspace.previewUrl = sandboxStatus.previewUrl;
    workspace.lastActivityAt = new Date();

    await this.saveWorkspaceToRedis(workspace);
    this.emit('workspace:restarted', workspace);

    return workspace;
  }

  /**
   * Stop workspace (keeps data, stops container)
   */
  async stopWorkspace(workspaceId: string): Promise<void> {
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    // Stop container but don't destroy
    const container = (this.sandboxService as any).containers.get(workspaceId);
    if (container) {
      await container.stop({ t: 10 });
    }

    workspace.status = 'stopped';
    workspace.lastActivityAt = new Date();

    await this.saveWorkspaceToRedis(workspace);
    this.emit('workspace:stopped', workspace);
  }

  /**
   * Destroy workspace (removes container and data)
   */
  async destroyWorkspace(workspaceId: string): Promise<void> {
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      return; // Already destroyed
    }

    try {
      await this.sandboxService.destroySandbox(workspaceId);
    } catch (error) {
      console.error('Error destroying sandbox:', error);
    }

    // Remove from memory and Redis
    this.workspaces.delete(workspaceId);
    await this.redis.del(`workspace:${workspaceId}`);

    this.emit('workspace:destroyed', { workspaceId });
  }

  /**
   * Get workspace logs
   */
  async getWorkspaceLogs(workspaceId: string, tail: number = 100): Promise<string[]> {
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    return this.sandboxService.getLogs(workspaceId, tail);
  }

  /**
   * Get workspace resource usage
   */
  async getWorkspaceStats(workspaceId: string) {
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    return this.sandboxService.getStats(workspaceId);
  }

  /**
   * Execute command in workspace
   */
  async executeCommand(workspaceId: string, command: string[]): Promise<string> {
    const workspace = await this.getWorkspace(workspaceId);
    if (!workspace) {
      throw new Error('Workspace not found');
    }

    await this.updateActivity(workspaceId);
    return this.sandboxService.exec(workspaceId, command);
  }

  /**
   * Get workspace activity log
   */
  async getWorkspaceActivity(workspaceId: string, limit: number = 50): Promise<WorkspaceActivity[]> {
    const activities = await this.redis.lrange(`workspace:${workspaceId}:activity`, 0, limit - 1);
    return activities.map(json => JSON.parse(json));
  }

  /**
   * Record workspace activity
   */
  private async recordActivity(
    workspaceId: string,
    action: WorkspaceActivity['action'],
    metadata?: Record<string, any>
  ): Promise<void> {
    const activity: WorkspaceActivity = {
      workspaceId,
      action,
      timestamp: new Date(),
      metadata
    };

    await this.redis.lpush(
      `workspace:${workspaceId}:activity`,
      JSON.stringify(activity)
    );

    // Keep only last 100 activities
    await this.redis.ltrim(`workspace:${workspaceId}:activity`, 0, 99);
  }

  /**
   * Update workspace last activity timestamp
   */
  private async updateActivity(workspaceId: string): Promise<void> {
    const workspace = this.workspaces.get(workspaceId);
    if (workspace) {
      workspace.lastActivityAt = new Date();
      await this.saveWorkspaceToRedis(workspace);
    }
  }

  /**
   * Save workspace to Redis
   */
  private async saveWorkspaceToRedis(workspace: Workspace): Promise<void> {
    await this.redis.setex(
      `workspace:${workspace.id}`,
      this.WORKSPACE_TTL,
      JSON.stringify(workspace)
    );
  }

  /**
   * Load workspace from Redis
   */
  private async loadWorkspaceFromRedis(workspaceId: string): Promise<Workspace | undefined> {
    const data = await this.redis.get(`workspace:${workspaceId}`);
    if (!data) return undefined;

    const workspace = JSON.parse(data);
    workspace.createdAt = new Date(workspace.createdAt);
    workspace.lastActivityAt = new Date(workspace.lastActivityAt);

    return workspace;
  }

  /**
   * Set up event listeners for sandbox events
   */
  private setupEventListeners(): void {
    this.sandboxService.on('sandbox:created', (status) => {
      this.recordActivity(status.workspaceId, 'started', { status });
    });

    this.sandboxService.on('sandbox:destroyed', ({ workspaceId }) => {
      this.recordActivity(workspaceId, 'destroyed');
    });

    this.sandboxService.on('sandbox:restarted', (status) => {
      this.recordActivity(status.workspaceId, 'started', { status });
    });

    this.sandboxService.on('sandbox:files-updated', ({ workspaceId, files }) => {
      this.recordActivity(workspaceId, 'updated', { files });
    });
  }

  /**
   * Start periodic cleanup job
   */
  private startCleanupJob(): void {
    setInterval(async () => {
      try {
        await this.cleanupInactiveWorkspaces();
      } catch (error) {
        console.error('Error in cleanup job:', error);
      }
    }, this.CLEANUP_INTERVAL);
  }

  /**
   * Clean up inactive workspaces
   */
  private async cleanupInactiveWorkspaces(): Promise<number> {
    const now = Date.now();
    const maxInactiveTime = 3600000; // 1 hour
    let cleaned = 0;

    for (const [workspaceId, workspace] of this.workspaces) {
      const inactiveTime = now - workspace.lastActivityAt.getTime();

      if (inactiveTime > maxInactiveTime) {
        console.log(`Cleaning up inactive workspace: ${workspaceId}`);
        await this.destroyWorkspace(workspaceId);
        cleaned++;
      }
    }

    // Also cleanup orphaned sandboxes
    const orphanedCleaned = await this.sandboxService.cleanupInactiveSandboxes(maxInactiveTime);

    return cleaned + orphanedCleaned;
  }

  /**
   * Shutdown - cleanup all workspaces
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down WorkspaceManager...');

    const workspaceIds = Array.from(this.workspaces.keys());
    await Promise.all(
      workspaceIds.map(id => this.destroyWorkspace(id).catch(err => console.error(err)))
    );

    await this.redis.quit();
  }
}

export default WorkspaceManager;

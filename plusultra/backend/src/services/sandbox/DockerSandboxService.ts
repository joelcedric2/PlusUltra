import Docker from 'dockerode';
import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface SandboxConfig {
  userId: string;
  projectId: string;
  workspaceId: string;
  framework: 'nextjs' | 'react-native' | 'expo';
  port?: number;
  memory?: string; // e.g., '512m'
  cpu?: string; // e.g., '0.5'
}

export interface SandboxStatus {
  workspaceId: string;
  containerId?: string;
  status: 'creating' | 'running' | 'stopped' | 'error' | 'restarting';
  previewUrl?: string;
  startedAt?: Date;
  error?: string;
  logs?: string[];
}

export interface ContainerStats {
  cpu: number; // percentage
  memory: number; // MB
  network: {
    rx: number; // bytes received
    tx: number; // bytes transmitted
  };
}

/**
 * DockerSandboxService
 * Manages isolated Docker containers for each user workspace
 * Each container runs the user's generated app with live preview capabilities
 */
export class DockerSandboxService extends EventEmitter {
  private docker: Docker;
  private containers: Map<string, Docker.Container> = new Map();
  private readonly WORKSPACE_BASE_PATH = '/tmp/plusultra-workspaces';
  private readonly PREVIEW_PORT_RANGE_START = 3000;
  private readonly PREVIEW_PORT_RANGE_END = 4000;
  private portAllocations: Map<string, number> = new Map();

  constructor(dockerOptions?: Docker.DockerOptions) {
    super();
    this.docker = new Docker(dockerOptions || { socketPath: '/var/run/docker.sock' });
  }

  /**
   * Create and start a new sandbox container for a user workspace
   */
  async createSandbox(config: SandboxConfig, projectPath: string): Promise<SandboxStatus> {
    try {
      const { workspaceId, framework, userId, projectId } = config;

      // Check if container already exists
      if (this.containers.has(workspaceId)) {
        return this.getStatus(workspaceId);
      }

      // Allocate a port for preview
      const port = this.allocatePort(workspaceId);

      // Create workspace directory
      const workspacePath = path.join(this.WORKSPACE_BASE_PATH, workspaceId);
      await fs.mkdir(workspacePath, { recursive: true });

      // Copy project files to workspace
      await this.copyProjectFiles(projectPath, workspacePath);

      // Build appropriate Docker image based on framework
      const imageName = await this.getOrBuildImage(framework);

      // Create container
      const container = await this.docker.createContainer({
        Image: imageName,
        name: `plusultra-${workspaceId}`,
        Env: [
          `USER_ID=${userId}`,
          `PROJECT_ID=${projectId}`,
          `WORKSPACE_ID=${workspaceId}`,
          `PORT=${port}`,
          'NODE_ENV=development'
        ],
        HostConfig: {
          Memory: this.parseMemory(config.memory || '1g'),
          NanoCpus: this.parseCpu(config.cpu || '1'),
          PortBindings: {
            [`${port}/tcp`]: [{ HostPort: String(port) }]
          },
          Binds: [
            `${workspacePath}:/app:rw`
          ],
          AutoRemove: false,
          NetworkMode: 'bridge'
        },
        ExposedPorts: {
          [`${port}/tcp`]: {}
        },
        WorkingDir: '/app',
        Cmd: this.getStartCommand(framework),
        Labels: {
          'plusultra.workspace': workspaceId,
          'plusultra.user': userId,
          'plusultra.project': projectId,
          'plusultra.framework': framework
        }
      });

      // Store container reference
      this.containers.set(workspaceId, container);

      // Start container
      await container.start();

      // Wait for the app to be ready
      await this.waitForReady(container, port, 60000); // 60 second timeout

      const status: SandboxStatus = {
        workspaceId,
        containerId: container.id,
        status: 'running',
        previewUrl: `http://localhost:${port}`,
        startedAt: new Date()
      };

      this.emit('sandbox:created', status);
      return status;

    } catch (error) {
      console.error('Error creating sandbox:', error);
      return {
        workspaceId: config.workspaceId,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Stop and remove a sandbox container
   */
  async destroySandbox(workspaceId: string): Promise<void> {
    const container = this.containers.get(workspaceId);
    if (!container) {
      throw new Error(`Sandbox ${workspaceId} not found`);
    }

    try {
      await container.stop({ t: 10 }); // 10 second grace period
      await container.remove();
      this.containers.delete(workspaceId);
      this.releasePort(workspaceId);

      // Clean up workspace directory
      const workspacePath = path.join(this.WORKSPACE_BASE_PATH, workspaceId);
      await fs.rm(workspacePath, { recursive: true, force: true });

      this.emit('sandbox:destroyed', { workspaceId });
    } catch (error) {
      console.error('Error destroying sandbox:', error);
      throw error;
    }
  }

  /**
   * Restart a sandbox container
   */
  async restartSandbox(workspaceId: string): Promise<SandboxStatus> {
    const container = this.containers.get(workspaceId);
    if (!container) {
      throw new Error(`Sandbox ${workspaceId} not found`);
    }

    try {
      await container.restart({ t: 10 });

      const port = this.portAllocations.get(workspaceId);
      await this.waitForReady(container, port!, 60000);

      const status: SandboxStatus = {
        workspaceId,
        containerId: container.id,
        status: 'running',
        previewUrl: `http://localhost:${port}`,
        startedAt: new Date()
      };

      this.emit('sandbox:restarted', status);
      return status;
    } catch (error) {
      console.error('Error restarting sandbox:', error);
      return {
        workspaceId,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get current status of a sandbox
   */
  async getStatus(workspaceId: string): Promise<SandboxStatus> {
    const container = this.containers.get(workspaceId);
    if (!container) {
      return {
        workspaceId,
        status: 'stopped'
      };
    }

    try {
      const info = await container.inspect();
      const port = this.portAllocations.get(workspaceId);

      return {
        workspaceId,
        containerId: container.id,
        status: info.State.Running ? 'running' : 'stopped',
        previewUrl: info.State.Running ? `http://localhost:${port}` : undefined,
        startedAt: info.State.StartedAt ? new Date(info.State.StartedAt) : undefined
      };
    } catch (error) {
      return {
        workspaceId,
        status: 'error',
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Get container logs
   */
  async getLogs(workspaceId: string, tail: number = 100): Promise<string[]> {
    const container = this.containers.get(workspaceId);
    if (!container) {
      throw new Error(`Sandbox ${workspaceId} not found`);
    }

    try {
      const logs = await container.logs({
        stdout: true,
        stderr: true,
        tail,
        timestamps: true
      });

      return logs.toString().split('\n').filter(line => line.trim());
    } catch (error) {
      console.error('Error getting logs:', error);
      return [];
    }
  }

  /**
   * Get container resource usage statistics
   */
  async getStats(workspaceId: string): Promise<ContainerStats> {
    const container = this.containers.get(workspaceId);
    if (!container) {
      throw new Error(`Sandbox ${workspaceId} not found`);
    }

    try {
      const stats = await container.stats({ stream: false });

      // Calculate CPU percentage
      const cpuDelta = stats.cpu_stats.cpu_usage.total_usage - stats.precpu_stats.cpu_usage.total_usage;
      const systemDelta = stats.cpu_stats.system_cpu_usage - stats.precpu_stats.system_cpu_usage;
      const cpuPercent = (cpuDelta / systemDelta) * stats.cpu_stats.online_cpus * 100;

      // Calculate memory usage in MB
      const memoryUsage = stats.memory_stats.usage / (1024 * 1024);

      // Network stats
      const networks = stats.networks || {};
      const networkStats = Object.values(networks).reduce(
        (acc: any, net: any) => ({
          rx: acc.rx + (net.rx_bytes || 0),
          tx: acc.tx + (net.tx_bytes || 0)
        }),
        { rx: 0, tx: 0 }
      );

      return {
        cpu: Math.round(cpuPercent * 100) / 100,
        memory: Math.round(memoryUsage * 100) / 100,
        network: networkStats
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      throw error;
    }
  }

  /**
   * Execute a command inside the container
   */
  async exec(workspaceId: string, command: string[]): Promise<string> {
    const container = this.containers.get(workspaceId);
    if (!container) {
      throw new Error(`Sandbox ${workspaceId} not found`);
    }

    try {
      const exec = await container.exec({
        Cmd: command,
        AttachStdout: true,
        AttachStderr: true
      });

      const stream = await exec.start({ Detach: false });

      return new Promise((resolve, reject) => {
        let output = '';

        stream.on('data', (chunk: Buffer) => {
          output += chunk.toString();
        });

        stream.on('end', () => {
          resolve(output);
        });

        stream.on('error', reject);
      });
    } catch (error) {
      console.error('Error executing command:', error);
      throw error;
    }
  }

  /**
   * Update files in the running container
   */
  async updateFiles(workspaceId: string, files: Map<string, string>): Promise<void> {
    const workspacePath = path.join(this.WORKSPACE_BASE_PATH, workspaceId);

    for (const [filePath, content] of files) {
      const fullPath = path.join(workspacePath, filePath);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, content);
    }

    // Trigger hot reload if supported by framework
    this.emit('sandbox:files-updated', { workspaceId, files: Array.from(files.keys()) });
  }

  /**
   * List all active sandboxes
   */
  async listSandboxes(userId?: string): Promise<SandboxStatus[]> {
    const filters: any = {
      label: ['plusultra.workspace']
    };

    if (userId) {
      filters.label.push(`plusultra.user=${userId}`);
    }

    const containers = await this.docker.listContainers({
      all: true,
      filters: JSON.stringify(filters)
    });

    return Promise.all(
      containers.map(async (containerInfo) => {
        const workspaceId = containerInfo.Labels['plusultra.workspace'];
        return this.getStatus(workspaceId);
      })
    );
  }

  /**
   * Clean up inactive sandboxes older than specified time
   */
  async cleanupInactiveSandboxes(maxAge: number = 3600000): Promise<number> {
    const sandboxes = await this.listSandboxes();
    let cleaned = 0;

    for (const sandbox of sandboxes) {
      if (sandbox.status === 'stopped' && sandbox.startedAt) {
        const age = Date.now() - sandbox.startedAt.getTime();
        if (age > maxAge) {
          try {
            await this.destroySandbox(sandbox.workspaceId);
            cleaned++;
          } catch (error) {
            console.error(`Failed to cleanup sandbox ${sandbox.workspaceId}:`, error);
          }
        }
      }
    }

    return cleaned;
  }

  /**
   * Private helper methods
   */

  private allocatePort(workspaceId: string): number {
    // Find available port
    for (let port = this.PREVIEW_PORT_RANGE_START; port <= this.PREVIEW_PORT_RANGE_END; port++) {
      if (!Array.from(this.portAllocations.values()).includes(port)) {
        this.portAllocations.set(workspaceId, port);
        return port;
      }
    }
    throw new Error('No available ports for sandbox');
  }

  private releasePort(workspaceId: string): void {
    this.portAllocations.delete(workspaceId);
  }

  private async copyProjectFiles(source: string, dest: string): Promise<void> {
    // This is a simplified version - in production, use a more robust file copy
    await fs.cp(source, dest, { recursive: true });
  }

  private async getOrBuildImage(framework: string): Promise<string> {
    const imageMap: Record<string, string> = {
      'nextjs': 'plusultra/nextjs-sandbox:latest',
      'react-native': 'plusultra/react-native-sandbox:latest',
      'expo': 'plusultra/expo-sandbox:latest'
    };

    const imageName = imageMap[framework];
    if (!imageName) {
      throw new Error(`Unsupported framework: ${framework}`);
    }

    // Check if image exists, build if not
    try {
      await this.docker.getImage(imageName).inspect();
    } catch (error) {
      // Image doesn't exist, build it
      console.log(`Building ${imageName}...`);
      // In production, implement image building logic here
    }

    return imageName;
  }

  private getStartCommand(framework: string): string[] {
    const commandMap: Record<string, string[]> = {
      'nextjs': ['npm', 'run', 'dev'],
      'react-native': ['npm', 'start'],
      'expo': ['npx', 'expo', 'start', '--web']
    };

    return commandMap[framework] || ['npm', 'start'];
  }

  private async waitForReady(container: Docker.Container, port: number, timeout: number): Promise<void> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      try {
        const info = await container.inspect();
        if (!info.State.Running) {
          throw new Error('Container stopped unexpectedly');
        }

        // In production, implement actual health check (e.g., HTTP request to preview URL)
        await new Promise(resolve => setTimeout(resolve, 1000));

        // Simple check: if container is running for > 5 seconds, consider it ready
        if (Date.now() - startTime > 5000) {
          return;
        }
      } catch (error) {
        if (Date.now() - startTime >= timeout) {
          throw new Error('Container failed to become ready in time');
        }
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    throw new Error('Timeout waiting for container to be ready');
  }

  private parseMemory(memory: string): number {
    const unit = memory.slice(-1).toLowerCase();
    const value = parseInt(memory.slice(0, -1));

    const multipliers: Record<string, number> = {
      'k': 1024,
      'm': 1024 * 1024,
      'g': 1024 * 1024 * 1024
    };

    return value * (multipliers[unit] || 1);
  }

  private parseCpu(cpu: string): number {
    // Convert CPU string (e.g., "0.5", "1", "2") to nano CPUs
    return parseFloat(cpu) * 1e9;
  }
}

export default DockerSandboxService;

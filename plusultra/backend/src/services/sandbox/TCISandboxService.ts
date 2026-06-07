/**
 * Production-Grade Sandbox Service for TCI
 * Implements deterministic execution environments with Docker containers
 * Supports artifact storage integration and comprehensive logging
 */

import Docker from 'dockerode';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { CloudflareR2Storage } from '../storage/CloudflareR2Storage';

/**
 * Enhanced sandbox configuration for TCI requirements
 */
export interface SandboxConfig {
  timeout?: number;
  memoryLimit?: number;
  cpuLimit?: number;
  networkAccess?: boolean;
  environment?: Record<string, string>;
  volumes?: Array<{ hostPath: string; containerPath: string; readOnly?: boolean }>;
  workingDirectory?: string;
  user?: string;
  image?: string;
  command?: string[];
}

/**
 * Comprehensive sandbox execution result
 */
export interface SandboxResult {
  success: boolean;
  stdout: string;
  stderr: string;
  exitCode: number;
  executionTime: number;
  artifacts?: Array<{
    name: string;
    path: string;
    type: 'file' | 'directory';
    size: number;
  }>;
  logs?: string[];
  metrics?: {
    memoryUsage: number;
    cpuUsage: number;
    networkIO?: { rx: number; tx: number };
  };
  snapshot?: SandboxSnapshot;
}

/**
 * Sandbox environment snapshot for deterministic replay
 */
export interface SandboxSnapshot {
  containerId: string;
  imageId: string;
  environment: Record<string, string>;
  filesystem: Record<string, string>; // file hashes
  timestamp: string;
  dependencies: string[]; // package versions, etc.
  artifactReferences: string[]; // References to stored artifacts
}

/**
 * Production-ready sandbox service with Docker integration
 */
export class TCISandboxService {
  private docker: Docker;
  private storageService: CloudflareR2Storage;
  private tempDir: string;
  private activeSandboxes: Map<string, { container: Docker.Container; startTime: number }> = new Map();

  constructor(storageService: CloudflareR2Storage, tempDir: string = '/tmp/tci-sandbox') {
    this.docker = new Docker();
    this.storageService = storageService;
    this.tempDir = tempDir;

    // Ensure temp directory exists
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
  }

  /**
   * Execute code in an isolated Docker container
   */
  async executeCode(code: string, config: SandboxConfig = {}): Promise<SandboxResult> {
    const startTime = Date.now();
    let container: Docker.Container | undefined;

    try {
      // Create temporary file with the code
      const tempFile = path.join(this.tempDir, `code_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.js`);
      fs.writeFileSync(tempFile, code);

      // Default configuration for Node.js execution
      const defaultConfig: SandboxConfig = {
        image: 'node:18-alpine',
        timeout: 30000, // 30 seconds
        memoryLimit: 512 * 1024 * 1024, // 512MB
        networkAccess: false,
        workingDirectory: '/workspace',
        command: ['node', path.basename(tempFile)],
        ...config
      };

      // Create and start container
      container = await this.createContainer(tempFile, defaultConfig);
      const containerId = container.id;

      // Execute with timeout
      const exec = await container.exec({
        Cmd: defaultConfig.command!,
        AttachStdout: true,
        AttachStderr: true,
        WorkingDir: defaultConfig.workingDirectory
      });

      // Start execution and capture output
      const stream = await exec.start({ hijack: true, stdin: false });

      if (!stream) {
        throw new Error('Failed to start execution stream');
      }

      let stdout = '';
      let stderr = '';

      return new Promise<SandboxResult>((resolve, reject) => {
        const timeout = setTimeout(async () => {
          try {
            await container?.kill();
            resolve({
              success: false,
              stdout: stdout,
              stderr: stderr + '\nExecution timed out',
              exitCode: -1,
              executionTime: Date.now() - startTime
            });
          } catch (error) {
            reject(error);
          }
        }, defaultConfig.timeout);

        container?.modem.demuxStream(stream, {
          write: (chunk: Buffer) => stdout += chunk.toString(),
        }, {
          write: (chunk: Buffer) => stderr += chunk.toString(),
        });

        stream.on('end', async () => {
          clearTimeout(timeout);

          try {
            const execInspect = await exec.inspect();
            const exitCode = execInspect.ExitCode ?? 0;

            // Collect artifacts
            const artifacts = await this.collectArtifacts(container!, defaultConfig);

            // Create snapshot for deterministic replay
            const snapshot = await this.createSnapshot(container!, defaultConfig, artifacts);

            resolve({
              success: exitCode === 0,
              stdout,
              stderr,
              exitCode,
              executionTime: Date.now() - startTime,
              artifacts,
              snapshot
            });
          } catch (error) {
            reject(error);
          }
        });

        stream.on('error', (error) => {
          clearTimeout(timeout);
          reject(error);
        });
      });

    } catch (error) {
      return {
        success: false,
        stdout: '',
        stderr: `Sandbox execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        exitCode: 1,
        executionTime: Date.now() - startTime
      };
    } finally {
      // Cleanup
      if (container) {
        try {
          await container.remove({ force: true });
        } catch (error) {
          console.error('Failed to cleanup container:', error);
        }
      }
    }
  }

  /**
   * Create a Docker container with specified configuration
   */
  private async createContainer(tempFile: string, config: SandboxConfig): Promise<Docker.Container> {
    const containerConfig: Docker.ContainerCreateOptions = {
      Image: config.image!,
      Cmd: config.command!,
      WorkingDir: config.workingDirectory,
      Env: Object.entries(config.environment || {}).map(([k, v]) => `${k}=${v}`),
      HostConfig: {
        Memory: config.memoryLimit,
        CpuQuota: config.cpuLimit,
        NetworkMode: config.networkAccess ? 'bridge' : 'none',
        AutoRemove: false, // We'll manually remove for proper cleanup
        Mounts: [
          {
            Type: 'bind',
            Source: path.dirname(tempFile),
            Target: path.dirname(tempFile),
            ReadOnly: true
          }
        ]
      }
    };

    // Add volumes if specified
    if (config.volumes) {
      containerConfig.HostConfig!.Mounts!.push(
        ...config.volumes.map(volume => ({
          Type: 'bind' as const,
          Source: volume.hostPath,
          Target: volume.containerPath,
          ReadOnly: volume.readOnly || false
        }))
      );
    }

    return await this.docker.createContainer(containerConfig);
  }

  /**
   * Collect artifacts from the container filesystem
   */
  private async collectArtifacts(container: Docker.Container, config: SandboxConfig): Promise<Array<{
    name: string;
    path: string;
    type: 'file' | 'directory';
    size: number;
  }>> {
    const artifacts: Array<{
      name: string;
      path: string;
      type: 'file' | 'directory';
      size: number;
    }> = [];

    try {
      // Use Docker API to inspect container and get filesystem info
      const containerInfo = await container.inspect();
      const exec = await container.exec({
        Cmd: ['find', config.workingDirectory || '/workspace', '-type', 'f', '-name', '*'],
        AttachStdout: true,
        AttachStderr: true
      });

      const stream = await exec.start({ hijack: true, stdin: false });
      let fileList = '';

      return new Promise((resolve) => {
        stream.on('data', (chunk: Buffer) => {
          fileList += chunk.toString();
        });

        stream.on('end', async () => {
          const files = fileList.split('\n').filter(f => f.trim());
          for (const filePath of files) {
            try {
              const stats = fs.statSync(filePath);
              artifacts.push({
                name: path.basename(filePath),
                path: filePath,
                type: stats.isDirectory() ? 'directory' : 'file',
                size: stats.size
              });
            } catch (error) {
              // File might not exist or be accessible
            }
          }
          resolve(artifacts);
        });
      });
    } catch (error) {
      console.error('Failed to collect artifacts:', error);
      return artifacts;
    }
  }

  /**
   * Create a snapshot of the execution environment for deterministic replay
   */
  private async createSnapshot(
    container: Docker.Container,
    config: SandboxConfig,
    artifacts: Array<{ name: string; path: string; type: 'file' | 'directory'; size: number }>
  ): Promise<SandboxSnapshot> {
    // Get container info
    const containerInfo = await container.inspect();

    // Create file hashes for verification
    const filesystem: Record<string, string> = {};
    for (const artifact of artifacts) {
      if (artifact.type === 'file') {
        try {
          const content = fs.readFileSync(artifact.path);
          filesystem[artifact.path] = crypto.createHash('sha256').update(content).digest('hex');
        } catch (error) {
          console.error(`Failed to hash file ${artifact.path}:`, error);
        }
      }
    }

    return {
      containerId: container.id,
      imageId: containerInfo.Image,
      environment: config.environment || {},
      filesystem,
      timestamp: new Date().toISOString(),
      dependencies: [], // Would be populated by dependency analysis
      artifactReferences: [] // Would be populated by storage service
    };
  }

  /**
   * Create a reusable sandbox environment
   */
  async createSandbox(image: string, config: SandboxConfig = {}): Promise<string> {
    try {
      const container = await this.docker.createContainer({
        Image: image,
        Cmd: ['sleep', '3600'], // Keep alive for sandbox operations
        WorkingDir: config.workingDirectory || '/workspace',
        Env: Object.entries(config.environment || {}).map(([k, v]) => `${k}=${v}`),
        HostConfig: {
          AutoRemove: false,
          Memory: config.memoryLimit,
          CpuQuota: config.cpuLimit
        }
      });

      await container.start();
      const sandboxId = `sandbox_${container.id}`;

      this.activeSandboxes.set(sandboxId, {
        container,
        startTime: Date.now()
      });

      return sandboxId;
    } catch (error) {
      throw new Error(`Failed to create sandbox: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Execute code in an existing sandbox
   */
  async executeInSandbox(sandboxId: string, code: string, config: SandboxConfig = {}): Promise<SandboxResult> {
    const sandbox = this.activeSandboxes.get(sandboxId);
    if (!sandbox) {
      throw new Error(`Sandbox ${sandboxId} not found or expired`);
    }

    // Copy code to container
    const tempFile = `/tmp/code_${Date.now()}.js`;
    await sandbox.container.putArchive(tempFile, Buffer.from(code));

    // Execute code
    const exec = await sandbox.container.exec({
      Cmd: ['node', tempFile],
      AttachStdout: true,
      AttachStderr: true,
      WorkingDir: config.workingDirectory || '/workspace'
    });

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';

      exec.start({ hijack: true }, (err, stream) => {
        if (err) {
          reject(err);
          return;
        }

        if (!stream) {
          reject(new Error('Failed to start execution stream'));
          return;
        }

        const timeout = setTimeout(() => {
          resolve({
            success: false,
            stdout,
            stderr: stderr + '\nExecution timed out',
            exitCode: -1,
            executionTime: 0
          });
        }, config.timeout || 30000);

        sandbox.container.modem.demuxStream(stream, {
          write: (chunk: Buffer) => stdout += chunk.toString(),
        }, {
          write: (chunk: Buffer) => stderr += chunk.toString(),
        });

        stream.on('end', () => {
          clearTimeout(timeout);
          exec.inspect().then(inspect => {
            resolve({
              success: inspect.ExitCode === 0,
              stdout,
              stderr,
              exitCode: inspect.ExitCode ?? 0,
              executionTime: Date.now() - sandbox.startTime
            });
          }).catch(reject);
        });
      });
    });
  }

  /**
   * Destroy a sandbox and cleanup resources
   */
  async destroySandbox(sandboxId: string): Promise<void> {
    const sandbox = this.activeSandboxes.get(sandboxId);
    if (sandbox) {
      try {
        await sandbox.container.stop({ t: 10 });
        await sandbox.container.remove({ force: true });
      } catch (error) {
        console.error(`Failed to destroy sandbox ${sandboxId}:`, error);
      }
      this.activeSandboxes.delete(sandboxId);
    }
  }

  /**
   * Cleanup all active sandboxes
   */
  async cleanup(): Promise<void> {
    const destroyPromises = Array.from(this.activeSandboxes.keys()).map(id =>
      this.destroySandbox(id)
    );

    await Promise.allSettled(destroyPromises);
    this.activeSandboxes.clear();
  }
}

export default TCISandboxService;

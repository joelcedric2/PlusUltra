import { FastifyInstance } from 'fastify';
import Redis from 'ioredis';
import { DockerSandboxService } from '../services/sandbox/DockerSandboxService';
import { WorkspaceManager } from '../services/sandbox/WorkspaceManager';
import { LivePreviewService } from '../services/sandbox/LivePreviewService';
import { TCISandboxMonitor } from '../services/sandbox/TCISandboxMonitor';

// Declare TypeScript types for fastify decorators
declare module 'fastify' {
  interface FastifyInstance {
    dockerSandbox: DockerSandboxService;
    workspaceManager: WorkspaceManager;
    livePreview: LivePreviewService;
    tciMonitor: TCISandboxMonitor;
  }
}

/**
 * Initialize sandbox services and register them with Fastify
 */
export async function initializeSandbox(fastify: FastifyInstance, redis: Redis): Promise<void> {
  fastify.log.info('Initializing sandbox services...');

  try {
    // Initialize Docker Sandbox Service
    const dockerSandbox = new DockerSandboxService({
      socketPath: process.env.DOCKER_SOCKET_PATH || '/var/run/docker.sock'
    });

    // Test Docker connection
    try {
      await dockerSandbox['docker'].ping();
      fastify.log.info('✅ Docker connection established');
    } catch (error) {
      fastify.log.error({ error }, '❌ Failed to connect to Docker');
      throw new Error('Docker is not available. Please ensure Docker is running.');
    }

    // Initialize Workspace Manager
    const workspaceManager = new WorkspaceManager(dockerSandbox, redis);
    fastify.log.info('✅ Workspace Manager initialized');

    // Initialize Live Preview Service
    const livePreview = new LivePreviewService(workspaceManager);
    fastify.log.info('✅ Live Preview Service initialized');

    // Initialize TCI Sandbox Monitor
    const tciMonitor = new TCISandboxMonitor(workspaceManager, livePreview);
    fastify.log.info('✅ TCI Sandbox Monitor initialized');

    // Decorate Fastify instance with services
    fastify.decorate('dockerSandbox', dockerSandbox);
    fastify.decorate('workspaceManager', workspaceManager);
    fastify.decorate('livePreview', livePreview);
    fastify.decorate('tciMonitor', tciMonitor);

    // Register shutdown hooks
    fastify.addHook('onClose', async () => {
      fastify.log.info('Shutting down sandbox services...');

      try {
        await workspaceManager.shutdown();
        await livePreview.shutdown();
        await tciMonitor.shutdown();
        fastify.log.info('✅ Sandbox services shut down successfully');
      } catch (error) {
        fastify.log.error({ error }, '❌ Error shutting down sandbox services');
      }
    });

    fastify.log.info('🚀 Sandbox services initialized successfully');

  } catch (error) {
    fastify.log.error({ error }, 'Failed to initialize sandbox services');
    throw error;
  }
}

/**
 * Build Docker sandbox images
 */
export async function buildSandboxImages(fastify: FastifyInstance): Promise<void> {
  fastify.log.info('Checking sandbox images...');

  const requiredImages = [
    'plusultra/nextjs-sandbox:latest',
    'plusultra/react-native-sandbox:latest',
    'plusultra/expo-sandbox:latest'
  ];

  const dockerSandbox = fastify.dockerSandbox;
  const docker = dockerSandbox['docker'];

  for (const imageName of requiredImages) {
    try {
      await docker.getImage(imageName).inspect();
      fastify.log.info(`✅ Image ${imageName} found`);
    } catch (error) {
      fastify.log.warn(`⚠️  Image ${imageName} not found`);
      fastify.log.info(`Please build images by running: cd docker && ./build-images.sh`);
    }
  }
}

export default initializeSandbox;

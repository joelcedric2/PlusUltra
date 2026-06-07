import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  SubdomainHostingService,
  DeploymentConfig,
  DeploymentType,
  DeploymentStatus,
  ListDeploymentsOptions,
} from '../../services/hosting/SubdomainHostingService';

/**
 * Request/Response Types
 */

interface DeployRequestBody {
  projectId: string;
  projectName: string;
  type: DeploymentType;
  sourcePath?: string;
  files?: Record<string, string>;
  framework?: 'react' | 'nextjs' | 'vue' | 'svelte' | 'static' | 'expo-web';
  buildCommand?: string;
  outputDirectory?: string;
  environmentVariables?: Record<string, string>;
  customDomain?: string;
  metadata?: Record<string, any>;
}

interface CustomDomainRequestBody {
  deploymentId?: string;
  projectId?: string;
  customDomain: string;
}

interface RollbackRequestBody {
  targetVersion?: number;
}

interface ListQuerystring {
  projectId?: string;
  userId?: string;
  type?: string;
  status?: string;
  page?: string;
  limit?: string;
}

/**
 * Hosting Routes
 * API endpoints for subdomain hosting and deployment management
 *
 * Routes:
 * - POST /api/v1/hosting/deploy - Deploy project to subdomain
 * - GET /api/v1/hosting/status/:projectId - Get deployment status
 * - POST /api/v1/hosting/custom-domain - Configure custom domain
 * - DELETE /api/v1/hosting/deployment/:deploymentId - Remove deployment
 * - GET /api/v1/hosting/deployments/:projectId - List all deployments for a project
 * - GET /api/v1/hosting/deployments - List all deployments with filtering
 * - POST /api/v1/hosting/deployment/:deploymentId/rollback - Rollback to previous version
 * - GET /api/v1/hosting/deployment/:deploymentId - Get deployment by ID
 * - GET /api/v1/hosting/deployment/:deploymentId/versions - Get deployment versions
 */
export async function hostingRoutes(fastify: FastifyInstance) {
  // Initialize the hosting service
  const hostingService = new SubdomainHostingService();

  /**
   * POST /api/v1/hosting/deploy
   * Deploy a project to a subdomain
   *
   * Request body:
   * - projectId: string - Unique project identifier
   * - projectName: string - Project name (used for subdomain generation)
   * - type: 'app' | 'site' - Deployment type
   * - sourcePath?: string - Path to project files on server
   * - files?: Record<string, string> - Map of file paths to content
   * - framework?: string - Framework used
   * - customDomain?: string - Custom domain to configure
   */
  fastify.post('/api/v1/hosting/deploy', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as DeployRequestBody;
      const {
        projectId,
        projectName,
        type,
        sourcePath,
        files,
        framework,
        buildCommand,
        outputDirectory,
        environmentVariables,
        customDomain,
        metadata,
      } = body;

      // Get user ID from authenticated request
      const user = (request as any).user;
      const userId = user?.userId || user?.id || 'anonymous';

      // Validate input
      if (!projectId || !projectName || !type) {
        return reply.code(400).send({
          success: false,
          error: 'projectId, projectName, and type are required',
        });
      }

      if (!sourcePath && !files) {
        return reply.code(400).send({
          success: false,
          error: 'Either sourcePath or files must be provided',
        });
      }

      // Convert files object to Map if provided
      let filesMap: Map<string, string> | undefined;
      if (files) {
        filesMap = new Map(Object.entries(files));
      }

      const config: DeploymentConfig = {
        projectId,
        projectName,
        userId,
        type,
        sourcePath: sourcePath || '',
        files: filesMap,
        framework,
        buildCommand,
        outputDirectory,
        environmentVariables,
        customDomain,
        metadata,
      };

      const result = await hostingService.deploy(config);

      if (result.success) {
        return reply.code(201).send({
          success: true,
          deployment: result.deployment,
          url: result.url,
          logs: result.logs,
        });
      } else {
        return reply.code(400).send({
          success: false,
          error: result.error,
          logs: result.logs,
        });
      }
    } catch (error) {
      fastify.log.error({ error }, 'Error deploying project');
      return reply.code(500).send({
        success: false,
        error: 'Failed to deploy project',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/v1/hosting/status/:projectId
   * Get deployment status for a project
   */
  fastify.get('/api/v1/hosting/status/:projectId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { projectId } = request.params as { projectId: string };

      const result = await hostingService.getDeploymentStatus(projectId);

      if (!result.deployment) {
        return reply.code(404).send({
          success: false,
          error: 'Deployment not found',
        });
      }

      return reply.code(200).send({
        success: true,
        deployment: result.deployment,
        versions: result.versions,
        customDomainStatus: result.customDomainStatus,
      });
    } catch (error) {
      fastify.log.error({ error }, 'Error getting deployment status');
      return reply.code(500).send({
        success: false,
        error: 'Failed to get deployment status',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/hosting/custom-domain
   * Configure a custom domain for a deployment
   *
   * Request body:
   * - deploymentId?: string - Deployment ID
   * - projectId?: string - Project ID (alternative to deploymentId)
   * - customDomain: string - Custom domain to configure (e.g., app.example.com)
   */
  fastify.post('/api/v1/hosting/custom-domain', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as CustomDomainRequestBody;
      const { deploymentId, projectId, customDomain } = body;

      if (!deploymentId && !projectId) {
        return reply.code(400).send({
          success: false,
          error: 'Either deploymentId or projectId must be provided',
        });
      }

      if (!customDomain) {
        return reply.code(400).send({
          success: false,
          error: 'customDomain is required',
        });
      }

      const result = await hostingService.configureCustomDomain(
        deploymentId || projectId!,
        customDomain
      );

      if (result.success) {
        return reply.code(200).send({
          success: true,
          domain: result.domain,
          status: result.status,
          verificationInstructions: result.verificationInstructions,
          sslStatus: result.sslStatus,
        });
      } else {
        return reply.code(400).send({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      fastify.log.error({ error }, 'Error configuring custom domain');
      return reply.code(500).send({
        success: false,
        error: 'Failed to configure custom domain',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * DELETE /api/v1/hosting/deployment/:deploymentId
   * Remove a deployment and clean up resources
   */
  fastify.delete('/api/v1/hosting/deployment/:deploymentId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { deploymentId } = request.params as { deploymentId: string };

      const result = await hostingService.removeDeployment(deploymentId);

      if (result.success) {
        return reply.code(200).send({
          success: true,
          message: 'Deployment removed successfully',
        });
      } else {
        return reply.code(404).send({
          success: false,
          error: result.error,
        });
      }
    } catch (error) {
      fastify.log.error({ error }, 'Error removing deployment');
      return reply.code(500).send({
        success: false,
        error: 'Failed to remove deployment',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/v1/hosting/deployments/:projectId
   * List all deployments for a specific project
   */
  fastify.get('/api/v1/hosting/deployments/:projectId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { projectId } = request.params as { projectId: string };
      const query = request.query as ListQuerystring;
      const { page, limit } = query;

      const options: ListDeploymentsOptions = {
        projectId,
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 20,
      };

      const result = await hostingService.listDeployments(options);

      return reply.code(200).send({
        success: true,
        deployments: result.deployments,
        total: result.total,
        page: result.page,
        limit: result.limit,
      });
    } catch (error) {
      fastify.log.error({ error }, 'Error listing deployments');
      return reply.code(500).send({
        success: false,
        error: 'Failed to list deployments',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/v1/hosting/deployments
   * List all deployments with optional filtering
   *
   * Query params:
   * - projectId?: string - Filter by project ID
   * - userId?: string - Filter by user ID
   * - type?: 'app' | 'site' - Filter by deployment type
   * - status?: string - Filter by status
   * - page?: number - Page number
   * - limit?: number - Items per page
   */
  fastify.get('/api/v1/hosting/deployments', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as ListQuerystring;
      const { projectId, userId, type, status, page, limit } = query;

      // Use authenticated user ID if not specified
      const user = (request as any).user;
      const filterUserId = userId || user?.userId || user?.id;

      const options: ListDeploymentsOptions = {
        projectId,
        userId: filterUserId,
        type: type as DeploymentType | undefined,
        status: status as DeploymentStatus | undefined,
        page: page ? parseInt(page) : 1,
        limit: limit ? parseInt(limit) : 20,
      };

      const result = await hostingService.listDeployments(options);

      return reply.code(200).send({
        success: true,
        deployments: result.deployments,
        total: result.total,
        page: result.page,
        limit: result.limit,
      });
    } catch (error) {
      fastify.log.error({ error }, 'Error listing deployments');
      return reply.code(500).send({
        success: false,
        error: 'Failed to list deployments',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * POST /api/v1/hosting/deployment/:deploymentId/rollback
   * Rollback a deployment to a previous version
   *
   * Request body:
   * - targetVersion?: number - Specific version to rollback to (defaults to previous)
   */
  fastify.post('/api/v1/hosting/deployment/:deploymentId/rollback', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { deploymentId } = request.params as { deploymentId: string };
      const body = (request.body || {}) as RollbackRequestBody;
      const { targetVersion } = body;

      const result = await hostingService.rollback(deploymentId, targetVersion);

      if (result.success) {
        return reply.code(200).send({
          success: true,
          deployment: result.deployment,
          url: result.url,
          logs: result.logs,
        });
      } else {
        return reply.code(400).send({
          success: false,
          error: result.error,
          logs: result.logs,
        });
      }
    } catch (error) {
      fastify.log.error({ error }, 'Error rolling back deployment');
      return reply.code(500).send({
        success: false,
        error: 'Failed to rollback deployment',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/v1/hosting/deployment/:deploymentId
   * Get a specific deployment by ID
   */
  fastify.get('/api/v1/hosting/deployment/:deploymentId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { deploymentId } = request.params as { deploymentId: string };

      const deployment = hostingService.getDeployment(deploymentId);

      if (!deployment) {
        return reply.code(404).send({
          success: false,
          error: 'Deployment not found',
        });
      }

      return reply.code(200).send({
        success: true,
        deployment,
      });
    } catch (error) {
      fastify.log.error({ error }, 'Error getting deployment');
      return reply.code(500).send({
        success: false,
        error: 'Failed to get deployment',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });

  /**
   * GET /api/v1/hosting/deployment/:deploymentId/versions
   * Get all versions for a deployment (for rollback selection)
   */
  fastify.get('/api/v1/hosting/deployment/:deploymentId/versions', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { deploymentId } = request.params as { deploymentId: string };

      const versions = hostingService.getDeploymentVersions(deploymentId);

      return reply.code(200).send({
        success: true,
        versions,
      });
    } catch (error) {
      fastify.log.error({ error }, 'Error getting deployment versions');
      return reply.code(500).send({
        success: false,
        error: 'Failed to get deployment versions',
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  });
}

export default hostingRoutes;

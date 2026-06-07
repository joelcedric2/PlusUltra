import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { WorkspaceManager } from '../services/sandbox/WorkspaceManager';
import { LivePreviewService } from '../services/sandbox/LivePreviewService';
import { TCISandboxMonitor } from '../services/sandbox/TCISandboxMonitor';

interface CreateWorkspaceRequest {
  Body: {
    projectId: string;
    userId: string;
    name: string;
    framework: 'nextjs' | 'react-native' | 'expo';
    projectPath: string;
    metadata?: Record<string, any>;
  };
}

interface WorkspaceActionRequest {
  Params: {
    workspaceId: string;
  };
  Body?: {
    userId: string;
  };
}

interface UpdateFilesRequest {
  Params: {
    workspaceId: string;
  };
  Body: {
    userId: string;
    files: Record<string, string>; // path -> content
  };
}

interface ExecuteCommandRequest {
  Params: {
    workspaceId: string;
  };
  Body: {
    userId: string;
    command: string[];
  };
}

/**
 * Sandbox Routes
 * Provides API endpoints for workspace management, live preview, and TCI monitoring
 */
export async function sandboxRoutes(fastify: FastifyInstance) {
  const workspaceManager: WorkspaceManager = fastify.workspaceManager;
  const livePreview: LivePreviewService = fastify.livePreview;
  const tciMonitor: TCISandboxMonitor = fastify.tciMonitor;

  // Create a new workspace
  fastify.post<CreateWorkspaceRequest>(
    '/api/v1/sandbox/workspace',
    async (request, reply) => {
      try {
        const { projectId, userId, name, framework, projectPath, metadata } = request.body;

        const workspace = await workspaceManager.createWorkspace(
          userId,
          projectId,
          name,
          framework,
          projectPath,
          metadata
        );

        return reply.code(201).send({
          success: true,
          workspace
        });
      } catch (error) {
        fastify.log.error({ error }, 'Error creating workspace');
        return reply.code(500).send({
          success: false,
          error: 'Failed to create workspace',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Get workspace details
  fastify.get<WorkspaceActionRequest>(
    '/api/v1/sandbox/workspace/:workspaceId',
    async (request, reply) => {
      try {
        const { workspaceId } = request.params;

        const workspace = await workspaceManager.getWorkspace(workspaceId);
        if (!workspace) {
          return reply.code(404).send({
            success: false,
            error: 'Workspace not found'
          });
        }

        return reply.code(200).send({
          success: true,
          workspace
        });
      } catch (error) {
        fastify.log.error({ error }, 'Error getting workspace');;
        return reply.code(500).send({
          success: false,
          error: 'Failed to get workspace',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Get all workspaces for a user
  fastify.get('/api/v1/sandbox/workspaces', async (request, reply) => {
    try {
      const userId = (request.query as any).userId;
      if (!userId) {
        return reply.code(400).send({
          success: false,
          error: 'userId query parameter is required'
        });
      }

      const workspaces = await workspaceManager.getUserWorkspaces(userId);

      return reply.code(200).send({
        success: true,
        workspaces
      });
    } catch (error) {
      fastify.log.error({ error }, 'Error getting user workspaces');;
      return reply.code(500).send({
        success: false,
        error: 'Failed to get workspaces',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Update workspace files (triggers hot reload)
  fastify.post<UpdateFilesRequest>(
    '/api/v1/sandbox/workspace/:workspaceId/files',
    async (request, reply) => {
      try {
        const { workspaceId } = request.params;
        const { userId, files } = request.body;

        const workspace = await workspaceManager.getWorkspace(workspaceId);
        if (!workspace) {
          return reply.code(404).send({
            success: false,
            error: 'Workspace not found'
          });
        }

        if (workspace.userId !== userId) {
          return reply.code(403).send({
            success: false,
            error: 'Access denied'
          });
        }

        const filesMap = new Map(Object.entries(files));
        await workspaceManager.updateWorkspaceFiles(workspaceId, filesMap);

        return reply.code(200).send({
          success: true,
          message: 'Files updated successfully'
        });
      } catch (error) {
        fastify.log.error({ error }, 'Error updating workspace files');;
        return reply.code(500).send({
          success: false,
          error: 'Failed to update files',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Restart workspace
  fastify.post<WorkspaceActionRequest>(
    '/api/v1/sandbox/workspace/:workspaceId/restart',
    async (request, reply) => {
      try {
        const { workspaceId } = request.params;
        const { userId } = request.body || {};

        const workspace = await workspaceManager.getWorkspace(workspaceId);
        if (!workspace) {
          return reply.code(404).send({
            success: false,
            error: 'Workspace not found'
          });
        }

        if (userId && workspace.userId !== userId) {
          return reply.code(403).send({
            success: false,
            error: 'Access denied'
          });
        }

        const updatedWorkspace = await workspaceManager.restartWorkspace(workspaceId);

        return reply.code(200).send({
          success: true,
          workspace: updatedWorkspace
        });
      } catch (error) {
        fastify.log.error({ error }, 'Error restarting workspace');;
        return reply.code(500).send({
          success: false,
          error: 'Failed to restart workspace',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Stop workspace
  fastify.post<WorkspaceActionRequest>(
    '/api/v1/sandbox/workspace/:workspaceId/stop',
    async (request, reply) => {
      try {
        const { workspaceId } = request.params;
        const { userId } = request.body || {};

        const workspace = await workspaceManager.getWorkspace(workspaceId);
        if (!workspace) {
          return reply.code(404).send({
            success: false,
            error: 'Workspace not found'
          });
        }

        if (userId && workspace.userId !== userId) {
          return reply.code(403).send({
            success: false,
            error: 'Access denied'
          });
        }

        await workspaceManager.stopWorkspace(workspaceId);

        return reply.code(200).send({
          success: true,
          message: 'Workspace stopped successfully'
        });
      } catch (error) {
        fastify.log.error({ error }, 'Error stopping workspace');;
        return reply.code(500).send({
          success: false,
          error: 'Failed to stop workspace',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Delete workspace
  fastify.delete<WorkspaceActionRequest>(
    '/api/v1/sandbox/workspace/:workspaceId',
    async (request, reply) => {
      try {
        const { workspaceId } = request.params;
        const userId = (request.query as any).userId;

        const workspace = await workspaceManager.getWorkspace(workspaceId);
        if (!workspace) {
          return reply.code(404).send({
            success: false,
            error: 'Workspace not found'
          });
        }

        if (userId && workspace.userId !== userId) {
          return reply.code(403).send({
            success: false,
            error: 'Access denied'
          });
        }

        await workspaceManager.destroyWorkspace(workspaceId);

        return reply.code(200).send({
          success: true,
          message: 'Workspace deleted successfully'
        });
      } catch (error) {
        fastify.log.error({ error }, 'Error deleting workspace');;
        return reply.code(500).send({
          success: false,
          error: 'Failed to delete workspace',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Get workspace logs
  fastify.get<WorkspaceActionRequest>(
    '/api/v1/sandbox/workspace/:workspaceId/logs',
    async (request, reply) => {
      try {
        const { workspaceId } = request.params;
        const tail = parseInt((request.query as any).tail || '100');

        const logs = await workspaceManager.getWorkspaceLogs(workspaceId, tail);

        return reply.code(200).send({
          success: true,
          logs
        });
      } catch (error) {
        fastify.log.error({ error }, 'Error getting workspace logs');;
        return reply.code(500).send({
          success: false,
          error: 'Failed to get logs',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Get workspace stats
  fastify.get<WorkspaceActionRequest>(
    '/api/v1/sandbox/workspace/:workspaceId/stats',
    async (request, reply) => {
      try {
        const { workspaceId } = request.params;

        const stats = await workspaceManager.getWorkspaceStats(workspaceId);

        return reply.code(200).send({
          success: true,
          stats
        });
      } catch (error) {
        fastify.log.error({ error }, 'Error getting workspace stats');;
        return reply.code(500).send({
          success: false,
          error: 'Failed to get stats',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Execute command in workspace
  fastify.post<ExecuteCommandRequest>(
    '/api/v1/sandbox/workspace/:workspaceId/execute',
    async (request, reply) => {
      try {
        const { workspaceId } = request.params;
        const { userId, command } = request.body;

        const workspace = await workspaceManager.getWorkspace(workspaceId);
        if (!workspace) {
          return reply.code(404).send({
            success: false,
            error: 'Workspace not found'
          });
        }

        if (workspace.userId !== userId) {
          return reply.code(403).send({
            success: false,
            error: 'Access denied'
          });
        }

        const output = await workspaceManager.executeCommand(workspaceId, command);

        return reply.code(200).send({
          success: true,
          output
        });
      } catch (error) {
        fastify.log.error({ error }, 'Error executing command');;
        return reply.code(500).send({
          success: false,
          error: 'Failed to execute command',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // TCI Monitoring endpoints

  // Get workspace health
  fastify.get<WorkspaceActionRequest>(
    '/api/v1/sandbox/workspace/:workspaceId/health',
    async (request, reply) => {
      try {
        const { workspaceId } = request.params;

        const health = await tciMonitor.performHealthCheck(workspaceId);

        return reply.code(200).send({
          success: true,
          health
        });
      } catch (error) {
        fastify.log.error({ error }, 'Error getting workspace health');;
        return reply.code(500).send({
          success: false,
          error: 'Failed to get health status',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Get workspace issues
  fastify.get<WorkspaceActionRequest>(
    '/api/v1/sandbox/workspace/:workspaceId/issues',
    async (request, reply) => {
      try {
        const { workspaceId } = request.params;

        const issues = tciMonitor.getWorkspaceIssues(workspaceId);

        return reply.code(200).send({
          success: true,
          issues
        });
      } catch (error) {
        fastify.log.error({ error }, 'Error getting workspace issues');;
        return reply.code(500).send({
          success: false,
          error: 'Failed to get issues',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Get applied fixes
  fastify.get<WorkspaceActionRequest>(
    '/api/v1/sandbox/workspace/:workspaceId/fixes',
    async (request, reply) => {
      try {
        const { workspaceId } = request.params;

        const fixes = tciMonitor.getWorkspaceFixes(workspaceId);

        return reply.code(200).send({
          success: true,
          fixes
        });
      } catch (error) {
        fastify.log.error({ error }, 'Error getting workspace fixes');;
        return reply.code(500).send({
          success: false,
          error: 'Failed to get fixes',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // WebSocket route for live preview
  fastify.get('/api/v1/sandbox/preview/:workspaceId', { websocket: true }, (connection, request) => {
    const { workspaceId } = (request.params as any);
    const userId = (request.query as any).userId;
    const ws = (connection as any).socket || connection;

    if (!userId || !workspaceId) {
      ws.close(1008, 'Missing userId or workspaceId');
      return;
    }

    livePreview.handleConnection(ws, workspaceId, userId);
  });

  // Proxy preview requests to workspace container
  fastify.all('/api/v1/sandbox/proxy/:workspaceId/*', async (request, reply) => {
    const { workspaceId } = (request.params as any);

    await livePreview.proxyRequest(request.raw, reply.raw, workspaceId);
  });
}

export default sandboxRoutes;

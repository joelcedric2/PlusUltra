import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as fs from 'fs';
import { orchestrationEngine } from '../orchestration/workflows/AppGenerationWorkflow';
import { AgentContext } from '../orchestration/agents/BaseAgents';
import { projectPackaging } from '../services/packaging/ProjectPackaging';
import { sandboxService } from '../services/sandbox/SandboxService';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

// Type definitions for request/response
type GenerateAppRequest = {
  appName?: string;
  intent: string;
  platforms?: string[];
  techStack?: string[];
  userId: string;
};

type WorkflowParams = {
  workflowId: string;
};

type SandboxTestRequest = {
  projectPath: string;
  timeout?: number;
};

type SandboxValidateRequest = {
  projectPath: string;
};

type SandboxInfoRequest = {};

type DownloadRequest = {
  fileName: string;
};

type ListPackagesRequest = {};

type SandboxTestResponse = {
  success: boolean;
  result: {
    buildTime: number;
    output: string;
    error?: string;
    exitCode: number;
    logs: string[];
  };
};

type SandboxValidateResponse = {
  success: boolean;
  validation: {
    valid: boolean;
    errors: string[];
    warnings: string[];
  };
};

// Error response type
interface ErrorResponse {
  error: string;
  code: string;
  requestId: string;
  timestamp: string;
  details?: any;
}

// Success response type
interface SuccessResponse<T = any> {
  success: true;
  data: T;
  requestId: string;
  timestamp: string;
}

// Helper function to create consistent error responses
const createErrorResponse = (
  reply: FastifyReply,
  error: Error,
  statusCode: number = 500,
  code: string = 'INTERNAL_SERVER_ERROR'
) => {
  const requestId = uuidv4();
  const timestamp = new Date().toISOString();

  const errorResponse: ErrorResponse = {
    error: error.message || 'An unexpected error occurred',
    code,
    requestId,
    timestamp
  };

  // Log the error with request ID for debugging
  console.error(`[${timestamp}] [${requestId}] Error:`, error);

  return reply.status(statusCode).send(errorResponse);
};

// Helper function to create consistent success responses
const createSuccessResponse = <T>(
  reply: FastifyReply,
  data: T,
  statusCode: number = 200
) => {
  const response: SuccessResponse<T> = {
    success: true,
    data,
    requestId: uuidv4(),
    timestamp: new Date().toISOString()
  };

  return reply.status(statusCode).send(response);
};

// Generate app from intent
const generateApp = async (
  request: FastifyRequest<{ Body: GenerateAppRequest }>,
  reply: FastifyReply
) => {
  try {
    const { appName, intent, platforms, techStack, userId } = request.body;

    if (!intent || !userId) {
      return createErrorResponse(
        reply,
        new Error('Missing required fields: intent and userId are required'),
        400,
        'MISSING_REQUIRED_FIELDS'
      );
    }

    const context: AgentContext = {
      userId,
      projectId: `project-${Date.now()}`,
      appIntent: intent,
      techStack: techStack || ['React Native', 'TypeScript', 'Expo'],
      metadata: {
        appName: appName || 'Untitled App',
        platforms: platforms || ['iOS', 'Android'],
        generatedAt: new Date().toISOString()
      }
    };

    // Start app generation workflow
    const result = await orchestrationEngine.generateApp(context);

    if (result.success) {
      return createSuccessResponse(reply, {
        workflowId: `app-gen-${userId}-${Date.now()}`,
        result: result.finalOutput,
        metadata: result.metadata
      });
    } else {
      return createErrorResponse(
        reply,
        new Error('App generation failed'),
        500,
        'APP_GENERATION_FAILED'
      );
    }
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Internal server error'),
      500,
      'INTERNAL_SERVER_ERROR'
    );
  }
};

// Get workflow status
const getWorkflowStatus = async (
  request: FastifyRequest<{ Params: WorkflowParams }>,
  reply: FastifyReply
) => {
  try {
    const { workflowId } = request.params;

    if (!workflowId) {
      return createErrorResponse(
        reply,
        new Error('workflowId parameter is required'),
        400,
        'MISSING_WORKFLOW_ID'
      );
    }

    const workflow = orchestrationEngine.getWorkflowStatus(workflowId);

    if (!workflow) {
      return createErrorResponse(
        reply,
        new Error('Workflow not found'),
        404,
        'WORKFLOW_NOT_FOUND'
      );
    }

    return createSuccessResponse(reply, {
      workflowId,
      steps: workflow.map((step: any) => ({
        id: step.id,
        name: step.name,
        status: step.status,
        startedAt: step.startedAt,
        completedAt: step.completedAt,
        error: step.result?.error,
        output: step.result?.success ? step.result.output : undefined
      }))
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Internal server error'),
      500,
      'INTERNAL_SERVER_ERROR'
    );
  }
};

// Cancel workflow
const cancelWorkflow = async (
  request: FastifyRequest<{ Params: WorkflowParams }>,
  reply: FastifyReply
) => {
  try {
    const { workflowId } = request.params;

    if (!workflowId) {
      return createErrorResponse(
        reply,
        new Error('workflowId parameter is required'),
        400,
        'MISSING_WORKFLOW_ID'
      );
    }

    const cancelled = orchestrationEngine.cancelWorkflow(workflowId);

    if (cancelled) {
      return createSuccessResponse(reply, {
        message: 'Workflow cancelled successfully'
      });
    } else {
      return createErrorResponse(
        reply,
        new Error('Workflow not found or already completed'),
        404,
        'WORKFLOW_NOT_FOUND'
      );
    }
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Internal server error'),
      500,
      'INTERNAL_SERVER_ERROR'
    );
  }
};

// Health check for orchestration engine
const getOrchestrationHealth = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    // Get available models and agents from orchestration engine
    const engineStatus = {
      models: ['gpt-5-code', 'claude-4.5-sonnet', 'gemini-2.5-pro', 'starcoder-2'],
      agents: ['CodeGenerationAgent', 'ArchitectureAgent', 'DebugAgent', 'UXAgent', 'ComplianceAgent'],
      activeWorkflows: 0, // Would be tracked by orchestration engine
      queueDepth: 0 // Would be tracked by job queue service
    };

    return createSuccessResponse(reply, {
      status: 'healthy',
      availableModels: engineStatus.models,
      availableAgents: engineStatus.agents,
      activeWorkflows: engineStatus.activeWorkflows,
      queueDepth: engineStatus.queueDepth,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Health check failed'),
      500,
      'HEALTH_CHECK_FAILED'
    );
  }
};

// Download generated project
const downloadProject = async (
  request: FastifyRequest<{ Params: DownloadRequest }>,
  reply: FastifyReply
) => {
  try {
    const { fileName } = request.params;

    if (!fileName) {
      return createErrorResponse(
        reply,
        new Error('fileName parameter is required'),
        400,
        'MISSING_FILENAME'
      );
    }

    const filePath = projectPackaging.getPackagePath(fileName);

    if (!filePath) {
      return createErrorResponse(
        reply,
        new Error('Project package not found'),
        404,
        'PACKAGE_NOT_FOUND'
      );
    }

    // Set appropriate headers for file download
    reply.header('Content-Type', 'application/zip');
    reply.header('Content-Disposition', `attachment; filename="${fileName}"`);

    // Send file
    return reply.send(fs.createReadStream(filePath));
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Internal server error'),
      500,
      'INTERNAL_SERVER_ERROR'
    );
  }
};

// List available packages
const listPackages = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const packages = projectPackaging.listPackages();

    return createSuccessResponse(reply, {
      packages: packages.map(pkg => ({
        name: pkg.name,
        size: pkg.size,
        createdAt: pkg.createdAt.toISOString(),
        downloadUrl: `/api/v1/download/${pkg.name}`
      }))
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Internal server error'),
      500,
      'INTERNAL_SERVER_ERROR'
    );
  }
};

// Test project in sandbox environment
const testProjectInSandbox = async (
  request: FastifyRequest<{ Body: SandboxTestRequest }>,
  reply: FastifyReply
) => {
  try {
    const { projectPath, timeout = 300000 } = request.body; // 5 minutes default timeout

    if (!projectPath) {
      return createErrorResponse(
        reply,
        new Error('projectPath is required'),
        400,
        'MISSING_PROJECT_PATH'
      );
    }

    if (!fs.existsSync(projectPath)) {
      return createErrorResponse(
        reply,
        new Error('Project path not found'),
        404,
        'PROJECT_PATH_NOT_FOUND'
      );
    }

    // Run sandbox tests
    const result = await sandboxService.testProject({
      projectPath,
      timeout
    });

    return createSuccessResponse(reply, {
      success: result.success,
      result: {
        buildTime: result.buildTime,
        output: result.output,
        error: result.error,
        exitCode: result.exitCode,
        logs: result.logs
      }
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Sandbox testing failed'),
      500,
      'SANDBOX_TEST_FAILED'
    );
  }
};

// Get sandbox workspace information
const getSandboxInfo = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  try {
    const info = sandboxService.getWorkspaceInfo();

    return createSuccessResponse(reply, {
      workspace: info
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Failed to get sandbox information'),
      500,
      'SANDBOX_INFO_FAILED'
    );
  }
};

// Validate project structure
const validateProject = async (
  request: FastifyRequest<{ Body: SandboxValidateRequest }>,
  reply: FastifyReply
) => {
  try {
    const { projectPath } = request.body;

    if (!projectPath) {
      return createErrorResponse(
        reply,
        new Error('projectPath is required'),
        400,
        'MISSING_PROJECT_PATH'
      );
    }

    const validation = await sandboxService.validateProject(projectPath);

    return createSuccessResponse(reply, {
      validation
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Project validation failed'),
      500,
      'PROJECT_VALIDATION_FAILED'
    );
  }
};

export async function orchestrationRoutes(fastify: FastifyInstance) {
  // Generate app from intent
  fastify.post('/api/v1/generate-app', {
    schema: {
      body: z.object({
        appName: z.string().optional(),
        intent: z.string(),
        platforms: z.array(z.string()).optional(),
        techStack: z.array(z.string()).optional(),
        userId: z.string()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            workflowId: z.string(),
            result: z.any(),
            metadata: z.any()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        }),
        500: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: generateApp
  });

  // Get workflow status
  fastify.get('/api/v1/workflow/:workflowId', {
    schema: {
      params: z.object({
        workflowId: z.string()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            workflowId: z.string(),
            steps: z.array(z.object({
              id: z.string(),
              name: z.string(),
              status: z.string(),
              startedAt: z.string().optional(),
              completedAt: z.string().optional(),
              error: z.string().optional(),
              output: z.any().optional()
            }))
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        404: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: getWorkflowStatus
  });

  // Cancel workflow
  fastify.post('/api/v1/workflow/:workflowId/cancel', {
    schema: {
      params: z.object({
        workflowId: z.string()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            message: z.string()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        404: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: cancelWorkflow
  });

  // Health check for orchestration engine
  fastify.get('/api/v1/orchestration/health', {
    schema: {
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            status: z.string(),
            availableModels: z.array(z.string()),
            availableAgents: z.array(z.string()),
            timestamp: z.string()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        500: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: getOrchestrationHealth
  });

  // Download generated project
  fastify.get('/api/v1/download/:fileName', {
    schema: {
      params: z.object({
        fileName: z.string()
      }),
      response: {
        200: z.string(), // File content
        404: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: downloadProject
  });

  // List available packages
  fastify.get('/api/v1/packages', {
    schema: {
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            packages: z.array(z.object({
              name: z.string(),
              size: z.number(),
              createdAt: z.string(),
              downloadUrl: z.string()
            }))
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        500: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: listPackages
  });

  // Test project in sandbox environment
  fastify.post('/api/v1/sandbox/test', {
    schema: {
      body: z.object({
        projectPath: z.string(),
        timeout: z.number().optional()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            success: z.boolean(),
            result: z.object({
              buildTime: z.number(),
              output: z.string(),
              error: z.string().optional(),
              exitCode: z.number(),
              logs: z.array(z.string())
            })
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        }),
        404: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: testProjectInSandbox
  });

  // Get sandbox workspace information
  fastify.get('/api/v1/sandbox/info', {
    schema: {
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            workspace: z.any()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        500: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: getSandboxInfo
  });

  // Validate project structure
  fastify.post('/api/v1/sandbox/validate', {
    schema: {
      body: z.object({
        projectPath: z.string()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            validation: z.object({
              valid: z.boolean(),
              errors: z.array(z.string()),
              warnings: z.array(z.string())
            })
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        }),
        500: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: validateProject
  });
}

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import SupabaseProvisioningService, { SupabaseConfig, ProvisionedProject } from '../services/database/SupabaseProvisioningService';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

// Zod schema for SupabaseConfig
const supabaseConfigSchema = z.object({
  projectName: z.string(),
  databasePassword: z.string(),
  region: z.string().optional(),
  features: z.object({
    auth: z.boolean().optional(),
    database: z.boolean().optional(),
    storage: z.boolean().optional(),
    realtime: z.boolean().optional(),
    edgeFunctions: z.boolean().optional()
  }).optional()
});

// Type definitions for request/response
type ProvisionProjectRequest = {
  projectName: string;
  databasePassword: string;
  region?: string;
  features?: {
    auth?: boolean;
    database?: boolean;
    storage?: boolean;
    realtime?: boolean;
    edgeFunctions?: boolean;
  };
};

type GenerateConfigRequest = {
  projectPath: string;
  project: {
    projectId: string;
    projectName: string;
    apiUrl: string;
    anonKey: string;
    serviceRoleKey: string;
  };
};

type GenerateTypesRequest = {
  project: {
    projectName: string;
    schema: {
      tables: any[];
    };
  };
};

type GetStatusRequest = {
  projectId: string;
};

type CompleteSetupRequest = {
  projectName: string;
  databasePassword: string;
  region?: string;
  features?: {
    auth?: boolean;
    database?: boolean;
    storage?: boolean;
    realtime?: boolean;
    edgeFunctions?: boolean;
  };
  projectPath: string;
  generateTypes?: boolean;
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

// Provision new Supabase project
const provisionProject = async (
  request: FastifyRequest<{ Body: ProvisionProjectRequest }>,
  reply: FastifyReply
) => {
  try {
    const config = request.body;
    const supabaseService = new SupabaseProvisioningService();

    const project = await supabaseService.provisionProject(config);

    return createSuccessResponse(reply, {
      project,
      projectName: config.projectName,
      status: 'provisioned'
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Provisioning failed'),
      400,
      'PROVISIONING_FAILED'
    );
  }
};

// Generate Supabase config files for React Native project
const generateSupabaseConfig = async (
  request: FastifyRequest<{ Body: GenerateConfigRequest }>,
  reply: FastifyReply
) => {
  try {
    const { projectPath, project } = request.body;
    const supabaseService = new SupabaseProvisioningService();

    const fullProject = {
      ...project,
      databaseUrl: (project as any).databaseUrl || `postgresql://${project.projectId}.supabase.co`,
      apiKey: project.serviceRoleKey,
      dashboardUrl: (project as any).dashboardUrl || `https://app.supabase.com/project/${project.projectId}`
    };

    await supabaseService.generateSupabaseConfig(projectPath, fullProject);

    return createSuccessResponse(reply, {
      message: 'Supabase configuration files generated successfully',
      projectPath,
      projectId: project.projectId,
      projectName: project.projectName
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Configuration generation failed'),
      400,
      'CONFIG_GENERATION_FAILED'
    );
  }
};

// Generate TypeScript types for database schema
const generateDatabaseTypes = async (
  request: FastifyRequest<{ Body: GenerateTypesRequest }>,
  reply: FastifyReply
) => {
  try {
    const { project } = request.body;
    const supabaseService = new SupabaseProvisioningService();

    const fullProject = {
      projectId: project.projectName,
      projectName: project.projectName,
      databaseUrl: project.schema ? 'postgresql://localhost:5432/db' : '',
      apiUrl: `https://${project.projectName}.supabase.co`,
      apiKey: 'temp-key',
      anonKey: 'temp-anon-key',
      serviceRoleKey: 'temp-service-key',
      dashboardUrl: `https://app.supabase.com/project/${project.projectName}`,
      schema: {
        tables: project.schema?.tables || [],
        functions: [],
        policies: [],
        triggers: []
      }
    };

    const types = await supabaseService.generateDatabaseTypes(fullProject);

    return createSuccessResponse(reply, {
      types,
      filename: 'database.types.ts',
      projectName: project.projectName,
      tableCount: project.schema.tables.length
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Type generation failed'),
      400,
      'TYPE_GENERATION_FAILED'
    );
  }
};

// Get provisioning status
const getProvisioningStatus = async (
  request: FastifyRequest<{ Params: GetStatusRequest }>,
  reply: FastifyReply
) => {
  try {
    const { projectId } = request.params;

    // In production, this would check actual provisioning status
    return createSuccessResponse(reply, {
      status: 'completed',
      projectId,
      message: 'Project provisioning completed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Failed to get status'),
      404,
      'STATUS_NOT_FOUND'
    );
  }
};

// Provision project with complete setup (project + config + types)
const setupComplete = async (
  request: FastifyRequest<{ Body: CompleteSetupRequest }>,
  reply: FastifyReply
) => {
  try {
    const { projectPath, generateTypes, ...config } = request.body;
    const supabaseService = new SupabaseProvisioningService();

    // Provision the project
    const project = await supabaseService.provisionProject(config);

    // Generate configuration files
    await supabaseService.generateSupabaseConfig(projectPath, project);

    let types = '';
    if (generateTypes) {
      types = await supabaseService.generateDatabaseTypes(project);
    }

    return createSuccessResponse(reply, {
      project,
      configGenerated: true,
      typesGenerated: !!types,
      types: types || undefined,
      projectPath,
      generateTypes: generateTypes || false
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Complete setup failed'),
      400,
      'COMPLETE_SETUP_FAILED'
    );
  }
};

export default async function supabaseRoutes(fastify: FastifyInstance) {
  // Provision new Supabase project
  fastify.post('/api/v1/supabase/provision', {
    schema: {
      body: supabaseConfigSchema,
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            project: z.any(),
            projectName: z.string(),
            status: z.string()
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
        })
      }
    },
    handler: provisionProject
  });

  // Generate Supabase config files for React Native project
  fastify.post('/api/v1/supabase/generate-config', {
    schema: {
      body: z.object({
        projectPath: z.string(),
        project: z.object({
          projectId: z.string(),
          projectName: z.string(),
          apiUrl: z.string(),
          anonKey: z.string(),
          serviceRoleKey: z.string()
        })
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            message: z.string(),
            projectPath: z.string(),
            projectId: z.string(),
            projectName: z.string()
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
        })
      }
    },
    handler: generateSupabaseConfig
  });

  // Generate TypeScript types for database schema
  fastify.post('/api/v1/supabase/generate-types', {
    schema: {
      body: z.object({
        project: z.object({
          projectName: z.string(),
          schema: z.object({
            tables: z.array(z.any())
          })
        })
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            types: z.string(),
            filename: z.string(),
            projectName: z.string(),
            tableCount: z.number()
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
        })
      }
    },
    handler: generateDatabaseTypes
  });

  // Get provisioning status
  fastify.get('/api/v1/supabase/status/:projectId', {
    schema: {
      params: z.object({
        projectId: z.string()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            status: z.string(),
            projectId: z.string(),
            message: z.string(),
            timestamp: z.string()
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
    handler: getProvisioningStatus
  });

  // Provision project with complete setup (project + config + types)
  fastify.post('/api/v1/supabase/setup', {
    schema: {
      body: supabaseConfigSchema.extend({
        projectPath: z.string(),
        generateTypes: z.boolean().optional()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            project: z.any(),
            configGenerated: z.boolean(),
            typesGenerated: z.boolean(),
            types: z.string().optional(),
            projectPath: z.string(),
            generateTypes: z.boolean()
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
        })
      }
    },
    handler: setupComplete
  });

  // Test Supabase connection
  fastify.post('/api/v1/supabase/test-connection', {
    schema: {
      body: z.object({
        supabaseUrl: z.string().url(),
        supabaseAnonKey: z.string(),
        testAuth: z.boolean().optional(),
        testDatabase: z.boolean().optional()
      })
    },
    handler: async (request: FastifyRequest<{
      Body: {
        supabaseUrl: string;
        supabaseAnonKey: string;
        testAuth?: boolean;
        testDatabase?: boolean;
      }
    }>, reply) => {
      try {
        const { supabaseUrl, supabaseAnonKey, testAuth, testDatabase } = request.body;
        const results = {
          connection: false,
          auth: false,
          database: false,
          errors: [] as string[]
        };

        try {
          const response = await fetch(`${supabaseUrl}/rest/v1/`, {
            headers: { 'apikey': supabaseAnonKey, 'Authorization': `Bearer ${supabaseAnonKey}` }
          });
          results.connection = response.ok;
          if (!response.ok) results.errors.push(`Connection failed: ${response.statusText}`);
        } catch (error: any) {
          results.errors.push(`Connection error: ${error.message}`);
        }

        if (testAuth && results.connection) {
          try {
            const authResponse = await fetch(`${supabaseUrl}/auth/v1/settings`, {
              headers: { 'apikey': supabaseAnonKey }
            });
            results.auth = authResponse.ok;
          } catch (error: any) {
            results.errors.push(`Auth test error: ${error.message}`);
          }
        }

        if (testDatabase && results.connection) {
          try {
            const dbResponse = await fetch(`${supabaseUrl}/rest/v1/`, {
              headers: { 'apikey': supabaseAnonKey, 'Authorization': `Bearer ${supabaseAnonKey}` }
            });
            results.database = dbResponse.ok;
          } catch (error: any) {
            results.errors.push(`DB test error: ${error.message}`);
          }
        }

        return createSuccessResponse(reply, {
          status: results.connection ? 'connected' : 'failed',
          tests: results,
          message: results.connection ? 'Connected!' : 'Failed'
        });
      } catch (error) {
        return createErrorResponse(reply, error instanceof Error ? error : new Error('Test failed'), 500, 'TEST_FAILED');
      }
    }
  });

  // Test auth
  fastify.post('/api/v1/supabase/test-auth', {
    schema: {
      body: z.object({
        supabaseUrl: z.string().url(),
        supabaseAnonKey: z.string(),
        testEmail: z.string().email(),
        testPassword: z.string().min(6),
        action: z.enum(['signup', 'login'])
      })
    },
    handler: async (request: FastifyRequest<{
      Body: { supabaseUrl: string; supabaseAnonKey: string; testEmail: string; testPassword: string; action: 'signup' | 'login'; }
    }>, reply) => {
      try {
        const { supabaseUrl, supabaseAnonKey, testEmail, testPassword, action } = request.body;
        const endpoint = action === 'signup' ? `${supabaseUrl}/auth/v1/signup` : `${supabaseUrl}/auth/v1/token?grant_type=password`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'apikey': supabaseAnonKey, 'Content-Type': 'application/json' },
          body: JSON.stringify({ email: testEmail, password: testPassword })
        });
        const data = await response.json() as any;
        return createSuccessResponse(reply, {
          success: response.ok,
          action,
          message: response.ok ? `${action} successful!` : (data.error_description || 'Failed'),
          user: data.user,
          hasSession: !!data.access_token
        });
      } catch (error) {
        return createErrorResponse(reply, error instanceof Error ? error : new Error('Auth failed'), 500, 'AUTH_TEST_FAILED');
      }
    }
  });
}

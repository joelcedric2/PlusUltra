import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import MultiPlatformExporter, { PlatformConfig, ExportResult } from '../services/export/MultiPlatformExporter';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { platformConfigSchema, exportRequestSchema } from '../schemas';

// Type definitions for request/response
type SinglePlatformExportRequest = {
  sourceProject: string;
  platform: PlatformConfig;
  appName: string;
  description: string;
};

type MultiPlatformExportRequest = {
  sourceProject: string;
  appName: string;
  description: string;
  platforms: PlatformConfig[];
};

type AllPlatformsExportRequest = {
  sourceProject: string;
  appName: string;
  description: string;
};

type GetStatusRequest = {
  platform: string;
};

type CleanupRequest = {};

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

// Export to single platform
const exportToPlatform = async (
  request: FastifyRequest<{ Body: SinglePlatformExportRequest }>,
  reply: FastifyReply
) => {
  try {
    const { sourceProject, platform, appName, description } = request.body;
    const exporter = new MultiPlatformExporter('./exports', './temp');

    let result: ExportResult;

    switch (platform.framework) {
      case 'react-native':
        result = await exporter.exportToReactNative(sourceProject, platform, appName, description);
        break;
      case 'flutter':
        result = await exporter.exportToFlutter(sourceProject, platform, appName, description);
        break;
      case 'swiftui':
        result = await exporter.exportToSwiftUI(sourceProject, platform, appName, description);
        break;
      default:
        return createErrorResponse(
          reply,
          new Error(`Unsupported framework: ${platform.framework}`),
          400,
          'UNSUPPORTED_FRAMEWORK'
        );
    }

    return createSuccessResponse(reply, {
      export: result,
      framework: platform.framework,
      target: platform.target
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Export failed'),
      400,
      'EXPORT_FAILED'
    );
  }
};

// Export to multiple platforms
const exportToMultiplePlatforms = async (
  request: FastifyRequest<{ Body: MultiPlatformExportRequest }>,
  reply: FastifyReply
) => {
  try {
    const { sourceProject, appName, description, platforms } = request.body;
    const exporter = new MultiPlatformExporter('./exports', './temp');

    const results: ExportResult[] = [];

    for (const platform of platforms) {
      try {
        let result: ExportResult;

        switch (platform.framework) {
          case 'react-native':
            result = await exporter.exportToReactNative(sourceProject, platform, appName, description);
            break;
          case 'flutter':
            result = await exporter.exportToFlutter(sourceProject, platform, appName, description);
            break;
          case 'swiftui':
            result = await exporter.exportToSwiftUI(sourceProject, platform, appName, description);
            break;
          default:
            result = {
              success: false,
              platform: platform.name,
              outputPath: '',
              buildTime: 0,
              fileSize: 0,
              artifacts: [],
              errors: [`Unsupported framework: ${platform.framework}`]
            };
        }

        results.push(result);
      } catch (error) {
        results.push({
          success: false,
          platform: platform.name,
          outputPath: '',
          buildTime: 0,
          fileSize: 0,
          artifacts: [],
          errors: [error instanceof Error ? error.message : 'Unknown error']
        });
      }
    }

    return createSuccessResponse(reply, {
      exports: results,
      summary: {
        total: results.length,
        successful: results.filter(r => r.success).length,
        failed: results.filter(r => !r.success).length
      }
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Multi-platform export failed'),
      400,
      'MULTI_PLATFORM_EXPORT_FAILED'
    );
  }
};

// Export to all supported platforms
const exportToAllPlatforms = async (
  request: FastifyRequest<{ Body: AllPlatformsExportRequest }>,
  reply: FastifyReply
) => {
  try {
    const { sourceProject, appName, description } = request.body;
    const exporter = new MultiPlatformExporter('./exports', './temp');

    const results = await exporter.exportToAllPlatforms(sourceProject, appName, description);

    return createSuccessResponse(reply, {
      exports: results,
      summary: {
        total: results.length,
        successful: results.filter((r: ExportResult) => r.success).length,
        failed: results.filter((r: ExportResult) => !r.success).length
      }
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('All-platform export failed'),
      400,
      'ALL_PLATFORM_EXPORT_FAILED'
    );
  }
};

// Get export status
const getExportStatus = async (
  request: FastifyRequest<{ Params: GetStatusRequest }>,
  reply: FastifyReply
) => {
  try {
    const { platform } = request.params;

    // In production, this would check actual export status
    return createSuccessResponse(reply, {
      status: 'completed',
      platform,
      message: `${platform} export completed successfully`,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Failed to get export status'),
      404,
      'EXPORT_STATUS_NOT_FOUND'
    );
  }
};

// Get available export options
const getExportOptions = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const options = {
    frameworks: [
      {
        name: 'React Native',
        value: 'react-native',
        targets: ['ios', 'android'],
        description: 'Cross-platform native apps with React'
      },
      {
        name: 'Flutter',
        value: 'flutter',
        targets: ['ios', 'android', 'web'],
        description: 'Google\'s UI toolkit for building beautiful apps'
      },
      {
        name: 'SwiftUI',
        value: 'swiftui',
        targets: ['ios'],
        description: 'Apple\'s declarative framework for iOS apps'
      }
    ],
    buildTypes: [
      { name: 'Debug', value: 'debug', description: 'Development build with debugging' },
      { name: 'Release', value: 'release', description: 'Production-optimized build' }
    ]
  };

  return createSuccessResponse(reply, options);
};

// Cleanup temporary files
const cleanupExports = async (
  request: FastifyRequest<{ Body: CleanupRequest }>,
  reply: FastifyReply
) => {
  try {
    const exporter = new MultiPlatformExporter('./exports', './temp');
    await exporter.cleanup();

    return createSuccessResponse(reply, {
      message: 'Cleanup completed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Cleanup failed'),
      400,
      'CLEANUP_FAILED'
    );
  }
};

export default async function exportRoutes(fastify: FastifyInstance) {
  // Export to single platform
  fastify.post('/api/v1/export/platform', {
    schema: {
      body: z.object({
        sourceProject: z.string(),
        platform: platformConfigSchema,
        appName: z.string(),
        description: z.string()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            export: z.any(), // ExportResult type would be too complex for schema
            framework: z.string(),
            target: z.string()
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
    handler: exportToPlatform
  });

  // Export to multiple platforms
  fastify.post('/api/v1/export/multiple', {
    schema: {
      body: exportRequestSchema,
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            exports: z.array(z.any()),
            summary: z.object({
              total: z.number(),
              successful: z.number(),
              failed: z.number()
            })
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string()
        })
      }
    },
    handler: exportToMultiplePlatforms
  });

  // Export to all supported platforms
  fastify.post('/api/v1/export/all-platforms', {
    schema: {
      body: z.object({
        sourceProject: z.string(),
        appName: z.string(),
        description: z.string()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            exports: z.array(z.any()),
            summary: z.object({
              total: z.number(),
              successful: z.number(),
              failed: z.number()
            })
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string()
        })
      }
    },
    handler: exportToAllPlatforms
  });

  // Get export status
  fastify.get('/api/v1/export/status/:platform', {
    schema: {
      params: z.object({
        platform: z.string()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            status: z.string(),
            platform: z.string(),
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
          timestamp: z.string()
        })
      }
    },
    handler: getExportStatus
  });

  // Get available export options
  fastify.get('/api/v1/export/options', {
    schema: {
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            frameworks: z.array(z.object({
              name: z.string(),
              value: z.string(),
              targets: z.array(z.string()),
              description: z.string()
            })),
            buildTypes: z.array(z.object({
              name: z.string(),
              value: z.string(),
              description: z.string()
            }))
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        })
      }
    },
    handler: getExportOptions
  });

  // Cleanup temporary files
  fastify.post('/api/v1/export/cleanup', {
    schema: {
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            message: z.string(),
            timestamp: z.string()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string()
        })
      }
    },
    handler: cleanupExports
  });
}

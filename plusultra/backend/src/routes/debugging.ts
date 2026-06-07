import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import PredictiveDebuggingService, { ProjectAnalysis, SecurityIssue, Recommendation } from '../services/debugging/PredictiveDebuggingService';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

// Type definitions for request/response
type AnalyzeRequest = {
  projectPath: string;
  forceRefresh?: boolean;
};

type GenerateFixesRequest = {
  projectPath: string;
};

type GetAnalysisRequest = {
  projectPath: string;
};

type HealthCheckRequest = {
  projectPath: string;
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

// Helper function to calculate health score
const calculateHealthScore = (analysis: ProjectAnalysis): number => {
  let score = 100;

  // Deduct points for issues
  score -= analysis.analysis.dependencies.vulnerabilities.length * 10;
  score -= analysis.analysis.security.issues.filter((i: SecurityIssue) => i.severity === 'critical').length * 20;
  score -= analysis.analysis.security.issues.filter((i: SecurityIssue) => i.severity === 'high').length * 10;
  score -= analysis.analysis.codeQuality.typeErrors * 5;
  score -= Math.min(analysis.analysis.codeQuality.lintingErrors, 50); // Cap at 50 points deduction

  return Math.max(0, score);
};

// Analyze project for issues
const analyzeProject = async (
  request: FastifyRequest<{ Body: AnalyzeRequest }>,
  reply: FastifyReply
) => {
  try {
    const { projectPath, forceRefresh } = request.body;
    const debuggingService = new PredictiveDebuggingService();
    const analysis = await debuggingService.analyzeProject(projectPath, forceRefresh);

    return createSuccessResponse(reply, analysis);
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Analysis failed'),
      400,
      'ANALYSIS_FAILED'
    );
  }
};

// Generate fix suggestions
const generateFixes = async (
  request: FastifyRequest<{ Body: GenerateFixesRequest }>,
  reply: FastifyReply
) => {
  try {
    const { projectPath } = request.body;
    const debuggingService = new PredictiveDebuggingService();

    // First analyze the project
    const analysis = await debuggingService.analyzeProject(projectPath);

    // Generate fixes based on analysis
    const fixes = await debuggingService.generateFixes(analysis);

    return createSuccessResponse(reply, {
      fixes,
      analysis: {
        riskLevel: analysis.riskLevel,
        recommendationCount: analysis.recommendations.length,
        issueCount: {
          vulnerabilities: analysis.analysis.dependencies.vulnerabilities.length,
          codeQuality: analysis.analysis.codeQuality.lintingErrors + analysis.analysis.codeQuality.typeErrors,
          security: analysis.analysis.security.issues.length,
          performance: analysis.analysis.performance.issues.length
        }
      }
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Fix generation failed'),
      400,
      'FIX_GENERATION_FAILED'
    );
  }
};

// Get cached analysis
const getAnalysis = async (
  request: FastifyRequest<{ Params: GetAnalysisRequest }>,
  reply: FastifyReply
) => {
  try {
    const { projectPath } = request.params;
    const debuggingService = new PredictiveDebuggingService();
    const analysis = await debuggingService.analyzeProject(projectPath);

    return createSuccessResponse(reply, {
      analysis,
      cached: true
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Failed to get analysis'),
      404,
      'ANALYSIS_NOT_FOUND'
    );
  }
};

// Quick health check for project
const healthCheck = async (
  request: FastifyRequest<{ Body: HealthCheckRequest }>,
  reply: FastifyReply
) => {
  try {
    const { projectPath } = request.body;
    const debuggingService = new PredictiveDebuggingService();
    const analysis = await debuggingService.analyzeProject(projectPath);

    const healthStatus = {
      overall: analysis.riskLevel,
      score: calculateHealthScore(analysis),
      critical: analysis.recommendations.filter((r: Recommendation) => r.priority === 'critical').length,
      high: analysis.recommendations.filter((r: Recommendation) => r.priority === 'high').length,
      medium: analysis.recommendations.filter((r: Recommendation) => r.priority === 'medium').length,
      low: analysis.recommendations.filter((r: Recommendation) => r.priority === 'low').length
    };

    return createSuccessResponse(reply, {
      health: healthStatus,
      needsAttention: healthStatus.critical > 0 || healthStatus.high > 3
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Health check failed'),
      400,
      'HEALTH_CHECK_FAILED'
    );
  }
};

export default async function debuggingRoutes(fastify: FastifyInstance) {
  // Analyze project for issues
  fastify.post('/api/v1/debugging/analyze', {
    schema: {
      body: z.object({
        projectPath: z.string(),
        forceRefresh: z.boolean().optional()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.any(), // ProjectAnalysis type would be too complex for schema
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
    handler: analyzeProject
  });

  // Generate fix suggestions
  fastify.post('/api/v1/debugging/generate-fixes', {
    schema: {
      body: z.object({
        projectPath: z.string()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            fixes: z.array(z.string()),
            analysis: z.object({
              riskLevel: z.string(),
              recommendationCount: z.number(),
              issueCount: z.object({
                vulnerabilities: z.number(),
                codeQuality: z.number(),
                security: z.number(),
                performance: z.number()
              })
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
    handler: generateFixes
  });

  // Get cached analysis
  fastify.get('/api/v1/debugging/analysis/:projectPath', {
    schema: {
      params: z.object({
        projectPath: z.string()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            analysis: z.any(),
            cached: z.literal(true)
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
    handler: getAnalysis
  });

  // Quick health check for project
  fastify.post('/api/v1/debugging/health-check', {
    schema: {
      body: z.object({
        projectPath: z.string()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            health: z.object({
              overall: z.string(),
              score: z.number(),
              critical: z.number(),
              high: z.number(),
              medium: z.number(),
              low: z.number()
            }),
            needsAttention: z.boolean()
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
    handler: healthCheck
  });
}

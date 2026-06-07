/**
 * Rejection Auto-Fix API Routes
 *
 * RESTful API endpoints for the automatic app rejection fix system.
 * Integrates with TCI (Temporal Code Intelligence) for intelligent fix generation.
 *
 * Endpoints:
 * - POST /api/v1/publishing/auto-fix/analyze - Analyze rejection
 * - POST /api/v1/publishing/auto-fix/generate - Generate fixes
 * - POST /api/v1/publishing/auto-fix/apply - Apply fixes
 * - POST /api/v1/publishing/auto-fix/resubmit - Resubmit after fixes
 * - POST /api/v1/publishing/auto-fix/run - Run full auto-fix workflow
 * - GET /api/v1/publishing/auto-fix/history/:projectId - Get fix history
 * - GET /api/v1/publishing/auto-fix/rejection/:rejectionId - Get rejection details
 * - GET /api/v1/publishing/auto-fix/fixes/:rejectionId - Get generated fixes
 * - GET /api/v1/publishing/auto-fix/config - Get auto-fix configuration
 * - PATCH /api/v1/publishing/auto-fix/config - Update configuration
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

import {
  RejectionAutoFixService,
  createRejectionAutoFixService,
  UnifiedRejection,
  GeneratedFix,
  AppliedFix,
  FixAttempt,
  FixHistory,
  AutoFixConfig,
  Platform,
  RejectionFixCategory,
} from '../../services/publishing/RejectionAutoFixService';

// ============================================================================
// Type Definitions
// ============================================================================

interface ErrorResponse {
  success: false;
  error: string;
  code: string;
  requestId: string;
  timestamp: string;
  details?: Record<string, any>;
}

interface SuccessResponse<T = any> {
  success: true;
  data: T;
  requestId: string;
  timestamp: string;
}

// ============================================================================
// Validation Schemas
// ============================================================================

const platformSchema = z.enum(['ios', 'android']);

const analyzeRejectionSchema = z.object({
  platform: platformSchema,
  projectId: z.string().min(1, 'projectId is required'),
  appId: z.string().min(1, 'appId is required'),
  rejectionData: z.record(z.any()).describe('Raw rejection data from store API'),
});

const generateFixSchema = z.object({
  rejectionId: z.string().uuid('Invalid rejection ID'),
  projectId: z.string().min(1, 'projectId is required'),
  projectPath: z.string().optional(),
});

const applyFixSchema = z.object({
  projectId: z.string().min(1, 'projectId is required'),
  fixId: z.string().uuid('Invalid fix ID'),
  projectPath: z.string().optional(),
});

const resubmitSchema = z.object({
  platform: platformSchema,
  projectId: z.string().min(1, 'projectId is required'),
  appId: z.string().min(1, 'appId is required'),
  buildInfo: z.object({
    buildId: z.string().optional(),
    versionCode: z.number().optional(),
    versionString: z.string().optional(),
  }).optional(),
});

const runAutoFixSchema = z.object({
  platform: platformSchema,
  projectId: z.string().min(1, 'projectId is required'),
  appId: z.string().min(1, 'appId is required'),
  rejectionData: z.record(z.any()),
  projectPath: z.string().optional(),
  buildInfo: z.object({
    buildId: z.string().optional(),
    versionCode: z.number().optional(),
    versionString: z.string().optional(),
  }).optional(),
});

const historyQuerySchema = z.object({
  platform: platformSchema.optional(),
  limit: z.string().transform(Number).optional(),
  offset: z.string().transform(Number).optional(),
});

const configUpdateSchema = z.object({
  maxAttempts: z.number().min(1).max(10).optional(),
  autoResubmit: z.boolean().optional(),
  requireApproval: z.boolean().optional(),
  enabledCategories: z.array(z.enum([
    'metadata', 'privacy', 'performance', 'content',
    'design', 'technical', 'permissions', 'compliance', 'unknown'
  ])).optional(),
  notifyOnCompletion: z.boolean().optional(),
  notifyOnFailure: z.boolean().optional(),
});

// ============================================================================
// Response Helpers
// ============================================================================

const createErrorResponse = (
  reply: FastifyReply,
  error: Error | string,
  statusCode: number = 500,
  code: string = 'INTERNAL_SERVER_ERROR',
  details?: Record<string, any>
): FastifyReply => {
  const requestId = uuidv4();
  const timestamp = new Date().toISOString();

  const errorMessage = typeof error === 'string' ? error : error.message;

  const errorResponse: ErrorResponse = {
    success: false,
    error: errorMessage || 'An unexpected error occurred',
    code,
    requestId,
    timestamp,
    ...(details ? { details } : {}),
  };

  console.error(`[${timestamp}] [${requestId}] Auto-Fix API Error:`, errorMessage);
  return reply.status(statusCode).send(errorResponse);
};

const createSuccessResponse = <T>(
  reply: FastifyReply,
  data: T,
  statusCode: number = 200
): FastifyReply => {
  const response: SuccessResponse<T> = {
    success: true,
    data,
    requestId: uuidv4(),
    timestamp: new Date().toISOString(),
  };

  return reply.status(statusCode).send(response);
};

// ============================================================================
// Routes
// ============================================================================

export async function autoFixRoutes(fastify: FastifyInstance) {
  // Create service instance (singleton)
  let autoFixService: RejectionAutoFixService | null = null;

  const getService = (): RejectionAutoFixService => {
    if (!autoFixService) {
      autoFixService = createRejectionAutoFixService();
    }
    return autoFixService;
  };

  // ============================================================================
  // Health Check
  // ============================================================================

  /**
   * GET /api/v1/publishing/auto-fix/health
   * Check if the auto-fix service is operational
   */
  fastify.get('/api/v1/publishing/auto-fix/health', async (request, reply) => {
    try {
      const service = getService();
      const config = service.getConfig();

      return createSuccessResponse(reply, {
        status: 'healthy',
        service: 'Rejection Auto-Fix Service',
        config: {
          maxAttempts: config.maxAttempts,
          autoResubmit: config.autoResubmit,
          enabledCategories: config.enabledCategories.length,
        },
        capabilities: [
          'metadata_fix',
          'privacy_fix',
          'performance_analysis',
          'design_analysis',
          'technical_fix',
          'permissions_fix',
          'compliance_fix',
        ],
      });
    } catch (error) {
      return createErrorResponse(
        reply,
        error instanceof Error ? error : 'Health check failed',
        500,
        'HEALTH_CHECK_FAILED'
      );
    }
  });

  // ============================================================================
  // Analyze Rejection
  // ============================================================================

  /**
   * POST /api/v1/publishing/auto-fix/analyze
   * Analyze rejection from App Store or Play Store
   */
  fastify.post('/api/v1/publishing/auto-fix/analyze', async (request, reply) => {
    try {
      const validation = analyzeRejectionSchema.safeParse(request.body);

      if (!validation.success) {
        return createErrorResponse(
          reply,
          'Validation failed',
          400,
          'VALIDATION_ERROR',
          { errors: validation.error.errors }
        );
      }

      const { platform, projectId, appId, rejectionData } = validation.data;
      const service = getService();

      console.log(`[Auto-Fix] Analyzing ${platform} rejection for project ${projectId}...`);

      const rejection = await service.analyzeRejection(
        platform,
        rejectionData,
        projectId,
        appId
      );

      return createSuccessResponse(reply, {
        rejection,
        summary: {
          totalReasons: rejection.reasons.length,
          autoFixableCount: rejection.reasons.filter(r => r.autoFixable).length,
          categories: rejection.categories,
          estimatedFixTime: rejection.estimatedFixTime,
          confidence: rejection.confidence,
        },
      }, 200);

    } catch (error) {
      console.error('[Auto-Fix] Analysis failed:', error);
      return createErrorResponse(
        reply,
        error instanceof Error ? error : 'Analysis failed',
        500,
        'ANALYSIS_FAILED'
      );
    }
  });

  // ============================================================================
  // Generate Fixes
  // ============================================================================

  /**
   * POST /api/v1/publishing/auto-fix/generate
   * Generate fixes for analyzed rejection
   */
  fastify.post('/api/v1/publishing/auto-fix/generate', async (request, reply) => {
    try {
      const validation = generateFixSchema.safeParse(request.body);

      if (!validation.success) {
        return createErrorResponse(
          reply,
          'Validation failed',
          400,
          'VALIDATION_ERROR',
          { errors: validation.error.errors }
        );
      }

      const { rejectionId, projectId, projectPath } = validation.data;
      const service = getService();

      // Get the rejection
      const rejection = service.getRejection(rejectionId);
      if (!rejection) {
        return createErrorResponse(
          reply,
          'Rejection not found',
          404,
          'REJECTION_NOT_FOUND',
          { rejectionId }
        );
      }

      console.log(`[Auto-Fix] Generating fixes for rejection ${rejectionId}...`);

      const fixes = await service.generateFix(rejection, projectId, projectPath);

      return createSuccessResponse(reply, {
        fixes,
        summary: {
          totalFixes: fixes.length,
          autoApplicable: fixes.filter(f => f.strategy.type !== 'manual_required').length,
          manualRequired: fixes.filter(f => f.strategy.type === 'manual_required').length,
          totalChanges: fixes.reduce((sum, f) => sum + f.changes.length, 0),
          avgConfidence: fixes.reduce((sum, f) => sum + f.confidence, 0) / fixes.length || 0,
        },
      }, 200);

    } catch (error) {
      console.error('[Auto-Fix] Fix generation failed:', error);
      return createErrorResponse(
        reply,
        error instanceof Error ? error : 'Fix generation failed',
        500,
        'FIX_GENERATION_FAILED'
      );
    }
  });

  // ============================================================================
  // Apply Fixes
  // ============================================================================

  /**
   * POST /api/v1/publishing/auto-fix/apply
   * Apply a generated fix to the project
   */
  fastify.post('/api/v1/publishing/auto-fix/apply', async (request, reply) => {
    try {
      const validation = applyFixSchema.safeParse(request.body);

      if (!validation.success) {
        return createErrorResponse(
          reply,
          'Validation failed',
          400,
          'VALIDATION_ERROR',
          { errors: validation.error.errors }
        );
      }

      const { projectId, fixId, projectPath } = validation.data;
      const service = getService();

      // Find the fix across all rejections
      let targetFix: GeneratedFix | null = null;
      let rejectionId: string | null = null;

      // Search through all stored fixes
      const appliedFixes = service.getAppliedFixes(projectId);
      for (const applied of appliedFixes) {
        const fixes = service.getFixes(applied.rejectionId);
        const found = fixes.find(f => f.id === fixId);
        if (found) {
          targetFix = found;
          rejectionId = applied.rejectionId;
          break;
        }
      }

      // Also check by iterating rejections (in case no applied fixes yet)
      if (!targetFix) {
        // Try to find in generated fixes
        // This is a simplified approach - in production, you'd have a proper index
        const rejection = service.getRejection(fixId.split('-')[0]); // Heuristic
        if (rejection) {
          const fixes = service.getFixes(rejection.id);
          targetFix = fixes.find(f => f.id === fixId) || null;
          rejectionId = rejection.id;
        }
      }

      if (!targetFix) {
        return createErrorResponse(
          reply,
          'Fix not found',
          404,
          'FIX_NOT_FOUND',
          { fixId }
        );
      }

      console.log(`[Auto-Fix] Applying fix ${fixId} to project ${projectId}...`);

      const appliedFix = await service.applyFix(projectId, targetFix, projectPath);

      return createSuccessResponse(reply, {
        appliedFix,
        summary: {
          status: appliedFix.status,
          changesApplied: appliedFix.appliedChanges.filter(c => c.success).length,
          changesFailed: appliedFix.appliedChanges.filter(c => !c.success).length,
          errors: appliedFix.errors,
        },
      }, 200);

    } catch (error) {
      console.error('[Auto-Fix] Fix application failed:', error);
      return createErrorResponse(
        reply,
        error instanceof Error ? error : 'Fix application failed',
        500,
        'FIX_APPLICATION_FAILED'
      );
    }
  });

  // ============================================================================
  // Resubmit
  // ============================================================================

  /**
   * POST /api/v1/publishing/auto-fix/resubmit
   * Resubmit app after fixes are applied
   */
  fastify.post('/api/v1/publishing/auto-fix/resubmit', async (request, reply) => {
    try {
      const validation = resubmitSchema.safeParse(request.body);

      if (!validation.success) {
        return createErrorResponse(
          reply,
          'Validation failed',
          400,
          'VALIDATION_ERROR',
          { errors: validation.error.errors }
        );
      }

      const { platform, projectId, appId, buildInfo } = validation.data;
      const service = getService();

      console.log(`[Auto-Fix] Resubmitting ${platform} app for project ${projectId}...`);

      const result = await service.resubmit(platform, projectId, appId, buildInfo);

      if (result.success) {
        return createSuccessResponse(reply, {
          resubmitted: true,
          submissionId: result.submissionId,
          platform,
          appId,
        }, 200);
      } else {
        return createErrorResponse(
          reply,
          result.error || 'Resubmission failed',
          500,
          'RESUBMISSION_FAILED',
          { platform, appId }
        );
      }

    } catch (error) {
      console.error('[Auto-Fix] Resubmission failed:', error);
      return createErrorResponse(
        reply,
        error instanceof Error ? error : 'Resubmission failed',
        500,
        'RESUBMISSION_FAILED'
      );
    }
  });

  // ============================================================================
  // Run Full Auto-Fix Workflow
  // ============================================================================

  /**
   * POST /api/v1/publishing/auto-fix/run
   * Run the complete auto-fix workflow: analyze -> generate -> apply -> resubmit
   */
  fastify.post('/api/v1/publishing/auto-fix/run', async (request, reply) => {
    try {
      const validation = runAutoFixSchema.safeParse(request.body);

      if (!validation.success) {
        return createErrorResponse(
          reply,
          'Validation failed',
          400,
          'VALIDATION_ERROR',
          { errors: validation.error.errors }
        );
      }

      const { platform, projectId, appId, rejectionData, projectPath, buildInfo } = validation.data;
      const service = getService();

      console.log(`[Auto-Fix] Starting full auto-fix workflow for ${platform} project ${projectId}...`);

      const attempt = await service.runAutoFix(
        platform,
        rejectionData,
        projectId,
        appId,
        projectPath,
        buildInfo
      );

      return createSuccessResponse(reply, {
        attempt,
        summary: {
          status: attempt.status,
          attemptNumber: attempt.attemptNumber,
          fixesApplied: attempt.fixes.filter(f => f.status === 'completed' || f.status === 'resubmitted').length,
          fixesFailed: attempt.fixes.filter(f => f.status === 'failed').length,
          resubmitted: attempt.resubmitted,
          duration: attempt.completedAt && attempt.startedAt
            ? (attempt.completedAt.getTime() - attempt.startedAt.getTime()) / 1000
            : null,
        },
      }, 200);

    } catch (error) {
      console.error('[Auto-Fix] Auto-fix workflow failed:', error);
      return createErrorResponse(
        reply,
        error instanceof Error ? error : 'Auto-fix workflow failed',
        500,
        'AUTO_FIX_WORKFLOW_FAILED'
      );
    }
  });

  // ============================================================================
  // Get Fix History
  // ============================================================================

  /**
   * GET /api/v1/publishing/auto-fix/history/:projectId
   * Get fix attempt history for a project
   */
  fastify.get('/api/v1/publishing/auto-fix/history/:projectId', async (request, reply) => {
    try {
      const { projectId } = request.params as { projectId: string };
      const queryValidation = historyQuerySchema.safeParse(request.query);

      if (!queryValidation.success) {
        return createErrorResponse(
          reply,
          'Invalid query parameters',
          400,
          'VALIDATION_ERROR',
          { errors: queryValidation.error.errors }
        );
      }

      const { platform, limit, offset } = queryValidation.data;
      const service = getService();

      console.log(`[Auto-Fix] Getting fix history for project ${projectId}...`);

      const history = await service.getFixHistory(projectId, platform);

      // Apply pagination
      let attempts = history.attempts;
      if (offset) {
        attempts = attempts.slice(offset);
      }
      if (limit) {
        attempts = attempts.slice(0, limit);
      }

      return createSuccessResponse(reply, {
        ...history,
        attempts,
        pagination: {
          total: history.totalAttempts,
          limit: limit || history.totalAttempts,
          offset: offset || 0,
        },
      }, 200);

    } catch (error) {
      console.error('[Auto-Fix] Failed to get history:', error);
      return createErrorResponse(
        reply,
        error instanceof Error ? error : 'Failed to get history',
        500,
        'HISTORY_FETCH_FAILED'
      );
    }
  });

  // ============================================================================
  // Get Rejection Details
  // ============================================================================

  /**
   * GET /api/v1/publishing/auto-fix/rejection/:rejectionId
   * Get details of a specific rejection analysis
   */
  fastify.get('/api/v1/publishing/auto-fix/rejection/:rejectionId', async (request, reply) => {
    try {
      const { rejectionId } = request.params as { rejectionId: string };
      const service = getService();

      const rejection = service.getRejection(rejectionId);

      if (!rejection) {
        return createErrorResponse(
          reply,
          'Rejection not found',
          404,
          'REJECTION_NOT_FOUND',
          { rejectionId }
        );
      }

      const fixes = service.getFixes(rejectionId);

      return createSuccessResponse(reply, {
        rejection,
        fixes: {
          total: fixes.length,
          generated: fixes,
        },
      }, 200);

    } catch (error) {
      console.error('[Auto-Fix] Failed to get rejection:', error);
      return createErrorResponse(
        reply,
        error instanceof Error ? error : 'Failed to get rejection',
        500,
        'REJECTION_FETCH_FAILED'
      );
    }
  });

  // ============================================================================
  // Get Generated Fixes
  // ============================================================================

  /**
   * GET /api/v1/publishing/auto-fix/fixes/:rejectionId
   * Get all generated fixes for a rejection
   */
  fastify.get('/api/v1/publishing/auto-fix/fixes/:rejectionId', async (request, reply) => {
    try {
      const { rejectionId } = request.params as { rejectionId: string };
      const service = getService();

      const fixes = service.getFixes(rejectionId);

      if (fixes.length === 0) {
        const rejection = service.getRejection(rejectionId);
        if (!rejection) {
          return createErrorResponse(
            reply,
            'Rejection not found',
            404,
            'REJECTION_NOT_FOUND',
            { rejectionId }
          );
        }
      }

      return createSuccessResponse(reply, {
        fixes,
        summary: {
          total: fixes.length,
          byCategory: fixes.reduce((acc, fix) => {
            acc[fix.category] = (acc[fix.category] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
          byStrategy: fixes.reduce((acc, fix) => {
            acc[fix.strategy.type] = (acc[fix.strategy.type] || 0) + 1;
            return acc;
          }, {} as Record<string, number>),
        },
      }, 200);

    } catch (error) {
      console.error('[Auto-Fix] Failed to get fixes:', error);
      return createErrorResponse(
        reply,
        error instanceof Error ? error : 'Failed to get fixes',
        500,
        'FIXES_FETCH_FAILED'
      );
    }
  });

  // ============================================================================
  // Get Applied Fixes for Project
  // ============================================================================

  /**
   * GET /api/v1/publishing/auto-fix/applied/:projectId
   * Get all applied fixes for a project
   */
  fastify.get('/api/v1/publishing/auto-fix/applied/:projectId', async (request, reply) => {
    try {
      const { projectId } = request.params as { projectId: string };
      const service = getService();

      const appliedFixes = service.getAppliedFixes(projectId);

      return createSuccessResponse(reply, {
        appliedFixes,
        summary: {
          total: appliedFixes.length,
          completed: appliedFixes.filter(f => f.status === 'completed').length,
          failed: appliedFixes.filter(f => f.status === 'failed').length,
          resubmitted: appliedFixes.filter(f => f.status === 'resubmitted').length,
          pending: appliedFixes.filter(f => f.status === 'pending').length,
        },
      }, 200);

    } catch (error) {
      console.error('[Auto-Fix] Failed to get applied fixes:', error);
      return createErrorResponse(
        reply,
        error instanceof Error ? error : 'Failed to get applied fixes',
        500,
        'APPLIED_FIXES_FETCH_FAILED'
      );
    }
  });

  // ============================================================================
  // Get Configuration
  // ============================================================================

  /**
   * GET /api/v1/publishing/auto-fix/config
   * Get current auto-fix configuration
   */
  fastify.get('/api/v1/publishing/auto-fix/config', async (request, reply) => {
    try {
      const service = getService();
      const config = service.getConfig();

      return createSuccessResponse(reply, {
        config,
        defaults: {
          maxAttempts: 3,
          autoResubmit: true,
          requireApproval: false,
          notifyOnCompletion: true,
          notifyOnFailure: true,
        },
      }, 200);

    } catch (error) {
      console.error('[Auto-Fix] Failed to get config:', error);
      return createErrorResponse(
        reply,
        error instanceof Error ? error : 'Failed to get configuration',
        500,
        'CONFIG_FETCH_FAILED'
      );
    }
  });

  // ============================================================================
  // Update Configuration
  // ============================================================================

  /**
   * PATCH /api/v1/publishing/auto-fix/config
   * Update auto-fix configuration
   */
  fastify.patch('/api/v1/publishing/auto-fix/config', async (request, reply) => {
    try {
      const validation = configUpdateSchema.safeParse(request.body);

      if (!validation.success) {
        return createErrorResponse(
          reply,
          'Validation failed',
          400,
          'VALIDATION_ERROR',
          { errors: validation.error.errors }
        );
      }

      const service = getService();
      service.updateConfig(validation.data);
      const newConfig = service.getConfig();

      return createSuccessResponse(reply, {
        config: newConfig,
        updated: Object.keys(validation.data),
      }, 200);

    } catch (error) {
      console.error('[Auto-Fix] Failed to update config:', error);
      return createErrorResponse(
        reply,
        error instanceof Error ? error : 'Failed to update configuration',
        500,
        'CONFIG_UPDATE_FAILED'
      );
    }
  });

  // ============================================================================
  // Get Stats
  // ============================================================================

  /**
   * GET /api/v1/publishing/auto-fix/stats
   * Get overall auto-fix system statistics
   */
  fastify.get('/api/v1/publishing/auto-fix/stats', async (request, reply) => {
    try {
      const service = getService();

      // In a real implementation, these would come from a database
      // For now, we'll return placeholder stats
      const stats = {
        totalAnalyses: 0,
        totalFixesGenerated: 0,
        totalFixesApplied: 0,
        totalResubmissions: 0,
        successRate: 0,
        avgFixTime: 0,
        byCategorySuccess: {} as Record<string, { attempts: number; successes: number; rate: number }>,
        byPlatform: {
          ios: { analyses: 0, fixes: 0, successRate: 0 },
          android: { analyses: 0, fixes: 0, successRate: 0 },
        },
      };

      return createSuccessResponse(reply, { stats }, 200);

    } catch (error) {
      console.error('[Auto-Fix] Failed to get stats:', error);
      return createErrorResponse(
        reply,
        error instanceof Error ? error : 'Failed to get statistics',
        500,
        'STATS_FETCH_FAILED'
      );
    }
  });

  // ============================================================================
  // Webhook for Store Notifications
  // ============================================================================

  /**
   * POST /api/v1/publishing/auto-fix/webhook/:platform
   * Receive webhook notifications from App Store/Play Store
   * Automatically triggers analysis when rejection is detected
   */
  fastify.post('/api/v1/publishing/auto-fix/webhook/:platform', async (request, reply) => {
    try {
      const { platform } = request.params as { platform: string };

      if (platform !== 'ios' && platform !== 'android') {
        return createErrorResponse(
          reply,
          'Invalid platform',
          400,
          'INVALID_PLATFORM',
          { platform, valid: ['ios', 'android'] }
        );
      }

      const body = request.body as Record<string, any>;
      const service = getService();

      console.log(`[Auto-Fix] Received ${platform} webhook notification`);

      // Check if this is a rejection notification
      const isRejection = isRejectionNotification(platform as Platform, body);

      if (!isRejection) {
        return createSuccessResponse(reply, {
          acknowledged: true,
          action: 'ignored',
          reason: 'Not a rejection notification',
        }, 200);
      }

      // Extract project info from webhook (implementation depends on your webhook structure)
      const projectId = body.projectId || body.metadata?.projectId || 'unknown';
      const appId = body.appId || body.bundleId || body.packageName || 'unknown';

      // Trigger auto-fix workflow
      console.log(`[Auto-Fix] Rejection detected, triggering auto-fix for ${appId}...`);

      const attempt = await service.runAutoFix(
        platform as Platform,
        body,
        projectId,
        appId
      );

      return createSuccessResponse(reply, {
        acknowledged: true,
        action: 'auto_fix_triggered',
        attemptId: attempt.id,
        status: attempt.status,
      }, 200);

    } catch (error) {
      console.error('[Auto-Fix] Webhook processing failed:', error);
      return createErrorResponse(
        reply,
        error instanceof Error ? error : 'Webhook processing failed',
        500,
        'WEBHOOK_PROCESSING_FAILED'
      );
    }
  });
}

// Helper function to detect rejection notifications
function isRejectionNotification(platform: Platform, body: Record<string, any>): boolean {
  if (platform === 'ios') {
    // Check for Apple rejection indicators
    const state = body.appStoreState || body.state || body.status;
    return ['REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY'].includes(state?.toUpperCase?.());
  } else {
    // Check for Google rejection indicators
    const status = body.reviewResult || body.status || body.state;
    return status === 'REJECTED' || status === 'rejected' || body.rejected === true;
  }
}

export default autoFixRoutes;

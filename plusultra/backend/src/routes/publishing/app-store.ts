import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import {
  AppleAppStoreService,
  createAppleAppStoreService,
  ReviewSubmission,
  RejectionInfo,
  SubmissionHistory,
  AppMetadata,
  RejectionReason,
} from '../../services/publishing/AppleAppStoreService';

// ============================================================================
// Request/Response Types
// ============================================================================

interface SubmitForReviewRequest {
  appId: string;
  buildId: string;
  versionString: string;
  releaseType?: 'MANUAL' | 'AFTER_APPROVAL' | 'SCHEDULED';
  scheduledReleaseDate?: string;
}

interface UpdateMetadataRequest {
  appId: string;
  metadata: {
    name?: string;
    subtitle?: string;
    description: string;
    keywords?: string;
    whatsNew?: string;
    promotionalText?: string;
    marketingUrl?: string;
    supportUrl?: string;
    privacyPolicyUrl?: string;
    privacyChoicesUrl?: string;
    locale?: string;
  };
}

interface GetStatusParams {
  appId: string;
}

interface GetHistoryParams {
  appId: string;
}

interface GetRejectionParams {
  appId: string;
  versionId?: string;
}

interface CancelSubmissionParams {
  submissionId: string;
}

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

  console.error(`[${timestamp}] [${requestId}] App Store API Error:`, errorMessage);
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
// Validation Schemas
// ============================================================================

const submitForReviewSchema = z.object({
  appId: z.string().min(1, 'appId is required'),
  buildId: z.string().min(1, 'buildId is required'),
  versionString: z.string().regex(/^\d+\.\d+(\.\d+)?$/, 'Invalid version format (e.g., 1.0.0)'),
  releaseType: z.enum(['MANUAL', 'AFTER_APPROVAL', 'SCHEDULED']).optional(),
  scheduledReleaseDate: z.string().datetime().optional(),
});

const updateMetadataSchema = z.object({
  appId: z.string().min(1, 'appId is required'),
  metadata: z.object({
    name: z.string().max(30).optional(),
    subtitle: z.string().max(30).optional(),
    description: z.string().min(10).max(4000),
    keywords: z.string().max(100).optional(),
    whatsNew: z.string().max(4000).optional(),
    promotionalText: z.string().max(170).optional(),
    marketingUrl: z.string().url().optional(),
    supportUrl: z.string().url().optional(),
    privacyPolicyUrl: z.string().url().optional(),
    privacyChoicesUrl: z.string().url().optional(),
    locale: z.string().regex(/^[a-z]{2}-[A-Z]{2}$/).optional(),
  }),
});

const appIdParamSchema = z.object({
  appId: z.string().min(1),
});

const rejectionParamsSchema = z.object({
  appId: z.string().min(1),
  versionId: z.string().optional(),
});

const submissionIdParamSchema = z.object({
  submissionId: z.string().min(1),
});

// ============================================================================
// Routes
// ============================================================================

export async function appStoreRoutes(fastify: FastifyInstance) {
  // Create service instance (singleton per server lifecycle)
  let appStoreService: AppleAppStoreService | null = null;

  const getService = (): AppleAppStoreService => {
    if (!appStoreService) {
      try {
        appStoreService = createAppleAppStoreService();
      } catch (error) {
        throw new Error(
          `App Store service not configured: ${error instanceof Error ? error.message : 'Missing credentials'}`
        );
      }
    }
    return appStoreService;
  };

  // ============================================================================
  // Health Check
  // ============================================================================

  /**
   * GET /api/v1/publishing/app-store/health
   * Check if App Store Connect API is accessible
   */
  fastify.get('/api/v1/publishing/app-store/health', async (request, reply) => {
    try {
      const service = getService();
      const health = await service.healthCheck();

      if (health.healthy) {
        return createSuccessResponse(reply, {
          status: 'healthy',
          message: health.message,
          service: 'App Store Connect API',
        });
      } else {
        return createErrorResponse(
          reply,
          health.message,
          503,
          'SERVICE_UNAVAILABLE'
        );
      }
    } catch (error) {
      return createErrorResponse(
        reply,
        error instanceof Error ? error : new Error('Health check failed'),
        503,
        'SERVICE_NOT_CONFIGURED'
      );
    }
  });

  // ============================================================================
  // Submit for Review
  // ============================================================================

  /**
   * POST /api/v1/publishing/app-store/submit
   * Submit an app build for App Store review
   */
  fastify.post<{ Body: SubmitForReviewRequest }>(
    '/api/v1/publishing/app-store/submit',
    {
      schema: {
        body: submitForReviewSchema,
      },
    },
    async (request, reply) => {
      try {
        const { appId, buildId, versionString, releaseType, scheduledReleaseDate } = request.body;

        const service = getService();

        const submission = await service.submitForReview(appId, {
          buildId,
          versionString,
          releaseType,
          scheduledReleaseDate: scheduledReleaseDate ? new Date(scheduledReleaseDate) : undefined,
        });

        return createSuccessResponse(reply, {
          submissionId: submission.submissionId,
          status: submission.status,
          appVersionId: submission.appVersionId,
          submittedAt: submission.submittedAt.toISOString(),
          reviewDetails: submission.reviewDetails,
          message: 'App successfully submitted for review. Review typically takes 24-48 hours.',
        }, 201);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Submission failed';

        // Check for specific error types
        if (errorMessage.includes('CONFLICT')) {
          return createErrorResponse(
            reply,
            'A submission is already pending for this version',
            409,
            'SUBMISSION_CONFLICT'
          );
        }

        if (errorMessage.includes('NOT_FOUND')) {
          return createErrorResponse(
            reply,
            'App or build not found',
            404,
            'RESOURCE_NOT_FOUND'
          );
        }

        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Submission failed'),
          400,
          'SUBMISSION_FAILED'
        );
      }
    }
  );

  // ============================================================================
  // Get Review Status
  // ============================================================================

  /**
   * GET /api/v1/publishing/app-store/status/:appId
   * Get the current review status for an app
   */
  fastify.get<{ Params: GetStatusParams }>(
    '/api/v1/publishing/app-store/status/:appId',
    {
      schema: {
        params: appIdParamSchema,
      },
    },
    async (request, reply) => {
      try {
        const { appId } = request.params;

        const service = getService();
        const status = await service.getReviewStatus(appId);

        return createSuccessResponse(reply, {
          appId,
          reviewStatus: status.status,
          appStoreState: status.appStoreState,
          version: status.version ? {
            id: status.version.id,
            versionString: status.version.versionString,
            platform: status.version.platform,
            releaseType: status.version.releaseType,
          } : null,
          lastUpdated: status.lastUpdated.toISOString(),
          statusDescription: getStatusDescription(status.status),
        });

      } catch (error) {
        if ((error as any)?.code === 'NOT_FOUND') {
          return createErrorResponse(
            reply,
            'App not found',
            404,
            'APP_NOT_FOUND'
          );
        }

        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to get status'),
          500,
          'STATUS_FETCH_FAILED'
        );
      }
    }
  );

  // ============================================================================
  // Get Rejection Reasons
  // ============================================================================

  /**
   * GET /api/v1/publishing/app-store/rejection/:appId
   * Get rejection reasons with TCI auto-fix recommendations
   */
  fastify.get<{ Params: GetRejectionParams; Querystring: { versionId?: string } }>(
    '/api/v1/publishing/app-store/rejection/:appId',
    {
      schema: {
        params: z.object({ appId: z.string().min(1) }),
        querystring: z.object({ versionId: z.string().optional() }),
      },
    },
    async (request, reply) => {
      try {
        const { appId } = request.params;
        const { versionId } = request.query;

        const service = getService();
        const rejectionInfo = await service.parseRejectionReasons(appId, versionId);

        if (!rejectionInfo.rejected) {
          return createSuccessResponse(reply, {
            appId,
            rejected: false,
            message: 'App has not been rejected',
          });
        }

        // Transform rejection reasons for TCI consumption
        const tciReasons = rejectionInfo.reasons.map((reason) => ({
          id: reason.id,
          category: reason.category,
          guidelineCode: reason.guidelineCode,
          guidelineTitle: reason.guidelineTitle,
          message: reason.message,
          severity: reason.severity,
          affectedArea: reason.affectedArea,
          tciAutoFixable: reason.tciAutoFixable,
          fixStrategy: reason.tciFixStrategy ? {
            type: reason.tciFixStrategy.type,
            confidence: reason.tciFixStrategy.confidence,
            estimatedTimeMinutes: reason.tciFixStrategy.estimatedTime,
            requiredActions: reason.tciFixStrategy.requiredActions,
            recommendedAI: reason.tciFixStrategy.aiModelRecommendation,
          } : null,
        }));

        const autoFixableCount = rejectionInfo.reasons.filter((r) => r.tciAutoFixable).length;

        return createSuccessResponse(reply, {
          appId,
          rejected: true,
          rejectionType: rejectionInfo.rejectionType,
          totalIssues: rejectionInfo.reasons.length,
          autoFixableIssues: autoFixableCount,
          manualReviewRequired: rejectionInfo.reasons.length - autoFixableCount,
          reasons: tciReasons,
          reviewerNotes: rejectionInfo.reviewerNotes,
          resolutionUrl: rejectionInfo.resolutionUrl,
          canResubmit: rejectionInfo.canResubmit,
          tciRecommendation: autoFixableCount > 0
            ? `TCI can automatically fix ${autoFixableCount} of ${rejectionInfo.reasons.length} issues. Estimated time: ${calculateEstimatedTime(rejectionInfo.reasons)} minutes.`
            : 'Manual review required for all issues.',
        });

      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to get rejection reasons'),
          500,
          'REJECTION_FETCH_FAILED'
        );
      }
    }
  );

  // ============================================================================
  // Get Submission History
  // ============================================================================

  /**
   * GET /api/v1/publishing/app-store/history/:appId
   * Get submission history for an app
   */
  fastify.get<{ Params: GetHistoryParams }>(
    '/api/v1/publishing/app-store/history/:appId',
    {
      schema: {
        params: appIdParamSchema,
      },
    },
    async (request, reply) => {
      try {
        const { appId } = request.params;

        const service = getService();
        const history = await service.getSubmissionHistory(appId);

        return createSuccessResponse(reply, {
          appId: history.appId,
          totalSubmissions: history.totalSubmissions,
          approvalRate: Math.round(history.approvalRate * 100),
          averageReviewTimeHours: Math.round(history.averageReviewTime),
          submissions: history.submissions.map((sub) => ({
            submissionId: sub.submissionId,
            versionString: sub.versionString,
            buildNumber: sub.buildNumber,
            submittedAt: sub.submittedAt.toISOString(),
            reviewedAt: sub.reviewedAt?.toISOString(),
            status: sub.status,
            statusDescription: getStatusDescription(sub.status),
            reviewDurationHours: sub.reviewDurationHours,
            iterationNumber: sub.iterationNumber,
            rejectionCount: sub.rejectionReasons?.length || 0,
          })),
          insights: generateInsights(history),
        });

      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to get history'),
          500,
          'HISTORY_FETCH_FAILED'
        );
      }
    }
  );

  // ============================================================================
  // Update App Metadata
  // ============================================================================

  /**
   * PUT /api/v1/publishing/app-store/metadata
   * Update app metadata (description, keywords, etc.)
   */
  fastify.put<{ Body: UpdateMetadataRequest }>(
    '/api/v1/publishing/app-store/metadata',
    {
      schema: {
        body: updateMetadataSchema,
      },
    },
    async (request, reply) => {
      try {
        const { appId, metadata } = request.body;

        const service = getService();
        await service.updateAppMetadata(appId, metadata as AppMetadata);

        return createSuccessResponse(reply, {
          appId,
          updated: true,
          metadata: {
            locale: metadata.locale || 'en-US',
            fieldsUpdated: Object.keys(metadata).filter((k) => k !== 'locale' && metadata[k as keyof typeof metadata]),
          },
          message: 'Metadata updated successfully',
        });

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Metadata update failed';

        if (errorMessage.includes('No editable app version')) {
          return createErrorResponse(
            reply,
            'No editable version found. Create a new version before updating metadata.',
            400,
            'NO_EDITABLE_VERSION'
          );
        }

        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Metadata update failed'),
          400,
          'METADATA_UPDATE_FAILED'
        );
      }
    }
  );

  // ============================================================================
  // Cancel Submission
  // ============================================================================

  /**
   * DELETE /api/v1/publishing/app-store/submission/:submissionId
   * Cancel a pending submission
   */
  fastify.delete<{ Params: CancelSubmissionParams }>(
    '/api/v1/publishing/app-store/submission/:submissionId',
    {
      schema: {
        params: submissionIdParamSchema,
      },
    },
    async (request, reply) => {
      try {
        const { submissionId } = request.params;

        const service = getService();
        await service.cancelSubmission(submissionId);

        return createSuccessResponse(reply, {
          submissionId,
          cancelled: true,
          message: 'Submission cancelled successfully',
        });

      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to cancel submission'),
          400,
          'CANCELLATION_FAILED'
        );
      }
    }
  );

  // ============================================================================
  // Get Builds
  // ============================================================================

  /**
   * GET /api/v1/publishing/app-store/builds/:appId
   * Get available builds for an app
   */
  fastify.get<{ Params: GetStatusParams; Querystring: { limit?: number } }>(
    '/api/v1/publishing/app-store/builds/:appId',
    {
      schema: {
        params: appIdParamSchema,
        querystring: z.object({ limit: z.coerce.number().min(1).max(50).optional() }),
      },
    },
    async (request, reply) => {
      try {
        const { appId } = request.params;
        const limit = request.query.limit || 10;

        const service = getService();
        const builds = await service.getBuilds(appId, limit);

        return createSuccessResponse(reply, {
          appId,
          totalBuilds: builds.length,
          builds: builds.map((build) => ({
            id: build.id,
            version: build.version,
            buildNumber: build.buildNumber,
            uploadedDate: build.uploadedDate,
            processingState: build.processingState,
            isReady: build.processingState === 'VALID',
            usesNonExemptEncryption: build.usesNonExemptEncryption,
            minOsVersion: build.minOsVersion,
          })),
        });

      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to get builds'),
          500,
          'BUILDS_FETCH_FAILED'
        );
      }
    }
  );

  // ============================================================================
  // Lookup App by Bundle ID
  // ============================================================================

  /**
   * GET /api/v1/publishing/app-store/lookup
   * Look up an app by bundle ID
   */
  fastify.get<{ Querystring: { bundleId: string } }>(
    '/api/v1/publishing/app-store/lookup',
    {
      schema: {
        querystring: z.object({ bundleId: z.string().min(1) }),
      },
    },
    async (request, reply) => {
      try {
        const { bundleId } = request.query;

        const service = getService();
        const app = await service.getAppByBundleId(bundleId);

        if (!app) {
          return createErrorResponse(
            reply,
            `No app found with bundle ID: ${bundleId}`,
            404,
            'APP_NOT_FOUND'
          );
        }

        return createSuccessResponse(reply, {
          found: true,
          app: {
            id: app.id,
            name: app.name,
            bundleId: app.bundleId,
            sku: app.sku,
            primaryLocale: app.primaryLocale,
          },
        });

      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Lookup failed'),
          500,
          'LOOKUP_FAILED'
        );
      }
    }
  );
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Get human-readable status description
 */
function getStatusDescription(status: string): string {
  const descriptions: Record<string, string> = {
    'submitted': 'App has been submitted and is waiting for review',
    'waiting_for_review': 'App is in the review queue',
    'in_review': 'App is currently being reviewed by Apple',
    'pending_developer_release': 'App approved, waiting for developer to release',
    'approved': 'App has been approved and is live on the App Store',
    'rejected': 'App was rejected - see rejection reasons for details',
    'metadata_rejected': 'App metadata was rejected - update required',
    'invalid_binary': 'App binary is invalid - rebuild and resubmit required',
    'processing': 'App is being processed',
  };

  return descriptions[status] || 'Status unknown';
}

/**
 * Calculate estimated time to fix all auto-fixable issues
 */
function calculateEstimatedTime(reasons: RejectionReason[]): number {
  return reasons
    .filter((r) => r.tciAutoFixable && r.tciFixStrategy)
    .reduce((total, r) => total + (r.tciFixStrategy?.estimatedTime || 0), 0);
}

/**
 * Generate insights from submission history
 */
function generateInsights(history: SubmissionHistory): {
  trend: string;
  recommendations: string[];
  averageIterationsToApproval: number;
} {
  const recommendations: string[] = [];

  // Analyze approval rate
  if (history.approvalRate < 0.5) {
    recommendations.push('Consider reviewing Apple\'s App Review Guidelines before submission');
    recommendations.push('Use TCI to pre-validate app compliance');
  }

  // Analyze review time
  if (history.averageReviewTime > 48) {
    recommendations.push('Review times are above average - ensure all metadata is complete');
  }

  // Calculate average iterations
  const approvedSubmissions = history.submissions.filter((s) => s.status === 'approved');
  const averageIterations = approvedSubmissions.length > 0
    ? approvedSubmissions.reduce((sum, s) => sum + s.iterationNumber, 0) / approvedSubmissions.length
    : 1;

  // Determine trend
  let trend = 'stable';
  if (history.submissions.length >= 3) {
    const recentSubmissions = history.submissions.slice(0, 3);
    const recentApprovalRate = recentSubmissions.filter((s) => s.status === 'approved').length / 3;

    if (recentApprovalRate > history.approvalRate) {
      trend = 'improving';
    } else if (recentApprovalRate < history.approvalRate) {
      trend = 'declining';
      recommendations.push('Recent submissions have lower approval rate - review rejection patterns');
    }
  }

  return {
    trend,
    recommendations,
    averageIterationsToApproval: Math.round(averageIterations * 10) / 10,
  };
}

export default appStoreRoutes;

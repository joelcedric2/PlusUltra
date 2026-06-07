import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import {
  GooglePlayStoreService,
  TrackType,
  RolloutPercentage,
  SubmissionResult,
  ReviewStatusResult,
  RejectionResult,
  RolloutUpdateResult,
  SubmissionHistory,
} from '../../services/publishing/GooglePlayStoreService';

// ================================
// Request/Response Types
// ================================

interface SubmitForReviewRequest {
  packageName: string;
  track: TrackType;
  versionCode: number;
  releaseNotes?: Array<{ language: string; text: string }>;
  rolloutPercentage?: RolloutPercentage;
  releaseName?: string;
}

interface GetReviewStatusRequest {
  packageName: string;
}

interface ParseRejectionRequest {
  packageName?: string;
  response: any;
}

interface UpdateRolloutRequest {
  packageName: string;
  percentage: RolloutPercentage;
}

interface HaltRolloutRequest {
  packageName: string;
}

interface GetHistoryRequest {
  packageName: string;
  limit?: number;
  track?: TrackType;
  includeRejections?: boolean;
}

interface ErrorResponse {
  success: false;
  error: string;
  code: string;
  requestId: string;
  timestamp: string;
  details?: any;
}

interface SuccessResponse<T = any> {
  success: true;
  data: T;
  requestId: string;
  timestamp: string;
}

// ================================
// Helper Functions
// ================================

const createErrorResponse = (
  reply: FastifyReply,
  error: Error | string,
  statusCode: number = 500,
  code: string = 'INTERNAL_SERVER_ERROR',
  details?: any
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
    details,
  };

  console.error(`[${timestamp}] [${requestId}] [${code}] Error:`, errorMessage);

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

// ================================
// Service Instance
// ================================

let playStoreService: GooglePlayStoreService | null = null;

const getPlayStoreService = (): GooglePlayStoreService => {
  if (!playStoreService) {
    try {
      playStoreService = GooglePlayStoreService.fromEnv();
    } catch (error) {
      throw new Error(
        'Google Play Store service not configured. Set GOOGLE_SERVICE_ACCOUNT_KEY environment variable.'
      );
    }
  }
  return playStoreService;
};

// ================================
// Schema Definitions
// ================================

const trackSchema = z.enum(['internal', 'alpha', 'beta', 'production']);
const rolloutPercentageSchema = z.union([
  z.literal(1),
  z.literal(5),
  z.literal(10),
  z.literal(20),
  z.literal(50),
  z.literal(100),
]);

const releaseNoteSchema = z.object({
  language: z.string().min(2).max(10),
  text: z.string().min(1).max(500),
});

const submitForReviewSchema = z.object({
  packageName: z.string().min(1).regex(/^[a-z][a-z0-9_]*(\.[a-z0-9_]+)+$/i, {
    message: 'Invalid package name format (e.g., com.company.app)',
  }),
  track: trackSchema,
  versionCode: z.number().int().positive(),
  releaseNotes: z.array(releaseNoteSchema).optional(),
  rolloutPercentage: rolloutPercentageSchema.optional(),
  releaseName: z.string().max(50).optional(),
});

const getReviewStatusSchema = z.object({
  packageName: z.string().min(1),
});

const parseRejectionSchema = z.object({
  packageName: z.string().optional(),
  response: z.any(),
});

const updateRolloutSchema = z.object({
  packageName: z.string().min(1),
  percentage: rolloutPercentageSchema,
});

const haltRolloutSchema = z.object({
  packageName: z.string().min(1),
});

const getHistorySchema = z.object({
  packageName: z.string().min(1),
  limit: z.number().int().positive().max(100).optional(),
  track: trackSchema.optional(),
  includeRejections: z.boolean().optional(),
});

// ================================
// Route Handler
// ================================

export async function playStoreRoutes(fastify: FastifyInstance): Promise<void> {
  // ================================
  // Health Check
  // ================================

  /**
   * GET /api/v1/publishing/play-store/health
   * Check if Play Store service is configured and operational
   */
  fastify.get(
    '/api/v1/publishing/play-store/health',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

        if (!serviceAccountKey) {
          return createSuccessResponse(reply, {
            configured: false,
            status: 'not_configured',
            message: 'GOOGLE_SERVICE_ACCOUNT_KEY environment variable not set',
          });
        }

        const validation = GooglePlayStoreService.validateServiceAccountKey(serviceAccountKey);

        if (!validation.valid) {
          return createSuccessResponse(reply, {
            configured: false,
            status: 'invalid_credentials',
            message: validation.error,
          });
        }

        return createSuccessResponse(reply, {
          configured: true,
          status: 'operational',
          message: 'Google Play Store service is ready',
        });
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Health check failed'),
          500,
          'HEALTH_CHECK_FAILED'
        );
      }
    }
  );

  // ================================
  // Submit for Review
  // ================================

  /**
   * POST /api/v1/publishing/play-store/submit
   * Submit an app version for review on a specific track
   */
  fastify.post<{ Body: SubmitForReviewRequest }>(
    '/api/v1/publishing/play-store/submit',
    {
      schema: {
        body: submitForReviewSchema,
      },
    },
    async (request: FastifyRequest<{ Body: SubmitForReviewRequest }>, reply: FastifyReply) => {
      try {
        const service = getPlayStoreService();
        const { packageName, track, versionCode, releaseNotes, rolloutPercentage, releaseName } =
          request.body;

        const result: SubmissionResult = await service.submitForReview(
          packageName,
          track,
          versionCode,
          {
            releaseNotes,
            rolloutPercentage,
            releaseName,
          }
        );

        return createSuccessResponse(reply, {
          ...result,
          message: `Successfully submitted version ${versionCode} to ${track} track`,
          nextSteps: getNextSteps(track, rolloutPercentage),
        }, 201);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Submission failed';

        // Check for specific error types
        if (errorMessage.includes('Authentication')) {
          return createErrorResponse(reply, error as Error, 401, 'AUTH_FAILED');
        }

        if (errorMessage.includes('not found')) {
          return createErrorResponse(reply, error as Error, 404, 'PACKAGE_NOT_FOUND');
        }

        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error(errorMessage),
          400,
          'SUBMISSION_FAILED'
        );
      }
    }
  );

  // ================================
  // Get Review Status
  // ================================

  /**
   * GET /api/v1/publishing/play-store/status/:packageName
   * Get current review/rollout status for a package
   */
  fastify.get<{ Params: { packageName: string } }>(
    '/api/v1/publishing/play-store/status/:packageName',
    {
      schema: {
        params: getReviewStatusSchema,
      },
    },
    async (
      request: FastifyRequest<{ Params: { packageName: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const service = getPlayStoreService();
        const { packageName } = request.params;

        const result: ReviewStatusResult = await service.getReviewStatus(packageName);

        return createSuccessResponse(reply, {
          ...result,
          statusDescription: getStatusDescription(result.status),
        });
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to get status'),
          400,
          'STATUS_FETCH_FAILED'
        );
      }
    }
  );

  // ================================
  // Parse Rejection Reasons
  // ================================

  /**
   * POST /api/v1/publishing/play-store/parse-rejection
   * Parse rejection response and extract policy violations for TCI auto-fix
   */
  fastify.post<{ Body: ParseRejectionRequest }>(
    '/api/v1/publishing/play-store/parse-rejection',
    {
      schema: {
        body: parseRejectionSchema,
      },
    },
    async (request: FastifyRequest<{ Body: ParseRejectionRequest }>, reply: FastifyReply) => {
      try {
        const service = getPlayStoreService();
        const { packageName, response } = request.body;

        const result: RejectionResult = service.parseRejectionReasons(response, packageName);

        return createSuccessResponse(reply, {
          ...result,
          summary: {
            totalViolations: result.violations.length,
            autoFixable: result.violations.filter(v => v.autoFixable).length,
            requiresManualReview: result.violations.filter(v => !v.autoFixable).length,
            categories: Array.from(new Set(result.violations.map(v => v.category))),
          },
        });
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to parse rejection'),
          400,
          'PARSE_REJECTION_FAILED'
        );
      }
    }
  );

  // ================================
  // Update Rollout Percentage
  // ================================

  /**
   * POST /api/v1/publishing/play-store/rollout/update
   * Update staged rollout percentage (1%, 5%, 10%, 20%, 50%, 100%)
   */
  fastify.post<{ Body: UpdateRolloutRequest }>(
    '/api/v1/publishing/play-store/rollout/update',
    {
      schema: {
        body: updateRolloutSchema,
      },
    },
    async (request: FastifyRequest<{ Body: UpdateRolloutRequest }>, reply: FastifyReply) => {
      try {
        const service = getPlayStoreService();
        const { packageName, percentage } = request.body;

        const result: RolloutUpdateResult = await service.updateRollout(packageName, percentage);

        return createSuccessResponse(reply, {
          ...result,
          message: `Rollout updated from ${result.previousPercentage}% to ${result.newPercentage}%`,
          isFullRollout: result.newPercentage === 100,
        });
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to update rollout'),
          400,
          'ROLLOUT_UPDATE_FAILED'
        );
      }
    }
  );

  // ================================
  // Halt Rollout
  // ================================

  /**
   * POST /api/v1/publishing/play-store/rollout/halt
   * Halt an active staged rollout
   */
  fastify.post<{ Body: HaltRolloutRequest }>(
    '/api/v1/publishing/play-store/rollout/halt',
    {
      schema: {
        body: haltRolloutSchema,
      },
    },
    async (request: FastifyRequest<{ Body: HaltRolloutRequest }>, reply: FastifyReply) => {
      try {
        const service = getPlayStoreService();
        const { packageName } = request.body;

        const result: RolloutUpdateResult = await service.haltRollout(packageName);

        return createSuccessResponse(reply, {
          ...result,
          message: 'Rollout has been halted. Users who already have the update will keep it.',
          recommendation: 'Fix any issues and resume with updateRollout, or abandon this release.',
        });
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to halt rollout'),
          400,
          'ROLLOUT_HALT_FAILED'
        );
      }
    }
  );

  // ================================
  // Get Submission History
  // ================================

  /**
   * GET /api/v1/publishing/play-store/history/:packageName
   * Get submission history for a package
   */
  fastify.get<{
    Params: { packageName: string };
    Querystring: { limit?: string; track?: TrackType; includeRejections?: string };
  }>(
    '/api/v1/publishing/play-store/history/:packageName',
    {
      schema: {
        params: z.object({ packageName: z.string().min(1) }),
        querystring: z.object({
          limit: z.string().optional(),
          track: trackSchema.optional(),
          includeRejections: z.string().optional(),
        }),
      },
    },
    async (
      request: FastifyRequest<{
        Params: { packageName: string };
        Querystring: { limit?: string; track?: TrackType; includeRejections?: string };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const service = getPlayStoreService();
        const { packageName } = request.params;
        const { limit, track, includeRejections } = request.query;

        const result: SubmissionHistory = await service.getSubmissionHistory(packageName, {
          limit: limit ? parseInt(limit, 10) : undefined,
          track,
          includeRejections: includeRejections === 'true',
        });

        return createSuccessResponse(reply, {
          ...result,
          insights: generateHistoryInsights(result),
        });
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to get history'),
          400,
          'HISTORY_FETCH_FAILED'
        );
      }
    }
  );

  // ================================
  // Validate Service Account Key
  // ================================

  /**
   * POST /api/v1/publishing/play-store/validate-credentials
   * Validate a service account key format (does not test actual API access)
   */
  fastify.post<{ Body: { serviceAccountKey: string } }>(
    '/api/v1/publishing/play-store/validate-credentials',
    {
      schema: {
        body: z.object({
          serviceAccountKey: z.string().min(1),
        }),
      },
    },
    async (
      request: FastifyRequest<{ Body: { serviceAccountKey: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { serviceAccountKey } = request.body;
        const validation = GooglePlayStoreService.validateServiceAccountKey(serviceAccountKey);

        return createSuccessResponse(reply, {
          valid: validation.valid,
          error: validation.error,
          message: validation.valid
            ? 'Service account key format is valid'
            : `Invalid key: ${validation.error}`,
        });
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Validation failed'),
          400,
          'VALIDATION_FAILED'
        );
      }
    }
  );

  // ================================
  // Staged Rollout Recommendations
  // ================================

  /**
   * GET /api/v1/publishing/play-store/rollout/recommendations/:packageName
   * Get AI-powered rollout recommendations based on history and current metrics
   */
  fastify.get<{ Params: { packageName: string } }>(
    '/api/v1/publishing/play-store/rollout/recommendations/:packageName',
    {
      schema: {
        params: z.object({ packageName: z.string().min(1) }),
      },
    },
    async (
      request: FastifyRequest<{ Params: { packageName: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const service = getPlayStoreService();
        const { packageName } = request.params;

        const history = await service.getSubmissionHistory(packageName, { limit: 10 });
        const recommendations = generateRolloutRecommendations(history);

        return createSuccessResponse(reply, recommendations);
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to generate recommendations'),
          400,
          'RECOMMENDATIONS_FAILED'
        );
      }
    }
  );
}

// ================================
// Helper Functions
// ================================

function getNextSteps(track: TrackType, rolloutPercentage?: number): string[] {
  const steps: string[] = [];

  switch (track) {
    case 'internal':
      steps.push('Share internal testing link with your team');
      steps.push('Gather feedback before promoting to alpha/beta');
      break;
    case 'alpha':
      steps.push('Monitor crash reports and feedback');
      steps.push('Promote to beta when ready for wider testing');
      break;
    case 'beta':
      steps.push('Monitor user feedback and crash-free rate');
      steps.push('Consider staged rollout when promoting to production');
      break;
    case 'production':
      if (rolloutPercentage && rolloutPercentage < 100) {
        steps.push(`Monitor metrics during ${rolloutPercentage}% rollout`);
        steps.push('Increase rollout percentage gradually if metrics are good');
        steps.push('Watch for crash spikes or negative reviews');
      } else {
        steps.push('Monitor crash-free rate and user reviews');
        steps.push('Be ready to halt rollout if issues arise');
      }
      break;
  }

  return steps;
}

function getStatusDescription(status: string): string {
  const descriptions: Record<string, string> = {
    pending: 'Submission is pending and waiting to be processed',
    inReview: 'App is currently being reviewed by Google Play team',
    approved: 'App has been approved and is live on the store',
    rejected: 'App was rejected. Check violations for details.',
    pendingDeveloper: 'Action required from developer (e.g., rollout halted)',
    unknown: 'Unable to determine current status',
  };

  return descriptions[status] || descriptions.unknown;
}

function generateHistoryInsights(history: SubmissionHistory): {
  trend: 'improving' | 'stable' | 'declining';
  recentIssues: string[];
  recommendations: string[];
} {
  const recentEntries = history.entries.slice(-5);
  const rejections = recentEntries.filter(e => e.rejectionDetails?.rejected);
  const successfulRecent = recentEntries.filter(
    e => e.status === 'completed' || e.status === 'approved'
  );

  let trend: 'improving' | 'stable' | 'declining' = 'stable';
  if (history.successRate > 90) trend = 'improving';
  else if (history.successRate < 70) trend = 'declining';

  const recentIssues: string[] = [];
  for (const entry of rejections) {
    if (entry.rejectionDetails?.violations) {
      for (const v of entry.rejectionDetails.violations) {
        if (!recentIssues.includes(v.category)) {
          recentIssues.push(v.category);
        }
      }
    }
  }

  const recommendations: string[] = [];
  if (trend === 'declining') {
    recommendations.push('Consider implementing pre-submission policy checks');
    recommendations.push('Review recent rejection patterns to identify recurring issues');
  }
  if (history.averageReviewTime > 72) {
    recommendations.push('Submit during weekdays for faster review times');
  }
  if (rejections.length > 0) {
    recommendations.push('Use TCI auto-fix to address common policy violations');
  }

  return { trend, recentIssues, recommendations };
}

function generateRolloutRecommendations(history: SubmissionHistory): {
  recommendedStrategy: 'aggressive' | 'moderate' | 'conservative';
  suggestedPercentages: RolloutPercentage[];
  reasoning: string;
  riskLevel: 'low' | 'medium' | 'high';
  waitTimeBetweenStages: string;
} {
  const successRate = history.successRate;
  const recentRejections = history.entries
    .slice(-3)
    .filter(e => e.rejectionDetails?.rejected).length;

  let strategy: 'aggressive' | 'moderate' | 'conservative' = 'moderate';
  let percentages: RolloutPercentage[] = [5, 20, 50, 100];
  let riskLevel: 'low' | 'medium' | 'high' = 'medium';
  let reasoning = '';
  let waitTime = '24-48 hours';

  if (successRate >= 95 && recentRejections === 0) {
    strategy = 'aggressive';
    percentages = [10, 50, 100];
    riskLevel = 'low';
    reasoning =
      'Strong track record with no recent rejections. Safe to use aggressive rollout.';
    waitTime = '12-24 hours';
  } else if (successRate < 70 || recentRejections >= 2) {
    strategy = 'conservative';
    percentages = [1, 5, 10, 20, 50, 100];
    riskLevel = 'high';
    reasoning =
      'Recent issues detected. Recommend conservative rollout with careful monitoring.';
    waitTime = '48-72 hours';
  } else {
    reasoning =
      'Moderate track record. Standard rollout strategy recommended.';
  }

  return {
    recommendedStrategy: strategy,
    suggestedPercentages: percentages,
    reasoning,
    riskLevel,
    waitTimeBetweenStages: waitTime,
  };
}

export default playStoreRoutes;

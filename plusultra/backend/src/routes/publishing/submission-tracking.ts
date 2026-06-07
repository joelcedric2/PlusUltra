import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { submissionIterationService, AppStoreFeedback } from '../../services/publishing/SubmissionIterationService';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

interface StartSubmissionRequest {
  userId: string;
  projectId: string;
  appName: string;
  platform: 'ios' | 'android' | 'all';
  buildId: string;
}

interface GetSubmissionStatusRequest {
  sessionId: string;
}

interface ProcessFeedbackRequest {
  sessionId: string;
  source: 'apple_connect' | 'play_console' | 'manual';
  submissionId: string;
  status: string;
  rejectionFeedback?: string;
  reviewNotes?: string;
}

interface ErrorResponse {
  error: string;
  code: string;
  requestId: string;
  timestamp: string;
}

interface SuccessResponse<T = any> {
  success: true;
  data: T;
  requestId: string;
  timestamp: string;
}

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
    timestamp,
  };

  console.error(`[${timestamp}] [${requestId}] Error:`, error);
  return reply.status(statusCode).send(errorResponse);
};

const createSuccessResponse = <T>(reply: FastifyReply, data: T, statusCode: number = 200) => {
  const response: SuccessResponse<T> = {
    success: true,
    data,
    requestId: uuidv4(),
    timestamp: new Date().toISOString(),
  };

  return reply.status(statusCode).send(response);
};

export async function submissionTrackingRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/v1/publishing/submission/start
   * Start a new app store submission with AI iteration
   */
  fastify.post<{ Body: StartSubmissionRequest }>(
    '/api/v1/publishing/submission/start',
    {
      schema: {
        body: z.object({
          userId: z.string(),
          projectId: z.string(),
          appName: z.string(),
          platform: z.enum(['ios', 'android', 'all']),
          buildId: z.string(),
        }),
      },
    },
    async (request, reply) => {
      try {
        const { userId, projectId, appName, platform, buildId } = request.body;

        const session = await submissionIterationService.startSubmission(
          userId,
          projectId,
          appName,
          platform,
          buildId
        );

        return createSuccessResponse(reply, session, 201);
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to start submission'),
          400,
          'SUBMISSION_START_FAILED'
        );
      }
    }
  );

  /**
   * GET /api/v1/publishing/submission/:sessionId
   * Get current status of submission session (for live feed)
   */
  fastify.get<{ Params: { sessionId: string } }>(
    '/api/v1/publishing/submission/:sessionId',
    {
      schema: {
        params: z.object({
          sessionId: z.string(),
        }),
      },
    },
    async (request, reply) => {
      try {
        const { sessionId } = request.params;

        const session = submissionIterationService.getSessionStatus(sessionId);

        if (!session) {
          return createErrorResponse(
            reply,
            new Error('Session not found'),
            404,
            'SESSION_NOT_FOUND'
          );
        }

        // Add estimated time remaining
        const estimatedTime = submissionIterationService.estimateTimeRemaining(session);

        return createSuccessResponse(reply, {
          ...session,
          estimatedTimeRemaining: estimatedTime,
        });
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to get session status'),
          400,
          'STATUS_FETCH_FAILED'
        );
      }
    }
  );

  /**
   * POST /api/v1/publishing/submission/:sessionId/feedback
   * Process feedback from App Store Connect / Play Console
   * This would typically be called by a webhook
   */
  fastify.post<{ Params: { sessionId: string }; Body: Omit<ProcessFeedbackRequest, 'sessionId'> }>(
    '/api/v1/publishing/submission/:sessionId/feedback',
    {
      schema: {
        params: z.object({
          sessionId: z.string(),
        }),
        body: z.object({
          source: z.enum(['apple_connect', 'play_console', 'manual']),
          submissionId: z.string(),
          status: z.string(),
          rejectionFeedback: z.string().optional(),
          reviewNotes: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      try {
        const { sessionId } = request.params;
        const { source, submissionId, status, rejectionFeedback, reviewNotes } = request.body;

        // Parse rejection feedback if present
        const rejectionReasons = rejectionFeedback
          ? submissionIterationService.parseRejectionFeedback(source as 'apple_connect' | 'play_console', rejectionFeedback)
          : [];

        const feedback: AppStoreFeedback = {
          source,
          submissionId,
          status,
          rejectionReasons,
          reviewNotes,
          receivedAt: new Date(),
        };

        await submissionIterationService.processFeedback(sessionId, feedback);

        return createSuccessResponse(reply, {
          message: 'Feedback processed successfully',
          rejectionReasons: rejectionReasons.length,
          autoFixing: rejectionReasons.length > 0,
        });
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to process feedback'),
          400,
          'FEEDBACK_PROCESSING_FAILED'
        );
      }
    }
  );

  /**
   * GET /api/v1/publishing/submission/:sessionId/timeline
   * Get timeline/history of all attempts for UI display
   */
  fastify.get<{ Params: { sessionId: string } }>(
    '/api/v1/publishing/submission/:sessionId/timeline',
    {
      schema: {
        params: z.object({
          sessionId: z.string(),
        }),
      },
    },
    async (request, reply) => {
      try {
        const { sessionId } = request.params;

        const session = submissionIterationService.getSessionStatus(sessionId);

        if (!session) {
          return createErrorResponse(
            reply,
            new Error('Session not found'),
            404,
            'SESSION_NOT_FOUND'
          );
        }

        // Format timeline for UI
        const timeline = session.attempts.map((attempt, index) => ({
          step: index + 1,
          timestamp: attempt.timestamp,
          status: attempt.status,
          store: attempt.store,
          rejectionCount: attempt.rejectionReasons?.length || 0,
          fixesApplied: attempt.fixesApplied?.length || 0,
          description: generateTimelineDescription(attempt),
        }));

        return createSuccessResponse(reply, {
          timeline,
          currentStage: session.currentStage,
          totalAttempts: session.attempts.length,
          status: session.status,
        });
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to get timeline'),
          400,
          'TIMELINE_FETCH_FAILED'
        );
      }
    }
  );

  /**
   * Helper to generate human-readable timeline descriptions
   */
  function generateTimelineDescription(attempt: any): string {
    switch (attempt.status) {
      case 'submitted':
        return `Submitted to ${attempt.store === 'app_store' ? 'App Store' : 'Play Store'}`;
      case 'in_review':
        return 'Under review by store team';
      case 'rejected':
        return `Rejected (${attempt.rejectionReasons?.length || 0} issues found)`;
      case 'approved':
        return '✅ Approved and live!';
      default:
        return 'Processing...';
    }
  }
}

export default submissionTrackingRoutes;

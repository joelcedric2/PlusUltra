import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { storeRevenueConsent } from './revenue';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Request/Response types
interface RevenueTrackingRequest {
  consentAccepted: boolean;
  acceptedAt: string;
}

interface NotificationSettingsRequest {
  emailNotifications: boolean;
  projectUpdates: boolean;
  collaborationAlerts: boolean;
  marketingEmails: boolean;
}

// Error response type
interface ErrorResponse {
  error: string;
  code: string;
  requestId: string;
  timestamp: string;
}

// Success response type
interface SuccessResponse<T = any> {
  success: true;
  data?: T;
  requestId: string;
  timestamp: string;
}

// Helper function to create error responses
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

// Helper function to create success responses
const createSuccessResponse = <T>(reply: FastifyReply, data?: T, statusCode: number = 200) => {
  const response: SuccessResponse<T> = {
    success: true,
    ...(data && { data }),
    requestId: uuidv4(),
    timestamp: new Date().toISOString(),
  };

  return reply.status(statusCode).send(response);
};

export async function settingsRoutes(fastify: FastifyInstance) {
  /**
   * PUT /api/v1/settings/revenue-tracking
   * Save revenue tracking consent agreement
   */
  fastify.put<{ Body: RevenueTrackingRequest }>(
    '/api/v1/settings/revenue-tracking',
    {
      preValidation: fastify.authenticate,
      schema: {
        body: z.object({
          consentAccepted: z.boolean(),
          acceptedAt: z.string(),
        }),
      },
    },
    async (request, reply) => {
      try {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized', message: 'Authentication required' });
        }
        const userId = request.user.id;

        const { consentAccepted, acceptedAt } = request.body;

        // Store consent in database
        await prisma.userSettings.upsert({
          where: { userId },
          update: {
            revenueTrackingConsent: consentAccepted,
            revenueConsentAcceptedAt: new Date(acceptedAt),
          },
          create: {
            userId,
            revenueTrackingConsent: consentAccepted,
            revenueConsentAcceptedAt: new Date(acceptedAt),
            emailNotifications: true, // default
            projectUpdates: true,     // default
            collaborationAlerts: true,// default
            marketingEmails: false,   // default
          },
        });

        // Also store in revenue analytics for admin dashboard
        storeRevenueConsent(
          userId,
          consentAccepted,
          acceptedAt,
          request.user.email,
          (request.user as any).name
        );

        console.log(`✅ Revenue tracking consent saved for user ${userId}:`, consentAccepted);

        return createSuccessResponse(reply, {
          message: 'Revenue tracking consent saved successfully',
          consentAccepted,
          acceptedAt,
        });
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to save revenue tracking consent'),
          400,
          'REVENUE_CONSENT_SAVE_FAILED'
        );
      }
    }
  );

  /**
   * GET /api/v1/settings/revenue-tracking
   * Get revenue tracking consent status
   */
  fastify.get(
    '/api/v1/settings/revenue-tracking',
    {
      preValidation: fastify.authenticate,
    },
    async (request, reply) => {
      try {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized', message: 'Authentication required' });
        }
        const userId = request.user.id;

        const userSettings = await prisma.userSettings.findUnique({
          where: { userId },
        });

        if (!userSettings) {
          return createSuccessResponse(reply, {
            consentAccepted: false,
            acceptedAt: null,
          });
        }

        return createSuccessResponse(reply, {
          consentAccepted: userSettings.revenueTrackingConsent,
          acceptedAt: userSettings.revenueConsentAcceptedAt?.toISOString() || null,
        });
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to get revenue tracking consent'),
          400,
          'REVENUE_CONSENT_FETCH_FAILED'
        );
      }
    }
  );

  /**
   * PUT /api/v1/settings/notifications
   * Save notification preferences
   */
  fastify.put<{ Body: NotificationSettingsRequest }>(
    '/api/v1/settings/notifications',
    {
      preValidation: fastify.authenticate,
      schema: {
        body: z.object({
          emailNotifications: z.boolean(),
          projectUpdates: z.boolean(),
          collaborationAlerts: z.boolean(),
          marketingEmails: z.boolean(),
        }),
      },
    },
    async (request, reply) => {
      try {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized', message: 'Authentication required' });
        }
        const userId = request.user.id;

        const settings = request.body;

        // Store settings in database
        await prisma.userSettings.upsert({
          where: { userId },
          update: {
            emailNotifications: settings.emailNotifications,
            projectUpdates: settings.projectUpdates,
            collaborationAlerts: settings.collaborationAlerts,
            marketingEmails: settings.marketingEmails,
          },
          create: {
            userId,
            emailNotifications: settings.emailNotifications,
            projectUpdates: settings.projectUpdates,
            collaborationAlerts: settings.collaborationAlerts,
            marketingEmails: settings.marketingEmails,
            revenueTrackingConsent: false, // default
          },
        });

        console.log(`✅ Notification settings saved for user ${userId}:`, settings);

        return createSuccessResponse(reply, {
          message: 'Notification settings saved successfully',
          settings,
        });
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to save notification settings'),
          400,
          'NOTIFICATION_SETTINGS_SAVE_FAILED'
        );
      }
    }
  );

  /**
   * GET /api/v1/settings/notifications
   * Get notification preferences
   */
  fastify.get(
    '/api/v1/settings/notifications',
    {
      preValidation: fastify.authenticate,
    },
    async (request, reply) => {
      try {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized', message: 'Authentication required' });
        }
        const userId = request.user.id;

        const userSettings = await prisma.userSettings.findUnique({
          where: { userId },
        });

        if (!userSettings) {
          // Return default settings if no custom settings found
          return createSuccessResponse(reply, {
            emailNotifications: true,
            projectUpdates: true,
            collaborationAlerts: true,
            marketingEmails: false,
          });
        }

        return createSuccessResponse(reply, {
          emailNotifications: userSettings.emailNotifications,
          projectUpdates: userSettings.projectUpdates,
          collaborationAlerts: userSettings.collaborationAlerts,
          marketingEmails: userSettings.marketingEmails,
        });
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to get notification settings'),
          400,
          'NOTIFICATION_SETTINGS_FETCH_FAILED'
        );
      }
    }
  );
}

export default settingsRoutes;

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { UserRole } from '../../lib/auth'; // Import UserRole

// Request/Response types
interface GetRevenueAnalyticsRequest {
  startDate?: string;
  endDate?: string;
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
  data: T;
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
const createSuccessResponse = <T>(reply: FastifyReply, data: T, statusCode: number = 200) => {
  const response: SuccessResponse<T> = {
    success: true,
    data,
    requestId: uuidv4(),
    timestamp: new Date().toISOString(),
  };

  return reply.status(statusCode).send(response);
};

// In-memory storage for demo (replace with database in production)
const revenueConsentStore: Map<string, {
  consentAccepted: boolean;
  acceptedAt: string;
  userId: string;
  userEmail?: string;
  userName?: string;
}> = new Map();

// Mock data for app revenue tracking (in production, this comes from actual app analytics)
const appRevenueData: Map<string, {
  userId: string;
  appName: string;
  monthlyRevenue: number;
  annualRevenue: number;
  builtWithPlusUltra: boolean;
  shippedViaPlatform: boolean;
  revenueShareApplies: boolean;
  revenueShareAmount: number;
}> = new Map();

// Admin preHandler
const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!request.user || request.user.role !== UserRole.ADMIN) {
    return reply.code(403).send({ error: 'Forbidden', message: 'Admin access required' });
  }
};

export async function revenueAnalyticsRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/v1/admin/revenue/analytics
   * Get comprehensive revenue tracking analytics
   */
  fastify.get<{ Querystring: GetRevenueAnalyticsRequest }>(
    '/api/v1/admin/revenue/analytics',
    {
      preHandler: [fastify.authenticate, requireAdmin],
      schema: {
        querystring: z.object({
          startDate: z.string().optional(),
          endDate: z.string().optional(),
        }),
      },
    },
    async (request, reply) => {
      try {
        const { startDate, endDate } = request.query;

        // Get all consent records
        const allConsents = Array.from(revenueConsentStore.values());

        // Filter by date if provided
        let filteredConsents = allConsents;
        if (startDate) {
          const start = new Date(startDate);
          filteredConsents = filteredConsents.filter((c) => new Date(c.acceptedAt) >= start);
        }
        if (endDate) {
          const end = new Date(endDate);
          filteredConsents = filteredConsents.filter((c) => new Date(c.acceptedAt) <= end);
        }

        // Calculate statistics
        const totalUsers = allConsents.length;
        const usersAccepted = allConsents.filter((c) => c.consentAccepted).length;
        const acceptanceRate = totalUsers > 0 ? (usersAccepted / totalUsers) * 100 : 0;

        // Get app revenue data
        const allApps = Array.from(appRevenueData.values());
        const appsAboveThreshold = allApps.filter(
          (app) => app.annualRevenue > 100000 && app.builtWithPlusUltra && app.shippedViaPlatform
        );
        const totalRevenueShare = appsAboveThreshold.reduce((sum, app) => sum + app.revenueShareAmount, 0);

        return createSuccessResponse(reply, {
          summary: {
            totalUsers,
            usersAccepted,
            usersDeclined: totalUsers - usersAccepted,
            acceptanceRate: acceptanceRate.toFixed(2),
          },
          apps: {
            totalApps: allApps.length,
            appsAboveThreshold: appsAboveThreshold.length,
            totalRevenueShare: totalRevenueShare.toFixed(2),
          },
          recentConsents: filteredConsents
            .sort((a, b) => new Date(b.acceptedAt).getTime() - new Date(a.acceptedAt).getTime())
            .slice(0, 20)
            .map((c) => ({
              userId: c.userId,
              userEmail: c.userEmail || 'user@example.com',
              userName: c.userName || 'User',
              consentAccepted: c.consentAccepted,
              acceptedAt: c.acceptedAt,
            })),
        });
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to get revenue analytics'),
          400,
          'REVENUE_ANALYTICS_FAILED'
        );
      }
    }
  );

  /**
   * GET /api/v1/admin/revenue/apps
   * Get apps that are subject to revenue share
   */
  fastify.get(
    '/api/v1/admin/revenue/apps',
    { preHandler: [fastify.authenticate, requireAdmin] },
    async (request, reply) => {
      try {
        const allApps = Array.from(appRevenueData.values());
        const appsWithRevenueShare = allApps.filter((app) => app.revenueShareApplies);

        return createSuccessResponse(reply, {
          apps: appsWithRevenueShare.map((app) => ({
            appName: app.appName,
            userId: app.userId,
            monthlyRevenue: app.monthlyRevenue,
            annualRevenue: app.annualRevenue,
            revenueShareAmount: app.revenueShareAmount,
            builtWithPlusUltra: app.builtWithPlusUltra,
            shippedViaPlatform: app.shippedViaPlatform,
          })),
          summary: {
            totalApps: appsWithRevenueShare.length,
            totalRevenueShare: appsWithRevenueShare.reduce((sum, app) => sum + app.revenueShareAmount, 0),
            averageAppRevenue: appsWithRevenueShare.length > 0
              ? appsWithRevenueShare.reduce((sum, app) => sum + app.annualRevenue, 0) / appsWithRevenueShare.length
              : 0,
          },
        });
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to get revenue apps'),
          400,
          'REVENUE_APPS_FAILED'
        );
      }
    }
  );

  /**
   * GET /api/v1/admin/revenue/users
   * Get all users and their consent status
   */
  fastify.get(
    '/api/v1/admin/revenue/users',
    { preHandler: [fastify.authenticate, requireAdmin] },
    async (request, reply) => {
      try {
        const allConsents = Array.from(revenueConsentStore.values());

        return createSuccessResponse(reply, {
          users: allConsents.map((c) => ({
            userId: c.userId,
            userEmail: c.userEmail || 'user@example.com',
            userName: c.userName || 'User',
            consentAccepted: c.consentAccepted,
            acceptedAt: c.acceptedAt,
          })),
          summary: {
            total: allConsents.length,
            accepted: allConsents.filter((c) => c.consentAccepted).length,
            declined: allConsents.filter((c) => !c.consentAccepted).length,
          },
        });
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to get revenue users'),
          400,
          'REVENUE_USERS_FAILED'
        );
      }
    }
  );

  /**
   * POST /api/v1/admin/revenue/simulate-app
   * Simulate an app with revenue (for demo/testing)
   */
  fastify.post<{
    Body: {
      userId: string;
      appName: string;
      annualRevenue: number;
      builtWithPlusUltra: boolean;
      shippedViaPlatform: boolean;
    };
  }>(
    '/api/v1/admin/revenue/simulate-app',
    {
      preHandler: [fastify.authenticate, requireAdmin],
      schema: {
        body: z.object({
          userId: z.string(),
          appName: z.string(),
          annualRevenue: z.number(),
          builtWithPlusUltra: z.boolean(),
          shippedViaPlatform: z.boolean(),
        }),
      },
    },
    async (request, reply) => {
      try {
        const { userId, appName, annualRevenue, builtWithPlusUltra, shippedViaPlatform } = request.body;

        // Calculate revenue share (2% of revenue over $100k if built and shipped via platform)
        const revenueShareApplies = annualRevenue > 100000 && builtWithPlusUltra && shippedViaPlatform;
        const revenueShareAmount = revenueShareApplies ? (annualRevenue - 100000) * 0.02 : 0;

        const appId = `${userId}-${appName}`;
        appRevenueData.set(appId, {
          userId,
          appName,
          monthlyRevenue: annualRevenue / 12,
          annualRevenue,
          builtWithPlusUltra,
          shippedViaPlatform,
          revenueShareApplies,
          revenueShareAmount,
        });

        return createSuccessResponse(reply, {
          message: 'App revenue simulated successfully',
          app: {
            appName,
            annualRevenue,
            revenueShareApplies,
            revenueShareAmount,
          },
        }, 201);
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to simulate app revenue'),
          400,
          'SIMULATE_APP_FAILED'
        );
      }
    }
  );
}
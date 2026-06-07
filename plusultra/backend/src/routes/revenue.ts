import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { UserRole } from '../lib/auth'; // Import UserRole

// Validation schemas
const AcceptAgreementSchema = z.object({
  userId: z.string(),
  projectId: z.string(),
  acceptedAt: z.string(),
  version: z.string(),
});

const ReportRevenueSchema = z.object({
  projectId: z.string(),
  period: z.string(), // e.g., "2025-01"
  grossRevenue: z.number(),
  currency: z.string().default('USD'),
  source: z.enum(['app_store', 'play_store', 'manual']),
});

interface RevenueAgreement {
  id: string;
  userId: string;
  projectId: string;
  version: string;
  acceptedAt: Date;
  ipAddress?: string;
  userAgent?: string;
}

interface RevenueReport {
  id: string;
  projectId: string;
  userId: string;
  period: string;
  grossRevenue: number;
  currency: string;
  revenueShare: number; // Amount owed to PlusUltra
  threshold: number; // $100,000
  source: 'app_store' | 'play_store' | 'manual';
  reportedAt: Date;
}

// In-memory storage (replace with database in production)
const agreements: Map<string, RevenueAgreement> = new Map();
const revenueReports: Map<string, RevenueReport> = new Map();

/**
 * Calculate revenue share based on terms:
 * - 2% of gross revenue if > $100,000
 * - $0 if <= $100,000
 */
function calculateRevenueShare(grossRevenue: number): number {
  const threshold = 100000;
  if (grossRevenue <= threshold) {
    return 0;
  }
  return grossRevenue * 0.02; // 2%
}

// Admin preHandler
const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!request.user || request.user.role !== UserRole.ADMIN) {
    return reply.code(403).send({ error: 'Forbidden', message: 'Admin access required' });
  }
};

export async function revenueRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/v1/revenue/accept-agreement
   * User accepts revenue share agreement
   */
  fastify.post(
    '/api/v1/revenue/accept-agreement',
    {
      schema: {
        body: AcceptAgreementSchema,
      },
    },
    async (
      request: FastifyRequest<{ Body: z.infer<typeof AcceptAgreementSchema> }>,
      reply: FastifyReply
    ) => {
      try {
        const { userId, projectId, acceptedAt, version } = request.body;

        const agreement: RevenueAgreement = {
          id: uuidv4(),
          userId,
          projectId,
          version,
          acceptedAt: new Date(acceptedAt),
          ipAddress: request.ip,
          userAgent: request.headers['user-agent'],
        };

        agreements.set(agreement.id, agreement);

        console.log(`✅ Revenue agreement accepted: User ${userId}, Project ${projectId}`);

        // TODO: Store in database with proper audit trail
        // await prisma.revenueAgreement.create({ data: agreement });

        return reply.status(201).send({
          success: true,
          data: {
            agreementId: agreement.id,
            message: 'Agreement accepted successfully',
          },
        });
      } catch (error) {
        console.error('Failed to save revenue agreement:', error);
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to save agreement',
        });
      }
    }
  );

  /**
   * GET /api/v1/revenue/agreement/:userId/:projectId
   * Check if user has accepted agreement for project
   */
  fastify.get(
    '/api/v1/revenue/agreement/:userId/:projectId',
    async (
      request: FastifyRequest<{ Params: { userId: string; projectId: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { userId, projectId } = request.params;

        // Find agreement
        const agreement = Array.from(agreements.values()).find(
          (a) => a.userId === userId && a.projectId === projectId
        );

        if (!agreement) {
          return reply.status(200).send({
            success: true,
            data: {
              hasAgreed: false,
            },
          });
        }

        return reply.status(200).send({
          success: true,
          data: {
            hasAgreed: true,
            agreement: {
              id: agreement.id,
              version: agreement.version,
              acceptedAt: agreement.acceptedAt,
            },
          },
        });
      } catch (error) {
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to check agreement',
        });
      }
    }
  );

  /**
   * POST /api/v1/revenue/report
   * Report revenue for a project (automated or manual)
   */
  fastify.post<{ Body: z.infer<typeof ReportRevenueSchema> }>(
    '/api/v1/revenue/report',
    {
      preHandler: fastify.authenticate, // Require authentication
    },
    async (
      request,
      reply
    ) => {
      try {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized', message: 'Authentication required' });
        }
        const { projectId, period, grossRevenue, currency, source } = request.body;

        // Calculate revenue share
        const revenueShare = calculateRevenueShare(grossRevenue);

        const report: RevenueReport = {
          id: uuidv4(),
          projectId,
          userId: request.user.id, // Get from auth context
          period,
          grossRevenue,
          currency,
          revenueShare,
          threshold: 100000,
          source,
          reportedAt: new Date(),
        };

        revenueReports.set(report.id, report);

        console.log(
          `💰 Revenue reported: Project ${projectId}, Period ${period}, Revenue ${currency} ${grossRevenue}, Share: ${currency} ${revenueShare}`
        );

        return reply.status(201).send({
          success: true,
          data: {
            reportId: report.id,
            grossRevenue,
            revenueShare,
            owesShare: revenueShare > 0,
            message:
              revenueShare > 0
                ? `Revenue share of ${currency} ${revenueShare.toFixed(2)} applies (2% of ${currency} ${grossRevenue})`
                : `No revenue share applies (below $100k threshold)`,
          },
        });
      } catch (error) {
        console.error('Failed to report revenue:', error);
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to report revenue',
        });
      }
    }
  );

  /**
   * GET /api/v1/revenue/reports/:projectId
   * Get revenue reports for a project
   */
  fastify.get(
    '/api/v1/revenue/reports/:projectId',
    async (request: FastifyRequest<{ Params: { projectId: string } }>, reply: FastifyReply) => {
      try {
        const { projectId } = request.params;

        // Find agreement
        const agreement = Array.from(agreements.values()).find(
          (a) => a.userId === request.user?.id && a.projectId === projectId
        );

        if (!agreement) {
          return reply.status(200).send({
            success: true,
            data: {
              hasAgreed: false,
            },
          });
        }

        const projectReports = Array.from(revenueReports.values())
          .filter((r) => r.projectId === projectId)
          .sort((a, b) => b.reportedAt.getTime() - a.reportedAt.getTime());

        const totalRevenue = projectReports.reduce((sum, r) => sum + r.grossRevenue, 0);
        const totalShare = projectReports.reduce((sum, r) => sum + r.revenueShare, 0);

        return reply.status(200).send({
          success: true,
          data: {
            reports: projectReports,
            summary: {
              totalRevenue,
              totalShare,
              reportCount: projectReports.length,
              aboveThreshold: totalRevenue > 100000,
            },
          },
        });
      } catch (error) {
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch reports',
        });
      }
    }
  );

  /**
   * GET /api/v1/revenue/stats
   * Get platform-wide revenue statistics (admin only)
   */
  fastify.get(
    '/api/v1/revenue/stats',
    { preHandler: [fastify.authenticate, requireAdmin] }, // Add admin authentication check
    async (request, reply) => {
      try {
        const allReports = Array.from(revenueReports.values());

        const stats = {
          totalProjects: new Set(allReports.map((r) => r.projectId)).size,
          totalRevenue: allReports.reduce((sum, r) => sum + r.grossRevenue, 0),
          totalRevenueShare: allReports.reduce((sum, r) => sum + r.revenueShare, 0),
          projectsAboveThreshold: allReports.filter((r) => r.grossRevenue > 100000).length,
          averageRevenue:
            allReports.length > 0 ? allReports.reduce((sum, r) => sum + r.grossRevenue, 0) / allReports.length : 0,
        };

        return reply.status(200).send({
          success: true,
          data: stats,
        });
      } catch (error) {
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to fetch stats',
        });
      }
    }
  );
}

// In-memory consent store
const revenueConsentStore: Map<string, {
  userId: string;
  consentAccepted: boolean;
  acceptedAt: string;
  userEmail?: string;
  userName?: string;
}> = new Map();

// Helper function to store consent (called from settings route)
export function storeRevenueConsent(
  userId: string,
  consentAccepted: boolean,
  acceptedAt: string,
  userEmail?: string,
  userName?: string
) {
  revenueConsentStore.set(userId, {
    userId,
    consentAccepted,
    acceptedAt,
    userEmail,
    userName,
  });
}

export default revenueRoutes;

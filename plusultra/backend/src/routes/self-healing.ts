/**
 * Self-Healing API Routes
 *
 * REST endpoints for managing the self-healing system.
 * Includes Sentry webhook, manual triggers, status monitoring, and configuration.
 */

import { FastifyPluginAsync } from 'fastify';
import { sentryWebhookService, type SentryWebhookPayload } from '../services/self-healing/SentryWebhookService';
import { selfHealingOrchestrator } from '../services/self-healing/SelfHealingOrchestrator';
import { selfHealingDashboard } from '../services/self-healing/SelfHealingDashboard';
import { prisma } from '../lib/prisma';

const selfHealingRoutes: FastifyPluginAsync = async (fastify) => {

  // ==========================================
  // SENTRY WEBHOOK
  // ==========================================

  /**
   * Receive Sentry error webhooks
   */
  fastify.post<{
    Body: SentryWebhookPayload;
    Headers: {
      'sentry-hook-signature'?: string;
    };
  }>('/api/webhooks/sentry', async (request, reply) => {
    try {
      const payload = request.body;
      const signature = request.headers['sentry-hook-signature'];

      // Verify webhook signature (if configured)
      if (process.env.SENTRY_WEBHOOK_SECRET && signature) {
        const isValid = sentryWebhookService.verifySignature(
          JSON.stringify(request.body),
          signature,
          process.env.SENTRY_WEBHOOK_SECRET
        );

        if (!isValid) {
          return reply.code(401).send({ error: 'Invalid signature' });
        }
      }

      // Process webhook
      const processedError = await sentryWebhookService.processWebhook(payload);

      if (!processedError) {
        return reply.send({ success: true, message: 'Error logged, no action taken' });
      }

      // Check if healing should be triggered
      const shouldHeal = await sentryWebhookService.shouldTriggerHealing(processedError.id);

      if (shouldHeal) {
        // Trigger healing asynchronously (don't wait for completion)
        selfHealingOrchestrator.handleError(processedError.id).catch(error => {
          fastify.log.error('Healing error:', error);
        });

        return reply.send({
          success: true,
          message: 'Error logged, healing triggered',
          errorId: processedError.id,
        });
      }

      return reply.send({
        success: true,
        message: 'Error logged, healing not triggered',
        errorId: processedError.id,
      });

    } catch (error: any) {
      fastify.log.error('Webhook error:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  // ==========================================
  // MANUAL HEALING TRIGGERS
  // ==========================================

  /**
   * Manually trigger healing for an error
   */
  fastify.post<{
    Params: { errorId: string };
    Body: {
      requireApproval?: boolean;
      skipValidation?: boolean;
      deployEnvironment?: 'staging' | 'production';
    };
  }>('/api/self-healing/errors/:errorId/heal', async (request, reply) => {
    try {
      const { errorId } = request.params;
      const options = request.body;

      const result = await selfHealingOrchestrator.handleError(errorId, {
        ...options,
        triggerSource: 'manual',
      });

      if (!result) {
        return reply.code(400).send({
          success: false,
          error: 'Healing could not be triggered',
        });
      }

      return reply.send({
        success: true,
        result,
      });

    } catch (error: any) {
      fastify.log.error('Manual healing error:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  // ==========================================
  // ERROR MANAGEMENT
  // ==========================================

  /**
   * Get all errors
   */
  fastify.get<{
    Querystring: {
      projectId?: string;
      status?: string;
      environment?: string;
      limit?: number;
      offset?: number;
    };
  }>('/api/self-healing/errors', async (request, reply) => {
    try {
      const { projectId, status, environment, limit = 50, offset = 0 } = request.query;

      const where: any = {};
      if (projectId) where.projectId = projectId;
      if (status) where.status = status;
      if (environment) where.environment = environment;

      const errors = await prisma.sentryError.findMany({
        where,
        include: {
          healingAttempts: {
            take: 1,
            orderBy: { startedAt: 'desc' },
          },
        },
        orderBy: { lastSeen: 'desc' },
        take: Number(limit),
        skip: Number(offset),
      });

      const total = await prisma.sentryError.count({ where });

      return reply.send({
        success: true,
        errors,
        total,
        limit,
        offset,
      });

    } catch (error: any) {
      fastify.log.error('Get errors error:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Get error details
   */
  fastify.get<{
    Params: { errorId: string };
  }>('/api/self-healing/errors/:errorId', async (request, reply) => {
    try {
      const { errorId } = request.params;

      const error = await prisma.sentryError.findUnique({
        where: { id: errorId },
        include: {
          healingAttempts: {
            orderBy: { startedAt: 'desc' },
            include: {
              deployment: true,
            },
          },
        },
      });

      if (!error) {
        return reply.code(404).send({ error: 'Error not found' });
      }

      return reply.send({
        success: true,
        error,
      });

    } catch (error: any) {
      fastify.log.error('Get error details error:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Mark error as ignored
   */
  fastify.post<{
    Params: { errorId: string };
  }>('/api/self-healing/errors/:errorId/ignore', async (request, reply) => {
    try {
      const { errorId } = request.params;

      await prisma.sentryError.update({
        where: { id: errorId },
        data: { status: 'ignored' },
      });

      return reply.send({
        success: true,
        message: 'Error marked as ignored',
      });

    } catch (error: any) {
      fastify.log.error('Ignore error error:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  // ==========================================
  // HEALING ATTEMPTS
  // ==========================================

  /**
   * Get healing attempt details
   */
  fastify.get<{
    Params: { attemptId: string };
  }>('/api/self-healing/attempts/:attemptId', async (request, reply) => {
    try {
      const { attemptId } = request.params;

      const attempt = await prisma.healingAttempt.findUnique({
        where: { id: attemptId },
        include: {
          error: true,
          deployment: true,
        },
      });

      if (!attempt) {
        return reply.code(404).send({ error: 'Attempt not found' });
      }

      return reply.send({
        success: true,
        attempt,
      });

    } catch (error: any) {
      fastify.log.error('Get attempt error:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Approve healing attempt (for manual review)
   */
  fastify.post<{
    Params: { attemptId: string };
    Body: {
      approved: boolean;
      userId: string;
    };
  }>('/api/self-healing/attempts/:attemptId/approve', async (request, reply) => {
    try {
      const { attemptId } = request.params;
      const { approved, userId } = request.body;

      const attempt = await prisma.healingAttempt.findUnique({
        where: { id: attemptId },
      });

      if (!attempt) {
        return reply.code(404).send({ error: 'Attempt not found' });
      }

      if (approved) {
        // TODO: Deploy the fix
        await prisma.healingAttempt.update({
          where: { id: attemptId },
          data: {
            approvedBy: userId,
            status: 'deploying',
          },
        });
      } else {
        await prisma.healingAttempt.update({
          where: { id: attemptId },
          data: {
            status: 'failed',
            rollbackReason: 'Rejected by human reviewer',
          },
        });
      }

      return reply.send({
        success: true,
        message: approved ? 'Attempt approved' : 'Attempt rejected',
      });

    } catch (error: any) {
      fastify.log.error('Approve attempt error:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  // ==========================================
  // CONFIGURATION
  // ==========================================

  /**
   * Get healing configuration for project
   */
  fastify.get<{
    Params: { projectId: string };
  }>('/api/self-healing/config/:projectId', async (request, reply) => {
    try {
      const { projectId } = request.params;

      let config = await prisma.healingConfig.findUnique({
        where: { projectId },
      });

      if (!config) {
        // Create default config
        config = await prisma.healingConfig.create({
          data: {
            projectId,
            notificationChannels: [], // Required field
          },
        });
      }

      return reply.send({
        success: true,
        config,
      });

    } catch (error: any) {
      fastify.log.error('Get config error:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Update healing configuration
   */
  fastify.put<{
    Params: { projectId: string };
    Body: Partial<{
      enabled: boolean;
      autoHealProduction: boolean;
      autoHealStaging: boolean;
      minConfidence: number;
      maxAttemptsPerHour: number;
      maxAttemptsPerError: number;
      cooldownPeriod: number;
      notifyOnAttempt: boolean;
      notifyOnSuccess: boolean;
      notifyOnFailure: boolean;
      notificationChannels: any;
      requireApproval: boolean;
      emergencyKillSwitch: boolean;
    }>;
  }>('/api/self-healing/config/:projectId', async (request, reply) => {
    try {
      const { projectId } = request.params;
      const updates = request.body;

      const config = await prisma.healingConfig.upsert({
        where: { projectId },
        create: {
          projectId,
          notificationChannels: updates.notificationChannels || [],
          ...updates,
        },
        update: updates,
      });

      return reply.send({
        success: true,
        config,
      });

    } catch (error: any) {
      fastify.log.error('Update config error:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Emergency kill switch
   */
  fastify.post<{
    Params: { projectId: string };
    Body: {
      enabled: boolean;
    };
  }>('/api/self-healing/config/:projectId/kill-switch', async (request, reply) => {
    try {
      const { projectId } = request.params;
      const { enabled } = request.body;

      await prisma.healingConfig.update({
        where: { projectId },
        data: { emergencyKillSwitch: enabled },
      });

      return reply.send({
        success: true,
        message: enabled ? 'Kill switch activated' : 'Kill switch deactivated',
      });

    } catch (error: any) {
      fastify.log.error('Kill switch error:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  // ==========================================
  // STATISTICS & MONITORING
  // ==========================================

  /**
   * Get healing statistics
   */
  fastify.get<{
    Querystring: {
      projectId?: string;
    };
  }>('/api/self-healing/stats', async (request, reply) => {
    try {
      const { projectId } = request.query;

      const stats = await selfHealingOrchestrator.getStats(projectId);

      // Get recent healing attempts
      const recentAttempts = await prisma.healingAttempt.findMany({
        where: projectId ? { error: { projectId } } : undefined,
        include: {
          error: {
            select: {
              errorMessage: true,
              errorType: true,
              environment: true,
            },
          },
        },
        orderBy: { startedAt: 'desc' },
        take: 10,
      });

      return reply.send({
        success: true,
        stats,
        recentAttempts,
      });

    } catch (error: any) {
      fastify.log.error('Get stats error:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Get healing metrics
   */
  fastify.get<{
    Querystring: {
      projectId?: string;
      days?: number;
    };
  }>('/api/self-healing/metrics', async (request, reply) => {
    try {
      const { projectId, days = 7 } = request.query;

      const startDate = new Date();
      startDate.setDate(startDate.getDate() - Number(days));

      const metrics = await prisma.healingMetrics.findMany({
        where: {
          projectId: projectId || undefined,
          date: { gte: startDate },
        },
        orderBy: { date: 'desc' },
      });

      return reply.send({
        success: true,
        metrics,
      });

    } catch (error: any) {
      fastify.log.error('Get metrics error:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  // ==========================================
  // DASHBOARD & ADMIN
  // ==========================================

  /**
   * Get dashboard data
   */
  fastify.get<{
    Querystring: {
      projectId?: string;
      days?: number;
    };
  }>('/api/self-healing/dashboard', async (request, reply) => {
    try {
      const { projectId, days = 7 } = request.query;

      const dashboardData = await selfHealingDashboard.getDashboardData(
        projectId,
        Number(days)
      );

      return reply.send({
        success: true,
        data: dashboardData,
      });

    } catch (error: any) {
      fastify.log.error('Get dashboard error:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Get detailed attempt view
   */
  fastify.get<{
    Params: { attemptId: string };
  }>('/api/self-healing/dashboard/attempts/:attemptId', async (request, reply) => {
    try {
      const { attemptId } = request.params;

      const detailedView = await selfHealingDashboard.getDetailedAttemptView(attemptId);

      if (!detailedView) {
        return reply.code(404).send({ error: 'Attempt not found' });
      }

      return reply.send({
        success: true,
        data: detailedView,
      });

    } catch (error: any) {
      fastify.log.error('Get detailed attempt error:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  /**
   * Export dashboard data
   */
  fastify.get<{
    Querystring: {
      projectId?: string;
      days?: number;
    };
  }>('/api/self-healing/dashboard/export', async (request, reply) => {
    try {
      const { projectId, days = 30 } = request.query;

      const exportData = await selfHealingDashboard.exportDashboardData(
        projectId,
        Number(days)
      );

      return reply
        .header('Content-Type', 'application/json')
        .header('Content-Disposition', `attachment; filename="self-healing-dashboard-${new Date().toISOString()}.json"`)
        .send(exportData);

    } catch (error: any) {
      fastify.log.error('Export dashboard error:', error);
      return reply.code(500).send({ error: error.message });
    }
  });

  fastify.log.info('Self-healing routes registered');
};

export default selfHealingRoutes;

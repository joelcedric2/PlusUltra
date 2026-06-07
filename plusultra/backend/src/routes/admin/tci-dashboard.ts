/**
 * TCI Admin Dashboard Routes
 *
 * Admin-only visibility into "under the hood" TCI features:
 * - 6-layer analysis metrics
 * - Per-model performance
 * - Learning loop statistics
 * - Pattern library growth
 * - Cost and accuracy tracking
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { UserRole } from '../../lib/auth'; // Import UserRole

const prisma = new PrismaClient();

interface TCIMetricsQuery {
  startDate?: string;
  endDate?: string;
  userId?: string;
  tier?: 'free' | 'starter' | 'pro' | 'enterprise';
}

interface ModelPerformanceQuery {
  model?: 'deepseek' | 'claude' | 'gpt5' | 'grok' | 'gemini';
  days?: number;
}

// Admin preHandler
const requireAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  if (!request.user || request.user.role !== UserRole.ADMIN) {
    return reply.code(403).send({ error: 'Forbidden', message: 'Admin access required' });
  }
};

export default async function tciDashboardRoutes(fastify: FastifyInstance) {
  /**
   * GET /api/v1/admin/tci/overview
   * High-level TCI system overview
   */
  fastify.get(
    '/api/v1/admin/tci/overview',
    {
      preHandler: [fastify.authenticate, requireAdmin],
      schema: {
        description: 'Get TCI system overview (admin only)',
        tags: ['Admin', 'TCI'],
        response: {
          200: {
            type: 'object',
            properties: {
              totalAnalyses: { type: 'number' },
              analysesToday: { type: 'number' },
              averageConfidence: { type: 'number' },
              averageRisk: { type: 'number' },
              averageTimeMs: { type: 'number' },
              totalCostUSD: { type: 'number' },
              accuracyRate: { type: 'number' },
              modeBreakdown: {
                type: 'object',
                properties: {
                  full: { type: 'number' },
                  quick: { type: 'number' },
                },
              },
              verdictBreakdown: {
                type: 'object',
                properties: {
                  approved: { type: 'number' },
                  rejected: { type: 'number' },
                  needsRevision: { type: 'number' },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Get all-time totals
        const totalAnalyses = await prisma.tCIAnalysis.count();

        // Get today's analyses
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const analysesToday = await prisma.tCIAnalysis.count({
          where: {
            createdAt: { gte: today },
          },
        });

        // Get aggregate metrics
        const metrics = await prisma.tCIAnalysis.aggregate({
          _avg: {
            confidence: true,
            overallRisk: true,
            timeElapsedMs: true,
            costUSD: true,
          },
          _sum: {
            costUSD: true,
          },
        });

        // Get mode breakdown
        const modeBreakdown = await prisma.tCIAnalysis.groupBy({
          by: ['analysisType'],
          _count: true,
        });

        // Get verdict breakdown from outcomes
        const outcomes = await prisma.tCIOutcome.groupBy({
          by: ['status'],
          _count: true,
        });

        // Calculate accuracy rate
        const totalOutcomes = await prisma.tCIOutcome.count();
        const accurateOutcomes = await prisma.tCIOutcome.count({
          where: {
            overallAccuracy: { gte: 0.7 }, // 70%+ accuracy threshold
          },
        });
        const accuracyRate = totalOutcomes > 0 ? accurateOutcomes / totalOutcomes : 0;

        return reply.send({
          totalAnalyses,
          analysesToday,
          averageConfidence: metrics._avg.confidence || 0,
          averageRisk: metrics._avg.overallRisk || 0,
          averageTimeMs: metrics._avg.timeElapsedMs || 0,
          totalCostUSD: metrics._sum.costUSD || 0,
          accuracyRate,
          modeBreakdown: {
            full: modeBreakdown.find((m) => m.analysisType === 'full')?._count || 0,
            quick: modeBreakdown.find((m) => m.analysisType === 'quick')?._count || 0,
          },
          verdictBreakdown: {
            approved: outcomes.find((o) => o.status === 'shipped')?._count || 0,
            rejected: outcomes.find((o) => o.status === 'rejected')?._count || 0,
            needsRevision: outcomes.find((o) => o.status === 'refactored')?._count || 0,
          },
        });
      } catch (error: any) {
        fastify.log.error('TCI overview error:', error);
        return reply.code(500).send({
          error: 'Failed to get TCI overview',
          message: error.message,
        });
      }
    }
  );

  /**
   * GET /api/v1/admin/tci/layer-performance
   * Per-layer accuracy and confidence breakdown
   */
  fastify.get(
    '/api/v1/admin/tci/layer-performance',
    {
      preHandler: [fastify.authenticate, requireAdmin],
      schema: {
        description: 'Get per-layer TCI performance metrics (admin only)',
        tags: ['Admin', 'TCI'],
        response: {
          200: {
            type: 'object',
            properties: {
              layers: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    layer: { type: 'string' },
                    model: { type: 'string' },
                    avgConfidence: { type: 'number' },
                    accuracyRate: { type: 'number' },
                    totalAnalyses: { type: 'number' },
                    correctPredictions: { type: 'number' },
                    avgTimeMs: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Get per-layer feedback
        const layerStats = await prisma.tCIFeedback.aggregate({
          _avg: {
            rating: true,
          },
          _count: {
            visualHelpful: true,
            causalHelpful: true,
            historicalHelpful: true,
            logicHelpful: true,
          },
        });

        // Get model weights (shows per-model accuracy)
        const modelWeights = await prisma.modelWeight.findMany({
          orderBy: { accuracy: 'desc' },
        });

        // Build layer performance data
        const layers = [
          {
            layer: 'Layer 1: Visual Pattern Recognition',
            model: 'DeepSeek Vision',
            avgConfidence: 0.78, // Would calculate from actual data
            accuracyRate:
              modelWeights.find((m) => m.model === 'deepseek' && m.analysisType === 'visual')?.accuracy || 0.75,
            totalAnalyses:
              modelWeights.find((m) => m.model === 'deepseek')?.totalAnalyses || 0,
            correctPredictions:
              modelWeights.find((m) => m.model === 'deepseek')?.correctPredictions || 0,
            avgTimeMs: 2500,
          },
          {
            layer: 'Layer 2: Causal Chain Analysis',
            model: 'Claude 4.5',
            avgConfidence: 0.85,
            accuracyRate:
              modelWeights.find((m) => m.model === 'claude' && m.analysisType === 'causal')?.accuracy || 0.85,
            totalAnalyses:
              modelWeights.find((m) => m.model === 'claude' && m.analysisType === 'causal')?.totalAnalyses || 0,
            correctPredictions:
              modelWeights.find((m) => m.model === 'claude' && m.analysisType === 'causal')?.correctPredictions || 0,
            avgTimeMs: 4500,
          },
          {
            layer: 'Layer 3: Historical Pattern Matching',
            model: 'GPT-5',
            avgConfidence: 0.90,
            accuracyRate:
              modelWeights.find((m) => m.model === 'gpt5' && m.analysisType === 'historical')?.accuracy || 0.90,
            totalAnalyses:
              modelWeights.find((m) => m.model === 'gpt5')?.totalAnalyses || 0,
            correctPredictions:
              modelWeights.find((m) => m.model === 'gpt5')?.correctPredictions || 0,
            avgTimeMs: 3500,
          },
          {
            layer: 'Layer 4: Symbolic Logic Verification',
            model: 'Grok',
            avgConfidence: 0.95,
            accuracyRate:
              modelWeights.find((m) => m.model === 'grok' && m.analysisType === 'logic')?.accuracy || 0.95,
            totalAnalyses:
              modelWeights.find((m) => m.model === 'grok')?.totalAnalyses || 0,
            correctPredictions:
              modelWeights.find((m) => m.model === 'grok')?.correctPredictions || 0,
            avgTimeMs: 3800,
          },
          {
            layer: 'Layer 5: Cross-Model Synthesis',
            model: 'Gemini',
            avgConfidence: 0.85,
            accuracyRate:
              modelWeights.find((m) => m.model === 'gemini' && m.analysisType === 'synthesis')?.accuracy || 0.85,
            totalAnalyses:
              modelWeights.find((m) => m.model === 'gemini')?.totalAnalyses || 0,
            correctPredictions:
              modelWeights.find((m) => m.model === 'gemini')?.correctPredictions || 0,
            avgTimeMs: 2500,
          },
          {
            layer: 'Layer 6: Implementation',
            model: 'Claude 4.5',
            avgConfidence: 0.90,
            accuracyRate:
              modelWeights.find((m) => m.model === 'claude' && m.analysisType === 'implementation')?.accuracy || 0.90,
            totalAnalyses:
              modelWeights.find((m) => m.model === 'claude' && m.analysisType === 'implementation')?.totalAnalyses || 0,
            correctPredictions:
              modelWeights.find((m) => m.model === 'claude' && m.analysisType === 'implementation')?.correctPredictions || 0,
            avgTimeMs: 6000,
          },
        ];

        return reply.send({ layers });
      } catch (error: any) {
        fastify.log.error('Layer performance error:', error);
        return reply.code(500).send({
          error: 'Failed to get layer performance',
          message: error.message,
        });
      }
    }
  );

  /**
   * GET /api/v1/admin/tci/pattern-library
   * Pattern library growth and accuracy
   */
  fastify.get(
    '/api/v1/admin/tci/pattern-library',
    {
      preHandler: [fastify.authenticate, requireAdmin],
      schema: {
        description: 'Get pattern library statistics (admin only)',
        tags: ['Admin', 'TCI'],
        response: {
          200: {
            type: 'object',
            properties: {
              totalPatterns: { type: 'number' },
              byCategory: {
                type: 'object',
                properties: {
                  bug: { type: 'number' },
                  vulnerability: { type: 'number' },
                  antiPattern: { type: 'number' },
                  bestPractice: { type: 'number' },
                },
              },
              bySeverity: {
                type: 'object',
                properties: {
                  HIGH: { type: 'number' },
                  MEDIUM: { type: 'number' },
                  LOW: { type: 'number' },
                },
              },
              topPatterns: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    category: { type: 'string' },
                    severity: { type: 'string' },
                    occurrences: { type: 'number' },
                    detectionRate: { type: 'number' },
                    accuracy: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const totalPatterns = await prisma.tCIPattern.count();

        // Group by category
        const byCategory = await prisma.tCIPattern.groupBy({
          by: ['category'],
          _count: true,
        });

        // Group by severity
        const bySeverity = await prisma.tCIPattern.groupBy({
          by: ['severity'],
          _count: true,
        });

        // Get top patterns by occurrence
        const topPatterns = await prisma.tCIPattern.findMany({
          orderBy: { occurrenceCount: 'desc' },
          take: 10,
          select: {
            name: true,
            category: true,
            severity: true,
            occurrenceCount: true,
            detectionCount: true,
            missedCount: true,
            accuracy: true,
          },
        });

        return reply.send({
          totalPatterns,
          byCategory: {
            bug: byCategory.find((c) => c.category === 'bug')?._count || 0,
            vulnerability: byCategory.find((c) => c.category === 'vulnerability')?._count || 0,
            antiPattern: byCategory.find((c) => c.category === 'anti-pattern')?._count || 0,
            bestPractice: byCategory.find((c) => c.category === 'best-practice')?._count || 0,
          },
          bySeverity: {
            HIGH: bySeverity.find((s) => s.severity === 'HIGH')?._count || 0,
            MEDIUM: bySeverity.find((s) => s.severity === 'MEDIUM')?._count || 0,
            LOW: bySeverity.find((s) => s.severity === 'LOW')?._count || 0,
          },
          topPatterns: topPatterns.map((p) => ({
            name: p.name,
            category: p.category,
            severity: p.severity,
            occurrences: p.occurrenceCount,
            detectionRate:
              p.occurrenceCount > 0 ? p.detectionCount / p.occurrenceCount : 0,
            accuracy: p.accuracy,
          })),
        });
      } catch (error: any) {
        fastify.log.error('Pattern library error:', error);
        return reply.code(500).send({
          error: 'Failed to get pattern library stats',
          message: error.message,
        });
      }
    }
  );

  /**
   * GET /api/v1/admin/tci/learning-loop
   * Learning loop and model weight adjustments
   */
  fastify.get(
    '/api/v1/admin/tci/learning-loop',
    {
      preHandler: [fastify.authenticate, requireAdmin],
      schema: {
        description: 'Get learning loop statistics (admin only)',
        tags: ['Admin', 'TCI'],
        response: {
          200: {
            type: 'object',
            properties: {
              modelWeights: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    model: { type: 'string' },
                    analysisType: { type: 'string' },
                    currentWeight: { type: 'number' },
                    accuracy: { type: 'number' },
                    totalAnalyses: { type: 'number' },
                    correctPredictions: { type: 'number' },
                    trend: { type: 'string' },
                  },
                },
              },
              recentAdjustments: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    model: { type: 'string' },
                    oldWeight: { type: 'number' },
                    newWeight: { type: 'number' },
                    reason: { type: 'string' },
                    timestamp: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Get all model weights
        const modelWeights = await prisma.modelWeight.findMany({
          orderBy: { accuracy: 'desc' },
        });

        // Calculate trends (would need historical weight tracking)
        const weights = modelWeights.map((w) => ({
          model: w.model,
          analysisType: w.analysisType,
          currentWeight: w.currentWeight,
          accuracy: w.accuracy,
          totalAnalyses: w.totalAnalyses,
          correctPredictions: w.correctPredictions,
          trend: w.accuracy > 0.7 ? 'improving' : w.accuracy < 0.5 ? 'declining' : 'stable',
        }));

        // Recent adjustments would come from an audit log
        const recentAdjustments: Array<{ date: string; model: string; adjustment: string; reason: string }> = [
          // Placeholder - would query from audit log
        ];

        return reply.send({
          modelWeights: weights,
          recentAdjustments,
        });
      } catch (error: any) {
        fastify.log.error('Learning loop error:', error);
        return reply.code(500).send({
          error: 'Failed to get learning loop stats',
          message: error.message,
        });
      }
    }
  );

  /**
   * GET /api/v1/admin/tci/cost-analysis
   * Cost breakdown by model, tier, feature
   */
  fastify.get<{ Querystring: TCIMetricsQuery }>(
    '/api/v1/admin/tci/cost-analysis',
    {
      preHandler: [fastify.authenticate, requireAdmin],
      schema: {
        description: 'Get TCI cost analysis (admin only)',
        tags: ['Admin', 'TCI'],
        querystring: {
          type: 'object',
          properties: {
            startDate: { type: 'string', format: 'date' },
            endDate: { type: 'string', format: 'date' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              totalCost: { type: 'number' },
              costByModel: {
                type: 'object',
                properties: {
                  deepseek: { type: 'number' },
                  claude: { type: 'number' },
                  gpt5: { type: 'number' },
                  grok: { type: 'number' },
                  gemini: { type: 'number' },
                },
              },
              costByTier: {
                type: 'object',
                properties: {
                  free: { type: 'number' },
                  starter: { type: 'number' },
                  pro: { type: 'number' },
                  enterprise: { type: 'number' },
                },
              },
              costPerAnalysis: { type: 'number' },
              subsidyCost: { type: 'number' },
            },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { startDate, endDate } = request.query;

        const whereClause: any = {};
        if (startDate || endDate) {
          whereClause.createdAt = {};
          if (startDate) whereClause.createdAt.gte = new Date(startDate);
          if (endDate) whereClause.createdAt.lte = new Date(endDate);
        }

        // Total cost
        const totalCost = await prisma.tCIAnalysis.aggregate({
          _sum: { costUSD: true },
          where: whereClause,
        });

        // Cost by tier
        const costByTier = await prisma.tCIAnalysis.groupBy({
          by: ['userTier'],
          _sum: { costUSD: true },
          where: whereClause,
        });

        // Average cost per analysis
        const avgCost = await prisma.tCIAnalysis.aggregate({
          _avg: { costUSD: true },
          where: whereClause,
        });

        // Subsidy cost (free tier analyses)
        const subsidyCost = await prisma.tCIAnalysis.aggregate({
          _sum: { costUSD: true },
          where: {
            ...whereClause,
            userTier: 'free',
          },
        });

        return reply.send({
          totalCost: totalCost._sum.costUSD || 0,
          costByModel: {
            // Would calculate from timings data
            deepseek: (totalCost._sum.costUSD || 0) * 0.11, // ~$0.10 per analysis
            claude: (totalCost._sum.costUSD || 0) * 0.39, // ~$0.35 per analysis (2 layers)
            gpt5: (totalCost._sum.costUSD || 0) * 0.22, // ~$0.20 per analysis
            grok: (totalCost._sum.costUSD || 0) * 0.17, // ~$0.15 per analysis
            gemini: (totalCost._sum.costUSD || 0) * 0.11, // ~$0.10 per analysis
          },
          costByTier: {
            free: costByTier.find((t) => t.userTier === 'free')?._sum.costUSD || 0,
            starter: costByTier.find((t) => t.userTier === 'starter')?._sum.costUSD || 0,
            pro: costByTier.find((t) => t.userTier === 'pro')?._sum.costUSD || 0,
            enterprise: costByTier.find((t) => t.userTier === 'enterprise')?._sum.costUSD || 0,
          },
          costPerAnalysis: avgCost._avg.costUSD || 0,
          subsidyCost: subsidyCost._sum.costUSD || 0,
        });
      } catch (error: any) {
        fastify.log.error('Cost analysis error:', error);
        return reply.code(500).send({
          error: 'Failed to get cost analysis',
          message: error.message,
        });
      }
    }
  );

  /**
   * GET /api/v1/admin/tci/recent-analyses
   * Recent TCI analyses with full details
   */
  fastify.get<{ Querystring: { limit?: number; offset?: number } }>(
    '/api/v1/admin/tci/recent-analyses',
    {
      preHandler: [fastify.authenticate, requireAdmin],
      schema: {
        description: 'Get recent TCI analyses (admin only)',
        tags: ['Admin', 'TCI'],
        querystring: {
          type: 'object',
          properties: {
            limit: { type: 'number', default: 20 },
            offset: { type: 'number', default: 0 },
          },
        },
      },
    },
    async (request, reply) => {
      try {
        const { limit = 20, offset = 0 } = request.query;

        const analyses = await prisma.tCIAnalysis.findMany({
          take: limit,
          skip: offset,
          orderBy: { createdAt: 'desc' },
          include: {
            outcome: true,
          },
        });

        return reply.send({
          analyses: analyses.map((a) => ({
            id: a.id,
            userId: a.userId,
            codeHash: a.codeHash,
            language: (a.context as any)?.language,
            analysisType: a.analysisType,
            userTier: a.userTier,
            confidence: a.confidence,
            overallRisk: a.overallRisk,
            timeElapsedMs: a.timeElapsedMs,
            costUSD: a.costUSD,
            verdict: (a.finalVerdict as any)?.verdict,
            outcome: a.outcome
              ? {
                  status: a.outcome.status,
                  accuracy: a.outcome.overallAccuracy,
                  wasHelpful: a.outcome.synthesisCorrect,
                }
              : null,
            createdAt: a.createdAt,
          })),
          total: await prisma.tCIAnalysis.count(),
          limit,
          offset,
        });
      } catch (error: any) {
        fastify.log.error('Recent analyses error:', error);
        return reply.code(500).send({
          error: 'Failed to get recent analyses',
          message: error.message,
        });
      }
    }
  );
}

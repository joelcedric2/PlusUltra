/**
 * TCI 6-Layer API Routes
 *
 * Endpoints for multi-model code analysis using 6-layer TCI system.
 *
 * Endpoints:
 * - POST /api/v1/tci/analyze - Full 6-layer analysis
 * - POST /api/v1/tci/analyze/quick - Quick 2-layer analysis (Free tier)
 * - POST /api/v1/tci/feedback - Submit outcome feedback
 * - GET /api/v1/tci/analysis/:id - Get analysis results
 * - GET /api/v1/tci/cost-estimate - Get cost estimate
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { tci6LayerOrchestrator, type TCI6Options } from '../services/tci/TCI6LayerOrchestrator';
import { tciLearningLoopService } from '../services/tci/TCILearningLoopService';
import type { TCIReport } from '../types/tci';
import { prisma } from '../lib/prisma';
import crypto from 'crypto';
import {
  requireFullAnalysisAccess,
  requireQuickAnalysisAccess,
  getUserUsageStats,
} from '../middleware/tciAccessControl';

// Helper function to hash code for deduplication
function hashCode(code: string): string {
  return crypto.createHash('sha256').update(code).digest('hex');
}

// Request/Response types
interface AnalyzeRequest {
  code: string;
  language: string;
  filePath?: string;
  proposedChange?: string;
  implementFixes?: boolean;
}

interface QuickAnalyzeRequest {
  code: string;
  language: string;
  filePath?: string;
}

interface FeedbackRequest {
  analysisId: string;
  wasHelpful: boolean;
  actualOutcome: 'shipped' | 'refactored' | 'rejected';
  bugsFound?: string[];
  breakingChanges?: string[];
  comment?: string;
  layerFeedback?: {
    visualHelpful?: boolean;
    causalHelpful?: boolean;
    historicalHelpful?: boolean;
    logicHelpful?: boolean;
  };
}

interface CostEstimateRequest {
  mode: 'full' | 'quick';
}

export default async function tci6LayerRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/v1/tci/analyze
   * Full 6-layer TCI analysis
   * Cost: $0.90, Time: 20-30s, Accuracy: 93-95%
   */
  fastify.post<{ Body: AnalyzeRequest }>(
    '/api/v1/tci/analyze',
    {
      preValidation: [fastify.authenticate, requireFullAnalysisAccess],
      schema: {
        description: 'Run full 6-layer TCI analysis on code',
        tags: ['TCI'],
        body: {
          type: 'object',
          required: ['code', 'language'],
          properties: {
            code: { type: 'string', description: 'Code to analyze' },
            language: {
              type: 'string',
              enum: ['typescript', 'javascript', 'python', 'go', 'rust'],
              description: 'Programming language',
            },
            filePath: { type: 'string', description: 'Optional file path for context' },
            proposedChange: { type: 'string', description: 'Optional proposed code change' },
            implementFixes: { type: 'boolean', default: false, description: 'Run Layer 6 implementation' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              report: { type: 'object', description: 'Complete TCI report' },
              analysisId: { type: 'string' },
              cost: { type: 'number' },
              timeElapsed: { type: 'number' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: AnalyzeRequest }>, reply: FastifyReply) => {
      try {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized', message: 'Authentication required' });
        }
        const { code, language, filePath, proposedChange, implementFixes } = request.body;
        const { id: userId, tier: userTier } = request.user;

        // Validate code
        if (!code || code.trim().length === 0) {
          return reply.code(400).send({
            error: 'Code cannot be empty',
          });
        }

        const startTime = Date.now();

        // Run full 6-layer analysis
        const options: TCI6Options = {
          mode: 'full',
          language,
          filePath,
          proposedChange,
          implementFixes: implementFixes ?? false,
        };

        const report: TCIReport = await tci6LayerOrchestrator.analyze(code, options);

        const timeElapsed = Date.now() - startTime;
        const cost = tci6LayerOrchestrator.getCostEstimate('full');

        // Store analysis in database
        const analysis = await prisma.tCIAnalysis.create({
          data: {
            userId,
            codeHash: hashCode(code),
            code,
            context: { language, filePath },
            visualInsights: JSON.parse(JSON.stringify(report.visual)) as any,
            causalChain: report.causal ? JSON.parse(JSON.stringify(report.causal)) as any : {},
            historicalInsights: JSON.parse(JSON.stringify(report.historical)) as any,
            logicVerification: JSON.parse(JSON.stringify(report.logic)) as any,
            verdict: JSON.parse(JSON.stringify(report.verdict)) as any,
            finalVerdict: JSON.parse(JSON.stringify(report.verdict)) as any,
            confidence: report.verdict.confidence,
            overallRisk: report.verdict.synthesizedRisk.overall,
            timeElapsedMs: timeElapsed,
            costUSD: cost,
            analysisType: 'full',
            userTier,
          },
        });

        return reply.send({
          report,
          analysisId: analysis.id,
          cost,
          timeElapsed,
          message: 'Full 6-layer analysis complete',
        });
      } catch (error: any) {
        fastify.log.error('TCI analysis error:', error);
        return reply.code(500).send({
          error: 'Analysis failed',
          message: error.message,
        });
      }
    }
  );

  /**
   * POST /api/v1/tci/analyze/quick
   * Quick 2-layer TCI analysis (Free tier)
   * Cost: $0.30, Time: 6-8s, Accuracy: ~75%
   */
  fastify.post<{ Body: QuickAnalyzeRequest }>(
    '/api/v1/tci/analyze/quick',
    {
      preValidation: [fastify.authenticate, requireQuickAnalysisAccess],
      schema: {
        description: 'Run quick 2-layer TCI analysis (Free tier)',
        tags: ['TCI'],
        body: {
          type: 'object',
          required: ['code', 'language'],
          properties: {
            code: { type: 'string', description: 'Code to analyze' },
            language: {
              type: 'string',
              enum: ['typescript', 'javascript', 'python', 'go', 'rust'],
              description: 'Programming language',
            },
            filePath: { type: 'string', description: 'Optional file path for context' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              report: { type: 'object', description: 'Quick TCI report (layers 1 + 3)' },
              analysisId: { type: 'string' },
              cost: { type: 'number' },
              timeElapsed: { type: 'number' },
              upgradePrompt: { type: 'string' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: QuickAnalyzeRequest }>, reply: FastifyReply) => {
      try {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized', message: 'Authentication required' });
        }
        const { code, language, filePath } = request.body;
        const { id: userId, tier: userTier } = request.user;

        // Validate code
        if (!code || code.trim().length === 0) {
          return reply.code(400).send({
            error: 'Code cannot be empty',
          });
        }

        const startTime = Date.now();

        // Run quick 2-layer analysis
        const options: TCI6Options = {
          mode: 'quick',
          language,
          filePath,
          implementFixes: false,
        };

        const report: TCIReport = await tci6LayerOrchestrator.analyze(code, options);

        const timeElapsed = Date.now() - startTime;
        const cost = tci6LayerOrchestrator.getCostEstimate('quick');

        // Store analysis in database
        const analysis = await prisma.tCIAnalysis.create({
          data: {
            userId,
            codeHash: hashCode(code),
            code,
            context: { language, filePath },
            visualInsights: JSON.parse(JSON.stringify(report.visual)) as any,
            causalChain: {}, // Quick mode doesn't include Layer 2
            historicalInsights: JSON.parse(JSON.stringify(report.historical)) as any,
            logicVerification: {}, // Quick mode doesn't include Layer 4
            verdict: JSON.parse(JSON.stringify(report.verdict)) as any,
            finalVerdict: JSON.parse(JSON.stringify(report.verdict)) as any,
            confidence: report.verdict.confidence,
            overallRisk: report.verdict.synthesizedRisk.overall,
            timeElapsedMs: timeElapsed,
            costUSD: cost,
            analysisType: 'quick',
            userTier,
          },
        });

        return reply.send({
          report,
          analysisId: analysis.id,
          cost,
          timeElapsed,
          message: 'Quick analysis complete',
          upgradePrompt: 'Upgrade to Pro for full 6-layer analysis with 93-95% accuracy and automatic fix implementation',
        });
      } catch (error: any) {
        fastify.log.error('TCI quick analysis error:', error);
        return reply.code(500).send({
          error: 'Quick analysis failed',
          message: error.message,
        });
      }
    }
  );

  /**
   * POST /api/v1/tci/feedback
   * Submit outcome feedback for analysis accuracy tracking
   */
  fastify.post<{ Body: FeedbackRequest }>(
    '/api/v1/tci/feedback',
    {
      preValidation: fastify.authenticate, // Require authentication
      schema: {
        description: 'Submit feedback on TCI analysis accuracy',
        tags: ['TCI'],
        body: {
          type: 'object',
          required: ['analysisId', 'wasHelpful', 'actualOutcome'],
          properties: {
            analysisId: { type: 'string' },
            wasHelpful: { type: 'boolean' },
            actualOutcome: {
              type: 'string',
              enum: ['shipped', 'refactored', 'rejected'],
              description: 'What happened to the code',
            },
            bugsFound: {
              type: 'array',
              items: { type: 'string' },
              description: 'Actual bugs discovered after shipping',
            },
            breakingChanges: {
              type: 'array',
              items: { type: 'string' },
              description: 'Actual breaking changes that occurred',
            },
            comment: { type: 'string', description: 'Optional feedback comment' },
            layerFeedback: {
              type: 'object',
              properties: {
                visualHelpful: { type: 'boolean' },
                causalHelpful: { type: 'boolean' },
                historicalHelpful: { type: 'boolean' },
                logicHelpful: { type: 'boolean' },
              },
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              message: { type: 'string' },
              accuracyUpdate: { type: 'object' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Body: FeedbackRequest }>, reply: FastifyReply) => {
      try {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized', message: 'Authentication required' });
        }
        const {
          analysisId,
          wasHelpful,
          actualOutcome,
          bugsFound,
          breakingChanges,
          comment,
          layerFeedback,
        } = request.body;
        const { id: userId } = request.user;

        // Calculate overall accuracy from layer feedback
        const calculateOverallAccuracy = (feedback: any): number => {
          const layers = [
            feedback?.visualHelpful ?? true,
            feedback?.causalHelpful ?? true,
            feedback?.historicalHelpful ?? true,
            feedback?.logicHelpful ?? true,
          ];
          const correctLayers = layers.filter((correct) => correct).length;
          return correctLayers / layers.length;
        };

        // Store outcome in database
        const outcome = await prisma.tCIOutcome.create({
          data: {
            analysisId,
            status: actualOutcome,
            bugsFound: bugsFound || [],
            breakingChanges: breakingChanges || [],
            userFeedback: comment,
            visualCorrect: layerFeedback?.visualHelpful ?? true,
            causalCorrect: layerFeedback?.causalHelpful ?? true,
            historicalCorrect: layerFeedback?.historicalHelpful ?? true,
            logicCorrect: layerFeedback?.logicHelpful ?? true,
            synthesisCorrect: wasHelpful,
            overallAccuracy: calculateOverallAccuracy(layerFeedback),
          },
        });

        // Store feedback record
        const feedback = await prisma.tCIFeedback.create({
          data: {
            analysisId,
            userId,
            rating: wasHelpful ? 5 : 1, // Convert boolean to rating
            wasHelpful,
            comment: comment || '',
          },
        });

        // Trigger learning loop to update model weights and patterns
        fastify.log.info(`[TCI] Processing feedback ${feedback.id} for analysis ${analysisId}`);
        const learningResults = await tciLearningLoopService.processFeedback(feedback.id);

        fastify.log.info(
          `[TCI] Updated ${learningResults.modelWeightsUpdated.length} model weights, added ${learningResults.patternsAdded} patterns`
        );

        return reply.send({
          message: 'Feedback received - thank you for helping improve TCI accuracy',
          accuracyUpdate: {
            message: 'Model weights updated based on your feedback',
            modelsUpdated: learningResults.modelWeightsUpdated,
            patternsAdded: learningResults.patternsAdded,
            newAccuracies: learningResults.accuracyImpact,
          },
        });
      } catch (error: any) {
        fastify.log.error('TCI feedback error:', error);
        return reply.code(500).send({
          error: 'Failed to submit feedback',
          message: error.message,
        });
      }
    }
  );

  /**
   * GET /api/v1/tci/cost-estimate
   * Get cost estimate for analysis
   */
  fastify.get<{ Querystring: CostEstimateRequest }>(
    '/api/v1/tci/cost-estimate',
    {
      preValidation: fastify.authenticate, // Require authentication
      schema: {
        description: 'Get cost estimate for TCI analysis',
        tags: ['TCI'],
        querystring: {
          type: 'object',
          required: ['mode'],
          properties: {
            mode: {
              type: 'string',
              enum: ['full', 'quick'],
              description: 'Analysis mode',
            },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              mode: { type: 'string' },
              cost: { type: 'number' },
              estimatedTime: { type: 'string' },
              accuracy: { type: 'string' },
              layers: { type: 'array', items: { type: 'string' } },
            },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Querystring: CostEstimateRequest }>, reply: FastifyReply) => {
      const { mode } = request.query;

      const cost = tci6LayerOrchestrator.getCostEstimate(mode);
      const estimatedTime = tci6LayerOrchestrator.getTimeEstimate(mode);

      const details = mode === 'quick'
        ? {
            mode: 'quick',
            cost,
            estimatedTime,
            accuracy: '~75%',
            layers: ['Layer 1: Visual Pattern Recognition', 'Layer 3: Historical Pattern Matching'],
          }
        : {
            mode: 'full',
            cost,
            estimatedTime,
            accuracy: '93-95%',
            layers: [
              'Layer 1: Visual Pattern Recognition',
              'Layer 2: Causal Chain Analysis',
              'Layer 3: Historical Pattern Matching',
              'Layer 4: Symbolic Logic Verification',
              'Layer 5: Cross-Model Synthesis',
              'Layer 6: Implementation',
            ],
          };

      return reply.send(details);
    }
  );

  /**
   * GET /api/v1/tci/analysis/:id
   * Get analysis results by ID (TODO: implement database retrieval)
   */
  fastify.get<{ Params: { id: string } }>(
    '/api/v1/tci/analysis/:id',
    {
      preValidation: fastify.authenticate, // Require authentication
      schema: {
        description: 'Get TCI analysis results by ID',
        tags: ['TCI'],
        params: {
          type: 'object',
          required: ['id'],
          properties: {
            id: { type: 'string' },
          },
        },
      },
    },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized', message: 'Authentication required' });
        }
        const { id } = request.params;
        const { id: userId } = request.user;

        // Retrieve analysis from database
        const analysis = await prisma.tCIAnalysis.findUnique({
          where: { id, userId }, // Ensure user owns the analysis
          include: { outcome: true },
        });

        if (!analysis) {
          return reply.code(404).send({
            error: 'Analysis not found or you do not have permission',
            message: `No analysis found with ID: ${id} for user ${userId}`,
          });
        }

        // Reconstruct the TCI report from stored data
        const report: TCIReport = {
          visual: analysis.visualInsights as any,
          causal: analysis.causalChain as any,
          historical: analysis.historicalInsights as any,
          logic: analysis.logicVerification as any,
          verdict: analysis.finalVerdict as any,
          timings: { visual: 0, causal: 0, historical: 0, logic: 0, synthesis: 0, implementation: 0 }, // Timings not stored separately
          implementation: { improvedCode: '', explanation: '', bugsFixes: [], risks: [] } as any, // May not be present in stored data
        };

        return reply.send({
          analysis: {
            id: analysis.id,
            code: analysis.code,
            codeHash: analysis.codeHash,
            context: analysis.context,
            analysisType: analysis.analysisType,
            userTier: analysis.userTier,
            confidence: analysis.confidence,
            overallRisk: analysis.overallRisk,
            timeElapsedMs: analysis.timeElapsedMs,
            costUSD: analysis.costUSD,
            createdAt: analysis.createdAt,
          },
          report,
          outcome: analysis.outcome
            ? {
                status: analysis.outcome.status,
                bugsFound: analysis.outcome.bugsFound,
                breakingChanges: analysis.outcome.breakingChanges,
                userFeedback: analysis.outcome.userFeedback,
                visualCorrect: analysis.outcome.visualCorrect,
                causalCorrect: analysis.outcome.causalCorrect,
                historicalCorrect: analysis.outcome.historicalCorrect,
                logicCorrect: analysis.outcome.logicCorrect,
                synthesisCorrect: analysis.outcome.synthesisCorrect,
                overallAccuracy: analysis.outcome.overallAccuracy,
                createdAt: analysis.outcome.createdAt,
              }
            : null,
        });
      } catch (error: any) {
        fastify.log.error('TCI analysis retrieval error:', error);
        return reply.code(500).send({
          error: 'Failed to retrieve analysis',
          message: error.message,
        });
      }
    }
  );

  /**
   * GET /api/v1/tci/usage
   * Get user's TCI usage statistics
   */
  fastify.get('/api/v1/tci/usage', { preValidation: fastify.authenticate }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      if (!request.user) {
        return reply.code(401).send({ error: 'Unauthorized', message: 'Authentication required' });
      }
      const userId = request.user.id;
      const userTier = request.user.tier;

      const stats = await getUserUsageStats(userId, userTier);

      return reply.send({
        tier: stats.tier,
        today: {
          quickAnalyses: stats.today.quickAnalyses,
          fullAnalyses: stats.today.fullAnalyses,
          quickRemaining: Math.max(0, stats.today.quickLimit - stats.today.quickAnalyses),
          fullRemaining: Math.max(0, stats.today.fullLimit - stats.today.fullAnalyses),
          quickLimit: stats.today.quickLimit,
          fullLimit: stats.today.fullLimit,
        },
        thisMonth: {
          quickAnalyses: stats.thisMonth.quickAnalyses,
          fullAnalyses: stats.thisMonth.fullAnalyses,
          totalCost: stats.thisMonth.totalCost,
        },
        allTime: {
          totalAnalyses: stats.allTime.totalAnalyses,
          totalCost: stats.allTime.totalCost,
        },
        upgradeOptions: stats.tier === 'free' || stats.tier === 'starter' ? {
          pro: {
            tier: 'pro',
            price: '$29/month',
            features: [
              'Unlimited full 6-layer analysis',
              'Unlimited quick analysis',
              'Automatic fix implementation',
              '93-95% accuracy',
              'Priority support',
            ],
          },
          enterprise: {
            tier: 'enterprise',
            price: 'Custom pricing',
            features: [
              'Everything in Pro',
              'Priority processing',
              'Custom SLAs',
              'Dedicated support',
              'On-premise deployment options',
            ],
          },
        } : undefined,
      });
    } catch (error: any) {
      fastify.log.error('TCI usage stats error:', error);
      return reply.code(500).send({
        error: 'Failed to retrieve usage statistics',
        message: error.message,
      });
    }
  });
}


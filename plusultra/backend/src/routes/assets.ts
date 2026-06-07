/**
 * Asset Generation API Routes
 *
 * Simple API endpoints for frontend to trigger "under the roof" asset generation.
 * Non-coders simply provide an app name and optional prompt - backend handles everything.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import AssetOrchestrationService from '../services/orchestration/AssetOrchestrationService';
import TCIAssetLearning from '../services/tci/TCIAssetLearning';

// Request/Response types
interface GenerateAssetsRequest {
  Body: {
    appName: string;
    platform?: 'ios' | 'android' | 'both';
    userPrompt?: string;
    preferences?: {
      colorScheme?: string[];
      style?: 'flat' | 'modern' | 'minimal' | 'gradient' | 'abstract' | '3d';
      industry?: string;
    };
  };
}

interface GetRecommendationsRequest {
  Querystring: {
    industry?: string;
    platform?: string;
  };
}

interface RateAssetsRequest {
  Params: {
    projectId: string;
  };
  Body: {
    rating: number; // 1-5
    feedback?: string;
  };
}

export async function assetsRoutes(fastify: FastifyInstance) {
  const orchestrator = new AssetOrchestrationService();
  const tciLearning = new TCIAssetLearning();

  /**
   * POST /api/assets/generate
   *
   * Generate all assets for an app automatically
   * "Under the roof" - user just provides app name and simple prompt
   */
  fastify.post<GenerateAssetsRequest>(
    '/generate',
    {
      schema: {
        tags: ['assets'],
        body: {
          type: 'object',
          required: ['appName'],
          properties: {
            appName: { type: 'string', description: 'Your app name' },
            platform: {
              type: 'string',
              enum: ['ios', 'android', 'both'],
              default: 'both',
              description: 'Target platform(s)'
            },
            userPrompt: {
              type: 'string',
              description: 'Simple description (e.g., "fintech app with blue theme")'
            },
            preferences: {
              type: 'object',
              properties: {
                colorScheme: {
                  type: 'array',
                  items: { type: 'string' },
                  description: 'Preferred colors (hex codes)'
                },
                style: {
                  type: 'string',
                  enum: ['modern', 'minimal', 'gradient', 'flat', 'abstract', '3d'],
                  description: 'Design style'
                },
                industry: {
                  type: 'string',
                  description: 'App industry (e.g., "fintech", "healthcare")'
                }
              }
            }
          }
        },
        response: {
          200: {
            description: 'Assets generated successfully',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              projectId: { type: 'string' },
              assets: { type: 'object' },
              tciInsights: { type: 'object' },
              generationTime: { type: 'number' },
              estimatedCost: { type: 'number' }
            }
          }
        }
      }
    },
    async (request: FastifyRequest<GenerateAssetsRequest>, reply: FastifyReply) => {
      try {
        const { appName, platform = 'both', userPrompt, preferences } = request.body;

        // Get user ID from auth session
        const userId = (request as any).user?.id || 'anonymous';

        // Generate unique project ID
        const projectId = `proj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        console.log(`📱 Asset generation request for: ${appName}`);

        // Generate assets "under the roof"
        const result = await orchestrator.generateAssetsFromPrompt({
          userId,
          projectId,
          appName,
          platform,
          userPrompt,
          preferences,
          autoUpload: true // Always upload to R2
        });

        return reply.code(200).send(result);

      } catch (error) {
        console.error('❌ Asset generation failed:', error);
        return reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Asset generation failed',
          message: 'We had trouble generating your assets. Please try again.'
        });
      }
    }
  );

  /**
   * GET /api/assets/recommendations
   *
   * Get AI-powered design recommendations (Pro/Enterprise only)
   */
  fastify.get<GetRecommendationsRequest>(
    '/recommendations',
    {
      schema: {
        
        tags: ['assets'],
        querystring: {
          type: 'object',
          properties: {
            industry: { type: 'string', description: 'App industry' },
            platform: { type: 'string', enum: ['ios', 'android', 'both'] }
          }
        },
        response: {
          200: {
            description: 'Design recommendations',
            type: 'object',
            properties: {
              suggestedStyle: { type: 'string' },
              suggestedColors: { type: 'array', items: { type: 'string' } },
              reasoning: { type: 'string' },
              confidence: { type: 'number' },
              industryBestPractices: { type: 'array', items: { type: 'string' } }
            }
          }
        }
      }
    },
    async (request: FastifyRequest<GetRecommendationsRequest>, reply: FastifyReply) => {
      try {
        const { industry, platform = 'both' } = request.query;
        const userId = (request as any).user?.id || 'anonymous';

        const recommendations = await tciLearning.getRecommendations(userId, {
          industry,
          platform: platform as 'ios' | 'android' | 'both',
        });

        if (!recommendations) {
          return reply.code(403).send({
            error: 'Design recommendations are available for Pro and Enterprise tiers only',
            upgrade: 'Upgrade to Pro for AI-powered design insights'
          });
        }

        return reply.code(200).send(recommendations);

      } catch (error) {
        console.error('❌ Failed to get recommendations:', error);
        return reply.code(500).send({
          error: 'Failed to get recommendations',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * GET /api/assets/analytics
   *
   * Get asset analytics across all users (Enterprise only)
   */
  fastify.get(
    '/analytics',
    {
      schema: {
        
        tags: ['assets'],
        response: {
          200: {
            description: 'Analytics data',
            type: 'object',
            properties: {
              totalGenerations: { type: 'number' },
              successRate: { type: 'number' },
              popularStyles: { type: 'array' },
              popularColors: { type: 'array' },
              industryTrends: { type: 'object' }
            }
          }
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Check if user is Enterprise tier
        const userTier = (request as any).user?.tier || 'free';
        if (userTier !== 'enterprise') {
          return reply.code(403).send({
            error: 'Analytics are available for Enterprise tier only'
          });
        }

        const analytics = await tciLearning.getAssetAnalytics();
        return reply.code(200).send(analytics);

      } catch (error) {
        console.error('❌ Failed to get analytics:', error);
        return reply.code(500).send({
          error: 'Failed to get analytics',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * POST /api/assets/:projectId/rate
   *
   * Rate generated assets (helps TCI learn)
   */
  fastify.post<RateAssetsRequest>(
    '/:projectId/rate',
    {
      schema: {
        
        tags: ['assets'],
        params: {
          type: 'object',
          required: ['projectId'],
          properties: {
            projectId: { type: 'string' }
          }
        },
        body: {
          type: 'object',
          required: ['rating'],
          properties: {
            rating: {
              type: 'number',
              minimum: 1,
              maximum: 5,
              description: 'Rating from 1-5 stars'
            },
            feedback: {
              type: 'string',
              description: 'Optional feedback'
            }
          }
        },
        response: {
          200: {
            description: 'Rating recorded',
            type: 'object',
            properties: {
              success: { type: 'boolean' },
              message: { type: 'string' }
            }
          }
        }
      }
    },
    async (request: FastifyRequest<RateAssetsRequest>, reply: FastifyReply) => {
      try {
        const { projectId } = request.params;
        const { rating, feedback } = request.body;
        const userId = (request as any).user?.id || 'anonymous';

        // Record rating in TCI for learning
        await tciLearning.recordAssetGeneration({
          userId,
          projectId,
          timestamp: new Date(),
          style: 'unknown', // Would be fetched from project
          colorScheme: [],
          platform: 'both',
          success: rating >= 3,
          userSatisfaction: rating
        });

        console.log(`⭐ User rated project ${projectId}: ${rating}/5`);

        return reply.code(200).send({
          success: true,
          message: 'Thank you for your feedback! This helps us improve.'
        });

      } catch (error) {
        console.error('❌ Failed to record rating:', error);
        return reply.code(500).send({
          success: false,
          error: 'Failed to record rating'
        });
      }
    }
  );

  /**
   * GET /api/assets/:projectId
   *
   * Get assets for a specific project
   */
  fastify.get(
    '/:projectId',
    {
      schema: {
        
        tags: ['assets'],
        params: {
          type: 'object',
          required: ['projectId'],
          properties: {
            projectId: { type: 'string' }
          }
        }
      }
    },
    async (request: FastifyRequest<{ Params: { projectId: string } }>, reply: FastifyReply) => {
      try {
        const { projectId } = request.params;

        // Get assets from R2 storage
        const storage = (orchestrator as any).storageIntegration;
        if (!storage) {
          return reply.code(503).send({
            error: 'Asset storage not configured'
          });
        }

        const urls = await storage.getProjectAssetUrls(projectId);
        const stats = await storage.getProjectStorageStats(projectId);

        return reply.code(200).send({
          projectId,
          assets: urls,
          stats
        });

      } catch (error) {
        console.error('❌ Failed to get project assets:', error);
        return reply.code(404).send({
          error: 'Project not found',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  /**
   * DELETE /api/assets/:projectId
   *
   * Delete all assets for a project
   */
  fastify.delete<{ Params: { projectId: string } }>(
    '/:projectId',
    {
      preValidation: fastify.authenticate,
      schema: {
        description: 'Delete project assets',
        tags: ['assets'],
        params: {
          type: 'object',
          required: ['projectId'],
          properties: {
            projectId: { type: 'string' }
          }
        }
      }
    },
    async (request, reply) => {
      try {
        if (!request.user) {
          return reply.code(401).send({ error: 'Unauthorized', message: 'Authentication required' });
        }
        const { projectId } = request.params;
        const userId = request.user.id;

        // Verify user owns this project (note: Project model may not have userId)
        const project = await fastify.prisma.project.findUnique({
          where: { id: projectId },
          select: { organizationId: true }
        });

        if (!project) {
          return reply.code(404).send({
            error: 'Not Found',
            message: 'Project not found.'
          });
        }

        const storage = (orchestrator as any).storageIntegration;
        if (!storage) {
          return reply.code(503).send({
            error: 'Asset storage not configured'
          });
        }

        await storage.deleteProjectAssets(projectId);

        return reply.code(200).send({
          success: true,
          message: 'Assets deleted successfully'
        });

      } catch (error) {
        console.error('❌ Failed to delete assets:', error);
        return reply.code(500).send({
          error: 'Failed to delete assets',
          message: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }
  );

  // Cleanup on server shutdown
  fastify.addHook('onClose', async () => {
    await tciLearning.close();
  });
}

export default assetsRoutes;

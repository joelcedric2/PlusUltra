import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { MultiAIOrchestrator, OrchestratedRequest } from '../../services/ai/MultiAIOrchestrator';
import { enforceTier, TierPresets } from '../../middleware/TierEnforcementMiddleware';

/**
 * AI Orchestrator Routes
 * Handles multi-AI orchestration and project manager workflows
 */

export async function aiOrchestratorRoutes(fastify: FastifyInstance) {
  const orchestrator = new MultiAIOrchestrator();

  /**
   * POST /api/v1/ai/orchestrate
   * Orchestrate multiple AI models to complete a task
   */
  fastify.post<{
    Body: {
      task: string;
      context?: string;
      taskType: 'code_generation' | 'app_design' | 'project_planning' | 'debugging' | 'optimization';
      requireConsensus?: boolean;
      models?: Array<'claude' | 'gpt5' | 'gemini' | 'grok' | 'deepseek'>;
      maxTokensPerModel?: number;
    };
  }>(
    '/api/v1/ai/orchestrate',
    {
      preHandler: enforceTier({
        requiresToken: true,
        estimatedTokenCost: 10_000_000, // Estimate 10M tokens (10 PT)
      }),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request as any).user?.id;
      const { task, context, taskType, requireConsensus, models, maxTokensPerModel } =
        request.body as any;

      try {
        const result = await orchestrator.orchestrate({
          userId,
          task,
          context,
          taskType,
          requireConsensus,
          models,
          maxTokensPerModel,
        });

        reply.send({
          success: true,
          result,
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Orchestration failed',
        });
      }
    }
  );

  /**
   * POST /api/v1/ai/project-manager
   * Complete app generation workflow with all 4 AIs
   */
  fastify.post<{
    Body: {
      projectDescription: string;
      platform: 'ios' | 'android' | 'web' | 'all';
      features?: string[];
    };
  }>(
    '/api/v1/ai/project-manager',
    {
      preHandler: enforceTier({
        requiresToken: true,
        estimatedTokenCost: 50_000_000, // Estimate 50M tokens (50 PT) for full project
      }),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request as any).user?.id;
      const { projectDescription, platform, features } = request.body as any;

      try {
        const result = await orchestrator.manageProject({
          userId,
          projectDescription,
          platform,
          features,
        });

        reply.send({
          success: true,
          result,
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Project generation failed',
        });
      }
    }
  );

  /**
   * POST /api/v1/ai/code-generation
   * Generate code with Grok, Claude, and GPT-4
   */
  fastify.post<{
    Body: {
      description: string;
      language?: string;
      framework?: string;
      requirements?: string[];
    };
  }>(
    '/api/v1/ai/code-generation',
    {
      preHandler: enforceTier({
        requiresToken: true,
        estimatedTokenCost: 15_000_000, // 15M tokens (15 PT)
      }),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request as any).user?.id;
      const { description, language, framework, requirements } = request.body as any;

      const context = [
        language && `Language: ${language}`,
        framework && `Framework: ${framework}`,
        requirements && `Requirements:\n${requirements.join('\n')}`,
      ]
        .filter(Boolean)
        .join('\n\n');

      try {
        const result = await orchestrator.orchestrate({
          userId,
          task: description,
          context,
          taskType: 'code_generation',
          requireConsensus: true,
          models: ['grok', 'claude', 'gpt5'], // Grok leads, GPT-5 reviews
        });

        reply.send({
          success: true,
          code: result.finalResponse,
          metadata: {
            modelsUsed: result.allResponses.map((r) => r.model),
            tokensUsed: result.plusultraTokensConsumed,
            consensusReached: result.consensusReached,
            votingResults: result.votingResults,
          },
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Code generation failed',
        });
      }
    }
  );

  /**
   * POST /api/v1/ai/app-design
   * Design app with GPT-4, Claude, and Gemini
   */
  fastify.post<{
    Body: {
      appIdea: string;
      targetAudience?: string;
      features?: string[];
      brandGuidelines?: string;
    };
  }>(
    '/api/v1/ai/app-design',
    {
      preHandler: enforceTier({
        requiresToken: true,
        estimatedTokenCost: 10_000_000, // 10M tokens (10 PT)
      }),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request as any).user?.id;
      const { appIdea, targetAudience, features, brandGuidelines } = request.body as any;

      const context = [
        targetAudience && `Target Audience: ${targetAudience}`,
        features && `Features: ${features.join(', ')}`,
        brandGuidelines && `Brand Guidelines: ${brandGuidelines}`,
      ]
        .filter(Boolean)
        .join('\n\n');

      try {
        const result = await orchestrator.orchestrate({
          userId,
          task: appIdea,
          context,
          taskType: 'app_design',
          requireConsensus: true,
          models: ['gpt5', 'claude', 'gemini'], // GPT-5 leads design
        });

        reply.send({
          success: true,
          design: result.finalResponse,
          metadata: {
            modelsUsed: result.allResponses.map((r) => r.model),
            tokensUsed: result.plusultraTokensConsumed,
            consensusReached: result.consensusReached,
          },
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'App design failed',
        });
      }
    }
  );

  /**
   * POST /api/v1/ai/debug
   * Debug code with Grok and Claude
   */
  fastify.post<{
    Body: {
      code: string;
      error?: string;
      expectedBehavior?: string;
    };
  }>(
    '/api/v1/ai/debug',
    {
      preHandler: enforceTier({
        requiresToken: true,
        estimatedTokenCost: 5_000_000, // 5M tokens (5 PT)
      }),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request as any).user?.id;
      const { code, error, expectedBehavior } = request.body as any;

      const context = [
        error && `Error: ${error}`,
        expectedBehavior && `Expected: ${expectedBehavior}`,
      ]
        .filter(Boolean)
        .join('\n\n');

      try {
        const result = await orchestrator.orchestrate({
          userId,
          task: `Debug this code:\n\`\`\`\n${code}\n\`\`\``,
          context,
          taskType: 'debugging',
          requireConsensus: false,
          models: ['grok', 'claude'], // Grok and Claude
        });

        reply.send({
          success: true,
          solution: result.finalResponse,
          metadata: {
            modelsUsed: result.allResponses.map((r) => r.model),
            tokensUsed: result.plusultraTokensConsumed,
          },
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Debugging failed',
        });
      }
    }
  );

  /**
   * POST /api/v1/ai/optimize
   * Optimize code with Gemini, Grok, and Claude
   */
  fastify.post<{
    Body: {
      code: string;
      optimizationGoals?: Array<'performance' | 'readability' | 'maintainability' | 'security'>;
    };
  }>(
    '/api/v1/ai/optimize',
    {
      preHandler: enforceTier({
        requiresToken: true,
        estimatedTokenCost: 8_000_000, // 8M tokens (8 PT)
      }),
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const userId = (request as any).user?.id;
      const { code, optimizationGoals } = request.body as any;

      const context = optimizationGoals
        ? `Optimization Goals: ${optimizationGoals.join(', ')}`
        : '';

      try {
        const result = await orchestrator.orchestrate({
          userId,
          task: `Optimize this code:\n\`\`\`\n${code}\n\`\`\``,
          context,
          taskType: 'optimization',
          requireConsensus: true,
          models: ['gemini', 'grok', 'claude'], // Gemini leads
        });

        reply.send({
          success: true,
          optimizedCode: result.finalResponse,
          metadata: {
            modelsUsed: result.allResponses.map((r) => r.model),
            tokensUsed: result.plusultraTokensConsumed,
            consensusReached: result.consensusReached,
          },
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Optimization failed',
        });
      }
    }
  );

  /**
   * GET /api/v1/ai/models
   * Get information about available AI models
   */
  fastify.get('/api/v1/ai/models', async (request, reply) => {
    reply.send({
      models: [
        {
          name: 'claude',
          provider: 'Anthropic',
          specialization: 'Complex reasoning and logical analysis',
          priority: 1,
          version: 'claude-sonnet-4-5-20250929',
        },
        {
          name: 'gpt5',
          provider: 'OpenAI',
          specialization: 'Creative solutions and innovation',
          priority: 2,
          version: 'gpt-5',
        },
        {
          name: 'gemini',
          provider: 'Google',
          specialization: 'Data analysis and insights',
          priority: 3,
          version: 'gemini-2.5-pro',
        },
        {
          name: 'grok',
          provider: 'xAI',
          specialization: 'High-quality code generation and logical reasoning',
          priority: 4,
          version: 'grok-2',
        },
        {
          name: 'deepseek',
          provider: 'DeepSeek',
          specialization: 'Optical character recognition and image understanding',
          priority: 5,
          version: 'deepseek-ocr-v1',
        },
      ],
      taskTypes: [
        {
          type: 'code_generation',
          estimatedTokens: 15,
          recommendedModels: ['grok', 'claude', 'gpt5'],
        },
        {
          type: 'app_design',
          estimatedTokens: 10,
          recommendedModels: ['gpt5', 'claude', 'gemini'],
        },
        {
          type: 'project_planning',
          estimatedTokens: 20,
          recommendedModels: ['claude', 'gpt5', 'gemini', 'grok'],
        },
        {
          type: 'debugging',
          estimatedTokens: 5,
          recommendedModels: ['grok', 'claude'],
        },
        {
          type: 'optimization',
          estimatedTokens: 8,
          recommendedModels: ['gemini', 'grok', 'claude'],
        },
      ],
    });
  });
}

export default aiOrchestratorRoutes;

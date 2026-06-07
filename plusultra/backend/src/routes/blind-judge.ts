import { FastifyPluginAsync, FastifyReply } from 'fastify';
import { TCIOrchestrator } from '../services/tci/TCIOrchestrator';
import { TruthConsistencyInterface, TCIModelOutput } from '../services/tci/TruthConsistencyInterface';

/**
 * Blind Judge API Routes
 *
 * Claude acts as an unbiased judge, scoring code quality
 * WITHOUT seeing other AI models' scores first.
 *
 * Workflow:
 * 1. GPT-5 and Grok generate code (Claude excluded from generation)
 * 2. Claude judges code quality blindly (sees code + historical context only)
 * 3. Claude commits to a confidence score (0-100%)
 * 4. Only AFTER commitment, other scores are revealed
 * 5. Consensus determined: approved (≥90%), needs_review (50-89%), quarantined (<50%)
 */
const blindJudgeRoutes: FastifyPluginAsync = async (fastify) => {

  /**
   * POST /api/v1/blind-judge/validate
   *
   * Validate generated code using Claude as blind judge
   *
   * Request body:
   * {
   *   "codeGenerated": "function hello() { return 'world'; }",
   *   "intent": "Create a hello world function",
   *   "otherModelOutputs": [
   *     {
   *       "model": "gpt-5",
   *       "output": "...",
   *       "confidence": 0.95,
   *       "processingTime": 1234,
   *       "metadata": { "reasoning": "...", "domain": "javascript" }
   *     },
   *     {
   *       "model": "grok-2",
   *       "output": "...",
   *       "confidence": 0.88,
   *       "processingTime": 987,
   *       "metadata": { "reasoning": "...", "domain": "javascript" }
   *     }
   *   ],
   *   "projectId": "proj_123",
   *   "targetFile": "src/utils/hello.ts",
   *   "environment": "production"
   * }
   *
   * Response:
   * {
   *   "consensusResult": {
   *     "claudeJudgment": {
   *       "confidenceScore": 92,
   *       "reasoning": "Code follows best practices...",
   *       "approved": true,
   *       ...
   *     },
   *     "otherScores": [...],
   *     "finalDecision": "approved",
   *     "consensusScore": 91.67,
   *     "explanation": "..."
   *   },
   *   "claudeApproved": true,
   *   "finalDecision": "approved",
   *   "performanceMetrics": {
   *     "claudeJudgmentLatency": 2345,
   *     "consensusCalculationLatency": 12,
   *     "totalLatency": 2357
   *   }
   * }
   */
  fastify.post('/validate', {
    schema: {
      tags: ['Blind Judge'],
      body: {
        type: 'object',
        required: ['codeGenerated', 'intent', 'otherModelOutputs'],
        properties: {
          codeGenerated: { type: 'string' },
          intent: { type: 'string' },
          otherModelOutputs: {
            type: 'array',
            items: {
              type: 'object',
              required: ['model', 'output', 'confidence', 'processingTime', 'metadata'],
              properties: {
                model: { type: 'string' },
                output: { type: 'string' },
                confidence: { type: 'number', minimum: 0, maximum: 1 },
                processingTime: { type: 'number' },
                metadata: {
                  type: 'object',
                  properties: {
                    reasoning: { type: 'string' },
                    domain: { type: 'string' },
                    contextHash: { type: 'string' }
                  }
                }
              }
            }
          },
          projectId: { type: 'string' },
          targetFile: { type: 'string' },
          environment: { type: 'string' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            consensusResult: { type: 'object' },
            claudeApproved: { type: 'boolean' },
            finalDecision: { type: 'string', enum: ['approved', 'quarantined', 'needs_review'] },
            performanceMetrics: {
              type: 'object',
              properties: {
                claudeJudgmentLatency: { type: 'number' },
                consensusCalculationLatency: { type: 'number' },
                totalLatency: { type: 'number' }
              }
            }
          }
        }
      }
    }
  }, async (request, reply) => {
    const {
      codeGenerated,
      intent,
      otherModelOutputs,
      projectId,
      targetFile,
      environment
    } = request.body as {
      codeGenerated: string;
      intent: string;
      otherModelOutputs: TCIModelOutput[];
      projectId?: string;
      targetFile?: string;
      environment?: string;
    };

    try {
      // Initialize TCI and Orchestrator
      // In production, these would be singletons or injected via DI
      const tci = new TruthConsistencyInterface(
        {
          openaiApiKey: process.env.OPENAI_API_KEY!,
          anthropicApiKey: process.env.ANTHROPIC_API_KEY!,
          xaiApiKey: process.env.XAI_API_KEY
        } as any,
        null as any // vectorDb - would be Neo4j in production
      );

      const vectorDb = null as any; // Would be Neo4j connection in production

      const orchestrator = new TCIOrchestrator(tci, vectorDb, {
        cacheOptions: { maxSize: 1000, defaultTTL: 3600000 },
        embeddingConfig: {
          openaiApiKey: process.env.OPENAI_API_KEY,
          anthropicApiKey: process.env.ANTHROPIC_API_KEY
        }
      });

      fastify.log.info('🎯 Starting blind judge validation...');

      // Execute blind judge orchestration
      const result = await orchestrator.orchestrateWithBlindJudge(
        codeGenerated,
        intent,
        otherModelOutputs,
        projectId,
        targetFile,
        environment
      );

      fastify.log.info(
        { decision: result.finalDecision, latency: result.performanceMetrics.totalLatency },
        '✅ Blind judge validation complete'
      );

      return reply.code(200).send(result);

    } catch (error: any) {
      fastify.log.error({ error }, '❌ Blind judge validation failed');

      return (reply as any).code(500).send({
        error: 'Blind judge validation failed',
        message: error.message,
        consensusResult: {
          claudeJudgment: {
            confidenceScore: 0,
            reasoning: `System error: ${error.message}`,
            riskFactors: ['Validation system failure'],
            qualityAssessment: {
              correctness: 0,
              security: 0,
              maintainability: 0,
              performance: 0
            },
            approved: false,
            historicalAlignment: 0
          },
          otherScores: [],
          finalDecision: 'quarantined' as const,
          consensusScore: 0,
          explanation: 'Validation failed due to system error'
        },
        claudeApproved: false,
        finalDecision: 'quarantined' as const,
        performanceMetrics: {
          claudeJudgmentLatency: 0,
          consensusCalculationLatency: 0,
          totalLatency: 0
        }
      });
    }
  });

  /**
   * GET /api/v1/blind-judge/health
   *
   * Check if blind judge system is operational
   */
  fastify.get('/health', async (request, reply) => {
    const anthropicConfigured = !!process.env.ANTHROPIC_API_KEY;

    return reply.code(200).send({
      status: anthropicConfigured ? 'healthy' : 'degraded',
      components: {
        claudeBlindScoring: true,
        tciOrchestrator: true,
        anthropicApi: anthropicConfigured
      },
      timestamp: new Date().toISOString()
    });
  });

  /**
   * GET /api/v1/blind-judge/info
   *
   * Get information about the blind judge system
   */
  fastify.get('/info', async (request, reply) => {
    return reply.code(200).send({
      name: 'Claude Blind Judge',
      version: '1.0.0',
      description: 'Claude acts as an unbiased judge, scoring code quality without seeing other AI models\' scores first',
      workflow: [
        '1. GPT-5 and Grok generate code',
        '2. Claude judges code quality blindly (sees code + historical context only)',
        '3. Claude commits to a confidence score (0-100%)',
        '4. Only AFTER commitment, other scores are revealed',
        '5. Consensus determined: approved (≥90%), needs_review (50-89%), quarantined (<50%)'
      ],
      thresholds: {
        autoApproval: '≥ 90%',
        needsReview: '50-89%',
        quarantined: '< 50%'
      },
      features: [
        'Blind scoring prevents bias',
        'Historical context from TCI',
        'Multi-dimensional quality assessment',
        'Automatic quarantine enforcement',
        'Performance metrics tracking'
      ]
    });
  });
};

export default blindJudgeRoutes;

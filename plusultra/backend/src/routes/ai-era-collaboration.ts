import { FastifyPluginAsync } from 'fastify';
import { WebSocket } from 'ws';
import CollectiveIntelligenceOrchestrator, {
  Stakeholder,
  CollaborativePrompt,
  RefinementRequest,
} from '../services/collaboration/CollectiveIntelligenceOrchestrator';
import TCIChatAssistant from '../services/tci/TCIChatAssistant';
import GoogleDocsStyleCollaboration from '../services/collaboration/GoogleDocsStyleCollaboration';

/**
 * AI-Era Collaboration API Routes
 *
 * Enables multiple stakeholders to think together, orchestrating AI agents
 * to create cohesive solutions.
 *
 * Evolution:
 * - Traditional: Multiple people typing code together
 * - AI-Era: Multiple people prompting AI together
 *
 * Use Case:
 * 👤 Product Manager: "Add Stripe subscriptions"
 * 👤 Designer: "Match our brand colors"
 * 👤 Developer: "Handle failed payments"
 * 👤 Founder: "Add annual billing discount"
 * 🤖 AI: *generates unified solution satisfying ALL requirements*
 */

// Singleton services
const tciChat = new TCIChatAssistant();
const collaboration = new GoogleDocsStyleCollaboration();
const orchestrator = new CollectiveIntelligenceOrchestrator(tciChat, collaboration);

const aiEraCollaborationRoutes: FastifyPluginAsync = async (fastify) => {

  /**
   * POST /api/v1/ai-collab/session
   *
   * Create new collective intelligence session
   */
  fastify.post('/session', async (request, reply) => {
    const { sessionId, projectId, stakeholder } = request.body as {
      sessionId: string;
      projectId: string;
      stakeholder: Stakeholder;
    };

    if (!sessionId || !projectId || !stakeholder) {
      return reply.status(400).send({
        error: 'Missing required fields: sessionId, projectId, stakeholder',
      });
    }

    try {
      const session = orchestrator.createSession(sessionId, projectId, stakeholder);

      fastify.log.info(
        { sessionId, projectId, stakeholder: stakeholder.name },
        '🎭 Collective intelligence session created'
      );

      return reply.code(201).send({
        session: {
          sessionId: session.sessionId,
          projectId: session.projectId,
          stakeholders: Array.from(session.stakeholders.values()),
          status: session.status,
          createdAt: session.createdAt,
        },
      });
    } catch (error: any) {
      fastify.log.error({ error }, '❌ Failed to create session');
      return reply.status(500).send({ error: error.message });
    }
  });

  /**
   * POST /api/v1/ai-collab/session/:sessionId/stakeholder
   *
   * Add stakeholder to session
   */
  fastify.post('/session/:sessionId/stakeholder', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const { stakeholder } = request.body as { stakeholder: Stakeholder };

    if (!stakeholder) {
      return reply.status(400).send({ error: 'Missing stakeholder data' });
    }

    try {
      orchestrator.addStakeholder(sessionId, stakeholder);

      fastify.log.info(
        { sessionId, stakeholder: stakeholder.name },
        '👤 Stakeholder joined session'
      );

      return reply.code(200).send({
        message: 'Stakeholder added',
        stakeholder,
      });
    } catch (error: any) {
      return reply.status(404).send({ error: error.message });
    }
  });

  /**
   * POST /api/v1/ai-collab/session/:sessionId/prompt
   *
   * Submit prompt from stakeholder
   *
   * Example:
   * {
   *   "stakeholderId": "user_123",
   *   "content": "Add Stripe subscriptions with 3 plans",
   *   "priority": "high",
   *   "constraints": ["Must support annual billing", "20% discount for annual"],
   *   "examples": ["Basic ($9/mo), Pro ($29/mo), Enterprise ($99/mo)"]
   * }
   */
  fastify.post('/session/:sessionId/prompt', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const { stakeholderId, content, priority, constraints, examples } = request.body as {
      stakeholderId: string;
      content: string;
      priority?: 'low' | 'medium' | 'high' | 'critical';
      constraints?: string[];
      examples?: string[];
    };

    if (!stakeholderId || !content) {
      return reply.status(400).send({ error: 'Missing stakeholderId or content' });
    }

    try {
      const prompt = await orchestrator.submitPrompt(
        sessionId,
        stakeholderId,
        content,
        priority,
        constraints,
        examples
      );

      fastify.log.info(
        { sessionId, stakeholder: prompt.stakeholderName, content: content.substring(0, 50) },
        '💬 Prompt submitted'
      );

      return reply.code(201).send({ prompt });
    } catch (error: any) {
      return reply.status(404).send({ error: error.message });
    }
  });

  /**
   * POST /api/v1/ai-collab/session/:sessionId/merge
   *
   * Merge all stakeholder requirements into unified prompt
   */
  fastify.post('/session/:sessionId/merge', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };

    try {
      const mergedRequirements = await orchestrator.mergeRequirements(sessionId);

      fastify.log.info(
        { sessionId, totalPrompts: mergedRequirements.allPrompts.length },
        '🔀 Requirements merged'
      );

      return reply.code(200).send({ mergedRequirements });
    } catch (error: any) {
      return reply.status(404).send({ error: error.message });
    }
  });

  /**
   * POST /api/v1/ai-collab/session/:sessionId/generate
   *
   * Generate AI solution with multiple models
   */
  fastify.post('/session/:sessionId/generate', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };

    try {
      const outputs = await orchestrator.generateSolution(sessionId);

      fastify.log.info(
        { sessionId, models: Array.from(outputs.keys()) },
        '🤖 AI solution generated'
      );

      return reply.code(200).send({
        outputs: Array.from(outputs.entries()).map(([model, output]) => ({
          model,
          output: output.output,
          confidence: output.confidence,
          processingTime: output.processingTime,
        })),
      });
    } catch (error: any) {
      return reply.status(400).send({ error: error.message });
    }
  });

  /**
   * POST /api/v1/ai-collab/session/:sessionId/feedback
   *
   * Submit feedback on AI output
   *
   * Example:
   * {
   *   "stakeholderId": "user_123",
   *   "model": "gpt-5",
   *   "rating": "needs_work",
   *   "comment": "The pricing table looks wrong on mobile",
   *   "specificIssues": ["Responsive breakpoints incorrect", "Button alignment off"]
   * }
   */
  fastify.post('/session/:sessionId/feedback', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const { stakeholderId, model, rating, comment, specificIssues } = request.body as {
      stakeholderId: string;
      model: string;
      rating: 'approve' | 'needs_work' | 'reject';
      comment?: string;
      specificIssues?: string[];
    };

    if (!stakeholderId || !model || !rating) {
      return reply.status(400).send({ error: 'Missing required fields' });
    }

    try {
      const feedback = await orchestrator.submitFeedback(
        sessionId,
        stakeholderId,
        model,
        rating,
        comment,
        specificIssues
      );

      fastify.log.info(
        { sessionId, stakeholder: feedback.stakeholderName, model, rating },
        '📝 Feedback submitted'
      );

      return reply.code(201).send({ feedback });
    } catch (error: any) {
      return reply.status(404).send({ error: error.message });
    }
  });

  /**
   * POST /api/v1/ai-collab/session/:sessionId/refine
   *
   * Refine AI output based on stakeholder feedback
   *
   * Example:
   * {
   *   "model": "gpt-5",
   *   "refinementRequests": [
   *     {
   *       "stakeholderId": "designer_123",
   *       "stakeholderName": "Sarah",
   *       "issues": ["Pricing table broken on mobile"],
   *       "suggestedFixes": ["Use flexbox instead of grid", "Add mobile-first breakpoints"],
   *       "priority": "high"
   *     },
   *     {
   *       "stakeholderId": "dev_456",
   *       "stakeholderName": "Joel",
   *       "issues": ["Webhook error handling incomplete"],
   *       "suggestedFixes": ["Add retry logic", "Log failed webhooks"],
   *       "priority": "critical"
   *     }
   *   ]
   * }
   */
  fastify.post('/session/:sessionId/refine', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const { model, refinementRequests } = request.body as {
      model: string;
      refinementRequests: RefinementRequest[];
    };

    if (!model || !refinementRequests || refinementRequests.length === 0) {
      return reply.status(400).send({ error: 'Missing model or refinementRequests' });
    }

    try {
      const refinedOutput = await orchestrator.refineOutput(sessionId, model, refinementRequests);

      fastify.log.info(
        { sessionId, model, refinements: refinementRequests.length },
        '🔧 Output refined'
      );

      return reply.code(200).send({
        refinedOutput: {
          model: refinedOutput.model,
          output: refinedOutput.output,
          confidence: refinedOutput.confidence,
          refinementCount: refinedOutput.refinementCount,
        },
      });
    } catch (error: any) {
      return reply.status(404).send({ error: error.message });
    }
  });

  /**
   * GET /api/v1/ai-collab/session/:sessionId
   *
   * Get session state
   */
  fastify.get('/session/:sessionId', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };

    const session = orchestrator.getSession(sessionId);

    if (!session) {
      return reply.status(404).send({ error: 'Session not found' });
    }

    return reply.code(200).send({
      session: {
        sessionId: session.sessionId,
        projectId: session.projectId,
        stakeholders: Array.from(session.stakeholders.values()),
        prompts: session.prompts,
        mergedRequirements: session.mergedRequirements,
        aiOutputs: Array.from(session.aiOutputs.entries()).map(([model, output]) => ({
          model,
          output: output.output.substring(0, 500),
          confidence: output.confidence,
          feedbackCount: output.stakeholderFeedback.size,
          refinementCount: output.refinementCount,
        })),
        consensusResult: session.consensusResult,
        refinementCycle: session.refinementCycle,
        status: session.status,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
      },
    });
  });

  /**
   * GET /api/v1/ai-collab/sessions
   *
   * Get all active sessions
   */
  fastify.get('/sessions', async (request, reply) => {
    const sessions = orchestrator.getActiveSessions();

    return reply.code(200).send({
      sessions: sessions.map((s) => ({
        sessionId: s.sessionId,
        projectId: s.projectId,
        stakeholderCount: s.stakeholders.size,
        promptCount: s.prompts.length,
        status: s.status,
        createdAt: s.createdAt,
      })),
      count: sessions.length,
    });
  });

  /**
   * DELETE /api/v1/ai-collab/session/:sessionId
   *
   * End session
   */
  fastify.delete('/session/:sessionId', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };

    orchestrator.endSession(sessionId);

    return reply.code(200).send({
      message: 'Session ended',
      sessionId,
    });
  });

  /**
   * GET /api/v1/ai-collab/stats
   *
   * Get orchestration statistics
   */
  fastify.get('/stats', async (request, reply) => {
    const stats = orchestrator.getStats();

    return reply.code(200).send({
      ...stats,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * GET /api/v1/ai-collab/health
   *
   * Health check
   */
  fastify.get('/health', async (request, reply) => {
    return reply.code(200).send({
      status: 'healthy',
      service: 'AI-Era Collaboration',
      version: '1.0.0',
      description: 'Multiple stakeholders thinking together, orchestrating AI agents',
      evolution: {
        traditional: 'Multiple people typing code together',
        aiEra: 'Multiple people prompting AI together',
      },
      features: [
        'Collective intelligence sessions',
        'Multi-stakeholder prompt merging',
        'Real-time AI output review',
        'Iterative refinement',
        'Consensus evaluation',
        'Conflict detection',
      ],
    });
  });

  /**
   * GET /api/v1/ai-collab/examples
   *
   * Get example use cases
   */
  fastify.get('/examples', async (request, reply) => {
    return reply.code(200).send({
      examples: [
        {
          scenario: 'SaaS Platform with Stripe',
          stakeholders: [
            { role: 'Product Manager', prompt: 'Add Stripe subscriptions with 3 plans' },
            { role: 'Designer', prompt: 'Make the pricing page match our brand colors' },
            { role: 'Developer', prompt: 'Ensure webhook handles failed payments' },
            { role: 'Founder', prompt: 'Add annual billing with 20% discount' },
          ],
          result: 'Complete Stripe integration satisfying ALL requirements',
        },
        {
          scenario: 'Enterprise Compliance',
          stakeholders: [
            { role: 'Compliance Officer', prompt: 'Ensure GDPR compliance' },
            { role: 'Security Lead', prompt: 'Add 2FA and audit logging' },
            { role: 'Product Manager', prompt: 'User-friendly onboarding flow' },
          ],
          result: 'Compliant, secure, user-friendly auth system',
        },
        {
          scenario: 'Startup MVP',
          stakeholders: [
            { role: 'CEO', prompt: 'Focus on viral growth features' },
            { role: 'CTO', prompt: 'Prioritize scalability and performance' },
            { role: 'Designer', prompt: 'Make it visually stunning and intuitive' },
          ],
          result: 'Scalable, beautiful, growth-optimized MVP',
        },
      ],
    });
  });
};

export default aiEraCollaborationRoutes;

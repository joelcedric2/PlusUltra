import { FastifyPluginAsync } from 'fastify';
import { WebSocket } from 'ws';
import TCIChatAssistant, { ChatContext, ChatMessage, ProactiveAlert } from '../services/tci/TCIChatAssistant';

/**
 * TCI Chat Assistant API Routes
 *
 * Conversational interface to TCI's organizational memory.
 * Makes intelligence accessible through natural language, keeping the UI clean.
 *
 * Philosophy: "TCI should be like oxygen - essential, always present,
 * completely invisible until you specifically need it."
 *
 * The UI stays Google Docs simple. Intelligence lives in the chat pane.
 */

// Singleton chat assistant (only available for pro and enterprise users)
const chatAssistant = new TCIChatAssistant();

const tciChatRoutes: FastifyPluginAsync = async (fastify) => {

  /**
   * POST /api/v1/tci-chat/query
   *
   * Ask TCI Assistant a question about the codebase
   *
   * Request:
   * {
   *   "query": "Why did this change 2 days ago?",
   *   "conversationId": "conv_123",
   *   "context": {
   *     "userId": "user_123",
   *     "userName": "Joel",
   *     "projectId": "proj_abc",
   *     "currentFile": "src/components/Header.tsx",
   *     "selectedCode": {
   *       "file": "src/components/Header.tsx",
   *       "startLine": 45,
   *       "endLine": 67,
   *       "code": "function login() { ... }"
   *     },
   *     "cursorPosition": {
   *       "file": "src/components/Header.tsx",
   *       "line": 45,
   *       "column": 12
   *     },
   *     "recentActivity": {
   *       "filesViewed": ["Header.tsx", "Button.tsx"],
   *       "filesEdited": ["Header.tsx"],
   *       "collaborators": ["Sarah", "Mike"]
   *     }
   *   }
   * }
   *
   * Response:
   * {
   *   "response": "Joel fixed a floating point precision bug...",
   *   "queryResult": {
   *     "type": "history",
   *     "answer": "...",
   *     "suggestions": ["Show me the specific changes", "Tell me more"],
   *     "relatedChanges": [...]
   *   },
   *   "conversationId": "conv_123",
   *   "timestamp": "2025-10-26T12:00:00.000Z"
   * }
   */
  fastify.post('/query', async (request, reply) => {
    const { query, conversationId, context } = request.body as {
      query: string;
      conversationId: string;
      context: ChatContext;
    };

    if (!query || !conversationId || !context) {
      return reply.status(400).send({
        error: 'Missing required fields: query, conversationId, context',
      });
    }

    try {
      fastify.log.info(
        { conversationId, userId: context.userId, query: query.substring(0, 50) },
        '💬 TCI Chat query received'
      );

      const result = await chatAssistant.processQuery(query, context, conversationId);

      fastify.log.info(
        { conversationId, responseLength: result.response.length },
        '✅ TCI Chat response generated'
      );

      return reply.code(200).send({
        response: result.response,
        queryResult: result.queryResult,
        conversationId,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      fastify.log.error({ error, conversationId }, '❌ TCI Chat query failed');

      return reply.status(500).send({
        error: 'Failed to process query',
        message: error.message,
        conversationId,
      });
    }
  });

  /**
   * GET /api/v1/tci-chat/conversation/:conversationId
   *
   * Get conversation history
   */
  fastify.get('/conversation/:conversationId', async (request, reply) => {
    const { conversationId } = request.params as { conversationId: string };

    const history = chatAssistant.getConversationHistory(conversationId);

    return reply.code(200).send({
      conversationId,
      messages: history,
      count: history.length,
    });
  });

  /**
   * DELETE /api/v1/tci-chat/conversation/:conversationId
   *
   * Clear conversation history
   */
  fastify.delete('/conversation/:conversationId', async (request, reply) => {
    const { conversationId } = request.params as { conversationId: string };

    chatAssistant.clearConversation(conversationId);

    return reply.code(200).send({
      message: 'Conversation cleared',
      conversationId,
    });
  });

  /**
   * POST /api/v1/tci-chat/proactive-alerts
   *
   * Get proactive intelligence alerts based on current context
   *
   * Request:
   * {
   *   "context": {
   *     "userId": "user_123",
   *     "userName": "Joel",
   *     "projectId": "proj_abc",
   *     "currentFile": "src/components/Header.tsx",
   *     "selectedCode": { ... },
   *     "recentActivity": { ... }
   *   }
   * }
   *
   * Response:
   * {
   *   "alerts": [
   *     {
   *       "id": "conflict_12345",
   *       "type": "conflict",
   *       "severity": "high",
   *       "message": "Joel is editing the same code section",
   *       "details": "You both modified lines 45-67 in the last 5 minutes",
   *       "actionable": true,
   *       "actions": ["View Joel's changes", "Coordinate in chat"],
   *       "timestamp": "2025-10-26T12:00:00.000Z"
   *     }
   *   ],
   *   "count": 1
   * }
   */
  fastify.post('/proactive-alerts', async (request, reply) => {
    const { context } = request.body as { context: ChatContext };

    if (!context) {
      return reply.status(400).send({
        error: 'Missing required field: context',
      });
    }

    try {
      const alerts = await chatAssistant.generateProactiveAlerts(context);

      return reply.code(200).send({
        alerts,
        count: alerts.length,
        timestamp: new Date().toISOString(),
      });
    } catch (error: any) {
      fastify.log.error({ error }, '❌ Failed to generate proactive alerts');

      return reply.status(500).send({
        error: 'Failed to generate alerts',
        message: error.message,
      });
    }
  });

  /**
   * GET /api/v1/tci-chat/stats
   *
   * Get TCI Chat statistics
   */
  fastify.get('/stats', async (request, reply) => {
    return reply.code(200).send({
      activeConversations: chatAssistant.getActiveConversationsCount(),
      features: [
        'Context-aware queries (understands "this", "here", selected code)',
        'Natural language understanding',
        'Progressive disclosure (Tell me more)',
        'Proactive conflict detection',
        'Code quality suggestions',
        'Team expertise identification',
        'Impact prediction',
      ],
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * GET /api/v1/tci-chat/health
   *
   * Health check for TCI Chat service
   */
  fastify.get('/health', async (request, reply) => {
    const anthropicConfigured = !!process.env.ANTHROPIC_API_KEY;

    return reply.code(200).send({
      status: anthropicConfigured ? 'healthy' : 'degraded',
      service: 'TCI Chat Assistant',
      version: '1.0.0',
      description: 'Conversational interface to organizational memory',
      philosophy: 'TCI should be like oxygen - essential, always present, completely invisible until needed',
      anthropicApi: anthropicConfigured,
      features: {
        contextAware: true,
        naturalLanguage: true,
        proactiveAlerts: true,
        progressiveDisclosure: true,
      },
    });
  });

  /**
   * GET /api/v1/tci-chat/examples
   *
   * Get example queries users can ask
   */
  fastify.get('/examples', async (request, reply) => {
    return reply.code(200).send({
      examples: [
        {
          category: 'History',
          queries: [
            'Why did this change 2 days ago?',
            'When was this function last modified?',
            'Show me the history of this auth function',
            'What happened here?',
          ],
        },
        {
          category: 'Impact',
          queries: [
            "What's the impact if I change this payment method?",
            'What happens if I refactor this function?',
            'Will this change affect other parts of the codebase?',
            'What are the risks of this change?',
          ],
        },
        {
          category: 'Expertise',
          queries: [
            'Who usually works on auth code?',
            'Who knows most about this file?',
            'Who should I ask about this payment logic?',
            'Who last modified this function?',
          ],
        },
        {
          category: 'Collaboration',
          queries: [
            "Why is Sarah's cursor in UserService.ts?",
            'Is anyone else working on this file?',
            'Who is editing authentication code right now?',
            'Show me what Joel changed yesterday',
          ],
        },
        {
          category: 'Code Quality',
          queries: [
            'Is this code complex?',
            'Are there any patterns I should follow here?',
            'What best practices apply to this code?',
            'How can I improve this function?',
          ],
        },
      ],
      tips: [
        'Use "this" or "here" to refer to selected code',
        'Ask follow-up questions with "Tell me more"',
        'Request specific details with "Show me..."',
        'TCI understands context from your current file and cursor position',
      ],
    });
  });

  /**
   * POST /api/v1/tci-chat/feedback
   *
   * Submit feedback on TCI Chat responses
   */
  fastify.post('/feedback', async (request, reply) => {
    const { conversationId, messageIndex, rating, comment } = request.body as {
      conversationId: string;
      messageIndex: number;
      rating: 'helpful' | 'not_helpful';
      comment?: string;
    };

    if (!conversationId || messageIndex === undefined || !rating) {
      return reply.status(400).send({
        error: 'Missing required fields: conversationId, messageIndex, rating',
      });
    }

    // In production, this would store feedback in database for model improvement
    fastify.log.info({ conversationId, messageIndex, rating, comment }, '📝 TCI Chat feedback received');

    return reply.code(200).send({
      message: 'Feedback received',
      conversationId,
      messageIndex,
      rating,
    });
  });
};

export default tciChatRoutes;

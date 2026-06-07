import WebSocket from 'ws';
import { FastifyInstance, FastifyRequest } from 'fastify';
import { realtimeGenerator, RealtimeSession, RealtimeCodeGenerator } from '../../services/realtime/RealtimeGenerator';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';

// Create a generator instance - in production this would use a proper model
const generator = realtimeGenerator.createGenerator({} as BaseChatModel);

export async function realtimeRoutes(fastify: FastifyInstance) {
  // WebSocket endpoint for real-time code generation
  fastify.get('/api/v1/realtime/generate/:sessionId', { websocket: true }, (connection, request) => {
    const { sessionId } = request.params as { sessionId: string };

    // Handle new WebSocket connection
    connection.on('open', () => {
      console.log(`WebSocket connection opened for session: ${sessionId}`);
    });

    connection.on('message', async (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());

        switch (data.type) {
          case 'start_generation':
            await generator.generateCodeStream(
              sessionId,
              connection,
              data.additionalPrompt
            );
            break;

          case 'update_code':
            await generator.updateCode(
              sessionId,
              connection,
              data.feedback,
              data.targetFile
            );
            break;

          case 'get_session':
            const session = generator.getSession(sessionId);
            if (session) {
              connection.send(JSON.stringify({
                type: 'session_info',
                sessionId,
                data: session
              }));
            }
            break;
        }
      } catch (error) {
        console.error('WebSocket message error:', error);
        connection.send(JSON.stringify({
          type: 'error',
          sessionId,
          data: { message: 'Invalid message format' }
        }));
      }
    });

    connection.on('close', () => {
      console.log(`WebSocket connection closed for session: ${sessionId}`);
      // Keep session alive for a while in case user reconnects
    });

    connection.on('error', (error: Error) => {
      console.error(`WebSocket error for session ${sessionId}:`, error);
    });
  });

  // Create new real-time session
  fastify.post('/api/v1/realtime/session', async (request: FastifyRequest, reply) => {
    try {
      const { projectName, description, userId } = request.body as any;

      if (!projectName || !description || !userId) {
        return reply.code(400).send({
          error: 'projectName, description, and userId are required'
        });
      }

      const sessionId = `realtime-${userId}-${Date.now()}`;
      const session = await generator.createSession(
        sessionId,
        userId,
        projectName,
        description
      );

      return reply.code(200).send({
        success: true,
        sessionId,
        session: {
          sessionId: session.sessionId,
          projectName: session.projectName,
          description: session.description,
          progress: session.progress,
          currentStep: session.currentStep,
          isGenerating: session.isGenerating,
          createdAt: session.createdAt
        }
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      fastify.log.error(`Error creating realtime session: ${errorMessage}`);
      return reply.code(500).send({
        success: false,
        error: 'Failed to create session',
        message: errorMessage
      });
    }
  });

  // Get session status
  fastify.get('/api/v1/realtime/session/:sessionId', async (request: FastifyRequest, reply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };

      const session = generator.getSession(sessionId);
      if (!session) {
        return reply.code(404).send({
          error: 'Session not found'
        });
      }

      return reply.code(200).send({
        success: true,
        session: {
          sessionId: session.sessionId,
          projectName: session.projectName,
          description: session.description,
          progress: session.progress,
          currentStep: session.currentStep,
          isGenerating: session.isGenerating,
          errors: session.errors,
          warnings: session.warnings,
          createdAt: session.createdAt,
          lastUpdated: session.lastUpdated
        }
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      fastify.log.error(`Error getting session: ${errorMessage}`);
      return reply.code(500).send({
        success: false,
        error: 'Failed to get session',
        message: errorMessage
      });
    }
  });

  // Delete session
  fastify.delete('/api/v1/realtime/session/:sessionId', async (request: FastifyRequest, reply) => {
    try {
      const { sessionId } = request.params as { sessionId: string };

      const deleted = generator.deleteSession(sessionId);

      if (deleted) {
        return reply.code(200).send({
          success: true,
          message: 'Session deleted successfully'
        });
      } else {
        return reply.code(404).send({
          error: 'Session not found'
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      fastify.log.error(`Error deleting session: ${errorMessage}`);
      return reply.code(500).send({
        success: false,
        error: 'Failed to delete session',
        message: errorMessage
      });
    }
  });

  // Get active sessions
  fastify.get('/api/v1/realtime/sessions', async (request: FastifyRequest, reply) => {
    try {
      const activeSessions = generator.getActiveSessions();

      return reply.code(200).send({
        success: true,
        sessions: activeSessions.map((session: RealtimeSession) => ({
          sessionId: session.sessionId,
          projectName: session.projectName,
          progress: session.progress,
          currentStep: session.currentStep,
          isGenerating: session.isGenerating,
          createdAt: session.createdAt
        }))
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      fastify.log.error(`Error getting active sessions: ${errorMessage}`);
      return reply.code(500).send({
        success: false,
        error: 'Failed to get sessions',
        message: errorMessage
      });
    }
  });

  // Cleanup old sessions
  fastify.post('/api/v1/realtime/cleanup', async (request: FastifyRequest, reply) => {
    try {
      const cleanedCount = generator.cleanupOldSessions();

      return reply.code(200).send({
        success: true,
        message: `Cleaned up ${cleanedCount} old sessions`
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      fastify.log.error(`Error cleaning up sessions: ${errorMessage}`);
      return reply.code(500).send({
        success: false,
        error: 'Failed to cleanup sessions',
        message: errorMessage
      });
    }
  });
}

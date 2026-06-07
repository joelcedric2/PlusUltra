import { FastifyPluginAsync } from 'fastify';
import { WebSocket } from 'ws';
import GoogleDocsStyleCollaboration from '../../services/collaboration/GoogleDocsStyleCollaboration';

/**
 * Google Docs/Sheets-Style Real-Time Collaboration Routes
 *
 * WebSocket-based endpoints for real-time collaboration features:
 * - Cursor positions with name labels (Google Docs style)
 * - Selection highlights (translucent overlays)
 * - File presence indicators (who's editing what)
 * - Presence avatars with consistent colors
 *
 * Users will feel like "This is Google Docs for code!"
 */

// Singleton collaboration service
const collaborationService = new GoogleDocsStyleCollaboration();

const googleDocsCollaborationRoutes: FastifyPluginAsync = async (fastify) => {

  /**
   * WebSocket: /api/v1/realtime/collaborate/:sessionId
   *
   * Real-time collaboration socket (Google Docs-style)
   *
   * Client sends:
   * {
   *   "type": "cursor",
   *   "file": "src/components/Header.tsx",
   *   "line": 45,
   *   "column": 12
   * }
   *
   * {
   *   "type": "selection",
   *   "file": "src/components/Header.tsx",
   *   "startLine": 45,
   *   "startColumn": 0,
   *   "endLine": 47,
   *   "endColumn": 15
   * }
   *
   * {
   *   "type": "file_presence",
   *   "file": "src/components/Header.tsx",
   *   "action": "open" | "close" | "edit" | "view"
   * }
   *
   * Server broadcasts to all collaborators:
   * {
   *   "type": "cursor_update",
   *   "cursor": { userId, file, line, column },
   *   "collaborator": { id, name, color }
   * }
   *
   * {
   *   "type": "selection_update",
   *   "selection": { userId, file, startLine, startColumn, endLine, endColumn },
   *   "collaborator": { id, name, color }
   * }
   *
   * {
   *   "type": "file_presence_update",
   *   "presence": {
   *     "file": "src/components/Header.tsx",
   *     "viewers": [{ id, name, color }, ...],
   *     "editors": [{ id, name, color }, ...]
   *   }
   * }
   */
  fastify.get('/collaborate/:sessionId', { websocket: true }, (connection, req) => {
    const ws = connection as unknown as WebSocket;
    const { sessionId } = req.params as { sessionId: string };

    // Extract user info from query params or auth
    const query = req.query as any;
    const userId = query.userId || `user_${Date.now()}`;
    const userName = query.userName || 'Anonymous';
    const userEmail = query.userEmail || '';
    const userAvatar = query.userAvatar;
    const projectId = query.projectId || 'default';

    fastify.log.info(
      { sessionId, userId, userName },
      '👥 User joining Google Docs-style collaboration session'
    );

    // Join session and get assigned color
    const collaborator = collaborationService.joinSession(
      sessionId,
      projectId,
      userId,
      userName,
      userEmail,
      userAvatar,
      ws
    );

    // Send initial state to new collaborator
    const initialState = collaborationService.getSessionState(sessionId);
    if (initialState) {
      ws.send(
        JSON.stringify({
          type: 'initial_state',
          yourInfo: collaborator,
          ...initialState,
        })
      );
    }

    // Handle incoming messages
    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case 'cursor':
            collaborationService.updateCursor(userId, message.file, message.line, message.column);
            break;

          case 'selection':
            collaborationService.updateSelection(
              userId,
              message.file,
              message.startLine,
              message.startColumn,
              message.endLine,
              message.endColumn
            );
            break;

          case 'selection_clear':
            collaborationService.clearSelection(userId);
            break;

          case 'file_presence':
            collaborationService.updateFilePresence(userId, message.file, message.action);
            break;

          case 'heartbeat':
            // Update last activity
            ws.send(JSON.stringify({ type: 'heartbeat_ack' }));
            break;

          default:
            fastify.log.warn({ type: message.type }, 'Unknown message type');
        }
      } catch (error: any) {
        fastify.log.error({ error }, 'Error processing collaboration message');
      }
    });

    // Handle disconnect
    ws.on('close', () => {
      fastify.log.info({ sessionId, userId, userName }, '👋 User left collaboration session');
      collaborationService.leaveSession(userId);
    });

    // Handle errors
    ws.on('error', (error: Error) => {
      fastify.log.error({ error, sessionId, userId }, 'WebSocket error in collaboration');
      collaborationService.leaveSession(userId);
    });
  });

  /**
   * GET /api/v1/realtime/collaborate/:sessionId/state
   *
   * Get current collaboration state (REST endpoint)
   */
  fastify.get('/collaborate/:sessionId/state', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };

    const state = collaborationService.getSessionState(sessionId);

    if (!state) {
      return reply.status(404).send({
        error: 'Session not found',
        sessionId,
      });
    }

    return reply.code(200).send({
      sessionId,
      ...state,
    });
  });

  /**
   * GET /api/v1/realtime/collaborate/:sessionId/collaborators
   *
   * Get list of collaborators in a session
   */
  fastify.get('/collaborate/:sessionId/collaborators', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };

    const collaborators = collaborationService.getCollaborators(sessionId);

    return reply.code(200).send({
      sessionId,
      collaborators,
      count: collaborators.length,
    });
  });

  /**
   * GET /api/v1/realtime/collaborate/:sessionId/file/:filePath
   *
   * Get presence info for a specific file
   */
  fastify.get('/collaborate/:sessionId/file/*', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const filePath = (request.params as any)['*'];

    const cursors = collaborationService.getCursorsForFile(sessionId, filePath);
    const selections = collaborationService.getSelectionsForFile(sessionId, filePath);

    return reply.code(200).send({
      sessionId,
      file: filePath,
      cursors,
      selections,
    });
  });

  /**
   * GET /api/v1/realtime/collaborate/stats
   *
   * Get collaboration service statistics
   */
  fastify.get('/collaborate/stats', async (request, reply) => {
    const stats = collaborationService.getStats();

    return reply.code(200).send({
      ...stats,
      timestamp: new Date().toISOString(),
    });
  });

  /**
   * POST /api/v1/realtime/collaborate/:sessionId/leave
   *
   * Manually leave a session (alternative to WebSocket disconnect)
   */
  fastify.post('/collaborate/:sessionId/leave', async (request, reply) => {
    const { sessionId } = request.params as { sessionId: string };
    const { userId } = request.body as { userId: string };

    if (!userId) {
      return reply.status(400).send({ error: 'userId required' });
    }

    collaborationService.leaveSession(userId);

    return reply.code(200).send({
      message: 'Left session successfully',
      sessionId,
      userId,
    });
  });

  /**
   * GET /api/v1/realtime/collaborate/health
   *
   * Health check for collaboration service
   */
  fastify.get('/collaborate/health', async (request, reply) => {
    const stats = collaborationService.getStats();

    return reply.code(200).send({
      status: 'healthy',
      service: 'Google Docs-Style Collaboration',
      version: '1.0.0',
      stats,
      features: [
        'Colored cursors with name labels',
        'Selection highlights (Google Docs style)',
        'File presence indicators',
        'Real-time WebSocket updates',
        'Automatic color assignment',
        'Idle user detection',
      ],
    });
  });
};

export default googleDocsCollaborationRoutes;

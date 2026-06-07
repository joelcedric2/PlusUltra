/**
 * Real-Time Collaboration API Routes
 *
 * REST endpoints for managing collaboration sessions, participants, and TCI integration.
 */

import { FastifyPluginAsync } from 'fastify';
import { collaborationSessionManager } from '../services/collaboration/CollaborationSessionManager';
import { tciCollaborationIntegration } from '../services/collaboration/TCICollaborationIntegration';
import { crdtDocumentService } from '../services/collaboration/CRDTDocumentService';
import { prisma } from '../lib/prisma';

const collaborationRoutes: FastifyPluginAsync = async (fastify) => {
  // Create or join collaboration session
  fastify.post<{
    Body: {
      documentId: string;
      workspaceId: string;
      filePath: string;
      language: string;
      userId: string;
      userName: string;
      userColor?: string;
      userTier: 'free' | 'starter' | 'pro' | 'enterprise';
    };
  }>('/api/collaboration/sessions', async (request, reply) => {
    try {
      const { documentId, workspaceId, filePath, language, userId, userName, userColor, userTier } = request.body;

      const session = await collaborationSessionManager.createSession({
        documentId,
        workspaceId,
        filePath,
        language,
        userId,
        userName,
        userColor: userColor || '#4ECDC4',
        userTier,
      });

      return {
        success: true,
        session,
      };
    } catch (error: any) {
      fastify.log.error('Error creating collaboration session:', error);
      return reply.code(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  // Get session info
  fastify.get<{
    Params: {
      sessionId: string;
    };
  }>('/api/collaboration/sessions/:sessionId', async (request, reply) => {
    try {
      const { sessionId } = request.params;

      const session = collaborationSessionManager.getSession(sessionId);
      if (!session) {
        return reply.code(404).send({
          success: false,
          error: 'Session not found',
        });
      }

      return {
        success: true,
        session,
      };
    } catch (error: any) {
      fastify.log.error('Error getting session:', error);
      return reply.code(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  // Get session by document ID
  fastify.get<{
    Querystring: {
      documentId: string;
    };
  }>('/api/collaboration/sessions', async (request, reply) => {
    try {
      const { documentId } = request.query;

      const session = collaborationSessionManager.getSessionByDocument(documentId);
      if (!session) {
        return reply.code(404).send({
          success: false,
          error: 'Session not found',
        });
      }

      return {
        success: true,
        session,
      };
    } catch (error: any) {
      fastify.log.error('Error getting session by document:', error);
      return reply.code(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  // Leave session
  fastify.post<{
    Params: {
      sessionId: string;
    };
    Body: {
      userId: string;
    };
  }>('/api/collaboration/sessions/:sessionId/leave', async (request, reply) => {
    try {
      const { sessionId } = request.params;
      const { userId } = request.body;

      await collaborationSessionManager.removeParticipant(sessionId, userId);

      return {
        success: true,
      };
    } catch (error: any) {
      fastify.log.error('Error leaving session:', error);
      return reply.code(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  // Update participant state (cursor/selection)
  fastify.post<{
    Params: {
      sessionId: string;
    };
    Body: {
      userId: string;
      cursor?: { line: number; column: number };
      selection?: {
        start: { line: number; column: number };
        end: { line: number; column: number };
      };
    };
  }>('/api/collaboration/sessions/:sessionId/state', async (request, reply) => {
    try {
      const { sessionId } = request.params;
      const { userId, cursor, selection } = request.body;

      await collaborationSessionManager.updateParticipantState(sessionId, userId, {
        cursor,
        selection,
      });

      return {
        success: true,
      };
    } catch (error: any) {
      fastify.log.error('Error updating participant state:', error);
      return reply.code(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  // Trigger TCI analysis for session
  fastify.post<{
    Params: {
      sessionId: string;
    };
    Body: {
      userId: string;
    };
  }>('/api/collaboration/sessions/:sessionId/analyze', async (request, reply) => {
    try {
      const { sessionId } = request.params;
      const { userId } = request.body;

      const result = await tciCollaborationIntegration.triggerAnalysis(sessionId, userId);

      if (!result) {
        return reply.code(500).send({
          success: false,
          error: 'Analysis failed',
        });
      }

      return {
        success: true,
        result,
      };
    } catch (error: any) {
      fastify.log.error('Error triggering TCI analysis:', error);
      return reply.code(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  // Get TCI analyses for session
  fastify.get<{
    Params: {
      sessionId: string;
    };
    Querystring: {
      limit?: number;
    };
  }>('/api/collaboration/sessions/:sessionId/analyses', async (request, reply) => {
    try {
      const { sessionId } = request.params;
      const { limit = 10 } = request.query;

      const analyses = await tciCollaborationIntegration.getSessionAnalyses(
        sessionId,
        Number(limit)
      );

      return {
        success: true,
        analyses,
      };
    } catch (error: any) {
      fastify.log.error('Error getting session analyses:', error);
      return reply.code(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  // Get notifications for user
  fastify.get<{
    Querystring: {
      userId: string;
      unreadOnly?: boolean;
      limit?: number;
    };
  }>('/api/collaboration/notifications', async (request, reply) => {
    try {
      const { userId, unreadOnly = false, limit = 50 } = request.query;

      const notifications = await prisma.collaborationNotification.findMany({
        where: {
          userId,
          ...(unreadOnly ? { read: false } : {}),
        },
        orderBy: { createdAt: 'desc' },
        take: Number(limit),
      });

      return {
        success: true,
        notifications,
      };
    } catch (error: any) {
      fastify.log.error('Error getting notifications:', error);
      return reply.code(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  // Mark notification as read
  fastify.post<{
    Params: {
      notificationId: string;
    };
  }>('/api/collaboration/notifications/:notificationId/read', async (request, reply) => {
    try {
      const { notificationId } = request.params;

      await prisma.collaborationNotification.update({
        where: { id: notificationId },
        data: { read: true },
      });

      return {
        success: true,
      };
    } catch (error: any) {
      fastify.log.error('Error marking notification as read:', error);
      return reply.code(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  // Get collaboration statistics
  fastify.get('/api/collaboration/stats', async (request, reply) => {
    try {
      const sessionStats = collaborationSessionManager.getStats();
      const documentStats = crdtDocumentService.getStats();
      const tciStats = await tciCollaborationIntegration.getStats();

      return {
        success: true,
        stats: {
          sessions: sessionStats,
          documents: documentStats,
          tci: tciStats,
        },
      };
    } catch (error: any) {
      fastify.log.error('Error getting collaboration stats:', error);
      return reply.code(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  // Get workspace sessions
  fastify.get<{
    Querystring: {
      workspaceId: string;
    };
  }>('/api/collaboration/workspace/sessions', async (request, reply) => {
    try {
      const { workspaceId } = request.query;

      const sessions = collaborationSessionManager.getSessionsForWorkspace(workspaceId);

      return {
        success: true,
        sessions,
      };
    } catch (error: any) {
      fastify.log.error('Error getting workspace sessions:', error);
      return reply.code(500).send({
        success: false,
        error: error.message,
      });
    }
  });

  fastify.log.info('Collaboration routes registered');
};

export default collaborationRoutes;

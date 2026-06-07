import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import AdvancedCollaborationService, {
  CollaborationSession,
  Comment as CommentType,
  Branch,
  VideoChatSession,
  CollaborationSettings,
  CollaborationParticipant
} from '../services/collaboration/AdvancedCollaborationService';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

// Type definitions for request/response
type CreateSessionRequest = {
  workspaceId: string;
  projectId: string;
  creatorId: string;
  settings?: Partial<CollaborationSettings>;
};

type JoinSessionRequest = {
  sessionId: string;
  userId: string;
  username: string;
  role?: CollaborationParticipant['role'];
};

type AddCommentRequest = {
  sessionId: string;
  userId: string;
  file: string;
  line?: number;
  column?: number;
  content: string;
  type?: CommentType['type'];
};

type CreateBranchRequest = {
  sessionId: string;
  userId: string;
  name: string;
  description?: string;
  baseBranch?: string;
};

const createSessionSchema = z.object({
  workspaceId: z.string(),
  projectId: z.string(),
  creatorId: z.string(),
  settings: z.object({
    allowVoiceChat: z.boolean().optional(),
    allowVideoChat: z.boolean().optional(),
    allowScreenShare: z.boolean().optional(),
    maxParticipants: z.number().min(1).max(50).optional(),
    requireApproval: z.boolean().optional(),
    autoSave: z.boolean().optional(),
    conflictResolution: z.enum(['manual', 'auto', 'last-wins']).optional()
  }).optional()
});

const joinSessionSchema = z.object({
  sessionId: z.string(),
  userId: z.string(),
  username: z.string(),
  role: z.enum(['owner', 'editor', 'viewer']).optional()
});

const addCommentSchema = z.object({
  sessionId: z.string(),
  userId: z.string(),
  file: z.string(),
  line: z.number().optional(),
  column: z.number().optional(),
  content: z.string().min(1),
  type: z.enum(['comment', 'suggestion', 'issue', 'approval']).optional()
});

const createBranchSchema = z.object({
  sessionId: z.string(),
  userId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  baseBranch: z.string().optional()
});

const collaborationService = new AdvancedCollaborationService();

// Error handling middleware
const handleError = (reply: FastifyReply, error: any, statusCode: number = 500) => {
  console.error('Collaboration error:', error);
  reply.status(statusCode).send({
    error: error.message || 'Internal server error',
    code: statusCode,
    timestamp: new Date().toISOString()
  });
};

export default async function advancedCollaborationRoutes(fastify: FastifyInstance) {
  // Create a new collaboration session
  fastify.post('/api/v1/collaboration/sessions', {
    schema: { body: createSessionSchema },
    handler: async (request, reply) => {
      try {
        const { workspaceId, projectId, creatorId, settings } = request.body as any;

        const session = await collaborationService.createSession(workspaceId, projectId, creatorId, settings);

        reply.code(201).send({
          success: true,
          session: {
            id: session.id,
            workspaceId: session.workspaceId,
            projectId: session.projectId,
            participants: session.participants,
            status: session.status,
            createdAt: session.createdAt,
            settings: session.settings
          }
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Session creation failed'
        });
      }
    }
  });

  // Join collaboration session
  fastify.post('/api/v1/collaboration/sessions/join', {
    schema: {
      body: joinSessionSchema
    },
    handler: async (request, reply) => {
      try {
        const { sessionId, userId, username, role = 'editor' } = request.body as any;

        const joined = await collaborationService.joinSession(sessionId, userId, username, role);

        if (!joined) {
          reply.code(400).send({
            success: false,
            error: 'Failed to join session'
          });
          return;
        }

        reply.code(200).send({
          success: true,
          message: 'Joined session successfully'
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to join session'
        });
      }
    }
  });

  // Leave collaboration session
  fastify.post('/api/v1/collaboration/sessions/leave', {
    schema: {
      body: z.object({
        sessionId: z.string(),
        userId: z.string()
      })
    },
    handler: async (request, reply) => {
      try {
        const { sessionId, userId } = request.body as any;

        const left = await collaborationService.leaveSession(sessionId, userId);

        reply.code(200).send({
          success: true,
          message: left ? 'Left session successfully' : 'Session not found'
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to leave session'
        });
      }
    }
  });

  // Update cursor position
  fastify.post('/api/v1/collaboration/cursor', {
    schema: {
      body: z.object({
        sessionId: z.string(),
        userId: z.string(),
        cursor: z.object({
          x: z.number(),
          y: z.number(),
          file: z.string(),
          line: z.number()
        })
      })
    },
    handler: async (request, reply) => {
      try {
        const { sessionId, userId, cursor } = request.body as any;

        await collaborationService.updateCursor(sessionId, userId, cursor);

        reply.code(200).send({
          success: true,
          message: 'Cursor updated successfully'
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update cursor'
        });
      }
    }
  });

  // Add comment
  fastify.post('/api/v1/collaboration/comments', {
    schema: {
      body: addCommentSchema
    },
    handler: async (request, reply) => {
      try {
        const { sessionId, userId, file, line, column, content, type = 'comment' } = request.body as any;

        const comment = await collaborationService.addComment(sessionId, userId, file, line, column, content, type);

        reply.code(201).send({
          success: true,
          comment: {
            id: comment.id,
            sessionId: comment.sessionId,
            userId: comment.userId,
            file: comment.file,
            line: comment.line,
            column: comment.column,
            content: comment.content,
            type: comment.type,
            status: comment.status,
            createdAt: comment.createdAt,
            replies: comment.replies
          }
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to add comment'
        });
      }
    }
  });

  // Reply to comment
  fastify.post('/api/v1/collaboration/comments/:commentId/reply', {
    schema: {
      params: z.object({
        commentId: z.string()
      }),
      body: z.object({
        sessionId: z.string(),
        userId: z.string(),
        content: z.string().min(1)
      })
    },
    handler: async (request, reply) => {
      try {
        const { commentId } = request.params as any;
        const { sessionId, userId, content } = request.body as any;

        const replyComment = await collaborationService.replyToComment(sessionId, commentId, userId, content);

        if (!replyComment) {
          reply.code(404).send({
            success: false,
            error: 'Comment not found'
          });
          return;
        }

        reply.code(201).send({
          success: true,
          reply: {
            id: replyComment.id,
            sessionId: replyComment.sessionId,
            userId: replyComment.userId,
            content: replyComment.content,
            createdAt: replyComment.createdAt
          }
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to reply to comment'
        });
      }
    }
  });

  // Resolve comment
  fastify.patch('/api/v1/collaboration/comments/:commentId/resolve', {
    schema: {
      params: z.object({
        commentId: z.string()
      }),
      body: z.object({
        sessionId: z.string(),
        userId: z.string()
      })
    },
    handler: async (request, reply) => {
      try {
        const { commentId } = request.params as any;
        const { sessionId, userId } = request.body as any;

        const resolved = await collaborationService.resolveComment(sessionId, commentId, userId);

        reply.code(200).send({
          success: true,
          resolved,
          message: resolved ? 'Comment resolved successfully' : 'Comment not found'
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to resolve comment'
        });
      }
    }
  });

  // Get session comments
  fastify.get('/api/v1/collaboration/sessions/:sessionId/comments', {
    schema: {
      params: z.object({
        sessionId: z.string()
      }),
      querystring: z.object({
        file: z.string().optional()
      }).optional()
    },
    handler: async (request, reply) => {
      try {
        const { sessionId } = request.params as any;
        const { file } = request.query as any;

        const comments = await collaborationService.getSessionComments(sessionId, file);

        reply.code(200).send({
          success: true,
          comments,
          count: comments.length
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get comments'
        });
      }
    }
  });

  // Create branch
  fastify.post('/api/v1/collaboration/branches', {
    schema: {
      body: createBranchSchema
    },
    handler: async (request, reply) => {
      try {
        const { sessionId, userId, name, description, baseBranch } = request.body as any;

        const branch = await collaborationService.createBranch(sessionId, userId, name, description, baseBranch);

        reply.code(201).send({
          success: true,
          branch: {
            id: branch.id,
            name: branch.name,
            sessionId: branch.sessionId,
            baseBranch: branch.baseBranch,
            createdBy: branch.createdBy,
            createdAt: branch.createdAt,
            description: branch.description,
            status: branch.status
          }
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create branch'
        });
      }
    }
  });

  // Get session branches
  fastify.get('/api/v1/collaboration/sessions/:sessionId/branches', {
    schema: {
      params: z.object({
        sessionId: z.string()
      })
    },
    handler: async (request, reply) => {
      try {
        const { sessionId } = request.params as any;

        const branches = await collaborationService.getSessionBranches(sessionId);

        reply.code(200).send({
          success: true,
          branches,
          count: branches.length
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get branches'
        });
      }
    }
  });

  // Merge branch
  fastify.post('/api/v1/collaboration/branches/:branchId/merge', {
    schema: {
      params: z.object({
        branchId: z.string()
      }),
      body: z.object({
        sessionId: z.string(),
        userId: z.string()
      })
    },
    handler: async (request, reply) => {
      try {
        const { branchId } = request.params as any;
        const { sessionId, userId } = request.body as any;

        const merged = await collaborationService.mergeBranch(sessionId, branchId, userId);

        reply.code(200).send({
          success: true,
          merged,
          message: merged ? 'Branch merged successfully' : 'Branch not found or already merged'
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to merge branch'
        });
      }
    }
  });

  // Start video chat
  fastify.post('/api/v1/collaboration/video/start', {
    schema: {
      body: z.object({
        sessionId: z.string(),
        initiatorId: z.string()
      })
    },
    handler: async (request, reply) => {
      try {
        const { sessionId, initiatorId } = request.body as any;

        const videoSession = await collaborationService.startVideoChat(sessionId, initiatorId);

        reply.code(201).send({
          success: true,
          videoSession: {
            id: videoSession.id,
            sessionId: videoSession.sessionId,
            participants: videoSession.participants,
            status: videoSession.status,
            startedAt: videoSession.startedAt
          }
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to start video chat'
        });
      }
    }
  });

  // Join video chat
  fastify.post('/api/v1/collaboration/video/join', {
    schema: {
      body: z.object({
        videoSessionId: z.string(),
        userId: z.string()
      })
    },
    handler: async (request, reply) => {
      try {
        const { videoSessionId, userId } = request.body as any;

        const joined = await collaborationService.joinVideoChat(videoSessionId, userId);

        reply.code(200).send({
          success: true,
          joined,
          message: joined ? 'Joined video chat successfully' : 'Video session not found or ended'
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to join video chat'
        });
      }
    }
  });

  // End video chat
  fastify.post('/api/v1/collaboration/video/end', {
    schema: {
      body: z.object({
        videoSessionId: z.string(),
        userId: z.string()
      })
    },
    handler: async (request, reply) => {
      try {
        const { videoSessionId, userId } = request.body as any;

        const ended = await collaborationService.endVideoChat(videoSessionId, userId);

        reply.code(200).send({
          success: true,
          ended,
          message: ended ? 'Video chat ended successfully' : 'Video session not found'
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to end video chat'
        });
      }
    }
  });

  // Get session state (for real-time updates)
  fastify.get('/api/v1/collaboration/sessions/:sessionId/state', {
    schema: {
      params: z.object({
        sessionId: z.string()
      })
    },
    handler: async (request, reply) => {
      try {
        const { sessionId } = request.params as any;

        const state = await collaborationService.getSessionState(sessionId);

        reply.code(200).send({
          success: true,
          state
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get session state'
        });
      }
    }
  });

  // End session
  fastify.post('/api/v1/collaboration/sessions/:sessionId/end', {
    schema: {
      params: z.object({
        sessionId: z.string()
      }),
      body: z.object({
        userId: z.string()
      })
    },
    handler: async (request, reply) => {
      try {
        const { sessionId } = request.params as any;
        const { userId } = request.body as any;

        const ended = await collaborationService.endSession(sessionId, userId);

        reply.code(200).send({
          success: true,
          ended,
          message: ended ? 'Session ended successfully' : 'Session not found or insufficient permissions'
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to end session'
        });
      }
    }
  });

  // Export session data
  fastify.post('/api/v1/collaboration/sessions/:sessionId/export', {
    schema: {
      params: z.object({
        sessionId: z.string()
      })
    },
    handler: async (request, reply) => {
      try {
        const { sessionId } = request.params as any;

        const exportData = await collaborationService.exportSessionData(sessionId);

        reply.code(200).send({
          success: true,
          data: exportData,
          format: 'json',
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to export session data'
        });
      }
    }
  });

  // Update participant status
  fastify.post('/api/v1/collaboration/participants/status', {
    schema: {
      body: z.object({
        sessionId: z.string(),
        userId: z.string(),
        status: z.enum(['online', 'away', 'offline'])
      })
    },
    handler: async (request, reply) => {
      try {
        const { sessionId, userId, status } = request.body as any;

        await collaborationService.updateParticipantStatus(sessionId, userId, status);

        reply.code(200).send({
          success: true,
          message: 'Participant status updated successfully'
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to update participant status'
        });
      }
    }
  });

  // Get session information
  fastify.get('/api/v1/collaboration/sessions/:sessionId', {
    schema: {
      params: z.object({
        sessionId: z.string()
      })
    },
    handler: async (request, reply) => {
      try {
        const { sessionId } = request.params as any;

        const session = await collaborationService.getSession(sessionId);

        if (!session) {
          reply.code(404).send({
            success: false,
            error: 'Session not found'
          });
          return;
        }

        reply.code(200).send({
          success: true,
          session: {
            id: session.id,
            workspaceId: session.workspaceId,
            projectId: session.projectId,
            participants: session.participants,
            status: session.status,
            createdAt: session.createdAt,
            updatedAt: session.updatedAt,
            settings: session.settings
          }
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get session'
        });
      }
    }
  });

  // Cleanup inactive sessions
  fastify.post('/api/v1/collaboration/cleanup', {
    schema: {
      body: z.object({
        maxAge: z.number().optional() // milliseconds
      })
    },
    handler: async (request, reply) => {
      try {
        const { maxAge = 24 * 60 * 60 * 1000 } = request.body as any; // 24 hours default

        await collaborationService.cleanupInactiveSessions(maxAge);

        reply.code(200).send({
          success: true,
          message: 'Cleanup completed successfully',
          maxAge: maxAge / (60 * 60 * 1000) // Convert to hours for response
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Cleanup failed'
        });
      }
    }
  });

  // WebSocket endpoint for real-time collaboration
  fastify.get('/ws/collaboration/:sessionId', { websocket: true }, (connection, req) => {
    const { sessionId } = req.params as { sessionId: string };

    connection.on('message', async (message: Buffer) => {
      try {
        const data = JSON.parse(message.toString());

        // Handle different types of real-time events
        switch (data.type) {
          case 'cursor:update':
            await collaborationService.updateCursor(
              sessionId,
              data.userId,
              data.cursor
            );
            // Broadcast to other participants
            connection.send(JSON.stringify({
              type: 'cursor:updated',
              userId: data.userId,
              cursor: data.cursor
            }));
            break;

          case 'presence:update':
            await collaborationService.updateParticipantStatus(
              sessionId,
              data.userId,
              data.status
            );
            // Broadcast presence update
            connection.send(JSON.stringify({
              type: 'presence:updated',
              userId: data.userId,
              status: data.status
            }));
            break;
        }
      } catch (error) {
        console.error('WebSocket error:', error);
      }
    });

    // Handle disconnection
    connection.on('close', async () => {
      // Update participant status to offline
      const userId = req.headers['user-id'] as string;
      if (userId) {
        await collaborationService.updateParticipantStatus(
          sessionId,
          userId,
          'offline'
        );
      }
    });
  });
}

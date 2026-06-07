import { verifyToken, UserJwtPayload } from '../../lib/auth';
/**
 * Real-time Collaboration WebSocket Handler
 * Manages live collaboration sessions with cursor tracking and presence
 */

import { FastifyInstance, FastifyRequest } from 'fastify';
import { WebSocket } from 'ws';

interface CollaborationClient {
  ws: WebSocket;
  userId: string;
  projectId: string;
  userName: string;
  userAvatar?: string;
  userColor: string;
  currentFiles: Set<string>; // Files currently open by this user
  lastActivity: Date;
}

interface CollaborationRoom {
  projectId: string;
  clients: Map<string, CollaborationClient>; // userId -> client
  fileActivity: Map<string, Set<string>>; // filePath -> Set<userId>
}

// In-memory storage for collaboration rooms
const collaborationRooms = new Map<string, CollaborationRoom>();

/**
 * Generate a consistent color for a user based on their ID
 */
function generateUserColor(userId: string): string {
  const colors = [
    '#7C3AED', // Purple
    '#10B981', // Green
    '#3B82F6', // Blue
    '#F59E0B', // Amber
    '#EF4444', // Red
    '#8B5CF6', // Violet
    '#EC4899', // Pink
    '#14B8A6', // Teal
    '#F97316', // Orange
    '#06B6D4', // Cyan
  ];

  // Simple hash function
  let hash = 0;
  for (let i = 0; i < userId.length; i++) {
    hash = userId.charCodeAt(i) + ((hash << 5) - hash);
  }

  return colors[Math.abs(hash) % colors.length];
}

/**
 * Get or create a collaboration room
 */
function getOrCreateRoom(projectId: string): CollaborationRoom {
  if (!collaborationRooms.has(projectId)) {
    collaborationRooms.set(projectId, {
      projectId,
      clients: new Map(),
      fileActivity: new Map(),
    });
  }
  return collaborationRooms.get(projectId)!;
}

/**
 * Broadcast message to all clients in a room except sender
 */
function broadcast(room: CollaborationRoom, message: any, excludeUserId?: string): void {
  const messageStr = JSON.stringify(message);

  room.clients.forEach((client, userId) => {
    if (userId !== excludeUserId && client.ws.readyState === WebSocket.OPEN) {
      client.ws.send(messageStr);
    }
  });
}

/**
 * Send message to a specific client
 */
function sendToClient(client: CollaborationClient, message: any): void {
  if (client.ws.readyState === WebSocket.OPEN) {
    client.ws.send(JSON.stringify(message));
  }
}

/**
 * Clean up stale rooms with no active clients
 */
function cleanupStaleRooms(): void {
  collaborationRooms.forEach((room, projectId) => {
    if (room.clients.size === 0) {
      collaborationRooms.delete(projectId);
      console.log(`🧹 Cleaned up empty collaboration room: ${projectId}`);
    }
  });
}

// Run cleanup every 5 minutes
setInterval(cleanupStaleRooms, 5 * 60 * 1000);

export async function collaborationWebSocketRoutes(fastify: FastifyInstance) {
  /**
   * WebSocket endpoint for collaboration
   */
  fastify.get('/ws/collaboration', { websocket: true }, (connection, request: FastifyRequest) => {
    const ws = (connection as any).socket || connection;
    let client: CollaborationClient | null = null;
    let room: CollaborationRoom | null = null;

    console.log('🔗 New collaboration WebSocket connection');

    ws.on('message', (data: Buffer) => {
      try {
        const message = JSON.parse(data.toString());

        switch (message.type) {
          case 'auth':
            handleAuth(message);
            break;

          case 'cursor_move':
            handleCursorMove(message);
            break;

          case 'file_open':
            handleFileOpen(message);
            break;

          case 'file_close':
            handleFileClose(message);
            break;

          case 'editing_start':
            handleEditingStart(message);
            break;

          case 'editing_end':
            handleEditingEnd(message);
            break;

          case 'selection_change':
            handleSelectionChange(message);
            break;

          case 'ping':
            // Respond to heartbeat
            if (client) {
              client.lastActivity = new Date();
              sendToClient(client, { type: 'pong' });
            }
            break;

          default:
            console.warn('Unknown message type:', message.type);
        }
      } catch (error) {
        console.error('Failed to parse WebSocket message:', error);
      }
    });

    ws.on('close', () => {
      if (client && room) {
        console.log(`🔌 User ${client.userId} disconnected from project ${room.projectId}`);

        // Remove client from all files
        client.currentFiles.forEach((filePath) => {
          const fileUsers = room!.fileActivity.get(filePath);
          if (fileUsers) {
            fileUsers.delete(client!.userId);
          }
        });

        // Remove client from room
        room.clients.delete(client.userId);

        // Notify other clients
        broadcast(room, {
          type: 'user_left',
          userId: client.userId,
        });

        // Clean up room if empty
        if (room.clients.size === 0) {
          collaborationRooms.delete(room.projectId);
        }
      }
    });

    ws.on('error', (error: Error) => {
      console.error('WebSocket error:', error);
    });

    function handleAuth(message: any) {
      const { token, projectId } = message;

      if (!token) {
        sendToClient(client!, { type: 'auth_error', message: 'Authentication token missing' });
        ws.close();
        return;
      }

      let decodedToken: UserJwtPayload;
      try {
        decodedToken = verifyToken(token);
      } catch (error) {
        sendToClient(client!, { type: 'auth_error', message: 'Invalid or expired token' });
        ws.close();
        return;
      }

      const userId = decodedToken.id;
      const userName = decodedToken.email.split('@')[0]; // Use email prefix as username for now
      const userAvatar = (decodedToken as any).avatar || undefined; // Assuming avatar might be in JWT
      const userColor = generateUserColor(userId);

      room = getOrCreateRoom(projectId);

      client = {
        ws,
        userId,
        projectId,
        userName,
        userAvatar,
        userColor,
        currentFiles: new Set(),
        lastActivity: new Date(),
      };

      room.clients.set(userId, client);

      console.log(`✅ User ${userId} authenticated for project ${projectId}`);

      // Send current room state to new client
      const existingUsers = Array.from(room.clients.values())
        .filter((c) => c.userId !== userId)
        .map((c) => ({
          type: 'user_joined',
          user: {
            userId: c.userId,
            userName: c.userName,
            userAvatar: c.userAvatar,
            userColor: c.userColor,
          },
        }));

      existingUsers.forEach((msg) => sendToClient(client!, msg));

      // Notify other clients about new user
      broadcast(room, {
        type: 'user_joined',
        user: {
          userId: client.userId,
          userName: client.userName,
          userAvatar: client.userAvatar,
          userColor: client.userColor,
        },
      });
    }

    function handleCursorMove(message: any) {
      if (!client || !room) return;

      client.lastActivity = new Date();

      // Broadcast cursor position to other users viewing the same file
      broadcast(
        room,
        {
          type: 'cursor_move',
          userId: client.userId,
          filePath: message.filePath,
          position: message.position,
        },
        client.userId
      );
    }

    function handleFileOpen(message: any) {
      if (!client || !room) return;

      const { filePath } = message;
      client.currentFiles.add(filePath);
      client.lastActivity = new Date();

      // Add to room's file activity tracking
      if (!room.fileActivity.has(filePath)) {
        room.fileActivity.set(filePath, new Set());
      }
      room.fileActivity.get(filePath)!.add(client.userId);

      // Notify others
      broadcast(
        room,
        {
          type: 'file_open',
          userId: client.userId,
          filePath,
        },
        client.userId
      );

      console.log(`📂 User ${client.userId} opened file: ${filePath}`);
    }

    function handleFileClose(message: any) {
      if (!client || !room) return;

      const { filePath } = message;
      client.currentFiles.delete(filePath);
      client.lastActivity = new Date();

      // Remove from room's file activity tracking
      const fileUsers = room.fileActivity.get(filePath);
      if (fileUsers) {
        fileUsers.delete(client.userId);
      }

      // Notify others
      broadcast(
        room,
        {
          type: 'file_close',
          userId: client.userId,
          filePath,
        },
        client.userId
      );

      console.log(`📂 User ${client.userId} closed file: ${filePath}`);
    }

    function handleEditingStart(message: any) {
      if (!client || !room) return;

      client.lastActivity = new Date();

      // Notify others that user started editing
      broadcast(
        room,
        {
          type: 'editing_start',
          userId: client.userId,
          filePath: message.filePath,
        },
        client.userId
      );
    }

    function handleEditingEnd(message: any) {
      if (!client || !room) return;

      client.lastActivity = new Date();

      // Notify others that user stopped editing
      broadcast(
        room,
        {
          type: 'editing_end',
          userId: client.userId,
          filePath: message.filePath,
        },
        client.userId
      );
    }

    function handleSelectionChange(message: any) {
      if (!client || !room) return;

      client.lastActivity = new Date();

      // Broadcast selection to others
      broadcast(
        room,
        {
          type: 'selection_change',
          userId: client.userId,
          filePath: message.filePath,
          selection: message.selection,
        },
        client.userId
      );
    }
  });
}

export default collaborationWebSocketRoutes;

/**
 * Collaboration WebSocket Server
 *
 * Handles WebSocket connections for real-time collaboration using Y.js protocol.
 * Manages awareness, document synchronization, and TCI integration.
 */

import { WebSocketServer, WebSocket } from 'ws';
import * as Y from 'yjs';
import * as syncProtocol from 'y-protocols/sync';
import * as awarenessProtocol from 'y-protocols/awareness';
import { encoding, decoding, map } from 'lib0';
import { crdtDocumentService } from './CRDTDocumentService';
import { Server } from 'http';
import { verifyToken, UserJwtPayload } from '../../lib/auth';

const MESSAGE_SYNC = 0;
const MESSAGE_AWARENESS = 1;
const MESSAGE_AUTH = 2;
const MESSAGE_QUERY_AWARENESS = 3;

interface CollaborationConnection {
  ws: WebSocket;
  userId: string;
  userName: string;
  userColor: string;
  documentId: string;
  workspaceId: string;
  isAlive: boolean;
  authenticated: boolean;
}

interface AwarenessState {
  user: {
    id: string;
    name: string;
    color: string;
  };
  cursor?: {
    line: number;
    column: number;
  };
  selection?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
  lastActivity: number;
}

export class CollaborationWebSocketServer {
  private wss: WebSocketServer;
  private connections: Map<string, Set<CollaborationConnection>> = new Map(); // documentId -> connections
  private awarenessStates: Map<string, Map<string, AwarenessState>> = new Map(); // documentId -> userId -> state
  private heartbeatInterval: NodeJS.Timeout | null = null;

  constructor(server: Server) {
    this.wss = new WebSocketServer({
      server,
      path: '/collaboration/ws'
    });

    this.setupWebSocketServer();
    this.startHeartbeat();

    console.log('[Collaboration WS] WebSocket server initialized on /collaboration/ws');
  }

  /**
   * Setup WebSocket server
   */
  private setupWebSocketServer(): void {
    this.wss.on('connection', (ws: WebSocket, req) => {
      console.log('[Collaboration WS] New connection attempt');

      const conn: CollaborationConnection = {
        ws,
        userId: '',
        userName: '',
        userColor: '',
        documentId: '',
        workspaceId: '',
        isAlive: true,
        authenticated: false,
      };

      // Handle messages
      ws.on('message', async (message: Buffer) => {
        try {
          await this.handleMessage(conn, new Uint8Array(message));
        } catch (error) {
          console.error('[Collaboration WS] Error handling message:', error);
          this.sendError(ws, 'Error processing message');
        }
      });

      // Handle pong (heartbeat)
      ws.on('pong', () => {
        conn.isAlive = true;
      });

      // Handle close
      ws.on('close', () => {
        this.handleDisconnect(conn);
      });

      // Handle errors
      ws.on('error', (error) => {
        console.error('[Collaboration WS] WebSocket error:', error);
      });
    });
  }

  /**
   * Handle incoming message
   */
  private async handleMessage(conn: CollaborationConnection, message: Uint8Array): Promise<void> {
    const decoder = decoding.createDecoder(message);
    const messageType = decoding.readVarUint(decoder);

    switch (messageType) {
      case MESSAGE_AUTH:
        await this.handleAuth(conn, decoder);
        break;

      case MESSAGE_SYNC:
        if (!conn.authenticated) {
          this.sendError(conn.ws, 'Not authenticated');
          return;
        }
        await this.handleSync(conn, decoder);
        break;

      case MESSAGE_AWARENESS:
        if (!conn.authenticated) {
          this.sendError(conn.ws, 'Not authenticated');
          return;
        }
        await this.handleAwareness(conn, decoder);
        break;

      case MESSAGE_QUERY_AWARENESS:
        if (!conn.authenticated) {
          this.sendError(conn.ws, 'Not authenticated');
          return;
        }
        this.sendAwarenessStates(conn);
        break;

      default:
        console.warn(`[Collaboration WS] Unknown message type: ${messageType}`);
    }
  }

  /**
   * Handle authentication
   */
  private async handleAuth(conn: CollaborationConnection, decoder: decoding.Decoder): Promise<void> {
    const authData = JSON.parse(decoding.readVarString(decoder));

    const { documentId, workspaceId, token } = authData;

    if (!token) {
      this.sendError(conn.ws, 'Authentication token missing');
      conn.ws.close();
      return;
    }

    let decodedToken: UserJwtPayload;
    try {
      decodedToken = verifyToken(token);
    } catch (error) {
      this.sendError(conn.ws, 'Invalid or expired token');
      conn.ws.close();
      return;
    }

    // Now use data from the verified token
    const userId = decodedToken.id;
    const userName = decodedToken.email.split('@')[0]; // Use email prefix as username for now
    const userColor = authData.userColor || this.generateColor(); // Allow client to suggest color, or generate

    if (!userId || !documentId || !workspaceId) {
      this.sendError(conn.ws, 'Missing required collaboration data (userId, documentId, workspaceId)');
      conn.ws.close();
      return;
    }

    // Set connection data
    conn.userId = userId;
    conn.userName = userName;
    conn.userColor = userColor;
    conn.documentId = documentId;
    conn.workspaceId = workspaceId;
    conn.authenticated = true;

    // Add to connections map
    if (!this.connections.has(documentId)) {
      this.connections.set(documentId, new Set());
    }
    this.connections.get(documentId)!.add(conn);

    // Initialize awareness state
    if (!this.awarenessStates.has(documentId)) {
      this.awarenessStates.set(documentId, new Map());
    }
    this.awarenessStates.get(documentId)!.set(userId, {
      user: {
        id: userId,
        name: conn.userName,
        color: conn.userColor,
      },
      lastActivity: Date.now(),
    });

    // Get or create document
    const ydoc = await crdtDocumentService.getDocument(
      documentId,
      workspaceId,
      authData.filePath || 'unknown',
      authData.language || 'typescript'
    );

    // Update collaborator count
    const collaboratorCount = this.connections.get(documentId)?.size || 0;
    crdtDocumentService.updateCollaboratorCount(documentId, collaboratorCount);

    // Send sync step 1 (full state)
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);
    syncProtocol.writeSyncStep1(encoder, ydoc);
    this.send(conn.ws, encoding.toUint8Array(encoder));

    // Send current awareness states
    this.sendAwarenessStates(conn);

    // Broadcast new user joined
    this.broadcastAwareness(documentId, userId);

    console.log(`[Collaboration WS] User ${userName} (${userId}) joined document ${documentId}`);
  }

  /**
   * Handle sync message
   */
  private async handleSync(conn: CollaborationConnection, decoder: decoding.Decoder): Promise<void> {
    const ydoc = await crdtDocumentService.getDocument(
      conn.documentId,
      conn.workspaceId,
      'unknown',
      'typescript'
    );

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_SYNC);

    const syncMessageType = syncProtocol.readSyncMessage(decoder, encoder, ydoc, conn);

    // If there's a response, send it
    const response = encoding.toUint8Array(encoder);
    if (response.length > 1) {
      this.send(conn.ws, response);
    }

    // Broadcast update to other clients
    if (syncMessageType === syncProtocol.messageYjsSyncStep2) {
      this.broadcastSync(conn.documentId, conn.userId, response);
    }
  }

  /**
   * Handle awareness message
   */
  private async handleAwareness(conn: CollaborationConnection, decoder: decoding.Decoder): Promise<void> {
    const update = decoding.readVarUint8Array(decoder);

    // Parse awareness update
    const awarenessDecoder = decoding.createDecoder(update);
    const length = decoding.readVarUint(awarenessDecoder);

    for (let i = 0; i < length; i++) {
      const clientId = decoding.readVarUint(awarenessDecoder);
      const clock = decoding.readVarUint(awarenessDecoder);
      const state = JSON.parse(decoding.readVarString(awarenessDecoder));

      // Update awareness state
      const docStates = this.awarenessStates.get(conn.documentId);
      if (docStates) {
        docStates.set(conn.userId, {
          ...state,
          user: {
            id: conn.userId,
            name: conn.userName,
            color: conn.userColor,
          },
          lastActivity: Date.now(),
        });
      }
    }

    // Broadcast awareness to other clients
    this.broadcastAwareness(conn.documentId, conn.userId);
  }

  /**
   * Send awareness states to a connection
   */
  private sendAwarenessStates(conn: CollaborationConnection): void {
    const docStates = this.awarenessStates.get(conn.documentId);
    if (!docStates) return;

    const states = Array.from(docStates.entries())
      .filter(([userId]) => userId !== conn.userId) // Don't send user's own state
      .map(([userId, state]) => state);

    if (states.length === 0) return;

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarString(encoder, JSON.stringify(states));

    this.send(conn.ws, encoding.toUint8Array(encoder));
  }

  /**
   * Broadcast awareness update
   */
  private broadcastAwareness(documentId: string, excludeUserId?: string): void {
    const docStates = this.awarenessStates.get(documentId);
    if (!docStates) return;

    const states = Array.from(docStates.values());

    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, MESSAGE_AWARENESS);
    encoding.writeVarString(encoder, JSON.stringify(states));

    const message = encoding.toUint8Array(encoder);
    this.broadcast(documentId, message, excludeUserId);
  }

  /**
   * Broadcast sync message
   */
  private broadcastSync(documentId: string, excludeUserId: string, message: Uint8Array): void {
    this.broadcast(documentId, message, excludeUserId);
  }

  /**
   * Broadcast message to all connections in a document
   */
  private broadcast(documentId: string, message: Uint8Array, excludeUserId?: string): void {
    const connections = this.connections.get(documentId);
    if (!connections) return;

    connections.forEach(conn => {
      if (excludeUserId && conn.userId === excludeUserId) return;
      if (conn.ws.readyState === WebSocket.OPEN) {
        this.send(conn.ws, message);
      }
    });
  }

  /**
   * Send message to a WebSocket
   */
  private send(ws: WebSocket, message: Uint8Array): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(message, (error) => {
        if (error) {
          console.error('[Collaboration WS] Send error:', error);
        }
      });
    }
  }

  /**
   * Send error message
   */
  private sendError(ws: WebSocket, error: string): void {
    const encoder = encoding.createEncoder();
    encoding.writeVarUint(encoder, 99); // Error message type
    encoding.writeVarString(encoder, error);
    this.send(ws, encoding.toUint8Array(encoder));
  }

  /**
   * Handle disconnect
   */
  private handleDisconnect(conn: CollaborationConnection): void {
    if (!conn.authenticated) return;

    console.log(`[Collaboration WS] User ${conn.userName} (${conn.userId}) left document ${conn.documentId}`);

    // Remove from connections
    const connections = this.connections.get(conn.documentId);
    if (connections) {
      connections.delete(conn);

      // Update collaborator count
      crdtDocumentService.updateCollaboratorCount(conn.documentId, connections.size);

      // If no more connections, clean up
      if (connections.size === 0) {
        this.connections.delete(conn.documentId);
        this.awarenessStates.delete(conn.documentId);
      }
    }

    // Remove awareness state
    const docStates = this.awarenessStates.get(conn.documentId);
    if (docStates) {
      docStates.delete(conn.userId);
    }

    // Broadcast user left
    this.broadcastAwareness(conn.documentId);
  }

  /**
   * Start heartbeat to detect dead connections
   */
  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.wss.clients.forEach((ws: any) => {
        if (ws.isAlive === false) {
          return ws.terminate();
        }

        ws.isAlive = false;
        ws.ping();
      });
    }, 30000); // 30 seconds
  }

  /**
   * Generate random color for user
   */
  private generateColor(): string {
    const colors = [
      '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A',
      '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E2',
      '#F8B88B', '#A3E4D7', '#FAD7A0', '#D7BDE2',
    ];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalConnections: number;
    documentsWithCollaborators: number;
    collaboratorsByDocument: Array<{ documentId: string; count: number }>;
  } {
    const collaboratorsByDocument = Array.from(this.connections.entries()).map(([documentId, conns]) => ({
      documentId,
      count: conns.size,
    }));

    return {
      totalConnections: this.wss.clients.size,
      documentsWithCollaborators: this.connections.size,
      collaboratorsByDocument,
    };
  }

  /**
   * Shutdown
   */
  shutdown(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }

    this.wss.close();
    console.log('[Collaboration WS] Server shutdown');
  }
}

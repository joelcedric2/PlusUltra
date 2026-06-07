import { EventEmitter } from 'events';
import { WorkspaceManager } from './WorkspaceManager';
import WebSocket from 'ws';
import http from 'http';
import httpProxy from 'http-proxy';

export interface PreviewConnection {
  workspaceId: string;
  userId: string;
  ws: WebSocket;
  connectedAt: Date;
}

export interface PreviewEvent {
  type: 'log' | 'error' | 'reload' | 'status' | 'stats';
  data: any;
  timestamp: Date;
}

/**
 * LivePreviewService
 * Manages real-time preview connections and proxies requests to user workspaces
 * Provides WebSocket connections for live updates, logs, and hot reload
 */
export class LivePreviewService extends EventEmitter {
  private workspaceManager: WorkspaceManager;
  private connections: Map<string, PreviewConnection[]> = new Map();
  private proxy: httpProxy;
  private readonly LOG_BUFFER_SIZE = 1000;
  private logBuffers: Map<string, PreviewEvent[]> = new Map();

  constructor(workspaceManager: WorkspaceManager) {
    super();
    this.workspaceManager = workspaceManager;

    // Create reverse proxy for preview URLs
    this.proxy = httpProxy.createProxyServer({
      changeOrigin: true,
      ws: true
    });

    this.setupWorkspaceListeners();
  }

  /**
   * Handle WebSocket connection for live preview
   */
  async handleConnection(
    ws: WebSocket,
    workspaceId: string,
    userId: string
  ): Promise<void> {
    // Verify workspace access
    const workspace = await this.workspaceManager.getWorkspace(workspaceId);
    if (!workspace || workspace.userId !== userId) {
      ws.close(1008, 'Unauthorized');
      return;
    }

    // Create connection record
    const connection: PreviewConnection = {
      workspaceId,
      userId,
      ws,
      connectedAt: new Date()
    };

    // Store connection
    if (!this.connections.has(workspaceId)) {
      this.connections.set(workspaceId, []);
    }
    this.connections.get(workspaceId)!.push(connection);

    // Send initial status
    this.sendEvent(ws, {
      type: 'status',
      data: {
        workspace,
        connected: true
      },
      timestamp: new Date()
    });

    // Send buffered logs
    const bufferedLogs = this.logBuffers.get(workspaceId) || [];
    bufferedLogs.forEach(log => this.sendEvent(ws, log));

    // Set up message handling
    ws.on('message', async (message: string) => {
      try {
        const data = JSON.parse(message);
        await this.handleClientMessage(workspaceId, data);
      } catch (error) {
        console.error('Error handling client message:', error);
      }
    });

    // Clean up on close
    ws.on('close', () => {
      this.removeConnection(workspaceId, connection);
    });

    // Handle errors
    ws.on('error', (error) => {
      console.error('WebSocket error:', error);
      this.removeConnection(workspaceId, connection);
    });

    this.emit('preview:connected', { workspaceId, userId });
  }

  /**
   * Proxy HTTP request to workspace preview
   */
  async proxyRequest(
    req: http.IncomingMessage,
    res: http.ServerResponse,
    workspaceId: string
  ): Promise<void> {
    const workspace = await this.workspaceManager.getWorkspace(workspaceId);
    if (!workspace || !workspace.previewUrl) {
      res.writeHead(404);
      res.end('Workspace not found or not ready');
      return;
    }

    // Proxy to workspace container
    this.proxy.web(req, res, {
      target: workspace.previewUrl
    });
  }

  /**
   * Proxy WebSocket to workspace
   */
  async proxyWebSocket(
    req: http.IncomingMessage,
    socket: any,
    head: Buffer,
    workspaceId: string
  ): Promise<void> {
    const workspace = await this.workspaceManager.getWorkspace(workspaceId);
    if (!workspace || !workspace.previewUrl) {
      socket.destroy();
      return;
    }

    // Proxy WebSocket to workspace container
    this.proxy.ws(req, socket, head, {
      target: workspace.previewUrl
    });
  }

  /**
   * Broadcast log message to all connections for a workspace
   */
  async broadcastLog(workspaceId: string, message: string, level: 'info' | 'error' | 'warn' = 'info'): Promise<void> {
    const event: PreviewEvent = {
      type: level === 'error' ? 'error' : 'log',
      data: { message, level },
      timestamp: new Date()
    };

    this.bufferEvent(workspaceId, event);
    this.broadcastEvent(workspaceId, event);
  }

  /**
   * Trigger reload for all preview connections
   */
  async triggerReload(workspaceId: string): Promise<void> {
    const event: PreviewEvent = {
      type: 'reload',
      data: { reason: 'files_updated' },
      timestamp: new Date()
    };

    this.broadcastEvent(workspaceId, event);
  }

  /**
   * Send workspace status update
   */
  async sendStatusUpdate(workspaceId: string): Promise<void> {
    const workspace = await this.workspaceManager.getWorkspace(workspaceId);
    if (!workspace) return;

    const event: PreviewEvent = {
      type: 'status',
      data: {
        status: workspace.status,
        sandboxStatus: workspace.sandboxStatus
      },
      timestamp: new Date()
    };

    this.broadcastEvent(workspaceId, event);
  }

  /**
   * Stream workspace logs
   */
  async streamLogs(workspaceId: string): Promise<void> {
    try {
      const logs = await this.workspaceManager.getWorkspaceLogs(workspaceId, 50);

      logs.forEach(log => {
        this.broadcastLog(workspaceId, log);
      });
    } catch (error) {
      console.error('Error streaming logs:', error);
    }
  }

  /**
   * Start streaming workspace stats
   */
  startStatsStream(workspaceId: string, interval: number = 5000): NodeJS.Timer {
    return setInterval(async () => {
      try {
        const stats = await this.workspaceManager.getWorkspaceStats(workspaceId);

        const event: PreviewEvent = {
          type: 'stats',
          data: stats,
          timestamp: new Date()
        };

        this.broadcastEvent(workspaceId, event);
      } catch (error) {
        // Workspace might be stopped, ignore errors
      }
    }, interval);
  }

  /**
   * Get active connections count for workspace
   */
  getConnectionCount(workspaceId: string): number {
    return this.connections.get(workspaceId)?.length || 0;
  }

  /**
   * Get all active workspaces with connections
   */
  getActiveWorkspaces(): string[] {
    return Array.from(this.connections.keys());
  }

  /**
   * Private helper methods
   */

  private async handleClientMessage(workspaceId: string, message: any): Promise<void> {
    switch (message.type) {
      case 'execute':
        // Execute command in workspace
        if (message.command) {
          try {
            const output = await this.workspaceManager.executeCommand(
              workspaceId,
              message.command
            );
            this.broadcastLog(workspaceId, output);
          } catch (error) {
            this.broadcastLog(
              workspaceId,
              `Error: ${error instanceof Error ? error.message : 'Unknown error'}`,
              'error'
            );
          }
        }
        break;

      case 'restart':
        // Restart workspace
        try {
          await this.workspaceManager.restartWorkspace(workspaceId);
          this.sendStatusUpdate(workspaceId);
        } catch (error) {
          this.broadcastLog(
            workspaceId,
            `Failed to restart: ${error instanceof Error ? error.message : 'Unknown error'}`,
            'error'
          );
        }
        break;

      case 'getLogs':
        // Send recent logs
        await this.streamLogs(workspaceId);
        break;

      default:
        console.warn('Unknown message type:', message.type);
    }
  }

  private sendEvent(ws: WebSocket, event: PreviewEvent): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }

  private broadcastEvent(workspaceId: string, event: PreviewEvent): void {
    const connections = this.connections.get(workspaceId) || [];
    connections.forEach(conn => {
      this.sendEvent(conn.ws, event);
    });
  }

  private bufferEvent(workspaceId: string, event: PreviewEvent): void {
    if (!this.logBuffers.has(workspaceId)) {
      this.logBuffers.set(workspaceId, []);
    }

    const buffer = this.logBuffers.get(workspaceId)!;
    buffer.push(event);

    // Keep buffer size limited
    if (buffer.length > this.LOG_BUFFER_SIZE) {
      buffer.shift();
    }
  }

  private removeConnection(workspaceId: string, connection: PreviewConnection): void {
    const connections = this.connections.get(workspaceId);
    if (!connections) return;

    const index = connections.indexOf(connection);
    if (index > -1) {
      connections.splice(index, 1);
    }

    // Clean up if no more connections
    if (connections.length === 0) {
      this.connections.delete(workspaceId);
      this.logBuffers.delete(workspaceId);
    }

    this.emit('preview:disconnected', {
      workspaceId,
      userId: connection.userId
    });
  }

  private setupWorkspaceListeners(): void {
    // Listen to workspace manager events
    this.workspaceManager.on('workspace:created', (workspace) => {
      this.sendStatusUpdate(workspace.id);
    });

    this.workspaceManager.on('workspace:updated', ({ workspaceId }) => {
      this.triggerReload(workspaceId);
      this.sendStatusUpdate(workspaceId);
    });

    this.workspaceManager.on('workspace:restarted', (workspace) => {
      this.sendStatusUpdate(workspace.id);
      this.triggerReload(workspace.id);
    });

    this.workspaceManager.on('workspace:stopped', (workspace) => {
      this.sendStatusUpdate(workspace.id);
    });

    this.workspaceManager.on('workspace:destroyed', ({ workspaceId }) => {
      // Close all connections
      const connections = this.connections.get(workspaceId) || [];
      connections.forEach(conn => {
        conn.ws.close(1000, 'Workspace destroyed');
      });
      this.connections.delete(workspaceId);
      this.logBuffers.delete(workspaceId);
    });
  }

  /**
   * Cleanup
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down LivePreviewService...');

    // Close all WebSocket connections
    for (const [workspaceId, connections] of this.connections) {
      connections.forEach(conn => {
        conn.ws.close(1000, 'Server shutting down');
      });
    }

    this.connections.clear();
    this.logBuffers.clear();
    this.proxy.close();
  }
}

export default LivePreviewService;

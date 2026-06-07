/**
 * Real-time Collaboration Service
 * Manages WebSocket connections for live collaboration features
 */

import { FileCollaborator } from '@/components/collaboration/FileCollaborationIndicator';

export type CollaborationEvent =
  | {
      type: 'cursor_move';
      userId: string;
      filePath: string;
      position: { line: number; column: number };
    }
  | {
      type: 'file_open';
      userId: string;
      filePath: string;
    }
  | {
      type: 'file_close';
      userId: string;
      filePath: string;
    }
  | {
      type: 'editing_start';
      userId: string;
      filePath: string;
    }
  | {
      type: 'editing_end';
      userId: string;
      filePath: string;
    }
  | {
      type: 'selection_change';
      userId: string;
      filePath: string;
      selection: { start: { line: number; column: number }; end: { line: number; column: number } };
    }
  | {
      type: 'user_joined';
      user: {
        userId: string;
        userName: string;
        userAvatar?: string;
        userColor: string;
      };
    }
  | {
      type: 'user_left';
      userId: string;
    };

interface CollaborationState {
  projectId: string;
  userId: string;
  collaborators: Map<string, FileCollaborator>;
  fileCollaborators: Map<string, Set<string>>; // filePath -> Set<userId>
  userFiles: Map<string, Set<string>>; // userId -> Set<filePath>
}

type CollaborationEventListener = (event: CollaborationEvent) => void;

export class CollaborationService {
  private ws: WebSocket | null = null;
  private state: CollaborationState;
  private listeners: Set<CollaborationEventListener> = new Set();
  private reconnectInterval: number = 5000;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private isConnecting: boolean = false;

  constructor(projectId: string, userId: string) {
    this.state = {
      projectId,
      userId,
      collaborators: new Map(),
      fileCollaborators: new Map(),
      userFiles: new Map(),
    };
  }

  /**
   * Connect to collaboration WebSocket
   */
  async connect(token: string): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN || this.isConnecting) {
      return;
    }

    this.isConnecting = true;

    try {
      const wsUrl = this.getWebSocketUrl();
      this.ws = new WebSocket(wsUrl);

      this.ws.onopen = () => {
        console.log('🔗 Collaboration WebSocket connected');
        this.isConnecting = false;

        // Authenticate
        this.send({
          type: 'auth',
          token,
          projectId: this.state.projectId,
          userId: this.state.userId,
        });

        // Start heartbeat
        this.startHeartbeat();
      };

      this.ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          this.handleMessage(data);
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error);
        }
      };

      this.ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        this.isConnecting = false;
      };

      this.ws.onclose = () => {
        console.log('🔌 Collaboration WebSocket disconnected');
        this.isConnecting = false;
        this.stopHeartbeat();
        this.scheduleReconnect();
      };
    } catch (error) {
      console.error('Failed to connect to collaboration WebSocket:', error);
      this.isConnecting = false;
      this.scheduleReconnect();
    }
  }

  /**
   * Disconnect from WebSocket
   */
  disconnect(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }

    this.stopHeartbeat();

    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }

    this.state.collaborators.clear();
    this.state.fileCollaborators.clear();
    this.state.userFiles.clear();
  }

  /**
   * Send cursor position update
   */
  updateCursorPosition(filePath: string, line: number, column: number): void {
    this.send({
      type: 'cursor_move',
      userId: this.state.userId,
      filePath,
      position: { line, column },
    });
  }

  /**
   * Notify that user opened a file
   */
  openFile(filePath: string): void {
    this.send({
      type: 'file_open',
      userId: this.state.userId,
      filePath,
    });
  }

  /**
   * Notify that user closed a file
   */
  closeFile(filePath: string): void {
    this.send({
      type: 'file_close',
      userId: this.state.userId,
      filePath,
    });
  }

  /**
   * Notify that user started editing
   */
  startEditing(filePath: string): void {
    this.send({
      type: 'editing_start',
      userId: this.state.userId,
      filePath,
    });

    // Update local collaborator status
    const collaborator = this.state.collaborators.get(this.state.userId);
    if (collaborator) {
      collaborator.status = 'editing';
      collaborator.lastActivity = new Date();
    }
  }

  /**
   * Notify that user stopped editing
   */
  stopEditing(filePath: string): void {
    this.send({
      type: 'editing_end',
      userId: this.state.userId,
      filePath,
    });

    // Update local collaborator status
    const collaborator = this.state.collaborators.get(this.state.userId);
    if (collaborator) {
      collaborator.status = 'viewing';
      collaborator.lastActivity = new Date();
    }
  }

  /**
   * Update text selection
   */
  updateSelection(
    filePath: string,
    start: { line: number; column: number },
    end: { line: number; column: number }
  ): void {
    this.send({
      type: 'selection_change',
      userId: this.state.userId,
      filePath,
      selection: { start, end },
    });
  }

  /**
   * Get collaborators for a specific file
   */
  getFileCollaborators(filePath: string): FileCollaborator[] {
    const userIds = this.state.fileCollaborators.get(filePath);
    if (!userIds) return [];

    return Array.from(userIds)
      .map((userId) => this.state.collaborators.get(userId))
      .filter((collab): collab is FileCollaborator => collab !== undefined);
  }

  /**
   * Get all active collaborators in the project
   */
  getAllCollaborators(): FileCollaborator[] {
    return Array.from(this.state.collaborators.values());
  }

  /**
   * Subscribe to collaboration events
   */
  on(listener: CollaborationEventListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Private: Handle incoming WebSocket message
   */
  private handleMessage(data: any): void {
    const event = data as CollaborationEvent;

    switch (event.type) {
      case 'user_joined':
        this.handleUserJoined(event.user);
        break;

      case 'user_left':
        this.handleUserLeft(event.userId);
        break;

      case 'cursor_move':
        this.handleCursorMove(event.userId, event.filePath, event.position);
        break;

      case 'file_open':
        this.handleFileOpen(event.userId, event.filePath);
        break;

      case 'file_close':
        this.handleFileClose(event.userId, event.filePath);
        break;

      case 'editing_start':
        this.handleEditingStart(event.userId, event.filePath);
        break;

      case 'editing_end':
        this.handleEditingEnd(event.userId, event.filePath);
        break;

      case 'selection_change':
        // Handle selection change (not implemented in base state)
        break;
    }

    // Notify listeners
    this.listeners.forEach((listener) => listener(event));
  }

  private handleUserJoined(user: {
    userId: string;
    userName: string;
    userAvatar?: string;
    userColor: string;
  }): void {
    const collaborator: FileCollaborator = {
      userId: user.userId,
      userName: user.userName,
      userAvatar: user.userAvatar,
      userColor: user.userColor,
      status: 'viewing',
      lastActivity: new Date(),
    };

    this.state.collaborators.set(user.userId, collaborator);
  }

  private handleUserLeft(userId: string): void {
    // Remove from all file collaborator lists
    const files = this.state.userFiles.get(userId);
    if (files) {
      files.forEach((filePath) => {
        const fileCollabs = this.state.fileCollaborators.get(filePath);
        if (fileCollabs) {
          fileCollabs.delete(userId);
        }
      });
    }

    this.state.collaborators.delete(userId);
    this.state.userFiles.delete(userId);
  }

  private handleCursorMove(userId: string, filePath: string, position: { line: number; column: number }): void {
    const collaborator = this.state.collaborators.get(userId);
    if (collaborator) {
      collaborator.cursorPosition = position;
      collaborator.lastActivity = new Date();
    }
  }

  private handleFileOpen(userId: string, filePath: string): void {
    // Add to file collaborators
    if (!this.state.fileCollaborators.has(filePath)) {
      this.state.fileCollaborators.set(filePath, new Set());
    }
    this.state.fileCollaborators.get(filePath)!.add(userId);

    // Add to user files
    if (!this.state.userFiles.has(userId)) {
      this.state.userFiles.set(userId, new Set());
    }
    this.state.userFiles.get(userId)!.add(filePath);

    // Update activity
    const collaborator = this.state.collaborators.get(userId);
    if (collaborator) {
      collaborator.lastActivity = new Date();
    }
  }

  private handleFileClose(userId: string, filePath: string): void {
    // Remove from file collaborators
    const fileCollabs = this.state.fileCollaborators.get(filePath);
    if (fileCollabs) {
      fileCollabs.delete(userId);
    }

    // Remove from user files
    const userFiles = this.state.userFiles.get(userId);
    if (userFiles) {
      userFiles.delete(filePath);
    }
  }

  private handleEditingStart(userId: string, filePath: string): void {
    const collaborator = this.state.collaborators.get(userId);
    if (collaborator) {
      collaborator.status = 'editing';
      collaborator.lastActivity = new Date();
    }
  }

  private handleEditingEnd(userId: string, filePath: string): void {
    const collaborator = this.state.collaborators.get(userId);
    if (collaborator) {
      collaborator.status = 'viewing';
      collaborator.lastActivity = new Date();
    }
  }

  private send(data: any): void {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(data));
    }
  }

  private getWebSocketUrl(): string {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = import.meta.env.VITE_API_URL?.replace(/^https?:\/\//, '') || 'localhost:3000';
    return `${protocol}//${host}/ws/collaboration`;
  }

  private startHeartbeat(): void {
    this.heartbeatInterval = setInterval(() => {
      this.send({ type: 'ping' });
    }, 30000); // 30 seconds
  }

  private stopHeartbeat(): void {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.reconnectTimer) return;

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      console.log('🔄 Attempting to reconnect to collaboration WebSocket...');
      // Note: Token needs to be passed again, should be stored or retrieved from auth context
    }, this.reconnectInterval);
  }
}

/**
 * Hook for using collaboration in React components
 */
export function useCollaboration(projectId: string, userId: string, token: string) {
  const [service] = React.useState(() => new CollaborationService(projectId, userId));
  const [collaborators, setCollaborators] = React.useState<FileCollaborator[]>([]);

  React.useEffect(() => {
    service.connect(token);

    const unsubscribe = service.on(() => {
      // Update collaborators on any event
      setCollaborators(service.getAllCollaborators());
    });

    return () => {
      unsubscribe();
      service.disconnect();
    };
  }, [service, token]);

  return {
    service,
    collaborators,
    getFileCollaborators: (filePath: string) => service.getFileCollaborators(filePath),
  };
}

// Note: Import React for the hook
import * as React from 'react';

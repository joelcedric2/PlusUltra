import { WebSocket } from 'ws';
import { EventEmitter } from 'events';

/**
 * Google Docs/Sheets-Style Real-Time Collaboration Service
 *
 * Provides the exact collaborative UX patterns that users already know:
 * - Colored cursors with name labels
 * - Selection highlights with translucent overlays
 * - Presence indicators showing who's in which file
 * - Smooth, real-time updates without jarring teleportation
 *
 * The goal: Make users say "This is Google Docs for code!"
 */

// Color palette matching Google Docs/Sheets style
const GOOGLE_DOCS_COLORS = [
  { name: 'Red', hex: '#FF6B6B', rgba: 'rgba(255, 107, 107, 0.2)' },
  { name: 'Blue', hex: '#4D96FF', rgba: 'rgba(77, 150, 255, 0.2)' },
  { name: 'Green', hex: '#6BCF7F', rgba: 'rgba(107, 207, 127, 0.2)' },
  { name: 'Purple', hex: '#B24BF3', rgba: 'rgba(178, 75, 243, 0.2)' },
  { name: 'Orange', hex: '#FF9F43', rgba: 'rgba(255, 159, 67, 0.2)' },
  { name: 'Teal', hex: '#00D9C0', rgba: 'rgba(0, 217, 192, 0.2)' },
  { name: 'Pink', hex: '#FF6BA9', rgba: 'rgba(255, 107, 169, 0.2)' },
  { name: 'Yellow', hex: '#FFC247', rgba: 'rgba(255, 194, 71, 0.2)' },
  { name: 'Indigo', hex: '#5F72BD', rgba: 'rgba(95, 114, 189, 0.2)' },
  { name: 'Lime', hex: '#A8E05F', rgba: 'rgba(168, 224, 95, 0.2)' },
];

export interface CollaboratorInfo {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  color: {
    name: string;
    hex: string;
    rgba: string;
  };
  status: 'active' | 'idle' | 'away';
  lastActivity: Date;
}

export interface CursorPosition {
  userId: string;
  file: string;
  line: number;
  column: number;
  timestamp: Date;
}

export interface Selection {
  userId: string;
  file: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  timestamp: Date;
}

export interface FilePresence {
  file: string;
  viewers: string[]; // User IDs just viewing
  editors: string[]; // User IDs actively editing
}

export interface CollaborationSession {
  sessionId: string;
  projectId: string;
  collaborators: Map<string, CollaboratorInfo>;
  cursors: Map<string, CursorPosition>;
  selections: Map<string, Selection>;
  filePresence: Map<string, FilePresence>;
  createdAt: Date;
  lastActivity: Date;
}

export interface CursorUpdateMessage {
  type: 'cursor';
  userId: string;
  file: string;
  line: number;
  column: number;
}

export interface SelectionUpdateMessage {
  type: 'selection';
  userId: string;
  file: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
}

export interface FilePresenceMessage {
  type: 'file_presence';
  userId: string;
  file: string;
  action: 'open' | 'close' | 'edit' | 'view';
}

export interface PresenceBroadcast {
  type: 'presence_update';
  collaborators: CollaboratorInfo[];
  cursors: CursorPosition[];
  selections: Selection[];
  filePresence: FilePresence[];
}

export class GoogleDocsStyleCollaboration extends EventEmitter {
  private sessions: Map<string, CollaborationSession> = new Map();
  private userSessions: Map<string, string> = new Map(); // userId -> sessionId
  private websockets: Map<string, WebSocket> = new Map(); // userId -> WebSocket
  private colorAssignments: Map<string, number> = new Map(); // sessionId -> next color index
  private idleCheckInterval: NodeJS.Timeout;

  constructor(private idleThresholdMs: number = 60000) {
    // 1 minute idle threshold
    super();

    // Check for idle users every 30 seconds
    this.idleCheckInterval = setInterval(() => {
      this.checkIdleUsers();
    }, 30000);
  }

  /**
   * Create or join a collaboration session
   */
  joinSession(
    sessionId: string,
    projectId: string,
    userId: string,
    userName: string,
    userEmail: string,
    userAvatar?: string,
    ws?: WebSocket
  ): CollaboratorInfo {
    // Get or create session
    let session = this.sessions.get(sessionId);
    if (!session) {
      session = {
        sessionId,
        projectId,
        collaborators: new Map(),
        cursors: new Map(),
        selections: new Map(),
        filePresence: new Map(),
        createdAt: new Date(),
        lastActivity: new Date(),
      };
      this.sessions.set(sessionId, session);
      this.colorAssignments.set(sessionId, 0);
    }

    // Check if user already in session
    let collaborator = session.collaborators.get(userId);
    if (collaborator) {
      // Update existing collaborator
      collaborator.status = 'active';
      collaborator.lastActivity = new Date();
    } else {
      // Assign color to new collaborator
      const colorIndex = this.colorAssignments.get(sessionId)!;
      const color = GOOGLE_DOCS_COLORS[colorIndex % GOOGLE_DOCS_COLORS.length];

      collaborator = {
        id: userId,
        name: userName,
        email: userEmail,
        avatar: userAvatar,
        color,
        status: 'active',
        lastActivity: new Date(),
      };

      session.collaborators.set(userId, collaborator);
      this.colorAssignments.set(sessionId, colorIndex + 1);
    }

    // Track user session and websocket
    this.userSessions.set(userId, sessionId);
    if (ws) {
      this.websockets.set(userId, ws);
    }

    // Broadcast presence update to all collaborators
    this.broadcastPresenceUpdate(sessionId);

    return collaborator;
  }

  /**
   * Leave a collaboration session
   */
  leaveSession(userId: string): void {
    const sessionId = this.userSessions.get(userId);
    if (!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Remove user from session
    session.collaborators.delete(userId);
    session.cursors.delete(userId);
    session.selections.delete(userId);

    // Remove from file presence
    session.filePresence.forEach((presence) => {
      presence.viewers = presence.viewers.filter((id) => id !== userId);
      presence.editors = presence.editors.filter((id) => id !== userId);
    });

    // Clean up tracking
    this.userSessions.delete(userId);
    this.websockets.delete(userId);

    // If session is empty, delete it
    if (session.collaborators.size === 0) {
      this.sessions.delete(sessionId);
      this.colorAssignments.delete(sessionId);
    } else {
      // Broadcast presence update
      this.broadcastPresenceUpdate(sessionId);
    }
  }

  /**
   * Update cursor position (Google Docs-style smooth cursor movement)
   */
  updateCursor(userId: string, file: string, line: number, column: number): void {
    const sessionId = this.userSessions.get(userId);
    if (!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (!session) return;

    const cursor: CursorPosition = {
      userId,
      file,
      line,
      column,
      timestamp: new Date(),
    };

    session.cursors.set(userId, cursor);
    session.lastActivity = new Date();

    // Update collaborator activity
    const collaborator = session.collaborators.get(userId);
    if (collaborator) {
      collaborator.lastActivity = new Date();
      collaborator.status = 'active';
    }

    // Broadcast cursor update to other collaborators
    this.broadcastCursorUpdate(sessionId, cursor);
  }

  /**
   * Update selection (Google Docs-style translucent highlight)
   */
  updateSelection(
    userId: string,
    file: string,
    startLine: number,
    startColumn: number,
    endLine: number,
    endColumn: number
  ): void {
    const sessionId = this.userSessions.get(userId);
    if (!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (!session) return;

    const selection: Selection = {
      userId,
      file,
      startLine,
      startColumn,
      endLine,
      endColumn,
      timestamp: new Date(),
    };

    session.selections.set(userId, selection);
    session.lastActivity = new Date();

    // Update collaborator activity
    const collaborator = session.collaborators.get(userId);
    if (collaborator) {
      collaborator.lastActivity = new Date();
      collaborator.status = 'active';
    }

    // Broadcast selection update
    this.broadcastSelectionUpdate(sessionId, selection);
  }

  /**
   * Clear selection (user deselected text)
   */
  clearSelection(userId: string): void {
    const sessionId = this.userSessions.get(userId);
    if (!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.selections.delete(userId);

    // Broadcast selection clear
    this.broadcastToSession(sessionId, {
      type: 'selection_clear',
      userId,
    });
  }

  /**
   * Update file presence (Google Docs-style "Joel is editing Header.tsx")
   */
  updateFilePresence(userId: string, file: string, action: 'open' | 'close' | 'edit' | 'view'): void {
    const sessionId = this.userSessions.get(userId);
    if (!sessionId) return;

    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Get or create file presence
    let presence = session.filePresence.get(file);
    if (!presence) {
      presence = { file, viewers: [], editors: [] };
      session.filePresence.set(file, presence);
    }

    // Update presence based on action
    switch (action) {
      case 'open':
      case 'view':
        if (!presence.viewers.includes(userId)) {
          presence.viewers.push(userId);
        }
        presence.editors = presence.editors.filter((id) => id !== userId);
        break;

      case 'edit':
        if (!presence.editors.includes(userId)) {
          presence.editors.push(userId);
        }
        presence.viewers = presence.viewers.filter((id) => id !== userId);
        break;

      case 'close':
        presence.viewers = presence.viewers.filter((id) => id !== userId);
        presence.editors = presence.editors.filter((id) => id !== userId);
        break;
    }

    // Broadcast file presence update
    this.broadcastFilePresenceUpdate(sessionId, presence);
  }

  /**
   * Get all collaborators in a session
   */
  getCollaborators(sessionId: string): CollaboratorInfo[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    return Array.from(session.collaborators.values());
  }

  /**
   * Get cursor positions for a specific file
   */
  getCursorsForFile(sessionId: string, file: string): CursorPosition[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    return Array.from(session.cursors.values()).filter((cursor) => cursor.file === file);
  }

  /**
   * Get selections for a specific file
   */
  getSelectionsForFile(sessionId: string, file: string): Selection[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    return Array.from(session.selections.values()).filter((selection) => selection.file === file);
  }

  /**
   * Get file presence for all files
   */
  getFilePresence(sessionId: string): FilePresence[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];

    return Array.from(session.filePresence.values());
  }

  /**
   * Get complete session state (for initial sync)
   */
  getSessionState(sessionId: string): {
    collaborators: CollaboratorInfo[];
    cursors: CursorPosition[];
    selections: Selection[];
    filePresence: FilePresence[];
  } | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    return {
      collaborators: Array.from(session.collaborators.values()),
      cursors: Array.from(session.cursors.values()),
      selections: Array.from(session.selections.values()),
      filePresence: Array.from(session.filePresence.values()),
    };
  }

  /**
   * Broadcast presence update to all collaborators (Google Docs-style)
   */
  private broadcastPresenceUpdate(sessionId: string): void {
    const state = this.getSessionState(sessionId);
    if (!state) return;

    const message: PresenceBroadcast = {
      type: 'presence_update',
      ...state,
    };

    this.broadcastToSession(sessionId, message);
  }

  /**
   * Broadcast cursor update
   */
  private broadcastCursorUpdate(sessionId: string, cursor: CursorPosition): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const collaborator = session.collaborators.get(cursor.userId);
    if (!collaborator) return;

    this.broadcastToSession(sessionId, {
      type: 'cursor_update',
      cursor,
      collaborator: {
        id: collaborator.id,
        name: collaborator.name,
        color: collaborator.color,
      },
    });
  }

  /**
   * Broadcast selection update
   */
  private broadcastSelectionUpdate(sessionId: string, selection: Selection): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const collaborator = session.collaborators.get(selection.userId);
    if (!collaborator) return;

    this.broadcastToSession(sessionId, {
      type: 'selection_update',
      selection,
      collaborator: {
        id: collaborator.id,
        name: collaborator.name,
        color: collaborator.color,
      },
    });
  }

  /**
   * Broadcast file presence update
   */
  private broadcastFilePresenceUpdate(sessionId: string, presence: FilePresence): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Enrich with collaborator info
    const enrichedPresence = {
      file: presence.file,
      viewers: presence.viewers.map((userId) => {
        const collab = session.collaborators.get(userId);
        return collab ? { id: collab.id, name: collab.name, color: collab.color } : null;
      }).filter(Boolean),
      editors: presence.editors.map((userId) => {
        const collab = session.collaborators.get(userId);
        return collab ? { id: collab.id, name: collab.name, color: collab.color } : null;
      }).filter(Boolean),
    };

    this.broadcastToSession(sessionId, {
      type: 'file_presence_update',
      presence: enrichedPresence,
    });
  }

  /**
   * Broadcast message to all collaborators in a session
   */
  private broadcastToSession(sessionId: string, message: any): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.collaborators.forEach((collaborator) => {
      const ws = this.websockets.get(collaborator.id);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(message));
      }
    });
  }

  /**
   * Check for idle users and update their status
   */
  private checkIdleUsers(): void {
    const now = Date.now();

    this.sessions.forEach((session) => {
      session.collaborators.forEach((collaborator) => {
        const timeSinceActivity = now - collaborator.lastActivity.getTime();

        if (timeSinceActivity > this.idleThresholdMs * 5) {
          // 5 minutes = away
          collaborator.status = 'away';
        } else if (timeSinceActivity > this.idleThresholdMs) {
          // 1 minute = idle
          collaborator.status = 'idle';
        }
      });
    });
  }

  /**
   * Cleanup on shutdown
   */
  destroy(): void {
    clearInterval(this.idleCheckInterval);
    this.sessions.clear();
    this.userSessions.clear();
    this.websockets.clear();
    this.colorAssignments.clear();
  }

  /**
   * Get session statistics
   */
  getStats(): {
    totalSessions: number;
    totalCollaborators: number;
    activeSessions: number;
    idleSessions: number;
  } {
    const now = Date.now();
    let activeSessions = 0;
    let idleSessions = 0;
    let totalCollaborators = 0;

    this.sessions.forEach((session) => {
      totalCollaborators += session.collaborators.size;
      const timeSinceActivity = now - session.lastActivity.getTime();

      if (timeSinceActivity < this.idleThresholdMs) {
        activeSessions++;
      } else {
        idleSessions++;
      }
    });

    return {
      totalSessions: this.sessions.size,
      totalCollaborators,
      activeSessions,
      idleSessions,
    };
  }
}

export default GoogleDocsStyleCollaboration;

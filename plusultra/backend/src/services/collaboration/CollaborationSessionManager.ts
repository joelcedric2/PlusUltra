/**
 * Collaboration Session Manager
 *
 * Manages active collaboration sessions, tracks participants,
 * and integrates with TCI for real-time code analysis.
 */

import { prisma } from '../../lib/prisma';
import { crdtDocumentService } from './CRDTDocumentService';

export interface CollaborationSession {
  id: string;
  documentId: string;
  workspaceId: string;
  filePath: string;
  language: string;
  createdAt: Date;
  participants: SessionParticipant[];
  lastActivity: Date;
  tciEnabled: boolean;
}

export interface SessionParticipant {
  userId: string;
  userName: string;
  userColor: string;
  userTier: 'free' | 'starter' | 'pro' | 'enterprise';
  joinedAt: Date;
  lastSeen: Date;
  isActive: boolean;
  cursor?: {
    line: number;
    column: number;
  };
  selection?: {
    start: { line: number; column: number };
    end: { line: number; column: number };
  };
}

export interface SessionActivity {
  sessionId: string;
  userId: string;
  activityType: 'join' | 'leave' | 'edit' | 'cursor_move' | 'selection_change';
  timestamp: Date;
  metadata?: Record<string, any>;
}

export class CollaborationSessionManager {
  private sessions: Map<string, CollaborationSession> = new Map();
  private sessionByDocument: Map<string, string> = new Map(); // documentId -> sessionId

  constructor() {
    // Load active sessions from database on startup
    this.loadActiveSessions();
    console.log('[Session Manager] Initialized');
  }

  /**
   * Create or get collaboration session
   */
  async createSession(params: {
    documentId: string;
    workspaceId: string;
    filePath: string;
    language: string;
    userId: string;
    userName: string;
    userColor: string;
    userTier: 'free' | 'starter' | 'pro' | 'enterprise';
  }): Promise<CollaborationSession> {
    // Check if session already exists
    const existingSessionId = this.sessionByDocument.get(params.documentId);
    if (existingSessionId) {
      const session = this.sessions.get(existingSessionId);
      if (session) {
        // Add participant if not already in session
        this.addParticipant(existingSessionId, {
          userId: params.userId,
          userName: params.userName,
          userColor: params.userColor,
          userTier: params.userTier,
        });
        return session;
      }
    }

    // Create new session
    const sessionId = `session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;

    const session: CollaborationSession = {
      id: sessionId,
      documentId: params.documentId,
      workspaceId: params.workspaceId,
      filePath: params.filePath,
      language: params.language,
      createdAt: new Date(),
      participants: [
        {
          userId: params.userId,
          userName: params.userName,
          userColor: params.userColor,
          userTier: params.userTier,
          joinedAt: new Date(),
          lastSeen: new Date(),
          isActive: true,
        },
      ],
      lastActivity: new Date(),
      tciEnabled: this.shouldEnableTCI([params.userTier]),
    };

    // Store in memory
    this.sessions.set(sessionId, session);
    this.sessionByDocument.set(params.documentId, sessionId);

    // Persist to database
    await this.persistSession(session);

    // Log activity
    await this.logActivity({
      sessionId,
      userId: params.userId,
      activityType: 'join',
      timestamp: new Date(),
    });

    console.log(`[Session Manager] Created session ${sessionId} for ${params.filePath}`);
    return session;
  }

  /**
   * Add participant to session
   */
  async addParticipant(
    sessionId: string,
    participant: {
      userId: string;
      userName: string;
      userColor: string;
      userTier: 'free' | 'starter' | 'pro' | 'enterprise';
    }
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Check if participant already exists
    const existing = session.participants.find(p => p.userId === participant.userId);
    if (existing) {
      // Update existing participant
      existing.lastSeen = new Date();
      existing.isActive = true;
      return;
    }

    // Add new participant
    const newParticipant: SessionParticipant = {
      ...participant,
      joinedAt: new Date(),
      lastSeen: new Date(),
      isActive: true,
    };

    session.participants.push(newParticipant);
    session.lastActivity = new Date();

    // Update TCI enabled status
    const tiers = session.participants.map(p => p.userTier);
    session.tciEnabled = this.shouldEnableTCI(tiers);

    // Persist changes
    await this.persistSession(session);

    // Log activity
    await this.logActivity({
      sessionId,
      userId: participant.userId,
      activityType: 'join',
      timestamp: new Date(),
    });

    console.log(`[Session Manager] User ${participant.userName} joined session ${sessionId}`);
  }

  /**
   * Remove participant from session
   */
  async removeParticipant(sessionId: string, userId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const participant = session.participants.find(p => p.userId === userId);
    if (!participant) return;

    // Mark as inactive
    participant.isActive = false;
    participant.lastSeen = new Date();
    session.lastActivity = new Date();

    // Update TCI enabled status
    const activeTiers = session.participants
      .filter(p => p.isActive)
      .map(p => p.userTier);
    session.tciEnabled = this.shouldEnableTCI(activeTiers);

    // Log activity
    await this.logActivity({
      sessionId,
      userId,
      activityType: 'leave',
      timestamp: new Date(),
    });

    // If no active participants, close session after 5 minutes
    const activeParticipants = session.participants.filter(p => p.isActive);
    if (activeParticipants.length === 0) {
      setTimeout(() => {
        this.closeSession(sessionId);
      }, 5 * 60 * 1000); // 5 minutes
    }

    console.log(`[Session Manager] User ${participant.userName} left session ${sessionId}`);
  }

  /**
   * Update participant cursor/selection
   */
  async updateParticipantState(
    sessionId: string,
    userId: string,
    state: {
      cursor?: { line: number; column: number };
      selection?: {
        start: { line: number; column: number };
        end: { line: number; column: number };
      };
    }
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const participant = session.participants.find(p => p.userId === userId);
    if (!participant) return;

    if (state.cursor) {
      participant.cursor = state.cursor;
      await this.logActivity({
        sessionId,
        userId,
        activityType: 'cursor_move',
        timestamp: new Date(),
        metadata: state.cursor,
      });
    }

    if (state.selection) {
      participant.selection = state.selection;
      await this.logActivity({
        sessionId,
        userId,
        activityType: 'selection_change',
        timestamp: new Date(),
        metadata: state.selection,
      });
    }

    participant.lastSeen = new Date();
    session.lastActivity = new Date();
  }

  /**
   * Get session by ID
   */
  getSession(sessionId: string): CollaborationSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get session by document ID
   */
  getSessionByDocument(documentId: string): CollaborationSession | null {
    const sessionId = this.sessionByDocument.get(documentId);
    if (!sessionId) return null;
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get active participants for a session
   */
  getActiveParticipants(sessionId: string): SessionParticipant[] {
    const session = this.sessions.get(sessionId);
    if (!session) return [];
    return session.participants.filter(p => p.isActive);
  }

  /**
   * Check if TCI should be enabled for session
   */
  private shouldEnableTCI(tiers: Array<'free' | 'starter' | 'pro' | 'enterprise'>): boolean {
    // TCI is enabled if at least one participant is Pro or Enterprise
    return tiers.some(tier => tier === 'pro' || tier === 'enterprise');
  }

  /**
   * Close session
   */
  async closeSession(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    // Remove from memory
    this.sessions.delete(sessionId);
    this.sessionByDocument.delete(session.documentId);

    // Update database
    await prisma.collaborationSession.update({
      where: { id: sessionId },
      data: {
        endedAt: new Date(),
        isActive: false,
      },
    });

    console.log(`[Session Manager] Closed session ${sessionId}`);
  }

  /**
   * Get all active sessions
   */
  getAllActiveSessions(): CollaborationSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get sessions for workspace
   */
  getSessionsForWorkspace(workspaceId: string): CollaborationSession[] {
    return Array.from(this.sessions.values()).filter(
      s => s.workspaceId === workspaceId
    );
  }

  /**
   * Log activity
   */
  private async logActivity(activity: SessionActivity): Promise<void> {
    try {
      await prisma.collaborationActivity.create({
        data: {
          sessionId: activity.sessionId,
          userId: activity.userId,
          activityType: activity.activityType,
          timestamp: activity.timestamp,
          metadata: activity.metadata || {},
        },
      });
    } catch (error) {
      console.error('[Session Manager] Error logging activity:', error);
    }
  }

  /**
   * Persist session to database
   */
  private async persistSession(session: CollaborationSession): Promise<void> {
    try {
      await prisma.collaborationSession.upsert({
        where: { id: session.id },
        create: {
          id: session.id,
          documentId: session.documentId,
          workspaceId: session.workspaceId,
          filePath: session.filePath,
          language: session.language,
          startedAt: session.createdAt,
          lastActivity: session.lastActivity,
          isActive: true,
          participants: session.participants as any,
          tciEnabled: session.tciEnabled,
        },
        update: {
          lastActivity: session.lastActivity,
          participants: session.participants as any,
          tciEnabled: session.tciEnabled,
        },
      });
    } catch (error) {
      console.error('[Session Manager] Error persisting session:', error);
    }
  }

  /**
   * Load active sessions from database
   */
  private async loadActiveSessions(): Promise<void> {
    try {
      const activeSessions = await prisma.collaborationSession.findMany({
        where: { isActive: true },
      });

      for (const dbSession of activeSessions) {
        const session: CollaborationSession = {
          id: dbSession.id,
          documentId: dbSession.documentId,
          workspaceId: dbSession.workspaceId,
          filePath: dbSession.filePath,
          language: dbSession.language,
          createdAt: dbSession.startedAt,
          participants: (dbSession.participants as any) || [],
          lastActivity: dbSession.lastActivity,
          tciEnabled: dbSession.tciEnabled,
        };

        this.sessions.set(session.id, session);
        this.sessionByDocument.set(session.documentId, session.id);
      }

      console.log(`[Session Manager] Loaded ${activeSessions.length} active sessions`);
    } catch (error) {
      console.error('[Session Manager] Error loading active sessions:', error);
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalSessions: number;
    totalActiveParticipants: number;
    tciEnabledSessions: number;
    sessionsWithMultipleParticipants: number;
  } {
    const sessions = Array.from(this.sessions.values());

    return {
      totalSessions: sessions.length,
      totalActiveParticipants: sessions.reduce(
        (sum, s) => sum + s.participants.filter(p => p.isActive).length,
        0
      ),
      tciEnabledSessions: sessions.filter(s => s.tciEnabled).length,
      sessionsWithMultipleParticipants: sessions.filter(
        s => s.participants.filter(p => p.isActive).length > 1
      ).length,
    };
  }
}

export const collaborationSessionManager = new CollaborationSessionManager();

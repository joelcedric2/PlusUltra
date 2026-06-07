import * as fs from 'fs/promises';
import * as path from 'path';

export interface CollaborationSession {
  id: string;
  workspaceId: string;
  projectId: string;
  participants: CollaborationParticipant[];
  status: 'active' | 'paused' | 'ended';
  createdAt: Date;
  updatedAt: Date;
  settings: CollaborationSettings;
}

export interface CollaborationParticipant {
  userId: string;
  username: string;
  role: 'owner' | 'editor' | 'viewer';
  status: 'online' | 'away' | 'offline';
  cursor?: {
    x: number;
    y: number;
    file: string;
    line: number;
  };
  joinedAt: Date;
  lastSeenAt: Date;
}

export interface CollaborationSettings {
  allowVoiceChat: boolean;
  allowVideoChat: boolean;
  allowScreenShare: boolean;
  maxParticipants: number;
  requireApproval: boolean;
  autoSave: boolean;
  conflictResolution: 'manual' | 'auto' | 'last-wins';
}

export interface Comment {
  id: string;
  sessionId: string;
  userId: string;
  file: string;
  line?: number;
  column?: number;
  content: string;
  type: 'comment' | 'suggestion' | 'issue' | 'approval';
  status: 'open' | 'resolved' | 'dismissed';
  replies: Comment[];
  createdAt: Date;
  updatedAt: Date;
}

export interface Branch {
  id: string;
  name: string;
  sessionId: string;
  baseBranch?: string;
  createdBy: string;
  createdAt: Date;
  description?: string;
  status: 'active' | 'merged' | 'abandoned';
  changes: BranchChange[];
}

export interface BranchChange {
  file: string;
  type: 'add' | 'modify' | 'delete' | 'rename';
  content?: string;
  oldPath?: string;
  newPath?: string;
  timestamp: Date;
}

export interface VideoChatSession {
  id: string;
  sessionId: string;
  participants: string[];
  status: 'active' | 'ended';
  startedAt: Date;
  endedAt?: Date;
  recording?: {
    url: string;
    duration: number;
  };
}

export class AdvancedCollaborationService {
  private sessions: Map<string, CollaborationSession> = new Map();
  private comments: Map<string, Comment[]> = new Map();
  private branches: Map<string, Branch[]> = new Map();
  private videoSessions: Map<string, VideoChatSession> = new Map();

  /**
   * Create a new collaboration session
   */
  async createSession(
    workspaceId: string,
    projectId: string,
    creatorId: string,
    settings?: Partial<CollaborationSettings>
  ): Promise<CollaborationSession> {
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    const session: CollaborationSession = {
      id: sessionId,
      workspaceId,
      projectId,
      participants: [{
        userId: creatorId,
        username: 'Creator',
        role: 'owner',
        status: 'online',
        joinedAt: new Date(),
        lastSeenAt: new Date()
      }],
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
      settings: {
        allowVoiceChat: true,
        allowVideoChat: true,
        allowScreenShare: false,
        maxParticipants: 10,
        requireApproval: false,
        autoSave: true,
        conflictResolution: 'auto',
        ...settings
      }
    };

    this.sessions.set(sessionId, session);
    this.comments.set(sessionId, []);
    this.branches.set(sessionId, []);

    return session;
  }

  /**
   * Join a collaboration session
   */
  async joinSession(sessionId: string, userId: string, username: string, role: CollaborationParticipant['role'] = 'editor'): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session || session.status !== 'active') {
      return false;
    }

    // Check if user is already in session
    const existingParticipant = session.participants.find(p => p.userId === userId);
    if (existingParticipant) {
      existingParticipant.status = 'online';
      existingParticipant.lastSeenAt = new Date();
      return true;
    }

    // Check participant limit
    if (session.participants.length >= session.settings.maxParticipants) {
      return false;
    }

    // Add new participant
    session.participants.push({
      userId,
      username,
      role,
      status: 'online',
      joinedAt: new Date(),
      lastSeenAt: new Date()
    });

    session.updatedAt = new Date();

    return true;
  }

  /**
   * Leave a collaboration session
   */
  async leaveSession(sessionId: string, userId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    const participant = session.participants.find(p => p.userId === userId);
    if (participant) {
      participant.status = 'offline';
      participant.lastSeenAt = new Date();
    }

    // If owner leaves, transfer ownership or end session
    if (participant?.role === 'owner') {
      const remainingParticipants = session.participants.filter(p => p.status === 'online');
      if (remainingParticipants.length > 0) {
        remainingParticipants[0].role = 'owner';
      } else {
        session.status = 'ended';
      }
    }

    session.updatedAt = new Date();
    return true;
  }

  /**
   * Update participant cursor position
   */
  async updateCursor(sessionId: string, userId: string, cursor: { x: number; y: number; file: string; line: number }): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const participant = session.participants.find(p => p.userId === userId);
    if (participant) {
      participant.cursor = cursor;
      participant.lastSeenAt = new Date();
    }
  }

  /**
   * Add a comment to a file
   */
  async addComment(
    sessionId: string,
    userId: string,
    file: string,
    line: number,
    column: number,
    content: string,
    type: Comment['type'] = 'comment'
  ): Promise<Comment> {
    const sessionComments = this.comments.get(sessionId) || [];

    const comment: Comment = {
      id: `comment_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId,
      userId,
      file,
      line,
      column,
      content,
      type,
      status: 'open',
      replies: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    sessionComments.push(comment);
    this.comments.set(sessionId, sessionComments);

    return comment;
  }

  /**
   * Reply to a comment
   */
  async replyToComment(
    sessionId: string,
    commentId: string,
    userId: string,
    content: string
  ): Promise<Comment | null> {
    const sessionComments = this.comments.get(sessionId) || [];
    const parentComment = sessionComments.find(c => c.id === commentId);

    if (!parentComment) {
      return null;
    }

    const reply: Comment = {
      id: `reply_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId,
      userId,
      file: parentComment.file,
      line: parentComment.line,
      column: parentComment.column,
      content,
      type: 'comment',
      status: 'open',
      replies: [],
      createdAt: new Date(),
      updatedAt: new Date()
    };

    parentComment.replies.push(reply);
    parentComment.updatedAt = new Date();

    return reply;
  }

  /**
   * Resolve a comment
   */
  async resolveComment(sessionId: string, commentId: string, userId: string): Promise<boolean> {
    const sessionComments = this.comments.get(sessionId) || [];
    const comment = sessionComments.find(c => c.id === commentId);

    if (!comment) {
      return false;
    }

    comment.status = 'resolved';
    comment.updatedAt = new Date();

    return true;
  }

  /**
   * Create a new branch for collaborative editing
   */
  async createBranch(
    sessionId: string,
    userId: string,
    name: string,
    description?: string,
    baseBranch?: string
  ): Promise<Branch> {
    const branch: Branch = {
      id: `branch_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name,
      sessionId,
      baseBranch,
      createdBy: userId,
      createdAt: new Date(),
      description,
      status: 'active',
      changes: []
    };

    const sessionBranches = this.branches.get(sessionId) || [];
    sessionBranches.push(branch);
    this.branches.set(sessionId, sessionBranches);

    return branch;
  }

  /**
   * Record a change in a branch
   */
  async recordBranchChange(
    sessionId: string,
    branchId: string,
    userId: string,
    change: Omit<BranchChange, 'timestamp'>
  ): Promise<void> {
    const sessionBranches = this.branches.get(sessionId) || [];
    const branch = sessionBranches.find(b => b.id === branchId);

    if (branch && branch.status === 'active') {
      branch.changes.push({
        ...change,
        timestamp: new Date()
      });
    }
  }

  /**
   * Merge a branch back to main
   */
  async mergeBranch(sessionId: string, branchId: string, userId: string): Promise<boolean> {
    const sessionBranches = this.branches.get(sessionId) || [];
    const branch = sessionBranches.find(b => b.id === branchId);

    if (!branch || branch.status !== 'active') {
      return false;
    }

    branch.status = 'merged';

    // In a real implementation, this would apply the changes to the main branch
    console.log(`Merging branch ${branch.name} with ${branch.changes.length} changes`);

    return true;
  }

  /**
   * Start a video chat session
   */
  async startVideoChat(sessionId: string, initiatorId: string): Promise<VideoChatSession> {
    const videoSession: VideoChatSession = {
      id: `video_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      sessionId,
      participants: [initiatorId],
      status: 'active',
      startedAt: new Date()
    };

    this.videoSessions.set(videoSession.id, videoSession);

    // Update participant status
    const session = this.sessions.get(sessionId);
    if (session) {
      const participant = session.participants.find(p => p.userId === initiatorId);
      if (participant) {
        participant.status = 'online';
        participant.lastSeenAt = new Date();
      }
    }

    return videoSession;
  }

  /**
   * Join a video chat session
   */
  async joinVideoChat(videoSessionId: string, userId: string): Promise<boolean> {
    const videoSession = this.videoSessions.get(videoSessionId);
    if (!videoSession || videoSession.status !== 'active') {
      return false;
    }

    if (!videoSession.participants.includes(userId)) {
      videoSession.participants.push(userId);
    }

    return true;
  }

  /**
   * End a video chat session
   */
  async endVideoChat(videoSessionId: string, userId: string): Promise<boolean> {
    const videoSession = this.videoSessions.get(videoSessionId);
    if (!videoSession) {
      return false;
    }

    videoSession.status = 'ended';
    videoSession.endedAt = new Date();

    // Remove user from participants
    videoSession.participants = videoSession.participants.filter(id => id !== userId);

    return true;
  }

  /**
   * Get session information
   */
  async getSession(sessionId: string): Promise<CollaborationSession | null> {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get session comments
   */
  async getSessionComments(sessionId: string, file?: string): Promise<Comment[]> {
    const sessionComments = this.comments.get(sessionId) || [];

    if (file) {
      return sessionComments.filter(comment => comment.file === file);
    }

    return sessionComments;
  }

  /**
   * Get session branches
   */
  async getSessionBranches(sessionId: string): Promise<Branch[]> {
    return this.branches.get(sessionId) || [];
  }

  /**
   * Get active video chat sessions
   */
  async getActiveVideoSessions(sessionId: string): Promise<VideoChatSession[]> {
    return Array.from(this.videoSessions.values()).filter(
      session => session.sessionId === sessionId && session.status === 'active'
    );
  }

  /**
   * Update participant status
   */
  async updateParticipantStatus(sessionId: string, userId: string, status: CollaborationParticipant['status']): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      const participant = session.participants.find(p => p.userId === userId);
      if (participant) {
        participant.status = status;
        participant.lastSeenAt = new Date();
      }
    }
  }

  /**
   * Get real-time session state for WebSocket broadcasting
   */
  async getSessionState(sessionId: string): Promise<{
    session: CollaborationSession;
    comments: Comment[];
    branches: Branch[];
    videoSessions: VideoChatSession[];
  }> {
    return {
      session: this.sessions.get(sessionId)!,
      comments: this.comments.get(sessionId) || [],
      branches: this.branches.get(sessionId) || [],
      videoSessions: await this.getActiveVideoSessions(sessionId)
    };
  }

  /**
   * End a collaboration session
   */
  async endSession(sessionId: string, userId: string): Promise<boolean> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    // Check if user is owner
    const participant = session.participants.find(p => p.userId === userId);
    if (!participant || participant.role !== 'owner') {
      return false;
    }

    session.status = 'ended';
    session.updatedAt = new Date();

    // End all active video sessions
    const activeVideoSessions = await this.getActiveVideoSessions(sessionId);
    for (const videoSession of activeVideoSessions) {
      await this.endVideoChat(videoSession.id, userId);
    }

    return true;
  }

  /**
   * Export session data for archival
   */
  async exportSessionData(sessionId: string): Promise<string> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    const exportData = {
      session: {
        id: session.id,
        workspaceId: session.workspaceId,
        projectId: session.projectId,
        status: session.status,
        createdAt: session.createdAt,
        updatedAt: session.updatedAt,
        settings: session.settings
      },
      participants: session.participants,
      comments: this.comments.get(sessionId) || [],
      branches: this.branches.get(sessionId) || [],
      videoSessions: Array.from(this.videoSessions.values()).filter(v => v.sessionId === sessionId),
      exportedAt: new Date().toISOString()
    };

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Cleanup inactive sessions
   */
  async cleanupInactiveSessions(maxAge: number = 24 * 60 * 60 * 1000): Promise<void> {
    const cutoffTime = Date.now() - maxAge;

    // Convert Map entries to Array for iteration
    const sessionsArray = Array.from(this.sessions.entries());
    for (const [sessionId, session] of sessionsArray) {
      if (session.updatedAt.getTime() < cutoffTime && session.status === 'active') {
        // Check if any participants are still online
        const activeParticipants = session.participants.filter(p => p.status === 'online');
        if (activeParticipants.length === 0) {
          session.status = 'ended';
          console.log(`Auto-ended inactive session: ${sessionId}`);
        }
      }
    }
  }
}

export default AdvancedCollaborationService;

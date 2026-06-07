/**
 * useCollaboration Hook
 *
 * Main collaboration hook that combines Y.js document sync, awareness protocol,
 * and collaboration session management.
 */

import { useEffect, useState, useCallback } from 'react';
import { useYDoc } from './useYDoc';
import { useAwareness, type CursorPosition, type SelectionRange } from './useAwareness';
import axios from 'axios';

export interface UseCollaborationOptions {
  documentId: string;
  workspaceId: string;
  filePath: string;
  language: string;
  userId: string;
  userName: string;
  userColor?: string;
  userTier: 'free' | 'starter' | 'pro' | 'enterprise';
  enabled?: boolean;
  onCollaboratorJoined?: (collaborator: any) => void;
  onCollaboratorLeft?: (collaborator: any) => void;
  onSyncComplete?: () => void;
  onError?: (error: Error) => void;
}

export interface CollaborationSession {
  id: string;
  documentId: string;
  workspaceId: string;
  filePath: string;
  language: string;
  participants: any[];
  tciEnabled: boolean;
  lastActivity: Date;
}

export interface TCIAnalysisResult {
  analysisId: string;
  verdict: 'SHIP' | 'REFACTOR' | 'REJECT';
  confidence: number;
  summary: {
    visualIssues: number;
    causalRisks: number;
    historicalMatches: number;
    logicErrors: number;
  };
}

export function useCollaboration(options: UseCollaborationOptions) {
  const {
    documentId,
    workspaceId,
    filePath,
    language,
    userId,
    userName,
    userColor = '#4ECDC4',
    userTier,
    enabled = true,
    onCollaboratorJoined,
    onCollaboratorLeft,
    onSyncComplete,
    onError,
  } = options;

  const [session, setSession] = useState<CollaborationSession | null>(null);
  const [tciResults, setTciResults] = useState<TCIAnalysisResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  // Initialize Y.js document
  const ydoc = useYDoc({
    documentId,
    workspaceId,
    userId,
    userName,
    userColor,
    userTier,
    filePath,
    language,
    onSynced: () => {
      if (onSyncComplete) onSyncComplete();
    },
    onError: (err) => {
      setError(err);
      if (onError) onError(err);
    },
  });

  // Initialize awareness
  const awareness = useAwareness({
    provider: ydoc.provider,
    userId,
    userName,
    userColor,
  });

  // Track previous collaborators for join/leave events
  const [prevCollaborators, setPrevCollaborators] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!enabled) return;

    const currentCollaboratorIds = new Set(
      awareness.activeCollaborators.map(c => c.user.id)
    );

    // Detect new collaborators
    currentCollaboratorIds.forEach(id => {
      if (!prevCollaborators.has(id) && onCollaboratorJoined) {
        const collaborator = awareness.activeCollaborators.find(c => c.user.id === id);
        if (collaborator) {
          onCollaboratorJoined(collaborator);
        }
      }
    });

    // Detect left collaborators
    prevCollaborators.forEach(id => {
      if (!currentCollaboratorIds.has(id) && onCollaboratorLeft) {
        // We don't have the collaborator data anymore, just notify with ID
        onCollaboratorLeft({ user: { id } });
      }
    });

    setPrevCollaborators(currentCollaboratorIds);
  }, [awareness.activeCollaborators, prevCollaborators, onCollaboratorJoined, onCollaboratorLeft, enabled]);

  /**
   * Create or join collaboration session
   */
  const joinSession = useCallback(async () => {
    if (!enabled) return null;

    try {
      setIsLoading(true);
      const response = await axios.post('/api/collaboration/sessions', {
        documentId,
        workspaceId,
        filePath,
        language,
        userId,
        userName,
        userColor,
        userTier,
      });

      if (response.data.success) {
        setSession(response.data.session);
        return response.data.session;
      } else {
        throw new Error(response.data.error || 'Failed to join session');
      }
    } catch (err: any) {
      const error = err instanceof Error ? err : new Error('Failed to join session');
      setError(error);
      if (onError) onError(error);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [enabled, documentId, workspaceId, filePath, language, userId, userName, userColor, userTier, onError]);

  /**
   * Leave collaboration session
   */
  const leaveSession = useCallback(async () => {
    if (!session) return;

    try {
      await axios.post(`/api/collaboration/sessions/${session.id}/leave`, {
        userId,
      });
      setSession(null);
    } catch (err) {
      console.error('Error leaving session:', err);
    }
  }, [session, userId]);

  /**
   * Trigger TCI analysis
   */
  const triggerAnalysis = useCallback(async () => {
    if (!session) {
      throw new Error('No active session');
    }

    try {
      const response = await axios.post(
        `/api/collaboration/sessions/${session.id}/analyze`,
        { userId }
      );

      if (response.data.success) {
        // Refresh TCI results
        await fetchTCIResults();
        return response.data.result;
      } else {
        throw new Error(response.data.error || 'Analysis failed');
      }
    } catch (err: any) {
      const error = err instanceof Error ? err : new Error('Analysis failed');
      throw error;
    }
  }, [session, userId]);

  /**
   * Fetch TCI analysis results for session
   */
  const fetchTCIResults = useCallback(async () => {
    if (!session) return;

    try {
      const response = await axios.get(
        `/api/collaboration/sessions/${session.id}/analyses`,
        { params: { limit: 10 } }
      );

      if (response.data.success) {
        setTciResults(response.data.analyses);
      }
    } catch (err) {
      console.error('Error fetching TCI results:', err);
    }
  }, [session]);

  /**
   * Update cursor position
   */
  const updateCursor = useCallback((position: CursorPosition | null) => {
    awareness.updateCursor(position);

    // Also update on server for persistence
    if (session) {
      axios.post(`/api/collaboration/sessions/${session.id}/state`, {
        userId,
        cursor: position,
      }).catch(console.error);
    }
  }, [awareness, session, userId]);

  /**
   * Update selection
   */
  const updateSelection = useCallback((range: SelectionRange | null) => {
    awareness.updateSelection(range);

    // Also update on server for persistence
    if (session) {
      axios.post(`/api/collaboration/sessions/${session.id}/state`, {
        userId,
        selection: range,
      }).catch(console.error);
    }
  }, [awareness, session, userId]);

  // Auto-join session on mount
  useEffect(() => {
    if (enabled && ydoc.connected && !session) {
      joinSession();
    }
  }, [enabled, ydoc.connected, session, joinSession]);

  // Auto-leave session on unmount
  useEffect(() => {
    return () => {
      if (session) {
        leaveSession();
      }
    };
  }, []);

  // Fetch TCI results periodically
  useEffect(() => {
    if (!session || !session.tciEnabled) return;

    fetchTCIResults();

    const interval = setInterval(fetchTCIResults, 30000); // Refresh every 30s

    return () => clearInterval(interval);
  }, [session, fetchTCIResults]);

  return {
    // Y.js document
    ydoc: ydoc.ydoc,
    provider: ydoc.provider,
    synced: ydoc.synced,
    connected: ydoc.connected,
    getText: ydoc.getText,
    getTextString: ydoc.getTextString,
    setText: ydoc.setText,
    insertText: ydoc.insertText,
    deleteText: ydoc.deleteText,
    subscribeToText: ydoc.subscribeToText,

    // Awareness
    awareness: awareness.awareness,
    collaborators: awareness.collaborators,
    activeCollaborators: awareness.activeCollaborators,
    updateCursor,
    updateSelection,

    // Session management
    session,
    joinSession,
    leaveSession,
    isLoading,
    error,

    // TCI integration
    tciResults,
    tciEnabled: session?.tciEnabled || false,
    triggerAnalysis,
    refreshTCIResults: fetchTCIResults,
  };
}

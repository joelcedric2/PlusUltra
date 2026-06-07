/**
 * useAwareness Hook
 *
 * React hook for Awareness Protocol - tracks cursor positions and selections
 * of all collaborators in real-time.
 */

import { useEffect, useState, useCallback } from 'react';
import type { WebsocketProvider } from 'y-websocket';
import type { Awareness } from 'y-protocols/awareness';

export interface CursorPosition {
  line: number;
  column: number;
}

export interface SelectionRange {
  start: { line: number; column: number };
  end: { line: number; column: number };
}

export interface AwarenessState {
  user: {
    id: string;
    name: string;
    color: string;
  };
  cursor?: CursorPosition;
  selection?: SelectionRange;
  lastActivity: number;
}

export interface CollaboratorState extends AwarenessState {
  clientId: number;
  isActive: boolean;
}

export interface UseAwarenessOptions {
  provider: WebsocketProvider | null;
  userId: string;
  userName: string;
  userColor: string;
}

export function useAwareness(options: UseAwarenessOptions) {
  const { provider, userId, userName, userColor } = options;

  const [collaborators, setCollaborators] = useState<Map<number, CollaboratorState>>(new Map());
  const [awareness, setAwareness] = useState<Awareness | null>(null);

  useEffect(() => {
    if (!provider) return;

    const awarenessInstance = provider.awareness;
    setAwareness(awarenessInstance);

    // Set local awareness state
    awarenessInstance.setLocalState({
      user: {
        id: userId,
        name: userName,
        color: userColor,
      },
      lastActivity: Date.now(),
    });

    // Handle awareness changes
    const handleAwarenessChange = (changes: {
      added: number[];
      updated: number[];
      removed: number[];
    }) => {
      setCollaborators(prev => {
        const next = new Map(prev);

        // Remove collaborators
        changes.removed.forEach(clientId => {
          next.delete(clientId);
        });

        // Add/update collaborators
        [...changes.added, ...changes.updated].forEach(clientId => {
          const state = awarenessInstance.getStates().get(clientId);
          if (state && state.user && state.user.id !== userId) {
            next.set(clientId, {
              clientId,
              ...state,
              isActive: Date.now() - (state.lastActivity || 0) < 30000, // Active if seen in last 30s
            });
          }
        });

        return next;
      });
    };

    awarenessInstance.on('change', handleAwarenessChange);

    // Cleanup
    return () => {
      awarenessInstance.off('change', handleAwarenessChange);
    };
  }, [provider, userId, userName, userColor]);

  /**
   * Update local cursor position
   */
  const updateCursor = useCallback((cursor: CursorPosition | null) => {
    if (!awareness) return;

    const localState = awareness.getLocalState();
    awareness.setLocalState({
      ...localState,
      cursor: cursor || undefined,
      lastActivity: Date.now(),
    });
  }, [awareness]);

  /**
   * Update local selection
   */
  const updateSelection = useCallback((selection: SelectionRange | null) => {
    if (!awareness) return;

    const localState = awareness.getLocalState();
    awareness.setLocalState({
      ...localState,
      selection: selection || undefined,
      lastActivity: Date.now(),
    });
  }, [awareness]);

  /**
   * Update local state (cursor + selection)
   */
  const updateState = useCallback((state: {
    cursor?: CursorPosition | null;
    selection?: SelectionRange | null;
  }) => {
    if (!awareness) return;

    const localState = awareness.getLocalState();
    awareness.setLocalState({
      ...localState,
      cursor: state.cursor === null ? undefined : state.cursor,
      selection: state.selection === null ? undefined : state.selection,
      lastActivity: Date.now(),
    });
  }, [awareness]);

  /**
   * Get all collaborators as array
   */
  const getCollaborators = useCallback((): CollaboratorState[] => {
    return Array.from(collaborators.values());
  }, [collaborators]);

  /**
   * Get active collaborators only
   */
  const getActiveCollaborators = useCallback((): CollaboratorState[] => {
    return Array.from(collaborators.values()).filter(c => c.isActive);
  }, [collaborators]);

  /**
   * Get collaborator by user ID
   */
  const getCollaboratorByUserId = useCallback((targetUserId: string): CollaboratorState | null => {
    for (const collaborator of collaborators.values()) {
      if (collaborator.user.id === targetUserId) {
        return collaborator;
      }
    }
    return null;
  }, [collaborators]);

  return {
    awareness,
    collaborators: getCollaborators(),
    activeCollaborators: getActiveCollaborators(),
    updateCursor,
    updateSelection,
    updateState,
    getCollaboratorByUserId,
  };
}

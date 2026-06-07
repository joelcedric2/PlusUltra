/**
 * useYDoc Hook
 *
 * React hook for Y.js CRDT document synchronization.
 * Manages WebSocket connection, document sync, and provides reactive state.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';

export interface UseYDocOptions {
  documentId: string;
  workspaceId: string;
  userId: string;
  userName: string;
  userColor?: string;
  userTier: 'free' | 'starter' | 'pro' | 'enterprise';
  filePath?: string;
  language?: string;
  onConnected?: () => void;
  onDisconnected?: () => void;
  onSynced?: () => void;
  onError?: (error: Error) => void;
}

export interface YDocState {
  ydoc: Y.Doc | null;
  provider: WebsocketProvider | null;
  synced: boolean;
  connected: boolean;
  error: Error | null;
}

export function useYDoc(options: UseYDocOptions) {
  const {
    documentId,
    workspaceId,
    userId,
    userName,
    userColor = '#4ECDC4',
    userTier,
    filePath = 'unknown',
    language = 'typescript',
    onConnected,
    onDisconnected,
    onSynced,
    onError,
  } = options;

  const [state, setState] = useState<YDocState>({
    ydoc: null,
    provider: null,
    synced: false,
    connected: false,
    error: null,
  });

  const ydocRef = useRef<Y.Doc | null>(null);
  const providerRef = useRef<WebsocketProvider | null>(null);
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    // Create Y.Doc
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    // Determine WebSocket URL
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = process.env.REACT_APP_API_URL?.replace(/^https?:\/\//, '') || 'localhost:3001';
    const wsUrl = `${protocol}//${host}/collaboration/ws`;

    // Create WebSocket provider
    const provider = new WebsocketProvider(wsUrl, documentId, ydoc, {
      connect: true,
      params: {
        userId,
        userName,
        userColor,
        userTier,
        workspaceId,
        filePath,
        language,
      },
    });

    providerRef.current = provider;

    // Set up event listeners
    provider.on('status', (event: any) => {
      const connected = event.status === 'connected';
      setState(prev => ({ ...prev, connected }));

      if (connected && onConnected) {
        onConnected();
      } else if (!connected && onDisconnected) {
        onDisconnected();
      }
    });

    provider.on('sync', (synced: boolean) => {
      setState(prev => ({ ...prev, synced }));

      if (synced && onSynced) {
        onSynced();
      }
    });

    provider.on('error', (error: Error) => {
      console.error('[Y.js] Provider error:', error);
      setState(prev => ({ ...prev, error }));

      if (onError) {
        onError(error);
      }
    });

    // Update state with ydoc and provider
    setState(prev => ({
      ...prev,
      ydoc,
      provider,
    }));

    // Cleanup function
    cleanupRef.current = () => {
      provider.destroy();
      ydoc.destroy();
    };

    return () => {
      if (cleanupRef.current) {
        cleanupRef.current();
      }
    };
  }, [documentId, workspaceId, userId, userName, userColor, userTier, filePath, language]);

  /**
   * Get text content from Y.js document
   */
  const getText = useCallback((fieldName: string = 'content'): Y.Text | null => {
    if (!ydocRef.current) return null;
    return ydocRef.current.getText(fieldName);
  }, []);

  /**
   * Get current text as string
   */
  const getTextString = useCallback((fieldName: string = 'content'): string => {
    const ytext = getText(fieldName);
    return ytext ? ytext.toString() : '';
  }, [getText]);

  /**
   * Set text content
   */
  const setText = useCallback((content: string, fieldName: string = 'content'): void => {
    if (!ydocRef.current) return;

    ydocRef.current.transact(() => {
      const ytext = ydocRef.current!.getText(fieldName);
      ytext.delete(0, ytext.length);
      ytext.insert(0, content);
    });
  }, []);

  /**
   * Insert text at position
   */
  const insertText = useCallback((
    index: number,
    content: string,
    fieldName: string = 'content'
  ): void => {
    const ytext = getText(fieldName);
    if (!ytext) return;

    ytext.insert(index, content);
  }, [getText]);

  /**
   * Delete text range
   */
  const deleteText = useCallback((
    index: number,
    length: number,
    fieldName: string = 'content'
  ): void => {
    const ytext = getText(fieldName);
    if (!ytext) return;

    ytext.delete(index, length);
  }, [getText]);

  /**
   * Subscribe to text changes
   */
  const subscribeToText = useCallback((
    callback: (event: Y.YTextEvent) => void,
    fieldName: string = 'content'
  ): (() => void) => {
    const ytext = getText(fieldName);
    if (!ytext) return () => {};

    ytext.observe(callback);

    // Return unsubscribe function
    return () => {
      ytext.unobserve(callback);
    };
  }, [getText]);

  return {
    ...state,
    ydoc: ydocRef.current,
    provider: providerRef.current,
    getText,
    getTextString,
    setText,
    insertText,
    deleteText,
    subscribeToText,
  };
}

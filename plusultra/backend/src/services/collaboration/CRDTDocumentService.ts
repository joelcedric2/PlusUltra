/**
 * CRDT Document Service
 *
 * Manages Y.js CRDT documents for real-time collaboration.
 * Handles document persistence, updates, and synchronization.
 */

import * as Y from 'yjs';
import { prisma } from '../../lib/prisma';
import { encoding, decoding } from 'lib0';

export interface DocumentMetadata {
  documentId: string;
  workspaceId: string;
  filePath: string;
  language: string;
  lastModified: Date;
  collaboratorCount: number;
}

export interface DocumentUpdate {
  documentId: string;
  update: Uint8Array;
  userId: string;
  timestamp: Date;
}

export class CRDTDocumentService {
  private documents: Map<string, Y.Doc> = new Map();
  private documentMetadata: Map<string, DocumentMetadata> = new Map();
  private updateCallbacks: Map<string, Set<(update: Uint8Array) => void>> = new Map();

  // Garbage collection config
  private readonly INACTIVE_TIMEOUT = 30 * 60 * 1000; // 30 minutes
  private readonly GC_INTERVAL = 5 * 60 * 1000; // 5 minutes
  private lastActivity: Map<string, number> = new Map();

  constructor() {
    // Start garbage collection
    this.startGarbageCollection();
    console.log('[CRDT Service] Initialized');
  }

  /**
   * Get or create a Y.Doc for a document
   */
  async getDocument(documentId: string, workspaceId: string, filePath: string, language: string): Promise<Y.Doc> {
    // Check if document is already in memory
    if (this.documents.has(documentId)) {
      this.markActivity(documentId);
      return this.documents.get(documentId)!;
    }

    // Create new Y.Doc
    const ydoc = new Y.Doc();

    // Load persisted state from database if it exists
    const persisted = await this.loadPersistedState(documentId);
    if (persisted) {
      Y.applyUpdate(ydoc, persisted);
      console.log(`[CRDT Service] Loaded persisted state for ${documentId}`);
    }

    // Set up update handler for persistence
    ydoc.on('update', (update: Uint8Array, origin: any) => {
      this.handleUpdate(documentId, update, origin);
    });

    // Store document
    this.documents.set(documentId, ydoc);
    this.documentMetadata.set(documentId, {
      documentId,
      workspaceId,
      filePath,
      language,
      lastModified: new Date(),
      collaboratorCount: 0,
    });
    this.markActivity(documentId);

    console.log(`[CRDT Service] Created document ${documentId} for ${filePath}`);
    return ydoc;
  }

  /**
   * Apply an update to a document
   */
  async applyUpdate(documentId: string, update: Uint8Array, userId: string): Promise<void> {
    const ydoc = this.documents.get(documentId);
    if (!ydoc) {
      throw new Error(`Document ${documentId} not found`);
    }

    // Apply update
    Y.applyUpdate(ydoc, update, userId);
    this.markActivity(documentId);

    // Update metadata
    const metadata = this.documentMetadata.get(documentId);
    if (metadata) {
      metadata.lastModified = new Date();
      this.documentMetadata.set(documentId, metadata);
    }
  }

  /**
   * Get current document state
   */
  getDocumentState(documentId: string): Uint8Array | null {
    const ydoc = this.documents.get(documentId);
    if (!ydoc) return null;

    return Y.encodeStateAsUpdate(ydoc);
  }

  /**
   * Get document content as text
   */
  getDocumentText(documentId: string): string | null {
    const ydoc = this.documents.get(documentId);
    if (!ydoc) return null;

    const ytext = ydoc.getText('content');
    return ytext.toString();
  }

  /**
   * Subscribe to document updates
   */
  subscribeToUpdates(documentId: string, callback: (update: Uint8Array) => void): () => void {
    if (!this.updateCallbacks.has(documentId)) {
      this.updateCallbacks.set(documentId, new Set());
    }

    this.updateCallbacks.get(documentId)!.add(callback);

    // Return unsubscribe function
    return () => {
      const callbacks = this.updateCallbacks.get(documentId);
      if (callbacks) {
        callbacks.delete(callback);
      }
    };
  }

  /**
   * Update collaborator count
   */
  updateCollaboratorCount(documentId: string, count: number): void {
    const metadata = this.documentMetadata.get(documentId);
    if (metadata) {
      metadata.collaboratorCount = count;
      this.documentMetadata.set(documentId, metadata);
    }
  }

  /**
   * Get document metadata
   */
  getMetadata(documentId: string): DocumentMetadata | null {
    return this.documentMetadata.get(documentId) || null;
  }

  /**
   * Close a document and persist final state
   */
  async closeDocument(documentId: string): Promise<void> {
    const ydoc = this.documents.get(documentId);
    if (!ydoc) return;

    // Persist final state
    await this.persistDocument(documentId, ydoc);

    // Remove from memory
    ydoc.destroy();
    this.documents.delete(documentId);
    this.documentMetadata.delete(documentId);
    this.updateCallbacks.delete(documentId);
    this.lastActivity.delete(documentId);

    console.log(`[CRDT Service] Closed document ${documentId}`);
  }

  /**
   * Handle document updates
   */
  private handleUpdate(documentId: string, update: Uint8Array, origin: any): void {
    // Notify subscribers
    const callbacks = this.updateCallbacks.get(documentId);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(update);
        } catch (error) {
          console.error(`[CRDT Service] Error in update callback:`, error);
        }
      });
    }

    // Persist update to database (debounced)
    this.debouncePersist(documentId);
  }

  /**
   * Debounced persistence
   */
  private persistTimers: Map<string, NodeJS.Timeout> = new Map();
  private debouncePersist(documentId: string): void {
    // Clear existing timer
    const existingTimer = this.persistTimers.get(documentId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer (persist after 2 seconds of inactivity)
    const timer = setTimeout(() => {
      const ydoc = this.documents.get(documentId);
      if (ydoc) {
        this.persistDocument(documentId, ydoc);
      }
      this.persistTimers.delete(documentId);
    }, 2000);

    this.persistTimers.set(documentId, timer);
  }

  /**
   * Persist document to database
   */
  private async persistDocument(documentId: string, ydoc: Y.Doc): Promise<void> {
    try {
      const state = Y.encodeStateAsUpdate(ydoc);
      const metadata = this.documentMetadata.get(documentId);

      if (!metadata) {
        console.warn(`[CRDT Service] No metadata for ${documentId}, skipping persistence`);
        return;
      }

      // Upsert to database
      await prisma.collaborationDocument.upsert({
        where: { id: documentId },
        create: {
          id: documentId,
          workspaceId: metadata.workspaceId,
          filePath: metadata.filePath,
          language: metadata.language,
          state: Buffer.from(state),
          lastModified: metadata.lastModified,
        },
        update: {
          state: Buffer.from(state),
          lastModified: metadata.lastModified,
        },
      });

      console.log(`[CRDT Service] Persisted ${documentId}`);
    } catch (error) {
      console.error(`[CRDT Service] Error persisting ${documentId}:`, error);
    }
  }

  /**
   * Load persisted state from database
   */
  private async loadPersistedState(documentId: string): Promise<Uint8Array | null> {
    try {
      const doc = await prisma.collaborationDocument.findUnique({
        where: { id: documentId },
      });

      if (doc && doc.state) {
        return new Uint8Array(doc.state);
      }

      return null;
    } catch (error) {
      console.error(`[CRDT Service] Error loading ${documentId}:`, error);
      return null;
    }
  }

  /**
   * Mark document activity
   */
  private markActivity(documentId: string): void {
    this.lastActivity.set(documentId, Date.now());
  }

  /**
   * Start garbage collection for inactive documents
   */
  private startGarbageCollection(): void {
    setInterval(() => {
      this.collectGarbage();
    }, this.GC_INTERVAL);
  }

  /**
   * Collect garbage (close inactive documents)
   */
  private async collectGarbage(): Promise<void> {
    const now = Date.now();
    const toClose: string[] = [];

    for (const [documentId, lastActive] of this.lastActivity.entries()) {
      const metadata = this.documentMetadata.get(documentId);

      // Don't close if there are active collaborators
      if (metadata && metadata.collaboratorCount > 0) {
        continue;
      }

      // Close if inactive for too long
      if (now - lastActive > this.INACTIVE_TIMEOUT) {
        toClose.push(documentId);
      }
    }

    // Close inactive documents
    for (const documentId of toClose) {
      console.log(`[CRDT Service] Garbage collecting inactive document ${documentId}`);
      await this.closeDocument(documentId);
    }

    if (toClose.length > 0) {
      console.log(`[CRDT Service] Garbage collected ${toClose.length} inactive documents`);
    }
  }

  /**
   * Get statistics
   */
  getStats(): {
    activeDocuments: number;
    totalCollaborators: number;
    documents: Array<{ id: string; collaborators: number; lastModified: Date }>;
  } {
    const documents = Array.from(this.documentMetadata.values()).map(m => ({
      id: m.documentId,
      collaborators: m.collaboratorCount,
      lastModified: m.lastModified,
    }));

    const totalCollaborators = documents.reduce((sum, d) => sum + d.collaborators, 0);

    return {
      activeDocuments: this.documents.size,
      totalCollaborators,
      documents,
    };
  }
}

export const crdtDocumentService = new CRDTDocumentService();

import { createClient } from '@liveblocks/client';
import * as Y from 'yjs';
import { WebsocketProvider } from 'y-websocket';
import { IndexeddbPersistence } from 'y-indexeddb';

export interface CollaborationUser {
  id: string;
  name: string;
  avatar?: string;
  color: string;
  cursor?: { x: number; y: number };
}

export interface CollaborationRoom {
  id: string;
  name: string;
  users: CollaborationUser[];
  ydoc: Y.Doc;
  provider?: WebsocketProvider;
  persistence?: IndexeddbPersistence;
}

export class CollaborationService {
  private liveblocksClient: any; // Using any for now to avoid complex Liveblocks typing
  private rooms: Map<string, CollaborationRoom> = new Map();
  private user: CollaborationUser;

  constructor(user: CollaborationUser) {
    this.user = user;

    // Initialize Liveblocks client - requires LIVEBLOCKS_PUBLIC_KEY
    const liveblocksKey = process.env.LIVEBLOCKS_PUBLIC_KEY;
    if (!liveblocksKey) {
      throw new Error('LIVEBLOCKS_PUBLIC_KEY environment variable is required for collaboration features');
    }

    this.liveblocksClient = createClient({
      publicApiKey: liveblocksKey,
    });
  }

  async createRoom(projectId: string, projectName: string): Promise<CollaborationRoom> {
    const roomId = `project-${projectId}`;

    // Create Y.js document for the room
    const ydoc = new Y.Doc();

    // Set up WebSocket provider for real-time sync
    const provider = new WebsocketProvider(
      process.env.YJS_WEBSOCKET_URL || 'wss://demos.yjs.dev',
      roomId,
      ydoc
    );

    // Set up IndexedDB persistence for offline support
    const persistence = new IndexeddbPersistence(roomId, ydoc);

    const room: CollaborationRoom = {
      id: roomId,
      name: projectName,
      users: [this.user],
      ydoc,
      provider,
      persistence
    };

    this.rooms.set(roomId, room);

    // Set up awareness for user presence
    this.setupAwareness(room);

    return room;
  }

  async joinRoom(roomId: string): Promise<CollaborationRoom> {
    let room = this.rooms.get(roomId);

    if (!room) {
      try {
        // 1. Get room metadata from Liveblocks API
        const roomInfo = await this.liveblocksClient.getRoom(roomId);

        // 2. Set up proper Liveblocks room connection
        const liveblocksRoom = this.liveblocksClient.enterRoom(roomId, {
          initialPresence: {
            user: this.user,
            cursor: null,
            selection: null
          },
          initialStorage: {
            ydoc: null // Will be set up after Y.js initialization
          }
        });

        // 3. Create Y.js document and sync with Liveblocks
        const ydoc = new Y.Doc();

        // Set up WebSocket provider for Y.js real-time sync
        const provider = new WebsocketProvider(
          process.env.YJS_WEBSOCKET_URL || 'wss://demos.yjs.dev',
          roomId,
          ydoc
        );

        // Set up IndexedDB persistence for offline support
        const persistence = new IndexeddbPersistence(roomId, ydoc);

        room = {
          id: roomId,
          name: (roomInfo as any).metadata?.name || 'Unknown Project',
          users: [],
          ydoc,
          provider,
          persistence
        };

        this.rooms.set(roomId, room);

        // 4. Set up awareness and presence tracking
        this.setupAwareness(room);

        // Note: Y.js to Liveblocks sync would be implemented here for production

      } catch (error) {
        console.error('Failed to join Liveblocks room:', error);

        // Fallback to local-only room if Liveblocks fails
        room = {
          id: roomId,
          name: 'Local Project',
          users: [this.user],
          ydoc: new Y.Doc()
        };

        this.rooms.set(roomId, room);
      }
    }

    return room;
  }

  leaveRoom(roomId: string): void {
    const room = this.rooms.get(roomId);
    if (room) {
      // Clean up Y.js connections
      if (room.provider) {
        room.provider.disconnect();
      }

      if (room.persistence) {
        room.persistence.destroy();
      }

      this.rooms.delete(roomId);
    }
  }

  private setupAwareness(room: CollaborationRoom): void {
    if (!room.provider) return;

    // Set up user awareness for Y.js
    room.provider.awareness.setLocalStateField('user', {
      name: this.user.name,
      avatar: this.user.avatar,
      color: this.user.color
    });

    // Listen for user changes in Y.js awareness
    room.provider.awareness.on('change', (changes: any) => {
      const users: CollaborationUser[] = [];

      room.provider!.awareness.getStates().forEach((state: any, clientId: number) => {
        if (state.user) {
          users.push({
            id: clientId.toString(),
            name: state.user.name,
            avatar: state.user.avatar,
            color: state.user.color,
            cursor: state.user.cursor
          });
        }
      });

      room.users = users;
    });
  }

  // Code editing operations
  updateFileContent(roomId: string, filePath: string, content: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    // Get or create text for the file
    const ytext = room.ydoc.getText(`file:${filePath}`);

    // Update content
    ytext.delete(0, ytext.length);
    ytext.insert(0, content);
  }

  getFileContent(roomId: string, filePath: string): string {
    const room = this.rooms.get(roomId);
    if (!room) return '';

    const ytext = room.ydoc.getText(`file:${filePath}`);
    return ytext.toString();
  }

  // Listen for file changes
  onFileChange(roomId: string, filePath: string, callback: (content: string) => void): () => void {
    const room = this.rooms.get(roomId);
    if (!room) return () => {};

    const ytext = room.ydoc.getText(`file:${filePath}`);

    const observer = (event: any) => {
      callback(ytext.toString());
    };

    ytext.observe(observer);

    // Return cleanup function
    return () => {
      ytext.unobserve(observer);
    };
  }

  // Comment system
  addComment(roomId: string, filePath: string, lineNumber: number, comment: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const comments = room.ydoc.getMap(`comments:${filePath}`);
    const commentId = `comment-${Date.now()}`;

    comments.set(commentId, {
      id: commentId,
      author: this.user.name,
      authorId: this.user.id,
      lineNumber,
      content: comment,
      timestamp: new Date().toISOString()
    });
  }

  getComments(roomId: string, filePath: string): any[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];

    const comments = room.ydoc.getMap(`comments:${filePath}`);
    return Array.from(comments.values());
  }

  // User presence and cursor tracking
  updateCursor(roomId: string, filePath: string, line: number, column: number): void {
    const room = this.rooms.get(roomId);
    if (!room || !room.provider) return;

    room.provider.awareness.setLocalStateField('user', {
      ...room.provider.awareness.getLocalState()?.user,
      cursor: { filePath, line, column }
    });
  }

  getActiveUsers(roomId: string): CollaborationUser[] {
    const room = this.rooms.get(roomId);
    return room?.users || [];
  }

  // Real-time chat (if needed)
  sendMessage(roomId: string, message: string): void {
    const room = this.rooms.get(roomId);
    if (!room) return;

    const messages = room.ydoc.getArray('messages');
    messages.push([{
      id: `msg-${Date.now()}`,
      author: this.user.name,
      authorId: this.user.id,
      content: message,
      timestamp: new Date().toISOString()
    }]);
  }

  getMessages(roomId: string): any[] {
    const room = this.rooms.get(roomId);
    if (!room) return [];

    const messages = room.ydoc.getArray('messages');
    return messages.toArray();
  }

  // Collaborative selection (for pair programming)
  setSelection(roomId: string, filePath: string, startLine: number, startColumn: number, endLine: number, endColumn: number): void {
    const room = this.rooms.get(roomId);
    if (!room || !room.provider) return;

    room.provider.awareness.setLocalStateField('user', {
      ...room.provider.awareness.getLocalState()?.user,
      selection: { filePath, startLine, startColumn, endLine, endColumn }
    });
  }

  getUserSelections(roomId: string): Map<string, any> {
    const room = this.rooms.get(roomId);
    if (!room || !room.provider) return new Map();

    const selections = new Map();
    room.provider.awareness.getStates().forEach((state: any, clientId: number) => {
      if (state.user?.selection) {
        selections.set(clientId.toString(), state.user.selection);
      }
    });

    return selections;
  }
}

export default CollaborationService;

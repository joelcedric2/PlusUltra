import WebSocket from 'ws';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { createReactNativeGenerator } from '../codegen/ReactNativeGenerator';
import { vectorDb } from '../vector/VectorDatabase';

// WebSocket connection type for Fastify WebSocket
type FastifyWebSocket = {
  send: (data: string) => void;
  on: (event: string, handler: (...args: any[]) => void) => void;
  once?: (event: string, handler: (...args: any[]) => void) => void;
  off?: (event: string, handler: (...args: any[]) => void) => void;
  close?: () => void;
};

export interface RealtimeSession {
  sessionId: string;
  userId: string;
  projectName: string;
  description: string;
  currentPrompt: string;
  generatedFiles: Map<string, string>;
  isGenerating: boolean;
  progress: number;
  currentStep: string;
  errors: string[];
  warnings: string[];
  createdAt: Date;
  lastUpdated: Date;
}

export interface RealtimeUpdate {
  type: 'progress' | 'code' | 'error' | 'complete' | 'step';
  sessionId: string;
  data: any;
  timestamp: string;
}

export class RealtimeCodeGenerator {
  private sessions: Map<string, RealtimeSession> = new Map();
  private websockets: Map<string, FastifyWebSocket> = new Map();
  private model: BaseChatModel;

  constructor(model: BaseChatModel) {
    this.model = model;
  }

  /**
   * Create a new real-time generation session
   */
  async createSession(
    sessionId: string,
    userId: string,
    projectName: string,
    description: string
  ): Promise<RealtimeSession> {
    const session: RealtimeSession = {
      sessionId,
      userId,
      projectName,
      description,
      currentPrompt: description,
      generatedFiles: new Map(),
      isGenerating: false,
      progress: 0,
      currentStep: 'Initializing...',
      errors: [],
      warnings: [],
      createdAt: new Date(),
      lastUpdated: new Date()
    };

    this.sessions.set(sessionId, session);
    return session;
  }

  /**
   * Generate code incrementally with real-time updates
   */
  async generateCodeStream(
    sessionId: string,
    websocket: FastifyWebSocket,
    additionalPrompt?: string
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.sendUpdate(websocket, {
        type: 'error',
        sessionId,
        data: { message: 'Session not found' },
        timestamp: new Date().toISOString()
      });
      return;
    }

    this.websockets.set(sessionId, websocket);
    session.isGenerating = true;
    session.lastUpdated = new Date();

    try {
      // Update current prompt if additional prompt provided
      if (additionalPrompt) {
        session.currentPrompt = `${session.currentPrompt}\n\nAdditional requirements: ${additionalPrompt}`;
      }

      // Send initial progress update
      await this.sendProgressUpdate(sessionId, 10, 'Analyzing requirements...');

      // Retrieve context from vector database
      const similarPatterns = await vectorDb.findSimilarPatterns(session.currentPrompt, session.userId);
      const userPreferences = await vectorDb.getUserPreferences(session.userId);

      await this.sendProgressUpdate(sessionId, 20, 'Retrieving context and patterns...');

      // Create enhanced context
      const context = {
        userId: session.userId,
        projectId: sessionId,
        appIntent: session.currentPrompt,
        techStack: ['React Native', 'TypeScript', 'Expo', 'Redux Toolkit'],
        metadata: {
          projectName: session.projectName,
          similarPatterns: similarPatterns.map(p => p.content),
          userPreferences: userPreferences.map(p => p.metadata),
          generatedAt: new Date().toISOString()
        }
      };

      await this.sendProgressUpdate(sessionId, 30, 'Setting up project structure...');

      // Initialize code generator
      const generator = createReactNativeGenerator(this.model);

      // Generate project files with streaming updates
      const files = new Map<string, string>();

      // Use the public generateProject method instead of private methods
      await this.sendProgressUpdate(sessionId, 40, 'Generating project files...');
      const result = await generator.generateProject({
        projectName: session.projectName,
        description: session.currentPrompt,
        techStack: ['React Native', 'TypeScript', 'Expo'],
        features: [],
        template: 'base',
        userId: session.userId
      });

      if (result.success && result.project) {
        // Convert project files to Map format
        Object.entries(result.project.files).forEach(([fileName, content]) => {
          files.set(fileName, content);
        });
      } else {
        throw new Error(result.error || 'Failed to generate project');
      }

      session.generatedFiles = files;

      // Generate app.json
      await this.sendProgressUpdate(sessionId, 50, 'Generating app configuration...');
      const appJson = generator.generateAppJson({
        projectName: session.projectName,
        description: session.currentPrompt,
        techStack: ['React Native', 'TypeScript', 'Expo'],
        features: [],
        template: 'base',
        userId: session.userId
      });
      files.set('app.json', appJson);

      // Generate TypeScript config
      await this.sendProgressUpdate(sessionId, 60, 'Setting up TypeScript...');
      const tsConfig = generator.generateTsConfig();
      files.set('tsconfig.json', tsConfig);

      // Generate main app layout
      await this.sendProgressUpdate(sessionId, 70, 'Creating app structure...');
      const layout = generator.generateAppLayout({
        projectName: session.projectName,
        description: session.currentPrompt,
        techStack: ['React Native', 'TypeScript', 'Expo'],
        features: [],
        template: 'base',
        userId: session.userId
      });
      files.set('app/_layout.tsx', layout);

      // Generate main screen
      await this.sendProgressUpdate(sessionId, 80, 'Generating main screen...');
      const indexPage = generator.generateIndexPage({
        projectName: session.projectName,
        description: session.currentPrompt,
        techStack: ['React Native', 'TypeScript', 'Expo'],
        features: [],
        template: 'base',
        userId: session.userId
      });
      files.set('app/index.tsx', indexPage);

      // Generate UI components
      await this.sendProgressUpdate(sessionId, 85, 'Creating UI components...');
      const buttonComponent = generator.generateButtonComponent();
      files.set('components/ui/Button.tsx', buttonComponent);

      const textComponent = generator.generateTextComponent();
      files.set('components/ui/Text.tsx', textComponent);

      // Generate Redux store and slices
      await this.sendProgressUpdate(sessionId, 90, 'Setting up state management...');
      const store = generator.generateStoreTemplate();
      files.set('src/store/index.ts', store);

      const authSlice = generator.generateAuthSliceTemplate();
      files.set('src/store/slices/authSlice.ts', authSlice);

      // Generate error boundary
      await this.sendProgressUpdate(sessionId, 95, 'Adding error handling...');
      const errorBoundary = generator.generateErrorBoundaryTemplate();
      files.set('src/components/common/ErrorBoundary.tsx', errorBoundary);

      // Finalize
      session.generatedFiles = files;
      session.isGenerating = false;
      session.progress = 100;
      session.lastUpdated = new Date();

      await this.sendProgressUpdate(sessionId, 100, 'Generation complete!');
      await this.sendCodeUpdate(sessionId, files);

      // Send completion update
      this.sendUpdate(websocket, {
        type: 'complete',
        sessionId,
        data: {
          files: Array.from(files.entries()),
          metadata: {
            filesGenerated: files.size,
            generatedAt: new Date().toISOString()
          }
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      session.isGenerating = false;
      session.errors.push(error instanceof Error ? error.message : 'Unknown error');

      this.sendUpdate(websocket, {
        type: 'error',
        sessionId,
        data: { message: error instanceof Error ? error.message : 'Generation failed' },
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Update existing code based on user feedback
   */
  async updateCode(
    sessionId: string,
    websocket: FastifyWebSocket,
    feedback: string,
    targetFile?: string
  ): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) {
      this.sendUpdate(websocket, {
        type: 'error',
        sessionId,
        data: { message: 'Session not found' },
        timestamp: new Date().toISOString()
      });
      return;
    }

    session.isGenerating = true;
    session.lastUpdated = new Date();

    try {
      await this.sendProgressUpdate(sessionId, 10, 'Analyzing feedback...');

      // Create a targeted prompt for the specific file or general improvement
      const updatePrompt = targetFile
        ? `Update the ${targetFile} file based on this feedback: ${feedback}`
        : `Improve the entire project based on this feedback: ${feedback}`;

      await this.sendProgressUpdate(sessionId, 30, 'Generating updates...');

      // For now, regenerate the entire project with the feedback incorporated
      // In the future, this could be more sophisticated with targeted updates
      session.currentPrompt = `${session.currentPrompt}\n\nUser feedback: ${feedback}`;

      // Regenerate with updated prompt
      await this.generateCodeStream(sessionId, websocket);

    } catch (error) {
      session.isGenerating = false;
      session.errors.push(error instanceof Error ? error.message : 'Update failed');

      this.sendUpdate(websocket, {
        type: 'error',
        sessionId,
        data: { message: error instanceof Error ? error.message : 'Update failed' },
        timestamp: new Date().toISOString()
      });
    }
  }

  /**
   * Get session information
   */
  getSession(sessionId: string): RealtimeSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Delete a session
   */
  deleteSession(sessionId: string): boolean {
    const deleted = this.sessions.delete(sessionId);
    this.websockets.delete(sessionId);
    return deleted;
  }

  private async sendProgressUpdate(sessionId: string, progress: number, step: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.progress = progress;
      session.currentStep = step;
      session.lastUpdated = new Date();
    }

    const fastifyWebsocket = this.websockets.get(sessionId);
    if (fastifyWebsocket) {
      this.sendUpdate(fastifyWebsocket, {
        type: 'progress',
        sessionId,
        data: { progress, step },
        timestamp: new Date().toISOString()
      });
    }
  }

  private async sendCodeUpdate(sessionId: string, files: Map<string, string>): Promise<void> {
    const fastifyWebsocket = this.websockets.get(sessionId);
    if (fastifyWebsocket) {
      this.sendUpdate(fastifyWebsocket, {
        type: 'code',
        sessionId,
        data: { files: Array.from(files.entries()) },
        timestamp: new Date().toISOString()
      });
    }
  }

  private sendUpdate(fastifyWebsocket: FastifyWebSocket, update: RealtimeUpdate): void {
    try {
      fastifyWebsocket.send(JSON.stringify(update));
    } catch (error) {
      console.error('Failed to send WebSocket update:', error);
    }
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): RealtimeSession[] {
    return Array.from(this.sessions.values()).filter(session => session.isGenerating);
  }

  /**
   * Clean up old sessions (older than 1 hour)
   */
  cleanupOldSessions(): number {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    let cleanedCount = 0;

    for (const [sessionId, session] of this.sessions.entries()) {
      if (session.lastUpdated < oneHourAgo) {
        this.sessions.delete(sessionId);
        this.websockets.delete(sessionId);
        cleanedCount++;
      }
    }

    return cleanedCount;
  }
}

// Export singleton instance factory - creates generator without requiring a model instance
export const realtimeGenerator = {
  createGenerator: (model: BaseChatModel) => new RealtimeCodeGenerator(model)
};

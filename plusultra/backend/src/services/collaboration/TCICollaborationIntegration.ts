/**
 * TCI Collaboration Integration
 *
 * Integrates TCI 6-Layer analysis with real-time collaboration.
 * Automatically analyzes code during collaborative sessions and shares
 * insights with all participants in real-time.
 */

import { crdtDocumentService } from './CRDTDocumentService';
import { collaborationSessionManager, CollaborationSession } from './CollaborationSessionManager';
import { TCI6LayerOrchestrator } from '../tci/TCI6LayerOrchestrator';
import { prisma } from '../../lib/prisma';

export interface CollaborativeTCIResult {
  analysisId: string;
  sessionId: string;
  documentId: string;
  verdict: 'SHIP' | 'REFACTOR' | 'REJECT';
  confidence: number;
  timestamp: Date;
  triggeredBy: string;
  sharedWith: string[]; // List of user IDs who received the results
  summary: {
    visualIssues: number;
    causalRisks: number;
    historicalMatches: number;
    logicErrors: number;
  };
}

export class TCICollaborationIntegration {
  private orchestrator: TCI6LayerOrchestrator;
  private analysisTimers: Map<string, NodeJS.Timeout> = new Map();
  private lastAnalysis: Map<string, Date> = new Map();

  // Config
  private readonly ANALYSIS_DEBOUNCE = 3000; // 3 seconds after last edit
  private readonly MIN_ANALYSIS_INTERVAL = 30000; // 30 seconds between analyses

  constructor() {
    this.orchestrator = new TCI6LayerOrchestrator();
    this.setupDocumentWatchers();
    console.log('[TCI Collaboration] Integration initialized');
  }

  /**
   * Setup document watchers for all active sessions
   */
  private setupDocumentWatchers(): void {
    // Watch for document updates
    setInterval(() => {
      this.checkActiveSessions();
    }, 10000); // Check every 10 seconds
  }

  /**
   * Check active sessions and trigger analysis if needed
   */
  private async checkActiveSessions(): Promise<void> {
    const sessions = collaborationSessionManager.getAllActiveSessions();

    for (const session of sessions) {
      // Only analyze if TCI is enabled for this session
      if (!session.tciEnabled) continue;

      // Only analyze if there are active participants
      const activeParticipants = session.participants.filter(p => p.isActive);
      if (activeParticipants.length === 0) continue;

      // Check if document has been modified
      const metadata = crdtDocumentService.getMetadata(session.documentId);
      if (!metadata) continue;

      // Check if we should trigger analysis
      const lastAnalysisTime = this.lastAnalysis.get(session.documentId);
      if (lastAnalysisTime) {
        const timeSinceLastAnalysis = Date.now() - lastAnalysisTime.getTime();
        if (timeSinceLastAnalysis < this.MIN_ANALYSIS_INTERVAL) {
          continue; // Too soon since last analysis
        }
      }

      // Trigger debounced analysis
      this.triggerDebouncedAnalysis(session);
    }
  }

  /**
   * Trigger debounced TCI analysis
   */
  private triggerDebouncedAnalysis(session: CollaborationSession): void {
    const documentId = session.documentId;

    // Clear existing timer
    const existingTimer = this.analysisTimers.get(documentId);
    if (existingTimer) {
      clearTimeout(existingTimer);
    }

    // Set new timer
    const timer = setTimeout(async () => {
      await this.performCollaborativeAnalysis(session);
      this.analysisTimers.delete(documentId);
    }, this.ANALYSIS_DEBOUNCE);

    this.analysisTimers.set(documentId, timer);
  }

  /**
   * Perform collaborative TCI analysis
   */
  async performCollaborativeAnalysis(session: CollaborationSession): Promise<CollaborativeTCIResult | null> {
    try {
      // Get current document content
      const code = crdtDocumentService.getDocumentText(session.documentId);
      if (!code) {
        console.warn(`[TCI Collaboration] No content for document ${session.documentId}`);
        return null;
      }

      // Determine highest tier among active participants
      const activeParticipants = session.participants.filter(p => p.isActive);
      const highestTier = this.getHighestTier(activeParticipants.map(p => p.userTier));

      console.log(`[TCI Collaboration] Starting analysis for ${session.filePath} (${activeParticipants.length} collaborators)`);

      // Run TCI analysis
      const result = await this.orchestrator.analyze(code, {
        mode: highestTier === 'enterprise' ? 'full' : 'quick',
        language: session.language,
        implementFixes: false, // Don't auto-fix during collaboration
      });

      // Update last analysis time
      this.lastAnalysis.set(session.documentId, new Date());

      // Prepare collaborative result
      const collaborativeResult: CollaborativeTCIResult = {
        analysisId: (result as any).id || 'collaborative-analysis',
        sessionId: session.id,
        documentId: session.documentId,
        verdict: (result as any).verdict?.verdict || 'PASS',
        confidence: (result as any).verdict?.confidence || 0.8,
        timestamp: new Date(),
        triggeredBy: 'collaborative-session',
        sharedWith: activeParticipants.map(p => p.userId),
        summary: {
          visualIssues: (result as any).visual?.visualPatterns?.length || 0,
          causalRisks: (result as any).causal?.chain?.length || 0,
          historicalMatches: (result as any).historical?.thisCodeMatchesPattern ? 1 : 0,
          logicErrors: (result as any).logic?.invariants?.filter((i: any) => !i.holds)?.length || 0,
        },
      };

      // Save collaborative analysis result
      await this.saveCollaborativeResult(collaborativeResult, result);

      console.log(`[TCI Collaboration] Analysis complete: ${collaborativeResult.verdict} (${(collaborativeResult.confidence * 100).toFixed(0)}% confidence)`);

      // Notify participants (will be handled by WebSocket broadcast)
      await this.notifyParticipants(session, collaborativeResult);

      return collaborativeResult;
    } catch (error) {
      console.error('[TCI Collaboration] Analysis error:', error);
      return null;
    }
  }

  /**
   * Manually trigger analysis for a session
   */
  async triggerAnalysis(sessionId: string, triggeredByUserId: string): Promise<CollaborativeTCIResult | null> {
    const session = collaborationSessionManager.getSession(sessionId);
    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (!session.tciEnabled) {
      throw new Error('TCI is not enabled for this session');
    }

    // Clear debounce timer and analyze immediately
    const timer = this.analysisTimers.get(session.documentId);
    if (timer) {
      clearTimeout(timer);
      this.analysisTimers.delete(session.documentId);
    }

    const result = await this.performCollaborativeAnalysis(session);

    if (result) {
      result.triggeredBy = triggeredByUserId;
    }

    return result;
  }

  /**
   * Get highest tier among participants
   */
  private getHighestTier(tiers: Array<'free' | 'starter' | 'pro' | 'enterprise'>): 'free' | 'starter' | 'pro' | 'enterprise' {
    if (tiers.includes('enterprise')) return 'enterprise';
    if (tiers.includes('pro')) return 'pro';
    if (tiers.includes('starter')) return 'starter';
    return 'free';
  }

  /**
   * Save collaborative analysis result
   */
  private async saveCollaborativeResult(
    collaborativeResult: CollaborativeTCIResult,
    fullResult: any
  ): Promise<void> {
    try {
      await prisma.collaborativeTCIResult.create({
        data: {
          id: collaborativeResult.analysisId,
          sessionId: collaborativeResult.sessionId,
          documentId: collaborativeResult.documentId,
          verdict: collaborativeResult.verdict,
          confidence: collaborativeResult.confidence,
          triggeredBy: collaborativeResult.triggeredBy,
          sharedWith: collaborativeResult.sharedWith,
          summary: collaborativeResult.summary as any,
          fullReport: fullResult.report as any,
          createdAt: collaborativeResult.timestamp,
        },
      });
    } catch (error) {
      console.error('[TCI Collaboration] Error saving result:', error);
    }
  }

  /**
   * Notify participants of analysis results
   */
  private async notifyParticipants(
    session: CollaborationSession,
    result: CollaborativeTCIResult
  ): Promise<void> {
    // This would integrate with WebSocket server to broadcast results
    // For now, we just log
    console.log(`[TCI Collaboration] Would notify ${result.sharedWith.length} participants of analysis results`);

    // Create notification records
    for (const userId of result.sharedWith) {
      try {
        await prisma.collaborationNotification.create({
          data: {
            userId,
            sessionId: session.id,
            type: 'tci_analysis_complete',
            title: `TCI Analysis: ${result.verdict}`,
            message: `Code analysis complete with ${(result.confidence * 100).toFixed(0)}% confidence`,
            data: {
              analysisId: result.analysisId,
              verdict: result.verdict,
              confidence: result.confidence,
              summary: result.summary,
            } as any,
            read: false,
            createdAt: new Date(),
          },
        });
      } catch (error) {
        console.error(`[TCI Collaboration] Error creating notification for ${userId}:`, error);
      }
    }
  }

  /**
   * Get recent collaborative analyses for session
   */
  async getSessionAnalyses(sessionId: string, limit: number = 10): Promise<CollaborativeTCIResult[]> {
    const results = await prisma.collaborativeTCIResult.findMany({
      where: { sessionId },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return results.map(r => ({
      analysisId: r.id,
      sessionId: r.sessionId,
      documentId: r.documentId,
      verdict: r.verdict as any,
      confidence: r.confidence,
      timestamp: r.createdAt,
      triggeredBy: r.triggeredBy,
      sharedWith: r.sharedWith as string[],
      summary: r.summary as any,
    }));
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<{
    totalCollaborativeAnalyses: number;
    averageConfidence: number;
    verdictDistribution: { ship: number; refactor: number; reject: number };
    tciEnabledSessions: number;
  }> {
    const stats = await prisma.collaborativeTCIResult.aggregate({
      _count: { id: true },
      _avg: { confidence: true },
    });

    const verdicts = await prisma.collaborativeTCIResult.groupBy({
      by: ['verdict'],
      _count: { id: true },
    });

    const verdictDist = {
      ship: 0,
      refactor: 0,
      reject: 0,
    };

    verdicts.forEach(v => {
      const count = v._count.id;
      if (v.verdict === 'SHIP') verdictDist.ship = count;
      if (v.verdict === 'REFACTOR') verdictDist.refactor = count;
      if (v.verdict === 'REJECT') verdictDist.reject = count;
    });

    const sessionStats = collaborationSessionManager.getStats();

    return {
      totalCollaborativeAnalyses: stats._count.id,
      averageConfidence: stats._avg.confidence || 0,
      verdictDistribution: verdictDist,
      tciEnabledSessions: sessionStats.tciEnabledSessions,
    };
  }
}

export const tciCollaborationIntegration = new TCICollaborationIntegration();

/**
 * Intent Prediction Service - The Brain of TCI
 *
 * Predicts what the developer is trying to build BEFORE they code.
 * This is the core intelligence layer that makes TCI a self-healing learning engine.
 *
 * How it works:
 * 1. Collects signals from user actions (file changes, commits, searches, errors)
 * 2. Uses Claude to analyze patterns and infer intent
 * 3. Searches knowledge base for similar past intents via Pinecone/Neo4j
 * 4. Provides proactive recommendations before code is written
 * 5. Learns from outcomes to improve future predictions
 *
 * Integration Points:
 * - Anthropic Claude: Intent analysis and reasoning
 * - Pinecone: Semantic similarity search for historical intents
 * - Neo4j: Graph-based intent relationship queries
 */

import Anthropic from '@anthropic-ai/sdk';
import { v4 as uuidv4 } from 'uuid';
import { PineconeService, pineconeService } from '../vector/PineconeService';
import Neo4jGraphService from '../temporal/Neo4jGraphService';
import type { ProjectContext } from '../../types/tci';

// ============================================================
// Intent Prediction Types
// ============================================================

export interface PredictedIntent {
  id: string;
  timestamp: Date;
  userId: string;
  projectId: string;

  /** What we predict they're building */
  predictedGoal: string;
  /** Confidence score 0-1 */
  confidence: number;

  /** Evidence that led to this prediction */
  signals: IntentSignal[];

  /** Similar past intents from knowledge base */
  similarIntents: HistoricalIntent[];

  /** Recommended approach based on past successes */
  recommendedApproach: string;

  /** Potential pitfalls from past failures */
  warnings: string[];
}

export interface IntentSignal {
  type: 'file_change' | 'commit_message' | 'search_query' | 'error_pattern' | 'api_call' | 'navigation';
  content: string;
  /** How strongly this signals intent (0-1) */
  weight: number;
  timestamp: Date;
}

export interface HistoricalIntent {
  id: string;
  goal: string;
  outcome: 'success' | 'partial' | 'failed';
  patternsUsed: string[];
  lessonsLearned: string[];
  /** Similarity to current intent (0-1) */
  similarity: number;
}

export interface IntentOutcome {
  intentId: string;
  outcome: 'success' | 'partial' | 'failed';
  lessonsLearned: string[];
  actualGoal?: string;
  completionTime?: number;
  metadata?: Record<string, any>;
}

// ============================================================
// Internal Types
// ============================================================

interface ClaudeIntentAnalysis {
  predictedGoal: string;
  confidence: number;
  reasoning: string;
  recommendedApproach: string;
  warnings: string[];
  relatedConcepts: string[];
}

interface SignalAnalysisContext {
  signals: IntentSignal[];
  projectContext?: ProjectContext;
  recentHistory?: string[];
}

// ============================================================
// Intent Prediction Service
// ============================================================

export class IntentPredictionService {
  private anthropic: Anthropic;
  private pinecone: PineconeService;
  private neo4jService: Neo4jGraphService | null = null;
  private isInitialized: boolean = false;

  /** In-memory cache of recent intents for quick lookup */
  private intentCache: Map<string, PredictedIntent> = new Map();

  /** Signal buffer for collecting user activity */
  private signalBuffer: Map<string, IntentSignal[]> = new Map();

  /** Historical outcomes for learning */
  private outcomeHistory: Map<string, IntentOutcome> = new Map();

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
    this.pinecone = pineconeService;
  }

  /**
   * Initialize the service with optional Neo4j connection
   */
  async initialize(neo4jConfig?: {
    uri: string;
    username: string;
    password: string;
    database?: string;
  }): Promise<void> {
    if (this.isInitialized) return;

    try {
      // Initialize Pinecone
      await this.pinecone.initialize();

      // Initialize Neo4j if config provided
      if (neo4jConfig) {
        this.neo4jService = new Neo4jGraphService(neo4jConfig);
        await this.neo4jService.initialize();
        console.log('[IntentPrediction] Neo4j connected');
      }

      this.isInitialized = true;
      console.log('[IntentPrediction] Service initialized');
    } catch (error: any) {
      console.error('[IntentPrediction] Initialization error:', error.message);
      // Continue without full initialization - service can still function
      this.isInitialized = true;
    }
  }

  // ============================================================
  // Core Method: Predict Intent
  // ============================================================

  /**
   * Main method that predicts what user wants to build.
   * Uses Claude to analyze signals and infer intent, then searches
   * Neo4j/Pinecone for similar past intents.
   *
   * @param signals - Recent user activity signals
   * @param projectContext - Current project context
   * @returns Predicted intent with recommendations
   */
  async predictIntent(
    signals: IntentSignal[],
    projectContext?: ProjectContext
  ): Promise<PredictedIntent> {
    const startTime = Date.now();
    console.log(`[IntentPrediction] Analyzing ${signals.length} signals...`);

    // Extract user/project info from signals or context
    const userId = this.extractUserId(signals) || 'unknown';
    const projectId = this.extractProjectId(signals, projectContext) || 'unknown';

    try {
      // Step 1: Use Claude to analyze signals and infer intent
      const claudeAnalysis = await this.analyzeIntentWithClaude({
        signals,
        projectContext,
      });

      // Step 2: Search for similar historical intents
      const similarIntents = await this.findSimilarIntents(
        claudeAnalysis.predictedGoal,
        5
      );

      // Step 3: Enrich recommendations based on historical data
      const enrichedRecommendations = this.enrichRecommendations(
        claudeAnalysis,
        similarIntents
      );

      // Step 4: Build the predicted intent
      const predictedIntent: PredictedIntent = {
        id: uuidv4(),
        timestamp: new Date(),
        userId,
        projectId,
        predictedGoal: claudeAnalysis.predictedGoal,
        confidence: claudeAnalysis.confidence,
        signals,
        similarIntents,
        recommendedApproach: enrichedRecommendations.approach,
        warnings: enrichedRecommendations.warnings,
      };

      // Step 5: Cache for later reference
      this.intentCache.set(predictedIntent.id, predictedIntent);

      // Step 6: Store in Neo4j for future similarity searches
      await this.storeIntentInGraph(predictedIntent);

      const elapsed = Date.now() - startTime;
      console.log(`[IntentPrediction] Predicted: "${claudeAnalysis.predictedGoal}" (confidence: ${(claudeAnalysis.confidence * 100).toFixed(1)}%) in ${elapsed}ms`);

      return predictedIntent;
    } catch (error: any) {
      console.error('[IntentPrediction] Prediction failed:', error.message);

      // Return a low-confidence fallback prediction
      return {
        id: uuidv4(),
        timestamp: new Date(),
        userId,
        projectId,
        predictedGoal: 'Unable to determine intent',
        confidence: 0,
        signals,
        similarIntents: [],
        recommendedApproach: 'Continue with caution - intent analysis failed',
        warnings: [`Prediction error: ${error.message}`],
      };
    }
  }

  // ============================================================
  // Signal Collection
  // ============================================================

  /**
   * Gathers recent user activity signals within a time window.
   * Collects file edits, navigation, errors encountered, etc.
   *
   * @param userId - User to collect signals for
   * @param projectId - Project context
   * @param timeWindowMs - Time window in milliseconds (default: 30 minutes)
   * @returns Array of intent signals
   */
  async collectSignals(
    userId: string,
    projectId: string,
    timeWindowMs: number = 30 * 60 * 1000
  ): Promise<IntentSignal[]> {
    const key = `${userId}:${projectId}`;
    const buffer = this.signalBuffer.get(key) || [];

    const cutoffTime = new Date(Date.now() - timeWindowMs);

    // Filter signals within time window
    const recentSignals = buffer.filter(
      (signal) => signal.timestamp >= cutoffTime
    );

    console.log(`[IntentPrediction] Collected ${recentSignals.length} signals for ${key}`);

    return recentSignals;
  }

  /**
   * Add a signal to the buffer for a user/project
   */
  addSignal(userId: string, projectId: string, signal: Omit<IntentSignal, 'timestamp'>): void {
    const key = `${userId}:${projectId}`;
    const buffer = this.signalBuffer.get(key) || [];

    const fullSignal: IntentSignal = {
      ...signal,
      timestamp: new Date(),
    };

    buffer.push(fullSignal);

    // Keep only last 1000 signals per user/project
    if (buffer.length > 1000) {
      buffer.splice(0, buffer.length - 1000);
    }

    this.signalBuffer.set(key, buffer);
  }

  /**
   * Create signals from common developer activities
   */
  createSignalFromFileChange(
    filePath: string,
    changeType: 'create' | 'modify' | 'delete',
    linesChanged?: number
  ): IntentSignal {
    const weight = this.calculateFileChangeWeight(changeType, linesChanged);
    return {
      type: 'file_change',
      content: `${changeType}: ${filePath}${linesChanged ? ` (${linesChanged} lines)` : ''}`,
      weight,
      timestamp: new Date(),
    };
  }

  createSignalFromCommit(message: string, filesChanged: number): IntentSignal {
    return {
      type: 'commit_message',
      content: message,
      weight: Math.min(0.9, 0.5 + filesChanged * 0.05),
      timestamp: new Date(),
    };
  }

  createSignalFromSearchQuery(query: string): IntentSignal {
    return {
      type: 'search_query',
      content: query,
      weight: 0.7,
      timestamp: new Date(),
    };
  }

  createSignalFromError(errorType: string, errorMessage: string): IntentSignal {
    return {
      type: 'error_pattern',
      content: `${errorType}: ${errorMessage}`,
      weight: 0.8,
      timestamp: new Date(),
    };
  }

  createSignalFromApiCall(endpoint: string, method: string): IntentSignal {
    return {
      type: 'api_call',
      content: `${method} ${endpoint}`,
      weight: 0.6,
      timestamp: new Date(),
    };
  }

  createSignalFromNavigation(path: string): IntentSignal {
    return {
      type: 'navigation',
      content: path,
      weight: 0.4,
      timestamp: new Date(),
    };
  }

  // ============================================================
  // Historical Intent Search
  // ============================================================

  /**
   * Searches knowledge base for similar past intents.
   * Uses embeddings for semantic similarity search via Pinecone.
   *
   * @param predictedGoal - The predicted goal to search for
   * @param limit - Maximum number of results
   * @returns Array of similar historical intents
   */
  async findSimilarIntents(
    predictedGoal: string,
    limit: number = 5
  ): Promise<HistoricalIntent[]> {
    try {
      // Generate embedding for the predicted goal
      const embedding = await this.pinecone.generateCodeEmbedding(predictedGoal);

      // Search Pinecone for similar patterns
      const similarPatterns = await this.pinecone.findSimilarPatterns(
        embedding,
        limit,
        0.5 // Lower threshold to get more results
      );

      // Convert pattern results to historical intents
      const historicalIntents: HistoricalIntent[] = similarPatterns.map((pattern) => ({
        id: pattern.patternId,
        goal: pattern.description,
        outcome: this.mapAccuracyToOutcome(pattern.accuracy),
        patternsUsed: [pattern.codeSignature],
        lessonsLearned: this.extractLessonsFromPattern(pattern),
        similarity: pattern.similarity,
      }));

      // Also check Neo4j for graph-based similar intents
      if (this.neo4jService) {
        const graphIntents = await this.findSimilarIntentsInGraph(
          predictedGoal,
          limit
        );
        historicalIntents.push(...graphIntents);
      }

      // Deduplicate and sort by similarity
      const uniqueIntents = this.deduplicateIntents(historicalIntents);
      uniqueIntents.sort((a, b) => b.similarity - a.similarity);

      return uniqueIntents.slice(0, limit);
    } catch (error: any) {
      console.error('[IntentPrediction] Similar intent search failed:', error.message);
      return [];
    }
  }

  // ============================================================
  // Outcome Recording (Learning Loop)
  // ============================================================

  /**
   * Records whether the predicted intent was achieved.
   * Feeds back into learning loop to improve future predictions.
   *
   * @param intentId - The intent ID to record outcome for
   * @param outcome - Success, partial, or failed
   * @param lessonsLearned - Lessons learned from this outcome
   */
  async recordIntentOutcome(
    intentId: string,
    outcome: 'success' | 'partial' | 'failed',
    lessonsLearned: string[]
  ): Promise<void> {
    console.log(`[IntentPrediction] Recording outcome for ${intentId}: ${outcome}`);

    // Get the original intent
    const intent = this.intentCache.get(intentId);
    if (!intent) {
      console.warn(`[IntentPrediction] Intent ${intentId} not found in cache`);
      return;
    }

    // Create outcome record
    const outcomeRecord: IntentOutcome = {
      intentId,
      outcome,
      lessonsLearned,
      actualGoal: intent.predictedGoal,
      completionTime: Date.now() - intent.timestamp.getTime(),
    };

    // Store outcome
    this.outcomeHistory.set(intentId, outcomeRecord);

    // Update Pinecone with outcome data for future similarity searches
    await this.updateEmbeddingsWithOutcome(intent, outcomeRecord);

    // Update Neo4j graph relationships
    await this.updateGraphWithOutcome(intent, outcomeRecord);

    console.log(`[IntentPrediction] Outcome recorded and learning updated`);
  }

  // ============================================================
  // Recommendations
  // ============================================================

  /**
   * Based on similar past intents, recommend best approach
   * and warn about common pitfalls.
   *
   * @param intent - The predicted intent
   * @returns Recommended approach and warnings
   */
  async getRecommendations(
    intent: PredictedIntent
  ): Promise<{ approach: string; warnings: string[] }> {
    // If we already have recommendations, return them
    if (intent.recommendedApproach && intent.warnings.length > 0) {
      return {
        approach: intent.recommendedApproach,
        warnings: intent.warnings,
      };
    }

    // Otherwise, generate new recommendations based on similar intents
    const similarIntents = intent.similarIntents.length > 0
      ? intent.similarIntents
      : await this.findSimilarIntents(intent.predictedGoal, 5);

    // Extract successful patterns
    const successfulPatterns = similarIntents
      .filter((i) => i.outcome === 'success')
      .flatMap((i) => i.patternsUsed);

    // Extract lessons from failures
    const failureLessons = similarIntents
      .filter((i) => i.outcome === 'failed')
      .flatMap((i) => i.lessonsLearned);

    // Build approach recommendation
    let approach = 'No specific recommendations available';
    if (successfulPatterns.length > 0) {
      approach = `Based on ${similarIntents.filter((i) => i.outcome === 'success').length} successful similar projects:\n` +
        `- Common patterns: ${successfulPatterns.slice(0, 3).join(', ')}\n` +
        `- Consider following established patterns for best results`;
    }

    // Build warnings
    const warnings: string[] = [];
    if (failureLessons.length > 0) {
      warnings.push(...failureLessons.slice(0, 5));
    }

    // Add confidence-based warning
    if (intent.confidence < 0.5) {
      warnings.unshift('Low confidence prediction - verify intent manually');
    }

    return { approach, warnings };
  }

  // ============================================================
  // Private Methods: Claude Analysis
  // ============================================================

  /**
   * Use Claude to analyze signals and infer developer intent
   */
  private async analyzeIntentWithClaude(
    context: SignalAnalysisContext
  ): Promise<ClaudeIntentAnalysis> {
    const prompt = this.buildIntentAnalysisPrompt(context);

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2048,
        temperature: 0.3,
        system: this.getIntentAnalysisSystemPrompt(),
        messages: [
          {
            role: 'user',
            content: prompt,
          },
        ],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type from Claude');
      }

      return this.parseClaudeAnalysis(content.text);
    } catch (error: any) {
      console.error('[IntentPrediction] Claude analysis failed:', error.message);
      throw error;
    }
  }

  private getIntentAnalysisSystemPrompt(): string {
    return `You are an expert at understanding developer intent by analyzing their actions.
Your role is to predict what a developer is trying to build based on:
- File changes they make
- Commit messages they write
- Search queries they perform
- Errors they encounter
- APIs they call
- Navigation patterns

You should:
1. Identify the high-level goal (e.g., "Building a user authentication system")
2. Assess confidence in your prediction
3. Recommend the best approach based on common patterns
4. Warn about potential pitfalls

Be specific and actionable. Focus on understanding the INTENT, not just describing the actions.`;
  }

  private buildIntentAnalysisPrompt(context: SignalAnalysisContext): string {
    const signalsSummary = context.signals
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 20)
      .map((s) => `- [${s.type}] (weight: ${s.weight.toFixed(2)}) ${s.content}`)
      .join('\n');

    let prompt = `Analyze these developer activity signals to predict what they're trying to build:

**SIGNALS (sorted by importance):**
${signalsSummary}

`;

    if (context.projectContext) {
      prompt += `**PROJECT CONTEXT:**
- Language: ${context.projectContext.language}
- Framework: ${context.projectContext.framework || 'Unknown'}
- File: ${context.projectContext.filePath}
- Imports: ${context.projectContext.imports.slice(0, 10).join(', ')}

`;
    }

    prompt += `**YOUR TASK:**
Predict the developer's intent and provide recommendations.

Respond in this exact JSON format:
{
  "predictedGoal": "A clear, specific description of what they're building",
  "confidence": 0.85,
  "reasoning": "Why you believe this is their intent",
  "recommendedApproach": "The best way to accomplish this goal",
  "warnings": ["Potential pitfall 1", "Potential pitfall 2"],
  "relatedConcepts": ["concept1", "concept2"]
}`;

    return prompt;
  }

  private parseClaudeAnalysis(responseText: string): ClaudeIntentAnalysis {
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in Claude response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        predictedGoal: parsed.predictedGoal || 'Unknown goal',
        confidence: Math.max(0, Math.min(1, parsed.confidence || 0.5)),
        reasoning: parsed.reasoning || '',
        recommendedApproach: parsed.recommendedApproach || 'No specific approach recommended',
        warnings: parsed.warnings || [],
        relatedConcepts: parsed.relatedConcepts || [],
      };
    } catch (error) {
      console.error('[IntentPrediction] Failed to parse Claude response:', error);

      // Return fallback analysis
      return {
        predictedGoal: 'Unable to parse intent',
        confidence: 0.1,
        reasoning: 'Failed to parse Claude response',
        recommendedApproach: 'Manual review recommended',
        warnings: ['Intent analysis parsing failed'],
        relatedConcepts: [],
      };
    }
  }

  // ============================================================
  // Private Methods: Graph Operations
  // ============================================================

  private async storeIntentInGraph(intent: PredictedIntent): Promise<void> {
    if (!this.neo4jService) return;

    try {
      // Generate embedding for the intent
      const embedding = await this.pinecone.generateCodeEmbedding(
        `${intent.predictedGoal}\n${intent.recommendedApproach}`
      );

      // Store in Pinecone for future similarity searches
      await this.pinecone.storePatternEmbedding({
        patternId: `intent_${intent.id}`,
        embedding,
        metadata: {
          name: intent.predictedGoal,
          category: 'intent',
          severity: 'LOW',
          accuracy: intent.confidence,
          occurrenceCount: 1,
        },
      });

      console.log(`[IntentPrediction] Stored intent ${intent.id} in knowledge base`);
    } catch (error: any) {
      console.error('[IntentPrediction] Failed to store intent in graph:', error.message);
    }
  }

  private async findSimilarIntentsInGraph(
    goal: string,
    limit: number
  ): Promise<HistoricalIntent[]> {
    if (!this.neo4jService) return [];

    try {
      // Generate embedding for search
      const embedding = await this.pinecone.generateCodeEmbedding(goal);

      // Search for similar changes in Neo4j
      const similarChanges = await this.neo4jService.findSimilarChanges(
        embedding,
        limit
      );

      // Convert to historical intents
      return similarChanges.map(({ change, similarity }) => ({
        id: change.id,
        goal: change.intent,
        outcome: this.mapChangeToOutcome(change),
        patternsUsed: [change.changeType],
        lessonsLearned: change.reasoning.alternatives || [],
        similarity,
      }));
    } catch (error: any) {
      console.error('[IntentPrediction] Graph search failed:', error.message);
      return [];
    }
  }

  private async updateEmbeddingsWithOutcome(
    intent: PredictedIntent,
    outcome: IntentOutcome
  ): Promise<void> {
    try {
      // Update the pattern metadata in Pinecone with outcome
      await this.pinecone.updatePatternMetadata(`intent_${intent.id}`, {
        name: intent.predictedGoal,
        category: 'intent',
        severity: outcome.outcome === 'failed' ? 'HIGH' : 'LOW',
        accuracy: outcome.outcome === 'success' ? 1.0 : outcome.outcome === 'partial' ? 0.5 : 0.0,
        occurrenceCount: 1,
      });
    } catch (error: any) {
      console.error('[IntentPrediction] Failed to update embeddings:', error.message);
    }
  }

  private async updateGraphWithOutcome(
    intent: PredictedIntent,
    outcome: IntentOutcome
  ): Promise<void> {
    // In a full implementation, this would update Neo4j relationships
    // to strengthen connections between successful intent patterns
    console.log(`[IntentPrediction] Graph outcome update for ${intent.id}: ${outcome.outcome}`);
  }

  // ============================================================
  // Private Methods: Helpers
  // ============================================================

  private extractUserId(signals: IntentSignal[]): string | null {
    // In a real implementation, signals might contain user metadata
    return null;
  }

  private extractProjectId(
    signals: IntentSignal[],
    context?: ProjectContext
  ): string | null {
    if (context?.filePath) {
      // Extract project from file path
      const parts = context.filePath.split('/');
      return parts[parts.length - 2] || null;
    }
    return null;
  }

  private calculateFileChangeWeight(
    changeType: 'create' | 'modify' | 'delete',
    linesChanged?: number
  ): number {
    let weight = 0.5;

    // Creation is a strong signal
    if (changeType === 'create') weight = 0.8;
    // Deletion is also significant
    else if (changeType === 'delete') weight = 0.7;

    // Adjust by lines changed
    if (linesChanged) {
      weight = Math.min(1, weight + linesChanged * 0.01);
    }

    return weight;
  }

  private mapAccuracyToOutcome(accuracy: number): 'success' | 'partial' | 'failed' {
    if (accuracy >= 0.8) return 'success';
    if (accuracy >= 0.5) return 'partial';
    return 'failed';
  }

  private mapChangeToOutcome(change: any): 'success' | 'partial' | 'failed' {
    if (change.reasoning?.confidence >= 0.8) return 'success';
    if (change.reasoning?.confidence >= 0.5) return 'partial';
    return 'failed';
  }

  private extractLessonsFromPattern(pattern: any): string[] {
    const lessons: string[] = [];

    if (pattern.severity === 'HIGH') {
      lessons.push(`High severity pattern: ${pattern.name}`);
    }

    if (pattern.accuracy < 0.5) {
      lessons.push(`Low accuracy pattern - consider alternatives`);
    }

    return lessons;
  }

  private enrichRecommendations(
    analysis: ClaudeIntentAnalysis,
    similarIntents: HistoricalIntent[]
  ): { approach: string; warnings: string[] } {
    let approach = analysis.recommendedApproach;
    const warnings = [...analysis.warnings];

    // Enrich with historical data
    const successfulIntents = similarIntents.filter((i) => i.outcome === 'success');
    const failedIntents = similarIntents.filter((i) => i.outcome === 'failed');

    if (successfulIntents.length > 0) {
      const patterns = successfulIntents.flatMap((i) => i.patternsUsed).slice(0, 3);
      if (patterns.length > 0) {
        approach += `\n\nHistorical success patterns: ${patterns.join(', ')}`;
      }
    }

    if (failedIntents.length > 0) {
      const lessons = failedIntents.flatMap((i) => i.lessonsLearned).slice(0, 3);
      warnings.push(...lessons);
    }

    return { approach, warnings };
  }

  private deduplicateIntents(intents: HistoricalIntent[]): HistoricalIntent[] {
    const seen = new Set<string>();
    return intents.filter((intent) => {
      const key = `${intent.goal}:${intent.outcome}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  // ============================================================
  // Utility Methods
  // ============================================================

  /**
   * Get a cached intent by ID
   */
  getIntent(intentId: string): PredictedIntent | undefined {
    return this.intentCache.get(intentId);
  }

  /**
   * Get all outcomes for analysis
   */
  getAllOutcomes(): IntentOutcome[] {
    return Array.from(this.outcomeHistory.values());
  }

  /**
   * Get prediction accuracy statistics
   */
  getAccuracyStats(): {
    total: number;
    successful: number;
    partial: number;
    failed: number;
    successRate: number;
  } {
    const outcomes = this.getAllOutcomes();
    const total = outcomes.length;
    const successful = outcomes.filter((o) => o.outcome === 'success').length;
    const partial = outcomes.filter((o) => o.outcome === 'partial').length;
    const failed = outcomes.filter((o) => o.outcome === 'failed').length;

    return {
      total,
      successful,
      partial,
      failed,
      successRate: total > 0 ? successful / total : 0,
    };
  }

  /**
   * Clear caches (for testing)
   */
  clearCaches(): void {
    this.intentCache.clear();
    this.signalBuffer.clear();
    this.outcomeHistory.clear();
  }

  /**
   * Close connections
   */
  async close(): Promise<void> {
    if (this.neo4jService) {
      await this.neo4jService.close();
    }
    console.log('[IntentPrediction] Service closed');
  }
}

// ============================================================
// Singleton Export
// ============================================================

export const intentPredictionService = new IntentPredictionService();

export default IntentPredictionService;

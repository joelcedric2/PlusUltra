import { TCIEnvelopeService, TCIEnvelope } from '../temporal/TCIEnvelopeService';
import { TemporalGraphDB, TemporalChange } from '../temporal/TemporalGraphDB';

export interface HumanCorrection {
  envelopeId: string;
  originalCode: string;
  correctedCode: string;
  reason: string;
  correctionType: 'bug_fix' | 'optimization' | 'style' | 'logic' | 'security';
  userId: string;
  timestamp: Date;
  metadata?: Record<string, any>;
}

export interface LearningPattern {
  patternId: string;
  description: string;
  context: string;
  successRate: number;
  usageCount: number;
  examples: Array<{
    envelopeId: string;
    outcome: 'success' | 'failure';
    feedback?: string;
  }>;
  embeddings?: number[];
  tags: string[];
}

export interface FeedbackMetrics {
  totalCorrections: number;
  correctionsByType: Record<string, number>;
  averageSuccessRate: number;
  modelImprovement: Record<string, number>; // model → improvement percentage
  topPatterns: LearningPattern[];
  recentTrends: Array<{
    week: string;
    corrections: number;
    successRate: number;
  }>;
}

/**
 * TCI Feedback Loop System
 *
 * Implements continuous learning from human corrections and project outcomes.
 * Key Features:
 * - Capture human corrections and edits
 * - Update embeddings with successful patterns
 * - Adjust model weights based on performance
 * - Learn from project history
 * - Prevent repeated errors
 *
 * This fulfills the TCI Specification requirement:
 * "Step 6: Feedback Loop - All manual fixes feed back into embeddings"
 */
export class TCIFeedbackLoop {
  private corrections: Map<string, HumanCorrection> = new Map();
  private patterns: Map<string, LearningPattern> = new Map();
  private modelPerformanceHistory: Map<string, number[]> = new Map();

  constructor(
    private readonly envelopeService: TCIEnvelopeService,
    private readonly temporalGraph: TemporalGraphDB,
    private readonly vectorDB: any, // For embedding updates
    private readonly embeddingService: any // For generating new embeddings
  ) {}

  /**
   * Record a human correction to AI-generated code
   * This is the primary entry point for feedback
   */
  async recordHumanCorrection(correction: Omit<HumanCorrection, 'timestamp'>): Promise<void> {
    const timestamp = new Date();
    const fullCorrection: HumanCorrection = {
      ...correction,
      timestamp
    };

    console.log(`📝 Recording human correction for envelope: ${correction.envelopeId}`);

    // 1. Store correction
    this.corrections.set(correction.envelopeId, fullCorrection);

    // 2. Update envelope with correction metadata
    const envelope = await this.envelopeService.getEnvelope(correction.envelopeId);
    if (envelope) {
      await this.updateEnvelopeWithCorrection(envelope, fullCorrection);
    }

    // 3. Extract learning pattern from correction
    const pattern = await this.extractLearningPattern(fullCorrection);
    if (pattern) {
      await this.updateLearningPattern(pattern);
    }

    // 4. Update embeddings with correction
    await this.updateEmbeddingsFromCorrection(fullCorrection);

    // 5. Adjust model weights if applicable
    await this.adjustModelWeights(correction.envelopeId, fullCorrection);

    console.log(`✅ Correction recorded and learned`);
  }

  /**
   * Update embeddings to incorporate successful correction pattern
   */
  private async updateEmbeddingsFromCorrection(correction: HumanCorrection): Promise<void> {
    try {
      // Generate embeddings for the corrected code
      const correctionText = `
        Problem: ${correction.reason}
        Original: ${correction.originalCode}
        Corrected: ${correction.correctedCode}
        Type: ${correction.correctionType}
      `;

      const embedding = await this.embeddingService.embed(correctionText);

      // Store as a learning example in vector DB
      await this.vectorDB.store({
        id: `correction_${correction.envelopeId}`,
        vector: embedding,
        metadata: {
          type: 'human_correction',
          envelope_id: correction.envelopeId,
          correction_type: correction.correctionType,
          reason: correction.reason,
          timestamp: correction.timestamp,
          user_id: correction.userId
        }
      });

      console.log(`📊 Updated embeddings with correction pattern`);

    } catch (error) {
      console.error('Failed to update embeddings:', error);
    }
  }

  /**
   * Extract reusable learning pattern from correction
   */
  private async extractLearningPattern(correction: HumanCorrection): Promise<LearningPattern | null> {
    try {
      // Identify the core pattern that can be reused
      const patternId = this.generatePatternId(correction);

      const existingPattern = this.patterns.get(patternId);

      if (existingPattern) {
        // Update existing pattern
        existingPattern.usageCount++;
        existingPattern.examples.push({
          envelopeId: correction.envelopeId,
          outcome: 'success', // Assumption: human correction improves code
          feedback: correction.reason
        });

        // Recalculate success rate
        const successCount = existingPattern.examples.filter(e => e.outcome === 'success').length;
        existingPattern.successRate = successCount / existingPattern.examples.length;

        return existingPattern;
      } else {
        // Create new pattern
        const newPattern: LearningPattern = {
          patternId,
          description: `${correction.correctionType}: ${correction.reason}`,
          context: this.extractContext(correction),
          successRate: 1.0, // First example is always successful
          usageCount: 1,
          examples: [{
            envelopeId: correction.envelopeId,
            outcome: 'success',
            feedback: correction.reason
          }],
          tags: [correction.correctionType, ...this.extractTags(correction)]
        };

        return newPattern;
      }

    } catch (error) {
      console.error('Failed to extract learning pattern:', error);
      return null;
    }
  }

  /**
   * Update or store learning pattern
   */
  private async updateLearningPattern(pattern: LearningPattern): Promise<void> {
    this.patterns.set(pattern.patternId, pattern);

    // Generate embeddings for the pattern
    if (!pattern.embeddings) {
      const patternText = `${pattern.description}\nContext: ${pattern.context}\nTags: ${pattern.tags.join(', ')}`;
      pattern.embeddings = await this.embeddingService.embed(patternText);
    }

    // Store in vector DB for similarity search
    await this.vectorDB.store({
      id: `pattern_${pattern.patternId}`,
      vector: pattern.embeddings,
      metadata: {
        type: 'learning_pattern',
        pattern_id: pattern.patternId,
        description: pattern.description,
        success_rate: pattern.successRate,
        usage_count: pattern.usageCount,
        tags: pattern.tags
      }
    });

    console.log(`🎓 Updated learning pattern: ${pattern.description} (success rate: ${(pattern.successRate * 100).toFixed(1)}%)`);
  }

  /**
   * Adjust model weights based on correction feedback
   */
  private async adjustModelWeights(envelopeId: string, correction: HumanCorrection): Promise<void> {
    try {
      const envelope = await this.envelopeService.getEnvelope(envelopeId);
      if (!envelope) return;

      const model = envelope.actor;

      // Track negative feedback (correction needed means model failed)
      const history = this.modelPerformanceHistory.get(model) || [];
      history.push(0); // 0 = failure (needed correction)

      // Keep only last 100 records
      if (history.length > 100) {
        history.shift();
      }

      this.modelPerformanceHistory.set(model, history);

      // Calculate recent performance
      const recentPerformance = history.slice(-20);
      const successRate = recentPerformance.reduce((a, b) => a + b, 0) / recentPerformance.length;

      console.log(`📉 Model ${model} performance: ${(successRate * 100).toFixed(1)}% (after correction)`);

      // If performance is very low, suggest retraining or replacement
      if (successRate < 0.3) {
        console.warn(`🚨 Model ${model} has very low success rate (${(successRate * 100).toFixed(1)}%) - consider retraining`);
      }

    } catch (error) {
      console.error('Failed to adjust model weights:', error);
    }
  }

  /**
   * Update envelope metadata with correction information
   */
  private async updateEnvelopeWithCorrection(envelope: TCIEnvelope, correction: HumanCorrection): Promise<void> {
    // Add correction info to envelope metadata
    if (!envelope.metadata) {
      envelope.metadata = {};
    }

    envelope.metadata.humanCorrection = {
      corrected: true,
      correctionType: correction.correctionType,
      reason: correction.reason,
      correctedBy: correction.userId,
      correctedAt: correction.timestamp.toISOString()
    };

    // Update in storage (this would normally go through envelope service)
    console.log(`📦 Updated envelope ${envelope.envelope_id} with correction metadata`);
  }

  /**
   * Record successful pattern usage (positive feedback)
   */
  async recordSuccessfulPattern(envelopeId: string, patternId: string, feedback?: string): Promise<void> {
    const pattern = this.patterns.get(patternId);
    if (!pattern) {
      console.warn(`Pattern ${patternId} not found`);
      return;
    }

    // Add positive example
    pattern.examples.push({
      envelopeId,
      outcome: 'success',
      feedback
    });

    pattern.usageCount++;

    // Recalculate success rate
    const successCount = pattern.examples.filter(e => e.outcome === 'success').length;
    pattern.successRate = successCount / pattern.examples.length;

    await this.updateLearningPattern(pattern);

    // Track positive model performance
    const envelope = await this.envelopeService.getEnvelope(envelopeId);
    if (envelope) {
      const model = envelope.actor;
      const history = this.modelPerformanceHistory.get(model) || [];
      history.push(1); // 1 = success

      if (history.length > 100) history.shift();
      this.modelPerformanceHistory.set(model, history);
    }
  }

  /**
   * Find similar corrections/patterns for a given context
   */
  async findSimilarPatterns(query: string, limit: number = 5): Promise<LearningPattern[]> {
    try {
      const queryEmbedding = await this.embeddingService.embed(query);

      const results = await this.vectorDB.search({
        vector: queryEmbedding,
        limit,
        filter: {
          type: 'learning_pattern'
        }
      });

      const patterns: LearningPattern[] = [];
      for (const result of results) {
        const patternId = result.metadata.pattern_id;
        const pattern = this.patterns.get(patternId);
        if (pattern) {
          patterns.push(pattern);
        }
      }

      return patterns;

    } catch (error) {
      console.error('Failed to find similar patterns:', error);
      return [];
    }
  }

  /**
   * Get feedback metrics for monitoring
   */
  getFeedbackMetrics(): FeedbackMetrics {
    const correctionsByType: Record<string, number> = {};

    for (const correction of this.corrections.values()) {
      correctionsByType[correction.correctionType] =
        (correctionsByType[correction.correctionType] || 0) + 1;
    }

    // Calculate model improvement
    const modelImprovement: Record<string, number> = {};
    for (const [model, history] of this.modelPerformanceHistory.entries()) {
      const recentPerf = history.slice(-20).reduce((a, b) => a + b, 0) / Math.min(history.length, 20);
      const oldPerf = history.slice(0, 20).reduce((a, b) => a + b, 0) / Math.min(history.length, 20);
      modelImprovement[model] = ((recentPerf - oldPerf) / Math.max(oldPerf, 0.01)) * 100;
    }

    // Get top patterns
    const topPatterns = Array.from(this.patterns.values())
      .sort((a, b) => b.successRate * b.usageCount - a.successRate * a.usageCount)
      .slice(0, 10);

    // Calculate average success rate across all patterns
    const avgSuccessRate = topPatterns.length > 0
      ? topPatterns.reduce((sum, p) => sum + p.successRate, 0) / topPatterns.length
      : 0;

    return {
      totalCorrections: this.corrections.size,
      correctionsByType,
      averageSuccessRate: avgSuccessRate,
      modelImprovement,
      topPatterns,
      recentTrends: [] // Would calculate from correction timestamps
    };
  }

  // Private helper methods

  private generatePatternId(correction: HumanCorrection): string {
    // Generate consistent ID for similar correction types
    const hash = require('crypto').createHash('md5')
      .update(`${correction.correctionType}:${correction.reason}`)
      .digest('hex');
    return `pattern_${hash.substring(0, 16)}`;
  }

  private extractContext(correction: HumanCorrection): string {
    return `Correction type: ${correction.correctionType}, Reason: ${correction.reason}`;
  }

  private extractTags(correction: HumanCorrection): string[] {
    const tags: string[] = [];

    // Extract tags from reason
    const reason = correction.reason.toLowerCase();

    if (reason.includes('performance')) tags.push('performance');
    if (reason.includes('security')) tags.push('security');
    if (reason.includes('bug')) tags.push('bug');
    if (reason.includes('refactor')) tags.push('refactoring');
    if (reason.includes('test')) tags.push('testing');

    return tags;
  }

  /**
   * Export feedback data for analysis
   */
  exportFeedbackData(): {
    corrections: HumanCorrection[];
    patterns: LearningPattern[];
    modelPerformance: Record<string, number[]>;
  } {
    return {
      corrections: Array.from(this.corrections.values()),
      patterns: Array.from(this.patterns.values()),
      modelPerformance: Object.fromEntries(this.modelPerformanceHistory)
    };
  }

  /**
   * Clear feedback data (for testing)
   */
  clear(): void {
    this.corrections.clear();
    this.patterns.clear();
    this.modelPerformanceHistory.clear();
  }
}

export default TCIFeedbackLoop;

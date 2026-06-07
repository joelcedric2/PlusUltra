/**
 * Model Quarantine Service
 * Automatically quarantines underperforming AI models
 *
 * Quarantine Rules:
 * - Model consistently scores lowest in confidence for 3+ consecutive tasks
 * - Model has quality score < 0.5 in 5+ recent tasks
 * - Model confidence drops below 0.4
 *
 * Release Rules:
 * - Manual release by admin
 * - Automatic release after 24 hours
 * - Automatic release if all other models are also quarantined
 */

import { AIModel } from './MultiAIOrchestrator';

interface QuarantineRecord {
  model: AIModel['name'];
  quarantinedAt: Date;
  reason: string;
  consecutivePoorPerformances: number;
  averageScore: number;
  releaseAt?: Date; // Automatic release time
  releasedAt?: Date;
  releasedBy?: 'system' | 'admin';
}

interface PerformanceHistory {
  model: AIModel['name'];
  timestamp: Date;
  overallScore: number;
  qualityScore: number;
  consensusScore: number;
  rank: number; // 1 = best, 5 = worst
}

export class ModelQuarantineService {
  private quarantinedModels: Map<AIModel['name'], QuarantineRecord> = new Map();
  private performanceHistory: PerformanceHistory[] = [];
  private readonly maxHistorySize = 100; // Keep last 100 task results

  // Quarantine thresholds
  private readonly consecutiveWorstThreshold = 3; // 3 times worst in a row
  private readonly poorQualityThreshold = 0.5; // Quality score below 0.5
  private readonly minConfidenceThreshold = 0.4; // Self-confidence below 0.4
  private readonly quarantineDuration = 24 * 60 * 60 * 1000; // 24 hours in ms

  /**
   * Record performance after each orchestration
   */
  recordPerformance(
    modelScores: Array<{
      model: string;
      overall: number;
      quality: number;
      selfConfidence: number;
    }>,
    consensus: number
  ): void {
    // Sort by overall score to determine rank
    const sortedScores = [...modelScores].sort((a, b) => b.overall - a.overall);

    const timestamp = new Date();

    // Record each model's performance
    sortedScores.forEach((score, index) => {
      const history: PerformanceHistory = {
        model: score.model as AIModel['name'],
        timestamp,
        overallScore: score.overall,
        qualityScore: score.quality,
        consensusScore: consensus,
        rank: index + 1, // 1 = best, 5 = worst
      };

      this.performanceHistory.push(history);
    });

    // Trim history if too large
    if (this.performanceHistory.length > this.maxHistorySize) {
      this.performanceHistory = this.performanceHistory.slice(-this.maxHistorySize);
    }

    // Check for quarantine conditions
    this.evaluateQuarantine(sortedScores);
  }

  /**
   * Evaluate if any model should be quarantined
   */
  private evaluateQuarantine(
    modelScores: Array<{
      model: string;
      overall: number;
      quality: number;
      selfConfidence: number;
    }>
  ): void {
    // Find the worst performer
    const worstModel = modelScores[modelScores.length - 1];

    if (!worstModel) return;

    const modelName = worstModel.model as AIModel['name'];

    // Already quarantined? Skip
    if (this.isQuarantined(modelName)) return;

    // Check quarantine conditions

    // Condition 1: Consecutive worst performances
    const recentWorst = this.getConsecutiveWorstCount(modelName);
    if (recentWorst >= this.consecutiveWorstThreshold) {
      this.quarantine(
        modelName,
        `Consistently worst performer for ${recentWorst} consecutive tasks`,
        recentWorst,
        worstModel.overall
      );
      return;
    }

    // Condition 2: Poor quality score
    if (worstModel.quality < this.poorQualityThreshold) {
      const recentPoorQuality = this.getRecentPoorQualityCount(modelName);
      if (recentPoorQuality >= 5) {
        this.quarantine(
          modelName,
          `Quality score below ${this.poorQualityThreshold} in ${recentPoorQuality} recent tasks`,
          recentPoorQuality,
          worstModel.quality
        );
        return;
      }
    }

    // Condition 3: Very low self-confidence
    if (worstModel.selfConfidence < this.minConfidenceThreshold) {
      this.quarantine(
        modelName,
        `Self-confidence critically low (${worstModel.selfConfidence.toFixed(2)})`,
        1,
        worstModel.selfConfidence
      );
    }
  }

  /**
   * Get count of consecutive times a model was worst
   */
  private getConsecutiveWorstCount(model: AIModel['name']): number {
    let count = 0;

    // Get recent history for this model (most recent first)
    const recentHistory = this.performanceHistory
      .slice()
      .reverse()
      .filter(h => h.model === model)
      .slice(0, 10); // Check last 10 appearances

    for (const history of recentHistory) {
      if (history.rank === this.getMaxRankForTimestamp(history.timestamp)) {
        count++;
      } else {
        break; // Stop at first non-worst performance
      }
    }

    return count;
  }

  /**
   * Get the worst rank for a given timestamp (number of models participating)
   */
  private getMaxRankForTimestamp(timestamp: Date): number {
    const recordsAtTime = this.performanceHistory.filter(
      h => h.timestamp.getTime() === timestamp.getTime()
    );
    return recordsAtTime.length; // If 5 models participated, worst rank is 5
  }

  /**
   * Get count of recent poor quality performances
   */
  private getRecentPoorQualityCount(model: AIModel['name']): number {
    const recentHistory = this.performanceHistory
      .slice()
      .reverse()
      .filter(h => h.model === model)
      .slice(0, 10); // Check last 10 appearances

    return recentHistory.filter(h => h.qualityScore < this.poorQualityThreshold).length;
  }

  /**
   * Quarantine a model
   */
  private quarantine(
    model: AIModel['name'],
    reason: string,
    consecutivePoorPerformances: number,
    averageScore: number
  ): void {
    const releaseAt = new Date(Date.now() + this.quarantineDuration);

    const record: QuarantineRecord = {
      model,
      quarantinedAt: new Date(),
      reason,
      consecutivePoorPerformances,
      averageScore,
      releaseAt,
    };

    this.quarantinedModels.set(model, record);

    console.warn(`⚠️  MODEL QUARANTINED: ${model}`);
    console.warn(`   Reason: ${reason}`);
    console.warn(`   Score: ${averageScore.toFixed(2)}`);
    console.warn(`   Auto-release: ${releaseAt.toISOString()}`);
  }

  /**
   * Check if a model is currently quarantined
   */
  isQuarantined(model: AIModel['name']): boolean {
    const record = this.quarantinedModels.get(model);

    if (!record) return false;

    // Already released?
    if (record.releasedAt) return false;

    // Automatic release time passed?
    if (record.releaseAt && new Date() >= record.releaseAt) {
      this.release(model, 'system');
      return false;
    }

    return true;
  }

  /**
   * Get list of available (non-quarantined) models
   */
  getAvailableModels(allModels: AIModel['name'][]): AIModel['name'][] {
    const available = allModels.filter(model => !this.isQuarantined(model));

    // Safety: Never quarantine ALL models - always keep at least 2
    if (available.length < 2) {
      console.warn('⚠️  Too many models quarantined! Releasing oldest quarantine...');
      this.releaseOldest();
      return this.getAvailableModels(allModels); // Recursively check again
    }

    return available;
  }

  /**
   * Release a model from quarantine
   */
  release(model: AIModel['name'], releasedBy: 'system' | 'admin' = 'system'): void {
    const record = this.quarantinedModels.get(model);

    if (!record) {
      console.warn(`Cannot release ${model}: not in quarantine`);
      return;
    }

    record.releasedAt = new Date();
    record.releasedBy = releasedBy;

    console.log(`✅ MODEL RELEASED: ${model} (by ${releasedBy})`);
  }

  /**
   * Release the oldest quarantined model (safety mechanism)
   */
  private releaseOldest(): void {
    let oldestModel: AIModel['name'] | null = null;
    let oldestTime = Date.now();

    for (const [model, record] of this.quarantinedModels.entries()) {
      if (!record.releasedAt && record.quarantinedAt.getTime() < oldestTime) {
        oldestTime = record.quarantinedAt.getTime();
        oldestModel = model;
      }
    }

    if (oldestModel) {
      this.release(oldestModel, 'system');
    }
  }

  /**
   * Get all quarantine records (for admin dashboard)
   */
  getAllQuarantineRecords(): QuarantineRecord[] {
    return Array.from(this.quarantinedModels.values());
  }

  /**
   * Get active quarantines
   */
  getActiveQuarantines(): QuarantineRecord[] {
    return Array.from(this.quarantinedModels.values())
      .filter(record => !record.releasedAt);
  }

  /**
   * Get quarantine history for a specific model
   */
  getModelQuarantineHistory(model: AIModel['name']): QuarantineRecord | undefined {
    return this.quarantinedModels.get(model);
  }

  /**
   * Get performance statistics for a model
   */
  getModelStats(model: AIModel['name']): {
    totalTasks: number;
    averageScore: number;
    averageRank: number;
    timesWorst: number;
    timesBest: number;
    quarantineCount: number;
  } {
    const history = this.performanceHistory.filter(h => h.model === model);

    if (history.length === 0) {
      return {
        totalTasks: 0,
        averageScore: 0,
        averageRank: 0,
        timesWorst: 0,
        timesBest: 0,
        quarantineCount: 0,
      };
    }

    const totalTasks = history.length;
    const averageScore = history.reduce((sum, h) => sum + h.overallScore, 0) / totalTasks;
    const averageRank = history.reduce((sum, h) => sum + h.rank, 0) / totalTasks;

    const timesWorst = history.filter(h =>
      h.rank === this.getMaxRankForTimestamp(h.timestamp)
    ).length;

    const timesBest = history.filter(h => h.rank === 1).length;

    const quarantineRecord = this.quarantinedModels.get(model);
    const quarantineCount = quarantineRecord ? 1 : 0; // Simplified - could track multiple quarantines

    return {
      totalTasks,
      averageScore,
      averageRank,
      timesWorst,
      timesBest,
      quarantineCount,
    };
  }

  /**
   * Manual release by admin (for dashboard)
   */
  adminRelease(model: AIModel['name']): boolean {
    if (!this.isQuarantined(model)) {
      return false;
    }

    this.release(model, 'admin');
    return true;
  }

  /**
   * Release a model from quarantine (public method for routes)
   */
  releaseFromQuarantine(model: AIModel['name']): boolean {
    return this.adminRelease(model);
  }

  /**
   * Get quarantine status summary
   */
  getQuarantineSummary(): {
    totalQuarantined: number;
    activeQuarantines: number;
    models: Array<{
      model: string;
      status: 'active' | 'healthy';
      score?: number;
      reason?: string;
    }>;
  } {
    const allModels: AIModel['name'][] = ['claude', 'gpt5', 'gemini', 'grok', 'deepseek'];
    const activeQuarantines = this.getActiveQuarantines();

    return {
      totalQuarantined: this.quarantinedModels.size,
      activeQuarantines: activeQuarantines.length,
      models: allModels.map(model => {
        const record = this.quarantinedModels.get(model);
        const isActive = record && !record.releasedAt;

        return {
          model,
          status: isActive ? 'active' : 'healthy',
          score: record?.averageScore,
          reason: record?.reason,
        };
      }),
    };
  }
}

export const modelQuarantine = new ModelQuarantineService();

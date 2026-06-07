import * as fs from 'fs/promises';
import * as path from 'path';

export interface UsagePattern {
  userId: string;
  sessionId: string;
  timestamp: Date;
  feature: string;
  action: string;
  metadata: Record<string, any>;
  outcome: 'success' | 'error' | 'partial';
  duration: number;
  tokensUsed: number;
}

export interface ModelPerformance {
  model: string;
  taskType: string;
  successRate: number;
  averageTokens: number;
  averageLatency: number;
  errorRate: number;
  userSatisfaction: number;
  sampleSize: number;
}

export interface LearningInsight {
  type: 'pattern' | 'improvement' | 'optimization' | 'issue';
  category: 'code-quality' | 'user-experience' | 'performance' | 'reliability';
  confidence: number;
  description: string;
  recommendation: string;
  impact: 'low' | 'medium' | 'high';
  dataPoints: number;
}

export interface FineTuneDataset {
  model: string;
  taskType: string;
  samples: TrainingSample[];
  metadata: {
    createdAt: Date;
    version: string;
    sampleCount: number;
    qualityScore: number;
  };
}

export interface TrainingSample {
  input: string;
  output: string;
  metadata: {
    success: boolean;
    userRating?: number;
    tokensUsed: number;
    latency: number;
    errorType?: string;
  };
}

export class LearningAgentService {
  private patterns: Map<string, UsagePattern[]> = new Map();
  private modelPerformance: Map<string, ModelPerformance> = new Map();
  private insights: LearningInsight[] = [];
  private datasets: Map<string, FineTuneDataset> = new Map();

  /**
   * Record usage pattern for learning
   */
  async recordUsagePattern(pattern: UsagePattern): Promise<void> {
    try {
      // Store pattern in memory (in production, this would be in a database)
      const key = `${pattern.userId}_${pattern.feature}`;
      if (!this.patterns.has(key)) {
        this.patterns.set(key, []);
      }
      this.patterns.get(key)!.push(pattern);

      // Keep only recent patterns (last 1000 per user/feature)
      const patterns = this.patterns.get(key)!;
      if (patterns.length > 1000) {
        patterns.splice(0, patterns.length - 1000);
      }

      // Analyze patterns for insights
      await this.analyzePatterns();

    } catch (error) {
      console.error('Failed to record usage pattern:', error);
      throw error;
    }
  }

  /**
   * Record model performance metrics
   */
  async recordModelPerformance(performance: ModelPerformance): Promise<void> {
    try {
      const key = `${performance.model}_${performance.taskType}`;
      this.modelPerformance.set(key, performance);

      // Generate performance insights
      await this.generatePerformanceInsights(performance);

    } catch (error) {
      console.error('Failed to record model performance:', error);
      throw error;
    }
  }

  /**
   * Analyze usage patterns to find insights
   */
  private async analyzePatterns(): Promise<void> {
    try {
      // Analyze each user's patterns
      for (const [key, patterns] of this.patterns.entries()) {
        if (patterns.length < 10) continue; // Need minimum sample size

        const [userId, feature] = key.split('_');

        // Find common patterns
        const actionPatterns = this.findActionPatterns(patterns);
        const successPatterns = this.findSuccessPatterns(patterns);
        const timingPatterns = this.findTimingPatterns(patterns);

        // Generate insights based on patterns
        if (actionPatterns.length > 0) {
          this.insights.push({
            type: 'pattern',
            category: 'user-experience',
            confidence: Math.min(actionPatterns.length / patterns.length, 0.9),
            description: `User ${userId} frequently uses ${feature} in pattern: ${actionPatterns[0].actions.join(' → ')}`,
            recommendation: 'Consider optimizing UI flow for this common pattern',
            impact: actionPatterns[0].frequency > 0.7 ? 'high' : 'medium',
            dataPoints: actionPatterns[0].frequency * patterns.length
          });
        }

        if (successPatterns.length > 0) {
          this.insights.push({
            type: 'improvement',
            category: 'reliability',
            confidence: successPatterns[0].confidence,
            description: `Feature ${feature} has ${successPatterns[0].successRate * 100}% success rate`,
            recommendation: successPatterns[0].successRate < 0.8 ? 'Investigate and fix common failure points' : 'Feature is performing well',
            impact: successPatterns[0].successRate < 0.8 ? 'high' : 'low',
            dataPoints: successPatterns[0].sampleSize
          });
        }
      }

      // Keep only top insights (most recent and highest confidence)
      this.insights.sort((a, b) => {
        const scoreA = a.confidence * (a.dataPoints / 100);
        const scoreB = b.confidence * (b.dataPoints / 100);
        return scoreB - scoreA;
      });

      this.insights = this.insights.slice(0, 100);

    } catch (error) {
      console.error('Pattern analysis failed:', error);
    }
  }

  /**
   * Find common action sequences in patterns
   */
  private findActionPatterns(patterns: UsagePattern[]): Array<{
    actions: string[];
    frequency: number;
  }> {
    const actionSequences: Map<string, number> = new Map();

    // Look for 2-3 action sequences
    for (let i = 0; i < patterns.length - 1; i++) {
      const sequence = `${patterns[i].action}_${patterns[i + 1].action}`;
      actionSequences.set(sequence, (actionSequences.get(sequence) || 0) + 1);
    }

    return Array.from(actionSequences.entries())
      .map(([actions, count]) => ({
        actions: actions.split('_'),
        frequency: count / (patterns.length - 1)
      }))
      .filter(pattern => pattern.frequency > 0.3) // At least 30% frequency
      .sort((a, b) => b.frequency - a.frequency);
  }

  /**
   * Find success rate patterns
   */
  private findSuccessPatterns(patterns: UsagePattern[]): Array<{
    successRate: number;
    confidence: number;
    sampleSize: number;
  }> {
    const recentPatterns = patterns.slice(-100); // Last 100 patterns
    const successCount = recentPatterns.filter(p => p.outcome === 'success').length;
    const successRate = successCount / recentPatterns.length;

    const confidence = Math.min(recentPatterns.length / 50, 1.0); // More samples = higher confidence

    return [{
      successRate,
      confidence,
      sampleSize: recentPatterns.length
    }];
  }

  /**
   * Find timing and duration patterns
   */
  private findTimingPatterns(patterns: UsagePattern[]): Array<{
    averageDuration: number;
    peakHours: number[];
    confidence: number;
  }> {
    if (patterns.length < 20) return [];

    const durations = patterns.map(p => p.duration);
    const averageDuration = durations.reduce((a, b) => a + b, 0) / durations.length;

    // Find peak usage hours
    const hourCounts: Map<number, number> = new Map();
    patterns.forEach(p => {
      const hour = new Date(p.timestamp).getHours();
      hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
    });

    const peakHours = Array.from(hourCounts.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([hour]) => hour);

    return [{
      averageDuration,
      peakHours,
      confidence: Math.min(patterns.length / 50, 1.0)
    }];
  }

  /**
   * Generate performance insights
   */
  private async generatePerformanceInsights(performance: ModelPerformance): Promise<void> {
    // Compare with previous performance
    const key = `${performance.model}_${performance.taskType}`;
    const previous = this.modelPerformance.get(key);

    if (previous) {
      const successRateChange = performance.successRate - previous.successRate;
      const tokenUsageChange = performance.averageTokens - previous.averageTokens;

      if (Math.abs(successRateChange) > 0.1) { // 10% change
        this.insights.push({
          type: successRateChange > 0 ? 'improvement' : 'issue',
          category: 'reliability',
          confidence: 0.8,
          description: `${performance.model} ${performance.taskType} success rate ${successRateChange > 0 ? 'improved' : 'declined'} by ${Math.abs(successRateChange * 100).toFixed(1)}%`,
          recommendation: successRateChange < 0 ? 'Investigate recent changes affecting model performance' : 'Model performance is improving',
          impact: Math.abs(successRateChange) > 0.2 ? 'high' : 'medium',
          dataPoints: performance.sampleSize
        });
      }

      if (Math.abs(tokenUsageChange) > 20) { // 20 token change
        this.insights.push({
          type: 'optimization',
          category: 'performance',
          confidence: 0.7,
          description: `${performance.model} ${performance.taskType} token usage ${tokenUsageChange > 0 ? 'increased' : 'decreased'} by ${Math.abs(tokenUsageChange)} tokens`,
          recommendation: tokenUsageChange > 0 ? 'Optimize prompts to reduce token usage' : 'Token efficiency is improving',
          impact: 'medium',
          dataPoints: performance.sampleSize
        });
      }
    }
  }

  /**
   * Generate fine-tuning dataset
   */
  async generateFineTuneDataset(model: string, taskType: string, sampleCount: number = 1000): Promise<FineTuneDataset> {
    try {
      // Collect successful and failed examples
      const samples: TrainingSample[] = [];

      // Get patterns for this model/task combination
      for (const [key, patterns] of this.patterns.entries()) {
        if (patterns.length < 10) continue;

        const successfulPatterns = patterns.filter(p => p.outcome === 'success');
        const failedPatterns = patterns.filter(p => p.outcome === 'error');

        // Add successful examples (positive reinforcement)
        successfulPatterns.slice(0, Math.floor(sampleCount / 2)).forEach(pattern => {
          samples.push({
            input: this.generateTrainingInput(pattern),
            output: this.generateTrainingOutput(pattern, true),
            metadata: {
              success: true,
              tokensUsed: pattern.tokensUsed,
              latency: pattern.duration
            }
          });
        });

        // Add failed examples (negative reinforcement)
        failedPatterns.slice(0, Math.floor(sampleCount / 4)).forEach(pattern => {
          samples.push({
            input: this.generateTrainingInput(pattern),
            output: this.generateTrainingOutput(pattern, false),
            metadata: {
              success: false,
              tokensUsed: pattern.tokensUsed,
              latency: pattern.duration,
              errorType: pattern.metadata.errorType || 'unknown'
            }
          });
        });
      }

      // Shuffle and limit samples
      const shuffled = samples.sort(() => Math.random() - 0.5);
      const finalSamples = shuffled.slice(0, sampleCount);

      // Calculate quality score
      const successCount = finalSamples.filter(s => s.metadata.success).length;
      const qualityScore = successCount / finalSamples.length;

      const dataset: FineTuneDataset = {
        model,
        taskType,
        samples: finalSamples,
        metadata: {
          createdAt: new Date(),
          version: `1.0.${Date.now()}`,
          sampleCount: finalSamples.length,
          qualityScore
        }
      };

      this.datasets.set(`${model}_${taskType}`, dataset);
      return dataset;

    } catch (error) {
      console.error('Dataset generation failed:', error);
      throw new Error(`Failed to generate fine-tuning dataset: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate training input from pattern
   */
  private generateTrainingInput(pattern: UsagePattern): string {
    return `Task: ${pattern.feature}
Action: ${pattern.action}
Context: ${JSON.stringify(pattern.metadata)}
Tokens Used: ${pattern.tokensUsed}
Duration: ${pattern.duration}ms`;
  }

  /**
   * Generate training output from pattern
   */
  private generateTrainingOutput(pattern: UsagePattern, isSuccessful: boolean): string {
    if (isSuccessful) {
      return `SUCCESS: Operation completed successfully
Tokens: ${pattern.tokensUsed}
Duration: ${pattern.duration}ms
Best Practices: Optimize for efficiency, maintain consistency`;
    } else {
      return `ERROR: Operation failed
Error Type: ${pattern.metadata.errorType || 'unknown'}
Tokens: ${pattern.tokensUsed}
Duration: ${pattern.duration}ms
Recommendation: Review error handling, improve reliability`;
    }
  }

  /**
   * Get learning insights
   */
  async getLearningInsights(filters?: {
    type?: LearningInsight['type'];
    category?: LearningInsight['category'];
    minConfidence?: number;
    limit?: number;
  }): Promise<LearningInsight[]> {
    let filtered = [...this.insights];

    if (filters?.type) {
      filtered = filtered.filter(i => i.type === filters.type);
    }

    if (filters?.category) {
      filtered = filtered.filter(i => i.category === filters.category);
    }

    if (filters?.minConfidence !== undefined) {
      const minConfidence = filters.minConfidence;
      filtered = filtered.filter(i => i.confidence >= minConfidence);
    }

    // Sort by confidence and data points
    filtered.sort((a, b) => {
      const scoreA = a.confidence * (a.dataPoints / 100);
      const scoreB = b.confidence * (b.dataPoints / 100);
      return scoreB - scoreA;
    });

    if (filters?.limit) {
      filtered = filtered.slice(0, filters.limit);
    }

    return filtered;
  }

  /**
   * Get model performance summary
   */
  async getModelPerformanceSummary(): Promise<ModelPerformance[]> {
    return Array.from(this.modelPerformance.values());
  }

  /**
   * Generate optimization suggestions
   */
  async generateOptimizationSuggestions(): Promise<Array<{
    model: string;
    suggestion: string;
    expectedImprovement: string;
    implementationEffort: string;
  }>> {
    const suggestions: Array<{
      model: string;
      suggestion: string;
      expectedImprovement: string;
      implementationEffort: string;
    }> = [];

    // Analyze model performance for optimization opportunities
    for (const performance of this.modelPerformance.values()) {
      if (performance.successRate < 0.8) {
        suggestions.push({
          model: performance.model,
          suggestion: `Improve ${performance.taskType} reliability - current success rate is ${(performance.successRate * 100).toFixed(1)}%`,
          expectedImprovement: '15-25% improvement in success rate',
          implementationEffort: 'Medium (2-3 weeks)'
        });
      }

      if (performance.averageTokens > 200) {
        suggestions.push({
          model: performance.model,
          suggestion: `Optimize ${performance.taskType} token usage - currently using ${performance.averageTokens} tokens on average`,
          expectedImprovement: '20-30% reduction in token usage',
          implementationEffort: 'Low (1 week)'
        });
      }

      if (performance.averageLatency > 5000) {
        suggestions.push({
          model: performance.model,
          suggestion: `Improve ${performance.taskType} response time - current latency is ${performance.averageLatency}ms`,
          expectedImprovement: '30-50% reduction in latency',
          implementationEffort: 'Medium (2 weeks)'
        });
      }
    }

    return suggestions;
  }

  /**
   * Export learning data for analysis
   */
  async exportLearningData(format: 'json' | 'csv' = 'json'): Promise<string> {
    try {
      const exportData = {
        patterns: Array.from(this.patterns.entries()).map(([key, patterns]) => ({
          userFeature: key,
          patternCount: patterns.length,
          recentPatterns: patterns.slice(-10) // Last 10 patterns
        })),
        performance: Array.from(this.modelPerformance.entries()),
        insights: this.insights,
        datasets: Array.from(this.datasets.entries()),
        timestamp: new Date().toISOString()
      };

      if (format === 'csv') {
        // Convert to CSV format (simplified)
        return JSON.stringify(exportData, null, 2);
      }

      return JSON.stringify(exportData, null, 2);

    } catch (error) {
      console.error('Data export failed:', error);
      throw new Error(`Failed to export learning data: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Clear old data to prevent memory bloat
   */
  async cleanupOldData(maxAge: number = 30 * 24 * 60 * 60 * 1000): Promise<void> {
    try {
      const cutoffTime = Date.now() - maxAge;

      // Clean old patterns
      for (const [key, patterns] of this.patterns.entries()) {
        const recentPatterns = patterns.filter(p => new Date(p.timestamp).getTime() > cutoffTime);
        if (recentPatterns.length === 0) {
          this.patterns.delete(key);
        } else {
          this.patterns.set(key, recentPatterns);
        }
      }

      // Clean old insights (keep only high-confidence recent ones)
      this.insights = this.insights.filter(insight => {
        const age = Date.now() - (insight as any).timestamp || Date.now();
        return age < maxAge && insight.confidence > 0.6;
      });

      console.log(`Cleaned up old learning data. Remaining: ${this.patterns.size} pattern sets, ${this.insights.length} insights`);

    } catch (error) {
      console.error('Cleanup failed:', error);
    }
  }
}

export default LearningAgentService;

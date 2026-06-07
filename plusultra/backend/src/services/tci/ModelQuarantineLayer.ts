import { TruthConsistencyInterface, TCIModelOutput } from './TruthConsistencyInterface';

/**
 * Enhanced Model Quarantine Layer - Advanced quarantine management with expiration and auditing
 */
export class ModelQuarantineLayer {
  private tci: TruthConsistencyInterface;
  private quarantineThreshold = 0.5; // Reliability score threshold
  private workloadReduction = 0.8; // 80% workload reduction for quarantined models
  private quarantineDuration = 2 * 60 * 60 * 1000; // 2 hours default quarantine duration
  private maxFailuresBeforeQuarantine = 3; // 3+ failures trigger quarantine

  private quarantineHistory = new Map<string, Array<{
    timestamp: Date;
    reason: string;
    reliabilityScore: number;
    action: 'quarantined' | 'released' | 'expired';
  }>>();

  private failureCounters = new Map<string, {
    count: number;
    lastFailure: Date;
    resetTime?: Date;
  }>();

  private activeQuarantines = new Map<string, {
    quarantinedAt: Date;
    expiresAt: Date;
    reason: string;
    originalReliability: number;
  }>();

  private failoverRoutes = new Map<string, string[]>(); // model -> [backup1, backup2]
  private auditLog: Array<{
    timestamp: Date;
    model: string;
    action: string;
    details: any;
  }> = [];

  constructor(tci: TruthConsistencyInterface) {
    this.tci = tci;
    this.initializeFailoverRoutes();
    this.startCleanupTimer();
  }

  /**
   * Initialize failover routes for each model
   */
  private initializeFailoverRoutes(): void {
    this.failoverRoutes.set('gpt-5', ['claude-4.5', 'gemini-2.5']);
    this.failoverRoutes.set('claude-4.5', ['gpt-5', 'gemini-2.5']);
    this.failoverRoutes.set('gemini-2.5', ['gpt-5', 'claude-4.5']);
    this.failoverRoutes.set('deepseek', ['gpt-5', 'claude-4.5']);
  }

  /**
   * Start cleanup timer for expired quarantines
   */
  private startCleanupTimer(): void {
    setInterval(() => {
      this.cleanupExpiredQuarantines();
    }, 60000); // Check every minute
  }

  /**
   * Record a model failure and update counters
   */
  recordFailure(model: string, reason: string, reliabilityScore: number): void {
    const now = new Date();
    const counter = this.failureCounters.get(model) || { count: 0, lastFailure: now };

    counter.count++;
    counter.lastFailure = now;

    // Reset counter if it's been more than 1 hour since last failure
    if (counter.resetTime && now.getTime() - counter.resetTime.getTime() > 60 * 60 * 1000) {
      counter.count = 1;
    }

    this.failureCounters.set(model, counter);

    // Log failure for auditing
    this.logAuditEvent(model, 'FAILURE_RECORDED', {
      failureCount: counter.count,
      reason,
      reliabilityScore,
      timestamp: now
    });

    // Check if model should be quarantined
    if (counter.count >= this.maxFailuresBeforeQuarantine) {
      this.quarantineModel(model, `Persistent failures (${counter.count} failures)`);
    }
  }

  /**
   * Quarantine a model with expiration and reduced workload
   */
  quarantineModel(model: string, reason: string): void {
    const reliability = this.tci.getReliabilityScores()[model] || 1.0;
    const now = new Date();
    const expiresAt = new Date(now.getTime() + this.quarantineDuration);

    // Record quarantine event
    this.activeQuarantines.set(model, {
      quarantinedAt: now,
      expiresAt,
      reason,
      originalReliability: reliability
    });

    // Update history
    const history = this.quarantineHistory.get(model) || [];
    history.push({
      timestamp: now,
      reason,
      reliabilityScore: reliability,
      action: 'quarantined'
    });

    // Keep only last 20 events
    if (history.length > 20) {
      history.splice(0, history.length - 20);
    }
    this.quarantineHistory.set(model, history);

    // Log quarantine event
    this.logAuditEvent(model, 'QUARANTINED', {
      reason,
      reliabilityScore: reliability,
      expiresAt,
      quarantineDuration: this.quarantineDuration
    });

    console.warn(`🚨 Model ${model} quarantined: ${reason} (reliability: ${(reliability * 100).toFixed(1)}%)`);
  }

  /**
   * Release a model from quarantine if reliability improves
   */
  releaseFromQuarantine(model: string, reason: string = 'Reliability improved'): boolean {
    if (!this.activeQuarantines.has(model)) {
      return false; // Not quarantined
    }

    const quarantine = this.activeQuarantines.get(model)!;
    const reliability = this.tci.getReliabilityScores()[model] || 1.0;

    if (reliability >= this.quarantineThreshold) {
      // Remove from active quarantines
      this.activeQuarantines.delete(model);

      // Reset failure counter
      const counter = this.failureCounters.get(model);
      if (counter) {
        counter.count = 0;
        counter.resetTime = new Date();
        this.failureCounters.set(model, counter);
      }

      // Update history
      const history = this.quarantineHistory.get(model) || [];
      history.push({
        timestamp: new Date(),
        reason,
        reliabilityScore: reliability,
        action: 'released'
      });
      this.quarantineHistory.set(model, history);

      // Log release event
      this.logAuditEvent(model, 'RELEASED', {
        reason,
        reliabilityScore: reliability,
        quarantineDuration: Date.now() - quarantine.quarantinedAt.getTime()
      });

      console.log(`✅ Model ${model} released from quarantine (reliability: ${(reliability * 100).toFixed(1)}%)`);
      return true;
    }

    return false;
  }

  /**
   * Check if a model is currently quarantined
   */
  isModelQuarantined(model: string): boolean {
    const quarantine = this.activeQuarantines.get(model);
    if (!quarantine) return false;

    // Check if quarantine has expired
    if (Date.now() > quarantine.expiresAt.getTime()) {
      this.expireQuarantine(model);
      return false;
    }

    return true;
  }

  /**
   * Get alternative models for a quarantined model
   */
  getFailoverModels(primaryModel: string): string[] {
    return this.failoverRoutes.get(primaryModel) || [];
  }

  /**
   * Calculate adjusted workload allocation for quarantined models
   */
  calculateWorkloadAllocation(
    models: string[],
    baseAllocations: Record<string, number>
  ): Record<string, number> {
    const adjusted: Record<string, number> = {};

    for (const model of models) {
      if (this.isModelQuarantined(model)) {
        // Reduce workload by 80% for quarantined models
        adjusted[model] = (baseAllocations[model] || 0) * (1 - this.workloadReduction);
        console.log(`🔽 Reduced workload for quarantined model ${model}: ${adjusted[model].toFixed(2)}`);
      } else {
        adjusted[model] = baseAllocations[model] || 0;
      }
    }

    return adjusted;
  }

  /**
   * Get comprehensive quarantine status
   */
  getQuarantineStatus(model: string): {
    isQuarantined: boolean;
    reliabilityScore: number;
    failureCount: number;
    quarantineInfo?: {
      quarantinedAt: Date;
      expiresAt: Date;
      reason: string;
      timeRemaining: number;
    };
    history: Array<{
      timestamp: Date;
      reason: string;
      reliabilityScore: number;
      action: string;
    }>;
    recommendedActions: string[];
  } {
    const reliability = this.tci.getReliabilityScores()[model] || 1.0;
    const failureCount = this.failureCounters.get(model)?.count || 0;
    const quarantine = this.activeQuarantines.get(model);
    const history = this.quarantineHistory.get(model) || [];

    let quarantineInfo;
    if (quarantine) {
      quarantineInfo = {
        quarantinedAt: quarantine.quarantinedAt,
        expiresAt: quarantine.expiresAt,
        reason: quarantine.reason,
        timeRemaining: Math.max(0, quarantine.expiresAt.getTime() - Date.now())
      };
    }

    return {
      isQuarantined: this.isModelQuarantined(model),
      reliabilityScore: reliability,
      failureCount,
      quarantineInfo,
      history,
      recommendedActions: this.generateRecommendedActions(model, reliability, failureCount)
    };
  }

  /**
   * Generate recommended actions for a model
   */
  private generateRecommendedActions(model: string, reliability: number, failureCount: number): string[] {
    const actions: string[] = [];

    if (reliability < 0.3) {
      actions.push('🚨 Critical: Model may need retraining or replacement');
      actions.push('🔄 Consider removing from production rotation');
    } else if (reliability < 0.5) {
      actions.push('⚠️ Warning: Monitor closely for improvement');
      actions.push('🔧 Check for recent model updates or configuration issues');
    }

    if (failureCount >= this.maxFailuresBeforeQuarantine) {
      actions.push(`📊 ${failureCount} failures detected - quarantine recommended`);
    }

    actions.push(`🎯 Current reliability: ${(reliability * 100).toFixed(1)}%`);
    actions.push(`🎯 Target reliability: ${(this.quarantineThreshold * 100).toFixed(1)}%`);

    return actions;
  }

  /**
   * Expire a quarantine (called when quarantine duration ends)
   */
  private expireQuarantine(model: string): void {
    const quarantine = this.activeQuarantines.get(model);
    if (quarantine) {
      this.activeQuarantines.delete(model);

      // Update history
      const history = this.quarantineHistory.get(model) || [];
      history.push({
        timestamp: new Date(),
        reason: 'Quarantine expired',
        reliabilityScore: this.tci.getReliabilityScores()[model] || 1.0,
        action: 'expired'
      });
      this.quarantineHistory.set(model, history);

      // Log expiration event
      this.logAuditEvent(model, 'QUARANTINE_EXPIRED', {
        quarantineDuration: Date.now() - quarantine.quarantinedAt.getTime(),
        reason: quarantine.reason
      });

      console.log(`⏰ Model ${model} quarantine expired after ${this.quarantineDuration / (60 * 1000)} minutes`);
    }
  }

  /**
   * Cleanup expired quarantines
   */
  private cleanupExpiredQuarantines(): void {
    const now = Date.now();
    const expiredModels: string[] = [];

    for (const [model, quarantine] of this.activeQuarantines.entries()) {
      if (now > quarantine.expiresAt.getTime()) {
        expiredModels.push(model);
      }
    }

    for (const model of expiredModels) {
      this.expireQuarantine(model);
    }

    if (expiredModels.length > 0) {
      console.log(`🧹 Cleaned up ${expiredModels.length} expired quarantines`);
    }
  }

  /**
   * Log audit event
   */
  private logAuditEvent(model: string, action: string, details: any): void {
    const event = {
      timestamp: new Date(),
      model,
      action,
      details
    };

    this.auditLog.push(event);

    // Keep only last 1000 events
    if (this.auditLog.length > 1000) {
      this.auditLog.splice(0, this.auditLog.length - 1000);
    }

    console.log(`📋 Audit: ${model} - ${action}`, details);
  }

  /**
   * Get audit log for a model
   */
  getAuditLog(model?: string, limit: number = 100): Array<{
    timestamp: Date;
    model: string;
    action: string;
    details: any;
  }> {
    let events = this.auditLog;

    if (model) {
      events = events.filter(e => e.model === model);
    }

    return events
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime())
      .slice(0, limit);
  }

  /**
   * Get quarantine statistics
   */
  getQuarantineStats(): {
    totalQuarantines: number;
    activeQuarantines: number;
    averageQuarantineDuration: number;
    modelFailureRates: Record<string, number>;
    recentFailures: number;
  } {
    const now = Date.now();
    const activeQuarantines = this.activeQuarantines.size;

    // Calculate average quarantine duration
    let totalDuration = 0;
    let durationCount = 0;

    for (const quarantine of this.activeQuarantines.values()) {
      totalDuration += now - quarantine.quarantinedAt.getTime();
      durationCount++;
    }

    const averageQuarantineDuration = durationCount > 0 ? totalDuration / durationCount : 0;

    // Calculate failure rates
    const modelFailureRates: Record<string, number> = {};
    for (const [model, counter] of this.failureCounters.entries()) {
      const hoursSinceLastFailure = counter.lastFailure ?
        (now - counter.lastFailure.getTime()) / (60 * 60 * 1000) : 24;
      modelFailureRates[model] = counter.count / Math.max(1, hoursSinceLastFailure);
    }

    // Count recent failures (last hour)
    const oneHourAgo = now - (60 * 60 * 1000);
    const recentFailures = this.auditLog.filter(e =>
      e.action === 'FAILURE_RECORDED' && e.timestamp.getTime() > oneHourAgo
    ).length;

    return {
      totalQuarantines: this.auditLog.filter(e => e.action === 'QUARANTINED').length,
      activeQuarantines,
      averageQuarantineDuration,
      modelFailureRates,
      recentFailures
    };
  }
}

/**
 * Weighted Voting System - Dynamic reliability weights per domain
 * Adjusts model influence based on historical performance and domain expertise
 */
export class WeightedVotingSystem {
  private domainWeights: Record<string, Record<string, number>> = {
    coding: {
      'claude-4.5': 0.45,
      'gpt-5': 0.40,
      'gemini-2.5': 0.35,
      'deepseek': 0.25
    },
    reasoning: {
      'gpt-5': 0.45,
      'claude-4.5': 0.40,
      'gemini-2.5': 0.35,
      'deepseek': 0.25
    },
    facts: {
      'gemini-2.5': 0.45,
      'claude-4.5': 0.40,
      'gpt-5': 0.35,
      'deepseek': 0.25
    },
    efficiency: {
      'deepseek': 0.45,
      'claude-4.5': 0.40,
      'gpt-5': 0.35,
      'gemini-2.5': 0.25
    }
  };

  private dynamicWeights = new Map<string, Record<string, number>>();
  private performanceHistory = new Map<string, Array<{
    timestamp: Date;
    domain: string;
    score: number;
    model: string;
  }>>();

  constructor() {
    this.initializeDynamicWeights();
  }

  /**
   * Initialize dynamic weights with base domain weights
   */
  private initializeDynamicWeights(): void {
    for (const [domain, weights] of Object.entries(this.domainWeights)) {
      this.dynamicWeights.set(domain, { ...weights });
    }
  }

  /**
   * Get current voting weights for a domain
   */
  getDomainWeights(domain: string): Record<string, number> {
    return this.dynamicWeights.get(domain) || {};
  }

  /**
   * Update model performance and adjust weights dynamically
   */
  updatePerformance(model: string, domain: string, score: number): void {
    // Record performance
    const history = this.performanceHistory.get(model) || [];
    history.push({
      timestamp: new Date(),
      domain,
      score,
      model
    });

    // Keep only last 100 records per model
    if (history.length > 100) {
      history.splice(0, history.length - 100);
    }
    this.performanceHistory.set(model, history);

    // Adjust weights based on recent performance
    this.adjustWeightsForModel(model, domain, score);
  }

  /**
   * Adjust weights for a specific model based on recent performance
   */
  private adjustWeightsForModel(model: string, domain: string, latestScore: number): void {
    const currentWeights = this.dynamicWeights.get(domain) || {};
    const baseWeight = this.domainWeights[domain]?.[model] || 0.25;

    // Calculate recent performance trend
    const history = this.performanceHistory.get(model) || [];
    const recentHistory = history.slice(-10); // Last 10 performances

    if (recentHistory.length === 0) return;

    const avgRecentScore = recentHistory.reduce((sum, h) => sum + h.score, 0) / recentHistory.length;

    // Adjust weight based on performance trend
    let adjustment = 0;
    if (avgRecentScore > 0.8) {
      adjustment = 0.1; // Boost high performers
    } else if (avgRecentScore < 0.5) {
      adjustment = -0.1; // Penalize poor performers
    }

    const newWeight = Math.max(0.1, Math.min(0.7, baseWeight + adjustment));
    currentWeights[model] = newWeight;

    // Renormalize weights to sum to 1
    this.renormalizeWeights(domain, currentWeights);

    console.log(`⚖️ Updated ${model} weight for ${domain}: ${newWeight.toFixed(3)} (score: ${latestScore.toFixed(3)})`);
  }

  /**
   * Renormalize weights to ensure they sum to approximately 1
   */
  private renormalizeWeights(domain: string, weights: Record<string, number>): void {
    const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
    if (total === 0) return;

    for (const model in weights) {
      weights[model] /= total;
    }

    this.dynamicWeights.set(domain, weights);
  }

  /**
   * Calculate weighted vote for multiple model outputs
   */
  calculateWeightedVote(
    outputs: TCIModelOutput[],
    domain: string
  ): { model: string; weightedScore: number }[] {
    const domainWeights = this.getDomainWeights(domain);
    const results: { model: string; weightedScore: number }[] = [];

    for (const output of outputs) {
      const baseWeight = domainWeights[output.model] || 0.25;
      const confidenceWeight = output.confidence;
      const weightedScore = baseWeight * confidenceWeight;

      results.push({
        model: output.model,
        weightedScore
      });
    }

    return results.sort((a, b) => b.weightedScore - a.weightedScore);
  }

  /**
   * Get performance statistics for a model
   */
  getModelPerformanceStats(model: string): {
    overallScore: number;
    domainScores: Record<string, number>;
    trend: 'improving' | 'declining' | 'stable';
    recentAverage: number;
  } {
    const history = this.performanceHistory.get(model) || [];

    if (history.length === 0) {
      return {
        overallScore: 0,
        domainScores: {},
        trend: 'stable',
        recentAverage: 0
      };
    }

    // Calculate overall and domain-specific scores
    const domainScoreArrays: Record<string, number[]> = {};
    const recentHistory = history.slice(-20); // Last 20 for trend analysis

    for (const record of history) {
      if (!domainScoreArrays[record.domain]) {
        domainScoreArrays[record.domain] = [];
      }
      domainScoreArrays[record.domain].push(record.score);
    }

    // Average scores per domain
    const domainScores: Record<string, number> = {};
    for (const domain in domainScoreArrays) {
      const scores = domainScoreArrays[domain];
      domainScores[domain] = scores.reduce((a, b) => a + b, 0) / scores.length;
    }

    const overallScore = Object.values(domainScores).reduce((a, b) => a + b, 0) / Object.keys(domainScores).length;
    const recentAverage = recentHistory.reduce((sum, h) => sum + h.score, 0) / recentHistory.length;

    // Determine trend
    const olderAverage = history.slice(0, Math.floor(history.length / 2))
      .reduce((sum, h) => sum + h.score, 0) / Math.floor(history.length / 2);

    let trend: 'improving' | 'declining' | 'stable' = 'stable';
    if (recentAverage > olderAverage * 1.05) trend = 'improving';
    else if (recentAverage < olderAverage * 0.95) trend = 'declining';

    return {
      overallScore,
      domainScores,
      trend,
      recentAverage
    };
  }
}

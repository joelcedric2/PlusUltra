/**
 * Model Quarantine Service - Tracks model failures and auto-quarantines
 * Integrated with TCI for anti-cascade protection
 */
export class ModelQuarantineService {
  private quarantineMap = new Map<string, { until: Date; reason: string; failureCount: number }>();
  private failureHistory = new Map<string, Array<{ timestamp: Date; reason: string; duration: number }>>();

  constructor() {
    // Cleanup expired quarantines every 5 minutes
    setInterval(() => {
      this.cleanupExpiredQuarantines();
    }, 5 * 60 * 1000);
  }

  /**
   * Track model failures and auto-quarantine
   */
  trackModelFailure(modelName: string, reason: string, durationMinutes = 60): void {
    const until = new Date(Date.now() + durationMinutes * 60 * 1000);

    // Update quarantine map
    const existing = this.quarantineMap.get(modelName);
    const failureCount = (existing?.failureCount || 0) + 1;

    this.quarantineMap.set(modelName, {
      until,
      reason,
      failureCount
    });

    // Update failure history
    const history = this.failureHistory.get(modelName) || [];
    history.push({
      timestamp: new Date(),
      reason,
      duration: durationMinutes
    });

    // Keep only last 50 failures per model
    if (history.length > 50) {
      history.splice(0, history.length - 50);
    }
    this.failureHistory.set(modelName, history);

    console.log(`🔄 Quarantined ${modelName} until ${until.toISOString()}: ${reason} (failure #${failureCount})`);
  }

  /**
   * Check if a model is currently quarantined
   */
  isModelQuarantined(modelName: string): boolean {
    const entry = this.quarantineMap.get(modelName);
    if (!entry) return false;

    if (Date.now() > entry.until.getTime()) {
      this.quarantineMap.delete(modelName);
      return false;
    }
    return true;
  }

  /**
   * Get quarantine status for all models
   */
  getQuarantineStatus(): Record<string, any> {
    const status: Record<string, any> = {};
    for (const [model, info] of this.quarantineMap.entries()) {
      status[model] = {
        until: info.until.toISOString(),
        reason: info.reason,
        failureCount: info.failureCount,
        minutesRemaining: Math.ceil((info.until.getTime() - Date.now()) / 60000)
      };
    }
    return status;
  }

  /**
   * Get failure history for a model
   */
  getFailureHistory(modelName: string, limit: number = 20): Array<{
    timestamp: Date;
    reason: string;
    duration: number;
  }> {
    const history = this.failureHistory.get(modelName) || [];
    return history.slice(-limit);
  }

  /**
   * Manually quarantine a model
   */
  quarantineModel(modelName: string, reason: string, durationMinutes: number = 60): void {
    this.trackModelFailure(modelName, reason, durationMinutes);
  }

  /**
   * Release a model from quarantine early
   */
  releaseModel(modelName: string): boolean {
    if (this.quarantineMap.has(modelName)) {
      this.quarantineMap.delete(modelName);
      console.log(`✅ Released ${modelName} from quarantine early`);
      return true;
    }
    return false;
  }

  /**
   * Cleanup expired quarantines
   */
  private cleanupExpiredQuarantines(): void {
    const now = Date.now();
    const expiredModels: string[] = [];

    for (const [model, info] of this.quarantineMap.entries()) {
      if (now > info.until.getTime()) {
        expiredModels.push(model);
      }
    }

    for (const model of expiredModels) {
      this.quarantineMap.delete(model);
      console.log(`⏰ Model ${model} quarantine expired`);
    }

    if (expiredModels.length > 0) {
      console.log(`🧹 Cleaned up ${expiredModels.length} expired quarantines`);
    }
  }

  /**
   * Get quarantine statistics
   */
  getQuarantineStats(): {
    totalQuarantines: number;
    activeQuarantines: number;
    averageQuarantineDuration: number;
    modelFailureRates: Record<string, number>;
  } {
    const now = Date.now();
    const activeQuarantines = this.quarantineMap.size;

    // Calculate average quarantine duration
    let totalDuration = 0;
    let durationCount = 0;

    for (const info of this.quarantineMap.values()) {
      totalDuration += info.until.getTime() - Date.now();
      durationCount++;
    }

    const averageQuarantineDuration = durationCount > 0 ? totalDuration / durationCount : 0;

    // Calculate failure rates (failures per hour)
    const modelFailureRates: Record<string, number> = {};
    for (const [model, history] of this.failureHistory.entries()) {
      const recentHistory = history.slice(-10); // Last 10 failures
      if (recentHistory.length > 0) {
        const oldestFailure = recentHistory[0].timestamp;
        const hoursSinceOldest = (now - oldestFailure.getTime()) / (60 * 60 * 1000);
        modelFailureRates[model] = recentHistory.length / Math.max(1, hoursSinceOldest);
      }
    }

    return {
      totalQuarantines: Array.from(this.failureHistory.values()).reduce((sum, h) => sum + h.length, 0),
      activeQuarantines,
      averageQuarantineDuration,
      modelFailureRates
    };
  }
}

// Initialize global instance
export const quarantineService = new ModelQuarantineService();

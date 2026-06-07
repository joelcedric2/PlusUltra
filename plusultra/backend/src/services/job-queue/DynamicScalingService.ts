import { JobQueueService, QueueMetrics } from './JobQueueService';

export interface ScalingConfig {
  minWorkers: number;
  maxWorkers: number;
  targetQueueDepth: number;
  scaleUpThreshold: number;
  scaleDownThreshold: number;
  scaleUpCooldownMs: number;
  scaleDownCooldownMs: number;
  metricsWindowMs: number;
  enableAutoScaling: boolean;
}

export interface WorkerPool {
  activeWorkers: number;
  lastScaleUp?: Date;
  lastScaleDown?: Date;
  scaleHistory: Array<{
    timestamp: Date;
    action: 'scale_up' | 'scale_down';
    from: number;
    to: number;
    reason: string;
  }>;
}

export class DynamicScalingService {
  private config: ScalingConfig;
  private workerPool: WorkerPool;
  private scalingTimer?: NodeJS.Timeout;
  private jobQueueService: JobQueueService;

  constructor(
    jobQueueService: JobQueueService,
    config?: Partial<ScalingConfig>
  ) {
    this.jobQueueService = jobQueueService;
    this.config = {
      minWorkers: 1,
      maxWorkers: 10,
      targetQueueDepth: 50,
      scaleUpThreshold: 100, // Scale up when queue > 100 jobs
      scaleDownThreshold: 20, // Scale down when queue < 20 jobs
      scaleUpCooldownMs: 300000, // 5 minutes
      scaleDownCooldownMs: 600000, // 10 minutes
      metricsWindowMs: 60000, // 1 minute
      enableAutoScaling: true,
      ...config,
    };

    this.workerPool = {
      activeWorkers: this.config.minWorkers,
      scaleHistory: [],
    };

    if (this.config.enableAutoScaling) {
      this.startAutoScaling();
    }
  }

  /**
   * Start automatic scaling based on queue metrics
   */
  private startAutoScaling(): void {
    this.scalingTimer = setInterval(async () => {
      try {
        await this.evaluateScaling();
      } catch (error: any) {
        console.error('Error in dynamic scaling evaluation', { error: error.message });
      }
    }, this.config.metricsWindowMs);
  }

  /**
   * Evaluate current metrics and determine if scaling is needed
   */
  private async evaluateScaling(): Promise<void> {
    const metrics = await this.jobQueueService.getQueueMetrics();
    if (!metrics) return;

    const currentTime = new Date();
    const { activeWorkers, lastScaleUp, lastScaleDown } = this.workerPool;

    // Check scale up conditions
    if (this.shouldScaleUp(metrics, currentTime)) {
      if (!lastScaleUp || (currentTime.getTime() - lastScaleUp.getTime()) > this.config.scaleUpCooldownMs) {
        await this.scaleUp(metrics);
      }
    }

    // Check scale down conditions
    else if (this.shouldScaleDown(metrics, currentTime)) {
      if (!lastScaleDown || (currentTime.getTime() - lastScaleDown.getTime()) > this.config.scaleDownCooldownMs) {
        await this.scaleDown(metrics);
      }
    }
  }

  /**
   * Determine if scaling up is needed
   */
  private shouldScaleUp(metrics: QueueMetrics, currentTime: Date): boolean {
    if (this.workerPool.activeWorkers >= this.config.maxWorkers) return false;

    // Scale up if queue depth is high
    if (metrics.pendingJobs > this.config.scaleUpThreshold) return true;

    // Scale up if processing is slow and queue is growing
    if (metrics.queueDepthTrend === 'increasing' && metrics.pendingJobs > this.config.targetQueueDepth) {
      return true;
    }

    // Scale up if oldest job has been waiting too long
    if (metrics.oldestPendingJob) {
      const waitTime = currentTime.getTime() - metrics.oldestPendingJob.getTime();
      if (waitTime > 300000) { // 5 minutes
        return true;
      }
    }

    return false;
  }

  /**
   * Determine if scaling down is needed
   */
  private shouldScaleDown(metrics: QueueMetrics, currentTime: Date): boolean {
    if (this.workerPool.activeWorkers <= this.config.minWorkers) return false;

    // Scale down if queue is very low and stable
    if (metrics.pendingJobs < this.config.scaleDownThreshold && metrics.queueDepthTrend === 'stable') {
      return true;
    }

    // Scale down if no jobs for extended period
    if (metrics.totalJobs === 0 && metrics.throughputPerHour === 0) {
      return true;
    }

    return false;
  }

  /**
   * Scale up worker pool
   */
  private async scaleUp(metrics: QueueMetrics): Promise<void> {
    const previousWorkers = this.workerPool.activeWorkers;
    const newWorkers = Math.min(previousWorkers + 1, this.config.maxWorkers);

    this.workerPool.activeWorkers = newWorkers;
    this.workerPool.lastScaleUp = new Date();

    this.workerPool.scaleHistory.push({
      timestamp: new Date(),
      action: 'scale_up',
      from: previousWorkers,
      to: newWorkers,
      reason: `Queue depth ${metrics.pendingJobs} > threshold ${this.config.scaleUpThreshold}`,
    });

    console.log(`🔼 Scaled up worker pool: ${previousWorkers} → ${newWorkers} (Queue: ${metrics.pendingJobs})`);

    // TODO: Actually spawn new worker processes/threads
    await this.spawnWorkers(newWorkers - previousWorkers);
  }

  /**
   * Scale down worker pool
   */
  private async scaleDown(metrics: QueueMetrics): Promise<void> {
    const previousWorkers = this.workerPool.activeWorkers;
    const newWorkers = Math.max(previousWorkers - 1, this.config.minWorkers);

    this.workerPool.activeWorkers = newWorkers;
    this.workerPool.lastScaleDown = new Date();

    this.workerPool.scaleHistory.push({
      timestamp: new Date(),
      action: 'scale_down',
      from: previousWorkers,
      to: newWorkers,
      reason: `Queue depth ${metrics.pendingJobs} < threshold ${this.config.scaleDownThreshold}`,
    });

    console.log(`🔽 Scaled down worker pool: ${previousWorkers} → ${newWorkers} (Queue: ${metrics.pendingJobs})`);

    // TODO: Actually terminate worker processes/threads
    await this.terminateWorkers(previousWorkers - newWorkers);
  }

  /**
   * Spawn new worker processes (placeholder implementation)
   */
  private async spawnWorkers(count: number): Promise<void> {
    console.log(`🚀 Would spawn ${count} new worker processes`);
    // TODO: Implement actual worker spawning
    // This could involve:
    // - Starting new Node.js processes
    // - Creating new threads
    // - Spinning up containers
    // - Using serverless functions
  }

  /**
   * Terminate worker processes (placeholder implementation)
   */
  private async terminateWorkers(count: number): Promise<void> {
    console.log(`🛑 Would terminate ${count} worker processes`);
    // TODO: Implement actual worker termination
    // This should gracefully shutdown workers without losing jobs
  }

  /**
   * Get current worker pool status
   */
  getWorkerPoolStatus(): WorkerPool & { config: ScalingConfig } {
    return {
      ...this.workerPool,
      config: this.config,
    };
  }

  /**
   * Get scaling recommendations without applying them
   */
  async getScalingRecommendation(): Promise<{
    recommendedAction: 'scale_up' | 'scale_down' | 'no_change';
    currentWorkers: number;
    recommendedWorkers: number;
    reason: string;
    confidence: number; // 0-100
  }> {
    const metrics = await this.jobQueueService.getQueueMetrics();
    if (!metrics) {
      return {
        recommendedAction: 'no_change',
        currentWorkers: this.workerPool.activeWorkers,
        recommendedWorkers: this.workerPool.activeWorkers,
        reason: 'No metrics available',
        confidence: 0,
      };
    }

    const currentTime = new Date();
    const { activeWorkers } = this.workerPool;

    // Analyze conditions
    if (this.shouldScaleUp(metrics, currentTime)) {
      const targetWorkers = Math.min(activeWorkers + 1, this.config.maxWorkers);
      return {
        recommendedAction: 'scale_up',
        currentWorkers: activeWorkers,
        recommendedWorkers: targetWorkers,
        reason: `Queue depth ${metrics.pendingJobs} exceeds threshold ${this.config.scaleUpThreshold}`,
        confidence: Math.min(100, (metrics.pendingJobs / this.config.scaleUpThreshold) * 100),
      };
    }

    if (this.shouldScaleDown(metrics, currentTime)) {
      const targetWorkers = Math.max(activeWorkers - 1, this.config.minWorkers);
      return {
        recommendedAction: 'scale_down',
        currentWorkers: activeWorkers,
        recommendedWorkers: targetWorkers,
        reason: `Queue depth ${metrics.pendingJobs} below threshold ${this.config.scaleDownThreshold}`,
        confidence: Math.min(100, (this.config.scaleDownThreshold / metrics.pendingJobs) * 100),
      };
    }

    return {
      recommendedAction: 'no_change',
      currentWorkers: activeWorkers,
      recommendedWorkers: activeWorkers,
      reason: `Queue depth ${metrics.pendingJobs} within acceptable range`,
      confidence: 100,
    };
  }

  /**
   * Stop automatic scaling
   */
  stopAutoScaling(): void {
    if (this.scalingTimer) {
      clearInterval(this.scalingTimer);
      this.scalingTimer = undefined;
    }
  }

  /**
   * Manually scale workers (for administrative control)
   */
  async manualScale(targetWorkers: number, reason: string = 'Manual scaling'): Promise<boolean> {
    const currentWorkers = this.workerPool.activeWorkers;

    if (targetWorkers < this.config.minWorkers || targetWorkers > this.config.maxWorkers) {
      throw new Error(`Target workers ${targetWorkers} outside range [${this.config.minWorkers}, ${this.config.maxWorkers}]`);
    }

    if (targetWorkers > currentWorkers) {
      // Scale up
      const workersToAdd = targetWorkers - currentWorkers;
      await this.spawnWorkers(workersToAdd);
    } else if (targetWorkers < currentWorkers) {
      // Scale down
      const workersToRemove = currentWorkers - targetWorkers;
      await this.terminateWorkers(workersToRemove);
    }

    this.workerPool.activeWorkers = targetWorkers;
    this.workerPool.scaleHistory.push({
      timestamp: new Date(),
      action: targetWorkers > currentWorkers ? 'scale_up' : 'scale_down',
      from: currentWorkers,
      to: targetWorkers,
      reason,
    });

    console.log(`🔧 Manual scaling: ${currentWorkers} → ${targetWorkers} (${reason})`);
    return true;
  }
}

import { PrismaClient, Prisma } from '@prisma/client';

// Stub for sendEmail - should be imported from email service
async function sendEmail(to: string, subject: string, text: string, html: string): Promise<void> {
  console.log(`[Email] To: ${to}, Subject: ${subject}`);
}

export type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled' | 'retrying';

export type JobPriority = 'low' | 'normal' | 'high' | 'critical';

export interface JobDefinition {
  id?: string;
  type: string;
  data: Record<string, any>;
  priority: JobPriority;
  status: JobStatus;
  maxRetries: number;
  retryCount: number;
  scheduledAt?: Date;
  startedAt?: Date;
  completedAt?: Date;
  failedAt?: Date;
  error?: string;
  result?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
  lockedUntil?: Date;
  lockedBy?: string;
  metadata?: Record<string, any>;
}

export interface JobQueueConfig {
  enableDatabasePersistence: boolean;
  enableRedisQueue: boolean;
  maxConcurrentJobs: number;
  defaultMaxRetries: number;
  defaultJobTimeout: number; // in milliseconds
  retryDelayMs: number;
  maxRetryDelayMs: number;
  heartbeatIntervalMs: number;
  stuckJobTimeoutMs: number;
  enableJobCleanup: boolean;
  jobRetentionDays: number;
}

export interface QueueMetrics {
  totalJobs: number;
  pendingJobs: number;
  processingJobs: number;
  completedJobs: number;
  failedJobs: number;
  cancelledJobs: number;
  deadLetterJobs: number;
  avgProcessingTime: number;
  throughputPerHour: number;
  oldestPendingJob?: Date;
  queueDepthTrend: 'increasing' | 'decreasing' | 'stable';
}

export interface QueueAlert {
  id: string;
  type: 'queue_depth' | 'processing_delay' | 'failure_rate' | 'dead_letter';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  threshold: number;
  currentValue: number;
  createdAt: Date;
  resolvedAt?: Date;
  resolved: boolean;
}

export interface QueueMonitoringConfig {
  enableAlerts: boolean;
  alertThresholds: {
    maxQueueDepth: number;
    maxProcessingDelay: number; // in milliseconds
    maxFailureRate: number; // percentage
    maxDeadLetterCount: number;
  };
  alertChannels: {
    email?: string[];
    slack?: string;
    webhook?: string;
  };
  monitoringInterval: number; // in milliseconds
}

export interface QueueJobOptions {
  priority?: JobPriority;
  maxRetries?: number;
  delay?: number; // delay in milliseconds before job becomes available
  timeout?: number; // job timeout in milliseconds
  metadata?: Record<string, any>;
}

export interface JobProgressUpdate {
  jobId: string;
  progress: number; // 0-100
  message?: string;
  metadata?: Record<string, any>;
}

export class JobQueueService {
  private prisma: PrismaClient;
  private config: JobQueueConfig;
  private activeJobs = new Map<string, NodeJS.Timeout>();
  private isProcessing = false;
  private monitoringConfig?: QueueMonitoringConfig;
  private currentMetrics?: QueueMetrics;
  private activeAlerts = new Map<string, QueueAlert>();
  private monitoringTimer?: NodeJS.Timeout;

  constructor(
    private readonly prismaService: any,
    private readonly logger: any,
    config?: Partial<JobQueueConfig>,
    monitoringConfig?: Partial<QueueMonitoringConfig>
  ) {
    this.prisma = prismaService.getClient();
    this.config = {
      enableDatabasePersistence: true,
      enableRedisQueue: false, // Using database-based queue for simplicity
      maxConcurrentJobs: 5,
      defaultMaxRetries: 3,
      defaultJobTimeout: 300000, // 5 minutes
      retryDelayMs: 1000,
      maxRetryDelayMs: 60000, // 1 minute
      heartbeatIntervalMs: 30000, // 30 seconds
      stuckJobTimeoutMs: 300000, // 5 minutes
      enableJobCleanup: true,
      jobRetentionDays: 30,
      ...config,
    };

    // Set up monitoring configuration
    this.monitoringConfig = {
      enableAlerts: true,
      alertThresholds: {
        maxQueueDepth: 100,
        maxProcessingDelay: 600000, // 10 minutes
        maxFailureRate: 10, // 10% failure rate
        maxDeadLetterCount: 50,
      },
      alertChannels: {
        email: process.env.QUEUE_ALERT_EMAIL?.split(','),
        slack: process.env.QUEUE_ALERT_SLACK_WEBHOOK,
        webhook: process.env.QUEUE_ALERT_WEBHOOK,
      },
      monitoringInterval: 60000, // 1 minute
      ...monitoringConfig,
    };

    // Start monitoring if enabled
    if (this.monitoringConfig.enableAlerts) {
      this.startMonitoring();
    }
  }

  /**
   * Add a job to the queue
   */
  async addJob(
    type: string,
    data: Record<string, any>,
    options: QueueJobOptions = {}
  ): Promise<string> {
    const jobId = `job_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    try {
      const scheduledAt = options.delay
        ? new Date(Date.now() + options.delay)
        : new Date();

      const job: JobDefinition = {
        id: jobId,
        type,
        data,
        priority: options.priority || 'normal',
        status: 'pending',
        maxRetries: options.maxRetries || this.config.defaultMaxRetries,
        retryCount: 0,
        scheduledAt,
        createdAt: new Date(),
        updatedAt: new Date(),
        metadata: options.metadata,
      };

      if (this.config.enableDatabasePersistence) {
        await this.storeJob(job);
      }

      this.logger.info('Job added to queue', {
        jobId,
        type,
        priority: job.priority,
        scheduledAt,
      });

      // Start processing if not already running
      if (!this.isProcessing) {
        this.startProcessing();
      }

      return jobId;
    } catch (error: any) {
      this.logger.error('Failed to add job to queue', {
        jobId,
        type,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Process jobs from the queue
   */
  async processJobs(jobType?: string, handler?: (data: Record<string, any>) => Promise<any>): Promise<void> {
    if (this.isProcessing) {
      this.logger.warn('Job processing already running');
      return;
    }

    this.startProcessing(jobType, handler);
  }

  /**
   * Get job status and details
   */
  async getJobStatus(jobId: string): Promise<JobDefinition | null> {
    try {
      if (this.config.enableDatabasePersistence) {
        const job = await this.prisma.jobQueue.findUnique({
          where: { id: jobId },
        });

        if (!job) return null;

        return {
          id: job.id,
          type: job.type,
          data: job.data as Record<string, any>,
          priority: job.priority as JobPriority,
          status: job.status as JobStatus,
          maxRetries: job.maxRetries,
          retryCount: job.retryCount,
          scheduledAt: job.scheduledAt || undefined,
          startedAt: job.startedAt || undefined,
          completedAt: job.completedAt || undefined,
          failedAt: job.failedAt || undefined,
          error: job.error || undefined,
          result: job.result as Record<string, any> || undefined,
          createdAt: job.createdAt,
          updatedAt: job.updatedAt,
          lockedUntil: job.lockedUntil || undefined,
          lockedBy: job.lockedBy || undefined,
          metadata: job.metadata as Record<string, any> || undefined,
        };
      }

      return null;
    } catch (error: any) {
      this.logger.error('Failed to get job status', {
        jobId,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Update job progress
   */
  async updateJobProgress(update: JobProgressUpdate): Promise<void> {
    try {
      if (this.config.enableDatabasePersistence) {
        await this.prisma.jobQueue.update({
          where: { id: update.jobId },
          data: {
            updatedAt: new Date(),
            metadata: {
              progress: update.progress,
              progressMessage: update.message,
              ...update.metadata,
            },
          },
        });
      }

      this.logger.debug('Job progress updated', {
        jobId: update.jobId,
        progress: update.progress,
        message: update.message,
      });
    } catch (error: any) {
      this.logger.error('Failed to update job progress', {
        jobId: update.jobId,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Cancel a job
   */
  async cancelJob(jobId: string): Promise<boolean> {
    try {
      if (this.config.enableDatabasePersistence) {
        const result = await this.prisma.jobQueue.updateMany({
          where: {
            id: jobId,
            status: { in: ['pending', 'processing'] },
          },
          data: {
            status: 'cancelled',
            updatedAt: new Date(),
          },
        });

        if (result.count > 0) {
          // Remove from active jobs if present
          if (this.activeJobs.has(jobId)) {
            clearTimeout(this.activeJobs.get(jobId)!);
            this.activeJobs.delete(jobId);
          }

          this.logger.info('Job cancelled', { jobId });
          return true;
        }
      }

      return false;
    } catch (error: any) {
      this.logger.error('Failed to cancel job', {
        jobId,
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Get queue statistics
   */
  async getQueueStats(): Promise<{
    totalJobs: number;
    pendingJobs: number;
    processingJobs: number;
    completedJobs: number;
    failedJobs: number;
    cancelledJobs: number;
    avgProcessingTime: number;
  }> {
    try {
      if (this.config.enableDatabasePersistence) {
        const stats = await this.prisma.jobQueue.groupBy({
          by: ['status'],
          _count: { id: true },
          where: {
            createdAt: {
              gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
            },
          },
        });

        const statusCounts = stats.reduce((acc: Record<string, number>, stat: any) => {
          acc[stat.status] = stat._count.id;
          return acc;
        }, {} as Record<string, number>);

        // Calculate average processing time for completed jobs
        const completedJobs = await this.prisma.jobQueue.findMany({
          where: {
            status: 'completed',
            startedAt: { not: null },
            completedAt: { not: null },
          },
          select: {
            startedAt: true,
            completedAt: true,
          },
          take: 100,
        });

        const avgProcessingTime = completedJobs.length > 0
          ? completedJobs.reduce((acc: number, job: any) => {
              if (job.startedAt && job.completedAt) {
                return acc + (job.completedAt.getTime() - job.startedAt.getTime());
              }
              return acc;
            }, 0) / completedJobs.length
          : 0;

        return {
          totalJobs: (Object.values(statusCounts) as number[]).reduce((a: number, b: number) => a + b, 0),
          pendingJobs: statusCounts.pending || 0,
          processingJobs: statusCounts.processing || 0,
          completedJobs: statusCounts.completed || 0,
          failedJobs: statusCounts.failed || 0,
          cancelledJobs: statusCounts.cancelled || 0,
          avgProcessingTime,
        };
      }

      return {
        totalJobs: 0,
        pendingJobs: 0,
        processingJobs: 0,
        completedJobs: 0,
        failedJobs: 0,
        cancelledJobs: 0,
        avgProcessingTime: 0,
      };
    } catch (error: any) {
      this.logger.error('Failed to get queue statistics', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Clean up old completed/failed jobs
   */
  async cleanupOldJobs(): Promise<number> {
    try {
      if (!this.config.enableJobCleanup) return 0;

      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.jobRetentionDays);

      const result = await this.prisma.jobQueue.deleteMany({
        where: {
          status: { in: ['completed', 'failed', 'cancelled'] },
          updatedAt: {
            lt: cutoffDate,
          },
        },
      });

      this.logger.info(`Cleaned up ${result.count} old jobs`);
      return result.count;
    } catch (error: any) {
      this.logger.error('Failed to cleanup old jobs', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Start processing jobs from the queue
   */
  private async startProcessing(jobType?: string, handler?: (data: Record<string, any>) => Promise<any>): Promise<void> {
    if (this.isProcessing) return;

    this.isProcessing = true;
    this.logger.info('Starting job processing');

    // Set up periodic cleanup
    setInterval(() => {
      this.cleanupOldJobs().catch(error => {
        this.logger.error('Failed to cleanup old jobs', { error: error.message });
      });
    }, 24 * 60 * 60 * 1000); // Daily cleanup

    while (this.isProcessing) {
      try {
        await this.processNextBatch(jobType, handler);
        await new Promise(resolve => setTimeout(resolve, 1000)); // Brief pause between batches
      } catch (error: any) {
        this.logger.error('Error in job processing loop', {
          error: error.message,
          stack: error.stack,
        });
        await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds on error
      }
    }
  }

  /**
   * Process the next batch of jobs
   */
  private async processNextBatch(jobType?: string, handler?: (data: Record<string, any>) => Promise<any>): Promise<void> {
    if (!this.config.enableDatabasePersistence) return;

    // Find available jobs
    const availableJobs = await this.prisma.jobQueue.findMany({
      where: {
        status: 'pending',
        scheduledAt: { lte: new Date() },
        ...(jobType && { type: jobType }),
      },
      orderBy: [
        { priority: 'desc' }, // Higher priority first
        { createdAt: 'asc' }, // Then by creation time
      ],
      take: this.config.maxConcurrentJobs,
    });

    if (availableJobs.length === 0) return;

    // Process jobs concurrently
    const promises = availableJobs.map((job: any) => this.processJob(job, handler));
    await Promise.allSettled(promises);
  }

  /**
   * Process a single job
   */
  private async processJob(job: any, handler?: (data: Record<string, any>) => Promise<any>): Promise<void> {
    const jobId = job.id;

    try {
      // Mark job as processing
      await this.prisma.jobQueue.update({
        where: { id: jobId },
        data: {
          status: 'processing',
          startedAt: new Date(),
          lockedUntil: new Date(Date.now() + this.config.defaultJobTimeout),
          lockedBy: 'worker',
          updatedAt: new Date(),
        },
      });

      // Set up timeout
      const timeout = setTimeout(async () => {
        await this.failJob(jobId, 'Job timeout');
        this.activeJobs.delete(jobId);
      }, this.config.defaultJobTimeout);

      this.activeJobs.set(jobId, timeout);

      this.logger.info('Processing job', { jobId, type: job.type });

      // Execute the job
      let result;
      if (handler) {
        result = await handler(job.data);
      } else {
        result = await this.executeJobHandler(job.type, job.data);
      }

      // Mark as completed
      await this.completeJob(jobId, result);
      this.logger.info('Job completed successfully', { jobId });

    } catch (error: any) {
      await this.failJob(jobId, error.message);

      // Retry if retries remaining
      const jobStatus = await this.getJobStatus(jobId);
      if (jobStatus && jobStatus.retryCount < jobStatus.maxRetries) {
        await this.retryJob(jobId);
      }
    } finally {
      // Clean up timeout
      if (this.activeJobs.has(jobId)) {
        clearTimeout(this.activeJobs.get(jobId)!);
        this.activeJobs.delete(jobId);
      }
    }
  }

  /**
   * Execute job handler (default implementation)
   */
  private async executeJobHandler(type: string, data: Record<string, any>): Promise<any> {
    // Default handler - override in subclasses or provide custom handlers
    this.logger.warn('No handler provided for job type', { type, data });
    return { message: 'Job processed without specific handler' };
  }

  /**
   * Complete a job successfully
   */
  private async completeJob(jobId: string, result: any): Promise<void> {
    if (this.config.enableDatabasePersistence) {
      await this.prisma.jobQueue.update({
        where: { id: jobId },
        data: {
          status: 'completed',
          completedAt: new Date(),
          result,
          updatedAt: new Date(),
        },
      });
    }
  }

  /**
   * Fail a job
   */
  private async failJob(jobId: string, error: string): Promise<void> {
    if (this.config.enableDatabasePersistence) {
      await this.prisma.jobQueue.update({
        where: { id: jobId },
        data: {
          status: 'failed',
          failedAt: new Date(),
          error,
          updatedAt: new Date(),
        },
      });
    }

    this.logger.error('Job failed', { jobId, error });
  }

  /**
   * Retry a failed job
   */
  private async retryJob(jobId: string): Promise<void> {
    if (this.config.enableDatabasePersistence) {
      const job = await this.getJobStatus(jobId);
      if (!job) return;

      const nextRetryAt = new Date(Date.now() + this.calculateRetryDelay(job.retryCount));

      await this.prisma.jobQueue.update({
        where: { id: jobId },
        data: {
          status: 'pending',
          retryCount: job.retryCount + 1,
          scheduledAt: nextRetryAt,
          error: null,
          updatedAt: new Date(),
        },
      });

      this.logger.info('Job scheduled for retry', {
        jobId,
        retryCount: job.retryCount + 1,
        nextRetryAt,
      });
    }
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  private calculateRetryDelay(retryCount: number): number {
    const delay = this.config.retryDelayMs * Math.pow(2, retryCount);
    return Math.min(delay, this.config.maxRetryDelayMs);
  }

  /**
   * Store job in database
   */
  private async storeJob(job: JobDefinition): Promise<void> {
    await this.prisma.jobQueue.create({
      data: {
        id: job.id!,
        type: job.type,
        data: job.data,
        priority: job.priority,
        status: job.status,
        maxRetries: job.maxRetries,
        retryCount: job.retryCount,
        scheduledAt: job.scheduledAt,
        createdAt: job.createdAt,
        updatedAt: job.updatedAt,
        metadata: job.metadata,
      },
    });
  }

  /**
   * Start monitoring queue metrics and alerting
   */
  private startMonitoring(): void {
    this.monitoringTimer = setInterval(async () => {
      try {
        await this.collectMetrics();
        await this.checkAlerts();
      } catch (error: any) {
        this.logger.error('Error in queue monitoring', { error: error.message });
      }
    }, this.monitoringConfig!.monitoringInterval);
  }

  /**
   * Collect current queue metrics
   */
  private async collectMetrics(): Promise<void> {
    try {
      if (!this.config.enableDatabasePersistence) return;

      const now = new Date();
      const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);

      // Get basic job counts
      const stats = await this.prisma.jobQueue.groupBy({
        by: ['status'],
        _count: { id: true },
        where: {
          createdAt: {
            gte: new Date(Date.now() - 24 * 60 * 60 * 1000), // Last 24 hours
          },
        },
      });

      const statusCounts = stats.reduce((acc: Record<string, number>, stat: any) => {
        acc[stat.status] = stat._count.id;
        return acc;
      }, {} as Record<string, number>);

      // Get dead letter queue count (jobs that failed max retries)
      const deadLetterCount = await this.prisma.jobQueue.count({
        where: {
          status: 'failed',
          retryCount: { gte: 3 }, // Assuming maxRetries = 3
          updatedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          },
        },
      });

      // Get oldest pending job
      const oldestPendingJob = await this.prisma.jobQueue.findFirst({
        where: { status: 'pending' },
        orderBy: { createdAt: 'asc' },
        select: { createdAt: true },
      });

      // Calculate average processing time
      const completedJobs = await this.prisma.jobQueue.findMany({
        where: {
          status: 'completed',
          startedAt: { not: null },
          completedAt: { not: null },
          updatedAt: {
            gte: oneHourAgo,
          },
        },
        select: {
          startedAt: true,
          completedAt: true,
        },
        take: 100,
      });

      const avgProcessingTime = completedJobs.length > 0
        ? completedJobs.reduce((acc: number, job: any) => {
            if (job.startedAt && job.completedAt) {
              return acc + (job.completedAt.getTime() - job.startedAt.getTime());
            }
            return acc;
          }, 0) / completedJobs.length
        : 0;

      // Calculate throughput (jobs per hour)
      const throughputPerHour = completedJobs.length;

      // Determine queue depth trend
      const previousMetrics = this.currentMetrics;
      let queueDepthTrend: 'increasing' | 'decreasing' | 'stable' = 'stable';
      if (previousMetrics) {
        const currentPending = statusCounts.pending || 0;
        const previousPending = previousMetrics.pendingJobs;
        if (currentPending > previousPending * 1.1) {
          queueDepthTrend = 'increasing';
        } else if (currentPending < previousPending * 0.9) {
          queueDepthTrend = 'decreasing';
        }
      }

      this.currentMetrics = {
        totalJobs: (Object.values(statusCounts) as number[]).reduce((a, b) => a + b, 0),
        pendingJobs: statusCounts.pending || 0,
        processingJobs: statusCounts.processing || 0,
        completedJobs: statusCounts.completed || 0,
        failedJobs: statusCounts.failed || 0,
        cancelledJobs: statusCounts.cancelled || 0,
        deadLetterJobs: deadLetterCount,
        avgProcessingTime,
        throughputPerHour,
        oldestPendingJob: oldestPendingJob?.createdAt,
        queueDepthTrend,
      };

    } catch (error: any) {
      this.logger.error('Failed to collect queue metrics', { error: error.message });
    }
  }

  /**
   * Check for alert conditions and trigger alerts
   */
  private async checkAlerts(): Promise<void> {
    if (!this.monitoringConfig?.enableAlerts || !this.currentMetrics) return;

    const thresholds = this.monitoringConfig.alertThresholds;
    const metrics = this.currentMetrics;

    // Check queue depth alert
    if (metrics.pendingJobs > thresholds.maxQueueDepth) {
      await this.triggerAlert({
        type: 'queue_depth',
        severity: metrics.pendingJobs > thresholds.maxQueueDepth * 2 ? 'critical' : 'high',
        message: `Queue depth (${metrics.pendingJobs}) exceeds threshold (${thresholds.maxQueueDepth})`,
        threshold: thresholds.maxQueueDepth,
        currentValue: metrics.pendingJobs,
      });
    }

    // Check processing delay alert
    if (metrics.oldestPendingJob) {
      const processingDelay = Date.now() - metrics.oldestPendingJob.getTime();
      if (processingDelay > thresholds.maxProcessingDelay) {
        await this.triggerAlert({
          type: 'processing_delay',
          severity: processingDelay > thresholds.maxProcessingDelay * 2 ? 'critical' : 'high',
          message: `Oldest pending job has been waiting for ${Math.round(processingDelay / 60000)} minutes`,
          threshold: thresholds.maxProcessingDelay,
          currentValue: processingDelay,
        });
      }
    }

    // Check failure rate alert
    const totalJobs = metrics.totalJobs;
    const failureRate = totalJobs > 0 ? (metrics.failedJobs / totalJobs) * 100 : 0;
    if (failureRate > thresholds.maxFailureRate) {
      await this.triggerAlert({
        type: 'failure_rate',
        severity: failureRate > thresholds.maxFailureRate * 2 ? 'critical' : 'medium',
        message: `Failure rate (${failureRate.toFixed(1)}%) exceeds threshold (${thresholds.maxFailureRate}%)`,
        threshold: thresholds.maxFailureRate,
        currentValue: failureRate,
      });
    }

    // Check dead letter queue alert
    if (metrics.deadLetterJobs > thresholds.maxDeadLetterCount) {
      await this.triggerAlert({
        type: 'dead_letter',
        severity: 'medium',
        message: `Dead letter queue count (${metrics.deadLetterJobs}) exceeds threshold (${thresholds.maxDeadLetterCount})`,
        threshold: thresholds.maxDeadLetterCount,
        currentValue: metrics.deadLetterJobs,
      });
    }
  }

  /**
   * Trigger an alert via configured channels
   */
  private async triggerAlert(alertData: Omit<QueueAlert, 'id' | 'createdAt' | 'resolvedAt' | 'resolved'>): Promise<void> {
    const alert: QueueAlert = {
      id: `alert_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      ...alertData,
      createdAt: new Date(),
      resolved: false,
    };

    this.activeAlerts.set(alert.id, alert);

    // Send alert via configured channels
    await this.sendAlert(alert);

    this.logger.warn('Queue alert triggered', {
      alertId: alert.id,
      type: alert.type,
      severity: alert.severity,
      message: alert.message,
    });
  }

  /**
   * Send alert via configured channels
   */
  private async sendAlert(alert: QueueAlert): Promise<void> {
    const channels = this.monitoringConfig!.alertChannels;

    try {
      // Email alerts
      if (channels.email && channels.email.length > 0) {
        await this.sendEmailAlert(alert, channels.email);
      }

      // Slack alerts
      if (channels.slack) {
        await this.sendSlackAlert(alert, channels.slack);
      }

      // Webhook alerts
      if (channels.webhook) {
        await this.sendWebhookAlert(alert, channels.webhook);
      }
    } catch (error: any) {
      this.logger.error('Failed to send queue alert', {
        alertId: alert.id,
        error: error.message,
      });
    }
  }

  /**
   * Send email alert (placeholder implementation)
   */
  private async sendEmailAlert(alert: QueueAlert, emails: string[]): Promise<void> {
    try {
      const subject = `[PlusUltra Job Queue Alert] ${alert.severity.toUpperCase()}: ${alert.type}`;
      const html = `
        <p><strong>Severity:</strong> ${alert.severity.toUpperCase()}</p>
        <p><strong>Type:</strong> ${alert.type}</p>
        <p><strong>Message:</strong> ${alert.message}</p>
        <p><strong>Threshold:</strong> ${alert.threshold}</p>
        <p><strong>Current Value:</strong> ${alert.currentValue}</p>
        <p><strong>Timestamp:</strong> ${alert.createdAt.toISOString()}</p>
      `;
      await sendEmail(emails.join(', '), subject, html, html);
      this.logger.info('Email alert sent', { alertId: alert.id, emails });
    } catch (error: any) {
      this.logger.error('Failed to send email alert', { alertId: alert.id, error: error.message });
      throw error;
    }
  }

  /**
   * Send Slack alert (placeholder implementation)
   */
  private async sendSlackAlert(alert: QueueAlert, webhookUrl: string): Promise<void> {
    try {
      const slackMessage = {
        text: `[PlusUltra Job Queue Alert] ${alert.severity.toUpperCase()}: ${alert.message}`,
        attachments: [
          {
            color: alert.severity === 'critical' ? '#E02B2B' : alert.severity === 'high' ? '#FFCC00' : '#439FE0',
            fields: [
              { title: 'Type', value: alert.type, short: true },
              { title: 'Severity', value: alert.severity.toUpperCase(), short: true },
              { title: 'Threshold', value: alert.threshold.toString(), short: true },
              { title: 'Current Value', value: alert.currentValue.toString(), short: true },
              { title: 'Timestamp', value: alert.createdAt.toISOString(), short: false },
            ],
          },
        ],
      };

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slackMessage),
      });

      if (!response.ok) {
        throw new Error(`Slack API error: ${response.status} ${response.statusText}`);
      }

      this.logger.info('Slack alert sent', { alertId: alert.id, webhookUrl });
    } catch (error: any) {
      this.logger.error('Failed to send Slack alert', { alertId: alert.id, error: error.message });
      throw error;
    }
  }

  /**
   * Send webhook alert (placeholder implementation)
   */
  private async sendWebhookAlert(alert: QueueAlert, webhookUrl: string): Promise<void> {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(alert),
      });

      if (!response.ok) {
        throw new Error(`Webhook API error: ${response.status} ${response.statusText}`);
      }

      this.logger.info('Webhook alert sent', { alertId: alert.id, webhookUrl });
    } catch (error: any) {
      this.logger.error('Failed to send webhook alert', { alertId: alert.id, error: error.message });
      throw error;
    }
  }

  /**
   * Get current queue metrics
   */
  async getQueueMetrics(): Promise<QueueMetrics | null> {
    return this.currentMetrics || null;
  }

  /**
   * Get active alerts
   */
  async getActiveAlerts(): Promise<QueueAlert[]> {
    return Array.from(this.activeAlerts.values());
  }

  /**
   * Resolve an alert
   */
  async resolveAlert(alertId: string): Promise<boolean> {
    const alert = this.activeAlerts.get(alertId);
    if (alert) {
      alert.resolved = true;
      alert.resolvedAt = new Date();
      this.activeAlerts.delete(alertId);
      this.logger.info('Alert resolved', { alertId });
      return true;
    }
    return false;
  }

  /**
   * Move a failed job to dead letter queue
   */
  async moveToDeadLetterQueue(jobId: string, reason: string): Promise<boolean> {
    try {
      if (!this.config.enableDatabasePersistence) return false;

      // Get the job details before moving
      const job = await this.prisma.jobQueue.findUnique({
        where: { id: jobId }
      });

      if (!job) return false;

      // Move to dead letter queue (create separate record or mark as dead letter)
      await this.prisma.jobQueue.update({
        where: { id: jobId },
        data: {
          status: 'dead_letter',
          errorMessage: reason,
          updatedAt: new Date(),
        }
      });

      // Log the dead letter job for analysis
      this.logger.warn('Job moved to dead letter queue', {
        jobId,
        jobType: job.type,
        reason,
        retryCount: job.retryCount,
        originalError: job.errorMessage
      });

      return true;
    } catch (error: any) {
      this.logger.error('Failed to move job to dead letter queue', {
        jobId,
        error: error.message
      });
      return false;
    }
  }

  /**
   * Get dead letter queue jobs for analysis
   */
  async getDeadLetterJobs(limit: number = 100): Promise<any[]> {
    try {
      if (!this.config.enableDatabasePersistence) return [];

      const deadLetterJobs = await this.prisma.jobQueue.findMany({
        where: {
          status: 'dead_letter',
          updatedAt: {
            gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000), // Last 7 days
          },
        },
        orderBy: { updatedAt: 'desc' },
        take: limit,
      });

      return deadLetterJobs.map((job: any) => ({
        id: job.id,
        jobType: job.type,
        reason: job.errorMessage,
        retryCount: job.retryCount,
        originalError: job.errorMessage,
        movedAt: job.updatedAt,
        metadata: job.metadata,
      }));
    } catch (error: any) {
      this.logger.error('Failed to retrieve dead letter jobs', { error: error.message });
      return [];
    }
  }

  /**
   * Analyze dead letter queue patterns for system improvements
   */
  async analyzeDeadLetterPatterns(): Promise<{
    commonErrors: Array<{ error: string; count: number; percentage: number }>;
    commonJobTypes: Array<{ jobType: string; count: number; percentage: number }>;
    timeBasedPatterns: Array<{ hour: number; count: number }>;
    recommendations: string[];
  }> {
    try {
      if (!this.config.enableDatabasePersistence) {
        return {
          commonErrors: [],
          commonJobTypes: [],
          timeBasedPatterns: [],
          recommendations: []
        };
      }

      // Get dead letter jobs from last 30 days
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const deadLetterJobs = await this.prisma.jobQueue.findMany({
        where: {
          status: 'dead_letter',
          updatedAt: { gte: thirtyDaysAgo },
        },
        select: {
          type: true,
          errorMessage: true,
          updatedAt: true,
        },
      });

      // Analyze error patterns
      const errorCounts = new Map<string, number>();
      const jobTypeCounts = new Map<string, number>();
      const hourCounts = new Map<number, number>();

      for (const job of deadLetterJobs) {
        // Count errors
        const error = job.errorMessage || 'Unknown error';
        errorCounts.set(error, (errorCounts.get(error) || 0) + 1);

        // Count job types
        jobTypeCounts.set(job.type, (jobTypeCounts.get(job.type) || 0) + 1);

        // Count by hour
        const hour = job.updatedAt.getHours();
        hourCounts.set(hour, (hourCounts.get(hour) || 0) + 1);
      }

      // Convert to arrays and calculate percentages
      const totalJobs = deadLetterJobs.length;

      const commonErrors = Array.from(errorCounts.entries())
        .map(([error, count]) => ({
          error,
          count,
          percentage: Math.round((count / totalJobs) * 100)
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      const commonJobTypes = Array.from(jobTypeCounts.entries())
        .map(([jobType, count]) => ({
          jobType,
          count,
          percentage: Math.round((count / totalJobs) * 100)
        }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10);

      const timeBasedPatterns = Array.from(hourCounts.entries())
        .map(([hour, count]) => ({ hour, count }))
        .sort((a, b) => b.count - a.count);

      // Generate recommendations
      const recommendations: string[] = [];

      if (commonErrors.length > 0 && commonErrors[0].percentage > 50) {
        recommendations.push(`High concentration of "${commonErrors[0].error}" errors (${commonErrors[0].percentage}%) - investigate root cause`);
      }

      if (commonJobTypes.length > 0 && commonJobTypes[0].percentage > 40) {
        recommendations.push(`Job type "${commonJobTypes[0].jobType}" failing frequently (${commonJobTypes[0].percentage}%) - consider retry strategy improvements`);
      }

      if (timeBasedPatterns.length > 0) {
        const peakHour = timeBasedPatterns[0];
        recommendations.push(`Peak failure hour is ${peakHour.hour}:00 with ${peakHour.count} failures - check system load during this time`);
      }

      if (totalJobs > 100) {
        recommendations.push(`High volume of dead letter jobs (${totalJobs} in 30 days) - review error handling and retry strategies`);
      }

      return {
        commonErrors,
        commonJobTypes,
        timeBasedPatterns,
        recommendations,
      };
    } catch (error: any) {
      this.logger.error('Failed to analyze dead letter patterns', { error: error.message });
      return {
        commonErrors: [],
        commonJobTypes: [],
        timeBasedPatterns: [],
        recommendations: ['Error analyzing patterns - check logs for details']
      };
    }
  }

  /**
   * Clean up old dead letter jobs
   */
  async cleanupDeadLetterJobs(olderThanDays: number = 90): Promise<number> {
    try {
      if (!this.config.enableDatabasePersistence) return 0;

      const cutoffDate = new Date(Date.now() - olderThanDays * 24 * 60 * 60 * 1000);

      const result = await this.prisma.jobQueue.deleteMany({
        where: {
          status: 'dead_letter',
          updatedAt: { lt: cutoffDate },
        },
      });

      this.logger.info(`Cleaned up ${result.count} old dead letter jobs`);
      return result.count;
    } catch (error: any) {
      this.logger.error('Failed to cleanup dead letter jobs', { error: error.message });
      return 0;
    }
  }
}

export default JobQueueService;

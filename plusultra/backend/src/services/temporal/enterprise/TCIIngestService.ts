import { v4 as uuidv4 } from 'uuid';
import { PrismaClient } from '@prisma/client';
import { VectorDatabaseService } from '../../vector/VectorDatabase';
import { AuditLogger } from '../../audit/AuditLogger';
import { JobQueueService } from '../../job-queue/JobQueueService';

/**
 * Interface for interacting with the Temporal Graph Database
 */
export interface ITemporalGraphDB {
  storeChange(change: ITCIChange, intent: ITCIIntent): Promise<void>;
  storeBatchIntent(intent: ITCIIntent, changeIds: string[]): Promise<void>;
  storeIntent(intent: ITCIIntent): Promise<void>;
  linkIntentToChange(changeId: string, intentId: string): Promise<void>;
  linkCIResultsToChange(changeId: string, pipelineId: string): Promise<void>;
  storeTestRun(testRun: ITestRun): Promise<void>;
  storePerformanceMetrics(metrics: IPerformanceMetrics): Promise<void>;
  linkDeploymentToChange(changeId: string, deploymentId: string): Promise<void>;
  storeDeployment(deployment: IDeployment): Promise<void>;
  getChange(id: string): Promise<ITCIChange | null>;
  getIntent(id: string): Promise<ITCIIntent | null>;
  findSimilarChanges(change: ITCIChange, limit: number): Promise<Array<{
    change: ITCIChange;
    intent: ITCIIntent;
    similarity: number;
  }>>;
}

/**
 * Represents a test run result
 */
export interface ITestRun {
  id: string;
  test_name: string;
  status: string;
  duration: number;
  output?: string;
  artifact_ref?: string;
  metadata?: Record<string, any>;
}

/**
 * Represents performance metrics for a change
 */
export interface IPerformanceMetrics {
  id: string;
  metrics: Record<string, number>;
  artifact_ref?: string;
  metadata: Record<string, any>;
};

/**
 * Represents deployment information
 */
export interface IDeployment {
  id: string;
  environment: string;
  status: 'success' | 'failure' | 'rollback';
  metrics: Record<string, number>;
  artifact_ref: string;
  incidents?: Array<{
    type: string;
    severity: string;
    description: string;
  }>;
  metadata: Record<string, any>;
}

/**
 * Represents a TCI envelope containing change and intent information
 */
export interface ITCIEnvelope {
  agent: string;
  action: string;
  intent: string;
  rationale: string;
  confidence: number;
  output_diff: string;
  artifact_ref?: string;
  tests_to_run?: string[];
  metadata?: Record<string, any>;
}

/**
 * Represents a change in the temporal code intelligence system
 */
export interface ITCIChange {
  id: string;
  author: string;
  timestamp: Date;
  diff: string;
  artifact_ref?: string;
  intent_id: string;
  agents_involved: string[];
  metadata: Record<string, any>;
}

/**
 * Represents an intent behind a code change
 */
export interface ITCIIntent {
  id: string;
  taxonomy_id?: string;
  free_text: string;
  rationales: string[];
  confidence: number;
  agent_id?: string;
  human_id?: string;
  metadata: Record<string, any>;
}

/**
 * Context information for TCI operations
 */
interface ITCIContext {
  userId?: string;
  sessionId?: string;
  workspaceId?: string;
  ipAddress?: string;
  userAgent?: string;
  batchOperationId?: string;
  batchIndex?: number;
  batchTotal?: number;
}

/**
 * Service for ingesting Temporal Code Intelligence data
 */
export class TCIIngestService {
  private prisma: PrismaClient;
  private readonly logger: any;

  constructor(
    private readonly winstonLogger: any,
    private readonly configService: any,
    private readonly moduleRef: any,
    private readonly vectorDB: VectorDatabaseService,
    private readonly auditLogger: AuditLogger,
    private readonly jobQueue: JobQueueService,
    private readonly temporalDB: ITemporalGraphDB,
    private readonly embeddingService: any,
    private readonly prismaService: any
  ) {
    this.logger = winstonLogger.child({ component: 'TCIIngestService' });
    this.prisma = prismaService.getClient();
  }

  /**
   * Get the service configuration with defaults
   */
  private getConfig() {
    const defaultConfig = {
      minConfidence: 0.5,
      maxBatchSize: 100,
      defaultPageSize: 50,
      enableVectorSearch: true,
      defaultEmbeddingModel: 'text-embedding-3-large',
      maxRetries: 3,
      initialRetryDelay: 1000,
      maxRetryDelay: 10000,
      enableAuditLogging: true,
      enablePerformanceMetrics: true,
    };

    return {
      ...defaultConfig,
      ...this.configService.get('tci', {}),
    };
  }

  /**
   * Validates the TCI envelope data
   * @param envelope The envelope to validate
   * @throws {Error} If validation fails
   */
  private validateEnvelope(envelope: ITCIEnvelope): void {
    const requiredFields = ['agent', 'action', 'intent', 'rationale', 'output_diff'] as const;
    const missingFields = requiredFields.filter(field => !envelope[field]);

    if (missingFields.length > 0) {
      throw new Error(`Missing required fields: ${missingFields.join(', ')}`);
    }

    if (envelope.confidence < 0 || envelope.confidence > 1) {
      throw new Error('Confidence must be between 0 and 1');
    }

    if (envelope.metadata && typeof envelope.metadata !== 'object') {
      throw new Error('Metadata must be an object');
    }
  }

  /**
   * Creates a new intent from an envelope
   * @param envelope The source envelope
   * @param context The operation context
   */
  private async createIntent(
    envelope: ITCIEnvelope,
    context: ITCIContext
  ): Promise<ITCIIntent> {
    const intent: ITCIIntent = {
      id: `intent_${uuidv4()}`,
      free_text: envelope.intent,
      rationales: [envelope.rationale],
      confidence: envelope.confidence,
      agent_id: envelope.agent,
      human_id: context.userId,
      metadata: {
        ...envelope.metadata,
        source: 'tci-ingest',
        workspace_id: context.workspaceId,
        ip_address: context.ipAddress,
        user_agent: context.userAgent,
      },
    };

    return intent;
  }

  /**
   * Creates a new change from an envelope and intent
   * @param envelope The source envelope
   * @param intent The associated intent
   * @param context The operation context
   */
  private async createChange(
    envelope: ITCIEnvelope,
    intent: ITCIIntent,
    context: ITCIContext
  ): Promise<ITCIChange> {
    const change: ITCIChange = {
      id: `change_${uuidv4()}`,
      author: envelope.agent || `user:${context.userId || 'anonymous'}`,
      timestamp: new Date(),
      diff: envelope.output_diff,
      artifact_ref: envelope.artifact_ref,
      intent_id: intent.id,
      agents_involved: envelope.agent ? [envelope.agent] : [],
      metadata: {
        ...envelope.metadata,
        action: envelope.action,
        tests_to_run: envelope.tests_to_run,
        workspace_id: context.workspaceId,
        source: 'tci-ingest',
        ip_address: context.ipAddress,
        user_agent: context.userAgent,
      },
    };

    return change;
  }

  /**
   * Ingests a structured TCI envelope from AI agents or human actions
   * with comprehensive validation and error handling.
   */
  async ingestEnvelope(
    envelope: ITCIEnvelope,
    context: ITCIContext = {}
  ): Promise<{ change: ITCIChange; intent: ITCIIntent }> {
    const operationId = `ingest_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const startTime = Date.now();

    this.logger.info('Starting TCI envelope ingestion', {
      operationId,
      agent: envelope.agent,
      action: envelope.action,
      ...context
    });

    try {
      // 1. Validate the envelope
      this.validateEnvelope(envelope);

      // 2. Create intent and change objects
      const intent = await this.createIntent(envelope, context);
      const change = await this.createChange(envelope, intent, context);

      // 3. Store in temporal graph (transactional)
      await this.executeWithRetry(
        () => this.temporalDB.storeChange(change, intent),
        'storeChange',
        this.getConfig().maxRetries,
        this.getConfig().initialRetryDelay
      );

      // 4. Store in vector DB (async)
      if (this.getConfig().enableVectorSearch) {
        this.storeVectorEmbeddings(change, intent, context).catch(error => {
          this.logger.error('Failed to store vector embeddings', {
            operationId,
            error: error.message,
            changeId: change.id,
            intentId: intent.id,
          });
        });
      }

      // 5. Log the successful ingestion
      await this.auditLogger.log({
        event_type: 'tci_envelope_ingested',
        resource_type: 'change',
        resourceId: change.id,
        action: 'create',
        userId: context.userId,
        agent: envelope.agent,
        metadata: {
          operationId,
          durationMs: Date.now() - startTime,
          intentId: intent.id,
          changeType: envelope.action,
          ...context,
        },
      });

      this.logger.info('Successfully ingested TCI envelope', {
        operationId,
        changeId: change.id,
        intentId: intent.id,
        durationMs: Date.now() - startTime,
      });

      return { change, intent };
    } catch (error: any) {
      const errorId = `err_${Date.now()}`;
      const errorDetails = {
        operationId,
        errorId,
        error: error.message,
        stack: error.stack,
        envelope: JSON.stringify(envelope, null, 2),
        context,
        durationMs: Date.now() - startTime,
      };

      this.logger.error('Failed to ingest TCI envelope', errorDetails);

      await this.auditLogger.log({
        event_type: 'tci_ingest_failed',
        resource_type: 'change',
        resourceId: errorId,
        action: 'create',
        userId: context.userId,
        agent: envelope.agent,
        metadata: errorDetails,
      });

      throw new Error(
        `Failed to ingest TCI envelope (${errorId}): ${error.message}`
      );
    }
  }

  /**
   * Ingests multiple envelopes as a batch operation
   */
  async ingestBatch(
    envelopes: ITCIEnvelope[],
    context: ITCIContext = {}
  ): Promise<{ changes: ITCIChange[]; intents: ITCIIntent[] }> {
    const operationId = `batch_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const startTime = Date.now();
    const batchSize = envelopes.length;

    this.logger.info('Starting batch TCI ingestion', {
      operationId,
      batchSize,
      ...context
    });

    try {
      // Validate batch size
      const maxBatchSize = this.getConfig().maxBatchSize;
      if (batchSize > maxBatchSize) {
        throw new Error(`Batch size ${batchSize} exceeds maximum allowed size of ${maxBatchSize}`);
      }

      // Process each envelope in sequence to maintain order
      const results = [];
      for (let index = 0; index < envelopes.length; index++) {
        const envelope = envelopes[index];
        try {
          const result = await this.ingestEnvelope(envelope, {
            ...context,
            batchOperationId: operationId,
            batchIndex: index,
            batchTotal: batchSize,
          });
          results.push(result);
        } catch (error: any) {
          this.logger.error('Failed to process envelope in batch', {
            operationId,
            batchIndex: index,
            error: error.message,
            envelopeId: envelope.metadata?.id || 'unknown',
          });
          throw error; // Fail fast on any error
        }
      }

      // Extract changes and intents from results
      const changes = results.map(r => r.change);
      const intents = results.map(r => r.intent);

      // Log successful batch completion
      await this.auditLogger.log({
        event_type: 'tci_batch_ingested',
        resource_type: 'batch',
        resourceId: operationId,
        action: 'create',
        userId: context.userId,
        metadata: {
          operationId,
          batchSize,
          changeIds: changes.map(c => c.id),
          intentIds: intents.map(i => i.id),
          durationMs: Date.now() - startTime,
          ...context,
        },
      });

      return { changes, intents };
    } catch (error: any) {
      const errorId = `batch_err_${Date.now()}`;
      this.logger.error('Batch TCI ingestion failed', {
        operationId,
        errorId,
        error: error.message,
        stack: error.stack,
        batchSize,
        durationMs: Date.now() - startTime,
      });

      throw new Error(
        `Failed to process batch (${errorId}): ${error.message}`
      );
    }
  }

  /**
   * Ingest human intent capture (when users explain their changes)
   */
  async captureHumanIntent(changeId: string, intent: {
    description: string;
    rationale: string;
    confidence?: number;
  }, userId: string): Promise<void> {
    const humanIntent: ITCIIntent = {
      id: uuidv4(),
      free_text: intent.description,
      rationales: [intent.rationale],
      confidence: intent.confidence || 0.8,
      human_id: userId,
      metadata: {
        capture_method: 'human_input',
        change_id: changeId
      }
    };

    await this.temporalDB.storeIntent(humanIntent);

    // Link human intent to existing change
    await this.temporalDB.linkIntentToChange(changeId, humanIntent.id);
  }

  /**
   * Ingest CI/CD pipeline results
   */
  async ingestCIPipelineResults(
    results: {
      pipelineId: string;
      status: 'success' | 'failure' | 'partial';
      testResults?: Array<{
        testName: string;
        status: 'passed' | 'failed' | 'skipped';
        duration: number;
        output?: string;
      }>;
      performanceMetrics?: Record<string, number>;
      artifactRef?: string;
    },
    context: {
      branch?: string;
      environment?: string;
      changeIds?: string[];
      workspaceId?: string;
      userId?: string;
    }
  ): Promise<void> {
    const operationId = `ci_ingest_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const startTime = Date.now();

    this.logger.info('Processing CI test results', {
      operationId,
      pipelineId: results.pipelineId,
      testCount: results.testResults?.length || 0,
      hasMetrics: !!results.performanceMetrics,
      ...context
    });

    try {
      // Delegate to private methods to reduce complexity
      await this.processTestResults(results, context);
      await this.processPerformanceMetrics(results, context);
      await this.linkCIResultsToChanges(results.pipelineId, context.changeIds);

      this.logger.info('Successfully processed CI test results', {
        operationId,
        pipelineId: results.pipelineId,
        testCount: results.testResults?.length || 0,
        changeCount: context.changeIds?.length || 0,
        durationMs: Date.now() - startTime
      });

    } catch (error: any) {
      this.logger.error('Failed to process CI test results', {
        operationId,
        pipelineId: results.pipelineId,
        error: error.message,
        stack: error.stack,
        durationMs: Date.now() - startTime
      });

      // Re-throw to be handled by the caller
      throw error;
    }
  }

  /**
   * Ingest deployment outcomes
   */
  async ingestDeployment(deployment: {
    environment: string;
    status: 'success' | 'failure' | 'rollback';
    metrics: Record<string, number>;
    incidents?: Array<{
      type: string;
      severity: string;
      description: string;
    }>;
    artifactRef: string;
  }, context: {
    changeIds: string[];
    branch?: string;
    environment?: string;
    userId?: string;
    workspaceId?: string;
  } = { changeIds: [] }): Promise<void> {
    const operationId = `deployment_ingest_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const startTime = Date.now();

    this.logger.info('Processing deployment results', {
      operationId,
      environment: deployment.environment,
      status: deployment.status,
      changeCount: context.changeIds?.length || 0
    });

    try {
      const deploymentId = `deployment_${uuidv4()}`;

      await this.temporalDB.storeDeployment({
        id: deploymentId,
        environment: deployment.environment,
        status: deployment.status,
        metrics: deployment.metrics,
        artifact_ref: deployment.artifactRef,
        incidents: deployment.incidents,
        metadata: {
          timestamp: new Date()
        }
      });

      // Link deployment to changes
      for (const changeId of context.changeIds) {
        await this.temporalDB.linkDeploymentToChange(changeId, deploymentId);
      }

      this.logger.info('Successfully processed deployment results', {
        operationId,
        deploymentId,
        environment: deployment.environment,
        status: deployment.status,
        changeCount: context.changeIds?.length || 0,
        durationMs: Date.now() - startTime
      });

    } catch (error: any) {
      this.logger.error('Failed to process deployment results', {
        operationId,
        environment: deployment.environment,
        error: error.message,
        stack: error.stack,
        durationMs: Date.now() - startTime
      });

      throw error;
    }
  }

  // Private helper methods

  private async processTestResults(results: any, context: any): Promise<void> {
    if (!results.testResults || !Array.isArray(results.testResults)) {
      return;
    }

    for (const testResult of results.testResults) {
      await this.executeWithRetry(
        () => this.temporalDB.storeTestRun({
          id: `test_${uuidv4()}`,
          test_name: testResult.testName,
          status: testResult.status,
          duration: testResult.duration,
          output: testResult.output,
          artifact_ref: results.artifactRef,
          metadata: {
            pipeline_id: results.pipelineId,
            branch: context.branch,
            environment: context.environment,
            timestamp: new Date().toISOString()
          }
        }),
        'storeTestRun',
        this.getConfig().maxRetries,
        this.getConfig().initialRetryDelay
      );
    }
  }

  private async processPerformanceMetrics(results: any, context: any): Promise<void> {
    if (!results.performanceMetrics || Object.keys(results.performanceMetrics).length === 0) {
      return;
    }

    await this.executeWithRetry(
      () => this.temporalDB.storePerformanceMetrics({
        id: `metrics_${uuidv4()}`,
        metrics: results.performanceMetrics!,
        artifact_ref: results.artifactRef,
        metadata: {
          pipeline_id: results.pipelineId,
          branch: context.branch,
          environment: context.environment,
          timestamp: new Date().toISOString()
        }
      }),
      'storePerformanceMetrics',
      this.getConfig().maxRetries,
      this.getConfig().initialRetryDelay
    );
  }

  private async linkCIResultsToChanges(pipelineId: string, changeIds?: string[]): Promise<void> {
    if (!changeIds || changeIds.length === 0) {
      return;
    }

    const linkPromises = changeIds.map(changeId =>
      this.executeWithRetry(
        () => this.temporalDB.linkCIResultsToChange(changeId, pipelineId),
        'linkCIResultsToChange',
        this.getConfig().maxRetries,
        this.getConfig().initialRetryDelay
      ).catch(error => {
        this.logger.error('Failed to link CI result to change', {
          pipelineId,
          changeId,
          error: error.message
        });
      })
    );
    await Promise.all(linkPromises);
  }

  private generateEmbeddingText(change: ITCIChange, intent: ITCIIntent): string {
    return `
      Change: ${change.metadata.action}
      Intent: ${intent.free_text}
      Rationale: ${intent.rationales.join(' ')}
      Agent: ${change.agents_involved.join(', ')}
      Confidence: ${intent.confidence}
      Author: ${change.author}
      Diff: ${change.diff.substring(0, 500)}
    `.trim();
  }

  private async generateEmbeddings(text: string): Promise<number[]> {
    // Use OpenAI embeddings or similar service
    // This would integrate with your embedding service
    return new Array(1536).fill(0); // Placeholder for 1536-dimensional embeddings
  }

  /**
   * Executes an operation with retry logic
   */
  private async executeWithRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    maxRetries: number = 3,
    initialDelayMs: number = 1000
  ): Promise<T> {
    let lastError: Error | null = null;
    let attempt = 0;

    while (attempt <= maxRetries) {
      try {
        return await operation();
      } catch (error: any) {
        lastError = error as Error;
        attempt++;

        if (attempt > maxRetries) {
          break;
        }

        // Calculate delay with exponential backoff and jitter
        const backoff = Math.min(
          initialDelayMs * Math.pow(2, attempt - 1) + Math.random() * 1000,
          this.getConfig().maxRetryDelay
        );

        this.logger.warn(`Retry ${attempt}/${maxRetries} for ${operationName}`, {
          error: error.message,
          stack: error.stack,
          attempt,
          nextRetryInMs: backoff
        });

        await new Promise(resolve => setTimeout(resolve, backoff));
      }
    }

    throw new Error(
      `Operation ${operationName} failed after ${maxRetries} attempts: ${lastError?.message}`
    );
  }

  /**
   * Stores vector embeddings for a change and its intent
   */
  private async storeVectorEmbeddings(
    change: ITCIChange,
    intent: ITCIIntent,
    context: ITCIContext
  ): Promise<void> {
    if (!this.getConfig().enableVectorSearch) {
      return;
    }

    const operationId = `embed_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const startTime = Date.now();

    try {
      // Generate embedding text
      const embeddingText = this.generateEmbeddingText(change, intent);

      // Generate the embedding vector
      const vector = await this.embeddingService.generateEmbedding(embeddingText);

      // Prepare metadata
      const metadata = {
        type: 'pattern' as const,
        change_id: change.id,
        intent_id: intent.id,
        action: change.metadata?.action,
        agent: change.agents_involved[0],
        workspace_id: context.workspaceId,
        timestamp: new Date().toISOString(),
        ...(change.artifact_ref && { artifact_ref: change.artifact_ref })
      };

      // Store in vector DB
      await this.vectorDB.storeDocument({
        id: `change:${change.id}`,
        content: embeddingText,
        metadata: {
          ...metadata,
          content: embeddingText
        }
      });

      this.logger.debug('Stored vector embedding', {
        operationId,
        changeId: change.id,
        intentId: intent.id,
        vectorDimensions: vector.length,
        durationMs: Date.now() - startTime
      });

    } catch (error: any) {
      this.logger.error('Failed to store vector embeddings', {
        operationId,
        changeId: change.id,
        intentId: intent.id,
        error: error.message,
        stack: error.stack,
        durationMs: Date.now() - startTime
      });

      // Don't fail the main operation, just log the error
      throw error;
    }
  }

  /**
   * Ingest CI/CD pipeline results (method signature matches route expectations)
   */
  async ingestCIResults(
    results: {
      pipelineId: string;
      status: 'success' | 'failure' | 'partial';
      testResults?: Array<{
        testName: string;
        status: 'passed' | 'failed' | 'skipped';
        duration: number;
        output?: string;
      }>;
      performanceMetrics?: Record<string, number>;
      artifactRef?: string;
    },
    context: {
      changeIds: string[];
      branch?: string;
      environment?: string;
      workspaceId?: string;
      userId?: string;
    }
  ): Promise<void> {
    return this.ingestCIPipelineResults(results, context);
  }
}

export default TCIIngestService;

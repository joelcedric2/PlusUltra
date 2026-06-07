import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import TCIIngestService from '../services/temporal/enterprise/TCIIngestService';
import TCISimulationService from '../services/temporal/enterprise/TCISimulationService';
import TCIPredictionService from '../services/temporal/enterprise/TCIPredictionService';
import TCIGovernanceService from '../services/temporal/enterprise/TCIGovernanceService';
import { v4 as uuidv4 } from 'uuid';

/**
 * Augment the FastifyInstance interface to include our decorated TCI services.
 * This tells TypeScript that these properties exist on the server instance.
 */
declare module 'fastify' {
  interface FastifyInstance {
    tciIngest: TCIIngestService;
    tciSimulation: TCISimulationService;
    tciPrediction: TCIPredictionService;
    tciGovernance: TCIGovernanceService;
  }
}

/**
 * Augment the FastifyInstance interface to include our decorated TCI services.
 * This tells TypeScript that these properties exist on the server instance.
 */
declare module 'fastify' {
  interface FastifyInstance {
    tciIngest: TCIIngestService;
    tciSimulation: TCISimulationService;
    tciPrediction: TCIPredictionService;
    tciGovernance: TCIGovernanceService;
  }
}

// Type definitions for request/response
type IngestEnvelopeRequest = {
  agent: string;
  action: string;
  intent: string;
  rationale: string;
  confidence: number;
  output_diff: string;
  artifact_ref?: string;
  tests_to_run?: string[];
  metadata?: Record<string, any>;
};

type IngestBatchRequest = {
  envelopes: IngestEnvelopeRequest[];
  batchIntent?: string;
};

type SimulationRequest = {
  changes: Array<{
    changeId?: string;
    diff?: string;
    filePath?: string;
    description: string;
  }>;
  fidelity: 'static' | 'hybrid' | 'full';
  context?: {
    baseBranch?: string;
    targetBranch?: string;
    environment?: string;
    testSuite?: string[];
  };
  options?: {
    maxRuntime?: number;
    maxCost?: number;
    priority?: 'low' | 'medium' | 'high';
  };
};

type PredictionRequest = {
  changeId: string;
  context?: {
    filePaths?: string[];
    branch?: string;
    environment?: string;
    teamSize?: number;
    projectAge?: number;
  };
  predictionTypes?: Array<'regression_risk' | 'performance' | 'review_time' | 'deployment_risk' | 'security_risk'>;
};

type GovernancePolicyRequest = {
  name: string;
  description: string;
  rules: Array<{
    condition: string;
    action: 'block' | 'require_approval' | 'notify' | 'log';
    severity: 'low' | 'medium' | 'high';
    message?: string;
  }>;
  scope: 'global' | 'workspace' | 'repository';
  enabled: boolean;
};

type ComplianceReportRequest = {
  workspaceId: string;
  reportType: 'SOC2' | 'GDPR' | 'SOX' | 'custom';
  dateRange: {
    start: string;
    end: string;
  };
};

type HumanIntentRequest = {
  changeId: string;
  intent: {
    description: string;
    rationale: string;
    confidence?: number;
  };
};

type CIResultsRequest = {
  pipelineId: string;
  status: 'success' | 'failure' | 'partial';
  testResults: Array<{
    testName: string;
    status: string;
    duration: number;
    output?: string;
  }>;
  performanceMetrics?: Record<string, number>;
  artifactRef?: string;
};

type DeploymentRequest = {
  environment: string;
  status: 'success' | 'failure' | 'rollback';
  metrics: Record<string, number>;
  incidents?: Array<{
    type: string;
    severity: string;
    description: string;
  }>;
  artifactRef: string;
};

type QueryParams = {
  userId?: string;
  sessionId?: string;
  workspaceId?: string;
};

// Error response type
interface ErrorResponse {
  error: string;
  code: string;
  requestId: string;
  timestamp: string;
  details?: any;
}

// Success response type
interface SuccessResponse<T = any> {
  success: true;
  data: T;
  requestId: string;
  timestamp: string;
}

// Helper function to create consistent error responses
const createErrorResponse = (
  reply: FastifyReply,
  error: Error,
  statusCode: number = 500,
  code: string = 'INTERNAL_SERVER_ERROR'
) => {
  const requestId = uuidv4();
  const timestamp = new Date().toISOString();

  const errorResponse: ErrorResponse = {
    error: error.message || 'An unexpected error occurred',
    code,
    requestId,
    timestamp
  };

  // Log the error with request ID for debugging
  console.error(`[${timestamp}] [${requestId}] Error:`, error);

  return reply.status(statusCode).send(errorResponse);
};

// Helper function to create consistent success responses
const createSuccessResponse = <T>(
  reply: FastifyReply,
  data: T,
  statusCode: number = 200
) => {
  const response: SuccessResponse<T> = {
    success: true,
    data,
    requestId: uuidv4(),
    timestamp: new Date().toISOString()
  };

  return reply.status(statusCode).send(response);
};

// TCI Ingestion endpoints

// Ingest single envelope
const ingestEnvelope = async (
  request: FastifyRequest<{ Body: IngestEnvelopeRequest; Querystring: QueryParams }>,
  reply: FastifyReply
) => {
  try {
    const envelope = request.body;
    const context = request.query;

    const { change } = await request.server.tciIngest.ingestEnvelope(envelope, context);

    return createSuccessResponse(reply, {
      changeId: change.id,
      message: 'TCI envelope ingested successfully'
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Ingestion failed'),
      400,
      'INGESTION_FAILED'
    );
  }
};

// Ingest batch envelopes
const ingestBatch = async (
  request: FastifyRequest<{ Body: IngestBatchRequest; Querystring: QueryParams }>,
  reply: FastifyReply
) => {
  try {
    const { envelopes, batchIntent } = request.body;
    const context = request.query;

    const { changes }: { changes: { id: string }[] } = await request.server.tciIngest.ingestBatch(envelopes, context as any);

    return createSuccessResponse(reply, {
      changeIds: changes.map((c) => c.id),
      count: changes.length,
      message: 'Batch ingestion completed'
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Batch ingestion failed'),
      400,
      'BATCH_INGESTION_FAILED'
    );
  }
};

// TCI Simulation endpoints

// Create simulation
const createSimulation = async (
  request: FastifyRequest<{ Body: SimulationRequest; Querystring: { userId: string } }>,
  reply: FastifyReply
) => {
  try {
    const simulationRequest = request.body;
    const { userId } = request.query;

    const simulationId = await request.server.tciSimulation.createSimulation(simulationRequest, userId);

    return createSuccessResponse(reply, {
      simulationId,
      message: 'Simulation queued successfully'
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Simulation creation failed'),
      400,
      'SIMULATION_CREATION_FAILED'
    );
  }
};

// Get simulation
const getSimulation = async (
  request: FastifyRequest<{ Params: { simulationId: string } }>,
  reply: FastifyReply
) => {
  try {
    const { simulationId } = request.params;

    const simulation = await request.server.tciSimulation.getSimulation(simulationId);

    if (!simulation) {
      return createErrorResponse(
        reply,
        new Error('Simulation not found'),
        404,
        'SIMULATION_NOT_FOUND'
      );
    }

    return createSuccessResponse(reply, {
      simulation
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Failed to get simulation'),
      400,
      'SIMULATION_FETCH_FAILED'
    );
  }
};

// Cancel simulation
const cancelSimulation = async (
  request: FastifyRequest<{ Params: { simulationId: string }; Querystring: { userId: string } }>,
  reply: FastifyReply
) => {
  try {
    const { simulationId } = request.params;
    const { userId } = request.query;

    const cancelled = await request.server.tciSimulation.cancelSimulation(simulationId, userId);

    if (!cancelled) {
      return createErrorResponse(
        reply,
        new Error('Simulation could not be cancelled'),
        400,
        'SIMULATION_CANCEL_FAILED'
      );
    }

    return createSuccessResponse(reply, {
      message: 'Simulation cancelled successfully'
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Cancellation failed'),
      400,
      'SIMULATION_CANCEL_FAILED'
    );
  }
};

// TCI Prediction endpoints

// Generate predictions
const generatePrediction = async (
  request: FastifyRequest<{ Body: PredictionRequest }>,
  reply: FastifyReply
) => {
  try {
    const predictionRequest = request.body;

    const prediction = await request.server.tciPrediction.predict(predictionRequest);

    return createSuccessResponse(reply, {
      prediction
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Prediction failed'),
      400,
      'PREDICTION_FAILED'
    );
  }
};

// TCI Governance endpoints

// Create governance policy
const createGovernancePolicy = async (
  request: FastifyRequest<{ Body: GovernancePolicyRequest; Querystring: { userId: string } }>,
  reply: FastifyReply
) => {
  try {
    const policy = request.body;
    const { userId } = request.query;

    // Check if user has permission to create policies
    const hasPermission = await request.server.tciGovernance.checkPermission(
      userId,
      'governance_policy',
      'create'
    );

    if (!hasPermission) {
      return createErrorResponse(
        reply,
        new Error('Insufficient permissions to create governance policies'),
        403,
        'INSUFFICIENT_PERMISSIONS'
      );
    }

    const policyId = await request.server.tciGovernance.createPolicy({ ...policy, createdBy: userId }, userId);

    return createSuccessResponse(reply, {
      policyId,
      message: 'Governance policy created successfully'
    }, 201);
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Policy creation failed'),
      400,
      'POLICY_CREATION_FAILED'
    );
  }
};

// Evaluate policies
const evaluatePolicies = async (
  request: FastifyRequest<{ Body: { changeId: string; context?: { workspaceId?: string; repositoryId?: string } }; Querystring: { userId: string } }>,
  reply: FastifyReply
) => {
  try {
    const { changeId, context } = request.body;
    const { userId } = request.query;

    // Get change data (simplified - would fetch from temporal DB)
    const changeData = { id: changeId };

    const evaluation = await request.server.tciGovernance.evaluatePolicies(changeId, {
      userId,
      ...context,
      changeData
    });

    return createSuccessResponse(reply, {
      evaluation
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Policy evaluation failed'),
      400,
      'POLICY_EVALUATION_FAILED'
    );
  }
};

// Export audit data
const exportAuditData = async (
  request: FastifyRequest<{ Querystring: {
    startDate?: string;
    endDate?: string;
    userId?: string;
    eventTypes?: string;
    resourceTypes?: string;
    format?: 'json' | 'csv' | 'pdf';
  } }>,
  reply: FastifyReply
) => {
  try {
    const filters = request.query;

    // Parse comma-separated arrays
    const processedFilters = {
      ...filters,
      eventTypes: filters.eventTypes ? filters.eventTypes.split(',') : undefined,
      resourceTypes: filters.resourceTypes ? filters.resourceTypes.split(',') : undefined,
      startDate: filters.startDate ? new Date(filters.startDate) : undefined,
      endDate: filters.endDate ? new Date(filters.endDate) : undefined
    };

    const exportData = await request.server.tciGovernance.exportAuditData(
      processedFilters,
      filters.format || 'json'
    );

    return createSuccessResponse(reply, {
      export: exportData,
      format: filters.format || 'json'
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Audit export failed'),
      400,
      'AUDIT_EXPORT_FAILED'
    );
  }
};

// Generate compliance report
const generateComplianceReport = async (
  request: FastifyRequest<{ Body: ComplianceReportRequest }>,
  reply: FastifyReply
) => {
  try {
    const { workspaceId, reportType, dateRange } = request.body;

    const report = await request.server.tciGovernance.generateComplianceReport(
      workspaceId,
      reportType,
      { start: new Date(dateRange.start), end: new Date(dateRange.end) }
    );

    return createSuccessResponse(reply, {
      report
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Compliance report generation failed'),
      400,
      'COMPLIANCE_REPORT_FAILED'
    );
  }
};

// Human intent capture
const captureHumanIntent = async (
  request: FastifyRequest<{ Body: HumanIntentRequest; Querystring: { userId: string } }>,
  reply: FastifyReply
) => {
  try {
    const { changeId, intent } = request.body;
    const { userId } = request.query;

    await request.server.tciIngest.captureHumanIntent(changeId, intent, userId);

    return createSuccessResponse(reply, {
      message: 'Human intent captured successfully',
      changeId,
      userId
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Intent capture failed'),
      400,
      'INTENT_CAPTURE_FAILED'
    );
  }
};

// CI/CD integration
const ingestCIResults = async (
  request: FastifyRequest<{ Body: CIResultsRequest; Querystring: { changeIds: string; branch?: string; environment?: string } }>,
  reply: FastifyReply
) => {
  try {
    const results = {
      ...request.body,
      testResults: request.body.testResults?.map(tr => ({
        ...tr,
        status: tr.status as 'passed' | 'failed' | 'skipped'
      }))
    };
    const { changeIds, branch, environment } = request.query;

    const context = {
      changeIds: changeIds.split(','),
      branch,
      environment
    };

    await request.server.tciIngest.ingestCIResults(results, context);

    return createSuccessResponse(reply, {
      message: 'CI results ingested successfully',
      pipelineId: results.pipelineId,
      changeCount: context.changeIds.length
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('CI results ingestion failed'),
      400,
      'CI_RESULTS_INGESTION_FAILED'
    );
  }
};

// Deployment outcomes
const ingestDeployment = async (
  request: FastifyRequest<{ Body: DeploymentRequest; Querystring: { changeIds: string } }>,
  reply: FastifyReply
) => {
  try {
    const deployment = request.body;
    const { changeIds } = request.query;

    const context = {
      changeIds: changeIds.split(',')
    };

    await request.server.tciIngest.ingestDeployment(deployment, context);

    return createSuccessResponse(reply, {
      message: 'Deployment outcome ingested successfully',
      environment: deployment.environment,
      status: deployment.status,
      changeCount: context.changeIds.length
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Deployment ingestion failed'),
      400,
      'DEPLOYMENT_INGESTION_FAILED'
    );
  }
};

export default async function temporalCodeIntelligenceEnterpriseRoutes(fastify: FastifyInstance) {
  // Use decorators to instantiate services once and attach them to the Fastify instance.
  // This is a core pattern for building performant, stateful Fastify applications.
  // This logic would typically live in a dedicated plugin.
  if (!fastify.hasDecorator('tciIngest')) {
    // In a real app, these constructors would receive their dependencies (e.g., from other plugins)
    // For example: new TCIIngestService(fastify.winstonLogger, fastify.configService, ...)
    const vectorDb = null as any; // Would be injected from plugin
    fastify.decorate('tciIngest', new TCIIngestService(vectorDb, null as any, null as any, null as any, null as any, null as any, null as any, null as any, null as any));
    fastify.decorate('tciSimulation', new TCISimulationService());
    fastify.decorate('tciPrediction', new TCIPredictionService());
    fastify.decorate('tciGovernance', new TCIGovernanceService());
  }

  // --- Zod Schemas for Production-Grade Request Validation ---

  const ingestEnvelopeSchema = z.object({
    agent: z.string(),
    action: z.string(),
    intent: z.string(),
    rationale: z.string(),
    confidence: z.number().min(0).max(1),
    output_diff: z.string(),
    artifact_ref: z.string().optional(),
    tests_to_run: z.array(z.string()).optional(),
    metadata: z.record(z.any()).optional(),
  });

  const simulationRequestSchema = z.object({
    changes: z.array(z.object({
      changeId: z.string().optional(),
      diff: z.string().optional(),
      filePath: z.string().optional(),
      description: z.string(),
    })),
    fidelity: z.enum(['static', 'hybrid', 'full']),
    context: z.object({
      baseBranch: z.string().optional(),
      targetBranch: z.string().optional(),
      environment: z.string().optional(),
      testSuite: z.array(z.string()).optional(),
    }).optional(),
    options: z.object({
      maxRuntime: z.number().optional(),
      maxCost: z.number().optional(),
      priority: z.enum(['low', 'medium', 'high']).optional(),
    }).optional(),
  });

  const predictionRequestSchema = z.object({
    changeId: z.string(),
    context: z.object({
      filePaths: z.array(z.string()).optional(),
      branch: z.string().optional(),
      environment: z.string().optional(),
      teamSize: z.number().optional(),
      projectAge: z.number().optional(),
    }).optional(),
    predictionTypes: z.array(z.enum(['regression_risk', 'performance', 'review_time', 'deployment_risk', 'security_risk'])).optional(),
  });

  const governancePolicySchema = z.object({
    name: z.string(),
    description: z.string(),
    rules: z.array(z.object({
      condition: z.string(),
      action: z.enum(['block', 'require_approval', 'notify', 'log']),
      severity: z.enum(['low', 'medium', 'high']),
      message: z.string().optional(),
    })),
    scope: z.enum(['global', 'workspace', 'repository']),
    enabled: z.boolean(),
  });

  const complianceReportSchema = z.object({
    workspaceId: z.string(),
    reportType: z.enum(['SOC2', 'GDPR', 'SOX', 'custom']),
    dateRange: z.object({ start: z.string().datetime(), end: z.string().datetime() }),
  });

  // TCI Ingestion endpoints

  fastify.post('/api/v1/tci/ingest', {
    schema: {
      body: ingestEnvelopeSchema,
      querystring: z.object({
        userId: z.string().optional(),
        sessionId: z.string().optional(),
        workspaceId: z.string().optional()
      }).optional(),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            changeId: z.string(),
            message: z.string()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: ingestEnvelope
  });

  fastify.post('/api/v1/tci/ingest/batch', {
    schema: {
      body: z.object({
        envelopes: z.array(ingestEnvelopeSchema),
        batchIntent: z.string().optional(),
      }).optional(),
      querystring: z.object({
        userId: z.string().optional(),
        sessionId: z.string().optional(),
        workspaceId: z.string().optional()
      }).optional(),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            changeIds: z.array(z.string()),
            count: z.number(),
            message: z.string()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: ingestBatch
  });

  // TCI Simulation endpoints

  fastify.post('/api/v1/tci/simulate', {
    schema: {
      body: simulationRequestSchema,
      querystring: z.object({
        userId: z.string()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            simulationId: z.string(),
            message: z.string()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: createSimulation
  });

  fastify.get('/api/v1/tci/simulate/:simulationId', {
    schema: {
      params: z.object({
        simulationId: z.string()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            simulation: z.any()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        404: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: getSimulation
  });

  fastify.delete('/api/v1/tci/simulate/:simulationId', {
    schema: {
      params: z.object({
        simulationId: z.string()
      }),
      querystring: z.object({
        userId: z.string()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            message: z.string()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: cancelSimulation
  });

  // TCI Prediction endpoints

  fastify.post('/api/v1/tci/predict', {
    schema: {
      body: predictionRequestSchema,
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            prediction: z.any()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: generatePrediction
  });

  // TCI Governance endpoints

  fastify.post('/api/v1/tci/governance/policies', {
    schema: {
      body: governancePolicySchema,
      querystring: z.object({
        userId: z.string()
      }),
      response: {
        201: z.object({
          success: z.literal(true),
          data: z.object({
            policyId: z.string(),
            message: z.string()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        403: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: createGovernancePolicy
  });

  fastify.post('/api/v1/tci/governance/evaluate', {
    schema: {
      body: z.object({
        changeId: z.string(),
        context: z.object({
          workspaceId: z.string().optional(),
          repositoryId: z.string().optional()
        })
      }),
      querystring: z.object({
        userId: z.string()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            evaluation: z.any()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: evaluatePolicies
  });

  fastify.get('/api/v1/tci/governance/audit/export', {
    schema: {
      querystring: z.object({
        startDate: z.string().datetime().optional(),
        endDate: z.string().datetime().optional(),
        userId: z.string().optional(),
        eventTypes: z.string().optional(), // comma-separated
        resourceTypes: z.string().optional(), // comma-separated
        format: z.enum(['json', 'csv', 'pdf']).optional()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            export: z.any(),
            format: z.string()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: exportAuditData
  });

  fastify.post('/api/v1/tci/governance/compliance/report', {
    schema: {
      body: complianceReportSchema,
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            report: z.any()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: generateComplianceReport
  });

  // Human intent capture
  fastify.post('/api/v1/tci/intent/capture', {
    schema: {
      body: z.object({
        changeId: z.string(),
        intent: z.object({
          description: z.string(),
          rationale: z.string(),
          confidence: z.number().min(0).max(1).optional()
        })
      }),
      querystring: z.object({
        userId: z.string()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            message: z.string(),
            changeId: z.string(),
            userId: z.string()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: captureHumanIntent
  });

  // CI/CD integration
  fastify.post('/api/v1/tci/ci/results', {
    schema: {
      body: z.object({
        pipelineId: z.string(),
        status: z.enum(['success', 'failure', 'partial']),
        testResults: z.array(z.object({
          testName: z.string(),
          status: z.string(),
          duration: z.number(),
          output: z.string().optional()
        })),
        performanceMetrics: z.record(z.number()).optional(),
        artifactRef: z.string().optional()
      }),
      querystring: z.object({
        changeIds: z.string(), // comma-separated
        branch: z.string().optional(),
        environment: z.string().optional()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            message: z.string(),
            pipelineId: z.string(),
            changeCount: z.number()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: ingestCIResults
  });

  // Deployment outcomes
  fastify.post('/api/v1/tci/deployment', {
    schema: {
      body: z.object({
        environment: z.string(),
        status: z.enum(['success', 'failure', 'rollback']),
        metrics: z.record(z.number()),
        incidents: z.array(z.object({
          type: z.string(),
          severity: z.string(),
          description: z.string()
        })).optional(),
        artifactRef: z.string()
      }),
      querystring: z.object({
        changeIds: z.string() // comma-separated
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            message: z.string(),
            environment: z.string(),
            status: z.string(),
            changeCount: z.number()
          }),
          requestId: z.string().uuid(),
          timestamp: z.string()
        }),
        400: z.object({
          error: z.string(),
          code: z.string(),
          requestId: z.string().uuid(),
          timestamp: z.string(),
          details: z.any().optional()
        })
      }
    },
    handler: ingestDeployment
  });
}

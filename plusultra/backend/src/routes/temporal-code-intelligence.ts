import { FastifyInstance } from 'fastify';
import { z } from 'zod';

// Note: FastifyInstance is extended in types/fastify.d.ts

// These services are implemented in the /services/temporal directory
// but TypeScript might flag them if the build tools haven't processed them yet
import TemporalCodeIntelligence from '../services/temporal/TemporalCodeIntelligence';
import TemporalGraphDB from '../services/temporal/TemporalGraphDB';
import ChangeIntentLogger from '../services/temporal/ChangeIntentLogger';
import ReplayEngine from '../services/temporal/ReplayEngine';
import PredictiveForkSimulator from '../services/temporal/PredictiveForkSimulator';

const tciQuerySchema = z.object({
  question: z.string(),
  context: z.object({
    filePaths: z.array(z.string()).optional(),
    timeRange: z.object({
      start: z.string().datetime(),
      end: z.string().datetime()
    }).optional(),
    sessionId: z.string().optional()
  }).optional()
});

const logCodeEventSchema = z.object({
  filePath: z.string(),
  changeType: z.enum(['create', 'modify', 'delete', 'refactor', 'fix']),
  oldContent: z.string().optional(),
  newContent: z.string(),
  context: z.object({
    userId: z.string(),
    sessionId: z.string(),
    prompt: z.string().optional(),
    agents: z.array(z.string()),
    workflowType: z.string()
  }),
  metadata: z.record(z.any()).optional()
});

const simulateChangesSchema = z.object({
  proposedChanges: z.array(z.object({
    filePath: z.string(),
    changeType: z.string(),
    description: z.string(),
    estimatedImpact: z.object({
      linesChanged: z.number(),
      complexity: z.enum(['low', 'medium', 'high'])
    })
  })),
  context: z.object({
    currentFileCount: z.number(),
    teamSize: z.number(),
    projectAge: z.number(),
    technologyStack: z.array(z.string())
  }),
  predictionHorizon: z.number().default(90)
});

const evolutionQuerySchema = z.object({
  filePaths: z.array(z.string()),
  since: z.string().datetime().optional(),
  horizonDays: z.number().default(90)
});

export default async function temporalCodeIntelligenceRoutes(fastify: FastifyInstance) {
  // Create singleton instances of all services to reuse across route handlers
  const temporalDB = new TemporalGraphDB(fastify.prisma as any, (fastify as any).vectorDB);
  const changeLogger = new ChangeIntentLogger(fastify.prisma as any);
  const replayEngine = new ReplayEngine(fastify.prisma as any);
  const forkSimulator = new PredictiveForkSimulator(fastify.prisma as any);

  const tciService = new TemporalCodeIntelligence(
    temporalDB,
    changeLogger,
    replayEngine,
    forkSimulator,
    null as any, // storageService - would be injected
    null as any, // vectorDB - would be injected
    null as any, // auditLogger - would be injected
    null as any, // modelRouter - would be injected
    null as any, // rbacService - would be injected
    null as any  // jobQueue - would be injected
  );

  // Main TCI query endpoint
  fastify.post('/api/v1/temporal/query', {
    schema: {
      body: tciQuerySchema
    },
    handler: async (request, reply) => {
      try {
        const query = request.body as any;

        const response = await tciService.query(query);

        reply.code(200).send({
          success: true,
          response
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'TCI query failed'
        });
      }
    }
  });

  // Log code change event
  fastify.post('/api/v1/temporal/log-change', {
    schema: {
      body: logCodeEventSchema
    },
    handler: async (request, reply) => {
      try {
        const event = request.body as any;

        await tciService.logCodeEvent(event);

        reply.code(200).send({
          success: true,
          message: 'Change logged successfully'
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to log change'
        });
      }
    }
  });

  // Get comprehensive context for files
  fastify.get('/api/v1/temporal/context', {
    schema: {
      querystring: z.object({
        filePaths: z.string(), // comma-separated
        sessionId: z.string().optional()
      })
    },
    handler: async (request, reply) => {
      try {
        const { filePaths, sessionId } = request.query as any;
        const paths = filePaths.split(',').filter(Boolean);

        const context = await tciService.getContext(paths, sessionId);

        reply.code(200).send({
          success: true,
          context
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get context'
        });
      }
    }
  });

  // Simulate proposed changes
  fastify.post('/api/v1/temporal/simulate', {
    schema: {
      body: simulateChangesSchema
    },
    handler: async (request, reply) => {
      try {
        const simulationRequest = request.body as any;

        // Use the fork simulator directly for this
        const forkSimulator = new PredictiveForkSimulator(fastify.prisma as any);
        const simulations = await forkSimulator.simulateProposedChanges(simulationRequest);

        reply.code(200).send({
          success: true,
          simulations
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Simulation failed'
        });
      }
    }
  });

  // Get file evolution history
  fastify.get('/api/v1/temporal/evolution', {
    schema: {
      querystring: evolutionQuerySchema
    },
    handler: async (request, reply) => {
      try {
        const { filePaths, since, horizonDays } = request.query as any;

        const replayEngine = new ReplayEngine(fastify.prisma as any);
        const evolution = await replayEngine.replayFromTime({
          targetTime: since ? new Date(since) : new Date(),
          filePaths,
          maxChanges: 100
        });

        reply.code(200).send({
          success: true,
          evolution
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get evolution'
        });
      }
    }
  });

  // Explain code intent
  fastify.get('/api/v1/temporal/explain', {
    schema: {
      querystring: z.object({
        filePath: z.string(),
        lineRange: z.string().optional() // e.g., "10-20"
      })
    },
    handler: async (request, reply) => {
      try {
        const { filePath, lineRange } = request.query as any;

        let parsedLineRange;
        if (lineRange) {
          const [start, end] = lineRange.split('-').map(Number);
          parsedLineRange = { start, end };
        }

        const temporalDB = new TemporalGraphDB(fastify.prisma as any, (fastify as any).vectorDB);
        const explanation = await temporalDB.explainCodeIntent(filePath, parsedLineRange);

        reply.code(200).send({
          success: true,
          explanation
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to explain code'
        });
      }
    }
  });

  // Simulate revert operation
  fastify.post('/api/v1/temporal/simulate-revert', {
    schema: {
      body: z.object({
        timeRange: z.object({
          start: z.string().datetime(),
          end: z.string().datetime()
        }),
        filePaths: z.array(z.string()).optional()
      })
    },
    handler: async (request, reply) => {
      try {
        const { timeRange, filePaths } = request.body as any;

        const replayEngine = new ReplayEngine(fastify.prisma as any);
        const simulation = await replayEngine.simulateRevert(timeRange, filePaths);

        reply.code(200).send({
          success: true,
          simulation
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Revert simulation failed'
        });
      }
    }
  });

  // Predict future evolution
  fastify.get('/api/v1/temporal/predict', {
    schema: {
      querystring: z.object({
        filePaths: z.string(), // comma-separated
        horizonDays: z.number().default(90)
      })
    },
    handler: async (request, reply) => {
      try {
        const { filePaths, horizonDays } = request.query as any;
        const paths = filePaths.split(',').filter(Boolean);

        const forkSimulator = new PredictiveForkSimulator(fastify.prisma as any);
        const predictions = await forkSimulator.predictEvolution(paths, horizonDays);

        reply.code(200).send({
          success: true,
          predictions
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Prediction failed'
        });
      }
    }
  });

  // Get change alternatives
  fastify.get('/api/v1/temporal/alternatives', {
    schema: {
      querystring: z.object({
        filePath: z.string(),
        changeId: z.string().optional()
      })
    },
    handler: async (request, reply) => {
      try {
        const { filePath, changeId } = request.query as any;

        const replayEngine = new ReplayEngine(fastify.prisma as any);

        let alternatives;
        if (changeId) {
          alternatives = await replayEngine.replayChangeAlternatives(changeId);
        } else {
          // Get alternatives based on file history
          const temporalDB = new TemporalGraphDB(fastify.prisma as any, (fastify as any).vectorDB);
          const evolution = await temporalDB.getFileEvolution(filePath);
          alternatives = {
            original: null,
            alternatives: [] // Would generate alternatives based on evolution
          };
        }

        reply.code(200).send({
          success: true,
          alternatives
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get alternatives'
        });
      }
    }
  });
}

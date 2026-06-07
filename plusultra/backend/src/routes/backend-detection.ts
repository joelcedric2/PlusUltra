import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { backendFeatureDetector } from '../services/ai/BackendFeatureDetector';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

// Schemas
const analyzeIntentSchema = z.object({
  intent: z.string(),
  projectName: z.string().optional()
});

const getSetupGuideSchema = z.object({
  database: z.enum(['supabase', 'firebase', 'aws'])
});

const checkAutoProvisionSchema = z.object({
  database: z.string(),
  credentials: z.record(z.string())
});

// Helper functions
const createSuccessResponse = (reply: FastifyReply, data: any) => {
  return reply.send({
    success: true,
    data,
    requestId: uuidv4(),
    timestamp: new Date().toISOString()
  });
};

const createErrorResponse = (reply: FastifyReply, error: Error, statusCode = 500, code = 'ERROR') => {
  return reply.status(statusCode).send({
    error: error.message,
    code,
    requestId: uuidv4(),
    timestamp: new Date().toISOString()
  });
};

export default async function backendDetectionRoutes(fastify: FastifyInstance) {
  // Analyze user intent for backend requirements
  fastify.post('/api/v1/backend-detection/analyze', {
    schema: {
      body: analyzeIntentSchema
    },
    handler: async (
      request: FastifyRequest<{ Body: { intent: string; projectName?: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const { intent, projectName } = request.body;

        const analysis = await backendFeatureDetector.analyzeIntent(intent, projectName);

        return createSuccessResponse(reply, {
          analysis,
          message: analysis.needsBackend
            ? `Backend features detected! We recommend setting up ${analysis.suggestedDatabases[0]?.name || 'a database'}.`
            : 'No backend features detected. This can be a pure frontend app.'
        });
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Analysis failed'),
          500,
          'ANALYSIS_FAILED'
        );
      }
    }
  });

  // Get setup guide for specific database
  fastify.post('/api/v1/backend-detection/setup-guide', {
    schema: {
      body: getSetupGuideSchema
    },
    handler: async (
      request: FastifyRequest<{ Body: { database: 'supabase' | 'firebase' | 'aws' } }>,
      reply: FastifyReply
    ) => {
      try {
        const { database } = request.body;

        const guide = backendFeatureDetector.getSetupGuide(database);

        return createSuccessResponse(reply, {
          guide,
          message: `Here's your step-by-step guide to set up ${database.toUpperCase()}`
        });
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Failed to get setup guide'),
          500,
          'GUIDE_FAILED'
        );
      }
    }
  });

  // Check if auto-provisioning is possible
  fastify.post('/api/v1/backend-detection/check-auto-provision', {
    schema: {
      body: checkAutoProvisionSchema
    },
    handler: async (
      request: FastifyRequest<{ Body: { database: string; credentials: Record<string, string> } }>,
      reply: FastifyReply
    ) => {
      try {
        const { database, credentials } = request.body;

        const canAutoProvision = await backendFeatureDetector.canAutoProvision(database, credentials);

        return createSuccessResponse(reply, {
          canAutoProvision,
          message: canAutoProvision
            ? `Great! PlusUltra can automatically provision a ${database} project for you.`
            : `Manual setup required for ${database}. Follow the setup guide to configure it.`,
          nextSteps: canAutoProvision
            ? ['Click "Auto-Setup" to create your project', 'We\'ll configure everything for you', 'Start building immediately']
            : ['Follow the setup guide', 'Get your API keys', 'Paste them here to test connection']
        });
      } catch (error) {
        return createErrorResponse(
          reply,
          error instanceof Error ? error : new Error('Check failed'),
          500,
          'CHECK_FAILED'
        );
      }
    }
  });
}

import { FastifyInstance } from 'fastify';
import EASBuildService, { BuildConfig, BuildResult, SubmissionResult } from '../services/build/EASBuildService';
import { z } from 'zod';

const buildConfigSchema = z.object({
  platform: z.enum(['ios', 'android', 'all']),
  profile: z.string().optional(),
  clearCache: z.boolean().optional(),
  autoSubmit: z.boolean().optional(),
  submitProfile: z.string().optional(),
  metadata: z.object({
    name: z.string().optional(),
    description: z.string().optional(),
    version: z.string().optional(),
    buildNumber: z.string().optional(),
    packageName: z.string().optional(),
    bundleIdentifier: z.string().optional()
  }).optional()
});

export default async function buildRoutes(fastify: FastifyInstance) {
  const easBuildService = new EASBuildService();

  // Configure EAS for project
  fastify.post('/api/v1/build/configure', {
    schema: {
      body: buildConfigSchema.extend({
        projectPath: z.string()
      })
    },
    handler: async (request, reply) => {
      try {
        const { projectPath, ...config } = request.body as any;

        await easBuildService.configureEAS(projectPath, config);

        reply.code(200).send({
          success: true,
          message: 'EAS configured successfully'
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Configuration failed'
        });
      }
    }
  });

  // Trigger EAS build
  fastify.post('/api/v1/build/trigger', {
    schema: {
      body: buildConfigSchema.extend({
        projectPath: z.string()
      })
    },
    handler: async (request, reply) => {
      try {
        const { projectPath, ...config } = request.body as any;

        const result = await easBuildService.triggerBuild(projectPath, config);

        reply.code(200).send({
          success: true,
          build: result
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Build failed'
        });
      }
    }
  });

  // Submit to app stores
  fastify.post('/api/v1/build/submit', {
    schema: {
      body: buildConfigSchema.extend({
        projectPath: z.string()
      })
    },
    handler: async (request, reply) => {
      try {
        const { projectPath, ...config } = request.body as any;

        const result = await easBuildService.submitToStore(projectPath, config);

        reply.code(200).send({
          success: true,
          submission: result
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Submission failed'
        });
      }
    }
  });

  // Generate app store assets
  fastify.post('/api/v1/build/assets', {
    schema: {
      body: z.object({
        projectPath: z.string(),
        metadata: buildConfigSchema.shape.metadata
      })
    },
    handler: async (request, reply) => {
      try {
        const { projectPath, metadata } = request.body as any;

        await easBuildService.generateAppStoreAssets(projectPath, metadata);

        reply.code(200).send({
          success: true,
          message: 'App store assets generated successfully'
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Asset generation failed'
        });
      }
    }
  });

  // Get build status
  fastify.get('/api/v1/build/:buildId/status', {
    schema: {
      params: z.object({
        buildId: z.string()
      })
    },
    handler: async (request, reply) => {
      try {
        const { buildId } = request.params as any;

        const status = await easBuildService.getBuildStatus(buildId);

        reply.code(200).send({
          success: true,
          build: status
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to get build status'
        });
      }
    }
  });

  // Install EAS CLI
  fastify.post('/api/v1/build/install-eas', {
    schema: {
      body: z.object({
        projectPath: z.string()
      })
    },
    handler: async (request, reply) => {
      try {
        const { projectPath } = request.body as any;

        await easBuildService.installEAS(projectPath);

        reply.code(200).send({
          success: true,
          message: 'EAS CLI installed successfully'
        });
      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'EAS installation failed'
        });
      }
    }
  });

  // Combined build and submit workflow
  fastify.post('/api/v1/build/deploy', {
    schema: {
      body: buildConfigSchema.extend({
        projectPath: z.string(),
        skipSubmission: z.boolean().optional()
      })
    },
    handler: async (request, reply) => {
      try {
        const { projectPath, skipSubmission, ...config } = request.body as any;

        // First, configure EAS if not already done
        await easBuildService.configureEAS(projectPath, config);

        // Trigger build
        const buildResult = await easBuildService.triggerBuild(projectPath, config);

        if (buildResult.status !== 'success') {
          reply.code(500).send({
            success: false,
            error: 'Build failed',
            build: buildResult
          });
          return;
        }

        // Generate app store assets
        if (config.metadata) {
          await easBuildService.generateAppStoreAssets(projectPath, config.metadata);
        }

        // Submit to stores if not skipped
        let submissionResult: SubmissionResult | null = null;
        if (!skipSubmission && config.autoSubmit) {
          submissionResult = await easBuildService.submitToStore(projectPath, {
            ...config,
            platform: config.platform === 'all' ? 'ios' : config.platform
          });
        }

        reply.code(200).send({
          success: true,
          build: buildResult,
          submission: submissionResult,
          message: 'Build and deployment completed successfully'
        });

      } catch (error) {
        reply.code(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Deployment failed'
        });
      }
    }
  });
}

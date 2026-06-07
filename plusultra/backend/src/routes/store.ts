import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import AppStoreAutomationService, { AppStoreConfig, StoreSubmission } from '../services/store/AppStoreAutomationService';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

// Define the schema inline to avoid import issues
const appStoreConfigSchema = z.object({
  platform: z.enum(['ios', 'android']),
  appName: z.string(),
  bundleId: z.string(),
  version: z.string(),
  buildNumber: z.string(),
  description: z.string(),
  keywords: z.array(z.string()).optional(),
  category: z.string().optional(),
  privacyPolicyUrl: z.string().optional(),
  supportUrl: z.string().optional(),
  marketingUrl: z.string().optional(),
  screenshots: z.array(z.string()).optional(),
  certificates: z.object({
    ios: z.object({
      distributionCertificate: z.string().optional(),
      provisioningProfile: z.string().optional(),
    }).optional(),
    android: z.object({
      keystore: z.string().optional(),
      keystorePassword: z.string().optional(),
      keyAlias: z.string().optional(),
      keyPassword: z.string().optional(),
    }).optional(),
  }).optional(),
});

// Type definitions for request/response
type GenerateMetadataRequest = {
  platform: 'ios' | 'android' | 'all';
  appName: string;
  bundleId: string;
  version: string;
  buildNumber: string;
  description: string;
  keywords?: string[];
  category?: string;
  privacyPolicyUrl?: string;
  supportUrl?: string;
  marketingUrl?: string;
  screenshots?: string[];
};

type SubmitIOSRequest = {
  projectPath: string;
  platform: 'ios' | 'android' | 'all';
  appName: string;
  bundleId: string;
  version: string;
  buildNumber: string;
  description: string;
  keywords?: string[];
  category?: string;
  privacyPolicyUrl?: string;
  supportUrl?: string;
  marketingUrl?: string;
  screenshots?: string[];
  certificates?: {
    ios?: {
      distributionCertificate?: string;
      provisioningProfile?: string;
    };
    android?: {
      keystore?: string;
      keystorePassword?: string;
      keyAlias?: string;
      keyPassword?: string;
    };
  };
};

type SubmitAndroidRequest = {
  projectPath: string;
  platform: 'ios' | 'android' | 'all';
  appName: string;
  bundleId: string;
  version: string;
  buildNumber: string;
  description: string;
  keywords?: string[];
  category?: string;
  privacyPolicyUrl?: string;
  supportUrl?: string;
  marketingUrl?: string;
  screenshots?: string[];
  certificates?: {
    ios?: {
      distributionCertificate?: string;
      provisioningProfile?: string;
    };
    android?: {
      keystore?: string;
      keystorePassword?: string;
      keyAlias?: string;
      keyPassword?: string;
    };
  };
};

type SubmitBothStoresRequest = {
  projectPath: string;
  platform: 'ios' | 'android' | 'all';
  appName: string;
  bundleId: string;
  version: string;
  buildNumber: string;
  description: string;
  keywords?: string[];
  category?: string;
  privacyPolicyUrl?: string;
  supportUrl?: string;
  marketingUrl?: string;
  screenshots?: string[];
  certificates?: {
    ios?: {
      distributionCertificate?: string;
      provisioningProfile?: string;
    };
    android?: {
      keystore?: string;
      keystorePassword?: string;
      keyAlias?: string;
      keyPassword?: string;
    };
  };
};

type GenerateLegalRequest = {
  projectPath: string;
  appName: string;
};

type GenerateScreenshotsRequest = {
  projectPath: string;
  appName: string;
};

type GenerateCertificatesRequest = {
  projectPath: string;
  platform: 'ios' | 'android' | 'all';
  appName: string;
  bundleId: string;
  version: string;
  buildNumber: string;
  description: string;
  keywords?: string[];
  category?: string;
  privacyPolicyUrl?: string;
  supportUrl?: string;
  marketingUrl?: string;
  screenshots?: string[];
};

type GetSubmissionStatusRequest = {
  submissionId: string;
};

type DeployCompleteRequest = {
  projectPath: string;
  generateAllAssets?: boolean;
  platform: 'ios' | 'android' | 'all';
  appName: string;
  bundleId: string;
  version: string;
  buildNumber: string;
  description: string;
  keywords?: string[];
  category?: string;
  privacyPolicyUrl?: string;
  supportUrl?: string;
  marketingUrl?: string;
  screenshots?: string[];
  certificates?: {
    ios?: {
      distributionCertificate?: string;
      provisioningProfile?: string;
    };
    android?: {
      keystore?: string;
      keystorePassword?: string;
      keyAlias?: string;
      keyPassword?: string;
    };
  };
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

// Generate app store metadata
const generateMetadata = async (
  request: FastifyRequest<{ Body: GenerateMetadataRequest & { projectPath: string } }>,
  reply: FastifyReply
) => {
  try {
    const { projectPath, ...config } = request.body;
    const storeService = new AppStoreAutomationService();

    const metadata = await storeService.generateMetadata(projectPath, config);

    return createSuccessResponse(reply, {
      metadata,
      projectPath,
      platform: config.platform
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Metadata generation failed'),
      400,
      'METADATA_GENERATION_FAILED'
    );
  }
};

// Submit to iOS App Store
const submitToIOS = async (
  request: FastifyRequest<{ Body: SubmitIOSRequest }>,
  reply: FastifyReply
) => {
  try {
    const { projectPath, ...config } = request.body;
    const storeService = new AppStoreAutomationService();

    const submission = await storeService.submitToIOS(projectPath, config);

    return createSuccessResponse(reply, {
      submission,
      platform: 'ios',
      projectPath
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('iOS submission failed'),
      400,
      'IOS_SUBMISSION_FAILED'
    );
  }
};

// Submit to Android Play Store
const submitToAndroid = async (
  request: FastifyRequest<{ Body: SubmitAndroidRequest }>,
  reply: FastifyReply
) => {
  try {
    const { projectPath, ...config } = request.body;
    const storeService = new AppStoreAutomationService();

    const submission = await storeService.submitToAndroid(projectPath, config);

    return createSuccessResponse(reply, {
      submission,
      platform: 'android',
      projectPath
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Android submission failed'),
      400,
      'ANDROID_SUBMISSION_FAILED'
    );
  }
};

// Submit to both stores
const submitToBothStores = async (
  request: FastifyRequest<{ Body: SubmitBothStoresRequest }>,
  reply: FastifyReply
) => {
  try {
    const { projectPath, ...config } = request.body;
    const storeService = new AppStoreAutomationService();

    const submissions = await storeService.submitToBothStores(projectPath, config);

    return createSuccessResponse(reply, {
      submissions,
      projectPath,
      platforms: ['ios', 'android']
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Store submissions failed'),
      400,
      'BOTH_STORES_SUBMISSION_FAILED'
    );
  }
};

// Generate legal documents
const generateLegalDocuments = async (
  request: FastifyRequest<{ Body: GenerateLegalRequest }>,
  reply: FastifyReply
) => {
  try {
    const { projectPath, appName } = request.body;
    const storeService = new AppStoreAutomationService();

    await storeService.generateLegalDocuments(projectPath, appName);

    return createSuccessResponse(reply, {
      message: 'Legal documents generated successfully',
      projectPath,
      appName
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Legal document generation failed'),
      400,
      'LEGAL_DOCUMENTS_GENERATION_FAILED'
    );
  }
};

// Generate screenshots
const generateScreenshots = async (
  request: FastifyRequest<{ Body: GenerateScreenshotsRequest }>,
  reply: FastifyReply
) => {
  try {
    const { projectPath, appName } = request.body;
    const storeService = new AppStoreAutomationService();

    const screenshots = await storeService.generateScreenshots(projectPath, appName);

    return createSuccessResponse(reply, {
      screenshots,
      projectPath,
      appName,
      count: screenshots.length
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Screenshot generation failed'),
      400,
      'SCREENSHOTS_GENERATION_FAILED'
    );
  }
};

// Generate certificates
const generateCertificates = async (
  request: FastifyRequest<{ Body: GenerateCertificatesRequest }>,
  reply: FastifyReply
) => {
  try {
    const { projectPath, ...config } = request.body;
    const storeService = new AppStoreAutomationService();

    await storeService.generateCertificates(projectPath, config);

    return createSuccessResponse(reply, {
      message: 'Certificates generated successfully',
      projectPath,
      platform: config.platform
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Certificate generation failed'),
      400,
      'CERTIFICATES_GENERATION_FAILED'
    );
  }
};

// Check submission status
const checkSubmissionStatus = async (
  request: FastifyRequest<{ Params: GetSubmissionStatusRequest }>,
  reply: FastifyReply
) => {
  try {
    const { submissionId } = request.params;
    const storeService = new AppStoreAutomationService();

    const status = await storeService.checkSubmissionStatus(submissionId);

    return createSuccessResponse(reply, {
      submission: status,
      submissionId
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Failed to check submission status'),
      404,
      'SUBMISSION_STATUS_NOT_FOUND'
    );
  }
};

// Complete store deployment workflow
const deployComplete = async (
  request: FastifyRequest<{ Body: DeployCompleteRequest }>,
  reply: FastifyReply
) => {
  try {
    const { projectPath, generateAllAssets, ...config } = request.body;
    const storeService = new AppStoreAutomationService();

    let results: any = {};

    // Generate metadata
    const metadata = await storeService.generateMetadata(projectPath, config);
    results.metadata = metadata;

    // Generate legal documents
    await storeService.generateLegalDocuments(projectPath, config.appName);
    results.legalDocuments = true;

    // Generate screenshots
    const screenshots = await storeService.generateScreenshots(projectPath, config.appName);
    results.screenshots = screenshots;

    // Generate certificates
    await storeService.generateCertificates(projectPath, config);
    results.certificates = true;

    // Submit to stores
    const submissions = await storeService.submitToBothStores(projectPath, config);
    results.submissions = submissions;

    return createSuccessResponse(reply, {
      results,
      projectPath,
      message: 'Complete store deployment completed successfully',
      assetsGenerated: generateAllAssets
    });
  } catch (error) {
    return createErrorResponse(
      reply,
      error instanceof Error ? error : new Error('Complete deployment failed'),
      400,
      'COMPLETE_DEPLOYMENT_FAILED'
    );
  }
};

export default async function storeRoutes(fastify: FastifyInstance) {
  // Generate app store metadata
  fastify.post('/api/v1/store/generate-metadata', {
    schema: {
      body: appStoreConfigSchema.omit({ certificates: true }).extend({
        projectPath: z.string()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            metadata: z.any(),
            projectPath: z.string(),
            platform: z.string()
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
    handler: generateMetadata
  });

  // Submit to iOS App Store
  fastify.post('/api/v1/store/submit/ios', {
    schema: {
      body: appStoreConfigSchema.extend({
        projectPath: z.string()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            submission: z.any(),
            platform: z.literal('ios'),
            projectPath: z.string()
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
    handler: submitToIOS
  });

  // Submit to Android Play Store
  fastify.post('/api/v1/store/submit/android', {
    schema: {
      body: appStoreConfigSchema.extend({
        projectPath: z.string()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            submission: z.any(),
            platform: z.literal('android'),
            projectPath: z.string()
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
    handler: submitToAndroid
  });

  // Submit to both stores
  fastify.post('/api/v1/store/submit/both', {
    schema: {
      body: appStoreConfigSchema.extend({
        projectPath: z.string()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            submissions: z.array(z.any()),
            projectPath: z.string(),
            platforms: z.array(z.string())
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
    handler: submitToBothStores
  });

  // Generate legal documents
  fastify.post('/api/v1/store/generate-legal', {
    schema: {
      body: z.object({
        projectPath: z.string(),
        appName: z.string()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            message: z.string(),
            projectPath: z.string(),
            appName: z.string()
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
    handler: generateLegalDocuments
  });

  // Generate screenshots
  fastify.post('/api/v1/store/generate-screenshots', {
    schema: {
      body: z.object({
        projectPath: z.string(),
        appName: z.string()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            screenshots: z.array(z.string()),
            projectPath: z.string(),
            appName: z.string(),
            count: z.number()
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
    handler: generateScreenshots
  });

  // Generate certificates
  fastify.post('/api/v1/store/generate-certificates', {
    schema: {
      body: appStoreConfigSchema.extend({
        projectPath: z.string()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            message: z.string(),
            projectPath: z.string(),
            platform: z.string()
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
    handler: generateCertificates
  });

  // Check submission status
  fastify.get('/api/v1/store/submission/:submissionId', {
    schema: {
      params: z.object({
        submissionId: z.string()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            submission: z.any(),
            submissionId: z.string()
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
    handler: checkSubmissionStatus
  });

  // Complete store deployment workflow
  fastify.post('/api/v1/store/deploy-complete', {
    schema: {
      body: appStoreConfigSchema.extend({
        projectPath: z.string(),
        generateAllAssets: z.boolean().optional()
      }),
      response: {
        200: z.object({
          success: z.literal(true),
          data: z.object({
            results: z.any(),
            projectPath: z.string(),
            message: z.string(),
            assetsGenerated: z.boolean().optional()
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
    handler: deployComplete
  });
}

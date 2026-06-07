import axios, { AxiosInstance, AxiosError } from 'axios';
import { sign } from 'jsonwebtoken';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';

/**
 * Apple App Store Service
 * Production-ready service for App Store Connect API integration
 * Handles app submissions, review status tracking, and rejection parsing
 *
 * Documentation: https://developer.apple.com/documentation/appstoreconnectapi
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface AppleAppStoreConfig {
  keyId: string;        // APPLE_KEY_ID - App Store Connect API Key ID
  issuerId: string;     // APPLE_ISSUER_ID - App Store Connect Issuer ID
  privateKey: string;   // APPLE_PRIVATE_KEY - Private key in PEM format or file path
}

export interface AppInfo {
  id: string;
  name: string;
  bundleId: string;
  sku: string;
  primaryLocale: string;
  contentRightsDeclaration?: string;
}

export interface AppVersion {
  id: string;
  versionString: string;
  platform: 'IOS' | 'MAC_OS' | 'TV_OS' | 'VISION_OS';
  appStoreState: AppStoreState;
  copyright?: string;
  releaseType?: 'MANUAL' | 'AFTER_APPROVAL' | 'SCHEDULED';
  createdDate?: string;
  downloadable?: boolean;
}

export type AppStoreState =
  | 'ACCEPTED'
  | 'DEVELOPER_REJECTED'
  | 'DEVELOPER_REMOVED_FROM_SALE'
  | 'IN_REVIEW'
  | 'INVALID_BINARY'
  | 'METADATA_REJECTED'
  | 'PENDING_APPLE_RELEASE'
  | 'PENDING_CONTRACT'
  | 'PENDING_DEVELOPER_RELEASE'
  | 'PREPARE_FOR_SUBMISSION'
  | 'PREORDER_READY_FOR_SALE'
  | 'PROCESSING_FOR_APP_STORE'
  | 'READY_FOR_REVIEW'
  | 'READY_FOR_SALE'
  | 'REJECTED'
  | 'REMOVED_FROM_SALE'
  | 'WAITING_FOR_EXPORT_COMPLIANCE'
  | 'WAITING_FOR_REVIEW';

export interface BuildInfo {
  id: string;
  version: string;
  buildNumber: string;
  uploadedDate: string;
  processingState: 'PROCESSING' | 'FAILED' | 'INVALID' | 'VALID';
  usesNonExemptEncryption?: boolean;
  minOsVersion?: string;
  iconAssetToken?: string;
}

export interface AppMetadata {
  name?: string;
  subtitle?: string;
  description: string;
  keywords?: string;
  whatsNew?: string;
  promotionalText?: string;
  marketingUrl?: string;
  supportUrl?: string;
  privacyPolicyUrl?: string;
  privacyChoicesUrl?: string;
  locale?: string;
}

export interface ReviewSubmission {
  submissionId: string;
  status: ReviewStatus;
  appVersionId: string;
  submittedAt: Date;
  reviewDetails?: ReviewDetails;
  storeUrl?: string;
}

export type ReviewStatus =
  | 'submitted'
  | 'waiting_for_review'
  | 'in_review'
  | 'pending_developer_release'
  | 'approved'
  | 'rejected'
  | 'metadata_rejected'
  | 'invalid_binary'
  | 'processing';

export interface ReviewDetails {
  reviewType: 'APP_STORE' | 'NOTARIZATION';
  state: string;
  submittedDate?: string;
  lastUpdated?: string;
}

export interface RejectionInfo {
  rejected: boolean;
  rejectionType?: 'binary' | 'metadata' | 'guideline';
  reasons: RejectionReason[];
  reviewerNotes?: string;
  resolutionUrl?: string;
  canResubmit: boolean;
}

export interface RejectionReason {
  id: string;
  category: RejectionCategory;
  guidelineCode?: string;       // e.g., "Guideline 2.1", "Guideline 4.3"
  guidelineTitle?: string;      // e.g., "App Completeness", "Spam"
  message: string;
  severity: 'blocking' | 'warning' | 'informational';
  affectedArea?: 'binary' | 'metadata' | 'screenshot' | 'privacy' | 'iap';
  suggestedFix?: string;
  tciAutoFixable: boolean;      // Can TCI automatically fix this issue?
  tciFixStrategy?: TCIFixStrategy;
}

export type RejectionCategory =
  | 'safety'              // Guideline 1.x - Safety
  | 'performance'         // Guideline 2.x - Performance
  | 'business'            // Guideline 3.x - Business
  | 'design'              // Guideline 4.x - Design
  | 'legal'               // Guideline 5.x - Legal
  | 'metadata'            // App Store metadata issues
  | 'screenshot'          // Screenshot issues
  | 'privacy'             // Privacy-related rejections
  | 'technical'           // Technical/crash issues
  | 'unknown';

export interface TCIFixStrategy {
  type: 'code_change' | 'metadata_update' | 'asset_regeneration' | 'config_update' | 'manual_required';
  confidence: number;     // 0-1, likelihood this fix will resolve the issue
  estimatedTime: number;  // Estimated time in minutes
  requiredActions: string[];
  affectedFiles?: string[];
  aiModelRecommendation?: 'claude' | 'gpt' | 'gemini' | 'deepseek';
}

export interface SubmissionHistory {
  appId: string;
  submissions: SubmissionRecord[];
  totalSubmissions: number;
  approvalRate: number;
  averageReviewTime: number;  // In hours
}

export interface SubmissionRecord {
  submissionId: string;
  versionString: string;
  buildNumber: string;
  submittedAt: Date;
  reviewedAt?: Date;
  status: ReviewStatus;
  rejectionReasons?: RejectionReason[];
  reviewDurationHours?: number;
  iterationNumber: number;
}

// ============================================================================
// Apple App Store Service Implementation
// ============================================================================

export class AppleAppStoreService {
  private client: AxiosInstance;
  private config: AppleAppStoreConfig;
  private submissionHistory: Map<string, SubmissionRecord[]> = new Map();
  private tokenCache: { token: string; expiresAt: number } | null = null;

  private static readonly BASE_URL = 'https://api.appstoreconnect.apple.com/v1';
  private static readonly TOKEN_EXPIRY_BUFFER = 60; // Refresh 60 seconds before expiry

  constructor(config?: AppleAppStoreConfig) {
    this.config = config || this.loadConfigFromEnv();
    this.validateConfig();
    this.client = this.createHttpClient();
  }

  /**
   * Load configuration from environment variables
   */
  private loadConfigFromEnv(): AppleAppStoreConfig {
    const keyId = process.env.APPLE_KEY_ID;
    const issuerId = process.env.APPLE_ISSUER_ID;
    const privateKey = process.env.APPLE_PRIVATE_KEY || process.env.APPLE_PRIVATE_KEY_PATH;

    if (!keyId || !issuerId || !privateKey) {
      throw new Error(
        'Apple App Store configuration incomplete. Required env vars: APPLE_KEY_ID, APPLE_ISSUER_ID, APPLE_PRIVATE_KEY'
      );
    }

    return {
      keyId,
      issuerId,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    };
  }

  /**
   * Validate configuration
   */
  private validateConfig(): void {
    if (!this.config.keyId || this.config.keyId.length < 10) {
      throw new Error('Invalid APPLE_KEY_ID: must be at least 10 characters');
    }
    if (!this.config.issuerId || !this.config.issuerId.includes('-')) {
      throw new Error('Invalid APPLE_ISSUER_ID: must be a valid UUID format');
    }
    if (!this.config.privateKey) {
      throw new Error('APPLE_PRIVATE_KEY is required');
    }
  }

  /**
   * Create HTTP client with interceptors
   */
  private createHttpClient(): AxiosInstance {
    const client = axios.create({
      baseURL: AppleAppStoreService.BASE_URL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    // Request interceptor for JWT auth
    client.interceptors.request.use(async (config) => {
      const token = await this.getValidToken();
      config.headers.Authorization = `Bearer ${token}`;
      return config;
    });

    // Response interceptor for error handling
    client.interceptors.response.use(
      (response) => response,
      (error: AxiosError) => {
        return this.handleApiError(error);
      }
    );

    return client;
  }

  /**
   * Get a valid JWT token, refreshing if necessary
   */
  private async getValidToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);

    if (this.tokenCache && this.tokenCache.expiresAt > now + AppleAppStoreService.TOKEN_EXPIRY_BUFFER) {
      return this.tokenCache.token;
    }

    const token = await this.generateJWT();
    this.tokenCache = {
      token,
      expiresAt: now + 1200, // 20 minutes
    };

    return token;
  }

  /**
   * Generate JWT token for App Store Connect API authentication
   */
  private async generateJWT(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);

    let privateKey = this.config.privateKey;

    // If privateKey is a file path, read the file
    if (privateKey.startsWith('/') || privateKey.startsWith('./') || privateKey.endsWith('.p8')) {
      try {
        privateKey = await fs.readFile(privateKey, 'utf-8');
      } catch (error) {
        throw new Error(`Failed to read private key file: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    const payload = {
      iss: this.config.issuerId,
      iat: now,
      exp: now + 1200, // 20 minutes (max allowed by Apple)
      aud: 'appstoreconnect-v1',
    };

    try {
      const token = sign(payload, privateKey, {
        algorithm: 'ES256',
        keyid: this.config.keyId,
      });

      return token;
    } catch (error) {
      throw new Error(`Failed to generate JWT: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Handle API errors with structured error responses
   */
  private handleApiError(error: AxiosError): never {
    const status = error.response?.status;
    const data = error.response?.data as any;

    let message = 'App Store Connect API error';
    let code = 'UNKNOWN_ERROR';

    if (data?.errors && Array.isArray(data.errors)) {
      const firstError = data.errors[0];
      code = firstError.code || code;
      message = firstError.detail || firstError.title || message;
    }

    const errorDetails: Record<number, { code: string; message: string }> = {
      401: { code: 'UNAUTHORIZED', message: 'Invalid or expired authentication token' },
      403: { code: 'FORBIDDEN', message: 'Insufficient permissions for this operation' },
      404: { code: 'NOT_FOUND', message: 'Resource not found' },
      409: { code: 'CONFLICT', message: 'Request conflicts with current state' },
      429: { code: 'RATE_LIMITED', message: 'Too many requests, please retry later' },
    };

    if (status && errorDetails[status]) {
      code = errorDetails[status].code;
      message = `${errorDetails[status].message}: ${message}`;
    }

    const enhancedError = new Error(message) as Error & { code: string; status?: number };
    enhancedError.code = code;
    enhancedError.status = status;

    throw enhancedError;
  }

  // ============================================================================
  // Core API Methods
  // ============================================================================

  /**
   * Submit app for review
   */
  async submitForReview(appId: string, buildInfo: {
    buildId: string;
    versionString: string;
    releaseType?: 'MANUAL' | 'AFTER_APPROVAL' | 'SCHEDULED';
    scheduledReleaseDate?: Date;
  }): Promise<ReviewSubmission> {
    console.log(`Submitting app ${appId} for review...`);

    try {
      // Step 1: Get or create the app store version
      let version = await this.getOrCreateVersion(appId, buildInfo.versionString, 'IOS');

      // Step 2: Set release type if specified
      if (buildInfo.releaseType) {
        await this.client.patch(`/appStoreVersions/${version.id}`, {
          data: {
            type: 'appStoreVersions',
            id: version.id,
            attributes: {
              releaseType: buildInfo.releaseType,
              ...(buildInfo.releaseType === 'SCHEDULED' && buildInfo.scheduledReleaseDate
                ? { earliestReleaseDate: buildInfo.scheduledReleaseDate.toISOString() }
                : {}),
            },
          },
        });
      }

      // Step 3: Attach build to version
      await this.attachBuildToVersion(version.id, buildInfo.buildId);

      // Step 4: Create submission
      const response = await this.client.post('/appStoreVersionSubmissions', {
        data: {
          type: 'appStoreVersionSubmissions',
          relationships: {
            appStoreVersion: {
              data: {
                type: 'appStoreVersions',
                id: version.id,
              },
            },
          },
        },
      });

      const submission = response.data.data;
      const submissionRecord: ReviewSubmission = {
        submissionId: submission.id,
        status: 'submitted',
        appVersionId: version.id,
        submittedAt: new Date(),
        reviewDetails: {
          reviewType: 'APP_STORE',
          state: 'WAITING_FOR_REVIEW',
          submittedDate: new Date().toISOString(),
        },
      };

      // Track in history
      this.trackSubmission(appId, {
        submissionId: submission.id,
        versionString: buildInfo.versionString,
        buildNumber: buildInfo.buildId,
        submittedAt: new Date(),
        status: 'submitted',
        iterationNumber: this.getNextIterationNumber(appId),
      });

      console.log(`Successfully submitted app ${appId} for review. Submission ID: ${submission.id}`);
      return submissionRecord;

    } catch (error) {
      console.error('Failed to submit for review:', error);
      throw new Error(`Failed to submit for review: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get current review status
   */
  async getReviewStatus(appId: string): Promise<{
    status: ReviewStatus;
    appStoreState: AppStoreState;
    version?: AppVersion;
    submissionId?: string;
    lastUpdated: Date;
  }> {
    try {
      // Get the latest app store version
      const response = await this.client.get(`/apps/${appId}/appStoreVersions`, {
        params: {
          'filter[platform]': 'IOS',
          sort: '-createdDate',
          limit: 1,
          'fields[appStoreVersions]': 'versionString,platform,appStoreState,createdDate,releaseType',
        },
      });

      if (response.data.data.length === 0) {
        return {
          status: 'processing',
          appStoreState: 'PREPARE_FOR_SUBMISSION',
          lastUpdated: new Date(),
        };
      }

      const versionData = response.data.data[0];
      const appStoreState = versionData.attributes.appStoreState as AppStoreState;

      const version: AppVersion = {
        id: versionData.id,
        versionString: versionData.attributes.versionString,
        platform: versionData.attributes.platform,
        appStoreState: appStoreState,
        releaseType: versionData.attributes.releaseType,
        createdDate: versionData.attributes.createdDate,
      };

      // Map App Store state to review status
      const status = this.mapAppStoreStateToReviewStatus(appStoreState);

      return {
        status,
        appStoreState,
        version,
        lastUpdated: new Date(),
      };

    } catch (error) {
      console.error('Failed to get review status:', error);
      throw new Error(`Failed to get review status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Parse rejection reasons from App Store Connect response
   * Returns structured data that TCI can use to auto-fix issues
   */
  async parseRejectionReasons(appId: string, versionId?: string): Promise<RejectionInfo> {
    try {
      // Get the version ID if not provided
      let targetVersionId = versionId;
      if (!targetVersionId) {
        const status = await this.getReviewStatus(appId);
        targetVersionId = status.version?.id;
      }

      if (!targetVersionId) {
        return {
          rejected: false,
          reasons: [],
          canResubmit: true,
        };
      }

      // Get app store review detail
      const reviewResponse = await this.client.get(`/appStoreVersions/${targetVersionId}`, {
        params: {
          include: 'appStoreReviewDetail',
          'fields[appStoreReviewDetails]': 'contactEmail,contactPhone,contactFirstName,contactLastName,demoAccountName,demoAccountPassword,demoAccountRequired,notes',
        },
      });

      const versionData = reviewResponse.data.data;
      const appStoreState = versionData.attributes.appStoreState as AppStoreState;

      // Check if actually rejected
      if (!['REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY'].includes(appStoreState)) {
        return {
          rejected: false,
          reasons: [],
          canResubmit: true,
        };
      }

      // Try to get rejection reasons from App Store Version Submissions
      let rejectionReasons: RejectionReason[] = [];

      try {
        const submissionsResponse = await this.client.get(`/appStoreVersions/${targetVersionId}/appStoreVersionSubmission`);

        // Parse any rejection data from the submission
        if (submissionsResponse.data.data) {
          // App Store Connect doesn't expose detailed rejection reasons via API
          // We need to parse from the review detail notes or use Resolution Center
          const reviewDetail = reviewResponse.data.included?.find((inc: any) => inc.type === 'appStoreReviewDetails');

          if (reviewDetail?.attributes?.notes) {
            rejectionReasons = this.parseRejectionNotes(reviewDetail.attributes.notes);
          }
        }
      } catch (e) {
        // Submission might not exist
        console.warn('Could not fetch submission details:', e);
      }

      // If no reasons found, create a generic one based on state
      if (rejectionReasons.length === 0) {
        rejectionReasons.push(this.createGenericRejectionReason(appStoreState));
      }

      return {
        rejected: true,
        rejectionType: appStoreState === 'INVALID_BINARY' ? 'binary' :
                       appStoreState === 'METADATA_REJECTED' ? 'metadata' : 'guideline',
        reasons: rejectionReasons,
        canResubmit: appStoreState !== 'INVALID_BINARY',
        resolutionUrl: `https://appstoreconnect.apple.com/apps/${appId}/appstore/resolution`,
      };

    } catch (error) {
      console.error('Failed to parse rejection reasons:', error);
      throw new Error(`Failed to parse rejection reasons: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get submission history for an app
   */
  async getSubmissionHistory(appId: string): Promise<SubmissionHistory> {
    try {
      // Get from local cache first
      const cachedHistory = this.submissionHistory.get(appId) || [];

      // Fetch versions from API
      const response = await this.client.get(`/apps/${appId}/appStoreVersions`, {
        params: {
          'filter[platform]': 'IOS',
          sort: '-createdDate',
          limit: 50,
          'fields[appStoreVersions]': 'versionString,appStoreState,createdDate',
        },
      });

      const versions = response.data.data || [];
      const submissions: SubmissionRecord[] = [];

      for (const version of versions) {
        const state = version.attributes.appStoreState as AppStoreState;
        const status = this.mapAppStoreStateToReviewStatus(state);

        // Find matching cached record or create new one
        const cachedRecord = cachedHistory.find(
          (r) => r.versionString === version.attributes.versionString
        );

        submissions.push({
          submissionId: cachedRecord?.submissionId || version.id,
          versionString: version.attributes.versionString,
          buildNumber: cachedRecord?.buildNumber || 'N/A',
          submittedAt: cachedRecord?.submittedAt || new Date(version.attributes.createdDate),
          reviewedAt: cachedRecord?.reviewedAt,
          status,
          rejectionReasons: cachedRecord?.rejectionReasons,
          reviewDurationHours: cachedRecord?.reviewDurationHours,
          iterationNumber: cachedRecord?.iterationNumber || 1,
        });
      }

      // Calculate statistics
      const approvedCount = submissions.filter((s) => s.status === 'approved').length;
      const reviewDurations = submissions
        .filter((s) => s.reviewDurationHours !== undefined)
        .map((s) => s.reviewDurationHours!);

      const averageReviewTime = reviewDurations.length > 0
        ? reviewDurations.reduce((a, b) => a + b, 0) / reviewDurations.length
        : 24; // Default assumption

      return {
        appId,
        submissions,
        totalSubmissions: submissions.length,
        approvalRate: submissions.length > 0 ? approvedCount / submissions.length : 0,
        averageReviewTime,
      };

    } catch (error) {
      console.error('Failed to get submission history:', error);
      throw new Error(`Failed to get submission history: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update app metadata (localized info)
   */
  async updateAppMetadata(appId: string, metadata: AppMetadata): Promise<void> {
    try {
      const locale = metadata.locale || 'en-US';

      // Get the latest version
      const versionResponse = await this.client.get(`/apps/${appId}/appStoreVersions`, {
        params: {
          'filter[platform]': 'IOS',
          'filter[appStoreState]': 'PREPARE_FOR_SUBMISSION,WAITING_FOR_REVIEW,DEVELOPER_REJECTED',
          sort: '-createdDate',
          limit: 1,
        },
      });

      if (versionResponse.data.data.length === 0) {
        throw new Error('No editable app version found. Create a new version first.');
      }

      const versionId = versionResponse.data.data[0].id;

      // Get or create localization
      const localizationsResponse = await this.client.get(
        `/appStoreVersions/${versionId}/appStoreVersionLocalizations`
      );

      let localizationId: string | null = null;

      for (const loc of localizationsResponse.data.data) {
        if (loc.attributes.locale === locale) {
          localizationId = loc.id;
          break;
        }
      }

      const localizationAttributes: Record<string, any> = {};

      if (metadata.description) localizationAttributes.description = metadata.description;
      if (metadata.keywords) localizationAttributes.keywords = metadata.keywords;
      if (metadata.whatsNew) localizationAttributes.whatsNew = metadata.whatsNew;
      if (metadata.promotionalText) localizationAttributes.promotionalText = metadata.promotionalText;
      if (metadata.marketingUrl) localizationAttributes.marketingUrl = metadata.marketingUrl;
      if (metadata.supportUrl) localizationAttributes.supportUrl = metadata.supportUrl;

      if (localizationId) {
        // Update existing localization
        await this.client.patch(`/appStoreVersionLocalizations/${localizationId}`, {
          data: {
            type: 'appStoreVersionLocalizations',
            id: localizationId,
            attributes: localizationAttributes,
          },
        });
      } else {
        // Create new localization
        await this.client.post('/appStoreVersionLocalizations', {
          data: {
            type: 'appStoreVersionLocalizations',
            attributes: {
              locale,
              ...localizationAttributes,
            },
            relationships: {
              appStoreVersion: {
                data: {
                  type: 'appStoreVersions',
                  id: versionId,
                },
              },
            },
          },
        });
      }

      // Update app-level info if needed
      if (metadata.privacyPolicyUrl) {
        const appInfoResponse = await this.client.get(`/apps/${appId}/appInfos`, {
          params: { limit: 1 },
        });

        if (appInfoResponse.data.data.length > 0) {
          const appInfoId = appInfoResponse.data.data[0].id;

          // Get app info localization
          const appInfoLocsResponse = await this.client.get(
            `/appInfos/${appInfoId}/appInfoLocalizations`
          );

          const appInfoLoc = appInfoLocsResponse.data.data.find(
            (loc: any) => loc.attributes.locale === locale
          );

          if (appInfoLoc) {
            await this.client.patch(`/appInfoLocalizations/${appInfoLoc.id}`, {
              data: {
                type: 'appInfoLocalizations',
                id: appInfoLoc.id,
                attributes: {
                  privacyPolicyUrl: metadata.privacyPolicyUrl,
                  ...(metadata.privacyChoicesUrl ? { privacyChoicesUrl: metadata.privacyChoicesUrl } : {}),
                  ...(metadata.name ? { name: metadata.name } : {}),
                  ...(metadata.subtitle ? { subtitle: metadata.subtitle } : {}),
                },
              },
            });
          }
        }
      }

      console.log(`Successfully updated metadata for app ${appId} (locale: ${locale})`);

    } catch (error) {
      console.error('Failed to update app metadata:', error);
      throw new Error(`Failed to update app metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  // ============================================================================
  // Helper Methods
  // ============================================================================

  /**
   * Get or create an app store version
   */
  private async getOrCreateVersion(
    appId: string,
    versionString: string,
    platform: 'IOS' | 'MAC_OS' | 'TV_OS' | 'VISION_OS'
  ): Promise<AppVersion> {
    // Check for existing version
    const response = await this.client.get(`/apps/${appId}/appStoreVersions`, {
      params: {
        'filter[platform]': platform,
        'filter[versionString]': versionString,
        limit: 1,
      },
    });

    if (response.data.data.length > 0) {
      const v = response.data.data[0];
      return {
        id: v.id,
        versionString: v.attributes.versionString,
        platform: v.attributes.platform,
        appStoreState: v.attributes.appStoreState,
        copyright: v.attributes.copyright,
        releaseType: v.attributes.releaseType,
      };
    }

    // Create new version
    const createResponse = await this.client.post('/appStoreVersions', {
      data: {
        type: 'appStoreVersions',
        attributes: {
          versionString,
          platform,
          copyright: `Copyright ${new Date().getFullYear()}`,
        },
        relationships: {
          app: {
            data: {
              type: 'apps',
              id: appId,
            },
          },
        },
      },
    });

    const newVersion = createResponse.data.data;
    return {
      id: newVersion.id,
      versionString: newVersion.attributes.versionString,
      platform: newVersion.attributes.platform,
      appStoreState: newVersion.attributes.appStoreState,
      copyright: newVersion.attributes.copyright,
      releaseType: newVersion.attributes.releaseType,
    };
  }

  /**
   * Attach a build to a version
   */
  private async attachBuildToVersion(versionId: string, buildId: string): Promise<void> {
    await this.client.patch(`/appStoreVersions/${versionId}/relationships/build`, {
      data: {
        type: 'builds',
        id: buildId,
      },
    });
  }

  /**
   * Map App Store state to review status
   */
  private mapAppStoreStateToReviewStatus(state: AppStoreState): ReviewStatus {
    const stateMap: Record<AppStoreState, ReviewStatus> = {
      'ACCEPTED': 'approved',
      'DEVELOPER_REJECTED': 'rejected',
      'DEVELOPER_REMOVED_FROM_SALE': 'approved',
      'IN_REVIEW': 'in_review',
      'INVALID_BINARY': 'invalid_binary',
      'METADATA_REJECTED': 'metadata_rejected',
      'PENDING_APPLE_RELEASE': 'pending_developer_release',
      'PENDING_CONTRACT': 'processing',
      'PENDING_DEVELOPER_RELEASE': 'pending_developer_release',
      'PREPARE_FOR_SUBMISSION': 'processing',
      'PREORDER_READY_FOR_SALE': 'approved',
      'PROCESSING_FOR_APP_STORE': 'processing',
      'READY_FOR_REVIEW': 'waiting_for_review',
      'READY_FOR_SALE': 'approved',
      'REJECTED': 'rejected',
      'REMOVED_FROM_SALE': 'approved',
      'WAITING_FOR_EXPORT_COMPLIANCE': 'waiting_for_review',
      'WAITING_FOR_REVIEW': 'waiting_for_review',
    };

    return stateMap[state] || 'processing';
  }

  /**
   * Parse rejection notes into structured reasons
   */
  private parseRejectionNotes(notes: string): RejectionReason[] {
    const reasons: RejectionReason[] = [];

    // Common Apple guideline patterns
    const guidelinePatterns = [
      { regex: /Guideline\s+1\.(\d+(?:\.\d+)?)/gi, category: 'safety' as RejectionCategory },
      { regex: /Guideline\s+2\.(\d+(?:\.\d+)?)/gi, category: 'performance' as RejectionCategory },
      { regex: /Guideline\s+3\.(\d+(?:\.\d+)?)/gi, category: 'business' as RejectionCategory },
      { regex: /Guideline\s+4\.(\d+(?:\.\d+)?)/gi, category: 'design' as RejectionCategory },
      { regex: /Guideline\s+5\.(\d+(?:\.\d+)?)/gi, category: 'legal' as RejectionCategory },
    ];

    // Known auto-fixable rejection patterns
    const autoFixablePatterns = [
      { pattern: /screenshot/i, category: 'screenshot', autoFixable: true, strategy: 'asset_regeneration' },
      { pattern: /metadata|description|keyword/i, category: 'metadata', autoFixable: true, strategy: 'metadata_update' },
      { pattern: /privacy\s*policy/i, category: 'privacy', autoFixable: true, strategy: 'metadata_update' },
      { pattern: /crash|bug|error/i, category: 'technical', autoFixable: false, strategy: 'code_change' },
      { pattern: /copyright|trademark/i, category: 'legal', autoFixable: false, strategy: 'manual_required' },
    ];

    // Parse guideline references
    for (const { regex, category } of guidelinePatterns) {
      let match;
      while ((match = regex.exec(notes)) !== null) {
        const guidelineCode = `Guideline ${category === 'safety' ? '1' :
                                          category === 'performance' ? '2' :
                                          category === 'business' ? '3' :
                                          category === 'design' ? '4' : '5'}.${match[1]}`;

        const reason: RejectionReason = {
          id: crypto.randomUUID(),
          category,
          guidelineCode,
          message: notes,
          severity: 'blocking',
          tciAutoFixable: false,
        };

        // Check if this matches any auto-fixable pattern
        for (const afp of autoFixablePatterns) {
          if (afp.pattern.test(notes)) {
            reason.tciAutoFixable = afp.autoFixable;
            reason.tciFixStrategy = {
              type: afp.strategy as any,
              confidence: afp.autoFixable ? 0.8 : 0.3,
              estimatedTime: afp.autoFixable ? 15 : 60,
              requiredActions: this.getRequiredActions(afp.strategy),
              aiModelRecommendation: 'claude',
            };
            break;
          }
        }

        reasons.push(reason);
      }
    }

    // If no specific guidelines found, create a generic reason
    if (reasons.length === 0 && notes.trim()) {
      let category: RejectionCategory = 'unknown';
      let autoFixable = false;
      let strategy: TCIFixStrategy['type'] = 'manual_required';

      for (const afp of autoFixablePatterns) {
        if (afp.pattern.test(notes)) {
          category = afp.category as RejectionCategory;
          autoFixable = afp.autoFixable;
          strategy = afp.strategy as any;
          break;
        }
      }

      reasons.push({
        id: crypto.randomUUID(),
        category,
        message: notes,
        severity: 'blocking',
        tciAutoFixable: autoFixable,
        tciFixStrategy: {
          type: strategy,
          confidence: autoFixable ? 0.7 : 0.2,
          estimatedTime: autoFixable ? 20 : 120,
          requiredActions: this.getRequiredActions(strategy),
          aiModelRecommendation: 'claude',
        },
      });
    }

    return reasons;
  }

  /**
   * Create a generic rejection reason based on state
   */
  private createGenericRejectionReason(state: AppStoreState): RejectionReason {
    const stateReasons: Partial<Record<AppStoreState, { message: string; category: RejectionCategory; autoFixable: boolean }>> = {
      'REJECTED': {
        message: 'Your app was rejected. Please check the Resolution Center in App Store Connect for details.',
        category: 'unknown',
        autoFixable: false,
      },
      'METADATA_REJECTED': {
        message: 'App metadata requires changes. Check screenshots, descriptions, or other metadata.',
        category: 'metadata',
        autoFixable: true,
      },
      'INVALID_BINARY': {
        message: 'The uploaded binary is invalid. Please rebuild and resubmit.',
        category: 'technical',
        autoFixable: false,
      },
    };

    const reasonInfo = stateReasons[state] || {
      message: 'Unknown rejection reason. Please check App Store Connect.',
      category: 'unknown' as RejectionCategory,
      autoFixable: false,
    };

    return {
      id: crypto.randomUUID(),
      category: reasonInfo.category,
      message: reasonInfo.message,
      severity: 'blocking',
      tciAutoFixable: reasonInfo.autoFixable,
      tciFixStrategy: reasonInfo.autoFixable ? {
        type: 'metadata_update',
        confidence: 0.6,
        estimatedTime: 30,
        requiredActions: ['Review metadata', 'Update descriptions or screenshots', 'Resubmit'],
        aiModelRecommendation: 'claude',
      } : undefined,
    };
  }

  /**
   * Get required actions for a fix strategy
   */
  private getRequiredActions(strategy: string): string[] {
    const actionsMap: Record<string, string[]> = {
      'code_change': [
        'Identify the code issue',
        'Implement the fix',
        'Run tests',
        'Create new build',
        'Resubmit',
      ],
      'metadata_update': [
        'Review rejection feedback',
        'Update app metadata',
        'Verify changes',
        'Resubmit',
      ],
      'asset_regeneration': [
        'Generate new screenshots/icons',
        'Verify asset dimensions and quality',
        'Upload new assets',
        'Resubmit',
      ],
      'config_update': [
        'Review app configuration',
        'Update entitlements or capabilities',
        'Rebuild app',
        'Resubmit',
      ],
      'manual_required': [
        'Review rejection details in Resolution Center',
        'Contact Apple if needed',
        'Make necessary changes',
        'Resubmit when ready',
      ],
    };

    return actionsMap[strategy] || actionsMap['manual_required'];
  }

  /**
   * Track a submission in local history
   */
  private trackSubmission(appId: string, record: SubmissionRecord): void {
    const history = this.submissionHistory.get(appId) || [];
    history.push(record);
    this.submissionHistory.set(appId, history);
  }

  /**
   * Get the next iteration number for an app
   */
  private getNextIterationNumber(appId: string): number {
    const history = this.submissionHistory.get(appId) || [];
    return history.length + 1;
  }

  // ============================================================================
  // Additional Utility Methods
  // ============================================================================

  /**
   * Get app by bundle ID
   */
  async getAppByBundleId(bundleId: string): Promise<AppInfo | null> {
    try {
      const response = await this.client.get('/apps', {
        params: {
          'filter[bundleId]': bundleId,
          limit: 1,
        },
      });

      if (response.data.data.length === 0) {
        return null;
      }

      const app = response.data.data[0];
      return {
        id: app.id,
        name: app.attributes.name,
        bundleId: app.attributes.bundleId,
        sku: app.attributes.sku,
        primaryLocale: app.attributes.primaryLocale,
      };
    } catch (error) {
      console.error('Failed to get app by bundle ID:', error);
      throw new Error(`Failed to get app: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get builds for an app
   */
  async getBuilds(appId: string, limit: number = 10): Promise<BuildInfo[]> {
    try {
      const response = await this.client.get(`/apps/${appId}/builds`, {
        params: {
          limit,
          sort: '-uploadedDate',
          'fields[builds]': 'version,uploadedDate,processingState,usesNonExemptEncryption,minOsVersion',
        },
      });

      return response.data.data.map((build: any) => ({
        id: build.id,
        version: build.attributes.version,
        buildNumber: build.attributes.version,
        uploadedDate: build.attributes.uploadedDate,
        processingState: build.attributes.processingState,
        usesNonExemptEncryption: build.attributes.usesNonExemptEncryption,
        minOsVersion: build.attributes.minOsVersion,
      }));
    } catch (error) {
      console.error('Failed to get builds:', error);
      throw new Error(`Failed to get builds: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Cancel a pending submission
   */
  async cancelSubmission(submissionId: string): Promise<void> {
    try {
      await this.client.delete(`/appStoreVersionSubmissions/${submissionId}`);
      console.log(`Successfully cancelled submission ${submissionId}`);
    } catch (error) {
      console.error('Failed to cancel submission:', error);
      throw new Error(`Failed to cancel submission: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if the service is properly configured
   */
  async healthCheck(): Promise<{ healthy: boolean; message: string }> {
    try {
      // Try to list apps (minimal API call)
      await this.client.get('/apps', { params: { limit: 1 } });
      return { healthy: true, message: 'App Store Connect API is accessible' };
    } catch (error) {
      return {
        healthy: false,
        message: `App Store Connect API error: ${error instanceof Error ? error.message : 'Unknown error'}`,
      };
    }
  }
}

// Export singleton factory
export function createAppleAppStoreService(config?: AppleAppStoreConfig): AppleAppStoreService {
  return new AppleAppStoreService(config);
}

export default AppleAppStoreService;

import axios, { AxiosInstance } from 'axios';
import { sign } from 'jsonwebtoken';
import * as fs from 'fs/promises';
import * as path from 'path';
import FormData from 'form-data';

/**
 * App Store Connect API Client
 * Implements real App Store Connect REST API integration
 * Docs: https://developer.apple.com/documentation/appstoreconnectapi
 */

export interface AppStoreConnectConfig {
  keyId: string;
  issuerId: string;
  privateKey: string; // PEM format or file path
  bundleId: string;
}

export interface AppInfo {
  id: string;
  name: string;
  bundleId: string;
  sku: string;
  primaryLocale: string;
}

export interface AppStoreVersion {
  id: string;
  versionString: string;
  platform: 'IOS' | 'MAC_OS' | 'TV_OS';
  appStoreState: string;
  copyright?: string;
  releaseType?: 'MANUAL' | 'AFTER_APPROVAL' | 'SCHEDULED';
}

export interface Build {
  id: string;
  version: string;
  uploadedDate: string;
  processingState: string;
  usesNonExemptEncryption?: boolean;
}

export interface AppScreenshot {
  id: string;
  fileName: string;
  fileSize: number;
  sourceFileChecksum: string;
  imageAsset: {
    templateUrl: string;
    width: number;
    height: number;
  };
  uploadOperations: Array<{
    method: string;
    url: string;
    length: number;
    offset: number;
    requestHeaders: Array<{ name: string; value: string }>;
  }>;
}

export interface SubmissionResult {
  submissionId: string;
  status: 'submitted' | 'pending' | 'processing' | 'rejected' | 'approved';
  storeUrl?: string;
  submittedAt: Date;
  reviewDetails?: {
    reviewType: string;
    state: string;
  };
}

export class AppStoreConnectAPI {
  private client: AxiosInstance;
  private config: AppStoreConnectConfig;
  private baseURL = 'https://api.appstoreconnect.apple.com/v1';

  constructor(config: AppStoreConnectConfig) {
    this.config = config;
    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Add JWT auth interceptor
    this.client.interceptors.request.use(async (config) => {
      const token = await this.generateJWT();
      config.headers.Authorization = `Bearer ${token}`;
      return config;
    });
  }

  /**
   * Generate JWT token for App Store Connect API authentication
   */
  private async generateJWT(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);

    let privateKey = this.config.privateKey;

    // If privateKey is a file path, read the file
    if (privateKey.startsWith('/') || privateKey.startsWith('./')) {
      privateKey = await fs.readFile(privateKey, 'utf-8');
    }

    const payload = {
      iss: this.config.issuerId,
      iat: now,
      exp: now + 1200, // 20 minutes (max allowed by Apple)
      aud: 'appstoreconnect-v1',
    };

    const token = sign(payload, privateKey, {
      algorithm: 'ES256',
      keyid: this.config.keyId,
    });

    return token;
  }

  /**
   * Get app information by bundle ID
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
   * Create a new app in App Store Connect
   */
  async createApp(data: {
    name: string;
    bundleId: string;
    sku: string;
    primaryLocale: string;
  }): Promise<AppInfo> {
    try {
      const response = await this.client.post('/apps', {
        data: {
          type: 'apps',
          attributes: {
            name: data.name,
            bundleId: data.bundleId,
            sku: data.sku,
            primaryLocale: data.primaryLocale,
          },
        },
      });

      const app = response.data.data;
      return {
        id: app.id,
        name: app.attributes.name,
        bundleId: app.attributes.bundleId,
        sku: app.attributes.sku,
        primaryLocale: app.attributes.primaryLocale,
      };
    } catch (error) {
      console.error('Failed to create app:', error);
      throw new Error(`Failed to create app: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get builds for an app
   */
  async getBuilds(appId: string, limit: number = 10): Promise<Build[]> {
    try {
      const response = await this.client.get(`/apps/${appId}/builds`, {
        params: {
          limit,
          sort: '-uploadedDate',
        },
      });

      return response.data.data.map((build: any) => ({
        id: build.id,
        version: build.attributes.version,
        uploadedDate: build.attributes.uploadedDate,
        processingState: build.attributes.processingState,
        usesNonExemptEncryption: build.attributes.usesNonExemptEncryption,
      }));
    } catch (error) {
      console.error('Failed to get builds:', error);
      throw new Error(`Failed to get builds: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Create a new App Store version
   */
  async createAppStoreVersion(data: {
    appId: string;
    versionString: string;
    platform: 'IOS' | 'MAC_OS' | 'TV_OS';
    copyright?: string;
  }): Promise<AppStoreVersion> {
    try {
      const response = await this.client.post('/appStoreVersions', {
        data: {
          type: 'appStoreVersions',
          attributes: {
            versionString: data.versionString,
            platform: data.platform,
            copyright: data.copyright,
          },
          relationships: {
            app: {
              data: {
                type: 'apps',
                id: data.appId,
              },
            },
          },
        },
      });

      const version = response.data.data;
      return {
        id: version.id,
        versionString: version.attributes.versionString,
        platform: version.attributes.platform,
        appStoreState: version.attributes.appStoreState,
        copyright: version.attributes.copyright,
        releaseType: version.attributes.releaseType,
      };
    } catch (error) {
      console.error('Failed to create App Store version:', error);
      throw new Error(`Failed to create version: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update App Store version localization
   */
  async updateVersionLocalization(data: {
    versionId: string;
    locale: string;
    description: string;
    keywords: string;
    whatsNew?: string;
    marketingUrl?: string;
    supportUrl?: string;
    promotionalText?: string;
  }): Promise<void> {
    try {
      // First, get or create the localization
      const localizationsResponse = await this.client.get(
        `/appStoreVersions/${data.versionId}/appStoreVersionLocalizations`
      );

      let localizationId: string | null = null;

      // Check if localization exists for this locale
      for (const loc of localizationsResponse.data.data) {
        if (loc.attributes.locale === data.locale) {
          localizationId = loc.id;
          break;
        }
      }

      if (localizationId) {
        // Update existing localization
        await this.client.patch(`/appStoreVersionLocalizations/${localizationId}`, {
          data: {
            type: 'appStoreVersionLocalizations',
            id: localizationId,
            attributes: {
              description: data.description,
              keywords: data.keywords,
              whatsNew: data.whatsNew,
              marketingUrl: data.marketingUrl,
              supportUrl: data.supportUrl,
              promotionalText: data.promotionalText,
            },
          },
        });
      } else {
        // Create new localization
        await this.client.post('/appStoreVersionLocalizations', {
          data: {
            type: 'appStoreVersionLocalizations',
            attributes: {
              locale: data.locale,
              description: data.description,
              keywords: data.keywords,
              whatsNew: data.whatsNew,
              marketingUrl: data.marketingUrl,
              supportUrl: data.supportUrl,
              promotionalText: data.promotionalText,
            },
            relationships: {
              appStoreVersion: {
                data: {
                  type: 'appStoreVersions',
                  id: data.versionId,
                },
              },
            },
          },
        });
      }
    } catch (error) {
      console.error('Failed to update version localization:', error);
      throw new Error(`Failed to update localization: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Upload screenshot
   */
  async uploadScreenshot(data: {
    versionId: string;
    locale: string;
    screenshotType:
      | 'APP_IPHONE_67'
      | 'APP_IPHONE_65'
      | 'APP_IPHONE_58'
      | 'APP_IPHONE_55'
      | 'APP_IPHONE_47'
      | 'APP_IPHONE_40'
      | 'APP_IPAD_PRO_3GEN_129'
      | 'APP_IPAD_PRO_129'
      | 'APP_IPAD_105'
      | 'APP_IPAD_97';
    filePath: string;
  }): Promise<AppScreenshot> {
    try {
      // Step 1: Get file info
      const fileStats = await fs.stat(data.filePath);
      const fileName = path.basename(data.filePath);
      const fileBuffer = await fs.readFile(data.filePath);
      const checksum = require('crypto')
        .createHash('md5')
        .update(fileBuffer)
        .digest('hex');

      // Step 2: Get localization ID
      const localizationsResponse = await this.client.get(
        `/appStoreVersions/${data.versionId}/appStoreVersionLocalizations`
      );
      const localization = localizationsResponse.data.data.find(
        (loc: any) => loc.attributes.locale === data.locale
      );

      if (!localization) {
        throw new Error(`Localization not found for locale: ${data.locale}`);
      }

      // Step 3: Reserve screenshot slot
      const reserveResponse = await this.client.post('/appScreenshotSets', {
        data: {
          type: 'appScreenshotSets',
          attributes: {
            screenshotDisplayType: data.screenshotType,
          },
          relationships: {
            appStoreVersionLocalization: {
              data: {
                type: 'appStoreVersionLocalizations',
                id: localization.id,
              },
            },
          },
        },
      });

      const screenshotSetId = reserveResponse.data.data.id;

      // Step 4: Create screenshot
      const createResponse = await this.client.post('/appScreenshots', {
        data: {
          type: 'appScreenshots',
          attributes: {
            fileName: fileName,
            fileSize: fileStats.size,
          },
          relationships: {
            appScreenshotSet: {
              data: {
                type: 'appScreenshotSets',
                id: screenshotSetId,
              },
            },
          },
        },
      });

      const screenshot = createResponse.data.data;
      const uploadOperations = screenshot.attributes.uploadOperations;

      // Step 5: Upload file chunks
      for (const operation of uploadOperations) {
        const chunk = fileBuffer.slice(operation.offset, operation.offset + operation.length);
        const headers: Record<string, string> = {};

        for (const header of operation.requestHeaders) {
          headers[header.name] = header.value;
        }

        await axios({
          method: operation.method,
          url: operation.url,
          data: chunk,
          headers: headers,
        });
      }

      // Step 6: Commit screenshot
      await this.client.patch(`/appScreenshots/${screenshot.id}`, {
        data: {
          type: 'appScreenshots',
          id: screenshot.id,
          attributes: {
            sourceFileChecksum: checksum,
            uploaded: true,
          },
        },
      });

      return {
        id: screenshot.id,
        fileName: screenshot.attributes.fileName,
        fileSize: screenshot.attributes.fileSize,
        sourceFileChecksum: checksum,
        imageAsset: screenshot.attributes.imageAsset,
        uploadOperations: uploadOperations,
      };
    } catch (error) {
      console.error('Failed to upload screenshot:', error);
      throw new Error(`Failed to upload screenshot: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Attach build to App Store version
   */
  async attachBuildToVersion(versionId: string, buildId: string): Promise<void> {
    try {
      await this.client.post(`/appStoreVersions/${versionId}/relationships/build`, {
        data: {
          type: 'builds',
          id: buildId,
        },
      });
    } catch (error) {
      console.error('Failed to attach build to version:', error);
      throw new Error(`Failed to attach build: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Submit App Store version for review
   */
  async submitForReview(versionId: string): Promise<SubmissionResult> {
    try {
      // Create submission
      const response = await this.client.post('/appStoreVersionSubmissions', {
        data: {
          type: 'appStoreVersionSubmissions',
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

      const submission = response.data.data;

      // Get version details to construct store URL
      const versionResponse = await this.client.get(`/appStoreVersions/${versionId}`, {
        params: {
          'include': 'app',
        },
      });

      const app = versionResponse.data.included?.find((inc: any) => inc.type === 'apps');
      const bundleId = app?.attributes?.bundleId;

      return {
        submissionId: submission.id,
        status: 'submitted',
        storeUrl: bundleId ? `https://apps.apple.com/app/${bundleId}` : undefined,
        submittedAt: new Date(),
        reviewDetails: {
          reviewType: 'APP_STORE',
          state: 'WAITING_FOR_REVIEW',
        },
      };
    } catch (error) {
      console.error('Failed to submit for review:', error);
      throw new Error(`Failed to submit for review: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get submission status
   */
  async getSubmissionStatus(submissionId: string): Promise<{
    state: string;
    submittedDate?: string;
  }> {
    try {
      const response = await this.client.get(`/appStoreVersionSubmissions/${submissionId}`);

      return {
        state: response.data.data.attributes.state || 'UNKNOWN',
        submittedDate: response.data.data.attributes.submittedDate,
      };
    } catch (error) {
      console.error('Failed to get submission status:', error);
      throw new Error(`Failed to get status: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get rejection details if the app was rejected
   */
  async getRejectionDetails(versionId: string): Promise<{
    rejected: boolean;
    reasons?: string[];
    reviewerNotes?: string;
  }> {
    try {
      const response = await this.client.get(`/appStoreVersions/${versionId}/appStoreReviewDetail`);

      if (!response.data.data) {
        return { rejected: false };
      }

      const reviewDetail = response.data.data.attributes;

      return {
        rejected: reviewDetail.appStoreState === 'REJECTED',
        reasons: reviewDetail.contactEmail ? [reviewDetail.contactEmail] : [],
        reviewerNotes: reviewDetail.contactPhone,
      };
    } catch (error) {
      console.error('Failed to get rejection details:', error);
      return { rejected: false };
    }
  }
}

export default AppStoreConnectAPI;

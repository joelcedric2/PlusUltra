import { AppStoreConnectAPI, AppStoreConnectConfig, SubmissionResult as AppStoreSubmission } from '../store/AppStoreConnectAPI';
import { GooglePlayDeveloperAPI, GooglePlayConfig, PlayStoreSubmissionResult } from '../store/GooglePlayDeveloperAPI';
import { EASBuildService, BuildConfig, BuildResult } from '../build/EASBuildService';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Store Submission Orchestrator
 * Coordinates the complete app submission workflow across multiple platforms
 * Integrates with real App Store Connect and Google Play Developer APIs
 */

export interface SubmissionConfig {
  projectPath: string;
  platform: 'ios' | 'android' | 'both';
  appName: string;
  bundleId: string;
  packageName: string;
  version: string;
  buildNumber: string;
  description: string;
  shortDescription?: string;
  keywords?: string[];
  category?: string;
  privacyPolicyUrl?: string;
  supportUrl?: string;
  marketingUrl?: string;
  releaseNotes?: string;
  screenshots?: {
    ios?: {
      iPhone67?: string[];
      iPhone65?: string[];
      iPadPro129?: string[];
    };
    android?: {
      phone?: string[];
      tablet7?: string[];
      tablet10?: string[];
      featureGraphic?: string;
    };
  };
  locale?: string;
}

export interface OrchestrationResult {
  success: boolean;
  ios?: {
    success: boolean;
    submission?: AppStoreSubmission;
    build?: BuildResult;
    error?: string;
  };
  android?: {
    success: boolean;
    submission?: PlayStoreSubmissionResult;
    build?: BuildResult;
    error?: string;
  };
  errors?: string[];
}

export class StoreSubmissionOrchestrator {
  private appStoreAPI?: AppStoreConnectAPI;
  private googlePlayAPI?: GooglePlayDeveloperAPI;
  private easBuildService: EASBuildService;

  constructor(
    appStoreConfig?: AppStoreConnectConfig,
    googlePlayConfig?: GooglePlayConfig
  ) {
    if (appStoreConfig) {
      this.appStoreAPI = new AppStoreConnectAPI(appStoreConfig);
    }

    if (googlePlayConfig) {
      this.googlePlayAPI = new GooglePlayDeveloperAPI(googlePlayConfig);
    }

    this.easBuildService = new EASBuildService();
  }

  /**
   * Static factory method to create from environment variables
   */
  static fromEnv(): StoreSubmissionOrchestrator {
    const appStoreConfig: AppStoreConnectConfig | undefined =
      process.env.APPLE_KEY_ID &&
      process.env.APPLE_ISSUER_ID &&
      process.env.APPLE_PRIVATE_KEY
        ? {
            keyId: process.env.APPLE_KEY_ID,
            issuerId: process.env.APPLE_ISSUER_ID,
            privateKey: process.env.APPLE_PRIVATE_KEY,
            bundleId: process.env.IOS_BUNDLE_ID || '',
          }
        : undefined;

    const googlePlayConfig: GooglePlayConfig | undefined =
      process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      process.env.GOOGLE_SERVICE_ACCOUNT_KEY
        ? {
            serviceAccountEmail: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            serviceAccountKey: process.env.GOOGLE_SERVICE_ACCOUNT_KEY,
            packageName: process.env.ANDROID_PACKAGE_NAME || '',
          }
        : undefined;

    return new StoreSubmissionOrchestrator(appStoreConfig, googlePlayConfig);
  }

  /**
   * Complete end-to-end submission workflow
   */
  async submitApp(config: SubmissionConfig): Promise<OrchestrationResult> {
    const result: OrchestrationResult = {
      success: false,
      errors: [],
    };

    // Submit to iOS App Store
    if ((config.platform === 'ios' || config.platform === 'both') && this.appStoreAPI) {
      result.ios = await this.submitToAppStore(config);
      if (!result.ios.success) {
        result.errors?.push(`iOS submission failed: ${result.ios.error}`);
      }
    }

    // Submit to Google Play
    if ((config.platform === 'android' || config.platform === 'both') && this.googlePlayAPI) {
      result.android = await this.submitToGooglePlay(config);
      if (!result.android.success) {
        result.errors?.push(`Android submission failed: ${result.android.error}`);
      }
    }

    result.success =
      (result.ios?.success ?? false) || (result.android?.success ?? false);

    return result;
  }

  /**
   * Submit to iOS App Store
   */
  private async submitToAppStore(config: SubmissionConfig): Promise<{
    success: boolean;
    submission?: AppStoreSubmission;
    build?: BuildResult;
    error?: string;
  }> {
    if (!this.appStoreAPI) {
      return { success: false, error: 'App Store API not configured' };
    }

    try {
      // Step 1: Trigger EAS build for iOS
      console.log('Building iOS app...');
      const buildResult = await this.easBuildService.triggerBuild(config.projectPath, {
        platform: 'ios',
        profile: 'production',
        metadata: {
          name: config.appName,
          version: config.version,
          buildNumber: config.buildNumber,
          bundleIdentifier: config.bundleId,
        },
      });

      if (buildResult.status !== 'success' || !buildResult.buildId) {
        return { success: false, build: buildResult, error: buildResult.error };
      }

      console.log('iOS build successful:', buildResult.buildId);

      // Step 2: Get or create app in App Store Connect
      let app = await this.appStoreAPI.getAppByBundleId(config.bundleId);

      if (!app) {
        console.log('Creating new app in App Store Connect...');
        app = await this.appStoreAPI.createApp({
          name: config.appName,
          bundleId: config.bundleId,
          sku: config.bundleId.split('.').pop() || config.appName,
          primaryLocale: config.locale || 'en-US',
        });
      }

      // Step 3: Get the latest build
      const builds = await this.appStoreAPI.getBuilds(app.id, 1);
      if (builds.length === 0) {
        return { success: false, error: 'No builds available after build completion' };
      }
      const latestBuild = builds[0];

      // Step 4: Create App Store version
      console.log('Creating App Store version...');
      const version = await this.appStoreAPI.createAppStoreVersion({
        appId: app.id,
        versionString: config.version,
        platform: 'IOS',
        copyright: `© ${new Date().getFullYear()} ${config.appName}`,
      });

      // Step 5: Update version localization
      console.log('Updating version localization...');
      await this.appStoreAPI.updateVersionLocalization({
        versionId: version.id,
        locale: config.locale || 'en-US',
        description: config.description,
        keywords: config.keywords?.join(',') || 'app,mobile,productivity',
        whatsNew: config.releaseNotes || 'Bug fixes and performance improvements',
        marketingUrl: config.marketingUrl,
        supportUrl: config.supportUrl,
      });

      // Step 6: Upload screenshots
      if (config.screenshots?.ios) {
        console.log('Uploading iOS screenshots...');
        const locale = config.locale || 'en-US';

        // Upload iPhone 6.7" screenshots
        if (config.screenshots.ios.iPhone67) {
          for (const screenshot of config.screenshots.ios.iPhone67) {
            await this.appStoreAPI.uploadScreenshot({
              versionId: version.id,
              locale: locale,
              screenshotType: 'APP_IPHONE_67',
              filePath: screenshot,
            });
          }
        }

        // Upload iPhone 6.5" screenshots
        if (config.screenshots.ios.iPhone65) {
          for (const screenshot of config.screenshots.ios.iPhone65) {
            await this.appStoreAPI.uploadScreenshot({
              versionId: version.id,
              locale: locale,
              screenshotType: 'APP_IPHONE_65',
              filePath: screenshot,
            });
          }
        }

        // Upload iPad Pro 12.9" screenshots
        if (config.screenshots.ios.iPadPro129) {
          for (const screenshot of config.screenshots.ios.iPadPro129) {
            await this.appStoreAPI.uploadScreenshot({
              versionId: version.id,
              locale: locale,
              screenshotType: 'APP_IPAD_PRO_129',
              filePath: screenshot,
            });
          }
        }
      }

      // Step 7: Attach build to version
      console.log('Attaching build to version...');
      await this.appStoreAPI.attachBuildToVersion(version.id, latestBuild.id);

      // Step 8: Submit for review
      console.log('Submitting for review...');
      const submission = await this.appStoreAPI.submitForReview(version.id);

      return {
        success: true,
        submission: submission,
        build: buildResult,
      };
    } catch (error) {
      console.error('iOS submission failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Submit to Google Play Store
   */
  private async submitToGooglePlay(config: SubmissionConfig): Promise<{
    success: boolean;
    submission?: PlayStoreSubmissionResult;
    build?: BuildResult;
    error?: string;
  }> {
    if (!this.googlePlayAPI) {
      return { success: false, error: 'Google Play API not configured' };
    }

    try {
      // Step 1: Trigger EAS build for Android
      console.log('Building Android app...');
      const buildResult = await this.easBuildService.triggerBuild(config.projectPath, {
        platform: 'android',
        profile: 'production',
        metadata: {
          name: config.appName,
          version: config.version,
          buildNumber: config.buildNumber,
          packageName: config.packageName,
        },
      });

      if (buildResult.status !== 'success' || !buildResult.buildId) {
        return { success: false, build: buildResult, error: buildResult.error };
      }

      console.log('Android build successful:', buildResult.buildId);

      // Step 2: Wait for build to complete and download AAB
      // In real implementation, you would poll EAS for build completion
      // and download the AAB file
      const aabPath = path.join(config.projectPath, 'build', 'app-release.aab');

      // Verify AAB exists
      try {
        await fs.access(aabPath);
      } catch {
        return { success: false, error: 'AAB file not found after build' };
      }

      // Step 3: Submit to Google Play
      console.log('Submitting to Google Play...');

      const screenshots: Array<{
        language: string;
        phoneScreenshots?: string[];
        featureGraphic?: string;
      }> = [];

      if (config.screenshots?.android) {
        screenshots.push({
          language: config.locale || 'en-US',
          phoneScreenshots: config.screenshots.android.phone,
          featureGraphic: config.screenshots.android.featureGraphic,
        });
      }

      const submission = await this.googlePlayAPI.submitApp({
        bundlePath: aabPath,
        track: 'production', // or 'beta', 'alpha', 'internal'
        releaseNotes: [
          {
            language: config.locale || 'en-US',
            text: config.releaseNotes || 'Bug fixes and performance improvements',
          },
        ],
        listing: {
          language: config.locale || 'en-US',
          title: config.appName,
          fullDescription: config.description,
          shortDescription: config.shortDescription || config.description.substring(0, 80),
        },
        details: {
          defaultLanguage: config.locale || 'en-US',
          contactEmail: 'support@plusultra.dev',
          contactWebsite: config.marketingUrl || 'https://plusultra.dev',
        },
        screenshots: screenshots.length > 0 ? screenshots : undefined,
      });

      return {
        success: true,
        submission: submission,
        build: buildResult,
      };
    } catch (error) {
      console.error('Android submission failed:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Check submission status
   */
  async checkSubmissionStatus(data: {
    platform: 'ios' | 'android';
    submissionId: string;
  }): Promise<{
    status: string;
    details?: any;
  }> {
    if (data.platform === 'ios' && this.appStoreAPI) {
      const status = await this.appStoreAPI.getSubmissionStatus(data.submissionId);
      return {
        status: status.state,
        details: status,
      };
    }

    if (data.platform === 'android' && this.googlePlayAPI) {
      // Google Play doesn't have a direct submission status API
      // Status is tracked through the app details and reviews
      return {
        status: 'unknown',
        details: { message: 'Check Google Play Console for status' },
      };
    }

    return {
      status: 'unknown',
      details: { error: 'Platform API not configured' },
    };
  }

  /**
   * Get rejection details
   */
  async getRejectionDetails(data: {
    platform: 'ios' | 'android';
    versionId: string;
  }): Promise<{
    rejected: boolean;
    reasons?: string[];
    reviewerNotes?: string;
  }> {
    if (data.platform === 'ios' && this.appStoreAPI) {
      return await this.appStoreAPI.getRejectionDetails(data.versionId);
    }

    if (data.platform === 'android' && this.googlePlayAPI) {
      // For Android, check reviews for rejection feedback
      const reviews = await this.googlePlayAPI.getReviews(10);

      // Look for any review feedback that might indicate issues
      const negativeReviews = reviews.filter((review: any) =>
        review.comments?.[0]?.userComment?.starRating < 3
      );

      if (negativeReviews.length > 0) {
        return {
          rejected: false, // Reviews aren't rejections
          reasons: negativeReviews.map((r: any) =>
            r.comments?.[0]?.userComment?.text || 'No text'
          ),
        };
      }
    }

    return { rejected: false };
  }
}

export default StoreSubmissionOrchestrator;

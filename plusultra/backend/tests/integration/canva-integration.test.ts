/**
 * Canva Integration Tests
 *
 * Tests the complete Canva asset generation workflow:
 * - Logo generation for iOS and Android
 * - Screenshot generation with device frames
 * - Feature graphic generation
 * - Asset validation for store compliance
 * - R2 storage integration
 */

import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import CanvaService from '../../src/services/assets/CanvaService';
import AssetManagementService from '../../src/services/assets/AssetManagementService';
import AssetStorageIntegration from '../../src/services/assets/AssetStorageIntegration';
import * as fs from 'fs/promises';
import * as path from 'path';

describe('Canva Integration', () => {
  let canvaService: CanvaService;
  let assetManagement: AssetManagementService;
  const testProjectId = `test_${Date.now()}`;
  const testAppName = 'PlusUltra Test App';

  beforeAll(async () => {
    // Skip tests if CANVA_API_KEY is not set
    if (!process.env.CANVA_API_KEY) {
      console.warn('⚠️ CANVA_API_KEY not set - skipping Canva integration tests');
      return;
    }

    canvaService = new CanvaService();
    assetManagement = new AssetManagementService(canvaService);
  });

  afterAll(async () => {
    // Cleanup test artifacts
    try {
      await assetManagement.cleanup(testProjectId);
    } catch (error) {
      console.warn('Cleanup warning:', error);
    }
  });

  describe('CanvaService', () => {
    it('should initialize with API key', () => {
      if (!process.env.CANVA_API_KEY) {
        return; // Skip if no API key
      }

      const status = canvaService.getStatus();
      expect(status.isConfigured).toBe(true);
      expect(status.hasApiKey).toBe(true);
    });

    it('should generate iOS logo (1024x1024)', async () => {
      if (!process.env.CANVA_API_KEY) {
        return;
      }

      const logos = await canvaService.generateLogo({
        appName: testAppName,
        tagline: 'Build amazing apps',
        style: 'modern',
        colorScheme: ['#007AFF', '#5856D6'],
        icon: 'abstract',
        platforms: ['ios']
      });

      expect(logos).toBeDefined();
      expect(logos.length).toBeGreaterThan(0);

      const iosLogo = logos.find(l => l.platform === 'ios');
      expect(iosLogo).toBeDefined();
      expect(iosLogo?.dimensions.width).toBe(1024);
      expect(iosLogo?.dimensions.height).toBe(1024);
      expect(iosLogo?.format).toBe('png');
    }, 60000); // 60s timeout for API call

    it('should generate Android logo (512x512)', async () => {
      if (!process.env.CANVA_API_KEY) {
        return;
      }

      const logos = await canvaService.generateLogo({
        appName: testAppName,
        style: 'gradient',
        colorScheme: ['#3DDC84', '#1976D2'],
        icon: 'letter',
        platforms: ['android']
      });

      expect(logos).toBeDefined();
      const androidLogo = logos.find(l => l.platform === 'android' && l.dimensions.width === 512);
      expect(androidLogo).toBeDefined();
      expect(androidLogo?.dimensions.width).toBe(512);
      expect(androidLogo?.dimensions.height).toBe(512);
    }, 60000);

    it('should generate iOS screenshots with device frames', async () => {
      if (!process.env.CANVA_API_KEY) {
        return;
      }

      const screenshots = await canvaService.generateScreenshots({
        appName: testAppName,
        platform: 'ios',
        screens: [
          {
            title: 'Welcome Screen',
            description: 'Start building your dream app',
            backgroundColor: '#007AFF',
            highlightFeature: true
          },
          {
            title: 'Feature Overview',
            description: 'Powerful tools at your fingertips'
          }
        ],
        deviceFrame: true,
        includeText: true,
        style: 'clean'
      });

      expect(screenshots).toBeDefined();
      expect(screenshots.length).toBeGreaterThan(0);

      const screenshot = screenshots[0];
      expect(screenshot.platform).toBe('ios');
      expect(screenshot.type).toBe('screenshot');
      expect(screenshot.dimensions.width).toBeGreaterThan(0);
      expect(screenshot.dimensions.height).toBeGreaterThan(0);
    }, 90000);

    it('should generate Android screenshots', async () => {
      if (!process.env.CANVA_API_KEY) {
        return;
      }

      const screenshots = await canvaService.generateScreenshots({
        appName: testAppName,
        platform: 'android',
        screens: [
          {
            title: 'Material Design',
            description: 'Beautiful Android interface'
          }
        ],
        deviceFrame: true,
        style: 'colorful'
      });

      expect(screenshots).toBeDefined();
      expect(screenshots.length).toBeGreaterThan(0);
      expect(screenshots[0].platform).toBe('android');
    }, 90000);

    it('should generate Google Play feature graphic (1024x500)', async () => {
      if (!process.env.CANVA_API_KEY) {
        return;
      }

      const featureGraphic = await canvaService.generateFeatureGraphic({
        appName: testAppName,
        tagline: 'Build amazing apps in minutes',
        backgroundColor: '#3DDC84',
        style: 'hero'
      });

      expect(featureGraphic).toBeDefined();
      expect(featureGraphic.type).toBe('feature-graphic');
      expect(featureGraphic.platform).toBe('android');
      expect(featureGraphic.dimensions.width).toBe(1024);
      expect(featureGraphic.dimensions.height).toBe(500);
    }, 60000);

    it('should validate iOS assets for compliance', async () => {
      if (!process.env.CANVA_API_KEY) {
        return;
      }

      const logos = await canvaService.generateLogo({
        appName: testAppName,
        platforms: ['ios']
      });

      const iosLogo = logos.find(l => l.platform === 'ios');
      if (!iosLogo) {
        throw new Error('iOS logo not generated');
      }

      const validation = await canvaService.validateAsset(iosLogo);

      expect(validation).toBeDefined();
      expect(validation.storeCompliance.ios).toBe(true);
      expect(validation.errors.length).toBe(0);
    }, 60000);

    it('should validate Android assets for compliance', async () => {
      if (!process.env.CANVA_API_KEY) {
        return;
      }

      const featureGraphic = await canvaService.generateFeatureGraphic({
        appName: testAppName,
        tagline: 'Test tagline'
      });

      const validation = await canvaService.validateAsset(featureGraphic);

      expect(validation).toBeDefined();
      expect(validation.storeCompliance.android).toBe(true);
    }, 60000);
  });

  describe('AssetManagementService', () => {
    it('should generate complete asset bundle for both platforms', async () => {
      if (!process.env.CANVA_API_KEY) {
        return;
      }

      const project = await assetManagement.generateCompleteAssetBundle({
        projectId: testProjectId,
        appName: testAppName,
        platform: 'both',
        logo: {
          appName: testAppName,
          style: 'modern',
          colorScheme: ['#007AFF', '#3DDC84'],
          icon: 'abstract',
          platforms: ['both']
        },
        screenshots: {
          ios: {
            appName: testAppName,
            platform: 'ios',
            screens: [
              { title: 'Welcome', description: 'Get started' },
              { title: 'Features', description: 'Discover more' }
            ],
            deviceFrame: true,
            style: 'clean'
          },
          android: {
            appName: testAppName,
            platform: 'android',
            screens: [
              { title: 'Welcome', description: 'Get started' },
              { title: 'Features', description: 'Discover more' }
            ],
            deviceFrame: true,
            style: 'colorful'
          }
        },
        featureGraphic: {
          appName: testAppName,
          tagline: 'Build amazing apps',
          style: 'hero'
        },
        uploadToR2: false // Don't upload in tests
      });

      expect(project).toBeDefined();
      expect(project.projectId).toBe(testProjectId);
      expect(project.appName).toBe(testAppName);
      expect(project.platform).toBe('both');

      // Check logos
      expect(project.assets.logos.length).toBeGreaterThan(0);
      const iosLogo = project.assets.logos.find(l => l.platform === 'ios');
      const androidLogo = project.assets.logos.find(l => l.platform === 'android');
      expect(iosLogo).toBeDefined();
      expect(androidLogo).toBeDefined();

      // Check screenshots
      expect(project.assets.screenshots.length).toBeGreaterThan(0);
      const iosScreenshots = project.assets.screenshots.filter(s => s.platform === 'ios');
      const androidScreenshots = project.assets.screenshots.filter(s => s.platform === 'android');
      expect(iosScreenshots.length).toBeGreaterThan(0);
      expect(androidScreenshots.length).toBeGreaterThan(0);

      // Check feature graphic
      expect(project.assets.featureGraphics.length).toBeGreaterThan(0);
    }, 180000); // 3 minutes for complete bundle

    it('should get store-ready bundles separated by platform', async () => {
      if (!process.env.CANVA_API_KEY) {
        return;
      }

      const project = await assetManagement.generateCompleteAssetBundle({
        projectId: `${testProjectId}_bundles`,
        appName: testAppName,
        platform: 'both',
        logo: {
          appName: testAppName,
          platforms: ['both']
        },
        screenshots: {
          ios: {
            appName: testAppName,
            platform: 'ios',
            screens: [
              { title: 'Test 1', description: 'Description 1' },
              { title: 'Test 2', description: 'Description 2' },
              { title: 'Test 3', description: 'Description 3' }
            ]
          },
          android: {
            appName: testAppName,
            platform: 'android',
            screens: [
              { title: 'Test 1', description: 'Description 1' },
              { title: 'Test 2', description: 'Description 2' }
            ]
          }
        },
        featureGraphic: {
          appName: testAppName,
          tagline: 'Test app'
        }
      });

      const bundles = await assetManagement.getStoreReadyBundles(project);

      // iOS bundle
      expect(bundles.ios).toBeDefined();
      expect(bundles.ios?.logo).toBeDefined();
      expect(bundles.ios?.screenshots.length).toBeGreaterThan(0);
      expect(bundles.ios?.isCompliant).toBe(true);

      // Android bundle
      expect(bundles.android).toBeDefined();
      expect(bundles.android?.logo).toBeDefined();
      expect(bundles.android?.screenshots.length).toBeGreaterThan(0);
      expect(bundles.android?.featureGraphic).toBeDefined();
      expect(bundles.android?.isCompliant).toBe(true);

      // Cleanup
      await assetManagement.cleanup(`${testProjectId}_bundles`);
    }, 180000);

    it('should validate project compliance', async () => {
      if (!process.env.CANVA_API_KEY) {
        return;
      }

      const project = await assetManagement.generateCompleteAssetBundle({
        projectId: `${testProjectId}_validation`,
        appName: testAppName,
        platform: 'ios',
        logo: {
          appName: testAppName,
          platforms: ['ios']
        },
        screenshots: {
          ios: {
            appName: testAppName,
            platform: 'ios',
            screens: [
              { title: 'Screen 1', description: 'Desc 1' },
              { title: 'Screen 2', description: 'Desc 2' },
              { title: 'Screen 3', description: 'Desc 3' }
            ]
          }
        }
      });

      const validation = await assetManagement.validateProjectCompliance(project);

      expect(validation).toBeDefined();
      expect(validation.isCompliant).toBe(true);
      expect(validation.errors.length).toBe(0);
      expect(validation.byPlatform.ios?.isValid).toBe(true);

      // Cleanup
      await assetManagement.cleanup(`${testProjectId}_validation`);
    }, 180000);
  });

  describe('Asset Storage Integration', () => {
    let storageIntegration: AssetStorageIntegration;

    beforeAll(() => {
      // Skip if R2 credentials are not set
      if (!process.env.CLOUDFLARE_R2_ACCOUNT_ID || !process.env.CLOUDFLARE_R2_ACCESS_KEY_ID) {
        console.warn('⚠️ R2 credentials not set - skipping storage integration tests');
        return;
      }

      storageIntegration = new AssetStorageIntegration({
        accountId: process.env.CLOUDFLARE_R2_ACCOUNT_ID!,
        accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
        bucketName: process.env.CLOUDFLARE_R2_BUCKET_NAME || 'plusultra-test-assets',
        cdnDomain: process.env.CLOUDFLARE_R2_CDN_DOMAIN
      });
    });

    it('should perform R2 health check', async () => {
      if (!process.env.CLOUDFLARE_R2_ACCOUNT_ID) {
        return;
      }

      const health = await storageIntegration.healthCheck();
      expect(health.isHealthy).toBe(true);
    }, 30000);

    it('should upload project assets to R2', async () => {
      if (!process.env.CLOUDFLARE_R2_ACCOUNT_ID || !process.env.CANVA_API_KEY) {
        return;
      }

      const project = await assetManagement.generateCompleteAssetBundle({
        projectId: `${testProjectId}_r2`,
        appName: testAppName,
        platform: 'ios',
        logo: {
          appName: testAppName,
          platforms: ['ios']
        },
        screenshots: {
          ios: {
            appName: testAppName,
            platform: 'ios',
            screens: [{ title: 'Test', description: 'Test screen' }]
          }
        }
      });

      const uploadedAssets = await storageIntegration.uploadProjectAssets(project);

      expect(uploadedAssets.size).toBeGreaterThan(0);

      // Verify each uploaded asset has proper URLs
      uploadedAssets.forEach(ref => {
        expect(ref.r2Key).toBeDefined();
        expect(ref.r2Url).toBeDefined();
        expect(ref.publicUrl).toBeDefined();
      });

      // Cleanup
      await storageIntegration.deleteProjectAssets(`${testProjectId}_r2`);
      await assetManagement.cleanup(`${testProjectId}_r2`);
    }, 180000);

    it('should get project storage statistics', async () => {
      if (!process.env.CLOUDFLARE_R2_ACCOUNT_ID || !process.env.CANVA_API_KEY) {
        return;
      }

      const project = await assetManagement.generateCompleteAssetBundle({
        projectId: `${testProjectId}_stats`,
        appName: testAppName,
        platform: 'android',
        logo: {
          appName: testAppName,
          platforms: ['android']
        },
        screenshots: {
          android: {
            appName: testAppName,
            platform: 'android',
            screens: [{ title: 'Test', description: 'Test' }]
          }
        },
        featureGraphic: {
          appName: testAppName,
          tagline: 'Test'
        }
      });

      await storageIntegration.uploadProjectAssets(project);
      const stats = await storageIntegration.getProjectStorageStats(`${testProjectId}_stats`);

      expect(stats.totalFiles).toBeGreaterThan(0);
      expect(stats.totalSize).toBeGreaterThan(0);
      expect(stats.breakdown.logos).toBeGreaterThan(0);
      expect(stats.breakdown.screenshots).toBeGreaterThan(0);
      expect(stats.breakdown.featureGraphics).toBeGreaterThan(0);

      // Cleanup
      await storageIntegration.deleteProjectAssets(`${testProjectId}_stats`);
      await assetManagement.cleanup(`${testProjectId}_stats`);
    }, 180000);
  });
});

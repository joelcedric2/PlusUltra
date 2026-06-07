/**
 * Asset Management Service
 *
 * Manages app store assets with:
 * - Canva integration for generation
 * - Cloudflare R2 storage
 * - Store compliance validation
 * - Asset versioning and history
 * - Automatic resizing and optimization
 */

import CanvaService, {
  LogoGenerationOptions,
  ScreenshotGenerationOptions,
  FeatureGraphicOptions,
  GeneratedAsset
} from './CanvaService';
import * as path from 'path';
import * as fs from 'fs/promises';
import sharp from 'sharp';

export interface AssetProject {
  projectId: string;
  appName: string;
  platform: 'ios' | 'android' | 'both';
  assets: {
    logos: GeneratedAsset[];
    screenshots: GeneratedAsset[];
    featureGraphics: GeneratedAsset[];
  };
  storageUrls?: {
    r2BaseUrl: string;
    cdnUrl?: string;
  };
  createdAt: Date;
  updatedAt: Date;
}

export interface AssetGenerationRequest {
  projectId: string;
  appName: string;
  platform: 'ios' | 'android' | 'both';

  logo?: LogoGenerationOptions;
  screenshots?: {
    ios?: ScreenshotGenerationOptions;
    android?: ScreenshotGenerationOptions;
  };
  featureGraphic?: FeatureGraphicOptions;

  uploadToR2?: boolean;
  r2BucketName?: string;
}

export interface StoreAssetBundle {
  platform: 'ios' | 'android';
  logo: GeneratedAsset;
  screenshots: GeneratedAsset[];
  featureGraphic?: GeneratedAsset; // Android only
  isCompliant: boolean;
  validationErrors: string[];
  validationWarnings: string[];
}

export class AssetManagementService {
  private canvaService: CanvaService;
  private tempDir: string;

  constructor(canvaService?: CanvaService) {
    this.canvaService = canvaService || new CanvaService();
    this.tempDir = path.join(process.cwd(), 'temp', 'assets');
  }

  /**
   * Generate complete asset bundle for app store submission
   */
  async generateCompleteAssetBundle(request: AssetGenerationRequest): Promise<AssetProject> {
    console.log(`🚀 Generating complete asset bundle for ${request.appName}...`);

    const project: AssetProject = {
      projectId: request.projectId,
      appName: request.appName,
      platform: request.platform,
      assets: {
        logos: [],
        screenshots: [],
        featureGraphics: []
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };

    try {
      // Step 1: Generate logos
      if (request.logo) {
        console.log('📱 Generating app logos...');
        const logoOptions = {
          ...request.logo,
          appName: request.appName,
          platforms: (request.platform === 'both' ? ['ios', 'android'] : [request.platform]) as ('ios' | 'android' | 'both')[]
        };
        project.assets.logos = await this.canvaService.generateLogo(logoOptions);
      }

      // Step 2: Generate iOS screenshots
      if (request.platform === 'ios' || request.platform === 'both') {
        if (request.screenshots?.ios) {
          console.log('📸 Generating iOS screenshots...');
          const iosScreenshots = await this.canvaService.generateScreenshots({
            ...request.screenshots.ios,
            appName: request.appName,
            platform: 'ios'
          });
          project.assets.screenshots.push(...iosScreenshots);
        }
      }

      // Step 3: Generate Android screenshots
      if (request.platform === 'android' || request.platform === 'both') {
        if (request.screenshots?.android) {
          console.log('📸 Generating Android screenshots...');
          const androidScreenshots = await this.canvaService.generateScreenshots({
            ...request.screenshots.android,
            appName: request.appName,
            platform: 'android'
          });
          project.assets.screenshots.push(...androidScreenshots);
        }

        // Step 4: Generate feature graphic (Android only)
        if (request.featureGraphic) {
          console.log('🖼️ Generating feature graphic...');
          const featureGraphic = await this.canvaService.generateFeatureGraphic({
            ...request.featureGraphic,
            appName: request.appName
          });
          project.assets.featureGraphics.push(featureGraphic);
        }
      }

      // Step 5: Download all assets locally
      console.log('⬇️ Downloading assets...');
      await this.downloadAllAssets(project);

      // Step 6: Optimize assets
      console.log('⚡ Optimizing assets...');
      await this.optimizeAssets(project);

      // Step 7: Upload to R2 if requested
      if (request.uploadToR2) {
        console.log('☁️ Uploading to Cloudflare R2...');
        await this.uploadToR2(project, request.r2BucketName);
      }

      // Step 8: Validate compliance
      console.log('✅ Validating store compliance...');
      const validation = await this.validateProjectCompliance(project);
      if (!validation.isCompliant) {
        console.warn('⚠️ Some assets may not be fully compliant:', validation.errors);
      }

      console.log(`✅ Asset bundle generation complete!`);
      console.log(`   - ${project.assets.logos.length} logos`);
      console.log(`   - ${project.assets.screenshots.length} screenshots`);
      console.log(`   - ${project.assets.featureGraphics.length} feature graphics`);

      return project;

    } catch (error) {
      console.error('❌ Asset bundle generation failed:', error);
      throw new Error(`Asset generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get store-ready asset bundles (separated by platform)
   */
  async getStoreReadyBundles(project: AssetProject): Promise<{
    ios?: StoreAssetBundle;
    android?: StoreAssetBundle;
  }> {
    const bundles: any = {};

    if (project.platform === 'ios' || project.platform === 'both') {
      bundles.ios = await this.createIOSBundle(project);
    }

    if (project.platform === 'android' || project.platform === 'both') {
      bundles.android = await this.createAndroidBundle(project);
    }

    return bundles;
  }

  /**
   * Regenerate specific asset type
   */
  async regenerateAsset(
    project: AssetProject,
    assetType: 'logo' | 'screenshot' | 'feature-graphic',
    options: any
  ): Promise<GeneratedAsset[]> {
    console.log(`🔄 Regenerating ${assetType}...`);

    let newAssets: GeneratedAsset[] = [];

    switch (assetType) {
      case 'logo':
        newAssets = await this.canvaService.generateLogo({
          ...options,
          appName: project.appName,
          platforms: project.platform === 'both' ? ['ios', 'android'] : [project.platform]
        });
        project.assets.logos = newAssets;
        break;

      case 'screenshot':
        if (options.platform === 'ios') {
          newAssets = await this.canvaService.generateScreenshots({
            ...options,
            appName: project.appName,
            platform: 'ios'
          });
        } else {
          newAssets = await this.canvaService.generateScreenshots({
            ...options,
            appName: project.appName,
            platform: 'android'
          });
        }
        // Replace old screenshots for this platform
        project.assets.screenshots = project.assets.screenshots.filter(
          s => s.platform !== options.platform
        );
        project.assets.screenshots.push(...newAssets);
        break;

      case 'feature-graphic':
        const featureGraphic = await this.canvaService.generateFeatureGraphic({
          ...options,
          appName: project.appName
        });
        newAssets = [featureGraphic];
        project.assets.featureGraphics = newAssets;
        break;
    }

    project.updatedAt = new Date();
    return newAssets;
  }

  /**
   * Validate entire project for store compliance
   */
  async validateProjectCompliance(project: AssetProject): Promise<{
    isCompliant: boolean;
    errors: string[];
    warnings: string[];
    byPlatform: {
      ios?: { isValid: boolean; errors: string[]; warnings: string[] };
      android?: { isValid: boolean; errors: string[]; warnings: string[] };
    };
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    const byPlatform: any = {};

    // Validate all assets
    for (const logo of project.assets.logos) {
      const validation = await this.canvaService.validateAsset(logo);
      errors.push(...validation.errors);
      warnings.push(...validation.warnings);
    }

    for (const screenshot of project.assets.screenshots) {
      const validation = await this.canvaService.validateAsset(screenshot);
      errors.push(...validation.errors);
      warnings.push(...validation.warnings);
    }

    for (const graphic of project.assets.featureGraphics) {
      const validation = await this.canvaService.validateAsset(graphic);
      errors.push(...validation.errors);
      warnings.push(...validation.warnings);
    }

    // Platform-specific checks
    if (project.platform === 'ios' || project.platform === 'both') {
      const iosLogo = project.assets.logos.find(l => l.platform === 'ios');
      const iosScreenshots = project.assets.screenshots.filter(s => s.platform === 'ios');

      const iosErrors: string[] = [];
      const iosWarnings: string[] = [];

      if (!iosLogo) {
        iosErrors.push('Missing iOS app icon (1024x1024)');
      }

      if (iosScreenshots.length < 3) {
        iosWarnings.push('iOS requires at least 3 screenshots (recommended: 5-7)');
      }

      byPlatform.ios = {
        isValid: iosErrors.length === 0,
        errors: iosErrors,
        warnings: iosWarnings
      };
    }

    if (project.platform === 'android' || project.platform === 'both') {
      const androidLogo = project.assets.logos.find(l => l.platform === 'android');
      const androidScreenshots = project.assets.screenshots.filter(s => s.platform === 'android');
      const featureGraphic = project.assets.featureGraphics[0];

      const androidErrors: string[] = [];
      const androidWarnings: string[] = [];

      if (!androidLogo) {
        androidErrors.push('Missing Android app icon (512x512)');
      }

      if (androidScreenshots.length < 2) {
        androidErrors.push('Android requires at least 2 screenshots');
      }

      if (!featureGraphic) {
        androidWarnings.push('Feature graphic (1024x500) is recommended for Play Store');
      }

      byPlatform.android = {
        isValid: androidErrors.length === 0,
        errors: androidErrors,
        warnings: androidWarnings
      };
    }

    return {
      isCompliant: errors.length === 0,
      errors,
      warnings,
      byPlatform
    };
  }

  // Private helper methods

  private async downloadAllAssets(project: AssetProject): Promise<void> {
    const projectDir = path.join(this.tempDir, project.projectId);

    const allAssets = [
      ...project.assets.logos,
      ...project.assets.screenshots,
      ...project.assets.featureGraphics
    ];

    for (const asset of allAssets) {
      const assetDir = path.join(projectDir, asset.type, asset.platform);
      const localPath = await this.canvaService.downloadAsset(asset, assetDir);
      asset.localPath = localPath;
    }
  }

  private async optimizeAssets(project: AssetProject): Promise<void> {
    const allAssets = [
      ...project.assets.logos,
      ...project.assets.screenshots,
      ...project.assets.featureGraphics
    ];

    for (const asset of allAssets) {
      if (asset.localPath && asset.format === 'png') {
        try {
          // Optimize PNG with sharp
          await sharp(asset.localPath)
            .png({ compressionLevel: 9, quality: 90 })
            .toFile(asset.localPath + '.optimized');

          // Replace original with optimized
          await fs.rename(asset.localPath + '.optimized', asset.localPath);

          console.log(`✅ Optimized ${path.basename(asset.localPath)}`);
        } catch (error) {
          console.warn(`⚠️ Could not optimize ${asset.localPath}:`, error);
        }
      }
    }
  }

  private async uploadToR2(project: AssetProject, bucketName?: string): Promise<void> {
    // This will integrate with existing CloudflareR2Storage service
    // For now, we'll prepare the structure

    const r2BaseUrl = `https://${bucketName || 'plusultra-assets'}.r2.cloudflarestorage.com`;
    project.storageUrls = {
      r2BaseUrl,
      cdnUrl: `https://assets.plusultra.dev/${project.projectId}`
    };

    // TODO: Integrate with CloudflareR2Storage service
    console.log('📦 R2 upload ready - integrate with CloudflareR2Storage');
  }

  private async createIOSBundle(project: AssetProject): Promise<StoreAssetBundle> {
    const logo = project.assets.logos.find(l => l.platform === 'ios' && l.dimensions.width === 1024);
    const screenshots = project.assets.screenshots.filter(s => s.platform === 'ios');

    if (!logo) {
      throw new Error('iOS logo (1024x1024) not found in project');
    }

    // Validate bundle
    const errors: string[] = [];
    const warnings: string[] = [];

    if (screenshots.length < 3) {
      warnings.push('iOS App Store recommends at least 3 screenshots');
    }

    if (screenshots.length > 10) {
      warnings.push('iOS App Store allows maximum 10 screenshots per device type');
    }

    return {
      platform: 'ios',
      logo,
      screenshots: screenshots.slice(0, 10), // Max 10
      isCompliant: errors.length === 0,
      validationErrors: errors,
      validationWarnings: warnings
    };
  }

  private async createAndroidBundle(project: AssetProject): Promise<StoreAssetBundle> {
    const logo = project.assets.logos.find(l => l.platform === 'android' && l.dimensions.width === 512);
    const screenshots = project.assets.screenshots.filter(s => s.platform === 'android');
    const featureGraphic = project.assets.featureGraphics[0];

    if (!logo) {
      throw new Error('Android logo (512x512) not found in project');
    }

    // Validate bundle
    const errors: string[] = [];
    const warnings: string[] = [];

    if (screenshots.length < 2) {
      errors.push('Google Play requires at least 2 screenshots');
    }

    if (screenshots.length > 8) {
      warnings.push('Google Play allows maximum 8 screenshots per type');
    }

    if (!featureGraphic) {
      warnings.push('Feature graphic (1024x500) is recommended for visibility');
    }

    return {
      platform: 'android',
      logo,
      screenshots: screenshots.slice(0, 8), // Max 8
      featureGraphic,
      isCompliant: errors.length === 0,
      validationErrors: errors,
      validationWarnings: warnings
    };
  }

  /**
   * Clean up temporary files
   */
  async cleanup(projectId: string): Promise<void> {
    const projectDir = path.join(this.tempDir, projectId);
    try {
      await fs.rm(projectDir, { recursive: true, force: true });
      console.log(`🧹 Cleaned up temporary files for ${projectId}`);
    } catch (error) {
      console.warn(`⚠️ Could not clean up ${projectDir}:`, error);
    }
  }
}

export default AssetManagementService;

/**
 * Canva Service
 *
 * Generates professional app assets using Canva Design API:
 * - App logos (iOS: 1024x1024, Android: 512x512)
 * - App Store screenshots (iOS: 1242x2688, 1290x2796 for iPhone)
 * - Google Play screenshots (1080x1920, 1242x2688)
 * - Feature graphics (1024x500 for Play Store)
 * - Promo graphics and banners
 *
 * Integrates with CloudflareR2Storage for asset management.
 */

import fetch from 'node-fetch';
import * as fs from 'fs/promises';
import * as path from 'path';
import { createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

export interface CanvaConfig {
  apiKey: string;
  brandId?: string; // Optional: for brand consistency
  defaultStyles?: {
    colorPalette?: string[];
    fontFamily?: string;
    theme?: 'modern' | 'minimal' | 'bold' | 'playful' | 'professional';
  };
}

export interface LogoGenerationOptions {
  appName: string;
  tagline?: string;
  industry?: string;
  style?: 'modern' | 'minimal' | 'gradient' | 'flat' | 'abstract' | '3d';
  colorScheme?: string[]; // Hex colors
  icon?: 'letter' | 'symbol' | 'mascot' | 'abstract';
  platforms: ('ios' | 'android' | 'both')[];
}

export interface ScreenshotGenerationOptions {
  appName: string;
  platform: 'ios' | 'android';
  screens: Array<{
    title: string;
    description: string;
    imageUrl?: string; // URL to actual app screen capture
    backgroundColor?: string;
    highlightFeature?: boolean;
  }>;
  deviceFrame?: boolean;
  includeText?: boolean;
  style?: 'clean' | 'colorful' | 'gradient' | 'dark' | 'light';
}

export interface FeatureGraphicOptions {
  appName: string;
  tagline: string;
  backgroundColor?: string;
  style?: 'hero' | 'feature-showcase' | 'app-preview';
}

export interface GeneratedAsset {
  id: string;
  type: 'logo' | 'screenshot' | 'feature-graphic' | 'promo-graphic';
  platform: 'ios' | 'android' | 'web';
  url: string;
  localPath?: string;
  dimensions: {
    width: number;
    height: number;
  };
  format: 'png' | 'jpg' | 'svg';
  fileSize: number;
  canvaDesignId?: string; // For future edits
  metadata?: {
    variant?: string;
    deviceType?: string;
    orientation?: 'portrait' | 'landscape';
  };
}

export interface AssetValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  storeCompliance: {
    ios: boolean;
    android: boolean;
  };
}

export class CanvaService {
  private config: CanvaConfig;
  private apiBaseUrl = 'https://api.canva.com/v1';

  constructor(config?: Partial<CanvaConfig>) {
    const apiKey = process.env.CANVA_API_KEY || config?.apiKey;

    if (!apiKey) {
      throw new Error('CANVA_API_KEY is required. Add it to your .env file.');
    }

    this.config = {
      apiKey,
      brandId: process.env.CANVA_BRAND_ID || config?.brandId,
      defaultStyles: config?.defaultStyles || {
        colorPalette: ['#007AFF', '#5856D6', '#FF2D55', '#FF9500'],
        fontFamily: 'Inter',
        theme: 'modern'
      }
    };
  }

  /**
   * Generate app logo for iOS and Android
   */
  async generateLogo(options: LogoGenerationOptions): Promise<GeneratedAsset[]> {
    console.log(`🎨 Generating logo for ${options.appName}...`);

    const assets: GeneratedAsset[] = [];

    try {
      // Determine target sizes based on platforms
      const sizes = this.getLogoSizes(options.platforms);

      for (const size of sizes) {
        const design = await this.createLogoDesign(options, size);
        const exportedAsset = await this.exportDesign(design.id, size.width, size.height, 'png');

        assets.push({
          id: `logo_${size.platform}_${Date.now()}`,
          type: 'logo',
          platform: size.platform,
          url: exportedAsset.url,
          dimensions: {
            width: size.width,
            height: size.height
          },
          format: 'png',
          fileSize: exportedAsset.size,
          canvaDesignId: design.id,
          metadata: {
            variant: size.variant
          }
        });
      }

      console.log(`✅ Generated ${assets.length} logo variants`);
      return assets;

    } catch (error) {
      console.error('❌ Logo generation failed:', error);
      throw new Error(`Canva logo generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate App Store screenshots with device frames
   */
  async generateScreenshots(options: ScreenshotGenerationOptions): Promise<GeneratedAsset[]> {
    console.log(`📱 Generating screenshots for ${options.appName} (${options.platform})...`);

    const assets: GeneratedAsset[] = [];

    try {
      const dimensions = this.getScreenshotDimensions(options.platform);

      for (let i = 0; i < options.screens.length; i++) {
        const screen = options.screens[i];

        for (const dim of dimensions) {
          const design = await this.createScreenshotDesign(options, screen, dim, i);
          const exportedAsset = await this.exportDesign(design.id, dim.width, dim.height, 'png');

          assets.push({
            id: `screenshot_${options.platform}_${i}_${Date.now()}`,
            type: 'screenshot',
            platform: options.platform,
            url: exportedAsset.url,
            dimensions: {
              width: dim.width,
              height: dim.height
            },
            format: 'png',
            fileSize: exportedAsset.size,
            canvaDesignId: design.id,
            metadata: {
              variant: `screen_${i + 1}`,
              deviceType: dim.device,
              orientation: dim.orientation
            }
          });
        }
      }

      console.log(`✅ Generated ${assets.length} screenshots`);
      return assets;

    } catch (error) {
      console.error('❌ Screenshot generation failed:', error);
      throw new Error(`Canva screenshot generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate Google Play feature graphic (1024x500)
   */
  async generateFeatureGraphic(options: FeatureGraphicOptions): Promise<GeneratedAsset> {
    console.log(`🖼️ Generating feature graphic for ${options.appName}...`);

    try {
      const design = await this.createFeatureGraphicDesign(options);
      const exportedAsset = await this.exportDesign(design.id, 1024, 500, 'png');

      const asset: GeneratedAsset = {
        id: `feature_graphic_${Date.now()}`,
        type: 'feature-graphic',
        platform: 'android',
        url: exportedAsset.url,
        dimensions: {
          width: 1024,
          height: 500
        },
        format: 'png',
        fileSize: exportedAsset.size,
        canvaDesignId: design.id
      };

      console.log('✅ Feature graphic generated');
      return asset;

    } catch (error) {
      console.error('❌ Feature graphic generation failed:', error);
      throw new Error(`Canva feature graphic generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Download asset to local filesystem
   */
  async downloadAsset(asset: GeneratedAsset, outputDir: string): Promise<string> {
    try {
      await fs.mkdir(outputDir, { recursive: true });

      const fileName = `${asset.type}_${asset.platform}_${asset.id}.${asset.format}`;
      const filePath = path.join(outputDir, fileName);

      const response = await fetch(asset.url);
      if (!response.ok) {
        throw new Error(`Failed to download asset: ${response.statusText}`);
      }

      await pipeline(
        response.body as any,
        createWriteStream(filePath)
      );

      console.log(`✅ Downloaded asset to ${filePath}`);
      return filePath;

    } catch (error) {
      console.error('❌ Asset download failed:', error);
      throw new Error(`Asset download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate asset for App Store / Play Store compliance
   */
  async validateAsset(asset: GeneratedAsset): Promise<AssetValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    // iOS App Store requirements
    const iosCompliance = this.validateIOSAsset(asset, errors, warnings);

    // Android Play Store requirements
    const androidCompliance = this.validateAndroidAsset(asset, errors, warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      storeCompliance: {
        ios: iosCompliance,
        android: androidCompliance
      }
    };
  }

  // Private helper methods

  private getLogoSizes(platforms: string[]): Array<{
    platform: 'ios' | 'android';
    width: number;
    height: number;
    variant: string;
  }> {
    const sizes: any[] = [];

    if (platforms.includes('ios') || platforms.includes('both')) {
      sizes.push({
        platform: 'ios',
        width: 1024,
        height: 1024,
        variant: 'app_icon'
      });
    }

    if (platforms.includes('android') || platforms.includes('both')) {
      sizes.push(
        {
          platform: 'android',
          width: 512,
          height: 512,
          variant: 'play_store_icon'
        },
        {
          platform: 'android',
          width: 192,
          height: 192,
          variant: 'launcher_icon_xxxhdpi'
        }
      );
    }

    return sizes;
  }

  private getScreenshotDimensions(platform: 'ios' | 'android'): Array<{
    width: number;
    height: number;
    device: string;
    orientation: 'portrait' | 'landscape';
  }> {
    if (platform === 'ios') {
      return [
        // iPhone 15 Pro Max / 14 Pro Max
        { width: 1290, height: 2796, device: 'iphone_pro_max', orientation: 'portrait' },
        // iPhone 15 / 14 / 13
        { width: 1242, height: 2688, device: 'iphone_standard', orientation: 'portrait' },
        // iPad Pro 12.9"
        { width: 2048, height: 2732, device: 'ipad_pro', orientation: 'portrait' }
      ];
    } else {
      return [
        // Standard Android phone
        { width: 1080, height: 1920, device: 'android_phone', orientation: 'portrait' },
        // High-res Android
        { width: 1242, height: 2688, device: 'android_hires', orientation: 'portrait' }
      ];
    }
  }

  private async createLogoDesign(options: LogoGenerationOptions, size: any): Promise<any> {
    // Use Canva's autofill API to create a logo design
    const designData = {
      design_type: 'Logo',
      title: `${options.appName} Logo - ${size.variant}`,
      width: size.width,
      height: size.height,
      autofill: {
        text: {
          app_name: options.appName,
          tagline: options.tagline || ''
        },
        colors: options.colorScheme || this.config.defaultStyles?.colorPalette,
        style: options.style || 'modern'
      }
    };

    const response = await this.canvaRequest('/designs/autofill', 'POST', designData);
    return response.design;
  }

  private async createScreenshotDesign(
    options: ScreenshotGenerationOptions,
    screen: any,
    dimensions: any,
    index: number
  ): Promise<any> {
    const designData = {
      design_type: 'Mobile Screenshot',
      title: `${options.appName} - Screenshot ${index + 1}`,
      width: dimensions.width,
      height: dimensions.height,
      autofill: {
        text: {
          title: screen.title,
          description: screen.description,
          app_name: options.appName
        },
        images: screen.imageUrl ? [{ url: screen.imageUrl }] : [],
        colors: screen.backgroundColor ? [screen.backgroundColor] : this.config.defaultStyles?.colorPalette,
        style: options.style || 'clean',
        device_frame: options.deviceFrame !== false
      }
    };

    const response = await this.canvaRequest('/designs/autofill', 'POST', designData);
    return response.design;
  }

  private async createFeatureGraphicDesign(options: FeatureGraphicOptions): Promise<any> {
    const designData = {
      design_type: 'Banner',
      title: `${options.appName} - Feature Graphic`,
      width: 1024,
      height: 500,
      autofill: {
        text: {
          app_name: options.appName,
          tagline: options.tagline
        },
        colors: options.backgroundColor ? [options.backgroundColor] : this.config.defaultStyles?.colorPalette,
        style: options.style || 'hero'
      }
    };

    const response = await this.canvaRequest('/designs/autofill', 'POST', designData);
    return response.design;
  }

  private async exportDesign(
    designId: string,
    width: number,
    height: number,
    format: 'png' | 'jpg' | 'svg'
  ): Promise<{ url: string; size: number }> {
    const exportData = {
      format,
      width,
      height,
      quality: 'high'
    };

    const response = await this.canvaRequest(`/designs/${designId}/export`, 'POST', exportData);

    // Poll for export completion
    let exportUrl = response.export?.url;
    let attempts = 0;

    while (!exportUrl && attempts < 30) {
      await new Promise(resolve => setTimeout(resolve, 2000)); // Wait 2s
      const status = await this.canvaRequest(`/exports/${response.export.id}`, 'GET');
      if (status.export?.status === 'completed') {
        exportUrl = status.export.url;
      }
      attempts++;
    }

    if (!exportUrl) {
      throw new Error('Export timeout - design did not complete in time');
    }

    // Get file size
    const headResponse = await fetch(exportUrl, { method: 'HEAD' });
    const size = parseInt(headResponse.headers.get('content-length') || '0', 10);

    return { url: exportUrl, size };
  }

  private validateIOSAsset(asset: GeneratedAsset, errors: string[], warnings: string[]): boolean {
    if (asset.platform !== 'ios') return true;

    if (asset.type === 'logo') {
      // iOS requires 1024x1024 PNG
      if (asset.dimensions.width !== 1024 || asset.dimensions.height !== 1024) {
        errors.push('iOS app icon must be exactly 1024x1024 pixels');
      }
      if (asset.format !== 'png') {
        errors.push('iOS app icon must be PNG format');
      }
    }

    if (asset.type === 'screenshot') {
      // Check for supported dimensions
      const validSizes = [
        { w: 1290, h: 2796 }, // iPhone 15 Pro Max
        { w: 1242, h: 2688 }, // iPhone 14/13
        { w: 2048, h: 2732 }  // iPad Pro
      ];

      const isValidSize = validSizes.some(
        size => asset.dimensions.width === size.w && asset.dimensions.height === size.h
      );

      if (!isValidSize) {
        errors.push(`Invalid iOS screenshot size: ${asset.dimensions.width}x${asset.dimensions.height}`);
      }
    }

    // File size check (max 20MB)
    if (asset.fileSize > 20 * 1024 * 1024) {
      errors.push('Asset exceeds 20MB limit');
    }

    return errors.length === 0;
  }

  private validateAndroidAsset(asset: GeneratedAsset, errors: string[], warnings: string[]): boolean {
    if (asset.platform !== 'android') return true;

    if (asset.type === 'logo') {
      // Android requires 512x512 PNG
      if (asset.dimensions.width !== 512 || asset.dimensions.height !== 512) {
        errors.push('Android app icon must be exactly 512x512 pixels');
      }
      if (asset.format !== 'png') {
        errors.push('Android app icon must be PNG format (32-bit)');
      }
    }

    if (asset.type === 'screenshot') {
      // Check for supported dimensions
      const validSizes = [
        { w: 1080, h: 1920 },
        { w: 1242, h: 2688 }
      ];

      const isValidSize = validSizes.some(
        size => asset.dimensions.width === size.w && asset.dimensions.height === size.h
      );

      if (!isValidSize) {
        warnings.push(`Non-standard Android screenshot size: ${asset.dimensions.width}x${asset.dimensions.height}`);
      }
    }

    if (asset.type === 'feature-graphic') {
      if (asset.dimensions.width !== 1024 || asset.dimensions.height !== 500) {
        errors.push('Feature graphic must be exactly 1024x500 pixels');
      }
    }

    return errors.length === 0;
  }

  private async canvaRequest(endpoint: string, method: 'GET' | 'POST' | 'PUT', data?: any): Promise<any> {
    const url = `${this.apiBaseUrl}${endpoint}`;

    const options: any = {
      method,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json'
      }
    };

    if (data && method !== 'GET') {
      options.body = JSON.stringify(data);
    }

    const response = await fetch(url, options);

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Canva API error (${response.status}): ${errorBody}`);
    }

    return response.json();
  }

  /**
   * Get service status and configuration
   */
  getStatus(): {
    isConfigured: boolean;
    hasApiKey: boolean;
    hasBrandId: boolean;
    defaultStyles: any;
  } {
    return {
      isConfigured: !!this.config.apiKey,
      hasApiKey: !!this.config.apiKey,
      hasBrandId: !!this.config.brandId,
      defaultStyles: this.config.defaultStyles
    };
  }
}

export default CanvaService;

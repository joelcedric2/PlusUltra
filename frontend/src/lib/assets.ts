/**
 * Asset Management Service
 */

import { apiClient } from './api';

export interface LogoGenerationOptions {
  appName: string;
  tagline?: string;
  industry?: string;
  style?: 'modern' | 'minimal' | 'gradient' | 'flat' | 'abstract' | '3d';
  colorScheme?: string[];
  icon?: 'letter' | 'symbol' | 'mascot' | 'abstract';
  platforms: ('ios' | 'android' | 'both')[];
}

export interface ScreenshotGenerationOptions {
  appName: string;
  platform: 'ios' | 'android';
  screens: Array<{
    title: string;
    description: string;
    imageUrl?: string;
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
  canvaDesignId?: string;
  metadata?: {
    variant?: string;
    deviceType?: string;
    orientation?: 'portrait' | 'landscape';
  };
}

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
  createdAt: string;
  updatedAt: string;
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

export class AssetService {
  async generateCompleteBundle(request: AssetGenerationRequest): Promise<AssetProject> {
    // This would typically call the backend asset management service
    // For now, we'll simulate the API call structure
    const response = await apiClient.post<AssetProject>('/api/v1/assets/generate', request);

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Asset generation failed');
  }

  async generateLogo(options: LogoGenerationOptions): Promise<GeneratedAsset[]> {
    const response = await apiClient.post<GeneratedAsset[]>('/api/v1/assets/logo', options);

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Logo generation failed');
  }

  async generateScreenshots(options: ScreenshotGenerationOptions): Promise<GeneratedAsset[]> {
    const response = await apiClient.post<GeneratedAsset[]>('/api/v1/assets/screenshots', options);

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Screenshot generation failed');
  }

  async generateFeatureGraphic(options: FeatureGraphicOptions): Promise<GeneratedAsset> {
    const response = await apiClient.post<GeneratedAsset>('/api/v1/assets/feature-graphic', options);

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Feature graphic generation failed');
  }

  async downloadAsset(asset: GeneratedAsset, outputDir: string): Promise<string> {
    // Download asset from URL and save to local directory
    try {
      const response = await fetch(asset.url);
      if (!response.ok) {
        throw new Error(`Failed to download asset: ${response.statusText}`);
      }

      const blob = await response.blob();
      const arrayBuffer = await blob.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // In a real implementation, this would use the file system API
      // For now, we'll create a download link
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${asset.type}_${asset.platform}_${asset.id}.${asset.format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      return outputDir; // Placeholder
    } catch (error) {
      throw new Error(`Asset download failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async validateAsset(asset: GeneratedAsset): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
    storeCompliance: {
      ios: boolean;
      android: boolean;
    };
  }> {
    const response = await apiClient.post<{
      isValid: boolean;
      errors: string[];
      warnings: string[];
      storeCompliance: {
        ios: boolean;
        android: boolean;
      };
    }>('/api/v1/assets/validate', { asset });

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Asset validation failed');
  }
}

export const assetService = new AssetService();

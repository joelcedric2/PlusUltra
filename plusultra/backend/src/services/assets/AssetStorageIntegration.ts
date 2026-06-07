/**
 * Asset Storage Integration
 *
 * Connects Canva-generated assets with Cloudflare R2 Storage
 * - Uploads Canva assets to R2 with organized structure
 * - Manages CDN URLs for fast asset delivery
 * - Provides asset retrieval for store submissions
 */

import CloudflareR2Storage from '../storage/CloudflareR2Storage';
import { GeneratedAsset } from './CanvaService';
import { AssetProject } from './AssetManagementService';
import * as fs from 'fs/promises';
import * as path from 'path';
import fetch from 'node-fetch';

export interface R2AssetConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  cdnDomain?: string; // e.g., 'assets.plusultra.dev'
}

export interface UploadedAssetReference {
  asset: GeneratedAsset;
  r2Key: string;
  r2Url: string;
  cdnUrl?: string;
  publicUrl: string;
}

export class AssetStorageIntegration {
  private r2Storage: CloudflareR2Storage;
  private cdnDomain?: string;

  constructor(config: R2AssetConfig) {
    this.r2Storage = new CloudflareR2Storage({
      accountId: config.accountId,
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
      bucketName: config.bucketName
    });

    this.cdnDomain = config.cdnDomain;
  }

  /**
   * Upload all assets from a project to R2
   */
  async uploadProjectAssets(project: AssetProject): Promise<Map<string, UploadedAssetReference>> {
    console.log(`☁️ Uploading assets for project ${project.projectId} to R2...`);

    const uploadedAssets = new Map<string, UploadedAssetReference>();

    try {
      // Upload logos
      for (const logo of project.assets.logos) {
        const ref = await this.uploadAsset(project.projectId, logo, 'logo');
        uploadedAssets.set(logo.id, ref);
      }

      // Upload screenshots
      for (const screenshot of project.assets.screenshots) {
        const ref = await this.uploadAsset(project.projectId, screenshot, 'screenshot');
        uploadedAssets.set(screenshot.id, ref);
      }

      // Upload feature graphics
      for (const graphic of project.assets.featureGraphics) {
        const ref = await this.uploadAsset(project.projectId, graphic, 'feature-graphic');
        uploadedAssets.set(graphic.id, ref);
      }

      console.log(`✅ Uploaded ${uploadedAssets.size} assets to R2`);
      return uploadedAssets;

    } catch (error) {
      console.error('❌ R2 upload failed:', error);
      throw new Error(`R2 upload failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Upload a single asset to R2
   */
  async uploadAsset(
    projectId: string,
    asset: GeneratedAsset,
    category: 'logo' | 'screenshot' | 'feature-graphic'
  ): Promise<UploadedAssetReference> {
    try {
      // Download asset from Canva URL if not already local
      let fileData: Buffer;

      if (asset.localPath) {
        fileData = await fs.readFile(asset.localPath);
      } else {
        const response = await fetch(asset.url);
        if (!response.ok) {
          throw new Error(`Failed to download asset: ${response.statusText}`);
        }
        fileData = Buffer.from(await response.arrayBuffer());
      }

      // Generate organized R2 key structure:
      // projects/{projectId}/{category}/{platform}/{assetId}.{format}
      const r2Key = this.generateR2Key(projectId, category, asset);

      // Determine MIME type
      const mimeType = this.getMimeType(asset.format);

      // Upload to R2
      const uploadResult = await this.r2Storage.uploadFile(
        fileData,
        `${asset.id}.${asset.format}`,
        mimeType,
        {
          uploadedBy: 'canva-service',
          tags: {
            projectId,
            platform: asset.platform,
            type: asset.type,
            assetId: asset.id,
            canvaDesignId: asset.canvaDesignId || '',
            dimensions: `${asset.dimensions.width}x${asset.dimensions.height}`
          }
        }
      );

      // Generate CDN URL if domain is configured
      const cdnUrl = this.cdnDomain
        ? `https://${this.cdnDomain}/${r2Key}`
        : undefined;

      const reference: UploadedAssetReference = {
        asset,
        r2Key: uploadResult.key,
        r2Url: uploadResult.url,
        cdnUrl,
        publicUrl: cdnUrl || uploadResult.url
      };

      console.log(`✅ Uploaded ${category} (${asset.platform}) to R2: ${r2Key}`);
      return reference;

    } catch (error) {
      console.error(`❌ Failed to upload asset ${asset.id}:`, error);
      throw error;
    }
  }

  /**
   * Get assets for store submission (pre-signed URLs)
   */
  async getStoreSubmissionAssets(
    projectId: string,
    platform: 'ios' | 'android'
  ): Promise<{
    logo: string;
    screenshots: string[];
    featureGraphic?: string;
  }> {
    try {
      const prefix = `projects/${projectId}`;
      const files = await this.r2Storage.listFiles(prefix);

      // Find logo
      const logoFile = files.find(f =>
        f.key.includes('/logo/') && f.key.includes(`/${platform}/`)
      );

      if (!logoFile) {
        throw new Error(`Logo not found for ${platform} in project ${projectId}`);
      }

      const logoUrl = await this.r2Storage.getSignedUrl(logoFile.key, 3600);

      // Find screenshots
      const screenshotFiles = files.filter(f =>
        f.key.includes('/screenshot/') && f.key.includes(`/${platform}/`)
      );

      const screenshotUrls = await Promise.all(
        screenshotFiles.map(f => this.r2Storage.getSignedUrl(f.key, 3600))
      );

      // Find feature graphic (Android only)
      let featureGraphicUrl: string | undefined;
      if (platform === 'android') {
        const featureGraphicFile = files.find(f =>
          f.key.includes('/feature-graphic/')
        );

        if (featureGraphicFile) {
          featureGraphicUrl = await this.r2Storage.getSignedUrl(featureGraphicFile.key, 3600);
        }
      }

      return {
        logo: logoUrl,
        screenshots: screenshotUrls,
        featureGraphic: featureGraphicUrl
      };

    } catch (error) {
      console.error('❌ Failed to get store submission assets:', error);
      throw new Error(`Failed to get assets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Download asset from R2 to local filesystem
   */
  async downloadAssetFromR2(r2Key: string, outputPath: string): Promise<void> {
    try {
      const { data } = await this.r2Storage.getFile(r2Key);
      await fs.mkdir(path.dirname(outputPath), { recursive: true });
      await fs.writeFile(outputPath, data);
      console.log(`✅ Downloaded ${r2Key} to ${outputPath}`);
    } catch (error) {
      console.error(`❌ Failed to download ${r2Key}:`, error);
      throw error;
    }
  }

  /**
   * Delete all assets for a project
   */
  async deleteProjectAssets(projectId: string): Promise<void> {
    try {
      const prefix = `projects/${projectId}`;
      const files = await this.r2Storage.listFiles(prefix);

      console.log(`🗑️ Deleting ${files.length} assets for project ${projectId}...`);

      for (const file of files) {
        await this.r2Storage.deleteFile(file.key);
      }

      console.log('✅ Project assets deleted');
    } catch (error) {
      console.error('❌ Failed to delete project assets:', error);
      throw error;
    }
  }

  /**
   * Get public URLs for all assets in a project
   */
  async getProjectAssetUrls(projectId: string): Promise<{
    logos: Array<{ platform: string; url: string }>;
    screenshots: Array<{ platform: string; url: string }>;
    featureGraphics: Array<{ url: string }>;
  }> {
    const prefix = `projects/${projectId}`;
    const files = await this.r2Storage.listFiles(prefix);

    const result = {
      logos: [] as Array<{ platform: string; url: string }>,
      screenshots: [] as Array<{ platform: string; url: string }>,
      featureGraphics: [] as Array<{ url: string }>
    };

    for (const file of files) {
      const url = this.cdnDomain
        ? `https://${this.cdnDomain}/${file.key}`
        : await this.r2Storage.getPublicUrl(file.key);

      if (file.key.includes('/logo/')) {
        const platform = file.key.includes('/ios/') ? 'ios' : 'android';
        result.logos.push({ platform, url });
      } else if (file.key.includes('/screenshot/')) {
        const platform = file.key.includes('/ios/') ? 'ios' : 'android';
        result.screenshots.push({ platform, url });
      } else if (file.key.includes('/feature-graphic/')) {
        result.featureGraphics.push({ url });
      }
    }

    return result;
  }

  /**
   * Update asset in R2 (re-upload with same key)
   */
  async updateAsset(
    projectId: string,
    asset: GeneratedAsset,
    category: 'logo' | 'screenshot' | 'feature-graphic'
  ): Promise<UploadedAssetReference> {
    // Delete old version if exists
    const r2Key = this.generateR2Key(projectId, category, asset);
    const exists = await this.r2Storage.fileExists(r2Key);

    if (exists) {
      await this.r2Storage.deleteFile(r2Key);
      console.log(`🔄 Deleted old version of ${r2Key}`);
    }

    // Upload new version
    return await this.uploadAsset(projectId, asset, category);
  }

  // Private helpers

  private generateR2Key(
    projectId: string,
    category: 'logo' | 'screenshot' | 'feature-graphic',
    asset: GeneratedAsset
  ): string {
    // Structure: projects/{projectId}/{category}/{platform}/{assetId}.{format}
    return `projects/${projectId}/${category}/${asset.platform}/${asset.id}.${asset.format}`;
  }

  private getMimeType(format: 'png' | 'jpg' | 'svg'): string {
    const mimeTypes = {
      png: 'image/png',
      jpg: 'image/jpeg',
      svg: 'image/svg+xml'
    };

    return mimeTypes[format] || 'application/octet-stream';
  }

  /**
   * Get storage statistics for a project
   */
  async getProjectStorageStats(projectId: string): Promise<{
    totalFiles: number;
    totalSize: number;
    breakdown: {
      logos: number;
      screenshots: number;
      featureGraphics: number;
    };
  }> {
    const prefix = `projects/${projectId}`;
    const files = await this.r2Storage.listFiles(prefix, 1000);

    const stats = {
      totalFiles: files.length,
      totalSize: files.reduce((sum, f) => sum + f.size, 0),
      breakdown: {
        logos: files.filter(f => f.key.includes('/logo/')).length,
        screenshots: files.filter(f => f.key.includes('/screenshot/')).length,
        featureGraphics: files.filter(f => f.key.includes('/feature-graphic/')).length
      }
    };

    return stats;
  }

  /**
   * Check if R2 storage is properly configured
   */
  async healthCheck(): Promise<{
    isHealthy: boolean;
    message: string;
  }> {
    try {
      // Try to list files to verify connection
      await this.r2Storage.listFiles('', 1);

      return {
        isHealthy: true,
        message: 'R2 storage connection successful'
      };
    } catch (error) {
      return {
        isHealthy: false,
        message: `R2 storage connection failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }
}

export default AssetStorageIntegration;

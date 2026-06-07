import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { v4 as uuidv4 } from 'uuid';

/**
 * Cloudflare R2 Storage Configuration
 */
export interface R2Config {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  region?: string; // Cloudflare R2 uses 'auto' region
}

/**
 * File metadata for uploaded objects
 */
export interface FileMetadata {
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
  uploadedBy?: string;
  tags?: Record<string, string>;
}

/**
 * Upload result
 */
export interface UploadResult {
  key: string;
  url: string;
  metadata: FileMetadata;
}

/**
 * Storage Service using Cloudflare R2 (S3-compatible API)
 * Provides file upload, download, and management capabilities
 */
export class CloudflareR2Storage {
  private s3Client: S3Client;
  private config: R2Config;
  private bucketName: string;

  constructor(config: R2Config) {
    this.config = config;
    this.bucketName = config.bucketName;

    // Cloudflare R2 uses S3-compatible API
    this.s3Client = new S3Client({
      region: config.region || 'auto',
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
    });
  }

  /**
   * Upload a file to Cloudflare R2
   */
  async uploadFile(
    file: Buffer | Uint8Array | string,
    fileName: string,
    mimeType: string,
    metadata?: Partial<FileMetadata>
  ): Promise<UploadResult> {
    const key = this.generateFileKey(fileName);
    const fileMetadata: FileMetadata = {
      originalName: fileName,
      mimeType,
      size: Buffer.isBuffer(file) ? file.length : (typeof file === 'string' ? Buffer.from(file).length : (file as Uint8Array).length),
      uploadedAt: new Date(),
      uploadedBy: metadata?.uploadedBy,
      tags: metadata?.tags,
    };

    try {
      // Upload file to R2
      const uploadCommand = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: file,
        ContentType: mimeType,
        Metadata: {
          originalName: fileName,
          uploadedAt: fileMetadata.uploadedAt.toISOString(),
          uploadedBy: fileMetadata.uploadedBy || '',
          tags: JSON.stringify(fileMetadata.tags || {}),
        },
      });

      await this.s3Client.send(uploadCommand);

      // Generate public URL for the uploaded file
      const url = await this.getPublicUrl(key);

      return {
        key,
        url,
        metadata: fileMetadata,
      };
    } catch (error) {
      throw new Error(`Failed to upload file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get a file from Cloudflare R2
   */
  async getFile(key: string): Promise<{ data: Buffer; metadata: FileMetadata }> {
    try {
      const getCommand = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(getCommand);

      if (!response.Body) {
        throw new Error('File not found or empty');
      }

      // Convert stream to buffer
      const chunks: Buffer[] = [];
      const reader = response.Body.transformToByteArray();
      const data = Buffer.from(await reader);

      // Extract metadata from S3 response
      const metadata: FileMetadata = {
        originalName: response.Metadata?.originalName || key,
        mimeType: response.ContentType || 'application/octet-stream',
        size: data.length,
        uploadedAt: new Date(response.Metadata?.uploadedAt || Date.now()),
        uploadedBy: response.Metadata?.uploadedBy || undefined,
        tags: response.Metadata?.tags ? JSON.parse(response.Metadata.tags) : undefined,
      };

      return { data, metadata };
    } catch (error) {
      throw new Error(`Failed to get file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Generate a signed URL for temporary access to a file
   */
  async getSignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    try {
      const getCommand = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      return await getSignedUrl(this.s3Client, getCommand, { expiresIn });
    } catch (error) {
      throw new Error(`Failed to generate signed URL: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete a file from Cloudflare R2
   */
  async deleteFile(key: string): Promise<void> {
    try {
      const deleteCommand = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(deleteCommand);
    } catch (error) {
      throw new Error(`Failed to delete file: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * List files in a directory/prefix
   */
  async listFiles(prefix?: string, maxKeys: number = 100): Promise<Array<{ key: string; size: number; lastModified: Date }>> {
    try {
      const listCommand = new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
        MaxKeys: maxKeys,
      });

      const response = await this.s3Client.send(listCommand);

      if (!response.Contents) {
        return [];
      }

      return response.Contents.map(object => ({
        key: object.Key || '',
        size: object.Size || 0,
        lastModified: object.LastModified || new Date(),
      }));
    } catch (error) {
      throw new Error(`Failed to list files: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get public URL for a file (if bucket is public)
   */
  async getPublicUrl(key: string): Promise<string> {
    return `https://${this.bucketName}.${this.config.accountId}.r2.cloudflarestorage.com/${key}`;
  }

  /**
   * Generate a unique file key
   */
  private generateFileKey(fileName: string): string {
    const extension = fileName.split('.').pop();
    const timestamp = Date.now();
    const uuid = uuidv4();
    return `${timestamp}-${uuid}.${extension}`;
  }

  /**
   * Upload multiple files in batch
   */
  async uploadBatch(
    files: Array<{
      data: Buffer | Uint8Array | string;
      fileName: string;
      mimeType: string;
      metadata?: Partial<FileMetadata>;
    }>
  ): Promise<UploadResult[]> {
    const results: UploadResult[] = [];

    for (const file of files) {
      const result = await this.uploadFile(file.data, file.fileName, file.mimeType, file.metadata);
      results.push(result);
    }

    return results;
  }

  /**
   * Check if a file exists
   */
  async fileExists(key: string): Promise<boolean> {
    try {
      const getCommand = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      await this.s3Client.send(getCommand);
      return true;
    } catch (error: any) {
      if (error.name === 'NoSuchKey') {
        return false;
      }
      throw error;
    }
  }

  /**
   * Get file metadata without downloading the file
   */
  async getFileMetadata(key: string): Promise<FileMetadata | null> {
    try {
      const getCommand = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      });

      const response = await this.s3Client.send(getCommand);

      if (!response.Metadata) {
        return null;
      }

      return {
        originalName: response.Metadata.originalName || key,
        mimeType: response.ContentType || 'application/octet-stream',
        size: response.ContentLength || 0,
        uploadedAt: new Date(response.Metadata.uploadedAt || Date.now()),
        uploadedBy: response.Metadata.uploadedBy || undefined,
        tags: response.Metadata.tags ? JSON.parse(response.Metadata.tags) : undefined,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'NoSuchKey') {
        return null;
      }
      throw new Error(`Failed to get file metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
}

export default CloudflareR2Storage;

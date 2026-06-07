import { v4 as uuidv4 } from 'uuid';
import { S3Client, PutObjectCommand, DeleteObjectCommand, ListObjectsV2Command, CopyObjectCommand } from '@aws-sdk/client-s3';
import { DNSManager, CustomHostnameResponse } from './DNSManager';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as crypto from 'crypto';
import * as mime from 'mime-types';

/**
 * Deployment Type
 */
export type DeploymentType = 'app' | 'site';

/**
 * Deployment Status
 */
export type DeploymentStatus =
  | 'pending'
  | 'building'
  | 'uploading'
  | 'configuring_dns'
  | 'configuring_ssl'
  | 'active'
  | 'failed'
  | 'rolled_back'
  | 'deleted';

/**
 * Project Deployment Configuration
 */
export interface DeploymentConfig {
  projectId: string;
  projectName: string;
  userId: string;
  type: DeploymentType;
  sourcePath: string;
  files?: Map<string, Buffer | string>;
  framework?: 'react' | 'nextjs' | 'vue' | 'svelte' | 'static' | 'expo-web';
  buildCommand?: string;
  outputDirectory?: string;
  environmentVariables?: Record<string, string>;
  customDomain?: string;
  metadata?: Record<string, any>;
}

/**
 * Deployment Record
 */
export interface Deployment {
  id: string;
  projectId: string;
  projectName: string;
  userId: string;
  type: DeploymentType;
  subdomain: string;
  url: string;
  customDomain?: string;
  customDomainStatus?: 'pending_verification' | 'pending_ssl' | 'active' | 'failed';
  customDomainId?: string;
  status: DeploymentStatus;
  version: number;
  fileCount: number;
  totalSize: number;
  checksum: string;
  framework?: string;
  metadata?: Record<string, any>;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
  deployedAt?: Date;
}

/**
 * Deployment Version Record (for rollbacks)
 */
export interface DeploymentVersion {
  id: string;
  deploymentId: string;
  version: number;
  storagePrefix: string;
  fileCount: number;
  totalSize: number;
  checksum: string;
  createdAt: Date;
  deployedBy: string;
  rollbackOf?: number;
}

/**
 * Deployment Result
 */
export interface DeploymentResult {
  success: boolean;
  deployment?: Deployment;
  url?: string;
  error?: string;
  logs?: string[];
}

/**
 * Custom Domain Configuration Result
 */
export interface CustomDomainResult {
  success: boolean;
  domain?: string;
  status?: string;
  verificationInstructions?: {
    recordType: string;
    host: string;
    value: string;
    instructions: string;
  };
  sslStatus?: string;
  error?: string;
}

/**
 * Deployment List Options
 */
export interface ListDeploymentsOptions {
  projectId?: string;
  userId?: string;
  type?: DeploymentType;
  status?: DeploymentStatus;
  page?: number;
  limit?: number;
}

/**
 * R2 Storage Configuration
 */
export interface R2StorageConfig {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucketName: string;
  publicDomain?: string;
}

/**
 * SubdomainHostingService
 * Manages deployment of static sites and app landing pages to subdomains
 * - {app-name}.apps.plusultra.dev for mobile app landing pages
 * - {project-name}.sites.plusultra.dev for websites
 */
export class SubdomainHostingService {
  private s3Client: S3Client;
  private dnsManager: DNSManager;
  private bucketName: string;
  private publicDomain: string;

  // In-memory stores (replace with database in production)
  private deployments: Map<string, Deployment> = new Map();
  private deploymentVersions: Map<string, DeploymentVersion[]> = new Map();
  private subdomainIndex: Map<string, string> = new Map(); // subdomain -> deploymentId

  // Base domains for different deployment types
  private readonly APP_DOMAIN = 'apps.plusultra.dev';
  private readonly SITE_DOMAIN = 'sites.plusultra.dev';

  constructor(
    r2Config?: R2StorageConfig,
    dnsManager?: DNSManager
  ) {
    const accountId = r2Config?.accountId || process.env.CLOUDFLARE_R2_ACCOUNT_ID || process.env.R2_ACCOUNT_ID || '';
    const accessKeyId = r2Config?.accessKeyId || process.env.CLOUDFLARE_R2_ACCESS_KEY_ID || process.env.R2_ACCESS_KEY_ID || '';
    const secretAccessKey = r2Config?.secretAccessKey || process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY || process.env.R2_SECRET_ACCESS_KEY || '';
    this.bucketName = r2Config?.bucketName || process.env.CLOUDFLARE_R2_HOSTING_BUCKET || 'plusultra-hosting';
    this.publicDomain = r2Config?.publicDomain || process.env.CLOUDFLARE_R2_CDN_DOMAIN || 'cdn.plusultra.dev';

    this.s3Client = new S3Client({
      region: 'auto',
      credentials: {
        accessKeyId,
        secretAccessKey,
      },
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    });

    this.dnsManager = dnsManager || new DNSManager();
  }

  /**
   * Deploy a project to a subdomain
   */
  async deploy(config: DeploymentConfig): Promise<DeploymentResult> {
    const logs: string[] = [];
    let deployment: Deployment | undefined;

    try {
      logs.push(`Starting deployment for project: ${config.projectName}`);

      // Step 1: Generate unique subdomain
      const subdomain = await this.generateSubdomain(config.projectName, config.type);
      logs.push(`Generated subdomain: ${subdomain}`);

      // Step 2: Check if this is a new deployment or update
      const existingDeployment = this.findDeploymentByProjectId(config.projectId);
      const version = existingDeployment ? existingDeployment.version + 1 : 1;

      // Step 3: Create deployment record
      const deploymentId = existingDeployment?.id || uuidv4();
      deployment = {
        id: deploymentId,
        projectId: config.projectId,
        projectName: config.projectName,
        userId: config.userId,
        type: config.type,
        subdomain,
        url: this.getDeploymentUrl(subdomain, config.type),
        status: 'pending',
        version,
        fileCount: 0,
        totalSize: 0,
        checksum: '',
        framework: config.framework,
        metadata: config.metadata,
        createdAt: existingDeployment?.createdAt || new Date(),
        updatedAt: new Date(),
      };

      this.deployments.set(deploymentId, deployment);
      this.subdomainIndex.set(subdomain, deploymentId);

      // Step 4: Prepare files for upload
      deployment.status = 'building';
      this.deployments.set(deploymentId, deployment);
      logs.push('Preparing files for deployment...');

      let files: Map<string, Buffer>;
      if (config.files) {
        files = this.normalizeFiles(config.files);
      } else if (config.sourcePath) {
        files = await this.readProjectFiles(config.sourcePath, config.outputDirectory);
      } else {
        throw new Error('Either files or sourcePath must be provided');
      }

      logs.push(`Found ${files.size} files to deploy`);

      // Step 5: Calculate checksum and total size
      let totalSize = 0;
      const checksumData: string[] = [];
      Array.from(files.entries()).forEach(([filePath, content]) => {
        totalSize += content.length;
        checksumData.push(`${filePath}:${crypto.createHash('md5').update(content).digest('hex')}`);
      });
      const checksum = crypto.createHash('sha256').update(checksumData.sort().join(',')).digest('hex');

      deployment.fileCount = files.size;
      deployment.totalSize = totalSize;
      deployment.checksum = checksum;

      // Step 6: Upload files to R2
      deployment.status = 'uploading';
      this.deployments.set(deploymentId, deployment);
      logs.push('Uploading files to storage...');

      const storagePrefix = this.getStoragePrefix(deploymentId, version);
      await this.uploadFiles(storagePrefix, files);
      logs.push(`Uploaded ${files.size} files to ${storagePrefix}`);

      // Step 7: Store version record
      const versionRecord: DeploymentVersion = {
        id: uuidv4(),
        deploymentId,
        version,
        storagePrefix,
        fileCount: files.size,
        totalSize,
        checksum,
        createdAt: new Date(),
        deployedBy: config.userId,
      };

      const versions = this.deploymentVersions.get(deploymentId) || [];
      versions.push(versionRecord);
      this.deploymentVersions.set(deploymentId, versions);

      // Step 8: Configure DNS (if new deployment)
      if (!existingDeployment) {
        deployment.status = 'configuring_dns';
        this.deployments.set(deploymentId, deployment);
        logs.push('Configuring DNS...');

        try {
          await this.configureDNS(subdomain, config.type);
          logs.push('DNS configured successfully');
        } catch (error) {
          logs.push(`Warning: DNS configuration failed, may already exist: ${error}`);
        }
      }

      // Step 9: Configure custom domain if provided
      if (config.customDomain) {
        deployment.status = 'configuring_ssl';
        this.deployments.set(deploymentId, deployment);
        logs.push(`Configuring custom domain: ${config.customDomain}`);

        const customDomainResult = await this.configureCustomDomain(deploymentId, config.customDomain);
        if (customDomainResult.success) {
          deployment.customDomain = config.customDomain;
          deployment.customDomainStatus = 'pending_verification';
          deployment.customDomainId = customDomainResult.domain;
          logs.push('Custom domain configuration initiated');
        } else {
          logs.push(`Warning: Custom domain setup failed: ${customDomainResult.error}`);
        }
      }

      // Step 10: Mark deployment as active
      deployment.status = 'active';
      deployment.deployedAt = new Date();
      deployment.updatedAt = new Date();
      this.deployments.set(deploymentId, deployment);

      logs.push(`Deployment successful! URL: ${deployment.url}`);

      return {
        success: true,
        deployment,
        url: deployment.url,
        logs,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logs.push(`Deployment failed: ${errorMessage}`);

      if (deployment) {
        deployment.status = 'failed';
        deployment.error = errorMessage;
        deployment.updatedAt = new Date();
        this.deployments.set(deployment.id, deployment);
      }

      return {
        success: false,
        deployment,
        error: errorMessage,
        logs,
      };
    }
  }

  /**
   * Get deployment status
   */
  async getDeploymentStatus(projectId: string): Promise<{
    deployment: Deployment | null;
    versions: DeploymentVersion[];
    customDomainStatus?: CustomHostnameResponse;
  }> {
    const deployment = this.findDeploymentByProjectId(projectId);

    if (!deployment) {
      return { deployment: null, versions: [] };
    }

    const versions = this.deploymentVersions.get(deployment.id) || [];
    let customDomainStatus: CustomHostnameResponse | undefined;

    // Check custom domain status if configured
    if (deployment.customDomainId) {
      try {
        customDomainStatus = await this.dnsManager.getCustomHostname(deployment.customDomainId);

        // Update deployment status based on custom hostname status
        if (customDomainStatus.ssl.status === 'active') {
          deployment.customDomainStatus = 'active';
        } else if (customDomainStatus.ssl.status === 'pending_validation') {
          deployment.customDomainStatus = 'pending_verification';
        } else if (customDomainStatus.ssl.status === 'pending_issuance' ||
                   customDomainStatus.ssl.status === 'pending_deployment') {
          deployment.customDomainStatus = 'pending_ssl';
        } else if (customDomainStatus.ssl.status === 'error') {
          deployment.customDomainStatus = 'failed';
        }

        this.deployments.set(deployment.id, deployment);
      } catch (error) {
        console.error('Failed to get custom domain status:', error);
      }
    }

    return { deployment, versions, customDomainStatus };
  }

  /**
   * Configure a custom domain for a deployment
   */
  async configureCustomDomain(deploymentIdOrProjectId: string, customDomain: string): Promise<CustomDomainResult> {
    try {
      // Find deployment
      let deployment = this.deployments.get(deploymentIdOrProjectId);
      if (!deployment) {
        deployment = this.findDeploymentByProjectId(deploymentIdOrProjectId);
      }

      if (!deployment) {
        return { success: false, error: 'Deployment not found' };
      }

      // Validate domain format
      if (!this.isValidDomain(customDomain)) {
        return { success: false, error: 'Invalid domain format' };
      }

      // Create custom hostname in Cloudflare
      const customHostname = await this.dnsManager.createCustomHostname({
        hostname: customDomain,
        ssl: {
          method: 'http',
          type: 'dv',
          settings: {
            min_tls_version: '1.2',
          },
        },
        custom_origin_server: `${deployment.subdomain}.${deployment.type === 'app' ? this.APP_DOMAIN : this.SITE_DOMAIN}`,
      });

      // Get CNAME instructions for the user
      const verificationInstructions = this.dnsManager.getCNAMEInstructions(
        customDomain,
        `${deployment.subdomain}.${deployment.type === 'app' ? this.APP_DOMAIN : this.SITE_DOMAIN}`
      );

      // Update deployment record
      deployment.customDomain = customDomain;
      deployment.customDomainId = customHostname.id;
      deployment.customDomainStatus = 'pending_verification';
      deployment.updatedAt = new Date();
      this.deployments.set(deployment.id, deployment);

      return {
        success: true,
        domain: customDomain,
        status: customHostname.status,
        verificationInstructions,
        sslStatus: customHostname.ssl.status,
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to configure custom domain',
      };
    }
  }

  /**
   * Remove a deployment
   */
  async removeDeployment(deploymentId: string): Promise<{ success: boolean; error?: string }> {
    try {
      const deployment = this.deployments.get(deploymentId);
      if (!deployment) {
        return { success: false, error: 'Deployment not found' };
      }

      // Delete all version files from R2
      const versions = this.deploymentVersions.get(deploymentId) || [];
      for (const version of versions) {
        await this.deleteFiles(version.storagePrefix);
      }

      // Delete custom hostname if exists
      if (deployment.customDomainId) {
        try {
          await this.dnsManager.deleteCustomHostname(deployment.customDomainId);
        } catch (error) {
          console.error('Failed to delete custom hostname:', error);
        }
      }

      // Remove DNS record (optional - may want to keep for future use)
      // await this.dnsManager.deleteDNSRecord(...)

      // Update deployment status
      deployment.status = 'deleted';
      deployment.updatedAt = new Date();
      this.deployments.set(deploymentId, deployment);

      // Remove from index
      this.subdomainIndex.delete(deployment.subdomain);

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to remove deployment',
      };
    }
  }

  /**
   * Rollback to a previous deployment version
   */
  async rollback(deploymentId: string, targetVersion?: number): Promise<DeploymentResult> {
    const logs: string[] = [];

    try {
      const deployment = this.deployments.get(deploymentId);
      if (!deployment) {
        return { success: false, error: 'Deployment not found', logs };
      }

      const versions = this.deploymentVersions.get(deploymentId) || [];
      if (versions.length < 2) {
        return { success: false, error: 'No previous versions available for rollback', logs };
      }

      // Determine target version
      const rollbackVersion = targetVersion
        ? versions.find(v => v.version === targetVersion)
        : versions[versions.length - 2]; // Previous version

      if (!rollbackVersion) {
        return { success: false, error: `Version ${targetVersion} not found`, logs };
      }

      logs.push(`Rolling back from version ${deployment.version} to version ${rollbackVersion.version}`);

      // Create new version by copying files from the rollback version
      const newVersion = deployment.version + 1;
      const newStoragePrefix = this.getStoragePrefix(deploymentId, newVersion);

      // Copy files from old version to new version
      logs.push('Copying files to new version...');
      await this.copyFiles(rollbackVersion.storagePrefix, newStoragePrefix);

      // Create new version record
      const newVersionRecord: DeploymentVersion = {
        id: uuidv4(),
        deploymentId,
        version: newVersion,
        storagePrefix: newStoragePrefix,
        fileCount: rollbackVersion.fileCount,
        totalSize: rollbackVersion.totalSize,
        checksum: rollbackVersion.checksum,
        createdAt: new Date(),
        deployedBy: deployment.userId,
        rollbackOf: rollbackVersion.version,
      };

      versions.push(newVersionRecord);
      this.deploymentVersions.set(deploymentId, versions);

      // Update deployment
      deployment.version = newVersion;
      deployment.status = 'active';
      deployment.fileCount = rollbackVersion.fileCount;
      deployment.totalSize = rollbackVersion.totalSize;
      deployment.checksum = rollbackVersion.checksum;
      deployment.deployedAt = new Date();
      deployment.updatedAt = new Date();
      this.deployments.set(deploymentId, deployment);

      logs.push(`Rollback successful! Now at version ${newVersion}`);

      return {
        success: true,
        deployment,
        url: deployment.url,
        logs,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logs.push(`Rollback failed: ${errorMessage}`);
      return { success: false, error: errorMessage, logs };
    }
  }

  /**
   * List all deployments with filtering
   */
  async listDeployments(options?: ListDeploymentsOptions): Promise<{
    deployments: Deployment[];
    total: number;
    page: number;
    limit: number;
  }> {
    let deployments = Array.from(this.deployments.values());

    // Apply filters
    if (options?.projectId) {
      deployments = deployments.filter(d => d.projectId === options.projectId);
    }
    if (options?.userId) {
      deployments = deployments.filter(d => d.userId === options.userId);
    }
    if (options?.type) {
      deployments = deployments.filter(d => d.type === options.type);
    }
    if (options?.status) {
      deployments = deployments.filter(d => d.status === options.status);
    }

    // Exclude deleted deployments unless specifically requested
    if (options?.status !== 'deleted') {
      deployments = deployments.filter(d => d.status !== 'deleted');
    }

    // Sort by creation date (newest first)
    deployments.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    const total = deployments.length;
    const page = options?.page || 1;
    const limit = options?.limit || 20;
    const start = (page - 1) * limit;
    const end = start + limit;

    return {
      deployments: deployments.slice(start, end),
      total,
      page,
      limit,
    };
  }

  /**
   * Get deployment by ID
   */
  getDeployment(deploymentId: string): Deployment | null {
    return this.deployments.get(deploymentId) || null;
  }

  /**
   * Get deployment versions
   */
  getDeploymentVersions(deploymentId: string): DeploymentVersion[] {
    return this.deploymentVersions.get(deploymentId) || [];
  }

  // Private helper methods

  /**
   * Generate a unique subdomain for a project
   */
  private async generateSubdomain(projectName: string, type: DeploymentType): Promise<string> {
    // Normalize project name to valid subdomain
    let subdomain = projectName
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 63);

    // Ensure minimum length
    if (subdomain.length < 3) {
      subdomain = `project-${subdomain || uuidv4().substring(0, 8)}`;
    }

    // Check for uniqueness and add suffix if needed
    const baseDomain = type === 'app' ? this.APP_DOMAIN : this.SITE_DOMAIN;
    const fullSubdomain = `${subdomain}.${baseDomain}`;

    if (this.subdomainIndex.has(subdomain)) {
      // Add random suffix for uniqueness
      const suffix = uuidv4().substring(0, 6);
      subdomain = `${subdomain.substring(0, 56)}-${suffix}`;
    }

    return subdomain;
  }

  /**
   * Get the public URL for a deployment
   */
  private getDeploymentUrl(subdomain: string, type: DeploymentType): string {
    const baseDomain = type === 'app' ? this.APP_DOMAIN : this.SITE_DOMAIN;
    return `https://${subdomain}.${baseDomain}`;
  }

  /**
   * Get storage prefix for deployment files
   */
  private getStoragePrefix(deploymentId: string, version: number): string {
    return `deployments/${deploymentId}/v${version}`;
  }

  /**
   * Find deployment by project ID
   */
  private findDeploymentByProjectId(projectId: string): Deployment | undefined {
    return Array.from(this.deployments.values()).find(d => d.projectId === projectId);
  }

  /**
   * Normalize file map to Buffer values
   */
  private normalizeFiles(files: Map<string, Buffer | string>): Map<string, Buffer> {
    const normalized = new Map<string, Buffer>();
    Array.from(files.entries()).forEach(([filePath, content]) => {
      normalized.set(filePath, Buffer.isBuffer(content) ? content : Buffer.from(content, 'utf-8'));
    });
    return normalized;
  }

  /**
   * Read project files from disk
   */
  private async readProjectFiles(
    sourcePath: string,
    outputDirectory?: string
  ): Promise<Map<string, Buffer>> {
    const files = new Map<string, Buffer>();
    const baseDir = outputDirectory ? path.join(sourcePath, outputDirectory) : sourcePath;

    const walkDir = async (dir: string, relativePath: string = '') => {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relPath = relativePath ? `${relativePath}/${entry.name}` : entry.name;

        // Skip common non-deployable directories
        if (entry.isDirectory()) {
          const skipDirs = ['node_modules', '.git', '.next', '.expo', '__pycache__', '.vscode'];
          if (skipDirs.includes(entry.name)) continue;

          await walkDir(fullPath, relPath);
        } else if (entry.isFile()) {
          const content = await fs.readFile(fullPath);
          files.set(relPath, content);
        }
      }
    };

    await walkDir(baseDir);
    return files;
  }

  /**
   * Upload files to R2 storage
   */
  private async uploadFiles(prefix: string, files: Map<string, Buffer>): Promise<void> {
    const uploadPromises: Promise<void>[] = [];

    Array.from(files.entries()).forEach(([filePath, content]) => {
      const key = `${prefix}/${filePath}`;
      const contentType = mime.lookup(filePath) || 'application/octet-stream';

      const uploadPromise = this.s3Client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: content,
          ContentType: contentType,
          CacheControl: this.getCacheControl(filePath),
        })
      ).then(() => {});

      uploadPromises.push(uploadPromise);
    });

    await Promise.all(uploadPromises);
  }

  /**
   * Delete files from R2 storage
   */
  private async deleteFiles(prefix: string): Promise<void> {
    // List all objects with the prefix
    const listResponse = await this.s3Client.send(
      new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: prefix,
      })
    );

    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      return;
    }

    // Delete each object
    const deletePromises = listResponse.Contents.map(obj =>
      this.s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: obj.Key!,
        })
      )
    );

    await Promise.all(deletePromises);
  }

  /**
   * Copy files from one prefix to another (for rollbacks)
   */
  private async copyFiles(sourcePrefix: string, targetPrefix: string): Promise<void> {
    // List all objects with the source prefix
    const listResponse = await this.s3Client.send(
      new ListObjectsV2Command({
        Bucket: this.bucketName,
        Prefix: sourcePrefix,
      })
    );

    if (!listResponse.Contents || listResponse.Contents.length === 0) {
      throw new Error('No files found in source version');
    }

    // Copy each object to the new prefix
    const copyPromises = listResponse.Contents.map(obj => {
      const newKey = obj.Key!.replace(sourcePrefix, targetPrefix);
      return this.s3Client.send(
        new CopyObjectCommand({
          Bucket: this.bucketName,
          CopySource: `${this.bucketName}/${obj.Key}`,
          Key: newKey,
        })
      );
    });

    await Promise.all(copyPromises);
  }

  /**
   * Configure DNS for a subdomain
   */
  private async configureDNS(subdomain: string, type: DeploymentType): Promise<void> {
    const baseDomain = type === 'app' ? this.APP_DOMAIN : this.SITE_DOMAIN;
    const fullSubdomain = `${subdomain}.${baseDomain}`;

    // Point to our CDN/origin
    await this.dnsManager.setupSubdomain(
      fullSubdomain,
      this.publicDomain,
      { type: 'CNAME', proxied: true }
    );
  }

  /**
   * Get cache control header based on file type
   */
  private getCacheControl(filePath: string): string {
    const ext = path.extname(filePath).toLowerCase();

    // Immutable assets (hashed filenames)
    if (filePath.includes('.') && /\.[a-f0-9]{8,}\./i.test(filePath)) {
      return 'public, max-age=31536000, immutable';
    }

    // Different cache strategies based on file type
    switch (ext) {
      case '.html':
        return 'public, max-age=0, must-revalidate';
      case '.js':
      case '.css':
        return 'public, max-age=31536000, immutable';
      case '.png':
      case '.jpg':
      case '.jpeg':
      case '.gif':
      case '.webp':
      case '.svg':
      case '.ico':
        return 'public, max-age=86400';
      case '.woff':
      case '.woff2':
      case '.ttf':
      case '.eot':
        return 'public, max-age=31536000, immutable';
      default:
        return 'public, max-age=3600';
    }
  }

  /**
   * Validate domain format
   */
  private isValidDomain(domain: string): boolean {
    const domainRegex = /^(?!:\/\/)([a-zA-Z0-9-]+\.)*[a-zA-Z0-9-]+\.[a-zA-Z]{2,}$/;
    return domainRegex.test(domain);
  }
}

export default SubdomainHostingService;

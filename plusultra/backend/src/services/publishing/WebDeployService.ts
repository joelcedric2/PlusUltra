import axios, { AxiosInstance } from 'axios';
import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';
import archiver from 'archiver';
import { createReadStream } from 'fs';

const execAsync = promisify(exec);

/**
 * Web Deployment Service
 * Handles deployment to Vercel, Netlify, and other hosting platforms
 */

export interface DeploymentConfig {
  platform: 'vercel' | 'netlify' | 'aws-amplify' | 'cloudflare-pages';
  projectPath: string;
  projectName: string;
  framework?: 'nextjs' | 'react' | 'vue' | 'svelte' | 'angular' | 'static';
  buildCommand?: string;
  outputDirectory?: string;
  environmentVariables?: Record<string, string>;
  domain?: string;
}

export interface DeploymentResult {
  success: boolean;
  url: string;
  deploymentId: string;
  platform: string;
  buildTime?: number;
  error?: string;
  logs?: string[];
}

export class WebDeployService {
  private vercelClient?: AxiosInstance;
  private netlifyClient?: AxiosInstance;

  constructor() {
    // Initialize Vercel client
    if (process.env.VERCEL_TOKEN) {
      this.vercelClient = axios.create({
        baseURL: 'https://api.vercel.com',
        headers: {
          Authorization: `Bearer ${process.env.VERCEL_TOKEN}`,
          'Content-Type': 'application/json',
        },
      });
    }

    // Initialize Netlify client
    if (process.env.NETLIFY_TOKEN) {
      this.netlifyClient = axios.create({
        baseURL: 'https://api.netlify.com/api/v1',
        headers: {
          Authorization: `Bearer ${process.env.NETLIFY_TOKEN}`,
          'Content-Type': 'application/json',
        },
      });
    }
  }

  /**
   * Deploy to selected platform
   */
  async deploy(config: DeploymentConfig): Promise<DeploymentResult> {
    switch (config.platform) {
      case 'vercel':
        return await this.deployToVercel(config);
      case 'netlify':
        return await this.deployToNetlify(config);
      case 'cloudflare-pages':
        return await this.deployToCloudflarePages(config);
      default:
        return {
          success: false,
          url: '',
          deploymentId: '',
          platform: config.platform,
          error: `Platform ${config.platform} not supported`,
        };
    }
  }

  /**
   * Deploy to Vercel
   */
  async deployToVercel(config: DeploymentConfig): Promise<DeploymentResult> {
    if (!this.vercelClient) {
      return {
        success: false,
        url: '',
        deploymentId: '',
        platform: 'vercel',
        error: 'Vercel token not configured',
      };
    }

    try {
      const startTime = Date.now();

      // Step 1: Create or get project
      const project = await this.getOrCreateVercelProject(config.projectName);

      // Step 2: Prepare files for deployment
      const files = await this.prepareFilesForVercel(config.projectPath);

      // Step 3: Create deployment
      const deploymentData = {
        name: config.projectName,
        files: files,
        projectSettings: {
          framework: this.mapFrameworkToVercel(config.framework),
          buildCommand: config.buildCommand,
          outputDirectory: config.outputDirectory || (config.framework === 'nextjs' ? '.next' : 'dist'),
          installCommand: 'npm install',
        },
        target: 'production',
        env: config.environmentVariables || {},
      };

      const response = await this.vercelClient.post('/v13/deployments', deploymentData);

      const deployment = response.data;

      // Step 4: Wait for deployment to complete
      const finalDeployment = await this.waitForVercelDeployment(deployment.id);

      const buildTime = Date.now() - startTime;

      // Step 5: Set custom domain if provided
      if (config.domain) {
        await this.setVercelDomain(config.projectName, config.domain);
      }

      return {
        success: finalDeployment.readyState === 'READY',
        url: finalDeployment.url || `https://${deployment.url}`,
        deploymentId: deployment.id,
        platform: 'vercel',
        buildTime,
      };
    } catch (error) {
      console.error('Vercel deployment failed:', error);
      return {
        success: false,
        url: '',
        deploymentId: '',
        platform: 'vercel',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get or create Vercel project
   */
  private async getOrCreateVercelProject(projectName: string): Promise<any> {
    if (!this.vercelClient) throw new Error('Vercel client not initialized');

    try {
      // Try to get existing project
      const response = await this.vercelClient.get(`/v9/projects/${projectName}`);
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) {
        // Project doesn't exist, create it
        const response = await this.vercelClient.post('/v9/projects', {
          name: projectName,
        });
        return response.data;
      }
      throw error;
    }
  }

  /**
   * Prepare files for Vercel deployment
   */
  private async prepareFilesForVercel(projectPath: string): Promise<Array<{
    file: string;
    data: string;
  }>> {
    const files: Array<{ file: string; data: string }> = [];

    // Read all files in the project
    const walkDir = async (dir: string, baseDir: string = dir) => {
      const entries = await fs.readdir(dir, { withFileTypes: true });

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        const relativePath = path.relative(baseDir, fullPath);

        // Skip node_modules, .git, and other common ignored directories
        if (
          entry.name === 'node_modules' ||
          entry.name === '.git' ||
          entry.name === '.next' ||
          entry.name === 'dist' ||
          entry.name === '.vercel'
        ) {
          continue;
        }

        if (entry.isDirectory()) {
          await walkDir(fullPath, baseDir);
        } else {
          const content = await fs.readFile(fullPath, 'utf-8');
          files.push({
            file: relativePath,
            data: content,
          });
        }
      }
    };

    await walkDir(projectPath);

    return files;
  }

  /**
   * Wait for Vercel deployment to complete
   */
  private async waitForVercelDeployment(deploymentId: string, maxWait: number = 600000): Promise<any> {
    if (!this.vercelClient) throw new Error('Vercel client not initialized');

    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const response = await this.vercelClient.get(`/v13/deployments/${deploymentId}`);
      const deployment = response.data;

      if (deployment.readyState === 'READY' || deployment.readyState === 'ERROR') {
        return deployment;
      }

      // Wait 5 seconds before checking again
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    throw new Error('Deployment timeout');
  }

  /**
   * Set custom domain for Vercel project
   */
  private async setVercelDomain(projectName: string, domain: string): Promise<void> {
    if (!this.vercelClient) throw new Error('Vercel client not initialized');

    await this.vercelClient.post(`/v9/projects/${projectName}/domains`, {
      name: domain,
    });
  }

  /**
   * Map framework to Vercel framework identifier
   */
  private mapFrameworkToVercel(framework?: string): string {
    const mapping: Record<string, string> = {
      nextjs: 'nextjs',
      react: 'create-react-app',
      vue: 'vue',
      svelte: 'svelte',
      angular: 'angular',
      static: 'static',
    };

    return mapping[framework || 'static'] || 'static';
  }

  /**
   * Deploy to Netlify
   */
  async deployToNetlify(config: DeploymentConfig): Promise<DeploymentResult> {
    if (!this.netlifyClient) {
      return {
        success: false,
        url: '',
        deploymentId: '',
        platform: 'netlify',
        error: 'Netlify token not configured',
      };
    }

    try {
      const startTime = Date.now();

      // Step 1: Build the project
      const buildCommand = config.buildCommand || this.getDefaultBuildCommand(config.framework);
      const outputDir = config.outputDirectory || this.getDefaultOutputDir(config.framework);

      console.log('Building project...');
      await execAsync(`cd "${config.projectPath}" && ${buildCommand}`);

      // Step 2: Create a zip of the build output
      const zipPath = path.join(config.projectPath, 'deploy.zip');
      await this.createZip(path.join(config.projectPath, outputDir), zipPath);

      // Step 3: Get or create Netlify site
      const site = await this.getOrCreateNetlifySite(config.projectName);

      // Step 4: Deploy to Netlify
      const deployResponse = await this.netlifyClient.post(
        `/sites/${site.id}/deploys`,
        createReadStream(zipPath),
        {
          headers: {
            'Content-Type': 'application/zip',
          },
        }
      );

      const deploy = deployResponse.data;

      // Step 5: Wait for deployment to complete
      const finalDeploy = await this.waitForNetlifyDeployment(deploy.id);

      const buildTime = Date.now() - startTime;

      // Clean up zip file
      await fs.unlink(zipPath);

      // Step 6: Set custom domain if provided
      if (config.domain) {
        await this.setNetlifyDomain(site.id, config.domain);
      }

      return {
        success: finalDeploy.state === 'ready',
        url: finalDeploy.ssl_url || finalDeploy.url,
        deploymentId: deploy.id,
        platform: 'netlify',
        buildTime,
      };
    } catch (error) {
      console.error('Netlify deployment failed:', error);
      return {
        success: false,
        url: '',
        deploymentId: '',
        platform: 'netlify',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get or create Netlify site
   */
  private async getOrCreateNetlifySite(siteName: string): Promise<any> {
    if (!this.netlifyClient) throw new Error('Netlify client not initialized');

    try {
      // Try to find existing site
      const sitesResponse = await this.netlifyClient.get('/sites');
      const sites = sitesResponse.data;

      const existingSite = sites.find((site: any) =>
        site.name === siteName || site.custom_domain === siteName
      );

      if (existingSite) {
        return existingSite;
      }

      // Create new site
      const response = await this.netlifyClient.post('/sites', {
        name: siteName,
      });

      return response.data;
    } catch (error) {
      console.error('Failed to get or create Netlify site:', error);
      throw error;
    }
  }

  /**
   * Wait for Netlify deployment to complete
   */
  private async waitForNetlifyDeployment(deployId: string, maxWait: number = 600000): Promise<any> {
    if (!this.netlifyClient) throw new Error('Netlify client not initialized');

    const startTime = Date.now();

    while (Date.now() - startTime < maxWait) {
      const response = await this.netlifyClient.get(`/deploys/${deployId}`);
      const deploy = response.data;

      if (deploy.state === 'ready' || deploy.state === 'error') {
        return deploy;
      }

      // Wait 5 seconds before checking again
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }

    throw new Error('Deployment timeout');
  }

  /**
   * Set custom domain for Netlify site
   */
  private async setNetlifyDomain(siteId: string, domain: string): Promise<void> {
    if (!this.netlifyClient) throw new Error('Netlify client not initialized');

    await this.netlifyClient.post(`/sites/${siteId}/domains`, {
      domain: domain,
    });
  }

  /**
   * Deploy to Cloudflare Pages
   */
  async deployToCloudflarePages(config: DeploymentConfig): Promise<DeploymentResult> {
    if (!process.env.CLOUDFLARE_API_TOKEN || !process.env.CLOUDFLARE_ACCOUNT_ID) {
      return {
        success: false,
        url: '',
        deploymentId: '',
        platform: 'cloudflare-pages',
        error: 'Cloudflare credentials not configured',
      };
    }

    try {
      const startTime = Date.now();

      // Build the project
      const buildCommand = config.buildCommand || this.getDefaultBuildCommand(config.framework);
      const outputDir = config.outputDirectory || this.getDefaultOutputDir(config.framework);

      console.log('Building project...');
      await execAsync(`cd "${config.projectPath}" && ${buildCommand}`);

      // Use Wrangler CLI to deploy
      const command = `cd "${config.projectPath}" && npx wrangler pages publish ${outputDir} --project-name=${config.projectName}`;

      const { stdout, stderr } = await execAsync(command);

      const buildTime = Date.now() - startTime;

      // Extract deployment URL from output
      const urlMatch = stdout.match(/https:\/\/[^\s]+/);
      const url = urlMatch ? urlMatch[0] : '';

      return {
        success: true,
        url: url,
        deploymentId: `cf_${Date.now()}`,
        platform: 'cloudflare-pages',
        buildTime,
        logs: [stdout],
      };
    } catch (error) {
      console.error('Cloudflare Pages deployment failed:', error);
      return {
        success: false,
        url: '',
        deploymentId: '',
        platform: 'cloudflare-pages',
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get default build command for framework
   */
  private getDefaultBuildCommand(framework?: string): string {
    const commands: Record<string, string> = {
      nextjs: 'npm run build',
      react: 'npm run build',
      vue: 'npm run build',
      svelte: 'npm run build',
      angular: 'npm run build',
      static: 'echo "No build needed"',
    };

    return commands[framework || 'static'] || 'npm run build';
  }

  /**
   * Get default output directory for framework
   */
  private getDefaultOutputDir(framework?: string): string {
    const dirs: Record<string, string> = {
      nextjs: '.next',
      react: 'build',
      vue: 'dist',
      svelte: 'public',
      angular: 'dist',
      static: '.',
    };

    return dirs[framework || 'static'] || 'dist';
  }

  /**
   * Create a zip archive of a directory
   */
  private async createZip(sourceDir: string, outputPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const output = require('fs').createWriteStream(outputPath);
      const archive = archiver('zip', { zlib: { level: 9 } });

      output.on('close', () => resolve());
      archive.on('error', (err: Error) => reject(err));

      archive.pipe(output);
      archive.directory(sourceDir, false);
      archive.finalize();
    });
  }

  /**
   * Get deployment logs
   */
  async getDeploymentLogs(platform: string, deploymentId: string): Promise<string[]> {
    try {
      if (platform === 'vercel' && this.vercelClient) {
        const response = await this.vercelClient.get(`/v13/deployments/${deploymentId}/events`);
        return response.data.map((event: any) => event.text);
      }

      if (platform === 'netlify' && this.netlifyClient) {
        const response = await this.netlifyClient.get(`/deploys/${deploymentId}/log`);
        return [response.data];
      }

      return ['Logs not available for this platform'];
    } catch (error) {
      console.error('Failed to get deployment logs:', error);
      return ['Failed to fetch logs'];
    }
  }

  /**
   * Delete deployment
   */
  async deleteDeployment(platform: string, deploymentId: string): Promise<boolean> {
    try {
      if (platform === 'vercel' && this.vercelClient) {
        await this.vercelClient.delete(`/v13/deployments/${deploymentId}`);
        return true;
      }

      if (platform === 'netlify' && this.netlifyClient) {
        await this.netlifyClient.delete(`/deploys/${deploymentId}`);
        return true;
      }

      return false;
    } catch (error) {
      console.error('Failed to delete deployment:', error);
      return false;
    }
  }
}

export default WebDeployService;

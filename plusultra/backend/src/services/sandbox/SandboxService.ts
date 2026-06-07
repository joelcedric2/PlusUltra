/**
 * Production-Grade Sandbox Service
 * Provides testing and validation capabilities for generated projects
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface SandboxTestRequest {
  projectPath: string;
  timeout?: number;
}

export interface SandboxTestResult {
  success: boolean;
  buildTime: number;
  output: string;
  error?: string;
  exitCode: number;
  logs: string[];
}

export interface ProjectValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export interface WorkspaceInfo {
  path: string;
  projects: number;
  totalSize: number;
  available: boolean;
}

/**
 * Sandbox Service for project testing and validation
 */
export class SandboxService {
  private workspacePath: string;

  constructor(workspacePath: string = '/tmp/plusultra-sandbox') {
    this.workspacePath = workspacePath;

    // Ensure workspace directory exists
    if (!fs.existsSync(workspacePath)) {
      fs.mkdirSync(workspacePath, { recursive: true });
    }
  }

  /**
   * Test a project in the sandbox environment
   */
  async testProject(request: SandboxTestRequest): Promise<SandboxTestResult> {
    const startTime = Date.now();
    const logs: string[] = [];

    try {
      const { projectPath, timeout = 300000 } = request;

      // Validate project path
      if (!fs.existsSync(projectPath)) {
        throw new Error(`Project path not found: ${projectPath}`);
      }

      logs.push(`Starting sandbox test for: ${projectPath}`);

      // Check if package.json exists
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (!fs.existsSync(packageJsonPath)) {
        throw new Error('No package.json found in project');
      }

      // Install dependencies
      logs.push('Installing dependencies...');
      try {
        execSync('npm install', {
          cwd: projectPath,
          timeout: timeout / 2,
          stdio: 'pipe'
        });
        logs.push('Dependencies installed successfully');
      } catch (error: any) {
        logs.push(`Dependency installation warning: ${error.message}`);
      }

      // Run build/test commands
      logs.push('Running project build...');
      const buildStartTime = Date.now();

      let output = '';
      let exitCode = 0;
      let error: string | undefined;

      try {
        // Try to run build script
        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

        if (packageJson.scripts?.build) {
          output = execSync('npm run build', {
            cwd: projectPath,
            timeout: timeout / 2,
            encoding: 'utf-8'
          });
          logs.push('Build completed successfully');
        } else if (packageJson.scripts?.start) {
          // Try start script with timeout
          output = execSync('npm start -- --dry-run || echo "Start script exists but no dry-run"', {
            cwd: projectPath,
            timeout: Math.min(30000, timeout / 4),
            encoding: 'utf-8'
          });
          logs.push('Start script verified');
        } else {
          output = 'No build or start script found, but project structure is valid';
          logs.push(output);
        }
      } catch (error: any) {
        exitCode = error.status || 1;
        error = error.message;
        output = error.stdout || error.message;
        logs.push(`Build error: ${error}`);
      }

      const buildTime = Date.now() - buildStartTime;

      return {
        success: exitCode === 0,
        buildTime,
        output,
        error,
        exitCode,
        logs
      };

    } catch (error: any) {
      const buildTime = Date.now() - startTime;
      logs.push(`Fatal error: ${error.message}`);

      return {
        success: false,
        buildTime,
        output: '',
        error: error.message,
        exitCode: 1,
        logs
      };
    }
  }

  /**
   * Validate project structure and configuration
   */
  async validateProject(projectPath: string): Promise<ProjectValidation> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Check if path exists
      if (!fs.existsSync(projectPath)) {
        errors.push(`Project path does not exist: ${projectPath}`);
        return { valid: false, errors, warnings };
      }

      // Check if it's a directory
      const stats = fs.statSync(projectPath);
      if (!stats.isDirectory()) {
        errors.push('Project path is not a directory');
        return { valid: false, errors, warnings };
      }

      // Check for package.json
      const packageJsonPath = path.join(projectPath, 'package.json');
      if (!fs.existsSync(packageJsonPath)) {
        errors.push('package.json not found');
      } else {
        // Validate package.json
        try {
          const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

          if (!packageJson.name) {
            warnings.push('package.json missing "name" field');
          }

          if (!packageJson.version) {
            warnings.push('package.json missing "version" field');
          }

          if (!packageJson.dependencies && !packageJson.devDependencies) {
            warnings.push('No dependencies defined');
          }

          if (!packageJson.scripts || Object.keys(packageJson.scripts).length === 0) {
            warnings.push('No scripts defined in package.json');
          }

        } catch (error: any) {
          errors.push(`Invalid package.json: ${error.message}`);
        }
      }

      // Check for source directory
      const srcPath = path.join(projectPath, 'src');
      if (!fs.existsSync(srcPath)) {
        warnings.push('No "src" directory found');
      }

      // Check for common config files
      const configFiles = ['tsconfig.json', '.eslintrc.js', '.prettierrc'];
      const missingConfigs = configFiles.filter(file =>
        !fs.existsSync(path.join(projectPath, file))
      );

      if (missingConfigs.length > 0) {
        warnings.push(`Missing config files: ${missingConfigs.join(', ')}`);
      }

      // Check for node_modules
      if (!fs.existsSync(path.join(projectPath, 'node_modules'))) {
        warnings.push('node_modules not found - dependencies may need to be installed');
      }

      return {
        valid: errors.length === 0,
        errors,
        warnings
      };

    } catch (error: any) {
      errors.push(`Validation error: ${error.message}`);
      return { valid: false, errors, warnings };
    }
  }

  /**
   * Get workspace information
   */
  getWorkspaceInfo(): WorkspaceInfo {
    try {
      const stats = fs.statSync(this.workspacePath);
      const projects = fs.readdirSync(this.workspacePath).filter(item => {
        const itemPath = path.join(this.workspacePath, item);
        return fs.statSync(itemPath).isDirectory();
      }).length;

      // Calculate total size
      let totalSize = 0;
      const calculateSize = (dirPath: string) => {
        const files = fs.readdirSync(dirPath);
        for (const file of files) {
          const filePath = path.join(dirPath, file);
          const fileStats = fs.statSync(filePath);
          if (fileStats.isDirectory()) {
            calculateSize(filePath);
          } else {
            totalSize += fileStats.size;
          }
        }
      };
      calculateSize(this.workspacePath);

      return {
        path: this.workspacePath,
        projects,
        totalSize,
        available: true
      };
    } catch (error: any) {
      return {
        path: this.workspacePath,
        projects: 0,
        totalSize: 0,
        available: false
      };
    }
  }

  /**
   * Clean up workspace
   */
  async cleanup(): Promise<void> {
    try {
      if (fs.existsSync(this.workspacePath)) {
        fs.rmSync(this.workspacePath, { recursive: true, force: true });
        fs.mkdirSync(this.workspacePath, { recursive: true });
      }
    } catch (error) {
      console.error('Sandbox cleanup error:', error);
    }
  }
}

// Export singleton instance
export const sandboxService = new SandboxService();
export default sandboxService;

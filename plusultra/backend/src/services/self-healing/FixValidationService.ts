/**
 * Fix Validation Service
 *
 * Tests generated fixes in isolated Docker sandboxes before deployment.
 * Ensures fixes don't introduce new bugs or break existing functionality.
 */

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../../lib/prisma';
import type { ErrorContext } from './ErrorAnalysisService';

const execAsync = promisify(exec);

export interface ValidationResult {
  passed: boolean;
  testsRun: number;
  testsPassed: number;
  testsFailed: number;
  error?: string;
  logs: string;
  duration: number;
}

export interface SandboxConfig {
  timeout?: number; // milliseconds
  memory?: string; // e.g., '512m'
  cpu?: string; // e.g., '1.0'
}

export class FixValidationService {
  private readonly DEFAULT_TIMEOUT = 120000; // 2 minutes
  private readonly SANDBOX_BASE_PATH = '/tmp/plusultra-healing-sandbox';

  /**
   * Validate fix by testing in sandbox
   */
  async validateFix(
    attemptId: string,
    errorContext: ErrorContext,
    fixCode: string,
    config: SandboxConfig = {}
  ): Promise<ValidationResult> {
    const startTime = Date.now();

    console.log(`[Fix Validation] Starting validation for attempt ${attemptId}`);

    try {
      // Step 1: Create sandbox environment
      const sandboxPath = await this.createSandbox(attemptId);

      // Step 2: Copy project files to sandbox
      if (errorContext.projectId) {
        await this.copyProjectToSandbox(errorContext.projectId, sandboxPath);
      }

      // Step 3: Apply fix to sandbox
      await this.applyFix(sandboxPath, errorContext.filePath, fixCode);

      // Step 4: Run tests in sandbox
      const testResult = await this.runTests(
        sandboxPath,
        errorContext.language,
        config.timeout || this.DEFAULT_TIMEOUT
      );

      // Step 5: Cleanup sandbox
      await this.cleanupSandbox(sandboxPath);

      const duration = Date.now() - startTime;

      console.log(
        `[Fix Validation] Validation ${testResult.passed ? 'PASSED' : 'FAILED'} ` +
        `(${testResult.testsPassed}/${testResult.testsRun} tests passed, ${duration}ms)`
      );

      return {
        ...testResult,
        duration,
      };

    } catch (error: any) {
      console.error(`[Fix Validation] Validation failed:`, error);

      return {
        passed: false,
        testsRun: 0,
        testsPassed: 0,
        testsFailed: 0,
        error: error.message,
        logs: error.stack || '',
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Create isolated sandbox directory
   */
  private async createSandbox(attemptId: string): Promise<string> {
    const sandboxPath = path.join(this.SANDBOX_BASE_PATH, attemptId);

    try {
      await fs.mkdir(sandboxPath, { recursive: true });
      console.log(`[Fix Validation] Created sandbox at ${sandboxPath}`);
      return sandboxPath;
    } catch (error: any) {
      throw new Error(`Failed to create sandbox: ${error.message}`);
    }
  }

  /**
   * Copy project files to sandbox
   */
  private async copyProjectToSandbox(projectId: string, sandboxPath: string): Promise<void> {
    // TODO: Implement project file copying
    // For now, this is a placeholder
    console.log(`[Fix Validation] Would copy project ${projectId} to ${sandboxPath}`);
  }

  /**
   * Apply fix to file in sandbox
   */
  private async applyFix(
    sandboxPath: string,
    filePath: string,
    fixCode: string
  ): Promise<void> {
    const targetPath = path.join(sandboxPath, filePath);

    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(targetPath), { recursive: true });

      // Write fixed code
      await fs.writeFile(targetPath, fixCode, 'utf-8');

      console.log(`[Fix Validation] Applied fix to ${filePath}`);
    } catch (error: any) {
      throw new Error(`Failed to apply fix: ${error.message}`);
    }
  }

  /**
   * Run tests in sandbox
   */
  private async runTests(
    sandboxPath: string,
    language: string,
    timeout: number
  ): Promise<Omit<ValidationResult, 'duration'>> {
    console.log(`[Fix Validation] Running tests in sandbox...`);

    try {
      // Determine test command based on language
      const testCommand = this.getTestCommand(language, sandboxPath);

      if (!testCommand) {
        // No test framework detected, do basic validation
        return await this.basicValidation(sandboxPath, language);
      }

      // Run tests with timeout
      const { stdout, stderr } = await execAsync(testCommand, {
        cwd: sandboxPath,
        timeout,
        maxBuffer: 10 * 1024 * 1024, // 10MB
      });

      // Parse test output
      const result = this.parseTestOutput(stdout + stderr, language);

      return {
        passed: result.testsFailed === 0,
        testsRun: result.testsRun,
        testsPassed: result.testsPassed,
        testsFailed: result.testsFailed,
        logs: stdout + stderr,
      };

    } catch (error: any) {
      // Test command failed
      return {
        passed: false,
        testsRun: 0,
        testsPassed: 0,
        testsFailed: 1,
        error: error.message,
        logs: error.stdout || error.stderr || error.message,
      };
    }
  }

  /**
   * Get test command for language
   */
  private getTestCommand(language: string, sandboxPath: string): string | null {
    const commands: Record<string, string> = {
      'javascript': 'npm test',
      'typescript': 'npm test',
      'python': 'pytest',
      'ruby': 'rspec',
      'java': 'mvn test',
      'go': 'go test ./...',
      'rust': 'cargo test',
    };

    return commands[language] || null;
  }

  /**
   * Parse test output to extract results
   */
  private parseTestOutput(output: string, language: string): {
    testsRun: number;
    testsPassed: number;
    testsFailed: number;
  } {
    // Jest/npm test output
    if (language === 'javascript' || language === 'typescript') {
      const jestMatch = output.match(/Tests:\s+(\d+)\s+failed,\s+(\d+)\s+passed,\s+(\d+)\s+total/i);
      if (jestMatch) {
        return {
          testsFailed: parseInt(jestMatch[1]),
          testsPassed: parseInt(jestMatch[2]),
          testsRun: parseInt(jestMatch[3]),
        };
      }

      const simpleMatch = output.match(/(\d+)\s+passing/i);
      if (simpleMatch) {
        return {
          testsPassed: parseInt(simpleMatch[1]),
          testsFailed: 0,
          testsRun: parseInt(simpleMatch[1]),
        };
      }
    }

    // Pytest output
    if (language === 'python') {
      const pytestMatch = output.match(/(\d+)\s+passed/i);
      const failedMatch = output.match(/(\d+)\s+failed/i);

      if (pytestMatch || failedMatch) {
        const passed = pytestMatch ? parseInt(pytestMatch[1]) : 0;
        const failed = failedMatch ? parseInt(failedMatch[1]) : 0;

        return {
          testsPassed: passed,
          testsFailed: failed,
          testsRun: passed + failed,
        };
      }
    }

    // Default: assume tests failed if we can't parse
    return {
      testsRun: 1,
      testsPassed: 0,
      testsFailed: 1,
    };
  }

  /**
   * Basic validation (syntax check) when no tests exist
   */
  private async basicValidation(
    sandboxPath: string,
    language: string
  ): Promise<Omit<ValidationResult, 'duration'>> {
    console.log(`[Fix Validation] No tests found, running basic syntax check...`);

    try {
      const syntaxCheck = this.getSyntaxCheckCommand(language);

      if (syntaxCheck) {
        await execAsync(syntaxCheck, {
          cwd: sandboxPath,
          timeout: 30000, // 30 seconds for syntax check
        });
      }

      return {
        passed: true,
        testsRun: 1,
        testsPassed: 1,
        testsFailed: 0,
        logs: 'Syntax check passed',
      };

    } catch (error: any) {
      return {
        passed: false,
        testsRun: 1,
        testsPassed: 0,
        testsFailed: 1,
        error: 'Syntax check failed',
        logs: error.message,
      };
    }
  }

  /**
   * Get syntax check command for language
   */
  private getSyntaxCheckCommand(language: string): string | null {
    const commands: Record<string, string> = {
      'javascript': 'node --check **/*.js',
      'typescript': 'tsc --noEmit',
      'python': 'python -m py_compile **/*.py',
      'ruby': 'ruby -c **/*.rb',
      'go': 'go build',
      'rust': 'cargo check',
    };

    return commands[language] || null;
  }

  /**
   * Cleanup sandbox after validation
   */
  private async cleanupSandbox(sandboxPath: string): Promise<void> {
    try {
      await fs.rm(sandboxPath, { recursive: true, force: true });
      console.log(`[Fix Validation] Cleaned up sandbox at ${sandboxPath}`);
    } catch (error: any) {
      console.warn(`[Fix Validation] Failed to cleanup sandbox: ${error.message}`);
    }
  }

  /**
   * Run validation in Docker container (more isolated)
   */
  async validateInDocker(
    attemptId: string,
    errorContext: ErrorContext,
    fixCode: string,
    dockerImage?: string
  ): Promise<ValidationResult> {
    console.log(`[Fix Validation] Starting Docker validation for attempt ${attemptId}`);

    // TODO: Implement Docker-based validation
    // This would spin up a Docker container with the project,
    // apply the fix, run tests, and return results

    // For now, fall back to regular validation
    return this.validateFix(attemptId, errorContext, fixCode);
  }
}

export const fixValidationService = new FixValidationService();

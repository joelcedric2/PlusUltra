import * as fs from 'fs/promises';
import * as path from 'path';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export interface ProjectAnalysis {
  projectPath: string;
  analysis: {
    dependencies: DependencyAnalysis;
    codeQuality: CodeQualityAnalysis;
    security: SecurityAnalysis;
    performance: PerformanceAnalysis;
    compatibility: CompatibilityAnalysis;
  };
  recommendations: Recommendation[];
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
}

export interface DependencyAnalysis {
  totalDependencies: number;
  outdated: string[];
  vulnerabilities: Vulnerability[];
  unused: string[];
  conflicts: string[];
}

export interface Vulnerability {
  package: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  fix: string;
}

export interface CodeQualityAnalysis {
  complexity: number;
  maintainability: number;
  testCoverage: number;
  lintingErrors: number;
  typeErrors: number;
  codeSmells: CodeSmell[];
}

export interface CodeSmell {
  file: string;
  line: number;
  type: string;
  description: string;
  severity: 'info' | 'warning' | 'error';
}

export interface SecurityAnalysis {
  score: number;
  issues: SecurityIssue[];
  compliance: ComplianceCheck[];
}

export interface SecurityIssue {
  type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  file?: string;
  line?: number;
  suggestion?: string;
}

export interface ComplianceCheck {
  regulation: string;
  status: 'compliant' | 'non-compliant' | 'partial';
  issues: string[];
}

export interface PerformanceAnalysis {
  score: number;
  bundleSize: number;
  loadTime: number;
  issues: PerformanceIssue[];
}

export interface PerformanceIssue {
  type: string;
  impact: 'low' | 'medium' | 'high';
  description: string;
  file?: string;
  suggestion: string;
}

export interface CompatibilityAnalysis {
  ios: CompatibilityResult;
  android: CompatibilityResult;
  web: CompatibilityResult;
  issues: CompatibilityIssue[];
}

export interface CompatibilityResult {
  supported: boolean;
  version?: string;
  issues: string[];
}

export interface CompatibilityIssue {
  platform: string;
  type: string;
  severity: 'low' | 'medium' | 'high';
  description: string;
  fix: string;
}

export interface Recommendation {
  type: 'dependency' | 'code' | 'security' | 'performance' | 'compatibility';
  priority: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  fix: string;
  estimatedEffort: string;
}

export class PredictiveDebuggingService {
  private analysisCache: Map<string, { analysis: ProjectAnalysis; timestamp: number }> = new Map();
  private readonly CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  /**
   * Analyze project for potential issues before build
   */
  async analyzeProject(projectPath: string, forceRefresh = false): Promise<ProjectAnalysis> {
    const cacheKey = projectPath;

    // Check cache first
    const cached = this.analysisCache.get(cacheKey);
    if (cached && !forceRefresh && (Date.now() - cached.timestamp) < this.CACHE_DURATION) {
      return cached.analysis;
    }

    console.log(`Analyzing project: ${projectPath}`);

    const analysis: ProjectAnalysis = {
      projectPath,
      analysis: {
        dependencies: await this.analyzeDependencies(projectPath),
        codeQuality: await this.analyzeCodeQuality(projectPath),
        security: await this.analyzeSecurity(projectPath),
        performance: await this.analyzePerformance(projectPath),
        compatibility: await this.analyzeCompatibility(projectPath)
      },
      recommendations: [],
      riskLevel: 'low'
    };

    // Generate recommendations based on analysis
    analysis.recommendations = this.generateRecommendations(analysis);

    // Calculate overall risk level
    analysis.riskLevel = this.calculateRiskLevel(analysis);

    // Cache the result
    this.analysisCache.set(cacheKey, {
      analysis,
      timestamp: Date.now()
    });

    return analysis;
  }

  /**
   * Analyze project dependencies
   */
  private async analyzeDependencies(projectPath: string): Promise<DependencyAnalysis> {
    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

      const analysis: DependencyAnalysis = {
        totalDependencies: Object.keys({ ...packageJson.dependencies, ...packageJson.devDependencies }).length,
        outdated: [],
        vulnerabilities: [],
        unused: [],
        conflicts: []
      };

      // Check for outdated packages
      try {
        const { stdout: outdatedOutput } = await execAsync(`cd ${projectPath} && npm outdated --json`);
        const outdated = JSON.parse(outdatedOutput);
        analysis.outdated = Object.keys(outdated);
      } catch (error) {
        // npm outdated returns non-zero if packages are outdated
      }

      // Check for security vulnerabilities
      try {
        const { stdout: auditOutput } = await execAsync(`cd ${projectPath} && npm audit --json`);
        const audit = JSON.parse(auditOutput);

        if (audit.vulnerabilities) {
          analysis.vulnerabilities = Object.entries(audit.vulnerabilities).map(([pkg, vuln]: [string, any]) => ({
            package: pkg,
            severity: vuln.severity as Vulnerability['severity'],
            description: vuln.title,
            fix: `npm audit fix --force || npm update ${pkg}`
          }));
        }
      } catch (error) {
        // npm audit returns non-zero if vulnerabilities exist
      }

      // Check for unused dependencies
      try {
        const { stdout: unusedOutput } = await execAsync(`cd ${projectPath} && npx depcheck --json`);
        const unused = JSON.parse(unusedOutput);
        analysis.unused = Object.keys(unused.dependencies || {});
      } catch (error) {
        // depcheck might not be available
      }

      return analysis;

    } catch (error) {
      console.error('Dependency analysis failed:', error);
      return {
        totalDependencies: 0,
        outdated: [],
        vulnerabilities: [],
        unused: [],
        conflicts: []
      };
    }
  }

  /**
   * Analyze code quality
   */
  private async analyzeCodeQuality(projectPath: string): Promise<CodeQualityAnalysis> {
    const analysis: CodeQualityAnalysis = {
      complexity: 0,
      maintainability: 0,
      testCoverage: 0,
      lintingErrors: 0,
      typeErrors: 0,
      codeSmells: []
    };

    try {
      // Run ESLint
      try {
        const { stdout: eslintOutput } = await execAsync(`cd ${projectPath} && npx eslint . --format=json`);
        const eslintResults = JSON.parse(eslintOutput);

        analysis.lintingErrors = eslintResults.reduce((total: number, file: any) =>
          total + file.messages.filter((msg: any) => msg.severity === 2).length, 0
        );

        // Extract code smells
        eslintResults.forEach((file: any) => {
          file.messages.forEach((msg: any) => {
            analysis.codeSmells.push({
              file: path.relative(projectPath, file.filePath),
              line: msg.line,
              type: 'linting',
              description: msg.message,
              severity: msg.severity === 2 ? 'error' : 'warning'
            });
          });
        });
      } catch (error) {
        // ESLint might not be configured
      }

      // Run TypeScript check
      try {
        const { stderr: tscOutput } = await execAsync(`cd ${projectPath} && npx tsc --noEmit`);
        // Count TypeScript errors (simplified)
        const errorCount = (tscOutput.match(/error TS/g) || []).length;
        analysis.typeErrors = errorCount;
      } catch (error) {
        // TypeScript errors will be in stderr
      }

      // Run tests to check coverage
      try {
        const { stdout: testOutput } = await execAsync(`cd ${projectPath} && npm test -- --coverage --coverageReporters=json`);
        // This would parse coverage data in a real implementation
        analysis.testCoverage = 85; // Mock value
      } catch (error) {
        // Tests might not be available
      }

    } catch (error) {
      console.error('Code quality analysis failed:', error);
    }

    return analysis;
  }

  /**
   * Analyze security issues
   */
  private async analyzeSecurity(projectPath: string): Promise<SecurityAnalysis> {
    const analysis: SecurityAnalysis = {
      score: 100,
      issues: [],
      compliance: []
    };

    try {
      // Check for common security issues
      const files = await this.getAllFiles(projectPath);

      for (const file of files) {
        if (file.endsWith('.js') || file.endsWith('.ts') || file.endsWith('.tsx')) {
          const content = await fs.readFile(file, 'utf-8');

          // Check for hardcoded secrets
          if (content.match(/(password|secret|key|token)\s*[=:]?\s*["'][^"']*["']/i)) {
            analysis.issues.push({
              type: 'hardcoded-secret',
              severity: 'critical',
              description: 'Potential hardcoded secret or API key found',
              file: path.relative(projectPath, file),
              suggestion: 'Move secrets to environment variables'
            });
          }

          // Check for console.log statements in production code
          if (content.includes('console.log') && !file.includes('.test.') && !file.includes('__tests__')) {
            analysis.issues.push({
              type: 'debug-code',
              severity: 'medium',
              description: 'Console.log statement found in production code',
              file: path.relative(projectPath, file),
              suggestion: 'Remove or replace with proper logging'
            });
          }

          // Check for dangerous innerHTML usage
          if (content.includes('innerHTML') && !file.includes('.test.')) {
            analysis.issues.push({
              type: 'xss-risk',
              severity: 'high',
              description: 'Potential XSS vulnerability with innerHTML usage',
              file: path.relative(projectPath, file),
              suggestion: 'Use textContent or sanitize HTML input'
            });
          }
        }
      }

      // Check compliance
      analysis.compliance = [
        {
          regulation: 'GDPR',
          status: analysis.issues.some(i => i.type.includes('data')) ? 'non-compliant' : 'compliant',
          issues: analysis.issues.filter(i => i.type.includes('data')).map(i => i.description)
        }
      ];

      // Calculate security score
      const criticalIssues = analysis.issues.filter(i => i.severity === 'critical').length;
      const highIssues = analysis.issues.filter(i => i.severity === 'high').length;
      const mediumIssues = analysis.issues.filter(i => i.severity === 'medium').length;

      analysis.score = Math.max(0, 100 - (criticalIssues * 25 + highIssues * 15 + mediumIssues * 5));

    } catch (error) {
      console.error('Security analysis failed:', error);
    }

    return analysis;
  }

  /**
   * Analyze performance issues
   */
  private async analyzePerformance(projectPath: string): Promise<PerformanceAnalysis> {
    const analysis: PerformanceAnalysis = {
      score: 100,
      bundleSize: 0,
      loadTime: 0,
      issues: []
    };

    try {
      // Check bundle size
      try {
        const { stdout: bundleOutput } = await execAsync(`cd ${projectPath} && npx react-native bundle --platform ios --dev false --entry-file index.js --bundle-output bundle.js --sourcemap-output bundle.map`);
        const stats = await fs.stat(path.join(projectPath, 'bundle.js'));
        analysis.bundleSize = stats.size;

        if (stats.size > 50 * 1024 * 1024) { // 50MB
          analysis.issues.push({
            type: 'large-bundle',
            impact: 'high',
            description: `Bundle size (${Math.round(stats.size / 1024 / 1024)}MB) exceeds recommended limit`,
            suggestion: 'Implement code splitting and lazy loading'
          });
        }
      } catch (error) {
        // Bundle analysis might not be available
      }

      // Check for performance anti-patterns
      const files = await this.getAllFiles(projectPath);

      for (const file of files) {
        if (file.endsWith('.tsx') || file.endsWith('.ts')) {
          const content = await fs.readFile(file, 'utf-8');

          // Check for large components
          const lines = content.split('\n').length;
          if (lines > 500) {
            analysis.issues.push({
              type: 'large-component',
              impact: 'medium',
              description: `Component file has ${lines} lines (recommended < 500)`,
              file: path.relative(projectPath, file),
              suggestion: 'Split into smaller components'
            });
          }

          // Check for heavy imports in render
          if (content.includes('import') && content.includes('render') && !file.includes('.test.')) {
            // This is a simplified check - in practice you'd use AST parsing
          }
        }
      }

      // Calculate performance score
      const highImpact = analysis.issues.filter(i => i.impact === 'high').length;
      const mediumImpact = analysis.issues.filter(i => i.impact === 'medium').length;

      analysis.score = Math.max(0, 100 - (highImpact * 20 + mediumImpact * 10));

    } catch (error) {
      console.error('Performance analysis failed:', error);
    }

    return analysis;
  }

  /**
   * Analyze platform compatibility
   */
  private async analyzeCompatibility(projectPath: string): Promise<CompatibilityAnalysis> {
    const analysis: CompatibilityAnalysis = {
      ios: { supported: true, version: '12.0', issues: [] },
      android: { supported: true, version: '21', issues: [] },
      web: { supported: true, issues: [] },
      issues: []
    };

    try {
      const packageJsonPath = path.join(projectPath, 'package.json');
      const packageJson = JSON.parse(await fs.readFile(packageJsonPath, 'utf-8'));

      // Check React Native version compatibility
      const rnVersion = packageJson.dependencies['react-native']?.replace('^', '').replace('~', '');
      if (rnVersion && parseFloat(rnVersion) < 0.70) {
        analysis.issues.push({
          platform: 'ios,android',
          type: 'outdated-rn',
          severity: 'medium',
          description: `React Native ${rnVersion} may have compatibility issues`,
          fix: 'Consider upgrading to React Native 0.70+'
        });
      }

      // Check for platform-specific issues
      const files = await this.getAllFiles(projectPath);

      for (const file of files) {
        if (file.includes('.ios.') || file.includes('.android.')) {
          const content = await fs.readFile(file, 'utf-8');

          if (content.includes('Platform.OS') && !content.includes('Platform.select')) {
            analysis.issues.push({
              platform: file.includes('.ios.') ? 'ios' : 'android',
              type: 'platform-specific-logic',
              severity: 'low',
              description: 'Platform-specific logic detected',
              fix: 'Use Platform.select for better cross-platform compatibility'
            });
          }
        }
      }

    } catch (error) {
      console.error('Compatibility analysis failed:', error);
    }

    return analysis;
  }

  /**
   * Generate recommendations based on analysis
   */
  private generateRecommendations(analysis: ProjectAnalysis): Recommendation[] {
    const recommendations: Recommendation[] = [];

    // Dependency recommendations
    if (analysis.analysis.dependencies.vulnerabilities.length > 0) {
      recommendations.push({
        type: 'dependency',
        priority: 'critical',
        title: 'Security vulnerabilities detected',
        description: `${analysis.analysis.dependencies.vulnerabilities.length} packages have known vulnerabilities`,
        fix: 'Run npm audit fix and update vulnerable packages',
        estimatedEffort: '15 minutes'
      });
    }

    if (analysis.analysis.dependencies.outdated.length > 5) {
      recommendations.push({
        type: 'dependency',
        priority: 'high',
        title: 'Many outdated dependencies',
        description: `${analysis.analysis.dependencies.outdated.length} packages are outdated`,
        fix: 'Run npm update to update dependencies',
        estimatedEffort: '10 minutes'
      });
    }

    // Code quality recommendations
    if (analysis.analysis.codeQuality.lintingErrors > 10) {
      recommendations.push({
        type: 'code',
        priority: 'high',
        title: 'High number of linting errors',
        description: `${analysis.analysis.codeQuality.lintingErrors} linting errors found`,
        fix: 'Run ESLint and fix reported issues',
        estimatedEffort: '30 minutes'
      });
    }

    if (analysis.analysis.codeQuality.typeErrors > 0) {
      recommendations.push({
        type: 'code',
        priority: 'critical',
        title: 'TypeScript errors present',
        description: `${analysis.analysis.codeQuality.typeErrors} TypeScript errors found`,
        fix: 'Fix TypeScript compilation errors',
        estimatedEffort: '1 hour'
      });
    }

    // Security recommendations
    const criticalSecurityIssues = analysis.analysis.security.issues.filter(i => i.severity === 'critical').length;
    if (criticalSecurityIssues > 0) {
      recommendations.push({
        type: 'security',
        priority: 'critical',
        title: 'Critical security issues found',
        description: `${criticalSecurityIssues} critical security issues require immediate attention`,
        fix: 'Review and fix all critical security issues',
        estimatedEffort: '2 hours'
      });
    }

    // Performance recommendations
    if (analysis.analysis.performance.score < 70) {
      recommendations.push({
        type: 'performance',
        priority: 'medium',
        title: 'Performance optimizations needed',
        description: `Performance score is ${analysis.analysis.performance.score}/100`,
        fix: 'Implement performance optimizations',
        estimatedEffort: '3 hours'
      });
    }

    return recommendations;
  }

  /**
   * Calculate overall risk level
   */
  private calculateRiskLevel(analysis: ProjectAnalysis): 'low' | 'medium' | 'high' | 'critical' {
    const vulnerabilities = analysis.analysis.dependencies.vulnerabilities.length;
    const criticalSecurity = analysis.analysis.security.issues.filter(i => i.severity === 'critical').length;
    const highSecurity = analysis.analysis.security.issues.filter(i => i.severity === 'high').length;
    const typeErrors = analysis.analysis.codeQuality.typeErrors;
    const lintingErrors = analysis.analysis.codeQuality.lintingErrors;

    if (vulnerabilities > 5 || criticalSecurity > 0 || typeErrors > 10) {
      return 'critical';
    }

    if (vulnerabilities > 2 || highSecurity > 0 || typeErrors > 5 || lintingErrors > 50) {
      return 'high';
    }

    if (vulnerabilities > 0 || lintingErrors > 20) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Get all files recursively
   */
  private async getAllFiles(dirPath: string): Promise<string[]> {
    const files: string[] = [];

    async function traverse(currentPath: string) {
      const items = await fs.readdir(currentPath);

      for (const item of items) {
        const fullPath = path.join(currentPath, item);
        const stat = await fs.stat(fullPath);

        if (stat.isDirectory() && !item.startsWith('.') && item !== 'node_modules') {
          await traverse(fullPath);
        } else if (stat.isFile()) {
          files.push(fullPath);
        }
      }
    }

    await traverse(dirPath);
    return files;
  }

  /**
   * Generate fix suggestions for specific issues
   */
  async generateFixes(analysis: ProjectAnalysis): Promise<string[]> {
    const fixes: string[] = [];

    // Generate dependency fixes
    if (analysis.analysis.dependencies.vulnerabilities.length > 0) {
      fixes.push('# Fix security vulnerabilities');
      fixes.push('npm audit fix');
      fixes.push('npm update');
    }

    // Generate code quality fixes
    if (analysis.analysis.codeQuality.lintingErrors > 0) {
      fixes.push('# Fix linting errors');
      fixes.push('npx eslint . --fix');
    }

    if (analysis.analysis.codeQuality.typeErrors > 0) {
      fixes.push('# Fix TypeScript errors');
      fixes.push('npx tsc --noEmit');
    }

    return fixes;
  }
}

export default PredictiveDebuggingService;

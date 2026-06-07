/**
 * Project Context Analyzer
 *
 * Gathers context about code to enable better TCI analysis:
 * - Imported files and modules
 * - Project dependencies
 * - Exported symbols (functions, classes, types)
 * - Test coverage (if available)
 * - Framework detection
 *
 * This context is used by Layer 2 (Causal) to trace impacts across files.
 */

import * as path from 'path';
import * as fs from 'fs/promises';
import type { ProjectContext } from '../../types/tci';

export class ProjectContextAnalyzer {
  /**
   * Analyze code and extract project context
   */
  async analyzeContext(
    code: string,
    filePath: string,
    language: string
  ): Promise<ProjectContext> {
    console.log('[TCI Context] Analyzing project context...');

    const context: ProjectContext = {
      filePath,
      language,
      framework: await this.detectFramework(code, language),
      imports: this.extractImports(code, language),
      dependencies: await this.extractDependencies(filePath),
      exports: this.extractExports(code, language),
      testCoverage: await this.getTestCoverage(filePath),
    };

    console.log(`  ✅ Context extracted: ${context.imports.length} imports, ${context.exports.length} exports`);

    return context;
  }

  /**
   * Extract import statements from code
   */
  private extractImports(code: string, language: string): string[] {
    const imports: string[] = [];

    switch (language) {
      case 'typescript':
      case 'javascript':
        // Match: import { X } from 'Y'
        // Match: import X from 'Y'
        // Match: import * as X from 'Y'
        // Match: const X = require('Y')
        const importRegex = /import\s+(?:[\w\s{},*]+\s+from\s+)?['"]([^'"]+)['"]/g;
        const requireRegex = /require\s*\(['"]([^'"]+)['"]\)/g;

        let match;
        while ((match = importRegex.exec(code)) !== null) {
          imports.push(match[1]);
        }
        while ((match = requireRegex.exec(code)) !== null) {
          imports.push(match[1]);
        }
        break;

      case 'python':
        // Match: import X
        // Match: from X import Y
        const pythonImportRegex = /(?:from\s+(\S+)\s+)?import\s+(\S+)/g;
        while ((match = pythonImportRegex.exec(code)) !== null) {
          imports.push(match[1] || match[2]);
        }
        break;

      case 'go':
        // Match: import "X"
        // Match: import ( "X" "Y" )
        const goImportRegex = /import\s+(?:\(([^)]+)\)|"([^"]+)")/g;
        while ((match = goImportRegex.exec(code)) !== null) {
          if (match[1]) {
            // Multi-line import block
            const blockImports = match[1].match(/"([^"]+)"/g);
            if (blockImports) {
              imports.push(...blockImports.map(imp => imp.replace(/"/g, '')));
            }
          } else {
            imports.push(match[2]);
          }
        }
        break;

      case 'rust':
        // Match: use X;
        // Match: use X::{Y, Z};
        const rustUseRegex = /use\s+([\w:]+(?:::\{[^}]+\})?);/g;
        while ((match = rustUseRegex.exec(code)) !== null) {
          imports.push(match[1]);
        }
        break;
    }

    return [...new Set(imports)]; // Remove duplicates
  }

  /**
   * Extract exported symbols from code
   */
  private extractExports(code: string, language: string): string[] {
    const exports: string[] = [];

    switch (language) {
      case 'typescript':
      case 'javascript':
        // Match: export function X
        // Match: export class X
        // Match: export const X
        // Match: export { X }
        const exportRegex = /export\s+(?:(?:async\s+)?function|class|const|let|var|interface|type|enum)\s+(\w+)/g;
        const namedExportRegex = /export\s+\{\s*([^}]+)\s*\}/g;

        let match;
        while ((match = exportRegex.exec(code)) !== null) {
          exports.push(match[1]);
        }
        while ((match = namedExportRegex.exec(code)) !== null) {
          const names = match[1].split(',').map(n => n.trim().split(/\s+as\s+/)[0]);
          exports.push(...names);
        }

        // Match: module.exports = X
        // Match: exports.X = ...
        const commonJsRegex = /(?:module\.)?exports\.(\w+)\s*=/g;
        while ((match = commonJsRegex.exec(code)) !== null) {
          exports.push(match[1]);
        }
        break;

      case 'python':
        // Match: def X (functions)
        // Match: class X (classes)
        const pythonDefRegex = /^(?:async\s+)?def\s+(\w+)/gm;
        const pythonClassRegex = /^class\s+(\w+)/gm;

        let match2;
        while ((match2 = pythonDefRegex.exec(code)) !== null) {
          if (!match2[1].startsWith('_')) { // Skip private functions
            exports.push(match2[1]);
          }
        }
        while ((match2 = pythonClassRegex.exec(code)) !== null) {
          if (!match2[1].startsWith('_')) { // Skip private classes
            exports.push(match2[1]);
          }
        }
        break;

      case 'go':
        // Match: func X (capitalized = exported)
        // Match: type X (capitalized = exported)
        const goFuncRegex = /func\s+([A-Z]\w+)/g;
        const goTypeRegex = /type\s+([A-Z]\w+)/g;

        let match3;
        while ((match3 = goFuncRegex.exec(code)) !== null) {
          exports.push(match3[1]);
        }
        while ((match3 = goTypeRegex.exec(code)) !== null) {
          exports.push(match3[1]);
        }
        break;

      case 'rust':
        // Match: pub fn X
        // Match: pub struct X
        // Match: pub enum X
        const rustPubRegex = /pub\s+(?:fn|struct|enum|trait|const)\s+(\w+)/g;
        while ((match = rustPubRegex.exec(code)) !== null) {
          exports.push(match[1]);
        }
        break;
    }

    return [...new Set(exports)]; // Remove duplicates
  }

  /**
   * Extract project dependencies from package.json, requirements.txt, etc.
   */
  private async extractDependencies(filePath: string): Promise<string[]> {
    try {
      // Find project root by looking for dependency files
      let currentDir = path.dirname(filePath);
      const root = path.parse(currentDir).root;

      while (currentDir !== root) {
        // Check for package.json (Node.js)
        const packageJsonPath = path.join(currentDir, 'package.json');
        try {
          const packageJson = await fs.readFile(packageJsonPath, 'utf-8');
          const parsed = JSON.parse(packageJson);
          const deps = [
            ...Object.keys(parsed.dependencies || {}),
            ...Object.keys(parsed.devDependencies || {}),
          ];
          return deps.slice(0, 50); // Limit to 50 most important
        } catch {
          // File doesn't exist, continue
        }

        // Check for requirements.txt (Python)
        const requirementsPath = path.join(currentDir, 'requirements.txt');
        try {
          const requirements = await fs.readFile(requirementsPath, 'utf-8');
          return requirements
            .split('\n')
            .map(line => line.split('==')[0].split('>=')[0].trim())
            .filter(Boolean)
            .slice(0, 50);
        } catch {
          // File doesn't exist, continue
        }

        // Check for go.mod (Go)
        const goModPath = path.join(currentDir, 'go.mod');
        try {
          const goMod = await fs.readFile(goModPath, 'utf-8');
          const requireRegex = /require\s+([^\s]+)/g;
          const deps: string[] = [];
          let match;
          while ((match = requireRegex.exec(goMod)) !== null) {
            deps.push(match[1]);
          }
          return deps.slice(0, 50);
        } catch {
          // File doesn't exist, continue
        }

        // Check for Cargo.toml (Rust)
        const cargoPath = path.join(currentDir, 'Cargo.toml');
        try {
          const cargo = await fs.readFile(cargoPath, 'utf-8');
          // Simple regex - not a full TOML parser
          const depRegex = /^\s*(\w+)\s*=/gm;
          const deps: string[] = [];
          let match;
          const inDepsSection = cargo.match(/\[dependencies\]([\s\S]*?)(\[|$)/);
          if (inDepsSection) {
            while ((match = depRegex.exec(inDepsSection[1])) !== null) {
              deps.push(match[1]);
            }
          }
          return deps.slice(0, 50);
        } catch {
          // File doesn't exist, continue
        }

        // Move up one directory
        currentDir = path.dirname(currentDir);
      }

      return [];
    } catch (error) {
      console.warn('Failed to extract dependencies:', error);
      return [];
    }
  }

  /**
   * Detect framework from code patterns
   */
  private async detectFramework(code: string, language: string): Promise<string | undefined> {
    if (language === 'typescript' || language === 'javascript') {
      if (code.includes('from \'react\'') || code.includes('from "react"')) {
        return 'React';
      }
      if (code.includes('from \'vue\'') || code.includes('from "vue"')) {
        return 'Vue';
      }
      if (code.includes('@angular/')) {
        return 'Angular';
      }
      if (code.includes('from \'fastify\'') || code.includes('from "fastify"')) {
        return 'Fastify';
      }
      if (code.includes('from \'express\'') || code.includes('from "express"')) {
        return 'Express';
      }
      if (code.includes('from \'next\'') || code.includes('from "next"')) {
        return 'Next.js';
      }
    }

    if (language === 'python') {
      if (code.includes('from django') || code.includes('import django')) {
        return 'Django';
      }
      if (code.includes('from flask') || code.includes('import flask')) {
        return 'Flask';
      }
      if (code.includes('from fastapi') || code.includes('import fastapi')) {
        return 'FastAPI';
      }
    }

    if (language === 'go') {
      if (code.includes('"github.com/gin-gonic/gin"')) {
        return 'Gin';
      }
      if (code.includes('"github.com/gofiber/fiber"')) {
        return 'Fiber';
      }
    }

    return undefined;
  }

  /**
   * Get test coverage for file (if available)
   */
  private async getTestCoverage(filePath: string): Promise<number | undefined> {
    try {
      // Look for coverage reports (Istanbul, pytest-cov, etc.)
      const currentDir = path.dirname(filePath);

      // Check for Istanbul coverage (JavaScript/TypeScript)
      const coveragePath = path.join(currentDir, 'coverage', 'coverage-summary.json');
      try {
        const coverage = await fs.readFile(coveragePath, 'utf-8');
        const parsed = JSON.parse(coverage);
        const relativePath = path.relative(currentDir, filePath);
        if (parsed[relativePath]) {
          return parsed[relativePath].lines.pct;
        }
      } catch {
        // Coverage file doesn't exist
      }

      // If no coverage found, return undefined
      return undefined;
    } catch (error) {
      console.warn('Failed to get test coverage:', error);
      return undefined;
    }
  }

  /**
   * Quick context extraction (without file system access)
   * Used when we only have the code string, not the file
   */
  quickContext(code: string, language: string): ProjectContext {
    return {
      filePath: 'unknown',
      language,
      framework: undefined,
      imports: this.extractImports(code, language),
      dependencies: [],
      exports: this.extractExports(code, language),
      testCoverage: undefined,
    };
  }
}

export const projectContextAnalyzer = new ProjectContextAnalyzer();

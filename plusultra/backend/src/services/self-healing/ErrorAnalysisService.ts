/**
 * Error Analysis Service
 *
 * Analyzes error stack traces, extracts code context,
 * and prepares information for TCI to generate fixes.
 */

import fs from 'fs/promises';
import path from 'path';
import { prisma } from '../../lib/prisma';

export interface ErrorContext {
  errorId: string;
  errorMessage: string;
  errorType: string;
  filePath: string;
  lineNumber: number;
  columnNumber: number;

  // Code context
  errorLine: string;
  surroundingCode: string;
  beforeContext: string[];
  afterContext: string[];

  // File metadata
  language: string;
  fileContent: string;

  // Project context
  projectId: string | null;
  environment: string;

  // Additional context
  stackTrace: string;
  userContext: any;
  requestContext: any;
}

export interface CodeLocation {
  filePath: string;
  lineNumber: number;
  columnNumber: number;
  content: string;
}

export class ErrorAnalysisService {
  /**
   * Analyze error and extract code context
   */
  async analyzeError(errorId: string, projectRoot?: string): Promise<ErrorContext | null> {
    // Get error from database
    const error = await prisma.sentryError.findUnique({
      where: { id: errorId },
    });

    if (!error) {
      console.error(`[Error Analysis] Error ${errorId} not found`);
      return null;
    }

    // Validate file path
    if (!error.filePath || !error.lineNumber) {
      console.error(`[Error Analysis] Missing file path or line number`);
      return null;
    }

    // Resolve absolute file path
    const absolutePath = projectRoot
      ? path.join(projectRoot, error.filePath)
      : error.filePath;

    try {
      // Read file content
      const fileContent = await fs.readFile(absolutePath, 'utf-8');
      const lines = fileContent.split('\n');

      // Extract error line
      const errorLineIndex = error.lineNumber - 1; // 0-indexed
      const errorLine = lines[errorLineIndex] || '';

      // Extract surrounding context (5 lines before and after)
      const contextSize = 5;
      const startLine = Math.max(0, errorLineIndex - contextSize);
      const endLine = Math.min(lines.length - 1, errorLineIndex + contextSize);

      const beforeContext = lines.slice(startLine, errorLineIndex);
      const afterContext = lines.slice(errorLineIndex + 1, endLine + 1);

      // Build surrounding code block with line numbers
      const surroundingCode = lines
        .slice(startLine, endLine + 1)
        .map((line, idx) => {
          const lineNum = startLine + idx + 1;
          const marker = lineNum === error.lineNumber ? '>>> ' : '    ';
          return `${marker}${lineNum.toString().padStart(4)}: ${line}`;
        })
        .join('\n');

      // Detect language from file extension
      const language = this.detectLanguage(error.filePath);

      return {
        errorId: error.id,
        errorMessage: error.errorMessage,
        errorType: error.errorType,
        filePath: error.filePath,
        lineNumber: error.lineNumber,
        columnNumber: error.columnNumber || 0,

        errorLine,
        surroundingCode,
        beforeContext,
        afterContext,

        language,
        fileContent,

        projectId: error.projectId,
        environment: error.environment,

        stackTrace: error.stackTrace,
        userContext: error.userContext,
        requestContext: error.requestContext,
      };
    } catch (err: any) {
      console.error(`[Error Analysis] Failed to read file: ${err.message}`);

      // Return minimal context without file content
      return {
        errorId: error.id,
        errorMessage: error.errorMessage,
        errorType: error.errorType,
        filePath: error.filePath,
        lineNumber: error.lineNumber,
        columnNumber: error.columnNumber || 0,

        errorLine: '',
        surroundingCode: '',
        beforeContext: [],
        afterContext: [],

        language: this.detectLanguage(error.filePath),
        fileContent: '',

        projectId: error.projectId,
        environment: error.environment,

        stackTrace: error.stackTrace,
        userContext: error.userContext,
        requestContext: error.requestContext,
      };
    }
  }

  /**
   * Detect programming language from file extension
   */
  private detectLanguage(filePath: string): string {
    const extension = path.extname(filePath).toLowerCase();

    const languageMap: Record<string, string> = {
      '.js': 'javascript',
      '.jsx': 'javascript',
      '.ts': 'typescript',
      '.tsx': 'typescript',
      '.py': 'python',
      '.rb': 'ruby',
      '.java': 'java',
      '.go': 'go',
      '.rs': 'rust',
      '.php': 'php',
      '.c': 'c',
      '.cpp': 'cpp',
      '.cs': 'csharp',
      '.swift': 'swift',
      '.kt': 'kotlin',
      '.scala': 'scala',
      '.r': 'r',
    };

    return languageMap[extension] || 'javascript';
  }

  /**
   * Extract relevant imports and dependencies from code
   */
  extractImports(code: string, language: string): string[] {
    const imports: string[] = [];

    if (language === 'javascript' || language === 'typescript') {
      // Match ES6 imports
      const importRegex = /import\s+.*?\s+from\s+['"](.+?)['"]/g;
      let match;
      while ((match = importRegex.exec(code)) !== null) {
        imports.push(match[1]);
      }

      // Match require statements
      const requireRegex = /require\s*\(['"](.+?)['"]\)/g;
      while ((match = requireRegex.exec(code)) !== null) {
        imports.push(match[1]);
      }
    } else if (language === 'python') {
      // Match Python imports
      const pythonImportRegex = /(?:from\s+(\S+)\s+)?import\s+(.+)/g;
      let match;
      while ((match = pythonImportRegex.exec(code)) !== null) {
        if (match[1]) {
          imports.push(match[1]);
        }
        imports.push(...match[2].split(',').map(s => s.trim()));
      }
    }

    return imports;
  }

  /**
   * Build comprehensive error report for TCI
   */
  async buildErrorReport(errorContext: ErrorContext): Promise<string> {
    return `
═════════════════════════════════════════════════════════
ERROR REPORT FOR SELF-HEALING
═════════════════════════════════════════════════════════

ERROR DETAILS:
Type: ${errorContext.errorType}
Message: ${errorContext.errorMessage}
File: ${errorContext.filePath}
Location: Line ${errorContext.lineNumber}, Column ${errorContext.columnNumber}
Environment: ${errorContext.environment}

═════════════════════════════════════════════════════════
CODE CONTEXT:
═════════════════════════════════════════════════════════

\`\`\`${errorContext.language}
${errorContext.surroundingCode}
\`\`\`

═════════════════════════════════════════════════════════
STACK TRACE:
═════════════════════════════════════════════════════════

${errorContext.stackTrace}

═════════════════════════════════════════════════════════
TASK:
═════════════════════════════════════════════════════════

Analyze this production error and generate a fix that:
1. Addresses the root cause
2. Doesn't introduce new bugs
3. Maintains existing functionality
4. Follows best practices for ${errorContext.language}

Provide:
1. EXPLANATION: Why did this error occur?
2. FIX CODE: Complete fixed version of the code
3. TEST PLAN: How to validate the fix works
4. CONFIDENCE: Your confidence level (0-1) in this fix
`;
  }

  /**
   * Analyze error pattern to determine if it's a known issue
   */
  async checkKnownPattern(errorContext: ErrorContext): Promise<string | null> {
    // Common error patterns
    const patterns = [
      {
        type: 'TypeError',
        message: /Cannot read propert.* of (null|undefined)/,
        suggestion: 'Add null check before accessing property',
      },
      {
        type: 'TypeError',
        message: /is not a function/,
        suggestion: 'Verify function exists and is properly imported',
      },
      {
        type: 'ReferenceError',
        message: /is not defined/,
        suggestion: 'Check variable/function declaration and scope',
      },
      {
        type: 'SyntaxError',
        message: /Unexpected token/,
        suggestion: 'Check for missing brackets, parentheses, or commas',
      },
      {
        type: 'RangeError',
        message: /Maximum call stack size exceeded/,
        suggestion: 'Check for infinite recursion or circular references',
      },
    ];

    for (const pattern of patterns) {
      if (
        errorContext.errorType === pattern.type &&
        pattern.message.test(errorContext.errorMessage)
      ) {
        return pattern.suggestion;
      }
    }

    return null;
  }

  /**
   * Estimate fix complexity
   */
  async estimateComplexity(errorContext: ErrorContext): Promise<'simple' | 'moderate' | 'complex'> {
    const knownPattern = await this.checkKnownPattern(errorContext);

    // Simple: Known pattern, single line fix
    if (knownPattern) return 'simple';

    // Complex: Multiple files, deep stack trace
    if (errorContext.stackTrace.split('\n').length > 10) return 'complex';

    // Moderate: Everything else
    return 'moderate';
  }
}

export const errorAnalysisService = new ErrorAnalysisService();

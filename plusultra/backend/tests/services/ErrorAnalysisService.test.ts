/**
 * Unit Tests for ErrorAnalysisService
 *
 * Tests error context extraction, language detection, and pattern matching
 */

import { describe, it, expect } from '@jest/globals';
import { ErrorAnalysisService } from '../../src/services/self-healing/ErrorAnalysisService';

describe('ErrorAnalysisService', () => {
  const service = new ErrorAnalysisService();

  describe('Language Detection', () => {
    it('should detect JavaScript', () => {
      const lang = (service as any).detectLanguage('src/components/Button.js');
      expect(lang).toBe('javascript');
    });

    it('should detect TypeScript', () => {
      const lang = (service as any).detectLanguage('src/services/api.ts');
      expect(lang).toBe('typescript');
    });

    it('should detect Python', () => {
      const lang = (service as any).detectLanguage('scripts/deploy.py');
      expect(lang).toBe('python');
    });

    it('should detect Ruby', () => {
      const lang = (service as any).detectLanguage('lib/tasks/setup.rb');
      expect(lang).toBe('ruby');
    });

    it('should detect Go', () => {
      const lang = (service as any).detectLanguage('main.go');
      expect(lang).toBe('go');
    });

    it('should default to javascript for unknown extensions', () => {
      const lang = (service as any).detectLanguage('file.unknown');
      expect(lang).toBe('javascript');
    });
  });

  describe('Import Extraction', () => {
    it('should extract ES6 imports', () => {
      const code = `
        import React from 'react';
        import { Button } from './components';
        import type { User } from './types';
      `;

      const imports = service.extractImports(code, 'javascript');

      expect(imports).toContain('react');
      expect(imports).toContain('./components');
      expect(imports).toContain('./types');
    });

    it('should extract CommonJS requires', () => {
      const code = `
        const express = require('express');
        const { Router } = require('express');
        const utils = require('./utils');
      `;

      const imports = service.extractImports(code, 'javascript');

      expect(imports).toContain('express');
      expect(imports).toContain('./utils');
    });

    it('should extract Python imports', () => {
      const code = `
        import os
        import sys
        from pathlib import Path
        from typing import List, Dict
      `;

      const imports = service.extractImports(code, 'python');

      expect(imports).toContain('pathlib');
      expect(imports).toContain('typing');
    });

    it('should handle mixed import styles', () => {
      const code = `
        import React from 'react';
        const axios = require('axios');
        import { useState } from 'react';
      `;

      const imports = service.extractImports(code, 'javascript');

      expect(imports.length).toBeGreaterThan(0);
      expect(imports).toContain('react');
      expect(imports).toContain('axios');
    });
  });

  describe('Known Error Pattern Detection', () => {
    it('should detect null/undefined property access', async () => {
      const context = {
        errorId: 'test',
        errorMessage: 'Cannot read property "foo" of undefined',
        errorType: 'TypeError',
        filePath: 'test.ts',
        lineNumber: 1,
        columnNumber: 1,
        errorLine: '',
        surroundingCode: '',
        beforeContext: [],
        afterContext: [],
        language: 'typescript',
        fileContent: '',
        projectId: null,
        environment: 'test',
        stackTrace: '',
        userContext: null,
        requestContext: null,
      };

      const pattern = await service.checkKnownPattern(context);

      expect(pattern).toBe('Add null check before accessing property');
    });

    it('should detect "is not a function" errors', async () => {
      const context = {
        errorId: 'test',
        errorMessage: 'foo is not a function',
        errorType: 'TypeError',
        filePath: 'test.ts',
        lineNumber: 1,
        columnNumber: 1,
        errorLine: '',
        surroundingCode: '',
        beforeContext: [],
        afterContext: [],
        language: 'typescript',
        fileContent: '',
        projectId: null,
        environment: 'test',
        stackTrace: '',
        userContext: null,
        requestContext: null,
      };

      const pattern = await service.checkKnownPattern(context);

      expect(pattern).toBe('Verify function exists and is properly imported');
    });

    it('should detect undefined variable errors', async () => {
      const context = {
        errorId: 'test',
        errorMessage: 'foo is not defined',
        errorType: 'ReferenceError',
        filePath: 'test.ts',
        lineNumber: 1,
        columnNumber: 1,
        errorLine: '',
        surroundingCode: '',
        beforeContext: [],
        afterContext: [],
        language: 'typescript',
        fileContent: '',
        projectId: null,
        environment: 'test',
        stackTrace: '',
        userContext: null,
        requestContext: null,
      };

      const pattern = await service.checkKnownPattern(context);

      expect(pattern).toBe('Check variable/function declaration and scope');
    });

    it('should detect syntax errors', async () => {
      const context = {
        errorId: 'test',
        errorMessage: 'Unexpected token }',
        errorType: 'SyntaxError',
        filePath: 'test.ts',
        lineNumber: 1,
        columnNumber: 1,
        errorLine: '',
        surroundingCode: '',
        beforeContext: [],
        afterContext: [],
        language: 'typescript',
        fileContent: '',
        projectId: null,
        environment: 'test',
        stackTrace: '',
        userContext: null,
        requestContext: null,
      };

      const pattern = await service.checkKnownPattern(context);

      expect(pattern).toBe('Check for missing brackets, parentheses, or commas');
    });

    it('should detect stack overflow errors', async () => {
      const context = {
        errorId: 'test',
        errorMessage: 'Maximum call stack size exceeded',
        errorType: 'RangeError',
        filePath: 'test.ts',
        lineNumber: 1,
        columnNumber: 1,
        errorLine: '',
        surroundingCode: '',
        beforeContext: [],
        afterContext: [],
        language: 'typescript',
        fileContent: '',
        projectId: null,
        environment: 'test',
        stackTrace: '',
        userContext: null,
        requestContext: null,
      };

      const pattern = await service.checkKnownPattern(context);

      expect(pattern).toBe('Check for infinite recursion or circular references');
    });

    it('should return null for unknown patterns', async () => {
      const context = {
        errorId: 'test',
        errorMessage: 'Unknown error message',
        errorType: 'CustomError',
        filePath: 'test.ts',
        lineNumber: 1,
        columnNumber: 1,
        errorLine: '',
        surroundingCode: '',
        beforeContext: [],
        afterContext: [],
        language: 'typescript',
        fileContent: '',
        projectId: null,
        environment: 'test',
        stackTrace: '',
        userContext: null,
        requestContext: null,
      };

      const pattern = await service.checkKnownPattern(context);

      expect(pattern).toBeNull();
    });
  });

  describe('Complexity Estimation', () => {
    it('should estimate simple complexity for known patterns', () => {
      const context = {
        errorId: 'test',
        errorMessage: 'Cannot read property "test" of undefined',
        errorType: 'TypeError',
        filePath: 'test.ts',
        lineNumber: 1,
        columnNumber: 1,
        errorLine: '',
        surroundingCode: '',
        beforeContext: [],
        afterContext: [],
        language: 'typescript',
        fileContent: '',
        projectId: null,
        environment: 'test',
        stackTrace: 'single line stack trace',
        userContext: null,
        requestContext: null,
      };

      const complexity = service.estimateComplexity(context);

      expect(complexity).toBe('simple');
    });

    it('should estimate complex for deep stack traces', () => {
      const longStackTrace = Array(15).fill('at function (file.ts:1:1)').join('\n');

      const context = {
        errorId: 'test',
        errorMessage: 'Unknown error',
        errorType: 'Error',
        filePath: 'test.ts',
        lineNumber: 1,
        columnNumber: 1,
        errorLine: '',
        surroundingCode: '',
        beforeContext: [],
        afterContext: [],
        language: 'typescript',
        fileContent: '',
        projectId: null,
        environment: 'test',
        stackTrace: longStackTrace,
        userContext: null,
        requestContext: null,
      };

      const complexity = service.estimateComplexity(context);

      expect(complexity).toBe('complex');
    });

    it('should estimate moderate for everything else', () => {
      const context = {
        errorId: 'test',
        errorMessage: 'Unknown error',
        errorType: 'Error',
        filePath: 'test.ts',
        lineNumber: 1,
        columnNumber: 1,
        errorLine: '',
        surroundingCode: '',
        beforeContext: [],
        afterContext: [],
        language: 'typescript',
        fileContent: '',
        projectId: null,
        environment: 'test',
        stackTrace: 'moderate stack trace\nat function1\nat function2',
        userContext: null,
        requestContext: null,
      };

      const complexity = service.estimateComplexity(context);

      expect(complexity).toBe('moderate');
    });
  });

  describe('Error Report Building', () => {
    it('should build formatted error report', async () => {
      const context = {
        errorId: 'test-123',
        errorMessage: 'Cannot read property "test" of undefined',
        errorType: 'TypeError',
        filePath: 'src/services/api.ts',
        lineNumber: 42,
        columnNumber: 10,
        errorLine: 'const value = obj.test;',
        surroundingCode: 'const value = obj.test;',
        beforeContext: ['function getData() {'],
        afterContext: ['  return value;', '}'],
        language: 'typescript',
        fileContent: 'full file content',
        projectId: 'test-project',
        environment: 'production',
        stackTrace: 'at getData (src/services/api.ts:42:10)',
        userContext: null,
        requestContext: null,
      };

      const report = await service.buildErrorReport(context);

      expect(report).toContain('ERROR REPORT FOR SELF-HEALING');
      expect(report).toContain('TypeError');
      expect(report).toContain('Cannot read property "test" of undefined');
      expect(report).toContain('src/services/api.ts');
      expect(report).toContain('Line 42');
      expect(report).toContain('production');
      expect(report).toContain('STACK TRACE');
      expect(report).toContain('CODE CONTEXT');
      expect(report).toContain('TASK');
    });

    it('should include language-specific guidance', async () => {
      const context = {
        errorId: 'test',
        errorMessage: 'Test error',
        errorType: 'Error',
        filePath: 'test.py',
        lineNumber: 1,
        columnNumber: 1,
        errorLine: '',
        surroundingCode: '',
        beforeContext: [],
        afterContext: [],
        language: 'python',
        fileContent: '',
        projectId: null,
        environment: 'test',
        stackTrace: '',
        userContext: null,
        requestContext: null,
      };

      const report = await service.buildErrorReport(context);

      expect(report).toContain('python');
      expect(report).toContain('best practices for python');
    });
  });
});

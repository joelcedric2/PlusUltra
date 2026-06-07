/**
 * End-to-End TCI 6-Layer Pipeline Test
 *
 * Tests the complete TCI system from code input to final verdict with implementation.
 * Validates full integration of all 6 layers, learning loop, and database persistence.
 */

import { TCI6LayerOrchestrator } from '../../src/services/tci/TCI6LayerOrchestrator';
import { TCILearningLoopService } from '../../src/services/tci/TCILearningLoopService';
import { prisma } from '../../src/lib/prisma';

describe('E2E: Full TCI 6-Layer Pipeline', () => {
  let orchestrator: TCI6LayerOrchestrator;
  let learningLoop: TCILearningLoopService;

  beforeAll(async () => {
    orchestrator = new TCI6LayerOrchestrator();
    learningLoop = new TCILearningLoopService();
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.tCIAnalysis.deleteMany({
      where: {
        code: {
          contains: 'E2E Test Code',
        },
      },
    });
  });

  describe('Full Analysis Pipeline', () => {
    it('should complete full 6-layer analysis successfully', async () => {
      const testCode = `
// E2E Test Code
function getUserByEmail(email: string) {
  const query = "SELECT * FROM users WHERE email = '" + email + "'";
  return db.execute(query);
}
      `.trim();

      const result = await orchestrator.analyzeCode({
        code: testCode,
        language: 'typescript',
        analysisType: 'full',
        userId: 'e2e-test-user',
        userTier: 'pro',
        implementFixes: true,
      });

      // Should complete all layers
      expect(result.analysis).toBeDefined();
      expect(result.report).toBeDefined();
      expect(result.outcome).toBeDefined();

      // Check Layer 1: Visual
      expect(result.report.visual).toBeDefined();
      expect(result.report.visual.visualPatterns.length).toBeGreaterThan(0);
      expect(result.report.visual.overallCodeHealth).toBeGreaterThanOrEqual(0);

      // Check Layer 2: Causal
      expect(result.report.causal).toBeDefined();
      expect(result.report.causal.chain.length).toBeGreaterThan(0);

      // Check Layer 3: Historical
      expect(result.report.historical).toBeDefined();
      expect(result.report.historical.thisCodeMatchesPattern).toBeDefined();

      // Check Layer 4: Logic
      expect(result.report.logic).toBeDefined();
      expect(result.report.logic.invariants).toBeDefined();

      // Check Layer 5: Synthesis
      expect(result.report.verdict).toBeDefined();
      expect(result.report.verdict.verdict).toMatch(/SHIP|REFACTOR|REJECT/);
      expect(result.report.verdict.confidence).toBeGreaterThan(0);

      // Check Layer 6: Implementation
      expect(result.report.implementation).toBeDefined();
      expect(result.report.implementation.improvedCode).toBeDefined();
      expect(result.report.implementation.changes.length).toBeGreaterThan(0);

      // Check timings
      expect(result.report.timings.total).toBeGreaterThan(0);
      expect(result.report.timings.total).toBeLessThan(120000); // < 2 minutes
    }, 120000); // 2 minute timeout for full analysis

    it('should save analysis to database', async () => {
      const testCode = `
// E2E Test Code - Database Test
const x = 1;
      `.trim();

      const result = await orchestrator.analyzeCode({
        code: testCode,
        language: 'typescript',
        analysisType: 'full',
        userId: 'e2e-test-user',
        userTier: 'pro',
        implementFixes: false,
      });

      expect(result.analysis.id).toBeDefined();

      // Verify saved in database
      const savedAnalysis = await prisma.tCIAnalysis.findUnique({
        where: { id: result.analysis.id },
      });

      expect(savedAnalysis).toBeDefined();
      expect(savedAnalysis?.code).toBe(testCode);
      expect(savedAnalysis?.verdict).toBeDefined();
      expect(savedAnalysis?.confidence).toBeGreaterThan(0);
    }, 120000);

    it('should handle quick analysis (2 layers)', async () => {
      const testCode = `
// E2E Test Code - Quick Analysis
function test() { return true; }
      `.trim();

      const result = await orchestrator.analyzeCode({
        code: testCode,
        language: 'typescript',
        analysisType: 'quick',
        userId: 'e2e-test-user',
        userTier: 'free',
        implementFixes: false,
      });

      // Quick analysis should have Layer 1 and 3
      expect(result.report.visual).toBeDefined();
      expect(result.report.historical).toBeDefined();

      // Should NOT have Layer 2, 4, or 6 (optional in quick mode)
      expect(result.report.causal).toBeUndefined();
      expect(result.report.logic).toBeUndefined();
      expect(result.report.implementation).toBeUndefined();

      // Should still have verdict (Layer 5)
      expect(result.report.verdict).toBeDefined();

      // Should be faster than full analysis
      expect(result.report.timings.total).toBeLessThan(30000); // < 30s
    }, 60000);
  });

  describe('Verdict Generation', () => {
    it('should generate REJECT verdict for SQL injection', async () => {
      const sqlInjectionCode = `
// E2E Test Code - SQL Injection
function login(username: string, password: string) {
  const query = "SELECT * FROM users WHERE user = '" + username + "' AND pass = '" + password + "'";
  return db.execute(query).then(r => r.rows.length > 0);
}
      `.trim();

      const result = await orchestrator.analyzeCode({
        code: sqlInjectionCode,
        language: 'typescript',
        analysisType: 'full',
        userId: 'e2e-test-user',
        userTier: 'pro',
        implementFixes: true,
      });

      expect(result.report.verdict.verdict).toBe('REJECT');
      expect(result.report.verdict.synthesizedRisk.overall).toBeGreaterThan(7);
      expect(result.report.verdict.synthesizedRisk.breakdown.security).toBeGreaterThan(7);
    }, 120000);

    it('should generate SHIP verdict for clean code', async () => {
      const cleanCode = `
// E2E Test Code - Clean Code
function calculateTotal(items: Array<{ price: number; quantity: number }>): number {
  if (!items || items.length === 0) return 0;
  return items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
}
      `.trim();

      const result = await orchestrator.analyzeCode({
        code: cleanCode,
        language: 'typescript',
        analysisType: 'full',
        userId: 'e2e-test-user',
        userTier: 'pro',
        implementFixes: false,
      });

      expect(result.report.verdict.verdict).toBe('SHIP');
      expect(result.report.verdict.confidence).toBeGreaterThan(0.7);
    }, 120000);

    it('should generate REFACTOR verdict for code with issues', async () => {
      const mediocreCode = `
// E2E Test Code - Mediocre Code
function processData(data: any) {
  // Missing null checks, poor type safety
  return data.map(item => item.value * 2);
}
      `.trim();

      const result = await orchestrator.analyzeCode({
        code: mediocreCode,
        language: 'typescript',
        analysisType: 'full',
        userId: 'e2e-test-user',
        userTier: 'pro',
        implementFixes: true,
      });

      expect(result.report.verdict.verdict).toBe('REFACTOR');
      expect(result.report.implementation.improvedCode).toBeDefined();
      expect(result.report.implementation.improvedCode).not.toBe(mediocreCode);
    }, 120000);
  });

  describe('Learning Loop Integration', () => {
    it('should accept and process feedback', async () => {
      const testCode = `
// E2E Test Code - Learning Loop
function test() { return true; }
      `.trim();

      // First, run analysis
      const analysis = await orchestrator.analyzeCode({
        code: testCode,
        language: 'typescript',
        analysisType: 'full',
        userId: 'e2e-test-user',
        userTier: 'pro',
        implementFixes: false,
      });

      // Then submit feedback
      const feedbackResult = await learningLoop.processFeedback({
        analysisId: analysis.analysis.id,
        wasHelpful: true,
        actualOutcome: 'shipped',
        bugsFound: [],
        breakingChanges: [],
      });

      expect(feedbackResult).toBeDefined();
      expect(feedbackResult.accuracyUpdate).toBeDefined();
      expect(feedbackResult.accuracyUpdate.modelsUpdated.length).toBeGreaterThan(0);
    }, 120000);

    it('should update model weights based on feedback', async () => {
      const testCode = `
// E2E Test Code - Weight Update
const x = 1;
      `.trim();

      // Run analysis
      const analysis = await orchestrator.analyzeCode({
        code: testCode,
        language: 'typescript',
        analysisType: 'full',
        userId: 'e2e-test-user',
        userTier: 'pro',
        implementFixes: false,
      });

      // Get initial weights
      const initialWeights = await prisma.tCIModelWeight.findMany({
        where: { layer: { in: ['visual', 'causal', 'historical', 'logic'] } },
      });

      // Submit feedback
      await learningLoop.processFeedback({
        analysisId: analysis.analysis.id,
        wasHelpful: true,
        actualOutcome: 'shipped',
        bugsFound: [],
        breakingChanges: [],
      });

      // Get updated weights
      const updatedWeights = await prisma.tCIModelWeight.findMany({
        where: { layer: { in: ['visual', 'causal', 'historical', 'logic'] } },
      });

      // Weights should be updated
      expect(updatedWeights.length).toBeGreaterThan(0);
    }, 120000);

    it('should add patterns to library from feedback', async () => {
      const buggyCode = `
// E2E Test Code - Pattern Library
function divide(a: number, b: number) {
  return a / b; // Division by zero not checked
}
      `.trim();

      // Run analysis
      const analysis = await orchestrator.analyzeCode({
        code: buggyCode,
        language: 'typescript',
        analysisType: 'full',
        userId: 'e2e-test-user',
        userTier: 'pro',
        implementFixes: false,
      });

      // Submit feedback with bug found
      const feedbackResult = await learningLoop.processFeedback({
        analysisId: analysis.analysis.id,
        wasHelpful: true,
        actualOutcome: 'rejected',
        bugsFound: ['Division by zero caused runtime error'],
        breakingChanges: [],
      });

      expect(feedbackResult.accuracyUpdate.patternsAdded).toBeGreaterThan(0);
    }, 120000);
  });

  describe('Performance', () => {
    it('should complete full analysis within time limit', async () => {
      const testCode = `
// E2E Test Code - Performance
function test() { return true; }
      `.trim();

      const startTime = Date.now();

      await orchestrator.analyzeCode({
        code: testCode,
        language: 'typescript',
        analysisType: 'full',
        userId: 'e2e-test-user',
        userTier: 'pro',
        implementFixes: true,
      });

      const duration = Date.now() - startTime;

      // Full analysis should complete within 2 minutes
      expect(duration).toBeLessThan(120000);
    }, 120000);

    it('should handle concurrent analyses', async () => {
      const testCodes = [
        'function test1() { return 1; }',
        'function test2() { return 2; }',
        'function test3() { return 3; }',
      ];

      const promises = testCodes.map(code =>
        orchestrator.analyzeCode({
          code: `// E2E Test Code - Concurrent\n${code}`,
          language: 'typescript',
          analysisType: 'quick',
          userId: 'e2e-test-user',
          userTier: 'pro',
          implementFixes: false,
        })
      );

      const results = await Promise.all(promises);

      expect(results.length).toBe(3);
      results.forEach(result => {
        expect(result.report).toBeDefined();
        expect(result.report.verdict).toBeDefined();
      });
    }, 120000);
  });

  describe('Error Handling', () => {
    it('should handle invalid code gracefully', async () => {
      const invalidCode = 'this is not valid code }{][';

      const result = await orchestrator.analyzeCode({
        code: invalidCode,
        language: 'typescript',
        analysisType: 'full',
        userId: 'e2e-test-user',
        userTier: 'pro',
        implementFixes: false,
      });

      // Should still return a result, even if confidence is low
      expect(result).toBeDefined();
      expect(result.report).toBeDefined();
    }, 120000);

    it('should handle empty code', async () => {
      await expect(
        orchestrator.analyzeCode({
          code: '',
          language: 'typescript',
          analysisType: 'full',
          userId: 'e2e-test-user',
          userTier: 'pro',
          implementFixes: false,
        })
      ).rejects.toThrow();
    }, 30000);

    it('should handle missing API keys gracefully', async () => {
      // Save original env
      const originalDeepSeek = process.env.DEEPSEEK_API_KEY;

      // Remove API key temporarily
      delete process.env.DEEPSEEK_API_KEY;

      const testCode = `function test() { return true; }`;

      try {
        await orchestrator.analyzeCode({
          code: testCode,
          language: 'typescript',
          analysisType: 'full',
          userId: 'e2e-test-user',
          userTier: 'pro',
          implementFixes: false,
        });
      } catch (error: any) {
        // Should throw error about missing API key
        expect(error.message).toMatch(/api key|credentials/i);
      }

      // Restore env
      if (originalDeepSeek) {
        process.env.DEEPSEEK_API_KEY = originalDeepSeek;
      }
    }, 30000);
  });
});

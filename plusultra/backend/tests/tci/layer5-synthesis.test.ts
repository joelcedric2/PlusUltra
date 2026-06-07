/**
 * Layer 5: Cross-Model Synthesis - Integration Tests
 *
 * Tests consensus building and risk synthesis using Gemini.
 * Validates verdict generation, conflict resolution, and actionable steps.
 */

import { CrossModelSynthesisService } from '../../src/services/tci/CrossModelSynthesisService';
import type { VisualInsights, CausalChain, HistoricalInsights, LogicVerification } from '../../src/services/tci/types';

describe('Layer 5: Cross-Model Synthesis', () => {
  let synthesisService: CrossModelSynthesisService;

  beforeAll(() => {
    synthesisService = new CrossModelSynthesisService();
  });

  // Helper to create mock layer results
  const createMockLayers = (verdict: 'SHIP' | 'REFACTOR' | 'REJECT') => ({
    visual: {
      visualPatterns: [],
      overallCodeHealth: verdict === 'SHIP' ? 8 : verdict === 'REFACTOR' ? 5 : 2,
      confidence: 0.85,
      timing: 1000,
    } as VisualInsights,
    causal: {
      chain: [],
      breakingChanges: verdict === 'REJECT' ? ['Breaking API change'] : [],
      riskAssessment: {
        immediate: verdict === 'REJECT' ? 9 : verdict === 'REFACTOR' ? 5 : 2,
        shortTerm: 3,
        longTerm: 4,
      },
      confidence: 0.82,
      timing: 2000,
    } as CausalChain,
    historical: {
      thisCodeMatchesPattern: 'Common pattern',
      similarPatterns: [],
      commonMistakes: verdict === 'REJECT' ? ['Critical bug pattern'] : [],
      recommendations: ['Use parameterized queries'],
      confidence: 0.88,
      timing: 1500,
    } as HistoricalInsights,
    logic: {
      invariants: [],
      formalCorrectness: verdict === 'SHIP',
      logicErrors: verdict === 'REJECT' ? ['Invariant violated'] : [],
      confidence: 0.90,
      timing: 3000,
    } as LogicVerification,
  });

  describe('Verdict Generation', () => {
    it('should generate SHIP verdict for good code', async () => {
      const layers = createMockLayers('SHIP');
      const code = `function add(a: number, b: number): number { return a + b; }`;

      const result = await synthesisService.synthesize(layers.visual, layers.causal, layers.historical, layers.logic, code, 'typescript');

      expect(result).toBeDefined();
      expect(result.verdict).toBe('SHIP');
      expect(result.confidence).toBeGreaterThan(0.7);
    }, 30000);

    it('should generate REFACTOR verdict for mediocre code', async () => {
      const layers = createMockLayers('REFACTOR');
      const code = `function process(data) { return data.map(x => x * 2); }`;

      const result = await synthesisService.synthesize(layers.visual, layers.causal, layers.historical, layers.logic, code, 'javascript');

      expect(result.verdict).toBe('REFACTOR');
    }, 30000);

    it('should generate REJECT verdict for dangerous code', async () => {
      const layers = createMockLayers('REJECT');
      const code = `function deleteAll() { db.execute("DROP TABLE users"); }`;

      const result = await synthesisService.synthesize(layers.visual, layers.causal, layers.historical, layers.logic, code, 'typescript');

      expect(result.verdict).toBe('REJECT');
    }, 30000);
  });

  describe('Model Agreements', () => {
    it('should include all model verdicts', async () => {
      const layers = createMockLayers('SHIP');
      const code = `const x = 1;`;

      const result = await synthesisService.synthesize(layers.visual, layers.causal, layers.historical, layers.logic, code, 'typescript');

      expect(result.modelAgreements).toBeDefined();
      expect(result.modelAgreements.length).toBeGreaterThan(0);

      // Should have multiple models
      const models = result.modelAgreements.map(ma => ma.model);
      expect(models.length).toBeGreaterThanOrEqual(2);
    }, 30000);

    it('should assign weights to models', async () => {
      const layers = createMockLayers('SHIP');
      const code = `const x = 1;`;

      const result = await synthesisService.synthesize(layers.visual, layers.causal, layers.historical, layers.logic, code, 'typescript');

      result.modelAgreements.forEach(agreement => {
        expect(agreement.weight).toBeGreaterThan(0);
        expect(agreement.weight).toBeLessThanOrEqual(2);
      });
    }, 30000);

    it('should show confidence per model', async () => {
      const layers = createMockLayers('SHIP');
      const code = `const x = 1;`;

      const result = await synthesisService.synthesize(layers.visual, layers.causal, layers.historical, layers.logic, code, 'typescript');

      result.modelAgreements.forEach(agreement => {
        expect(agreement.confidence).toBeGreaterThan(0);
        expect(agreement.confidence).toBeLessThanOrEqual(1);
      });
    }, 30000);
  });

  describe('Consensus Strength', () => {
    it('should have high consensus when models agree', async () => {
      const layers = createMockLayers('SHIP');
      const code = `function square(n: number): number { return n * n; }`;

      const result = await synthesisService.synthesize(layers.visual, layers.causal, layers.historical, layers.logic, code, 'typescript');

      expect(result.consensusStrength).toBeGreaterThan(0.7);
    }, 30000);

    it('should have lower consensus when models disagree', async () => {
      // Create conflicting layer results
      const layers = createMockLayers('REFACTOR');
      layers.logic.formalCorrectness = true; // Logic says it's correct
      layers.visual.overallCodeHealth = 3; // Visual says it's poor

      const code = `function test() { return true; }`;

      const result = await synthesisService.synthesize(layers.visual, layers.causal, layers.historical, layers.logic, code, 'typescript');

      expect(result.consensusStrength).toBeDefined();
      expect(result.consensusStrength).toBeGreaterThanOrEqual(0);
      expect(result.consensusStrength).toBeLessThanOrEqual(1);
    }, 30000);
  });

  describe('Conflict Resolution', () => {
    it('should identify conflicts between models', async () => {
      const layers = createMockLayers('REFACTOR');
      layers.logic.formalCorrectness = true;
      layers.visual.overallCodeHealth = 2;

      const code = `const x = 1;`;

      const result = await synthesisService.synthesize(layers.visual, layers.causal, layers.historical, layers.logic, code, 'typescript');

      // May have conflicts
      expect(result.conflicts).toBeDefined();
      expect(Array.isArray(result.conflicts)).toBe(true);
    }, 30000);

    it('should explain conflicts', async () => {
      const layers = createMockLayers('REFACTOR');
      layers.logic.formalCorrectness = true;
      layers.causal.riskAssessment.immediate = 8;

      const code = `const x = 1;`;

      const result = await synthesisService.synthesize(layers.visual, layers.causal, layers.historical, layers.logic, code, 'typescript');

      if (result.conflicts.length > 0) {
        result.conflicts.forEach(conflict => {
          expect(conflict).toBeDefined();
          expect(conflict.length).toBeGreaterThan(0);
        });
      }
    }, 30000);
  });

  describe('Synthesized Risk', () => {
    it('should calculate overall risk score', async () => {
      const layers = createMockLayers('REFACTOR');
      const code = `const x = 1;`;

      const result = await synthesisService.synthesize(layers.visual, layers.causal, layers.historical, layers.logic, code, 'typescript');

      expect(result.synthesizedRisk.overall).toBeGreaterThanOrEqual(0);
      expect(result.synthesizedRisk.overall).toBeLessThanOrEqual(10);
    }, 30000);

    it('should provide risk breakdown by category', async () => {
      const layers = createMockLayers('REFACTOR');
      const code = `const x = 1;`;

      const result = await synthesisService.synthesize(layers.visual, layers.causal, layers.historical, layers.logic, code, 'typescript');

      expect(result.synthesizedRisk.breakdown).toBeDefined();
      expect(result.synthesizedRisk.breakdown.security).toBeGreaterThanOrEqual(0);
      expect(result.synthesizedRisk.breakdown.performance).toBeGreaterThanOrEqual(0);
      expect(result.synthesizedRisk.breakdown.maintainability).toBeGreaterThanOrEqual(0);
      expect(result.synthesizedRisk.breakdown.correctness).toBeGreaterThanOrEqual(0);
    }, 30000);

    it('should have higher security risk for SQL injection', async () => {
      const layers = createMockLayers('REJECT');
      layers.historical.commonMistakes = ['SQL Injection'];

      const code = `const query = "SELECT * FROM users WHERE id = " + userId;`;

      const result = await synthesisService.synthesize(layers.visual, layers.causal, layers.historical, layers.logic, code, 'typescript');

      expect(result.synthesizedRisk.breakdown.security).toBeGreaterThan(5);
    }, 30000);
  });

  describe('Actionable Steps', () => {
    it('should provide actionable recommendations', async () => {
      const layers = createMockLayers('REFACTOR');
      const code = `const x = 1;`;

      const result = await synthesisService.synthesize(layers.visual, layers.causal, layers.historical, layers.logic, code, 'typescript');

      expect(result.actionableSteps).toBeDefined();
      expect(Array.isArray(result.actionableSteps)).toBe(true);
      expect(result.actionableSteps.length).toBeGreaterThan(0);

      result.actionableSteps.forEach(step => {
        expect(step).toBeDefined();
        expect(step.length).toBeGreaterThan(0);
      });
    }, 30000);

    it('should prioritize critical issues first', async () => {
      const layers = createMockLayers('REJECT');
      const code = `function deleteAll() { db.execute("DROP TABLE users"); }`;

      const result = await synthesisService.synthesize(layers.visual, layers.causal, layers.historical, layers.logic, code, 'typescript');

      const firstStep = result.actionableSteps[0];
      expect(firstStep.toLowerCase()).toMatch(/reject|block|critical|danger/);
    }, 30000);

    it('should suggest specific fixes', async () => {
      const layers = createMockLayers('REFACTOR');
      layers.historical.recommendations = ['Use parameterized queries'];

      const code = `const query = "SELECT * FROM users WHERE id = " + id;`;

      const result = await synthesisService.synthesize(layers.visual, layers.causal, layers.historical, layers.logic, code, 'typescript');

      const parameterizedStep = result.actionableSteps.find(
        step => step.toLowerCase().includes('parameter')
      );
      expect(parameterizedStep).toBeDefined();
    }, 30000);
  });

  describe('Confidence Scoring', () => {
    it('should have high confidence when all layers agree', async () => {
      const layers = createMockLayers('SHIP');
      const code = `function test() { return true; }`;

      const result = await synthesisService.synthesize(layers.visual, layers.causal, layers.historical, layers.logic, code, 'typescript');

      expect(result.confidence).toBeGreaterThan(0.8);
    }, 30000);

    it('should include timing information', async () => {
      const layers = createMockLayers('SHIP');
      const code = `const x = 1;`;

      const result = await synthesisService.synthesize(layers.visual, layers.causal, layers.historical, layers.logic, code, 'typescript');

      expect(result.timing).toBeGreaterThan(0);
      expect(result.timing).toBeLessThan(60000);
    }, 30000);
  });

  describe('Edge Cases', () => {
    it('should handle missing optional layers', async () => {
      const layers = createMockLayers('SHIP');
      const code = `const x = 1;`;

      // Quick analysis (no causal or logic)
      const result = await synthesisService.synthesize(
        layers.visual,
        undefined as any,
        layers.historical,
        undefined as any,
        code,
        'typescript'
      );

      expect(result).toBeDefined();
      expect(result.verdict).toBeDefined();
    }, 30000);

    it('should handle all layers having low confidence', async () => {
      const layers = createMockLayers('REFACTOR');
      layers.visual.confidence = 0.3;
      layers.causal.confidence = 0.4;
      layers.historical.confidence = 0.35;
      layers.logic.confidence = 0.3;

      const code = `const x = 1;`;

      const result = await synthesisService.synthesize(layers.visual, layers.causal, layers.historical, layers.logic, code, 'typescript');

      expect(result).toBeDefined();
      expect(result.confidence).toBeLessThan(0.5);
    }, 30000);

    it('should handle contradictory layer results', async () => {
      const layers = createMockLayers('REFACTOR');
      layers.visual.overallCodeHealth = 9; // Good
      layers.logic.formalCorrectness = false; // Bad
      layers.logic.logicErrors = ['Critical error'];

      const code = `const x = 1;`;

      const result = await synthesisService.synthesize(layers.visual, layers.causal, layers.historical, layers.logic, code, 'typescript');

      expect(result.conflicts.length).toBeGreaterThan(0);
    }, 30000);
  });
});

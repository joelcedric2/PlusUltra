/**
 * A/B Testing Service - Integration Tests
 *
 * Tests prompt optimization framework for TCI layers.
 * Validates variant selection, metrics tracking, and winner determination.
 */

import { ABTestingService, PromptVariant, ABTestConfig } from '../../src/services/tci/ABTestingService';
import { prisma } from '../../src/lib/prisma';

describe('A/B Testing Service', () => {
  let abService: ABTestingService;
  const testIds: string[] = [];

  beforeAll(() => {
    abService = new ABTestingService();
  });

  afterAll(async () => {
    // Cleanup test data
    for (const testId of testIds) {
      await prisma.tCIABTestResult.deleteMany({ where: { testId } });
      await prisma.tCIABTest.delete({ where: { id: testId } }).catch(() => {});
    }
  });

  describe('Test Creation', () => {
    it('should create a new A/B test', async () => {
      const variantA: PromptVariant = {
        id: 'variant-a',
        name: 'Original Prompt',
        layer: 'visual',
        prompt: 'Analyze this code for visual patterns...',
        temperature: 0.7,
      };

      const variantB: PromptVariant = {
        id: 'variant-b',
        name: 'Improved Prompt',
        layer: 'visual',
        prompt: 'Carefully examine this code and identify all visual patterns, anti-patterns, and code health indicators...',
        temperature: 0.7,
      };

      const config: ABTestConfig = {
        testId: 'test-visual-prompt-1',
        name: 'Visual Layer Prompt Optimization',
        description: 'Testing improved prompt for Layer 1',
        layer: 'visual',
        variants: [variantA, variantB],
        trafficSplit: [50, 50], // 50/50 split
        startDate: new Date(),
        endDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        minSampleSize: 100,
        active: true,
      };

      const testId = await abService.createABTest(config);
      testIds.push(testId);

      expect(testId).toBeDefined();
      expect(testId).toBe('test-visual-prompt-1');

      // Verify saved in database
      const saved = await prisma.tCIABTest.findUnique({ where: { id: testId } });
      expect(saved).toBeDefined();
      expect(saved?.name).toBe(config.name);
    });

    it('should create test with multiple variants', async () => {
      const variants: PromptVariant[] = [
        {
          id: 'variant-a',
          name: 'Control',
          layer: 'causal',
          prompt: 'Predict the consequences...',
        },
        {
          id: 'variant-b',
          name: 'Variant B',
          layer: 'causal',
          prompt: 'Analyze the causal chain...',
        },
        {
          id: 'variant-c',
          name: 'Variant C',
          layer: 'causal',
          prompt: 'Examine step-by-step impact...',
        },
      ];

      const config: ABTestConfig = {
        testId: 'test-causal-3-way',
        name: '3-Way Causal Test',
        description: 'Testing three prompts',
        layer: 'causal',
        variants,
        trafficSplit: [34, 33, 33],
        startDate: new Date(),
        minSampleSize: 150,
        active: true,
      };

      const testId = await abService.createABTest(config);
      testIds.push(testId);

      expect(testId).toBeDefined();
    });
  });

  describe('Variant Selection', () => {
    it('should select variants according to traffic split', async () => {
      const config: ABTestConfig = {
        testId: 'test-selection',
        name: 'Selection Test',
        description: 'Test variant selection',
        layer: 'visual',
        variants: [
          { id: 'a', name: 'A', layer: 'visual', prompt: 'A' },
          { id: 'b', name: 'B', layer: 'visual', prompt: 'B' },
        ],
        trafficSplit: [70, 30], // 70/30 split
        startDate: new Date(),
        minSampleSize: 100,
        active: true,
      };

      // Select variants 1000 times
      const selections: Record<string, number> = { a: 0, b: 0 };

      for (let i = 0; i < 1000; i++) {
        const variant = abService.selectVariant(config);
        selections[variant.id]++;
      }

      // Should be approximately 70/30
      const aPercentage = (selections.a / 1000) * 100;
      const bPercentage = (selections.b / 1000) * 100;

      expect(aPercentage).toBeGreaterThan(65);
      expect(aPercentage).toBeLessThan(75);
      expect(bPercentage).toBeGreaterThan(25);
      expect(bPercentage).toBeLessThan(35);
    });

    it('should get active test for a layer', async () => {
      const config: ABTestConfig = {
        testId: 'test-active-lookup',
        name: 'Active Test',
        description: 'Test active lookup',
        layer: 'historical',
        variants: [
          { id: 'a', name: 'A', layer: 'historical', prompt: 'A' },
          { id: 'b', name: 'B', layer: 'historical', prompt: 'B' },
        ],
        trafficSplit: [50, 50],
        startDate: new Date(),
        minSampleSize: 50,
        active: true,
      };

      const testId = await abService.createABTest(config);
      testIds.push(testId);

      const activeTest = await abService.getActiveTest('historical');

      expect(activeTest).toBeDefined();
      expect(activeTest?.testId).toBe(testId);
    });

    it('should return null if no active test', async () => {
      const activeTest = await abService.getActiveTest('nonexistent-layer');
      expect(activeTest).toBeNull();
    });
  });

  describe('Metrics Recording', () => {
    it('should record test results', async () => {
      const config: ABTestConfig = {
        testId: 'test-metrics-recording',
        name: 'Metrics Test',
        description: 'Test metrics recording',
        layer: 'logic',
        variants: [
          { id: 'a', name: 'A', layer: 'logic', prompt: 'A' },
          { id: 'b', name: 'B', layer: 'logic', prompt: 'B' },
        ],
        trafficSplit: [50, 50],
        startDate: new Date(),
        minSampleSize: 10,
        active: true,
      };

      const testId = await abService.createABTest(config);
      testIds.push(testId);

      // Record some results
      await abService.recordTestResult(testId, 'a', {
        accuracy: 0.92,
        confidence: 0.85,
        time: 1500,
        verdict: 'SHIP',
        wasHelpful: true,
      });

      await abService.recordTestResult(testId, 'b', {
        accuracy: 0.88,
        confidence: 0.82,
        time: 1800,
        verdict: 'REFACTOR',
        wasHelpful: false,
      });

      // Verify saved
      const results = await prisma.tCIABTestResult.findMany({
        where: { testId },
      });

      expect(results.length).toBe(2);
    });

    it('should calculate aggregate metrics', async () => {
      const config: ABTestConfig = {
        testId: 'test-aggregate-metrics',
        name: 'Aggregate Metrics Test',
        description: 'Test aggregate metrics',
        layer: 'synthesis',
        variants: [
          { id: 'a', name: 'A', layer: 'synthesis', prompt: 'A' },
          { id: 'b', name: 'B', layer: 'synthesis', prompt: 'B' },
        ],
        trafficSplit: [50, 50],
        startDate: new Date(),
        minSampleSize: 5,
        active: true,
      };

      const testId = await abService.createABTest(config);
      testIds.push(testId);

      // Record 5 results for variant A
      for (let i = 0; i < 5; i++) {
        await abService.recordTestResult(testId, 'a', {
          accuracy: 0.9 + i * 0.01, // 0.90, 0.91, 0.92, 0.93, 0.94
          confidence: 0.85,
          time: 1500,
          verdict: 'SHIP',
          wasHelpful: true,
        });
      }

      // Record 5 results for variant B
      for (let i = 0; i < 5; i++) {
        await abService.recordTestResult(testId, 'b', {
          accuracy: 0.85 + i * 0.01, // 0.85, 0.86, 0.87, 0.88, 0.89
          confidence: 0.80,
          time: 1600,
          verdict: 'SHIP',
          wasHelpful: true,
        });
      }

      const metrics = await abService.getTestMetrics(testId);

      expect(metrics['a']).toBeDefined();
      expect(metrics['b']).toBeDefined();

      // Variant A should have higher average accuracy
      expect(metrics['a'].accuracy).toBeGreaterThan(metrics['b'].accuracy);
      expect(metrics['a'].sampleSize).toBe(5);
      expect(metrics['b'].sampleSize).toBe(5);
    });

    it('should track verdict distribution', async () => {
      const config: ABTestConfig = {
        testId: 'test-verdict-dist',
        name: 'Verdict Distribution Test',
        description: 'Test verdict distribution',
        layer: 'visual',
        variants: [
          { id: 'a', name: 'A', layer: 'visual', prompt: 'A' },
        ],
        trafficSplit: [100],
        startDate: new Date(),
        minSampleSize: 10,
        active: true,
      };

      const testId = await abService.createABTest(config);
      testIds.push(testId);

      // Record different verdicts
      await abService.recordTestResult(testId, 'a', {
        confidence: 0.9,
        time: 1000,
        verdict: 'SHIP',
      });

      await abService.recordTestResult(testId, 'a', {
        confidence: 0.8,
        time: 1000,
        verdict: 'SHIP',
      });

      await abService.recordTestResult(testId, 'a', {
        confidence: 0.7,
        time: 1000,
        verdict: 'REFACTOR',
      });

      await abService.recordTestResult(testId, 'a', {
        confidence: 0.6,
        time: 1000,
        verdict: 'REJECT',
      });

      const metrics = await abService.getTestMetrics(testId);

      expect(metrics['a'].verdictDistribution.ship).toBe(2);
      expect(metrics['a'].verdictDistribution.refactor).toBe(1);
      expect(metrics['a'].verdictDistribution.reject).toBe(1);
    });

    it('should track user feedback', async () => {
      const config: ABTestConfig = {
        testId: 'test-feedback-tracking',
        name: 'Feedback Test',
        description: 'Test feedback tracking',
        layer: 'visual',
        variants: [
          { id: 'a', name: 'A', layer: 'visual', prompt: 'A' },
        ],
        trafficSplit: [100],
        startDate: new Date(),
        minSampleSize: 10,
        active: true,
      };

      const testId = await abService.createABTest(config);
      testIds.push(testId);

      // Record with feedback
      await abService.recordTestResult(testId, 'a', {
        confidence: 0.9,
        time: 1000,
        verdict: 'SHIP',
        wasHelpful: true,
      });

      await abService.recordTestResult(testId, 'a', {
        confidence: 0.8,
        time: 1000,
        verdict: 'SHIP',
        wasHelpful: true,
      });

      await abService.recordTestResult(testId, 'a', {
        confidence: 0.7,
        time: 1000,
        verdict: 'SHIP',
        wasHelpful: false,
      });

      const metrics = await abService.getTestMetrics(testId);

      expect(metrics['a'].userFeedback.helpful).toBe(2);
      expect(metrics['a'].userFeedback.notHelpful).toBe(1);
      expect(metrics['a'].userFeedback.helpfulRate).toBeCloseTo(2 / 3);
    });
  });

  describe('Test Analysis', () => {
    it('should determine winning variant', async () => {
      const config: ABTestConfig = {
        testId: 'test-winner-determination',
        name: 'Winner Test',
        description: 'Test winner determination',
        layer: 'visual',
        variants: [
          { id: 'a', name: 'A', layer: 'visual', prompt: 'A' },
          { id: 'b', name: 'B', layer: 'visual', prompt: 'B' },
        ],
        trafficSplit: [50, 50],
        startDate: new Date(),
        minSampleSize: 5,
        active: true,
      };

      const testId = await abService.createABTest(config);
      testIds.push(testId);

      // Variant A: Better performance
      for (let i = 0; i < 5; i++) {
        await abService.recordTestResult(testId, 'a', {
          accuracy: 0.95,
          confidence: 0.9,
          time: 1500,
          verdict: 'SHIP',
          wasHelpful: true,
        });
      }

      // Variant B: Worse performance
      for (let i = 0; i < 5; i++) {
        await abService.recordTestResult(testId, 'b', {
          accuracy: 0.80,
          confidence: 0.7,
          time: 1800,
          verdict: 'REFACTOR',
          wasHelpful: false,
        });
      }

      const analysis = await abService.analyzeTest(testId);

      expect(analysis.winningVariant).toBe('a');
      expect(analysis.confidenceLevel).toBeGreaterThan(0.5);
      expect(analysis.recommendation).toMatch(/deploy|continue_testing/);
      expect(analysis.insights.length).toBeGreaterThan(0);
    });

    it('should recommend continuing if sample size too small', async () => {
      const config: ABTestConfig = {
        testId: 'test-small-sample',
        name: 'Small Sample Test',
        description: 'Test with small sample',
        layer: 'visual',
        variants: [
          { id: 'a', name: 'A', layer: 'visual', prompt: 'A' },
          { id: 'b', name: 'B', layer: 'visual', prompt: 'B' },
        ],
        trafficSplit: [50, 50],
        startDate: new Date(),
        minSampleSize: 100, // Require 100 samples
        active: true,
      };

      const testId = await abService.createABTest(config);
      testIds.push(testId);

      // Only 2 samples
      await abService.recordTestResult(testId, 'a', {
        confidence: 0.9,
        time: 1000,
        verdict: 'SHIP',
      });

      await abService.recordTestResult(testId, 'b', {
        confidence: 0.8,
        time: 1000,
        verdict: 'SHIP',
      });

      const analysis = await abService.analyzeTest(testId);

      expect(analysis.recommendation).toBe('continue_testing');
      expect(analysis.insights[0]).toContain('Minimum sample size');
    });

    it('should provide actionable insights', async () => {
      const config: ABTestConfig = {
        testId: 'test-insights',
        name: 'Insights Test',
        description: 'Test insights generation',
        layer: 'visual',
        variants: [
          { id: 'a', name: 'A', layer: 'visual', prompt: 'A' },
          { id: 'b', name: 'B', layer: 'visual', prompt: 'B' },
        ],
        trafficSplit: [50, 50],
        startDate: new Date(),
        minSampleSize: 3,
        active: true,
      };

      const testId = await abService.createABTest(config);
      testIds.push(testId);

      for (let i = 0; i < 3; i++) {
        await abService.recordTestResult(testId, 'a', {
          accuracy: 0.92,
          confidence: 0.85,
          time: 1500,
          verdict: 'SHIP',
          wasHelpful: true,
        });

        await abService.recordTestResult(testId, 'b', {
          accuracy: 0.87,
          confidence: 0.80,
          time: 1600,
          verdict: 'SHIP',
          wasHelpful: false,
        });
      }

      const analysis = await abService.analyzeTest(testId);

      expect(analysis.insights).toContain(expect.stringContaining('accuracy'));
      expect(analysis.insights).toContain(expect.stringContaining('helpful rate'));
      expect(analysis.insights).toContain(expect.stringContaining('execution time'));
    });
  });

  describe('Test Management', () => {
    it('should list all tests', async () => {
      const tests = await abService.listTests();
      expect(tests.length).toBeGreaterThanOrEqual(testIds.length);
    });

    it('should list only active tests', async () => {
      const activeTests = await abService.listTests(true);
      activeTests.forEach(test => {
        expect(test.active).toBe(true);
      });
    });

    it('should stop a test', async () => {
      const config: ABTestConfig = {
        testId: 'test-stop',
        name: 'Stop Test',
        description: 'Test stopping',
        layer: 'visual',
        variants: [
          { id: 'a', name: 'A', layer: 'visual', prompt: 'A' },
        ],
        trafficSplit: [100],
        startDate: new Date(),
        minSampleSize: 10,
        active: true,
      };

      const testId = await abService.createABTest(config);
      testIds.push(testId);

      await abService.stopTest(testId);

      const stopped = await prisma.tCIABTest.findUnique({ where: { id: testId } });
      expect(stopped?.active).toBe(false);
      expect(stopped?.endDate).toBeDefined();
    });
  });
});

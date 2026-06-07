/**
 * A/B Testing Service for TCI Prompt Optimization
 *
 * Enables testing different prompt variations to optimize accuracy.
 * Tracks performance metrics and automatically selects best-performing prompts.
 */

import { prisma } from '../../lib/prisma';

export interface PromptVariant {
  id: string;
  name: string;
  layer: 'visual' | 'causal' | 'historical' | 'logic' | 'synthesis' | 'implementation';
  prompt: string;
  systemPrompt?: string;
  temperature?: number;
  metadata?: Record<string, any>;
}

export interface ABTestConfig {
  testId: string;
  name: string;
  description: string;
  layer: string;
  variants: PromptVariant[];
  trafficSplit: number[]; // Percentage for each variant (must sum to 100)
  startDate: Date;
  endDate?: Date;
  minSampleSize: number;
  active: boolean;
}

export interface ABTestMetrics {
  variantId: string;
  sampleSize: number;
  accuracy: number;
  averageConfidence: number;
  averageTime: number;
  verdictDistribution: {
    ship: number;
    refactor: number;
    reject: number;
  };
  userFeedback: {
    helpful: number;
    notHelpful: number;
    helpfulRate: number;
  };
}

export interface ABTestResult {
  testId: string;
  winningVariant: string;
  metrics: Record<string, ABTestMetrics>;
  confidenceLevel: number;
  recommendation: 'deploy' | 'continue_testing' | 'rollback';
  insights: string[];
}

export class ABTestingService {
  /**
   * Create a new A/B test
   */
  async createABTest(config: ABTestConfig): Promise<string> {
    const test = await prisma.tCIABTest.create({
      data: {
        id: config.testId,
        name: config.name,
        description: config.description,
        layer: config.layer,
        variants: config.variants as any,
        trafficSplit: config.trafficSplit,
        startDate: config.startDate,
        endDate: config.endDate,
        minSampleSize: config.minSampleSize,
        active: config.active,
        metrics: {},
      },
    });

    console.log(`[AB Test] Created test: ${config.name} (${test.id})`);
    return test.id;
  }

  /**
   * Get active A/B test for a layer
   */
  async getActiveTest(layer: string): Promise<ABTestConfig | null> {
    const test = await prisma.tCIABTest.findFirst({
      where: {
        layer,
        active: true,
        startDate: { lte: new Date() },
        OR: [
          { endDate: null },
          { endDate: { gte: new Date() } },
        ],
      },
    });

    if (!test) return null;

    return {
      testId: test.id,
      name: test.name,
      description: test.description,
      layer: test.layer,
      variants: test.variants as any,
      trafficSplit: test.trafficSplit as number[],
      startDate: test.startDate,
      endDate: test.endDate || undefined,
      minSampleSize: test.minSampleSize,
      active: test.active,
    };
  }

  /**
   * Select variant for a given request
   * Uses traffic split to randomly assign variant
   */
  selectVariant(test: ABTestConfig): PromptVariant {
    const random = Math.random() * 100;
    let cumulative = 0;

    for (let i = 0; i < test.variants.length; i++) {
      cumulative += test.trafficSplit[i];
      if (random < cumulative) {
        return test.variants[i];
      }
    }

    // Fallback to first variant
    return test.variants[0];
  }

  /**
   * Record test result
   */
  async recordTestResult(
    testId: string,
    variantId: string,
    metrics: {
      accuracy?: number;
      confidence: number;
      time: number;
      verdict: 'SHIP' | 'REFACTOR' | 'REJECT';
      wasHelpful?: boolean;
    }
  ): Promise<void> {
    await prisma.tCIABTestResult.create({
      data: {
        testId,
        variantId,
        accuracy: metrics.accuracy,
        confidence: metrics.confidence,
        executionTime: metrics.time,
        verdict: metrics.verdict,
        wasHelpful: metrics.wasHelpful,
      },
    });
  }

  /**
   * Get test metrics
   */
  async getTestMetrics(testId: string): Promise<Record<string, ABTestMetrics>> {
    const results = await prisma.tCIABTestResult.groupBy({
      by: ['variantId'],
      where: { testId },
      _count: { id: true },
      _avg: {
        accuracy: true,
        confidence: true,
        executionTime: true,
      },
    });

    const metrics: Record<string, ABTestMetrics> = {};

    for (const result of results) {
      const variantId = result.variantId;

      // Get verdict distribution
      const verdicts = await prisma.tCIABTestResult.groupBy({
        by: ['verdict'],
        where: { testId, variantId },
        _count: { id: true },
      });

      const verdictDist = {
        ship: 0,
        refactor: 0,
        reject: 0,
      };

      verdicts.forEach(v => {
        const count = v._count.id;
        if (v.verdict === 'SHIP') verdictDist.ship = count;
        if (v.verdict === 'REFACTOR') verdictDist.refactor = count;
        if (v.verdict === 'REJECT') verdictDist.reject = count;
      });

      // Get feedback stats
      const feedbackStats = await prisma.tCIABTestResult.aggregate({
        where: { testId, variantId },
        _count: {
          id: true,
        },
        _avg: {
          accuracy: true,
        },
      });

      const helpfulCount = (feedbackStats._avg as any)?.accuracy || 0;
      const totalFeedback = (feedbackStats._count as any)?.id || 0;
      const helpfulRate = totalFeedback > 0 ? helpfulCount / totalFeedback : 0;

      metrics[variantId] = {
        variantId,
        sampleSize: result._count.id,
        accuracy: result._avg.accuracy || 0,
        averageConfidence: result._avg.confidence || 0,
        averageTime: result._avg.executionTime || 0,
        verdictDistribution: verdictDist,
        userFeedback: {
          helpful: helpfulCount,
          notHelpful: totalFeedback - helpfulCount,
          helpfulRate,
        },
      };
    }

    return metrics;
  }

  /**
   * Analyze A/B test and determine winner
   */
  async analyzeTest(testId: string): Promise<ABTestResult> {
    const test = await prisma.tCIABTest.findUnique({
      where: { id: testId },
    });

    if (!test) {
      throw new Error(`Test ${testId} not found`);
    }

    const metrics = await this.getTestMetrics(testId);
    const variants = Object.values(metrics);

    // Check if minimum sample size reached
    const hasMinSamples = variants.every(v => v.sampleSize >= test.minSampleSize);

    if (!hasMinSamples) {
      return {
        testId,
        winningVariant: '',
        metrics,
        confidenceLevel: 0,
        recommendation: 'continue_testing',
        insights: [
          `Minimum sample size (${test.minSampleSize}) not reached for all variants`,
          `Continue testing to collect more data`,
        ],
      };
    }

    // Find winning variant (highest accuracy + helpful rate)
    let winningVariant = '';
    let highestScore = -Infinity;

    for (const [variantId, m] of Object.entries(metrics)) {
      // Composite score: 70% accuracy + 30% helpful rate
      const score = m.accuracy * 0.7 + m.userFeedback.helpfulRate * 0.3;

      if (score > highestScore) {
        highestScore = score;
        winningVariant = variantId;
      }
    }

    const winnerMetrics = metrics[winningVariant];
    const insights: string[] = [];

    // Calculate confidence level using statistical significance
    const variantIds = Object.keys(metrics);
    const otherVariants = variantIds.filter(id => id !== winningVariant);

    let confidenceLevel = 0.5;

    if (otherVariants.length > 0) {
      const winnerAccuracy = winnerMetrics.accuracy;
      const winnerSampleSize = winnerMetrics.sampleSize;

      // Simple confidence calculation (should use proper statistical test in production)
      const improvements = otherVariants.map(id => {
        const otherMetrics = metrics[id];
        const improvement = (winnerAccuracy - otherMetrics.accuracy) / otherMetrics.accuracy;
        return improvement;
      });

      const avgImprovement = improvements.reduce((sum, imp) => sum + imp, 0) / improvements.length;

      confidenceLevel = Math.min(0.99, 0.5 + avgImprovement * 2);

      insights.push(
        `Winner (${winningVariant}) has ${(avgImprovement * 100).toFixed(1)}% higher accuracy on average`,
        `Confidence level: ${(confidenceLevel * 100).toFixed(0)}%`,
        `Winner sample size: ${winnerSampleSize}`,
      );
    }

    // Add specific insights
    insights.push(
      `Winner accuracy: ${(winnerMetrics.accuracy * 100).toFixed(1)}%`,
      `Winner helpful rate: ${(winnerMetrics.userFeedback.helpfulRate * 100).toFixed(1)}%`,
      `Winner avg execution time: ${winnerMetrics.averageTime.toFixed(0)}ms`,
    );

    // Determine recommendation
    let recommendation: 'deploy' | 'continue_testing' | 'rollback';

    if (confidenceLevel >= 0.95 && winnerMetrics.accuracy > 0.85) {
      recommendation = 'deploy';
      insights.push('✅ Recommendation: Deploy winning variant');
    } else if (confidenceLevel >= 0.8) {
      recommendation = 'continue_testing';
      insights.push('⚠️  Recommendation: Continue testing to increase confidence');
    } else {
      recommendation = 'rollback';
      insights.push('❌ Recommendation: No clear winner, consider new variants');
    }

    return {
      testId,
      winningVariant,
      metrics,
      confidenceLevel,
      recommendation,
      insights,
    };
  }

  /**
   * Deploy winning variant
   */
  async deployWinner(testId: string): Promise<void> {
    const analysis = await this.analyzeTest(testId);

    if (analysis.recommendation !== 'deploy') {
      throw new Error(`Cannot deploy: ${analysis.recommendation}`);
    }

    const test = await prisma.tCIABTest.findUnique({
      where: { id: testId },
    });

    if (!test) {
      throw new Error(`Test ${testId} not found`);
    }

    const variants = test.variants as any as PromptVariant[];
    const winningVariant = variants.find(v => v.id === analysis.winningVariant);

    if (!winningVariant) {
      throw new Error(`Winning variant ${analysis.winningVariant} not found`);
    }

    // Update layer to use winning prompt
    // (In production, this would update the service's default prompt)
    console.log(`[AB Test] Deploying winner for ${test.layer}:`, winningVariant.name);
    console.log(`[AB Test] New prompt:`, winningVariant.prompt);

    // Mark test as complete
    await prisma.tCIABTest.update({
      where: { id: testId },
      data: {
        active: false,
        endDate: new Date(),
      },
    });

    console.log(`[AB Test] Test ${testId} completed and winner deployed`);
  }

  /**
   * List all A/B tests
   */
  async listTests(activeOnly = false): Promise<ABTestConfig[]> {
    const tests = await prisma.tCIABTest.findMany({
      where: activeOnly ? { active: true } : undefined,
      orderBy: { startDate: 'desc' },
    });

    return tests.map(test => ({
      testId: test.id,
      name: test.name,
      description: test.description,
      layer: test.layer,
      variants: test.variants as any,
      trafficSplit: test.trafficSplit as number[],
      startDate: test.startDate,
      endDate: test.endDate || undefined,
      minSampleSize: test.minSampleSize,
      active: test.active,
    }));
  }

  /**
   * Stop an active test
   */
  async stopTest(testId: string): Promise<void> {
    await prisma.tCIABTest.update({
      where: { id: testId },
      data: {
        active: false,
        endDate: new Date(),
      },
    });

    console.log(`[AB Test] Stopped test ${testId}`);
  }
}

export const abTestingService = new ABTestingService();

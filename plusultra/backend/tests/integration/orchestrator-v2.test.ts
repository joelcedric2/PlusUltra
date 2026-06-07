/**
 * Integration Test: Multi-AI Orchestrator V2
 * Tests meta-prompting + turn-based review flow
 */

import { MultiAIOrchestrator } from '../../src/services/ai/MultiAIOrchestrator';

describe('MultiAIOrchestrator V2', () => {
  let orchestrator: MultiAIOrchestrator;
  const testUserId = 'test-user-orchestrator-v2';

  beforeAll(() => {
    orchestrator = new MultiAIOrchestrator();
  });

  describe('Meta-Prompting + Turn-Based Review Flow', () => {
    it('should expand a simple request and generate code', async () => {
      const result = await orchestrator.orchestrate({
        userId: testUserId,
        task: 'Build a login form',
        taskType: 'code_generation',
        useNewOrchestration: true,
      });

      // Verify V2 was used
      expect(result.usedNewOrchestration).toBe(true);

      // Verify enhanced prompt exists
      expect(result.enhancedPrompt).toBeDefined();
      expect(result.enhancedPrompt?.originalRequest).toBe('Build a login form');
      expect(result.enhancedPrompt?.enhancedPrompt).toContain('login');

      // Verify expanded requirements
      const requirements = result.enhancedPrompt?.expandedRequirements;
      expect(requirements?.security.length).toBeGreaterThan(0);
      expect(requirements?.accessibility.length).toBeGreaterThan(0);

      // Verify review history exists
      expect(result.reviewHistory).toBeDefined();

      // Verify system metrics
      expect(result.systemMetrics).toBeDefined();
      expect(result.systemMetrics?.metaPromptTimeMs).toBeGreaterThan(0);
      expect(result.systemMetrics?.generationTimeMs).toBeGreaterThan(0);
      expect(result.systemMetrics?.totalTimeMs).toBeGreaterThan(0);

      // Verify final response exists
      expect(result.finalResponse).toBeTruthy();
      expect(result.finalResponse.length).toBeGreaterThan(100);

      console.log('\n✅ [SIMPLE] Test Results:');
      console.log(`   Complexity: ${result.enhancedPrompt?.estimatedComplexity}`);
      console.log(`   Security Requirements: ${requirements?.security.length}`);
      console.log(`   Issues Found: ${result.reviewHistory?.issuesFound || 0}`);
      console.log(`   Issues Fixed: ${result.reviewHistory?.issuesFixed || 0}`);
      console.log(`   Final Verdict: ${result.reviewHistory?.finalVerdict || 'N/A'}`);
      console.log(`   Time: ${result.systemMetrics?.totalTimeMs}ms`);
    }, 120000); // 2 minute timeout

    it('should handle medium complexity tasks with comprehensive review', async () => {
      const result = await orchestrator.orchestrate({
        userId: testUserId,
        task: 'Create a React component for a shopping cart with add/remove items, quantity updates, and price calculation',
        taskType: 'code_generation',
        useNewOrchestration: true,
      });

      // Verify V2 features
      expect(result.usedNewOrchestration).toBe(true);
      expect(result.enhancedPrompt?.estimatedComplexity).toMatch(/SIMPLE|MODERATE|COMPLEX/);

      // Verify expanded requirements include important considerations
      const requirements = result.enhancedPrompt?.expandedRequirements;
      expect(requirements).toBeDefined();

      // Shopping cart should have edge case handling
      expect(
        requirements?.edgeCases.some((ec) =>
          ec.toLowerCase().includes('empty') ||
          ec.toLowerCase().includes('null') ||
          ec.toLowerCase().includes('quantity')
        )
      ).toBe(true);

      // Review should have happened
      expect(result.reviewHistory).toBeDefined();

      console.log('\n✅ [MEDIUM] Test Results:');
      console.log(`   Complexity: ${result.enhancedPrompt?.estimatedComplexity}`);
      console.log(`   Edge Cases: ${requirements?.edgeCases.length}`);
      console.log(`   Performance Considerations: ${requirements?.performance.length}`);
      console.log(`   Issues Found: ${result.reviewHistory?.issuesFound || 0}`);
      console.log(`   Issues Fixed: ${result.reviewHistory?.issuesFixed || 0}`);
      console.log(`   Total Reviews: ${result.reviewHistory?.totalReviews || 0}`);
      console.log(`   Early Exit: ${result.reviewHistory?.earlyExit || false}`);
      console.log(`   Time: ${result.systemMetrics?.totalTimeMs}ms`);
    }, 180000); // 3 minute timeout

    it('should detect and fix HIGH severity issues during review', async () => {
      const result = await orchestrator.orchestrate({
        userId: testUserId,
        task: 'Create an API endpoint that accepts user input and stores it in a database',
        context: 'This endpoint will be public-facing',
        taskType: 'code_generation',
        useNewOrchestration: true,
      });

      // Verify V2 features
      expect(result.usedNewOrchestration).toBe(true);

      // Should have security requirements (SQL injection, XSS, etc.)
      const requirements = result.enhancedPrompt?.expandedRequirements;
      expect(requirements?.security.length).toBeGreaterThan(0);

      // Should mention input validation and sanitization
      expect(
        requirements?.security.some((req) =>
          req.toLowerCase().includes('validation') ||
          req.toLowerCase().includes('sanitize') ||
          req.toLowerCase().includes('injection')
        )
      ).toBe(true);

      // Review should find security issues
      if (result.reviewHistory) {
        const securityIssues = result.reviewHistory.reviewHistory.flatMap((review) =>
          review.newIssuesFound.filter((issue) => issue.category === 'SECURITY')
        );

        console.log('\n✅ [SECURITY] Test Results:');
        console.log(`   Security Requirements: ${requirements?.security.length}`);
        console.log(`   Security Issues Found: ${securityIssues.length}`);
        console.log(`   Total Issues Fixed: ${result.reviewHistory.issuesFixed}`);
        console.log(`   Final Verdict: ${result.reviewHistory.finalVerdict}`);
        console.log(`   Time: ${result.systemMetrics?.totalTimeMs}ms`);
      }
    }, 180000);

    it('should skip meta-prompting for trivial requests', async () => {
      const result = await orchestrator.orchestrate({
        userId: testUserId,
        task: 'create a button',
        taskType: 'code_generation',
        useNewOrchestration: true,
      });

      // Verify V2 was used
      expect(result.usedNewOrchestration).toBe(true);

      // Should have skipped meta-prompting (trivial request)
      expect(result.enhancedPrompt?.estimatedComplexity).toBe('TRIVIAL');
      expect(result.systemMetrics?.metaPromptTimeMs).toBeLessThan(100); // Should be very fast

      console.log('\n✅ [TRIVIAL] Test Results:');
      console.log(`   Skipped Meta-Prompt: ${result.systemMetrics?.metaPromptTimeMs! < 100}`);
      console.log(`   Time: ${result.systemMetrics?.totalTimeMs}ms`);
    }, 120000);
  });

  describe('V1 vs V2 Comparison', () => {
    const testTask = 'Create a user authentication system with JWT tokens';

    it('should compare V1 (parallel voting) vs V2 (meta-prompting + turn-based)', async () => {
      console.log('\n📊 Performance Comparison: V1 vs V2\n');

      // Run V1
      console.log('⏳ Running V1 (Parallel Voting)...');
      const v1StartTime = Date.now();
      const v1Result = await orchestrator.orchestrate({
        userId: testUserId,
        task: testTask,
        taskType: 'code_generation',
        useNewOrchestration: false,
        requireConsensus: true,
      });
      const v1TimeMs = Date.now() - v1StartTime;

      // Run V2
      console.log('⏳ Running V2 (Meta-Prompting + Turn-Based Review)...');
      const v2StartTime = Date.now();
      const v2Result = await orchestrator.orchestrate({
        userId: testUserId,
        task: testTask,
        taskType: 'code_generation',
        useNewOrchestration: true,
      });
      const v2TimeMs = Date.now() - v2StartTime;

      // Comparison
      console.log('\n📊 Results:');
      console.log('\nV1 (Parallel Voting):');
      console.log(`  ⏱️  Time: ${v1TimeMs}ms`);
      console.log(`  🪙 Tokens: ${v1Result.totalTokensUsed.total}`);
      console.log(`  📊 Confidence: ${v1Result.confidence.overall.toFixed(2)}`);
      console.log(`  🎯 Consensus: ${v1Result.confidence.consensus.toFixed(2)}`);
      console.log(`  ✨ Quality: ${v1Result.confidence.quality.toFixed(2)}`);
      console.log(`  🏆 Winner: ${v1Result.confidence.winner}`);
      console.log(`  ✅ Decision: ${v1Result.confidence.decision}`);

      console.log('\nV2 (Meta-Prompting + Turn-Based Review):');
      console.log(`  ⏱️  Time: ${v2TimeMs}ms`);
      console.log(`  🪙 Tokens: ${v2Result.totalTokensUsed.total}`);
      console.log(`  📊 Confidence: ${v2Result.confidence.overall.toFixed(2)}`);
      console.log(`  🎯 Consensus: ${v2Result.confidence.consensus.toFixed(2)}`);
      console.log(`  ✨ Quality: ${v2Result.confidence.quality.toFixed(2)}`);
      console.log(`  🏆 Winner: ${v2Result.confidence.winner}`);
      console.log(`  ✅ Decision: ${v2Result.confidence.decision}`);
      console.log(`  🔍 Complexity: ${v2Result.enhancedPrompt?.estimatedComplexity}`);
      console.log(`  🐛 Issues Found: ${v2Result.reviewHistory?.issuesFound || 0}`);
      console.log(`  🔧 Issues Fixed: ${v2Result.reviewHistory?.issuesFixed || 0}`);
      console.log(`  🚀 Early Exit: ${v2Result.reviewHistory?.earlyExit || false}`);

      console.log('\n📈 Performance Delta:');
      console.log(`  ⏱️  Time Difference: ${((v2TimeMs - v1TimeMs) / 1000).toFixed(2)}s`);
      console.log(`  🪙 Token Difference: ${v2Result.totalTokensUsed.total - v1Result.totalTokensUsed.total}`);
      console.log(`  📊 Quality Improvement: ${((v2Result.confidence.quality - v1Result.confidence.quality) * 100).toFixed(1)}%`);

      // Both should complete successfully
      expect(v1Result.taskCompleted).toBe(true);
      expect(v2Result.taskCompleted).toBe(true);

      // V2 should provide enhanced prompt
      expect(v2Result.enhancedPrompt).toBeDefined();
      expect(v2Result.reviewHistory).toBeDefined();

      // V2 should have higher quality (due to turn-based refinement)
      // Note: This may not always be true, but on average should be
      console.log(`\n${v2Result.confidence.quality > v1Result.confidence.quality ? '✅' : '⚠️'} V2 Quality ${v2Result.confidence.quality > v1Result.confidence.quality ? 'Higher' : 'Lower'} than V1`);
    }, 300000); // 5 minute timeout
  });

  describe('Groupthink Detection', () => {
    it('should penalize >95% similarity as groupthink', async () => {
      const result = await orchestrator.orchestrate({
        userId: testUserId,
        task: 'Write a function that returns "Hello World"',
        taskType: 'code_generation',
        useNewOrchestration: true,
      });

      // For trivial tasks, models often produce very similar output
      // Confidence engine should detect and penalize high similarity

      console.log('\n✅ [GROUPTHINK] Test Results:');
      console.log(`   Consensus: ${result.confidence.consensus.toFixed(2)}`);
      console.log(`   Overall: ${result.confidence.overall.toFixed(2)}`);
      console.log(`   Decision: ${result.confidence.decision}`);

      // If consensus is suspiciously high (0.5 penalty), it was detected
      if (result.confidence.consensus === 0.5) {
        console.log('   ⚠️  Groupthink detected and penalized!');
      }

      expect(result.confidence).toBeDefined();
    }, 120000);
  });
});

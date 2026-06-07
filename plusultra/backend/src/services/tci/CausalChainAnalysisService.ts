/**
 * Causal Chain Analysis Service - Layer 2 of TCI
 *
 * Uses Claude 4.5 to build step-by-step causal impact chains.
 * Predicts: "If X changes → Y breaks → Z fails"
 *
 * Why Claude 4.5?
 * - Best at causal reasoning (understanding ripple effects)
 * - Can trace impacts across files
 * - Predicts second-order and third-order consequences
 * - Excellent at "what breaks if..." scenarios
 *
 * Flow:
 * 1. Receives: Current code + Proposed change + Project context
 * 2. Claude 4.5 builds causal chain step by step
 * 3. Traces impact across imported files and dependencies
 * 4. Identifies breaking changes, side effects
 * 5. Returns: Risk assessment (SAFE/RISKY/DANGEROUS)
 *
 * Target time: 4-5 seconds
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  CausalChain,
  CausalStep,
  ProjectContext,
} from '../../types/tci';

export class CausalChainAnalysisService {
  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || '',
    });
  }

  /**
   * Analyze causal impact of code changes
   */
  async analyzeImpact(
    currentCode: string,
    proposedChange: string | null,
    context: ProjectContext
  ): Promise<CausalChain | null> {
    // If no change proposed, return null (code review mode, not change impact mode)
    if (!proposedChange || proposedChange === currentCode) {
      console.log('[TCI Layer 2] No change detected - skipping causal analysis');
      return null;
    }

    console.log('[TCI Layer 2] Causal chain analysis starting...');
    const startTime = Date.now();

    // Build causal analysis prompt
    const prompt = this.buildCausalPrompt(currentCode, proposedChange, context);

    // Call Claude 4.5 for causal reasoning
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4096,
      temperature: 0.3, // Lower for consistent causal reasoning
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    // Parse causal chain response
    const causalChain = this.parseCausalResponse(content.text);

    const timeElapsed = Date.now() - startTime;
    console.log(`  ✅ Causal analysis complete (${timeElapsed}ms)`);
    console.log(`     Steps: ${causalChain.causalChain.length}, Recommendation: ${causalChain.recommendation}`);

    return causalChain;
  }

  /**
   * Build causal analysis prompt for Claude 4.5
   */
  private buildCausalPrompt(
    currentCode: string,
    proposedChange: string,
    context: ProjectContext
  ): string {
    return `
You are Claude 4.5, an expert at causal reasoning. Your job is to predict the RIPPLE EFFECTS of a code change.

Think step-by-step:
- STEP 1: What DIRECTLY changes?
- STEP 2: What does this INDIRECTLY affect?
- STEP 3: What might BREAK?
- STEP 4: What are SECOND-ORDER effects?
- STEP 5: What are THIRD-ORDER effects?

═══════════════════════════════════════════════════════════
CURRENT CODE:
═══════════════════════════════════════════════════════════
\`\`\`${context.language}
${currentCode}
\`\`\`

═══════════════════════════════════════════════════════════
PROPOSED CHANGE:
═══════════════════════════════════════════════════════════
\`\`\`${context.language}
${proposedChange}
\`\`\`

═══════════════════════════════════════════════════════════
PROJECT CONTEXT:
═══════════════════════════════════════════════════════════

File: ${context.filePath}
Language: ${context.language}
Framework: ${context.framework || 'Unknown'}

Imported Files:
${context.imports.map(imp => `- ${imp}`).join('\n') || '- None'}

Dependencies:
${context.dependencies.map(dep => `- ${dep}`).join('\n') || '- None'}

Exported Symbols:
${context.exports.map(exp => `- ${exp}`).join('\n') || '- None'}

Test Coverage: ${context.testCoverage ? context.testCoverage + '%' : 'Unknown'}

═══════════════════════════════════════════════════════════
YOUR TASK: BUILD THE CAUSAL CHAIN
═══════════════════════════════════════════════════════════

Build a step-by-step causal chain showing what happens if this change is made.

EXAMPLE FORMAT:

STEP 1: [DIRECT CHANGE]
- Change: "Function 'getUserById' now returns Promise<User | null> instead of Promise<User>"
- Because: "Added null check for user not found"
- Affects: ["All callers of getUserById"]
- Risk: MEDIUM

STEP 2: [INDIRECT IMPACT]
- Change: "Callers must now handle null case"
- Because: "Return type changed from User to User | null"
- Affects: ["UserService", "AdminController", "ProfilePage"]
- Risk: HIGH

STEP 3: [BREAKING CHANGE]
- Change: "AdminController.getUser() will fail type check"
- Because: "It assumes user is never null"
- Affects: ["Admin dashboard", "User management UI"]
- Risk: HIGH

STEP 4: [SECOND-ORDER EFFECT]
- Change: "Tests will fail in UserService.test.ts"
- Because: "Mock return value doesn't match new type signature"
- Affects: ["CI pipeline"]
- Risk: MEDIUM

IMPORTANT RULES:
1. **Be specific** - Don't say "might break", say "WILL break X because Y"
2. **Trace imports** - If this file is imported, what breaks in those files?
3. **Check exports** - If this exports a function, who calls it?
4. **Consider tests** - Will existing tests fail?
5. **Think second-order** - What breaks when the first thing breaks?
6. **Risk levels**:
   - HIGH: Breaking change, runtime error, data loss
   - MEDIUM: Type error, test failure, deprecation warning
   - LOW: Style issue, performance impact, logging change

PREDICTED OUTCOME:
After all steps, summarize: Will this change be SAFE, RISKY, or DANGEROUS?

RECOMMENDATION:
- SAFE: No breaking changes, all tests pass, low risk
- RISKY: Some test failures or type errors, but fixable
- DANGEROUS: Breaking changes, runtime errors, data corruption risk

Respond in this EXACT JSON format:
{
  "causalChain": [
    {
      "step": 1,
      "change": "Specific change that happens",
      "because": "Why it happens (causal reason)",
      "affects": ["What files/functions/systems are affected"],
      "risk": "HIGH|MEDIUM|LOW"
    }
  ],
  "predictedOutcome": "Detailed summary of overall impact",
  "recommendation": "SAFE|RISKY|DANGEROUS",
  "confidence": 0.85
}

Be thorough. Think like a compiler + runtime + test suite combined.
`.trim();
  }

  /**
   * Parse Claude's causal response
   */
  private parseCausalResponse(response: string): CausalChain {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        causalChain: parsed.causalChain || [],
        predictedOutcome: parsed.predictedOutcome || 'Unable to determine outcome',
        recommendation: parsed.recommendation || 'RISKY',
        confidence: parsed.confidence || 0.5,
      };
    } catch (error) {
      console.error('Failed to parse causal response:', error);

      // Fallback: basic causal chain
      return {
        causalChain: [
          {
            step: 1,
            change: 'Unable to parse causal analysis',
            because: 'Claude response was not valid JSON',
            affects: ['Unknown'],
            risk: 'MEDIUM',
          },
        ],
        predictedOutcome: 'Could not determine impact - manual review required',
        recommendation: 'RISKY',
        confidence: 0.3,
      };
    }
  }

  /**
   * Compare two code snippets and detect if they're different
   */
  isCodeDifferent(code1: string, code2: string): boolean {
    // Normalize whitespace for comparison
    const normalize = (code: string) =>
      code.trim().replace(/\s+/g, ' ');

    return normalize(code1) !== normalize(code2);
  }

  /**
   * Analyze breaking changes specifically
   */
  async analyzeBreakingChanges(
    currentCode: string,
    proposedChange: string,
    context: ProjectContext
  ): Promise<{
    hasBreakingChanges: boolean;
    breakingChanges: string[];
    affectedFiles: string[];
  }> {
    const causalChain = await this.analyzeImpact(currentCode, proposedChange, context);

    if (!causalChain) {
      return {
        hasBreakingChanges: false,
        breakingChanges: [],
        affectedFiles: [],
      };
    }

    // Extract breaking changes (HIGH risk steps)
    const breakingSteps = causalChain.causalChain.filter(
      (step) => step.risk === 'HIGH'
    );

    const breakingChanges = breakingSteps.map((step) => step.change);
    const affectedFiles = Array.from(
      new Set(breakingSteps.flatMap((step) => step.affects))
    );

    return {
      hasBreakingChanges: breakingSteps.length > 0,
      breakingChanges,
      affectedFiles,
    };
  }
}

export const causalChainAnalysisService = new CausalChainAnalysisService();

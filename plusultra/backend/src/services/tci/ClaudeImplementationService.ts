/**
 * Claude Implementation Service - Layer 6 of TCI
 *
 * Takes insights from all 5 layers + Gemini's synthesis and uses Claude 4.5
 * to actually implement the fixes and improvements.
 *
 * Why Claude 4.5?
 * - Best at code implementation (better than Gemini at actual coding)
 * - Excellent at following complex instructions
 * - Can handle conflicts and make judgment calls
 * - Produces clean, working code
 *
 * Flow:
 * 1. Receives: Visual + Causal + Historical + Logic + Synthesis
 * 2. Claude 4.5 reads ALL insights
 * 3. Implements fixes for HIGH priority issues
 * 4. Resolves conflicts identified by Gemini
 * 5. Returns improved code with detailed change log
 */

import Anthropic from '@anthropic-ai/sdk';
import type {
  ImplementationResult,
  CodeChange,
  ImplementedFix,
  VisualInsights,
  CausalChain,
  HistoricalInsights,
  LogicVerification,
  TCIVerdict,
} from '../../types/tci';

export class ClaudeImplementationService {
  private anthropic: Anthropic;

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || '',
    });
  }

  /**
   * Implement fixes based on all TCI analysis layers
   */
  async implement(
    originalCode: string,
    visual: VisualInsights,
    causal: CausalChain | null,
    historical: HistoricalInsights,
    logic: LogicVerification,
    verdict: TCIVerdict
  ): Promise<ImplementationResult> {
    console.log('[TCI Layer 6] Claude implementation starting...');
    const startTime = Date.now();

    // Build comprehensive prompt with all insights
    const prompt = this.buildImplementationPrompt(
      originalCode,
      visual,
      causal,
      historical,
      logic,
      verdict
    );

    // Call Claude 4.5 to implement fixes
    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8192,
      temperature: 0.3, // Lower for more consistent code
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

    // Parse Claude's response
    const result = this.parseImplementationResponse(content.text, originalCode);

    const timeElapsed = Date.now() - startTime;
    console.log(`  ✅ Implementation complete (${timeElapsed}ms)`);
    console.log(`     Changes: ${result.changes.length}, Fixes: ${result.implementedFixes.length}`);

    return result;
  }

  /**
   * Build comprehensive implementation prompt for Claude
   */
  private buildImplementationPrompt(
    originalCode: string,
    visual: VisualInsights,
    causal: CausalChain | null,
    historical: HistoricalInsights,
    logic: LogicVerification,
    verdict: TCIVerdict
  ): string {
    return `
You are Claude 4.5, the best code implementation AI. You've received detailed analysis from 5 different AI models about this code. Your job is to IMPLEMENT the fixes and improvements they identified.

ORIGINAL CODE:
\`\`\`
${originalCode}
\`\`\`

═══════════════════════════════════════════════════════════
LAYER 1: VISUAL ANALYSIS (DeepSeek OCR)
═══════════════════════════════════════════════════════════

Code Health: ${visual.overallCodeHealth}/10
Confidence: ${(visual.confidence * 100).toFixed(0)}%

Visual Patterns Found:
${visual.visualPatterns.map((p, i) => `
${i + 1}. [${p.severity}] ${p.type}
   Location: ${p.location}
   Observation: ${p.description}
   Issue: ${p.likelyIssue}
`).join('')}

${causal ? `
═══════════════════════════════════════════════════════════
LAYER 2: CAUSAL ANALYSIS (Claude 4.5)
═══════════════════════════════════════════════════════════

Predicted Outcome: ${causal.predictedOutcome}
Recommendation: ${causal.recommendation}
Confidence: ${(causal.confidence * 100).toFixed(0)}%

Causal Chain:
${causal.causalChain.map((step, i) => `
Step ${step.step}: [${step.risk}]
  Change: ${step.change}
  Because: ${step.because}
  Affects: ${step.affects.join(', ')}
`).join('')}
` : ''}

═══════════════════════════════════════════════════════════
LAYER 3: HISTORICAL ANALYSIS (GPT-5)
═══════════════════════════════════════════════════════════

Pattern Match: ${historical.thisCodeMatchesPattern}
Confidence: ${(historical.confidence * 100).toFixed(0)}%

Similar Patterns Seen:
${historical.similarPatterns.map((p, i) => `
${i + 1}. ${p.pattern}
   Frequency: ${p.frequency}
   Common Bugs: ${p.commonBugs.join(', ')}
   Best Practice: ${p.bestPractice}
`).join('')}

Risk Assessment:
- Bugs: ${historical.riskAssessment.bugs.join(', ')}
- Vulnerabilities: ${historical.riskAssessment.vulnerabilities.join(', ')}
- Performance: ${historical.riskAssessment.performance}

═══════════════════════════════════════════════════════════
LAYER 4: LOGIC VERIFICATION (Grok)
═══════════════════════════════════════════════════════════

Correctness: ${(logic.overallCorrectness * 100).toFixed(0)}%
Recommendation: ${logic.recommendation}

Invariant Verifications:
${logic.verifications.map((v, i) => `
${i + 1}. ${v.invariant}: ${v.holds ? '✓ HOLDS' : '✗ VIOLATED'}
   Proof: ${v.proof}
   ${v.counterexample ? `Counterexample: ${v.counterexample}` : ''}
`).join('')}

═══════════════════════════════════════════════════════════
LAYER 5: SYNTHESIS (Gemini)
═══════════════════════════════════════════════════════════

Verdict: ${verdict.verdict}
Confidence: ${(verdict.confidence * 100).toFixed(0)}%

ALL MODELS AGREE ON:
${verdict.agreements.map((a, i) => `${i + 1}. ${a}`).join('\n')}

CONFLICTS (where models disagree):
${verdict.conflicts.map((c, i) => `${i + 1}. ${c}`).join('\n')}

CONFLICT RESOLUTIONS:
${verdict.conflictResolutions.map((r, i) => `${i + 1}. ${r}`).join('\n')}

SYNTHESIZED RISK:
- Visual: ${verdict.synthesizedRisk.visual}/10
- Causal: ${verdict.synthesizedRisk.causal}/10
- Historical: ${verdict.synthesizedRisk.historical}/10
- Logic: ${verdict.synthesizedRisk.logical}/10
- OVERALL: ${verdict.synthesizedRisk.overall}/10

ACTIONABLE STEPS:
${verdict.actionableSteps.map((step, i) => `
${i + 1}. [${step.priority}] ${step.category}
   ${step.action}
`).join('')}

═══════════════════════════════════════════════════════════
YOUR TASK: IMPLEMENT THE FIXES
═══════════════════════════════════════════════════════════

You are the implementation expert. Based on ALL the analysis above:

1. **Implement HIGH priority fixes immediately**
2. **Resolve conflicts** using the resolutions Gemini provided
3. **Address issues all models agreed on first** (highest confidence)
4. **Follow best practices** from historical analysis
5. **Fix invariant violations** from logic verification
6. **Improve visual patterns** (reduce complexity, add comments, fix asymmetry)
7. **Handle causal impacts** carefully

IMPORTANT RULES:
- Write clean, production-ready code
- Add comments explaining complex logic
- Follow the language's conventions
- Don't break existing functionality
- If you can't fix something, note it in remainingIssues

Respond in this EXACT JSON format:
{
  "improvedCode": "The complete improved code here",
  "changes": [
    {
      "type": "FIX|REFACTOR|ADD|REMOVE",
      "location": "Line X or function name",
      "before": "Original code snippet",
      "after": "Improved code snippet",
      "reason": "Why this change addresses the issue",
      "fromLayer": "visual|causal|historical|logic|synthesis"
    }
  ],
  "implementedFixes": [
    {
      "issue": "The original issue identified",
      "fix": "What you did to fix it",
      "layer": "visual|causal|historical|logic|synthesis",
      "priority": "HIGH|MEDIUM|LOW",
      "success": true
    }
  ],
  "explanation": "Overall summary of what you improved and why",
  "confidence": 0.92,
  "remainingIssues": ["Issues you couldn't fix automatically"]
}

Be thorough. Implement ALL HIGH priority fixes. This code will go to production.
`.trim();
  }

  /**
   * Parse Claude's implementation response
   */
  private parseImplementationResponse(
    response: string,
    originalCode: string
  ): ImplementationResult {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        originalCode,
        improvedCode: parsed.improvedCode || originalCode,
        changes: parsed.changes || [],
        implementedFixes: parsed.implementedFixes || [],
        explanation: parsed.explanation || 'Implementation completed',
        confidence: parsed.confidence || 0.5,
        remainingIssues: parsed.remainingIssues || [],
      };
    } catch (error) {
      console.error('Failed to parse Claude implementation response:', error);

      // Fallback: return original code with error
      return {
        originalCode,
        improvedCode: originalCode,
        changes: [],
        implementedFixes: [],
        explanation: 'Failed to parse implementation response',
        confidence: 0,
        remainingIssues: ['Could not parse Claude response - manual review required'],
      };
    }
  }

  /**
   * Validate that improved code is actually better than original
   */
  async validateImprovement(
    original: string,
    improved: string
  ): Promise<{ isValid: boolean; reason: string }> {
    // Basic validation checks
    const checks = {
      notEmpty: improved.trim().length > 0,
      notShorter: improved.length >= original.length * 0.5, // Allow some reduction
      hasStructure: improved.includes('{') && improved.includes('}'),
      notJustComments: improved.replace(/\/\/.*/g, '').replace(/\/\*[\s\S]*?\*\//g, '').trim().length > 10,
    };

    if (!checks.notEmpty) {
      return { isValid: false, reason: 'Improved code is empty' };
    }

    if (!checks.notShorter) {
      return { isValid: false, reason: 'Improved code is suspiciously short (>50% reduction)' };
    }

    if (!checks.hasStructure) {
      return { isValid: false, reason: 'Improved code lacks basic structure' };
    }

    if (!checks.notJustComments) {
      return { isValid: false, reason: 'Improved code is mostly comments' };
    }

    return { isValid: true, reason: 'Validation passed' };
  }
}

export const claudeImplementationService = new ClaudeImplementationService();

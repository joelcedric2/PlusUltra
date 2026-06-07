/**
 * Cross-Model Synthesis Service - Layer 5 of TCI
 *
 * Uses Gemini (Google) to synthesize insights from all 4 analysis layers.
 *
 * Why Gemini?
 * - Excellent at synthesizing multi-source information
 * - Strong at identifying consensus and conflicts
 * - Fast reasoning and pattern detection
 * - Good at building actionable recommendations
 *
 * Flow:
 * 1. Receives: Visual + Causal + Historical + Logic insights
 * 2. Identifies agreements (all models agree → high confidence)
 * 3. Identifies conflicts (models disagree → needs resolution)
 * 4. Resolves conflicts using evidence strength
 * 5. Returns: Synthesized verdict + actionable steps
 *
 * Target time: 2-3 seconds
 */

import { GoogleGenerativeAI } from '@google/generative-ai';
import type {
  TCIVerdict,
  VisualInsights,
  CausalChain,
  HistoricalInsights,
  LogicVerification,
  ActionableStep,
} from '../../types/tci';

export class CrossModelSynthesisService {
  private genAI: GoogleGenerativeAI;

  constructor() {
    this.genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY || '');
  }

  /**
   * Synthesize insights from all 4 analysis layers
   */
  async synthesize(
    visual: VisualInsights,
    causal: CausalChain | null,
    historical: HistoricalInsights,
    logic: LogicVerification
  ): Promise<TCIVerdict> {
    console.log('[TCI Layer 5] Cross-model synthesis starting...');
    const startTime = Date.now();

    // Build synthesis prompt
    const prompt = this.buildSynthesisPrompt(visual, causal, historical, logic);

    // Call Gemini
    const model = this.genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 4096,
      },
    });

    const response = result.response.text();

    // Parse synthesis verdict
    const verdict = this.parseSynthesisResponse(response);

    const timeElapsed = Date.now() - startTime;
    console.log(`  ✅ Synthesis complete (${timeElapsed}ms)`);
    console.log(`     Verdict: ${verdict.verdict}, Overall Risk: ${verdict.synthesizedRisk.overall}/10`);

    return verdict;
  }

  /**
   * Build synthesis prompt for Gemini
   */
  private buildSynthesisPrompt(
    visual: VisualInsights,
    causal: CausalChain | null,
    historical: HistoricalInsights,
    logic: LogicVerification
  ): string {
    return `
You are Gemini, a synthesis AI. You've received analysis from 4 different AI models. Your job is to combine their insights and resolve conflicts.

═══════════════════════════════════════════════════════════
LAYER 1: VISUAL ANALYSIS (DeepSeek Vision)
═══════════════════════════════════════════════════════════

Code Health: ${visual.overallCodeHealth}/10
Confidence: ${(visual.confidence * 100).toFixed(0)}%

Visual Patterns:
${visual.visualPatterns.map((p, i) => `
${i + 1}. [${p.severity}] ${p.type}
   Location: ${p.location}
   Issue: ${p.likelyIssue}
`).join('')}

Reasoning: ${visual.reasoning}

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
  ${step.change}
  Because: ${step.because}
  Affects: ${step.affects.join(', ')}
`).join('')}
` : `
═══════════════════════════════════════════════════════════
LAYER 2: CAUSAL ANALYSIS (Claude 4.5)
═══════════════════════════════════════════════════════════

[SKIPPED - No code change detected]
`}

═══════════════════════════════════════════════════════════
LAYER 3: HISTORICAL ANALYSIS (GPT-5)
═══════════════════════════════════════════════════════════

Pattern Match: ${historical.thisCodeMatchesPattern}
Confidence: ${(historical.confidence * 100).toFixed(0)}%

Similar Patterns:
${historical.similarPatterns.map((p, i) => `
${i + 1}. ${p.pattern}
   Frequency: ${p.frequency}
   Common Bugs: ${p.commonBugs.join(', ')}
   Best Practice: ${p.bestPractice}
`).join('')}

Risk Assessment:
- Bugs: ${historical.riskAssessment.bugs.join(', ') || 'None'}
- Vulnerabilities: ${historical.riskAssessment.vulnerabilities.join(', ') || 'None'}
- Performance: ${historical.riskAssessment.performance}

═══════════════════════════════════════════════════════════
LAYER 4: LOGIC VERIFICATION (Grok)
═══════════════════════════════════════════════════════════

Overall Correctness: ${(logic.overallCorrectness * 100).toFixed(0)}%
Recommendation: ${logic.recommendation}

Invariant Verifications:
${logic.verifications.map((v, i) => `
${i + 1}. ${v.invariant}: ${v.holds ? '✓ HOLDS' : '✗ VIOLATED'}
   Proof: ${v.proof}
   ${v.counterexample ? `Counterexample: ${v.counterexample}` : ''}
`).join('')}

═══════════════════════════════════════════════════════════
YOUR TASK: SYNTHESIZE INSIGHTS
═══════════════════════════════════════════════════════════

Analyze the 4 perspectives and answer:

**1. AGREEMENTS (Where all models agree)**
- What issues do ALL models detect?
- High agreement = high confidence
- List each agreed-upon issue

**2. CONFLICTS (Where models disagree)**
- Does one model say SAFE while another says DANGEROUS?
- Do models identify different issues?
- List each conflict

**3. CONFLICT RESOLUTION**
- For each conflict, which model is more credible?
- Use evidence strength:
  - Logic (Grok) has mathematical proof → highest credibility
  - Historical (GPT) has statistical evidence → high credibility
  - Visual (DeepSeek) has pattern detection → medium credibility
  - Causal (Claude) has reasoning → medium credibility
- Resolve each conflict with reasoning

**4. SYNTHESIZED RISK (0-10 scale)**
- Visual Risk: Based on DeepSeek's code health
- Causal Risk: Based on Claude's impact prediction
- Historical Risk: Based on GPT's pattern matching
- Logical Risk: Based on Grok's invariant violations
- **Overall Risk**: Weighted average (Logic > Historical > Visual > Causal)

**5. ACTIONABLE STEPS**
- What should the developer do RIGHT NOW?
- Prioritize by: HIGH (critical), MEDIUM (important), LOW (nice-to-have)
- Categories: FIX (broken code), REFACTOR (improve), REVIEW (manual check)

**6. FINAL VERDICT**
- SHIP: All models agree it's safe, or only minor issues
- REVIEW: Medium risk, needs manual inspection
- REFACTOR: Code works but has structural issues
- REJECT: Any model found critical issues (HIGH risk)

**GROUPTHINK DETECTION:**
If all 4 models agree >95%, be suspicious. Real-world code usually has SOME disagreement.
- Check: Are they all right, or did they miss something subtle?

RESPOND IN THIS EXACT JSON FORMAT:
{
  "agreements": [
    "Agreement 1: All 4 models detected X",
    "Agreement 2: All models agree Y is safe"
  ],
  "conflicts": [
    "Conflict 1: Visual says HIGH risk, but Historical says LOW risk",
    "Conflict 2: Logic found no issues, but Causal predicts breaking change"
  ],
  "conflictResolutions": [
    "Resolution 1: Trust Logic (Grok) because it has mathematical proof",
    "Resolution 2: Trust Historical (GPT) because it cites specific CVEs"
  ],
  "synthesizedRisk": {
    "visual": 7.5,
    "causal": 8.0,
    "historical": 9.0,
    "logical": 10.0,
    "overall": 8.6
  },
  "actionableSteps": [
    {
      "priority": "HIGH",
      "category": "FIX",
      "action": "Replace string concatenation with parameterized query (prevents SQL injection)"
    },
    {
      "priority": "MEDIUM",
      "category": "REFACTOR",
      "action": "Add error handling for null cases"
    }
  ],
  "verdict": "SHIP | REVIEW | REFACTOR | REJECT",
  "confidence": 0.92
}

Be thorough. Resolve ALL conflicts. Provide clear action items.
`.trim();
  }

  /**
   * Parse Gemini's synthesis response
   */
  private parseSynthesisResponse(response: string): TCIVerdict {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        agreements: parsed.agreements || [],
        conflicts: parsed.conflicts || [],
        conflictResolutions: parsed.conflictResolutions || [],
        synthesizedRisk: {
          visual: parsed.synthesizedRisk?.visual || 5.0,
          causal: parsed.synthesizedRisk?.causal || 5.0,
          historical: parsed.synthesizedRisk?.historical || 5.0,
          logical: parsed.synthesizedRisk?.logical || 5.0,
          overall: parsed.synthesizedRisk?.overall || 5.0,
        },
        actionableSteps: parsed.actionableSteps || [],
        verdict: parsed.verdict || 'REVIEW',
        confidence: parsed.confidence || 0.5,
      };
    } catch (error) {
      console.error('Failed to parse synthesis response:', error);

      // Fallback: Conservative verdict
      return {
        agreements: ['Unable to parse synthesis response'],
        conflicts: [],
        conflictResolutions: [],
        synthesizedRisk: {
          visual: 5.0,
          causal: 5.0,
          historical: 5.0,
          logical: 5.0,
          overall: 5.0,
        },
        actionableSteps: [
          {
            priority: 'HIGH',
            category: 'FIX' as const,
            action: 'Manual review required - synthesis failed',
          },
        ],
        verdict: 'REVIEW',
        confidence: 0.3,
      };
    }
  }

  /**
   * Detect if models are in groupthink (>95% agreement)
   */
  private detectGroupthink(
    visual: VisualInsights,
    causal: CausalChain | null,
    historical: HistoricalInsights,
    logic: LogicVerification
  ): boolean {
    // Check if all confidences are very high (>0.95)
    const confidences = [
      visual.confidence,
      causal?.confidence || 0,
      historical.confidence,
      logic.overallCorrectness,
    ].filter((c) => c > 0);

    const avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;

    return avgConfidence > 0.95;
  }
}

export const crossModelSynthesisService = new CrossModelSynthesisService();

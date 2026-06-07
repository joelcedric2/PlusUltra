/**
 * Symbolic Verification Service - Layer 4 of TCI
 *
 * Uses Grok (xAI) for formal logic verification and symbolic reasoning.
 *
 * Why Grok?
 * - Built for mathematical reasoning and formal verification
 * - Excellent at symbolic logic and theorem proving
 * - Can construct formal proofs and counterexamples
 * - Strong at invariant checking and constraint verification
 *
 * Flow:
 * 1. Receives: Code + Project context
 * 2. Identifies invariants that should hold (balance >= 0, auth required, etc.)
 * 3. Grok attempts to prove or disprove each invariant
 * 4. Returns: Proofs + counterexamples for violated invariants
 *
 * Target time: 3-4 seconds
 */

import axios from 'axios';
import type {
  LogicVerification,
  InvariantVerification,
  ProjectContext,
} from '../../types/tci';

export class SymbolicVerificationService {
  private grokApiKey: string;
  private grokApiUrl: string;

  constructor() {
    this.grokApiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY || '';
    // Grok API endpoint (xAI)
    this.grokApiUrl = process.env.GROK_API_URL || 'https://api.x.ai/v1/chat/completions';
  }

  /**
   * Perform symbolic logic verification on code
   */
  async verifyLogic(
    code: string,
    context: ProjectContext
  ): Promise<LogicVerification> {
    console.log('[TCI Layer 4] Symbolic logic verification starting...');
    const startTime = Date.now();

    // Build symbolic verification prompt
    const prompt = this.buildVerificationPrompt(code, context);

    // Call Grok API
    const response = await this.callGrokAPI(prompt);

    // Parse verification results
    const verification = this.parseVerificationResponse(response);

    const timeElapsed = Date.now() - startTime;
    console.log(`  ✅ Logic verification complete (${timeElapsed}ms)`);
    console.log(`     Invariants checked: ${verification.verifications.length}, Correctness: ${(verification.overallCorrectness * 100).toFixed(0)}%`);

    return verification;
  }

  /**
   * Call Grok API (xAI)
   */
  private async callGrokAPI(prompt: string): Promise<string> {
    try {
      const response = await axios.post(
        this.grokApiUrl,
        {
          model: 'grok-beta', // Latest Grok model
          messages: [
            {
              role: 'system',
              content: 'You are Grok, a formal verification and symbolic reasoning AI. You excel at mathematical proofs, invariant checking, and finding counterexamples to logical claims.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          temperature: 0.1, // Very low for formal reasoning
          max_tokens: 4096,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.grokApiKey}`,
          },
        }
      );

      return response.data.choices[0].message.content;
    } catch (error: any) {
      console.error('Grok API error:', error.response?.data || error.message);

      // Fallback: Use basic heuristic verification
      console.warn('⚠️  Grok API unavailable, using fallback verification');
      return this.fallbackVerification();
    }
  }

  /**
   * Build symbolic verification prompt for Grok
   */
  private buildVerificationPrompt(code: string, context: ProjectContext): string {
    return `
You are Grok, a formal verification AI. Your job is to mathematically verify invariants in code.

═══════════════════════════════════════════════════════════
CODE TO VERIFY:
═══════════════════════════════════════════════════════════
\`\`\`${context.language}
${code}
\`\`\`

═══════════════════════════════════════════════════════════
PROJECT CONTEXT:
═══════════════════════════════════════════════════════════

Language: ${context.language}
Framework: ${context.framework || 'Unknown'}

═══════════════════════════════════════════════════════════
YOUR TASK: FORMAL VERIFICATION
═══════════════════════════════════════════════════════════

Identify and verify INVARIANTS - logical statements that should ALWAYS be true.

Common invariants to check:

**1. Financial Invariants:**
- balance >= 0 (account balance never negative)
- totalIn - totalOut = balance (conservation)
- price > 0 (no free or negative prices)

**2. Security Invariants:**
- user.isAuthenticated() before sensitive operations
- input is sanitized before database queries
- secrets are never logged or exposed

**3. Data Invariants:**
- Arrays have length >= 0
- Indices are within bounds (0 <= i < arr.length)
- Pointers/references are not null when dereferenced
- Strings are not empty when required

**4. State Invariants:**
- State transitions are valid (PENDING → ACTIVE → COMPLETED)
- Resources are cleaned up (files closed, connections released)
- Locks are acquired before critical sections

**5. Type Invariants:**
- Return types match declarations
- Function arguments match expected types
- Null safety (no null/undefined where not allowed)

For each invariant:
1. **State the invariant** mathematically or logically
2. **Attempt to prove it** using formal reasoning
3. **If it holds**: Provide proof
4. **If it fails**: Provide counterexample showing how to violate it

EXAMPLE:

**Invariant:** "User input must be sanitized before database queries"

**Holds:** NO

**Proof:** The function \`getUser(email: string)\` concatenates the \`email\` parameter directly into the SQL query without sanitization:

\`\`\`
const query = "SELECT * FROM users WHERE email = '" + email + "'";
\`\`\`

This allows the variable \`email\` to flow directly to \`db.execute(query)\` with no sanitization step in between.

**Counterexample:**
\`\`\`
getUser("'; DROP TABLE users; --")
→ query becomes: "SELECT * FROM users WHERE email = ''; DROP TABLE users; --'"
→ Executes arbitrary SQL
\`\`\`

**Recommendation:** PROVEN_INCORRECT

RESPOND IN THIS EXACT JSON FORMAT:
{
  "verifications": [
    {
      "invariant": "Logical statement that should hold",
      "holds": true | false,
      "proof": "Formal reasoning for why it holds or fails",
      "counterexample": "Specific input that violates invariant (if holds=false)"
    }
  ],
  "overallCorrectness": 0.0 to 1.0,
  "recommendation": "PROVEN_CORRECT | PROVEN_INCORRECT | UNCERTAIN"
}

Be rigorous. Think like a theorem prover. Find edge cases.
`.trim();
  }

  /**
   * Parse Grok's verification response
   */
  private parseVerificationResponse(response: string): LogicVerification {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        verifications: parsed.verifications || [],
        overallCorrectness: parsed.overallCorrectness || 0.5,
        recommendation: parsed.recommendation || 'UNCERTAIN',
      };
    } catch (error) {
      console.error('Failed to parse verification response:', error);

      // Fallback: basic verification
      return {
        verifications: [
          {
            invariant: 'Unable to parse verification results',
            holds: false,
            proof: 'Grok response was not valid JSON',
            counterexample: undefined,
          },
        ],
        overallCorrectness: 0.5,
        recommendation: 'UNCERTAIN',
      };
    }
  }

  /**
   * Fallback verification when Grok API is unavailable
   */
  private fallbackVerification(): string {
    return JSON.stringify({
      verifications: [
        {
          invariant: 'Grok API unavailable - using basic heuristics',
          holds: false,
          proof: 'Could not perform formal verification',
          counterexample: undefined,
        },
      ],
      overallCorrectness: 0.5,
      recommendation: 'UNCERTAIN',
    });
  }

  /**
   * Check a specific invariant
   */
  async checkInvariant(
    code: string,
    context: ProjectContext,
    invariant: string
  ): Promise<InvariantVerification> {
    const verification = await this.verifyLogic(code, context);

    const matchingVerification = verification.verifications.find((v) =>
      v.invariant.toLowerCase().includes(invariant.toLowerCase())
    );

    if (matchingVerification) {
      return matchingVerification;
    }

    // If invariant not found, return uncertain
    return {
      invariant,
      holds: false,
      proof: 'Invariant was not checked by Grok',
      counterexample: undefined,
    };
  }

  /**
   * Get all violated invariants
   */
  async getViolations(
    code: string,
    context: ProjectContext
  ): Promise<InvariantVerification[]> {
    const verification = await this.verifyLogic(code, context);

    return verification.verifications.filter((v) => !v.holds);
  }
}

export const symbolicVerificationService = new SymbolicVerificationService();

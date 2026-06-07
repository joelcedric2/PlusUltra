/**
 * Historical Pattern Service - Layer 3 of TCI
 *
 * Uses GPT-5 (OpenAI) to match code against known bug patterns.
 *
 * Why GPT-5?
 * - Trained on millions of GitHub repositories
 * - Has seen this exact pattern thousands of times
 * - Knows common bugs associated with specific patterns
 * - Excellent at pattern matching and similarity detection
 * - Can cite best practices from popular libraries
 *
 * Flow:
 * 1. Receives: Code + Project context
 * 2. GPT-5 analyzes code patterns
 * 3. Matches against known bug patterns from training data
 * 4. Returns: Similar patterns + common bugs + best practices
 *
 * Target time: 3-4 seconds
 */

import OpenAI from 'openai';
import type {
  HistoricalInsights,
  SimilarPattern,
  ProjectContext,
} from '../../types/tci';

export class HistoricalPatternService {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    });
  }

  /**
   * Analyze code and match against historical patterns
   */
  async analyzePatterns(
    code: string,
    context: ProjectContext
  ): Promise<HistoricalInsights> {
    console.log('[TCI Layer 3] Historical pattern analysis starting...');
    const startTime = Date.now();

    // Build historical analysis prompt
    const prompt = this.buildHistoricalPrompt(code, context);

    // Call GPT-5 (or latest GPT model)
    const response = await this.openai.chat.completions.create({
      model: 'gpt-4-turbo-preview', // Will upgrade to GPT-5 when available
      messages: [
        {
          role: 'system',
          content: 'You are an expert code pattern analyzer with deep knowledge of millions of GitHub repositories. You can identify code patterns and match them against known bugs, vulnerabilities, and best practices.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ],
      temperature: 0.2, // Lower for consistent pattern matching
      max_tokens: 4096,
    });

    const content = response.choices[0].message.content;
    if (!content) {
      throw new Error('Empty response from GPT');
    }

    // Parse historical insights
    const insights = this.parseHistoricalResponse(content);

    const timeElapsed = Date.now() - startTime;
    console.log(`  ✅ Historical analysis complete (${timeElapsed}ms)`);
    console.log(`     Patterns found: ${insights.similarPatterns.length}, Confidence: ${(insights.confidence * 100).toFixed(0)}%`);

    return insights;
  }

  /**
   * Build historical analysis prompt for GPT-5
   */
  private buildHistoricalPrompt(code: string, context: ProjectContext): string {
    return `
You are analyzing code to identify PATTERNS you've seen before in millions of repositories.

Your training data includes:
- All of GitHub (public repositories)
- Common bug patterns and how they manifest
- Security vulnerabilities (OWASP, CVEs)
- Performance anti-patterns
- Best practices from popular libraries

═══════════════════════════════════════════════════════════
CODE TO ANALYZE:
═══════════════════════════════════════════════════════════
\`\`\`${context.language}
${code}
\`\`\`

═══════════════════════════════════════════════════════════
PROJECT CONTEXT:
═══════════════════════════════════════════════════════════

Language: ${context.language}
Framework: ${context.framework || 'Unknown'}
Imports: ${context.imports.join(', ') || 'None'}

═══════════════════════════════════════════════════════════
YOUR TASK: PATTERN MATCHING
═══════════════════════════════════════════════════════════

Answer these questions based on your training data:

1. **What pattern does this code match?**
   - "Direct SQL string concatenation"
   - "Unhandled promise rejection"
   - "Race condition in async code"
   - "Memory leak in event listener"
   - etc.

2. **Have you seen this pattern before?**
   - How common is it? (1-10 scale, or percentage)
   - Is it deprecated? Modern? Legacy?
   - What era of programming? (2010s patterns vs 2020s patterns)

3. **What bugs commonly occur with this pattern?**
   - Based on your training data, what ALWAYS goes wrong?
   - What security vulnerabilities are associated with this pattern?
   - What performance issues arise?

4. **What's the best practice alternative?**
   - How should this code be written in ${new Date().getFullYear()}?
   - What do popular libraries (React, Express, Django, etc.) recommend?
   - Link patterns to specific best practices

EXAMPLE OUTPUT FORMAT:

**Pattern Detected:** "Direct SQL string concatenation with user input"

**Frequency:** "Seen in ~2% of repositories (DEPRECATED PATTERN - common in 2010s, rare in modern code)"

**Common Bugs:**
- SQL injection (100% of cases)
- Data corruption from unescaped quotes (60% of cases)
- Performance issues from non-parameterized queries (40% of cases)

**Best Practice:** "Use parameterized queries or ORM. Modern frameworks (Prisma, TypeORM, SQLAlchemy) prevent this by design."

**Similar Patterns You've Seen:**
1. Pattern: "eval() with user input" → Same injection vulnerability
2. Pattern: "innerHTML with user data" → XSS vulnerability
3. Pattern: "os.system() with user input" → Command injection

**Risk Assessment:**
- Vulnerabilities: CRITICAL - SQL injection (99.7% probability based on training data)
- Bugs: Medium - Edge cases with quotes, unicode
- Performance: Low - No major performance impact

RESPOND IN THIS EXACT JSON FORMAT:
{
  "thisCodeMatchesPattern": "Short description of the primary pattern",
  "similarPatterns": [
    {
      "pattern": "Pattern name",
      "frequency": "How often you've seen this (percentage or count)",
      "commonBugs": ["Bug 1", "Bug 2"],
      "bestPractice": "What developers should do instead"
    }
  ],
  "riskAssessment": {
    "bugs": ["Bug 1", "Bug 2"],
    "vulnerabilities": ["Vulnerability 1", "Vulnerability 2"],
    "performance": "Performance risk level: NONE|LOW|MEDIUM|HIGH"
  },
  "confidence": 0.95
}

Be specific. Cite actual patterns from your training data. Use statistics when possible.
`.trim();
  }

  /**
   * Parse GPT's historical response
   */
  private parseHistoricalResponse(response: string): HistoricalInsights {
    try {
      // Try to extract JSON from response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        thisCodeMatchesPattern: parsed.thisCodeMatchesPattern || 'Unknown pattern',
        similarPatterns: parsed.similarPatterns || [],
        riskAssessment: {
          bugs: parsed.riskAssessment?.bugs || [],
          vulnerabilities: parsed.riskAssessment?.vulnerabilities || [],
          performance: parsed.riskAssessment?.performance || 'Unknown',
        },
        confidence: parsed.confidence || 0.5,
      };
    } catch (error) {
      console.error('Failed to parse historical response:', error);

      // Fallback: Try to extract insights from text
      return this.extractInsightsFromText(response);
    }
  }

  /**
   * Extract insights from non-JSON text response
   */
  private extractInsightsFromText(text: string): HistoricalInsights {
    const insights: HistoricalInsights = {
      thisCodeMatchesPattern: 'Pattern detected in text response',
      similarPatterns: [],
      riskAssessment: {
        bugs: [],
        vulnerabilities: [],
        performance: 'Unknown',
      },
      confidence: 0.6,
    };

    // Try to extract pattern name
    const patternMatch = text.match(/Pattern[^:]*:\s*"([^"]+)"/i);
    if (patternMatch) {
      insights.thisCodeMatchesPattern = patternMatch[1];
    }

    // Try to extract vulnerabilities
    const vulnSection = text.match(/vulnerabilit(?:y|ies)[^:]*:([^}]+)/i);
    if (vulnSection) {
      const vulns = vulnSection[1].match(/"([^"]+)"/g);
      if (vulns) {
        insights.riskAssessment.vulnerabilities = vulns.map(v => v.replace(/"/g, ''));
      }
    }

    // Try to extract bugs
    const bugsSection = text.match(/bugs?[^:]*:([^}]+)/i);
    if (bugsSection) {
      const bugs = bugsSection[1].match(/"([^"]+)"/g);
      if (bugs) {
        insights.riskAssessment.bugs = bugs.map(b => b.replace(/"/g, ''));
      }
    }

    return insights;
  }

  /**
   * Check if code matches a specific known vulnerability pattern
   */
  async checkForVulnerability(
    code: string,
    context: ProjectContext,
    vulnerabilityType: string
  ): Promise<{
    matches: boolean;
    confidence: number;
    details: string;
  }> {
    const insights = await this.analyzePatterns(code, context);

    const matchesVulnerability = insights.riskAssessment.vulnerabilities.some(
      (vuln) => vuln.toLowerCase().includes(vulnerabilityType.toLowerCase())
    );

    return {
      matches: matchesVulnerability,
      confidence: insights.confidence,
      details: matchesVulnerability
        ? insights.riskAssessment.vulnerabilities.join(', ')
        : 'No matching vulnerability found',
    };
  }

  /**
   * Get best practice recommendations for code pattern
   */
  async getBestPractices(
    code: string,
    context: ProjectContext
  ): Promise<string[]> {
    const insights = await this.analyzePatterns(code, context);

    return insights.similarPatterns
      .filter((pattern) => pattern.bestPractice)
      .map((pattern) => pattern.bestPractice);
  }
}

export const historicalPatternService = new HistoricalPatternService();

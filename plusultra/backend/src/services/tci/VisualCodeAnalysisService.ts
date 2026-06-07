/**
 * Visual Code Analysis Service - Layer 1 of TCI
 *
 * Uses DeepSeek OCR to analyze rendered code images for visual patterns.
 *
 * Visual Patterns Detected:
 * - ASYMMETRY: Unmatched brackets, inconsistent indentation
 * - DENSITY: Too many nested blocks (high complexity)
 * - COLOR_PATTERN: Syntax highlighting reveals semantic issues
 * - REPETITION: Code duplication
 * - GAPS: Missing error handling or comments
 * - LINE_LENGTH: Readability issues
 */

import axios from 'axios';
import { codeImageRenderer } from './CodeImageRenderer';
import type {
  VisualInsights,
  VisualPattern,
  VisualPatternType,
  ProjectContext,
} from '../../types/tci';

export class VisualCodeAnalysisService {
  private deepseekApiKey: string;

  constructor() {
    this.deepseekApiKey = process.env.DEEPSEEK_API_KEY || '';
  }

  /**
   * Perform visual analysis on code
   */
  async analyzeCode(code: string, context: ProjectContext): Promise<VisualInsights> {
    console.log('[TCI Layer 1] Visual pattern recognition starting...');
    const startTime = Date.now();

    // 1. Render code to image
    console.log('  📸 Rendering code to image...');
    const codeImage = await codeImageRenderer.renderCodeToImage(code, {
      language: context.language,
      theme: 'github',
      fontSize: 14,
      lineNumbers: true,
      width: 1200,
    });

    // 2. Analyze color distribution (for COLOR_PATTERN detection)
    console.log('  🎨 Analyzing color distribution...');
    const colorDistribution = await codeImageRenderer.analyzeColorDistribution(code, {
      language: context.language,
    });

    // 3. Calculate structural metrics
    console.log('  📐 Calculating structural metrics...');
    const structuralMetrics = this.calculateStructuralMetrics(code);

    // 4. Call DeepSeek OCR for visual analysis
    console.log('  🔍 Calling DeepSeek OCR for pattern analysis...');
    const visualPatterns = await this.callDeepSeekVision(
      codeImage.buffer,
      code,
      colorDistribution,
      structuralMetrics
    );

    // 5. Calculate overall code health
    const overallCodeHealth = this.calculateCodeHealth(visualPatterns, structuralMetrics);

    const timeElapsed = Date.now() - startTime;
    console.log(`  ✅ Visual analysis complete (${timeElapsed}ms)`);

    return {
      visualPatterns,
      overallCodeHealth,
      reasoning: this.generateHealthReasoning(visualPatterns, structuralMetrics),
      confidence: this.calculateConfidence(visualPatterns),
    };
  }

  /**
   * Call DeepSeek Vision API for visual pattern analysis
   *
   * DeepSeek analyzes the actual screenshot of rendered code to detect visual patterns
   */
  private async callDeepSeekVision(
    imageBuffer: Buffer,
    code: string,
    colorDistribution: any,
    structuralMetrics: any
  ): Promise<VisualPattern[]> {
    const base64Image = imageBuffer.toString('base64');

    const prompt = `
You are analyzing a screenshot of syntax-highlighted code. Look at the IMAGE and identify VISUAL PATTERNS that indicate potential issues.

CONTEXT (for reference only - analyze the IMAGE):
- Total lines: ${structuralMetrics.totalLines}
- Max indentation depth: ${structuralMetrics.maxIndentationDepth}
- Longest line: ${structuralMetrics.longestLine} characters

VISUAL RED FLAGS TO IDENTIFY IN THE IMAGE:

1. ASYMMETRY (Visual imbalance):
   - Look for unmatched brackets or parentheses
   - Inconsistent indentation (code not lining up)
   - Visual misalignment

2. DENSITY (Visual complexity):
   - Count nested blocks - more than 5 levels deep is HIGH risk
   - Look for dense clusters of colored syntax (lots of if/else)
   - Visual "weight" concentrated in specific areas

3. COLOR_PATTERN (Syntax highlighting reveals issues):
   - Red/pink (strings): Lots of strings in logic = hardcoded values
   - Green (comments): No green in complex sections = undocumented
   - Purple/blue (keywords): Clusters = overly complex conditionals
   - Orange (numbers): Many numbers = magic numbers

4. REPETITION (Duplication):
   - Same visual pattern repeated multiple times
   - Identical indentation + color blocks = copy-paste code

5. GAPS (Missing code):
   - Large whitespace in control flow = missing error handling
   - No try/catch patterns visible

6. LINE_LENGTH (Readability):
   - Lines extending far to the right
   - Code that would require horizontal scrolling

IMPORTANT: You are looking at a SCREENSHOT. Analyze what you VISUALLY SEE, not what you infer from text.

Respond in JSON format ONLY:
{
  "visualPatterns": [
    {
      "type": "ASYMMETRY|DENSITY|COLOR_PATTERN|REPETITION|GAPS|LINE_LENGTH",
      "severity": "HIGH|MEDIUM|LOW",
      "location": "Lines X-Y or area description",
      "description": "What you visually observe in the image",
      "likelyIssue": "What this visual pattern typically indicates"
    }
  ]
}

Only report patterns you ACTUALLY SEE in the image. Be precise and thorough.
`;

    try {
      const response = await axios.post(
        'https://api.deepseek.com/v1/chat/completions',
        {
          model: 'deepseek-chat', // DeepSeek supports vision
          messages: [
            {
              role: 'user',
              content: [
                { type: 'text', text: prompt },
                {
                  type: 'image_url',
                  image_url: {
                    url: `data:image/png;base64,${base64Image}`,
                  },
                },
              ],
            },
          ],
          temperature: 0.3, // Lower temp for consistent analysis
          max_tokens: 2000,
        },
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${this.deepseekApiKey}`,
          },
        }
      );

      const content = response.data.choices[0].message.content;

      // Try to parse JSON response
      try {
        const parsed = JSON.parse(content);
        return parsed.visualPatterns || [];
      } catch (parseError) {
        // If response isn't valid JSON, try to extract patterns from text
        console.warn('DeepSeek returned non-JSON response, attempting to parse...');
        return this.parsePatternFromText(content);
      }
    } catch (error) {
      console.error('DeepSeek vision API error:', error);

      // Fallback: Use structural metrics to generate patterns
      return this.generateFallbackPatterns(structuralMetrics, colorDistribution);
    }
  }

  /**
   * Parse visual patterns from non-JSON text response
   */
  private parsePatternFromText(text: string): VisualPattern[] {
    // Extract patterns from natural language response
    const patterns: VisualPattern[] = [];

    const lines = text.split('\n');
    for (const line of lines) {
      // Look for severity indicators
      if (line.includes('high') || line.includes('HIGH')) {
        // Try to extract pattern info
        const typeMatch = line.match(/ASYMMETRY|DENSITY|COLOR_PATTERN|REPETITION|GAPS|LINE_LENGTH/i);
        if (typeMatch) {
          patterns.push({
            type: typeMatch[0].toUpperCase() as any,
            severity: 'HIGH',
            location: 'Detected in image',
            description: line,
            likelyIssue: 'Extracted from vision analysis',
          });
        }
      }
    }

    return patterns;
  }

  /**
   * Calculate structural metrics from raw code
   */
  private calculateStructuralMetrics(code: string): {
    totalLines: number;
    maxIndentationDepth: number;
    avgIndentationDepth: number;
    longestLine: number;
    emptyLineCount: number;
    bracketBalance: { curly: number; square: number; paren: number };
  } {
    const lines = code.split('\n');

    let maxIndentationDepth = 0;
    let totalIndentation = 0;
    let longestLine = 0;
    let emptyLineCount = 0;

    const bracketBalance = { curly: 0, square: 0, paren: 0 };

    for (const line of lines) {
      // Indentation depth (count leading spaces/tabs)
      const match = line.match(/^(\s+)/);
      const indentationDepth = match ? Math.floor(match[1].length / 2) : 0;

      maxIndentationDepth = Math.max(maxIndentationDepth, indentationDepth);
      totalIndentation += indentationDepth;

      // Longest line
      longestLine = Math.max(longestLine, line.length);

      // Empty lines
      if (line.trim().length === 0) {
        emptyLineCount++;
      }
    }

    // Bracket balance
    bracketBalance.curly = (code.match(/\{/g) || []).length - (code.match(/\}/g) || []).length;
    bracketBalance.square = (code.match(/\[/g) || []).length - (code.match(/\]/g) || []).length;
    bracketBalance.paren = (code.match(/\(/g) || []).length - (code.match(/\)/g) || []).length;

    return {
      totalLines: lines.length,
      maxIndentationDepth,
      avgIndentationDepth: totalIndentation / lines.length,
      longestLine,
      emptyLineCount,
      bracketBalance,
    };
  }

  /**
   * Generate fallback patterns if DeepSeek fails
   */
  private generateFallbackPatterns(
    structuralMetrics: any,
    colorDistribution: any
  ): VisualPattern[] {
    const patterns: VisualPattern[] = [];

    // ASYMMETRY: Check bracket balance
    if (
      structuralMetrics.bracketBalance.curly !== 0 ||
      structuralMetrics.bracketBalance.square !== 0 ||
      structuralMetrics.bracketBalance.paren !== 0
    ) {
      patterns.push({
        type: 'ASYMMETRY',
        severity: 'HIGH',
        location: 'Throughout file',
        description: 'Unmatched brackets detected',
        likelyIssue: 'Syntax error - code will not compile',
      });
    }

    // DENSITY: Check max indentation
    if (structuralMetrics.maxIndentationDepth > 5) {
      patterns.push({
        type: 'DENSITY',
        severity: 'HIGH',
        location: 'Multiple sections',
        description: `${structuralMetrics.maxIndentationDepth} levels of nesting detected`,
        likelyIssue: 'High cyclomatic complexity - difficult to test and maintain',
      });
    }

    // COLOR_PATTERN: Check for excessive strings
    const stringRatio = colorDistribution.red / colorDistribution.total;
    if (stringRatio > 0.3) {
      patterns.push({
        type: 'COLOR_PATTERN',
        severity: 'MEDIUM',
        location: 'Throughout file',
        description: 'High density of string literals (red)',
        likelyIssue: 'Hardcoded values - should use constants or configuration',
      });
    }

    // COLOR_PATTERN: Check for lack of comments
    const commentRatio = colorDistribution.green / colorDistribution.total;
    if (commentRatio < 0.05 && structuralMetrics.totalLines > 50) {
      patterns.push({
        type: 'COLOR_PATTERN',
        severity: 'LOW',
        location: 'Throughout file',
        description: 'Very few comments detected (green)',
        likelyIssue: 'Undocumented code - difficult for others to understand',
      });
    }

    // LINE_LENGTH: Check longest line
    if (structuralMetrics.longestLine > 120) {
      patterns.push({
        type: 'LINE_LENGTH',
        severity: 'LOW',
        location: 'Multiple lines',
        description: `Lines exceeding ${structuralMetrics.longestLine} characters`,
        likelyIssue: 'Readability issues - requires horizontal scrolling',
      });
    }

    return patterns;
  }

  /**
   * Calculate overall code health score (0-10)
   */
  private calculateCodeHealth(
    patterns: VisualPattern[],
    structuralMetrics: any
  ): number {
    let score = 10.0;

    // Deduct points for patterns
    for (const pattern of patterns) {
      if (pattern.severity === 'HIGH') score -= 2.0;
      else if (pattern.severity === 'MEDIUM') score -= 1.0;
      else score -= 0.5;
    }

    // Bonus for good structure
    if (structuralMetrics.maxIndentationDepth <= 3) score += 0.5;
    if (structuralMetrics.longestLine <= 100) score += 0.5;

    return Math.max(0, Math.min(10, score));
  }

  /**
   * Generate reasoning for health score
   */
  private generateHealthReasoning(
    patterns: VisualPattern[],
    structuralMetrics: any
  ): string {
    const issues: string[] = [];

    for (const pattern of patterns) {
      if (pattern.severity === 'HIGH') {
        issues.push(`${pattern.type}: ${pattern.likelyIssue}`);
      }
    }

    if (issues.length === 0) {
      return 'Code structure appears clean with no major visual issues detected.';
    }

    return `Visual analysis identified ${issues.length} concern(s): ${issues.join('; ')}`;
  }

  /**
   * Calculate confidence in analysis (0-1)
   */
  private calculateConfidence(patterns: VisualPattern[]): number {
    // Higher confidence if we found clear patterns
    // Lower confidence if analysis is ambiguous
    if (patterns.length === 0) return 0.6; // Neutral confidence
    if (patterns.some((p) => p.severity === 'HIGH')) return 0.9; // High confidence in issues
    return 0.75; // Medium confidence
  }
}

export const visualCodeAnalysisService = new VisualCodeAnalysisService();

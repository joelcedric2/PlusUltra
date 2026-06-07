/**
 * Confidence Engine - Tier 1 Implementation
 * Calculates AI response confidence through consensus, quality, and speed analysis
 *
 * Models: Claude 4.5 Sonnet, GPT-5, Gemini 2.5 Pro, Grok-2, DeepSeek OCR
 */

import * as math from 'mathjs';

export interface ModelResponse {
  model: 'claude' | 'gpt5' | 'gemini' | 'grok' | 'deepseek';
  content: string;
  selfReportedConfidence?: number; // Model's own confidence assessment (0-1)
  metadata: {
    tokensUsed: number;
    responseTime: number;
    timestamp: Date;
  };
}

export interface CodeQualityBreakdown {
  syntaxValid: boolean;
  hasImports: boolean;
  hasExports: boolean;
  linesOfCode: number;
  complexity: 'low' | 'medium' | 'high';
  hasComments: boolean;
  hasTypes: boolean;
  hasErrorHandling: boolean;
}

export interface ConfidenceScore {
  overall: number; // 0-1 scale
  consensus: number; // How much models agree (0-1)
  quality: number; // Code quality heuristics (0-1)
  speed: number; // Response speed factor (0-1)
  selfAssessment: number; // Average of model self-reported confidence (0-1)
  winner: 'claude' | 'gpt5' | 'gemini' | 'grok' | 'deepseek';
  breakdown: CodeQualityBreakdown;
  decision: 'ship' | 'review' | 'reject';
  reasoning: string;
  modelScores: Array<{
    model: string;
    overall: number;
    quality: number;
    selfConfidence: number;
  }>;
}

export class ConfidenceEngine {

  /**
   * Main confidence calculation entry point
   */
  async calculateConfidence(responses: ModelResponse[]): Promise<ConfidenceScore> {
    if (responses.length === 0) {
      throw new Error('No responses to evaluate');
    }

    // 1. Consensus: Do models agree?
    const consensus = this.calculateConsensus(responses);

    // 2. Quality: Analyze each response
    const qualityScores = responses.map(r => ({
      model: r.model,
      ...this.analyzeCodeQuality(r.content),
    }));

    // 3. Speed: Faster responses indicate higher model confidence
    const speedScores = this.calculateSpeedScores(responses);

    // 4. Self-assessment: Use model's own confidence if provided
    const selfAssessmentScores = responses.map(r => ({
      model: r.model,
      score: r.selfReportedConfidence || 0.5, // Default to 0.5 if not provided
    }));

    // 5. Aggregate scores for each model
    const modelScores = responses.map((r, i) => {
      const qualityScore = qualityScores[i].score;
      const speedScore = speedScores.find(s => s.model === r.model)?.score || 0.5;
      const selfScore = selfAssessmentScores[i].score;

      return {
        model: r.model,
        overall: (
          qualityScore * 0.4 +        // Quality is most important
          consensus * 0.25 +           // Consensus adds confidence
          selfScore * 0.25 +           // Model knows itself best
          speedScore * 0.1             // Speed is minor factor
        ),
        quality: qualityScore,
        selfConfidence: selfScore,
        consensus,
        speed: speedScore,
        breakdown: qualityScores[i].breakdown,
      };
    });

    // 6. Pick winner (highest overall score)
    const winner = modelScores.reduce((best, current) =>
      current.overall > best.overall ? current : best
    );

    const avgSelfAssessment = selfAssessmentScores.reduce((sum, s) => sum + s.score, 0) / selfAssessmentScores.length;

    // 7. Make ship/review/reject decision
    const decision = this.makeDecision(winner.overall, consensus, winner.quality);

    return {
      overall: winner.overall,
      consensus,
      quality: winner.quality,
      speed: winner.speed,
      selfAssessment: avgSelfAssessment,
      winner: winner.model,
      breakdown: winner.breakdown,
      decision: decision.decision,
      reasoning: decision.reasoning,
      modelScores: modelScores.map(m => ({
        model: m.model,
        overall: m.overall,
        quality: m.quality,
        selfConfidence: m.selfConfidence,
      })),
    };
  }

  /**
   * Calculate consensus using cosine similarity between responses
   *
   * IMPORTANT: This penalizes >95% agreement as potential groupthink.
   * Sweet spot: 70-90% similarity indicates healthy consensus with diversity.
   *
   * Scoring:
   * - < 60%: Low consensus (0.4) - too much disagreement
   * - 60-70%: Moderate (0.6) - some disagreement
   * - 70-85%: SWEET SPOT (1.0) - healthy consensus
   * - 85-95%: Good (0.9) - strong agreement
   * - > 95%: SUSPICIOUS (0.5) - potential groupthink or trivial task
   */
  private calculateConsensus(responses: ModelResponse[]): number {
    if (responses.length < 2) return 1.0; // Single model = perfect "consensus"

    const embeddings = responses.map(r => this.getSimpleEmbedding(r.content));
    const similarities: number[] = [];

    // Compare each pair of responses
    for (let i = 0; i < embeddings.length; i++) {
      for (let j = i + 1; j < embeddings.length; j++) {
        const similarity = this.cosineSimilarity(embeddings[i], embeddings[j]);
        similarities.push(similarity);
      }
    }

    // Raw average similarity
    const rawSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;

    // Apply groupthink penalty and sweet spot boost
    return this.applyGroupthinkPenalty(rawSimilarity);
  }

  /**
   * Apply groupthink penalty to raw similarity
   * Penalizes >95% agreement, rewards 70-85% sweet spot
   */
  private applyGroupthinkPenalty(rawSimilarity: number): number {
    // >95% similarity = suspicious (groupthink or trivial task)
    if (rawSimilarity > 0.95) {
      console.warn(`⚠️  [Groupthink Warning] ${(rawSimilarity * 100).toFixed(1)}% similarity detected`);
      return 0.5; // Penalize heavily
    }

    // 85-95% similarity = strong agreement (good but slightly risky)
    if (rawSimilarity > 0.85) {
      return 0.9;
    }

    // 70-85% similarity = SWEET SPOT (healthy consensus with diversity)
    if (rawSimilarity >= 0.70) {
      return 1.0; // Full confidence
    }

    // 60-70% similarity = moderate consensus
    if (rawSimilarity >= 0.60) {
      return 0.8;
    }

    // <60% similarity = too much disagreement
    return 0.6;
  }

  /**
   * Simple TF-IDF embedding for text similarity
   */
  private getSimpleEmbedding(text: string): number[] {
    const words = text.toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove punctuation
      .split(/\s+/)
      .filter(w => w.length > 2); // Filter short words

    const wordFreq = new Map<string, number>();
    words.forEach(word => {
      wordFreq.set(word, (wordFreq.get(word) || 0) + 1);
    });

    // Get top 100 words by frequency
    const vocab = Array.from(wordFreq.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 100)
      .map(([word]) => word);

    // Create frequency vector
    return vocab.map(word => wordFreq.get(word) || 0);
  }

  /**
   * Calculate cosine similarity between two vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length === 0 || b.length === 0) return 0;

    // Ensure same length
    const maxLen = Math.max(a.length, b.length);
    const vecA = [...a, ...Array(maxLen - a.length).fill(0)];
    const vecB = [...b, ...Array(maxLen - b.length).fill(0)];

    const dotProduct = vecA.reduce((sum, val, i) => sum + val * vecB[i], 0);
    const magnitudeA = Math.sqrt(vecA.reduce((sum, val) => sum + val * val, 0));
    const magnitudeB = Math.sqrt(vecB.reduce((sum, val) => sum + val * val, 0));

    if (magnitudeA === 0 || magnitudeB === 0) return 0;

    return dotProduct / (magnitudeA * magnitudeB);
  }

  /**
   * Analyze code quality with static heuristics
   */
  private analyzeCodeQuality(code: string): {
    score: number;
    breakdown: CodeQualityBreakdown;
  } {
    const breakdown: CodeQualityBreakdown = {
      syntaxValid: this.checkSyntaxValidity(code),
      hasImports: /import .+ from ['"]/.test(code),
      hasExports: /export (default|const|function|class|interface|type)/.test(code),
      linesOfCode: this.countLOC(code),
      complexity: this.estimateComplexity(code),
      hasComments: /\/\/|\/\*|\*\//.test(code),
      hasTypes: /:\s*(string|number|boolean|any|void|\{)/.test(code),
      hasErrorHandling: /try|catch|throw|\.catch\(|Promise\.reject/.test(code),
    };

    // Calculate score (0-1)
    let score = 0;
    score += breakdown.syntaxValid ? 0.3 : 0;
    score += breakdown.hasImports ? 0.1 : 0;
    score += breakdown.hasExports ? 0.1 : 0;
    score += Math.min(breakdown.linesOfCode / 100, 1) * 0.15; // Reasonable length
    score += breakdown.hasComments ? 0.1 : 0;
    score += breakdown.hasTypes ? 0.15 : 0;
    score += breakdown.hasErrorHandling ? 0.1 : 0;

    return { score, breakdown };
  }

  /**
   * Check if code has valid syntax (basic heuristics)
   */
  private checkSyntaxValidity(code: string): boolean {
    // Basic checks for common errors
    const hasMatchingBraces = this.checkMatchingPairs(code, '{', '}');
    const hasMatchingParens = this.checkMatchingPairs(code, '(', ')');
    const hasMatchingBrackets = this.checkMatchingPairs(code, '[', ']');
    const noUndefinedErrors = !code.includes('undefined is not') &&
                              !code.includes('Error:') &&
                              !code.includes('SyntaxError');
    const hasValidStructure = code.trim().length > 10;

    return hasMatchingBraces && hasMatchingParens && hasMatchingBrackets &&
           noUndefinedErrors && hasValidStructure;
  }

  /**
   * Check if opening and closing pairs match
   */
  private checkMatchingPairs(code: string, open: string, close: string): boolean {
    let count = 0;
    for (const char of code) {
      if (char === open) count++;
      if (char === close) count--;
      if (count < 0) return false; // Closing before opening
    }
    return count === 0; // All opened pairs are closed
  }

  /**
   * Count lines of code (excluding comments and whitespace)
   */
  private countLOC(code: string): number {
    return code.split('\n').filter(line => {
      const trimmed = line.trim();
      return trimmed.length > 0 &&
             !trimmed.startsWith('//') &&
             !trimmed.startsWith('/*') &&
             !trimmed.startsWith('*');
    }).length;
  }

  /**
   * Estimate cyclomatic complexity
   */
  private estimateComplexity(code: string): 'low' | 'medium' | 'high' {
    const complexityIndicators = [
      /if\s*\(/g,
      /for\s*\(/g,
      /while\s*\(/g,
      /case\s+/g,
      /&&/g,
      /\|\|/g,
      /\?/g, // Ternary
    ];

    const complexityScore = complexityIndicators.reduce((sum, pattern) => {
      return sum + (code.match(pattern)?.length || 0);
    }, 0);

    return complexityScore < 5 ? 'low' :
           complexityScore < 15 ? 'medium' : 'high';
  }

  /**
   * Calculate speed-based confidence scores
   */
  private calculateSpeedScores(responses: ModelResponse[]): Array<{
    model: string;
    score: number;
  }> {
    const avgResponseTime = responses.reduce((sum, r) =>
      sum + r.metadata.responseTime, 0) / responses.length;

    return responses.map(r => ({
      model: r.model,
      // Faster = more confident (up to 2x average time)
      score: Math.max(0, Math.min(1, 1 - ((r.metadata.responseTime - avgResponseTime) / (avgResponseTime * 2))))
    }));
  }

  /**
   * Decide whether to ship, review, or reject based on confidence
   */
  private makeDecision(
    overall: number,
    consensus: number,
    quality: number
  ): {
    decision: 'ship' | 'review' | 'reject';
    reasoning: string;
  } {
    // High confidence: Auto-ship
    if (overall >= 0.85 && consensus >= 0.75) {
      return {
        decision: 'ship',
        reasoning: 'High confidence across all metrics - safe to deploy'
      };
    }

    // Good consensus but lower overall: Needs review
    if (consensus >= 0.8 && overall >= 0.7) {
      return {
        decision: 'review',
        reasoning: 'Models agree but code quality needs verification'
      };
    }

    // Low consensus: Models disagree, dangerous
    if (consensus < 0.6) {
      return {
        decision: 'reject',
        reasoning: 'Models disagree significantly - prompt may be ambiguous'
      };
    }

    // Poor code quality
    if (quality < 0.5) {
      return {
        decision: 'reject',
        reasoning: 'Code quality issues detected - syntax errors or incomplete structure'
      };
    }

    // Medium confidence: Show to user, let them decide
    if (overall >= 0.6) {
      return {
        decision: 'review',
        reasoning: 'Moderate confidence - review recommended before shipping'
      };
    }

    // Low confidence: Don't ship
    return {
      decision: 'reject',
      reasoning: 'Low confidence - regenerate with clearer requirements'
    };
  }

  /**
   * Extract self-reported confidence from model response
   * Models can include confidence in their response like:
   * "Confidence: 0.92" or "I am 92% confident"
   */
  extractSelfReportedConfidence(response: string): number | undefined {
    // Look for explicit confidence statements
    const patterns = [
      /confidence:\s*(\d+\.?\d*)/i,
      /(\d+)%\s*confident/i,
      /confidence\s*=\s*(\d+\.?\d*)/i,
      /confidence\s*:\s*(\d+\.?\d*)/i,
    ];

    for (const pattern of patterns) {
      const match = response.match(pattern);
      if (match) {
        const value = parseFloat(match[1]);
        // Normalize to 0-1 scale
        return value > 1 ? value / 100 : value;
      }
    }

    return undefined; // No explicit confidence found
  }
}

export const confidenceEngine = new ConfidenceEngine();

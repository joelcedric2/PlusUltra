/**
 * Claude Blind Scoring Service
 *
 * Implements blind scoring system where Claude acts as the judge
 * without seeing other models' scores to prevent score manipulation.
 *
 * Key Features:
 * - Claude generates confidence score independently
 * - Minimum 90% accuracy threshold for auto-approval
 * - Uses TCI historical embeddings for context
 * - Reveals other scores only after Claude's judgment
 * - Prevents quarantine avoidance bias
 */

import Anthropic from '@anthropic-ai/sdk';

export interface BlindScoringContext {
  codeGenerated: string;
  intent: string;
  targetFile?: string;
  environment?: string;
  historicalContext?: HistoricalContext;
  projectId?: string;
}

export interface HistoricalContext {
  similarChanges: SimilarChange[];
  commitHistory: CommitSummary[];
  codePatterns: CodePattern[];
  projectEmbeddings: number[][];
}

export interface SimilarChange {
  changeId: string;
  description: string;
  timestamp: Date;
  outcome: 'success' | 'failure' | 'quarantined';
  similarityScore: number;
}

export interface CommitSummary {
  hash: string;
  message: string;
  timestamp: Date;
  filesChanged: string[];
  linesAdded: number;
  linesRemoved: number;
}

export interface CodePattern {
  pattern: string;
  frequency: number;
  context: string;
  successRate: number;
}

export interface ClaudeJudgment {
  confidenceScore: number; // 0-100
  reasoning: string;
  riskFactors: string[];
  qualityAssessment: {
    correctness: number; // 0-100
    security: number; // 0-100
    maintainability: number; // 0-100
    performance: number; // 0-100
  };
  approved: boolean; // true if >= 90%
  suggestedImprovements?: string[];
  historicalAlignment: number; // How well it aligns with project patterns
}

export interface ConsensusResult {
  claudeJudgment: ClaudeJudgment;
  otherScores: ModelScore[];
  finalDecision: 'approved' | 'quarantined' | 'needs_review';
  consensusScore: number; // 0-1
  explanation: string;
}

export interface ModelScore {
  model: string;
  score: number;
  confidence: number;
  reasoning?: string;
}

export class ClaudeBlindScoringService {
  private anthropic: Anthropic;
  private readonly CONFIDENCE_THRESHOLD = 90; // 90% minimum for auto-approval

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Step 1: Claude judges code WITHOUT seeing other scores
   * This prevents bias and ensures independent evaluation
   */
  async blindJudgment(context: BlindScoringContext): Promise<ClaudeJudgment> {
    const prompt = this.buildBlindJudgmentPrompt(context);

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2048,
        temperature: 0.1, // Low temperature for consistent judging
        system: this.getJudgeSystemPrompt(),
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

      const judgment = this.parseClaudeResponse(content.text);

      // Validate confidence score is present and Claude didn't see other scores
      if (!judgment.confidenceScore || judgment.confidenceScore < 0 || judgment.confidenceScore > 100) {
        throw new Error('Invalid confidence score from Claude');
      }

      return judgment;
    } catch (error) {
      console.error('Claude blind judgment failed:', error);
      throw error;
    }
  }

  /**
   * Step 2: After Claude's judgment, reveal other scores and determine consensus
   */
  async determineConsensus(
    claudeJudgment: ClaudeJudgment,
    otherScores: ModelScore[],
    context: BlindScoringContext
  ): Promise<ConsensusResult> {
    // Now that Claude has judged, we can compare with other models
    const consensusScore = this.calculateConsensusScore(claudeJudgment, otherScores);

    let finalDecision: 'approved' | 'quarantined' | 'needs_review';
    let explanation: string;

    // Decision logic
    if (claudeJudgment.confidenceScore >= this.CONFIDENCE_THRESHOLD) {
      // Claude approved with high confidence
      if (consensusScore >= 0.7) {
        finalDecision = 'approved';
        explanation = `Claude approved with ${claudeJudgment.confidenceScore}% confidence, aligned with consensus (${Math.round(consensusScore * 100)}%)`;
      } else {
        finalDecision = 'needs_review';
        explanation = `Claude approved (${claudeJudgment.confidenceScore}%), but low consensus with other models (${Math.round(consensusScore * 100)}%). Manual review recommended.`;
      }
    } else {
      // Claude's confidence is below threshold
      if (claudeJudgment.confidenceScore < 50) {
        finalDecision = 'quarantined';
        explanation = `Low confidence from Claude (${claudeJudgment.confidenceScore}%). Quarantined for review.`;
      } else {
        finalDecision = 'needs_review';
        explanation = `Moderate confidence from Claude (${claudeJudgment.confidenceScore}%). Manual review required.`;
      }
    }

    return {
      claudeJudgment,
      otherScores,
      finalDecision,
      consensusScore,
      explanation,
    };
  }

  /**
   * Complete blind scoring workflow
   * 1. Other models generate code and scores (without Claude)
   * 2. Claude judges blindly
   * 3. Consensus determined
   */
  async completeBlindScoring(
    context: BlindScoringContext,
    otherScores: ModelScore[]
  ): Promise<ConsensusResult> {
    // Step 1: Claude judges without seeing other scores
    const claudeJudgment = await this.blindJudgment(context);

    // Step 2: Determine consensus now that Claude has committed to a score
    const consensus = await this.determineConsensus(
      claudeJudgment,
      otherScores,
      context
    );

    return consensus;
  }

  /**
   * Build prompt for Claude's blind judgment
   * Includes historical context from TCI but NO other model scores
   */
  private buildBlindJudgmentPrompt(context: BlindScoringContext): string {
    let prompt = `You are the final judge evaluating AI-generated code. Your task is to provide an independent, unbiased assessment without seeing any other models' scores.

**CODE TO EVALUATE:**
\`\`\`
${context.codeGenerated}
\`\`\`

**INTENT:** ${context.intent}
${context.targetFile ? `**TARGET FILE:** ${context.targetFile}` : ''}
${context.environment ? `**ENVIRONMENT:** ${context.environment}` : ''}

`;

    // Add historical context from TCI (WITHOUT other models' current scores)
    if (context.historicalContext) {
      const { historicalContext } = context;

      if (historicalContext.similarChanges.length > 0) {
        prompt += `\n**PROJECT HISTORY - Similar Changes:**\n`;
        historicalContext.similarChanges.slice(0, 3).forEach((change, idx) => {
          prompt += `${idx + 1}. ${change.description} (${change.outcome}, similarity: ${(change.similarityScore * 100).toFixed(1)}%)\n`;
        });
      }

      if (historicalContext.codePatterns.length > 0) {
        prompt += `\n**PROJECT PATTERNS:**\n`;
        historicalContext.codePatterns.slice(0, 5).forEach((pattern, idx) => {
          prompt += `${idx + 1}. ${pattern.pattern} (used ${pattern.frequency} times, ${(pattern.successRate * 100).toFixed(1)}% success rate)\n`;
        });
      }

      if (historicalContext.commitHistory.length > 0) {
        prompt += `\n**RECENT COMMITS:**\n`;
        historicalContext.commitHistory.slice(0, 3).forEach((commit, idx) => {
          prompt += `${idx + 1}. ${commit.message} (${commit.filesChanged.length} files, +${commit.linesAdded}/-${commit.linesRemoved})\n`;
        });
      }
    }

    prompt += `
**YOUR TASK:**
Evaluate this code and provide:
1. **Confidence Score** (0-100): Your confidence that this code is correct, secure, and production-ready
2. **Quality Assessment** (0-100 for each):
   - Correctness: Does it implement the intent correctly?
   - Security: Are there any security vulnerabilities?
   - Maintainability: Is it clean, readable, and maintainable?
   - Performance: Is it efficient?
3. **Risk Factors**: List any concerns or issues
4. **Reasoning**: Explain your confidence score
5. **Historical Alignment** (0-100): How well does this align with the project's patterns and history?
6. **Suggested Improvements**: If any

**IMPORTANT:**
- You must score independently without seeing other models' evaluations
- Be objective and thorough
- A score >= 90% means you're confident enough to auto-approve for production
- Scores 50-89% require manual review
- Scores < 50% should be quarantined

Respond in this exact JSON format:
{
  "confidenceScore": <number 0-100>,
  "reasoning": "<your reasoning>",
  "riskFactors": ["<factor1>", "<factor2>", ...],
  "qualityAssessment": {
    "correctness": <number 0-100>,
    "security": <number 0-100>,
    "maintainability": <number 0-100>,
    "performance": <number 0-100>
  },
  "historicalAlignment": <number 0-100>,
  "suggestedImprovements": ["<improvement1>", "<improvement2>", ...]
}
`;

    return prompt;
  }

  /**
   * System prompt for Claude as judge
   */
  private getJudgeSystemPrompt(): string {
    return `You are an expert code reviewer and judge with deep knowledge of:
- Software architecture and design patterns
- Security best practices (OWASP Top 10, secure coding)
- Code quality and maintainability principles
- Performance optimization
- Testing and reliability

Your role is to provide independent, unbiased assessments of AI-generated code. You must:
1. Score without seeing other models' evaluations (blind scoring)
2. Be honest about confidence - it's better to flag uncertainty than approve bad code
3. Consider the project's historical context and patterns
4. Provide constructive, actionable feedback
5. Never inflate scores to avoid quarantine
6. Use the 90% threshold seriously - only approve code you're very confident in

You are the final authority on code quality and safety.`;
  }

  /**
   * Parse Claude's JSON response
   */
  private parseClaudeResponse(responseText: string): ClaudeJudgment {
    try {
      // Extract JSON from response (Claude might wrap it in markdown)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in Claude response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Calculate average quality score
      const avgQuality = Object.values(parsed.qualityAssessment as Record<string, number>)
        .reduce((a, b) => a + b, 0) / 4;

      return {
        confidenceScore: parsed.confidenceScore,
        reasoning: parsed.reasoning,
        riskFactors: parsed.riskFactors || [],
        qualityAssessment: parsed.qualityAssessment,
        approved: parsed.confidenceScore >= this.CONFIDENCE_THRESHOLD,
        suggestedImprovements: parsed.suggestedImprovements || [],
        historicalAlignment: parsed.historicalAlignment || 0,
      };
    } catch (error) {
      console.error('Failed to parse Claude response:', error);
      throw new Error('Invalid response format from Claude');
    }
  }

  /**
   * Calculate consensus score between Claude and other models
   */
  private calculateConsensusScore(
    claudeJudgment: ClaudeJudgment,
    otherScores: ModelScore[]
  ): number {
    if (otherScores.length === 0) {
      return 1.0; // If Claude is the only judge, full consensus
    }

    // Normalize Claude's score to 0-1
    const claudeNormalized = claudeJudgment.confidenceScore / 100;

    // Calculate average agreement with other models
    const agreements = otherScores.map((modelScore) => {
      const modelNormalized = modelScore.score / 100;
      const diff = Math.abs(claudeNormalized - modelNormalized);
      return 1 - diff; // Convert difference to agreement (0-1)
    });

    const avgAgreement = agreements.reduce((a, b) => a + b, 0) / agreements.length;

    return avgAgreement;
  }

  /**
   * Get confidence threshold
   */
  getConfidenceThreshold(): number {
    return this.CONFIDENCE_THRESHOLD;
  }

  /**
   * Update confidence threshold (for testing or customization)
   */
  setConfidenceThreshold(threshold: number): void {
    if (threshold < 0 || threshold > 100) {
      throw new Error('Confidence threshold must be between 0 and 100');
    }
    (this as any).CONFIDENCE_THRESHOLD = threshold;
  }
}

export default ClaudeBlindScoringService;

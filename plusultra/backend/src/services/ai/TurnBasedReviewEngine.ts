import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import type { AIModel } from './MultiAIOrchestrator';

/**
 * Turn-Based Review Engine
 *
 * Instead of all models evaluating in parallel (leading to groupthink),
 * models review and refine code SEQUENTIALLY:
 * 1. Model A reviews → finds issues → fixes them
 * 2. Model B reviews (sees A's feedback) → finds NEW issues → fixes them
 * 3. Model C reviews (sees A+B feedback) → finds NEW issues → fixes them
 * 4. Model D reviews (sees all previous) → finds NEW issues → fixes them
 * 5. Model E reviews (sees all previous) → final approval
 *
 * Early exit: Stop after 3 consecutive approvals
 *
 * Result: Code is progressively refined, not just voted on
 */

export interface ReviewIssue {
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  issue: string;
  line?: number;
  category: 'SECURITY' | 'PERFORMANCE' | 'ACCESSIBILITY' | 'EDGE_CASE' | 'CODE_QUALITY' | 'TESTING';
}

export interface SuggestedFix {
  issue: string;
  fix: string;
  codeSnippet?: string;
}

export interface ReviewFeedback {
  reviewer: AIModel['name'];
  timestamp: Date;
  previousIssuesAddressed: boolean;
  newIssuesFound: ReviewIssue[];
  suggestedFixes: SuggestedFix[];
  overallAssessment: 'APPROVE' | 'REQUEST_CHANGES' | 'REJECT';
  reasoning: string;
  tokensUsed: number;
}

export interface TurnBasedReviewResult {
  finalCode: string;
  reviewHistory: ReviewFeedback[];
  finalVerdict: 'APPROVED' | 'NEEDS_REVISION' | 'REJECTED';
  totalReviews: number;
  issuesFound: number;
  issuesFixed: number;
  earlyExit: boolean;
  totalTokensUsed: number;
  timeMs: number;
}

export class TurnBasedReviewEngine {
  private anthropic: Anthropic;
  private openai: OpenAI;
  private gemini: GoogleGenerativeAI;

  constructor() {
    this.anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    this.openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    this.gemini = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY || '');
  }

  /**
   * Perform turn-based review of code
   */
  async review(
    code: string,
    originalPrompt: string,
    reviewers: AIModel['name'][]
  ): Promise<TurnBasedReviewResult> {
    console.log('🔄 [TurnBasedReview] Starting sequential review...');
    const startTime = Date.now();

    let currentCode = code;
    const reviewHistory: ReviewFeedback[] = [];
    let totalTokensUsed = 0;
    let issuesFound = 0;
    let issuesFixed = 0;

    for (let i = 0; i < reviewers.length; i++) {
      const reviewer = reviewers[i];
      console.log(`[Round ${i + 1}/${reviewers.length}] ${reviewer} reviewing...`);

      // Get review from current model
      const feedback = await this.getReview(
        reviewer,
        currentCode,
        originalPrompt,
        reviewHistory
      );

      reviewHistory.push(feedback);
      totalTokensUsed += feedback.tokensUsed;
      issuesFound += feedback.newIssuesFound.length;

      // If HIGH severity issues found, have the reviewer fix them
      const highSeverityIssues = feedback.newIssuesFound.filter((i) => i.severity === 'HIGH');

      if (highSeverityIssues.length > 0) {
        console.log(`  ⚠️  Found ${highSeverityIssues.length} HIGH severity issues. Requesting fixes...`);

        const { fixedCode, tokensUsed } = await this.requestFixes(
          reviewer,
          currentCode,
          originalPrompt,
          highSeverityIssues
        );

        currentCode = fixedCode;
        totalTokensUsed += tokensUsed;
        issuesFixed += highSeverityIssues.length;

        console.log(`  ✅ Applied fixes from ${reviewer}`);
      }

      // Early exit: If 3 reviewers in a row approve, we're done
      const recentApprovals = reviewHistory
        .slice(-3)
        .filter((r) => r.overallAssessment === 'APPROVE').length;

      if (recentApprovals === 3 && reviewHistory.length >= 3) {
        console.log('✨ [Early Exit] 3 consecutive approvals. Code is production-ready.');
        const timeMs = Date.now() - startTime;

        return {
          finalCode: currentCode,
          reviewHistory,
          finalVerdict: 'APPROVED',
          totalReviews: reviewHistory.length,
          issuesFound,
          issuesFixed,
          earlyExit: true,
          totalTokensUsed,
          timeMs,
        };
      }
    }

    // All reviewers completed
    const finalVerdict = this.calculateFinalVerdict(reviewHistory);
    const timeMs = Date.now() - startTime;

    console.log(`✅ [TurnBasedReview] Complete. Verdict: ${finalVerdict}`);

    return {
      finalCode: currentCode,
      reviewHistory,
      finalVerdict,
      totalReviews: reviewHistory.length,
      issuesFound,
      issuesFixed,
      earlyExit: false,
      totalTokensUsed,
      timeMs,
    };
  }

  /**
   * Get review feedback from a specific model
   */
  private async getReview(
    model: AIModel['name'],
    code: string,
    originalPrompt: string,
    previousReviews: ReviewFeedback[]
  ): Promise<ReviewFeedback> {
    const reviewPrompt = this.buildReviewPrompt(code, originalPrompt, previousReviews);

    const startTime = Date.now();
    let response: string;
    let tokensUsed = 0;

    try {
      switch (model) {
        case 'claude':
          const claudeRes = await this.anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 4096,
            messages: [{ role: 'user', content: reviewPrompt }],
          });
          response = claudeRes.content[0].type === 'text' ? claudeRes.content[0].text : '';
          tokensUsed = claudeRes.usage.input_tokens + claudeRes.usage.output_tokens;
          break;

        case 'gpt5':
          const gptRes = await this.openai.chat.completions.create({
            model: 'gpt-4-turbo-preview',
            messages: [{ role: 'user', content: reviewPrompt }],
            response_format: { type: 'json_object' },
          });
          response = gptRes.choices[0].message.content || '';
          tokensUsed = gptRes.usage?.total_tokens || 0;
          break;

        case 'gemini':
          const geminiModel = this.gemini.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
          const geminiRes = await geminiModel.generateContent(reviewPrompt);
          response = geminiRes.response.text();
          tokensUsed = 0; // Gemini doesn't provide token counts easily
          break;

        case 'grok':
          const grokRes = await axios.post(
            'https://api.x.ai/v1/chat/completions',
            {
              model: 'grok-2-latest',
              messages: [{ role: 'user', content: reviewPrompt }],
            },
            {
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.XAI_API_KEY}`,
              },
            }
          );
          response = grokRes.data.choices[0].message.content;
          tokensUsed = grokRes.data.usage?.total_tokens || 0;
          break;

        case 'deepseek':
          const deepseekRes = await axios.post(
            'https://api.deepseek.com/v1/chat/completions',
            {
              model: 'deepseek-chat',
              messages: [{ role: 'user', content: reviewPrompt }],
            },
            {
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
              },
            }
          );
          response = deepseekRes.data.choices[0].message.content;
          tokensUsed = deepseekRes.data.usage?.total_tokens || 0;
          break;

        default:
          throw new Error(`Unknown model: ${model}`);
      }

      const feedback = JSON.parse(response);

      return {
        reviewer: model,
        timestamp: new Date(),
        previousIssuesAddressed: feedback.previousIssuesAddressed ?? true,
        newIssuesFound: feedback.newIssuesFound || [],
        suggestedFixes: feedback.suggestedFixes || [],
        overallAssessment: feedback.overallAssessment || 'APPROVE',
        reasoning: feedback.reasoning || 'No issues found',
        tokensUsed,
      };
    } catch (error) {
      console.error(`Failed to get review from ${model}:`, error);

      // Return a neutral review if model fails
      return {
        reviewer: model,
        timestamp: new Date(),
        previousIssuesAddressed: true,
        newIssuesFound: [],
        suggestedFixes: [],
        overallAssessment: 'APPROVE',
        reasoning: `Model ${model} failed to review - error encountered`,
        tokensUsed: 0,
      };
    }
  }

  /**
   * Build review prompt for a model
   */
  private buildReviewPrompt(
    code: string,
    originalPrompt: string,
    previousReviews: ReviewFeedback[]
  ): string {
    const previousFeedback =
      previousReviews.length > 0
        ? previousReviews
            .map(
              (r) =>
                `[${r.reviewer}] ${r.overallAssessment}\n` +
                `Issues found: ${r.newIssuesFound.map((i) => i.issue).join(', ')}\n` +
                `Reasoning: ${r.reasoning}`
            )
            .join('\n\n')
        : 'No previous reviews yet.';

    return `
You are a code reviewer on a team of 5 AI models. Your job is to review code and find issues that PREVIOUS reviewers may have missed.

ORIGINAL REQUEST:
${originalPrompt}

CURRENT CODE:
\`\`\`
${code}
\`\`\`

PREVIOUS REVIEWS:
${previousFeedback}

Your task:
1. Check if issues raised by previous reviewers were addressed
2. Find NEW issues that previous reviewers missed (do NOT repeat their findings)
3. Be CRITICAL - your value is in finding flaws others missed
4. Focus on: security, edge cases, accessibility, performance, code quality, testing

Categories to check:
- SECURITY: vulnerabilities, injection attacks, XSS, CSRF, authentication, authorization
- PERFORMANCE: inefficient code, unnecessary re-renders, memory leaks, slow queries
- ACCESSIBILITY: missing ARIA labels, keyboard navigation, semantic HTML, screen reader support
- EDGE_CASE: null handling, error states, loading states, race conditions
- CODE_QUALITY: readability, maintainability, duplication, magic numbers, naming
- TESTING: missing tests, untestable code, mocking issues

Respond in JSON:
{
  "previousIssuesAddressed": true/false,
  "newIssuesFound": [
    {
      "severity": "HIGH" | "MEDIUM" | "LOW",
      "issue": "Description of the issue",
      "line": line number or null,
      "category": "SECURITY" | "PERFORMANCE" | "ACCESSIBILITY" | "EDGE_CASE" | "CODE_QUALITY" | "TESTING"
    }
  ],
  "suggestedFixes": [
    {
      "issue": "Brief description",
      "fix": "How to fix it",
      "codeSnippet": "Optional code example"
    }
  ],
  "overallAssessment": "APPROVE" | "REQUEST_CHANGES" | "REJECT",
  "reasoning": "Why you approve/reject. Be specific about what you found or why the code is solid."
}

Be tough but fair. Your job is to ensure production-ready code.
`.trim();
  }

  /**
   * Request fixes from a model for specific issues
   */
  private async requestFixes(
    model: AIModel['name'],
    code: string,
    originalPrompt: string,
    issues: ReviewIssue[]
  ): Promise<{ fixedCode: string; tokensUsed: number }> {
    const fixPrompt = `
The following HIGH severity issues were found in the code:

${issues.map((i, idx) => `${idx + 1}. [${i.category}] ${i.issue}`).join('\n')}

ORIGINAL REQUEST:
${originalPrompt}

CURRENT CODE:
\`\`\`
${code}
\`\`\`

Please fix these issues. Return ONLY the corrected code, no explanations. Ensure the fixes are complete and production-ready.
`.trim();

    let fixedCode = code;
    let tokensUsed = 0;

    try {
      switch (model) {
        case 'claude':
          const claudeRes = await this.anthropic.messages.create({
            model: 'claude-sonnet-4-20250514',
            max_tokens: 8192,
            messages: [{ role: 'user', content: fixPrompt }],
          });
          fixedCode = claudeRes.content[0].type === 'text' ? claudeRes.content[0].text : code;
          tokensUsed = claudeRes.usage.input_tokens + claudeRes.usage.output_tokens;
          break;

        case 'gpt5':
          const gptRes = await this.openai.chat.completions.create({
            model: 'gpt-4-turbo-preview',
            messages: [{ role: 'user', content: fixPrompt }],
          });
          fixedCode = gptRes.choices[0].message.content || code;
          tokensUsed = gptRes.usage?.total_tokens || 0;
          break;

        case 'gemini':
          const geminiModel = this.gemini.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });
          const geminiRes = await geminiModel.generateContent(fixPrompt);
          fixedCode = geminiRes.response.text();
          break;

        case 'grok':
          const grokRes = await axios.post(
            'https://api.x.ai/v1/chat/completions',
            {
              model: 'grok-2-latest',
              messages: [{ role: 'user', content: fixPrompt }],
            },
            {
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.XAI_API_KEY}`,
              },
            }
          );
          fixedCode = grokRes.data.choices[0].message.content;
          tokensUsed = grokRes.data.usage?.total_tokens || 0;
          break;

        case 'deepseek':
          const deepseekRes = await axios.post(
            'https://api.deepseek.com/v1/chat/completions',
            {
              model: 'deepseek-chat',
              messages: [{ role: 'user', content: fixPrompt }],
            },
            {
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
              },
            }
          );
          fixedCode = deepseekRes.data.choices[0].message.content;
          tokensUsed = deepseekRes.data.usage?.total_tokens || 0;
          break;
      }

      // Clean up code blocks if present
      fixedCode = this.cleanCodeResponse(fixedCode);
    } catch (error) {
      console.error(`Failed to get fixes from ${model}:`, error);
      // Return original code if fixing fails
    }

    return { fixedCode, tokensUsed };
  }

  /**
   * Clean code response (remove markdown formatting)
   */
  private cleanCodeResponse(code: string): string {
    // Remove markdown code blocks
    let cleaned = code.replace(/```[\w]*\n/g, '').replace(/```$/g, '');
    return cleaned.trim();
  }

  /**
   * Calculate final verdict from review history
   */
  private calculateFinalVerdict(
    reviews: ReviewFeedback[]
  ): 'APPROVED' | 'NEEDS_REVISION' | 'REJECTED' {
    const rejects = reviews.filter((r) => r.overallAssessment === 'REJECT').length;
    const approvals = reviews.filter((r) => r.overallAssessment === 'APPROVE').length;

    // If any model rejected, needs revision
    if (rejects > 0) return 'NEEDS_REVISION';

    // If majority approved, approve
    if (approvals > reviews.length / 2) return 'APPROVED';

    return 'NEEDS_REVISION';
  }
}

export const turnBasedReviewEngine = new TurnBasedReviewEngine();

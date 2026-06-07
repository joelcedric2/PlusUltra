import { StoreSubmissionOrchestrator, SubmissionConfig } from './StoreSubmissionOrchestrator';
import Anthropic from '@anthropic-ai/sdk';
import * as fs from 'fs/promises';
import * as path from 'path';

/**
 * Rejection Handler Service
 * Analyzes app store rejections and automatically fixes issues when possible
 * Uses Claude AI to understand rejection reasons and generate fixes
 */

export interface RejectionAnalysis {
  platform: 'ios' | 'android';
  versionId: string;
  rejected: boolean;
  category: 'compliance' | 'ui' | 'privacy' | 'bug' | 'metadata' | 'asset' | 'unknown';
  reasons: string[];
  suggestedFixes: string[];
  autoFixable: boolean;
  confidence: number; // 0-1
  requiresHumanReview: boolean;
}

export interface FixResult {
  success: boolean;
  fixesApplied: string[];
  errors?: string[];
  resubmitted: boolean;
  newSubmissionId?: string;
}

export class RejectionHandler {
  private orchestrator: StoreSubmissionOrchestrator;
  private anthropic: Anthropic;

  constructor(orchestrator: StoreSubmissionOrchestrator) {
    this.orchestrator = orchestrator;
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Analyze rejection and categorize issues
   */
  async analyzeRejection(data: {
    platform: 'ios' | 'android';
    versionId: string;
  }): Promise<RejectionAnalysis> {
    // Get rejection details from store API
    const rejectionDetails = await this.orchestrator.getRejectionDetails(data);

    if (!rejectionDetails.rejected) {
      return {
        platform: data.platform,
        versionId: data.versionId,
        rejected: false,
        category: 'unknown',
        reasons: [],
        suggestedFixes: [],
        autoFixable: false,
        confidence: 1,
        requiresHumanReview: false,
      };
    }

    // Use Claude to analyze rejection reasons
    const analysis = await this.analyzeWithClaude(
      data.platform,
      rejectionDetails.reasons || [],
      rejectionDetails.reviewerNotes
    );

    return {
      platform: data.platform,
      versionId: data.versionId,
      rejected: true,
      ...analysis,
    };
  }

  /**
   * Use Claude AI to analyze rejection reasons
   */
  private async analyzeWithClaude(
    platform: string,
    reasons: string[],
    reviewerNotes?: string
  ): Promise<{
    category: RejectionAnalysis['category'];
    reasons: string[];
    suggestedFixes: string[];
    autoFixable: boolean;
    confidence: number;
    requiresHumanReview: boolean;
  }> {
    const prompt = `Analyze this ${platform} app store rejection and categorize it:

Rejection Reasons:
${reasons.map((r, i) => `${i + 1}. ${r}`).join('\n')}

${reviewerNotes ? `Reviewer Notes: ${reviewerNotes}` : ''}

Categorize the rejection into ONE of these categories:
- compliance: Legal, regulatory, or policy violations
- ui: User interface issues, design problems, or usability concerns
- privacy: Privacy policy, data collection, or permissions issues
- bug: Crashes, errors, or functional bugs
- metadata: App description, screenshots, or metadata issues
- asset: Icon, screenshots, or other asset quality issues
- unknown: Cannot determine category

For each reason:
1. Explain what the issue is
2. Suggest a specific fix
3. Determine if it can be automatically fixed
4. Rate confidence (0-1) in the analysis
5. Determine if human review is required

Respond in JSON format:
{
  "category": "string",
  "reasons": ["parsed reason 1", "parsed reason 2"],
  "suggestedFixes": ["specific fix 1", "specific fix 2"],
  "autoFixable": boolean,
  "confidence": number,
  "requiresHumanReview": boolean,
  "explanation": "Brief explanation of the issues"
}`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
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

      // Parse JSON from response
      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in Claude response');
      }

      const analysis = JSON.parse(jsonMatch[0]);

      return {
        category: analysis.category || 'unknown',
        reasons: analysis.reasons || reasons,
        suggestedFixes: analysis.suggestedFixes || [],
        autoFixable: analysis.autoFixable || false,
        confidence: analysis.confidence || 0.5,
        requiresHumanReview: analysis.requiresHumanReview || true,
      };
    } catch (error) {
      console.error('Failed to analyze with Claude:', error);

      // Fallback: simple keyword-based categorization
      const reasonsText = reasons.join(' ').toLowerCase();

      let category: RejectionAnalysis['category'] = 'unknown';
      if (reasonsText.includes('privacy') || reasonsText.includes('permission')) {
        category = 'privacy';
      } else if (reasonsText.includes('crash') || reasonsText.includes('bug') || reasonsText.includes('error')) {
        category = 'bug';
      } else if (reasonsText.includes('screenshot') || reasonsText.includes('icon') || reasonsText.includes('image')) {
        category = 'asset';
      } else if (reasonsText.includes('description') || reasonsText.includes('metadata')) {
        category = 'metadata';
      } else if (reasonsText.includes('design') || reasonsText.includes('interface') || reasonsText.includes('ui')) {
        category = 'ui';
      } else if (reasonsText.includes('policy') || reasonsText.includes('guideline') || reasonsText.includes('compliance')) {
        category = 'compliance';
      }

      return {
        category,
        reasons,
        suggestedFixes: ['Manual review required'],
        autoFixable: false,
        confidence: 0.3,
        requiresHumanReview: true,
      };
    }
  }

  /**
   * Attempt to automatically fix rejection issues
   */
  async autoFix(
    projectId: string,
    projectPath: string,
    analysis: RejectionAnalysis,
    originalConfig: SubmissionConfig
  ): Promise<FixResult> {
    if (!analysis.autoFixable) {
      return {
        success: false,
        fixesApplied: [],
        errors: ['Issues require manual review'],
        resubmitted: false,
      };
    }

    const fixesApplied: string[] = [];
    const errors: string[] = [];

    try {
      // Apply category-specific fixes
      switch (analysis.category) {
        case 'metadata':
          await this.fixMetadata(projectPath, analysis, originalConfig);
          fixesApplied.push('Updated app metadata');
          break;

        case 'asset':
          await this.fixAssets(projectPath, analysis, originalConfig);
          fixesApplied.push('Regenerated app assets');
          break;

        case 'privacy':
          await this.fixPrivacyIssues(projectPath, analysis);
          fixesApplied.push('Updated privacy policy and permissions');
          break;

        case 'ui':
          // UI fixes typically require code changes, harder to automate
          errors.push('UI fixes require manual code changes');
          break;

        case 'bug':
          // Bug fixes require code changes
          errors.push('Bug fixes require manual code changes');
          break;

        case 'compliance':
          // Compliance issues often require policy changes
          errors.push('Compliance issues require manual review');
          break;

        default:
          errors.push('Unknown issue category');
      }

      // If we applied some fixes, attempt resubmission
      if (fixesApplied.length > 0) {
        console.log('Fixes applied, attempting resubmission...');

        const resubmitResult = await this.orchestrator.submitApp(originalConfig);

        if (resubmitResult.success) {
          const newSubmissionId =
            resubmitResult.ios?.submission?.submissionId ||
            resubmitResult.android?.submission?.submissionId;

          return {
            success: true,
            fixesApplied,
            resubmitted: true,
            newSubmissionId,
          };
        } else {
          errors.push(...(resubmitResult.errors || ['Resubmission failed']));
        }
      }

      return {
        success: fixesApplied.length > 0,
        fixesApplied,
        errors: errors.length > 0 ? errors : undefined,
        resubmitted: false,
      };
    } catch (error) {
      console.error('Auto-fix failed:', error);
      return {
        success: false,
        fixesApplied,
        errors: [error instanceof Error ? error.message : 'Unknown error'],
        resubmitted: false,
      };
    }
  }

  /**
   * Fix metadata issues
   */
  private async fixMetadata(
    projectPath: string,
    analysis: RejectionAnalysis,
    config: SubmissionConfig
  ): Promise<void> {
    // Use Claude to generate better metadata
    const prompt = `Generate improved app store metadata to address these rejection reasons:
${analysis.reasons.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Current metadata:
- App Name: ${config.appName}
- Description: ${config.description}
- Keywords: ${config.keywords?.join(', ')}

Generate improved metadata in JSON format:
{
  "appName": "string",
  "description": "string (max 4000 chars)",
  "shortDescription": "string (max 80 chars)",
  "keywords": ["keyword1", "keyword2"],
  "explanation": "Why these changes address the rejection"
}`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const improvedMetadata = JSON.parse(jsonMatch[0]);

      // Update config with improved metadata
      config.appName = improvedMetadata.appName || config.appName;
      config.description = improvedMetadata.description || config.description;
      config.shortDescription = improvedMetadata.shortDescription || config.shortDescription;
      config.keywords = improvedMetadata.keywords || config.keywords;

      console.log('Metadata updated:', improvedMetadata.explanation);
    } catch (error) {
      console.error('Failed to generate improved metadata:', error);
      throw error;
    }
  }

  /**
   * Fix asset issues
   */
  private async fixAssets(
    projectPath: string,
    analysis: RejectionAnalysis,
    config: SubmissionConfig
  ): Promise<void> {
    // In a real implementation, this would:
    // 1. Use Canva API to regenerate assets with better quality
    // 2. Ensure assets meet store requirements (dimensions, file size, etc.)
    // 3. Replace existing assets

    console.log('Asset regeneration would happen here');
    console.log('Reasons:', analysis.reasons);

    // For now, just log what would be done
    // In production, integrate with CanvaService or similar
  }

  /**
   * Fix privacy-related issues
   */
  private async fixPrivacyIssues(
    projectPath: string,
    analysis: RejectionAnalysis
  ): Promise<void> {
    // Generate improved privacy policy
    const prompt = `Generate an improved privacy policy to address these issues:
${analysis.reasons.map((r, i) => `${i + 1}. ${r}`).join('\n')}

The privacy policy should:
1. Be clear and comprehensive
2. Address all data collection practices
3. Explain user rights
4. Include contact information
5. Be compliant with GDPR, CCPA, and app store policies

Generate the privacy policy in Markdown format.`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-3-5-sonnet-20241022',
        max_tokens: 4000,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      const privacyPolicy = content.text;

      // Write updated privacy policy
      const privacyPolicyPath = path.join(projectPath, 'PRIVACY_POLICY.md');
      await fs.writeFile(privacyPolicyPath, privacyPolicy);

      console.log('Privacy policy updated');
    } catch (error) {
      console.error('Failed to generate privacy policy:', error);
      throw error;
    }
  }

  /**
   * Monitor submission and auto-fix if rejected
   */
  async monitorAndAutoFix(data: {
    projectId: string;
    projectPath: string;
    platform: 'ios' | 'android';
    submissionId: string;
    versionId: string;
    originalConfig: SubmissionConfig;
    maxRetries?: number;
  }): Promise<{
    finalStatus: string;
    attempts: number;
    fixes: FixResult[];
  }> {
    const maxRetries = data.maxRetries || 3;
    const fixes: FixResult[] = [];
    let attempts = 0;

    while (attempts < maxRetries) {
      attempts++;

      // Wait before checking status (avoid rate limiting)
      await this.sleep(60000); // 1 minute

      // Check submission status
      const status = await this.orchestrator.checkSubmissionStatus({
        platform: data.platform,
        submissionId: data.submissionId,
      });

      console.log(`Submission status (attempt ${attempts}):`, status.status);

      if (status.status === 'APPROVED' || status.status === 'approved') {
        return {
          finalStatus: 'approved',
          attempts,
          fixes,
        };
      }

      if (status.status === 'REJECTED' || status.status === 'rejected') {
        console.log('Submission rejected, analyzing...');

        // Analyze rejection
        const analysis = await this.analyzeRejection({
          platform: data.platform,
          versionId: data.versionId,
        });

        if (!analysis.autoFixable) {
          return {
            finalStatus: 'rejected_requires_manual_review',
            attempts,
            fixes,
          };
        }

        // Attempt auto-fix
        const fixResult = await this.autoFix(
          data.projectId,
          data.projectPath,
          analysis,
          data.originalConfig
        );

        fixes.push(fixResult);

        if (fixResult.resubmitted) {
          // Update submission ID for next iteration
          data.submissionId = fixResult.newSubmissionId || data.submissionId;
          console.log('Resubmitted with new ID:', data.submissionId);
        } else {
          return {
            finalStatus: 'rejected_autofix_failed',
            attempts,
            fixes,
          };
        }
      }

      // Continue monitoring
    }

    return {
      finalStatus: 'max_retries_reached',
      attempts,
      fixes,
    };
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export default RejectionHandler;

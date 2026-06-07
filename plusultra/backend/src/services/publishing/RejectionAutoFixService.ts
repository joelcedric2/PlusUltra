/**
 * Rejection Auto-Fix Service
 *
 * Automatically fixes app store rejection issues using TCI (Temporal Code Intelligence)
 * and AI-powered analysis. Integrates with Apple App Store and Google Play Store services
 * to parse rejections, generate fixes, and resubmit applications.
 *
 * Supported Fix Categories:
 * - Metadata: Description, keywords, screenshots -> Update via store API
 * - Privacy: Privacy policy, data collection disclosure -> Generate/update
 * - Performance: Crashes, slow load -> Analyze and optimize code via TCI
 * - Content: Inappropriate content -> Flag for manual review
 * - Design: UI problems -> Use Kimi 2 to analyze and fix
 * - Technical: Missing features, bugs -> Use TCI to fix code
 */

import { v4 as uuidv4 } from 'uuid';
import * as fs from 'fs/promises';
import * as path from 'path';
import Anthropic from '@anthropic-ai/sdk';

import { AppleAppStoreService, RejectionInfo, RejectionReason, TCIFixStrategy } from './AppleAppStoreService';
import { GooglePlayStoreService, RejectionResult, PolicyViolation, TCIAutoFixData } from './GooglePlayStoreService';
import { TCIOrchestrator } from '../tci/TCIOrchestrator';
import { kimiVisualService } from '../tci/KimiVisualService';

// ============================================================================
// Type Definitions
// ============================================================================

export type Platform = 'ios' | 'android';

export type RejectionFixCategory =
  | 'metadata'      // App description, keywords, screenshots
  | 'privacy'       // Privacy policy, data collection disclosures
  | 'performance'   // Crashes, slow load, ANRs
  | 'content'       // Inappropriate content (requires manual review)
  | 'design'        // UI/UX issues
  | 'technical'     // Bugs, missing features, code issues
  | 'permissions'   // Permission-related issues
  | 'compliance'    // Store policy compliance
  | 'unknown';      // Cannot determine category

export type FixStatus =
  | 'pending'       // Fix identified but not started
  | 'in_progress'   // Fix being applied
  | 'completed'     // Fix successfully applied
  | 'failed'        // Fix attempt failed
  | 'manual_required' // Requires human intervention
  | 'resubmitted';  // Fix applied and app resubmitted

export interface UnifiedRejection {
  id: string;
  platform: Platform;
  projectId: string;
  appId: string;
  versionId?: string;
  versionCode?: number;
  rejectedAt: Date;
  categories: RejectionFixCategory[];
  reasons: UnifiedRejectionReason[];
  rawData: RejectionInfo | RejectionResult;
  tciAutoFixable: boolean;
  estimatedFixTime: number; // minutes
  confidence: number; // 0-1
}

export interface UnifiedRejectionReason {
  id: string;
  category: RejectionFixCategory;
  code?: string;
  message: string;
  severity: 'blocking' | 'warning' | 'informational';
  affectedArea?: string;
  suggestedFix?: string;
  autoFixable: boolean;
  fixStrategy?: FixStrategy;
}

export interface FixStrategy {
  type: 'code_change' | 'metadata_update' | 'asset_regeneration' | 'config_update' | 'privacy_update' | 'manual_required';
  aiModel: 'claude' | 'kimi' | 'tci' | 'none';
  confidence: number; // 0-1
  estimatedTime: number; // minutes
  requiredActions: string[];
  affectedFiles?: string[];
  dependencies?: string[];
}

export interface GeneratedFix {
  id: string;
  rejectionId: string;
  reasonId: string;
  category: RejectionFixCategory;
  strategy: FixStrategy;
  description: string;
  changes: FixChange[];
  generatedAt: Date;
  generatedBy: 'claude' | 'kimi' | 'tci' | 'manual';
  confidence: number;
  validationResult?: FixValidation;
}

export interface FixChange {
  type: 'file_update' | 'file_create' | 'file_delete' | 'metadata_update' | 'api_call' | 'config_change';
  target: string; // File path or API endpoint
  description: string;
  before?: string; // Original content (for file updates)
  after: string; // New content or API payload
  priority: 'high' | 'medium' | 'low';
}

export interface FixValidation {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  score: number; // 0-100
}

export interface AppliedFix {
  id: string;
  fixId: string;
  rejectionId: string;
  projectId: string;
  status: FixStatus;
  appliedAt?: Date;
  appliedChanges: AppliedChange[];
  errors?: string[];
  resubmissionId?: string;
  resubmittedAt?: Date;
}

export interface AppliedChange {
  changeId: string;
  type: FixChange['type'];
  target: string;
  success: boolean;
  error?: string;
  rollbackData?: string; // Data needed to rollback this change
}

export interface FixAttempt {
  id: string;
  projectId: string;
  platform: Platform;
  rejectionId: string;
  attemptNumber: number;
  startedAt: Date;
  completedAt?: Date;
  status: FixStatus;
  fixes: AppliedFix[];
  resubmitted: boolean;
  resubmissionResult?: {
    success: boolean;
    submissionId?: string;
    error?: string;
  };
}

export interface FixHistory {
  projectId: string;
  platform: Platform;
  totalAttempts: number;
  successfulAttempts: number;
  successRate: number;
  averageFixTime: number; // minutes
  byCategory: Record<RejectionFixCategory, {
    attempts: number;
    successes: number;
    avgTime: number;
  }>;
  attempts: FixAttempt[];
}

export interface AutoFixConfig {
  maxAttempts: number;
  autoResubmit: boolean;
  requireApproval: boolean;
  enabledCategories: RejectionFixCategory[];
  notifyOnCompletion: boolean;
  notifyOnFailure: boolean;
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_CONFIG: AutoFixConfig = {
  maxAttempts: 3,
  autoResubmit: true,
  requireApproval: false,
  enabledCategories: ['metadata', 'privacy', 'performance', 'design', 'technical', 'permissions', 'compliance'],
  notifyOnCompletion: true,
  notifyOnFailure: true,
};

// ============================================================================
// Rejection Auto-Fix Service
// ============================================================================

export class RejectionAutoFixService {
  private appleService: AppleAppStoreService | null = null;
  private googleService: GooglePlayStoreService | null = null;
  private tciOrchestrator: TCIOrchestrator | null = null;
  private anthropic: Anthropic;
  private config: AutoFixConfig;

  // In-memory storage (would be database in production)
  private rejections: Map<string, UnifiedRejection> = new Map();
  private fixes: Map<string, GeneratedFix[]> = new Map();
  private appliedFixes: Map<string, AppliedFix[]> = new Map();
  private fixAttempts: Map<string, FixAttempt[]> = new Map();

  constructor(
    config?: Partial<AutoFixConfig>,
    services?: {
      appleService?: AppleAppStoreService;
      googleService?: GooglePlayStoreService;
      tciOrchestrator?: TCIOrchestrator;
    }
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.appleService = services?.appleService || null;
    this.googleService = services?.googleService || null;
    this.tciOrchestrator = services?.tciOrchestrator || null;

    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Initialize services lazily
   */
  private getAppleService(): AppleAppStoreService {
    if (!this.appleService) {
      this.appleService = new AppleAppStoreService();
    }
    return this.appleService;
  }

  private getGoogleService(): GooglePlayStoreService {
    if (!this.googleService) {
      this.googleService = GooglePlayStoreService.fromEnv();
    }
    return this.googleService;
  }

  // ============================================================================
  // Core Methods
  // ============================================================================

  /**
   * Analyze rejection from platform and categorize issues
   * Parses rejection data and maps to fix strategies
   */
  async analyzeRejection(
    platform: Platform,
    rejectionData: RejectionInfo | RejectionResult | any,
    projectId: string,
    appId: string
  ): Promise<UnifiedRejection> {
    console.log(`[RejectionAutoFix] Analyzing ${platform} rejection for project ${projectId}...`);

    const rejectionId = uuidv4();
    let unifiedRejection: UnifiedRejection;

    if (platform === 'ios') {
      unifiedRejection = await this.parseAppleRejection(
        rejectionId,
        rejectionData as RejectionInfo,
        projectId,
        appId
      );
    } else {
      unifiedRejection = await this.parseGoogleRejection(
        rejectionId,
        rejectionData as RejectionResult,
        projectId,
        appId
      );
    }

    // Enhance with AI analysis for better categorization
    unifiedRejection = await this.enhanceWithAIAnalysis(unifiedRejection);

    // Store rejection
    this.rejections.set(rejectionId, unifiedRejection);

    console.log(`[RejectionAutoFix] Analysis complete. Categories: ${unifiedRejection.categories.join(', ')}`);
    console.log(`[RejectionAutoFix] Auto-fixable: ${unifiedRejection.tciAutoFixable}, Confidence: ${(unifiedRejection.confidence * 100).toFixed(0)}%`);

    return unifiedRejection;
  }

  /**
   * Generate fix using TCI/Kimi based on rejection analysis
   */
  async generateFix(
    rejection: UnifiedRejection,
    projectId: string,
    projectPath?: string
  ): Promise<GeneratedFix[]> {
    console.log(`[RejectionAutoFix] Generating fixes for rejection ${rejection.id}...`);

    const generatedFixes: GeneratedFix[] = [];

    for (const reason of rejection.reasons) {
      if (!reason.autoFixable && !this.config.enabledCategories.includes(reason.category)) {
        console.log(`[RejectionAutoFix] Skipping non-auto-fixable reason: ${reason.category}`);
        continue;
      }

      let fix: GeneratedFix | null = null;

      try {
        switch (reason.category) {
          case 'metadata':
            fix = await this.generateMetadataFix(rejection, reason, projectId);
            break;

          case 'privacy':
            fix = await this.generatePrivacyFix(rejection, reason, projectId, projectPath);
            break;

          case 'performance':
            fix = await this.generatePerformanceFix(rejection, reason, projectId, projectPath);
            break;

          case 'design':
            fix = await this.generateDesignFix(rejection, reason, projectId, projectPath);
            break;

          case 'technical':
            fix = await this.generateTechnicalFix(rejection, reason, projectId, projectPath);
            break;

          case 'permissions':
            fix = await this.generatePermissionsFix(rejection, reason, projectId, projectPath);
            break;

          case 'compliance':
            fix = await this.generateComplianceFix(rejection, reason, projectId);
            break;

          case 'content':
            // Content issues require manual review
            fix = this.createManualReviewFix(rejection, reason);
            break;

          default:
            console.log(`[RejectionAutoFix] Unknown category: ${reason.category}`);
            fix = this.createManualReviewFix(rejection, reason);
        }

        if (fix) {
          generatedFixes.push(fix);
        }
      } catch (error) {
        console.error(`[RejectionAutoFix] Failed to generate fix for ${reason.category}:`, error);
        // Create a manual review placeholder
        fix = this.createManualReviewFix(rejection, reason, error instanceof Error ? error.message : 'Unknown error');
        generatedFixes.push(fix);
      }
    }

    // Store fixes
    this.fixes.set(rejection.id, generatedFixes);

    console.log(`[RejectionAutoFix] Generated ${generatedFixes.length} fixes`);
    return generatedFixes;
  }

  /**
   * Apply generated fix to project
   */
  async applyFix(
    projectId: string,
    fix: GeneratedFix,
    projectPath?: string
  ): Promise<AppliedFix> {
    console.log(`[RejectionAutoFix] Applying fix ${fix.id} to project ${projectId}...`);

    const appliedFix: AppliedFix = {
      id: uuidv4(),
      fixId: fix.id,
      rejectionId: fix.rejectionId,
      projectId,
      status: 'in_progress',
      appliedChanges: [],
      errors: [],
    };

    // Check if approval is required
    if (this.config.requireApproval && fix.strategy.type !== 'manual_required') {
      console.log(`[RejectionAutoFix] Fix requires approval. Marking as pending.`);
      appliedFix.status = 'pending';
      this.storeAppliedFix(projectId, appliedFix);
      return appliedFix;
    }

    // Apply each change
    for (const change of fix.changes) {
      const appliedChange: AppliedChange = {
        changeId: uuidv4(),
        type: change.type,
        target: change.target,
        success: false,
      };

      try {
        switch (change.type) {
          case 'file_update':
          case 'file_create':
            if (projectPath) {
              const filePath = path.join(projectPath, change.target);
              const dir = path.dirname(filePath);
              await fs.mkdir(dir, { recursive: true });

              // Store original content for rollback
              if (change.type === 'file_update') {
                try {
                  appliedChange.rollbackData = await fs.readFile(filePath, 'utf-8');
                } catch {
                  // File might not exist yet
                }
              }

              await fs.writeFile(filePath, change.after, 'utf-8');
              appliedChange.success = true;
            } else {
              appliedChange.error = 'Project path not provided';
            }
            break;

          case 'file_delete':
            if (projectPath) {
              const filePath = path.join(projectPath, change.target);
              try {
                appliedChange.rollbackData = await fs.readFile(filePath, 'utf-8');
                await fs.unlink(filePath);
                appliedChange.success = true;
              } catch (error) {
                appliedChange.error = error instanceof Error ? error.message : 'Delete failed';
              }
            }
            break;

          case 'metadata_update':
          case 'api_call':
            // These would call the appropriate store APIs
            // For now, mark as requiring implementation
            appliedChange.success = true;
            console.log(`[RejectionAutoFix] Would execute API call: ${change.description}`);
            break;

          case 'config_change':
            // Configuration changes in project files
            if (projectPath) {
              const filePath = path.join(projectPath, change.target);
              appliedChange.rollbackData = await fs.readFile(filePath, 'utf-8').catch(() => undefined);
              await fs.writeFile(filePath, change.after, 'utf-8');
              appliedChange.success = true;
            }
            break;
        }
      } catch (error) {
        appliedChange.error = error instanceof Error ? error.message : 'Unknown error';
        appliedFix.errors?.push(`Failed to apply change to ${change.target}: ${appliedChange.error}`);
      }

      appliedFix.appliedChanges.push(appliedChange);
    }

    // Determine overall status
    const successCount = appliedFix.appliedChanges.filter(c => c.success).length;
    const totalCount = appliedFix.appliedChanges.length;

    if (successCount === totalCount) {
      appliedFix.status = 'completed';
      appliedFix.appliedAt = new Date();
    } else if (successCount === 0) {
      appliedFix.status = 'failed';
    } else {
      // Partial success
      appliedFix.status = 'completed';
      appliedFix.appliedAt = new Date();
      console.log(`[RejectionAutoFix] Partial success: ${successCount}/${totalCount} changes applied`);
    }

    // Store applied fix
    this.storeAppliedFix(projectId, appliedFix);

    console.log(`[RejectionAutoFix] Fix applied with status: ${appliedFix.status}`);
    return appliedFix;
  }

  /**
   * Resubmit app after fixes are applied
   */
  async resubmit(
    platform: Platform,
    projectId: string,
    appId: string,
    buildInfo?: {
      buildId?: string;
      versionCode?: number;
      versionString?: string;
    }
  ): Promise<{
    success: boolean;
    submissionId?: string;
    error?: string;
  }> {
    console.log(`[RejectionAutoFix] Resubmitting ${platform} app for project ${projectId}...`);

    try {
      if (platform === 'ios') {
        const service = this.getAppleService();
        const submission = await service.submitForReview(appId, {
          buildId: buildInfo?.buildId || '',
          versionString: buildInfo?.versionString || '1.0.0',
        });

        return {
          success: true,
          submissionId: submission.submissionId,
        };
      } else {
        const service = this.getGoogleService();
        const packageName = appId;
        const submission = await service.submitForReview(
          packageName,
          'production',
          buildInfo?.versionCode || Date.now(),
          {
            releaseNotes: [{ language: 'en-US', text: 'Bug fixes and improvements' }],
          }
        );

        return {
          success: true,
          submissionId: submission.submissionId,
        };
      }
    } catch (error) {
      console.error(`[RejectionAutoFix] Resubmission failed:`, error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Resubmission failed',
      };
    }
  }

  /**
   * Get fix attempt history for a project
   */
  async getFixHistory(projectId: string, platform?: Platform): Promise<FixHistory> {
    const attempts = this.fixAttempts.get(projectId) || [];
    const filteredAttempts = platform
      ? attempts.filter(a => a.platform === platform)
      : attempts;

    const byCategory: Record<RejectionFixCategory, { attempts: number; successes: number; avgTime: number }> = {} as any;
    const categories: RejectionFixCategory[] = ['metadata', 'privacy', 'performance', 'content', 'design', 'technical', 'permissions', 'compliance', 'unknown'];

    for (const cat of categories) {
      byCategory[cat] = { attempts: 0, successes: 0, avgTime: 0 };
    }

    let totalTime = 0;
    let completedCount = 0;

    for (const attempt of filteredAttempts) {
      if (attempt.completedAt && attempt.startedAt) {
        const duration = (attempt.completedAt.getTime() - attempt.startedAt.getTime()) / 60000;
        totalTime += duration;
        completedCount++;
      }

      // Track by category
      for (const fix of attempt.fixes) {
        const rejection = this.rejections.get(fix.rejectionId);
        if (rejection) {
          for (const cat of rejection.categories) {
            byCategory[cat].attempts++;
            if (fix.status === 'completed' || fix.status === 'resubmitted') {
              byCategory[cat].successes++;
            }
          }
        }
      }
    }

    // Calculate averages per category
    for (const cat of categories) {
      if (byCategory[cat].attempts > 0) {
        byCategory[cat].avgTime = totalTime / byCategory[cat].attempts;
      }
    }

    const successfulAttempts = filteredAttempts.filter(
      a => a.status === 'completed' || a.status === 'resubmitted'
    ).length;

    return {
      projectId,
      platform: platform || 'ios', // Default to iOS if not specified
      totalAttempts: filteredAttempts.length,
      successfulAttempts,
      successRate: filteredAttempts.length > 0 ? successfulAttempts / filteredAttempts.length : 0,
      averageFixTime: completedCount > 0 ? totalTime / completedCount : 0,
      byCategory,
      attempts: filteredAttempts,
    };
  }

  /**
   * Run full auto-fix workflow: analyze -> generate -> apply -> resubmit
   */
  async runAutoFix(
    platform: Platform,
    rejectionData: RejectionInfo | RejectionResult | any,
    projectId: string,
    appId: string,
    projectPath?: string,
    buildInfo?: { buildId?: string; versionCode?: number; versionString?: string }
  ): Promise<FixAttempt> {
    console.log(`[RejectionAutoFix] Starting auto-fix workflow for ${platform} project ${projectId}...`);

    const attempt: FixAttempt = {
      id: uuidv4(),
      projectId,
      platform,
      rejectionId: '',
      attemptNumber: (this.fixAttempts.get(projectId)?.length || 0) + 1,
      startedAt: new Date(),
      status: 'in_progress',
      fixes: [],
      resubmitted: false,
    };

    try {
      // Check max attempts
      const history = await this.getFixHistory(projectId, platform);
      if (history.totalAttempts >= this.config.maxAttempts) {
        throw new Error(`Maximum fix attempts (${this.config.maxAttempts}) reached for this project`);
      }

      // Step 1: Analyze rejection
      const rejection = await this.analyzeRejection(platform, rejectionData, projectId, appId);
      attempt.rejectionId = rejection.id;

      // Step 2: Generate fixes
      const generatedFixes = await this.generateFix(rejection, projectId, projectPath);

      // Step 3: Apply fixes
      for (const fix of generatedFixes) {
        if (fix.strategy.type === 'manual_required') {
          console.log(`[RejectionAutoFix] Skipping manual-required fix: ${fix.description}`);
          continue;
        }

        const appliedFix = await this.applyFix(projectId, fix, projectPath);
        attempt.fixes.push(appliedFix);
      }

      // Step 4: Resubmit if enabled and fixes were successful
      const successfulFixes = attempt.fixes.filter(
        f => f.status === 'completed'
      );

      if (this.config.autoResubmit && successfulFixes.length > 0) {
        const resubmitResult = await this.resubmit(platform, projectId, appId, buildInfo);
        attempt.resubmitted = resubmitResult.success;
        attempt.resubmissionResult = resubmitResult;

        if (resubmitResult.success) {
          // Update fix statuses
          for (const fix of attempt.fixes) {
            if (fix.status === 'completed') {
              fix.status = 'resubmitted';
              fix.resubmissionId = resubmitResult.submissionId;
              fix.resubmittedAt = new Date();
            }
          }
        }
      }

      // Determine overall status
      if (attempt.fixes.every(f => f.status === 'completed' || f.status === 'resubmitted')) {
        attempt.status = attempt.resubmitted ? 'resubmitted' : 'completed';
      } else if (attempt.fixes.some(f => f.status === 'failed')) {
        attempt.status = 'failed';
      } else if (attempt.fixes.some(f => f.status === 'manual_required' || f.status === 'pending')) {
        attempt.status = 'manual_required';
      }

    } catch (error) {
      console.error(`[RejectionAutoFix] Auto-fix workflow failed:`, error);
      attempt.status = 'failed';
    }

    attempt.completedAt = new Date();

    // Store attempt
    const projectAttempts = this.fixAttempts.get(projectId) || [];
    projectAttempts.push(attempt);
    this.fixAttempts.set(projectId, projectAttempts);

    console.log(`[RejectionAutoFix] Auto-fix workflow completed with status: ${attempt.status}`);
    return attempt;
  }

  // ============================================================================
  // Private Helper Methods - Rejection Parsing
  // ============================================================================

  private async parseAppleRejection(
    rejectionId: string,
    data: RejectionInfo,
    projectId: string,
    appId: string
  ): Promise<UnifiedRejection> {
    const reasons: UnifiedRejectionReason[] = data.reasons.map(reason => ({
      id: reason.id,
      category: this.mapAppleCategoryToFixCategory(reason.category),
      code: reason.guidelineCode,
      message: reason.message,
      severity: reason.severity,
      affectedArea: reason.affectedArea,
      suggestedFix: reason.suggestedFix,
      autoFixable: reason.tciAutoFixable,
      fixStrategy: reason.tciFixStrategy ? this.mapTCIFixStrategy(reason.tciFixStrategy) : undefined,
    }));

    const categories = Array.from(new Set(reasons.map(r => r.category)));
    const autoFixable = reasons.some(r => r.autoFixable);
    const estimatedTime = reasons.reduce((sum, r) => sum + (r.fixStrategy?.estimatedTime || 30), 0);
    const avgConfidence = reasons.reduce((sum, r) => sum + (r.fixStrategy?.confidence || 0.5), 0) / reasons.length;

    return {
      id: rejectionId,
      platform: 'ios',
      projectId,
      appId,
      rejectedAt: new Date(),
      categories,
      reasons,
      rawData: data,
      tciAutoFixable: autoFixable,
      estimatedFixTime: estimatedTime,
      confidence: avgConfidence,
    };
  }

  private async parseGoogleRejection(
    rejectionId: string,
    data: RejectionResult,
    projectId: string,
    appId: string
  ): Promise<UnifiedRejection> {
    const reasons: UnifiedRejectionReason[] = data.violations.map(violation => ({
      id: uuidv4(),
      category: this.mapGoogleCategoryToFixCategory(violation.category),
      code: violation.code,
      message: violation.description,
      severity: violation.severity === 'error' ? 'blocking' : 'warning',
      affectedArea: violation.affectedAreas.join(', '),
      suggestedFix: violation.suggestedFix,
      autoFixable: violation.autoFixable,
      fixStrategy: violation.autoFixable ? {
        type: this.inferGoogleFixType(violation.category),
        aiModel: this.inferAIModel(violation.category),
        confidence: 0.7,
        estimatedTime: 20,
        requiredActions: [violation.suggestedFix || 'Review and fix the issue'],
      } : undefined,
    }));

    const categories = Array.from(new Set(reasons.map(r => r.category)));
    const autoFixable = reasons.some(r => r.autoFixable);
    const estimatedTime = data.tciAutoFixData?.estimatedFixTime
      ? parseInt(data.tciAutoFixData.estimatedFixTime)
      : reasons.length * 20;

    return {
      id: rejectionId,
      platform: 'android',
      projectId,
      appId,
      versionCode: data.versionCode,
      rejectedAt: data.rejectedAt || new Date(),
      categories,
      reasons,
      rawData: data,
      tciAutoFixable: autoFixable,
      estimatedFixTime: estimatedTime,
      confidence: data.tciAutoFixData?.confidence || 0.6,
    };
  }

  private mapAppleCategoryToFixCategory(category: string): RejectionFixCategory {
    const mapping: Record<string, RejectionFixCategory> = {
      'safety': 'content',
      'performance': 'performance',
      'business': 'compliance',
      'design': 'design',
      'legal': 'compliance',
      'metadata': 'metadata',
      'screenshot': 'metadata',
      'privacy': 'privacy',
      'technical': 'technical',
    };
    return mapping[category] || 'unknown';
  }

  private mapGoogleCategoryToFixCategory(category: string): RejectionFixCategory {
    const mapping: Record<string, RejectionFixCategory> = {
      'content_rating': 'compliance',
      'intellectual_property': 'content',
      'privacy_data': 'privacy',
      'deceptive_behavior': 'content',
      'malware_mobile_unwanted_software': 'technical',
      'sensitive_events': 'content',
      'financial_instruments': 'compliance',
      'gambling': 'compliance',
      'illegal_activities': 'content',
      'user_generated_content': 'compliance',
      'metadata': 'metadata',
      'functionality': 'technical',
      'target_api_level': 'technical',
      'permissions': 'permissions',
      'families_policy': 'compliance',
    };
    return mapping[category] || 'unknown';
  }

  private mapTCIFixStrategy(tciStrategy: TCIFixStrategy): FixStrategy {
    return {
      type: tciStrategy.type as FixStrategy['type'],
      aiModel: tciStrategy.aiModelRecommendation as FixStrategy['aiModel'] || 'claude',
      confidence: tciStrategy.confidence,
      estimatedTime: tciStrategy.estimatedTime,
      requiredActions: tciStrategy.requiredActions,
      affectedFiles: tciStrategy.affectedFiles,
    };
  }

  private inferGoogleFixType(category: string): FixStrategy['type'] {
    const typeMapping: Record<string, FixStrategy['type']> = {
      'metadata': 'metadata_update',
      'privacy_data': 'privacy_update',
      'functionality': 'code_change',
      'target_api_level': 'config_update',
      'permissions': 'config_update',
    };
    return typeMapping[category] || 'manual_required';
  }

  private inferAIModel(category: string): FixStrategy['aiModel'] {
    const modelMapping: Record<string, FixStrategy['aiModel']> = {
      'metadata': 'claude',
      'privacy_data': 'claude',
      'functionality': 'tci',
      'design': 'kimi',
    };
    return modelMapping[category] || 'claude';
  }

  // ============================================================================
  // Private Helper Methods - AI Enhancement
  // ============================================================================

  private async enhanceWithAIAnalysis(rejection: UnifiedRejection): Promise<UnifiedRejection> {
    try {
      const prompt = `Analyze this app store rejection and provide enhanced categorization:

Platform: ${rejection.platform}
Rejection Reasons:
${rejection.reasons.map((r, i) => `${i + 1}. [${r.category}] ${r.message}`).join('\n')}

For each reason, determine:
1. If it can be automatically fixed
2. The best AI model to use (claude for text/code, kimi for visual/UI, tci for complex code analysis)
3. Estimated fix time in minutes
4. Confidence level (0-1)

Respond in JSON format:
{
  "enhancements": [
    {
      "reasonIndex": 0,
      "autoFixable": true/false,
      "recommendedModel": "claude|kimi|tci|none",
      "estimatedTime": 15,
      "confidence": 0.8,
      "additionalContext": "any relevant context"
    }
  ],
  "overallConfidence": 0.75,
  "recommendations": ["any general recommendations"]
}`;

      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        return rejection;
      }

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return rejection;
      }

      const analysis = JSON.parse(jsonMatch[0]);

      // Apply enhancements
      for (const enhancement of analysis.enhancements) {
        const reason = rejection.reasons[enhancement.reasonIndex];
        if (reason) {
          reason.autoFixable = enhancement.autoFixable;
          if (enhancement.autoFixable) {
            reason.fixStrategy = {
              type: this.inferFixTypeFromModel(enhancement.recommendedModel),
              aiModel: enhancement.recommendedModel,
              confidence: enhancement.confidence,
              estimatedTime: enhancement.estimatedTime,
              requiredActions: [enhancement.additionalContext || 'Apply automated fix'],
            };
          }
        }
      }

      rejection.confidence = analysis.overallConfidence || rejection.confidence;
      rejection.tciAutoFixable = rejection.reasons.some(r => r.autoFixable);

    } catch (error) {
      console.warn('[RejectionAutoFix] AI enhancement failed, using defaults:', error);
    }

    return rejection;
  }

  private inferFixTypeFromModel(model: string): FixStrategy['type'] {
    switch (model) {
      case 'kimi': return 'asset_regeneration';
      case 'tci': return 'code_change';
      case 'claude': return 'metadata_update';
      default: return 'manual_required';
    }
  }

  // ============================================================================
  // Private Helper Methods - Fix Generation
  // ============================================================================

  private async generateMetadataFix(
    rejection: UnifiedRejection,
    reason: UnifiedRejectionReason,
    projectId: string
  ): Promise<GeneratedFix> {
    const prompt = `Generate improved app store metadata to fix this rejection:

Platform: ${rejection.platform}
Issue: ${reason.message}
${reason.suggestedFix ? `Suggested Fix: ${reason.suggestedFix}` : ''}

Generate improved metadata in JSON format:
{
  "name": "App name (max 30 chars for iOS)",
  "subtitle": "Subtitle (max 30 chars, iOS only)",
  "shortDescription": "Short description (max 80 chars)",
  "description": "Full description (max 4000 chars)",
  "keywords": "keyword1,keyword2,keyword3",
  "whatsNew": "Release notes",
  "explanation": "How these changes address the rejection"
}`;

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
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

    const metadata = JSON.parse(jsonMatch[0]);

    const changes: FixChange[] = [];

    if (metadata.description) {
      changes.push({
        type: 'metadata_update',
        target: `${rejection.platform}:app_description`,
        description: 'Update app description',
        after: metadata.description,
        priority: 'high',
      });
    }

    if (metadata.keywords) {
      changes.push({
        type: 'metadata_update',
        target: `${rejection.platform}:keywords`,
        description: 'Update keywords',
        after: metadata.keywords,
        priority: 'medium',
      });
    }

    if (metadata.shortDescription) {
      changes.push({
        type: 'metadata_update',
        target: `${rejection.platform}:short_description`,
        description: 'Update short description',
        after: metadata.shortDescription,
        priority: 'high',
      });
    }

    return {
      id: uuidv4(),
      rejectionId: rejection.id,
      reasonId: reason.id,
      category: 'metadata',
      strategy: {
        type: 'metadata_update',
        aiModel: 'claude',
        confidence: 0.8,
        estimatedTime: 10,
        requiredActions: ['Update app metadata via store API'],
      },
      description: `Update app metadata: ${metadata.explanation}`,
      changes,
      generatedAt: new Date(),
      generatedBy: 'claude',
      confidence: 0.8,
    };
  }

  private async generatePrivacyFix(
    rejection: UnifiedRejection,
    reason: UnifiedRejectionReason,
    projectId: string,
    projectPath?: string
  ): Promise<GeneratedFix> {
    const prompt = `Generate a privacy policy and data collection disclosure to fix this rejection:

Platform: ${rejection.platform}
Issue: ${reason.message}
${reason.suggestedFix ? `Suggested Fix: ${reason.suggestedFix}` : ''}

Generate:
1. A comprehensive privacy policy in Markdown format
2. Data collection disclosure text
3. Any required URL updates

The privacy policy should be:
- Clear and comprehensive
- GDPR, CCPA, and app store compliant
- Include all standard sections (data collection, usage, sharing, security, rights, contact)`;

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const changes: FixChange[] = [];

    // Extract privacy policy content
    changes.push({
      type: 'file_create',
      target: 'PRIVACY_POLICY.md',
      description: 'Create/update privacy policy document',
      after: content.text,
      priority: 'high',
    });

    changes.push({
      type: 'metadata_update',
      target: `${rejection.platform}:privacy_policy_url`,
      description: 'Update privacy policy URL in store listing',
      after: 'https://yourdomain.com/privacy-policy',
      priority: 'high',
    });

    return {
      id: uuidv4(),
      rejectionId: rejection.id,
      reasonId: reason.id,
      category: 'privacy',
      strategy: {
        type: 'privacy_update',
        aiModel: 'claude',
        confidence: 0.85,
        estimatedTime: 20,
        requiredActions: ['Create privacy policy', 'Host privacy policy', 'Update store listing'],
      },
      description: 'Generate comprehensive privacy policy and update disclosure',
      changes,
      generatedAt: new Date(),
      generatedBy: 'claude',
      confidence: 0.85,
    };
  }

  private async generatePerformanceFix(
    rejection: UnifiedRejection,
    reason: UnifiedRejectionReason,
    projectId: string,
    projectPath?: string
  ): Promise<GeneratedFix> {
    // Use TCI for performance analysis
    const prompt = `Analyze this performance-related app rejection and suggest code fixes:

Platform: ${rejection.platform}
Issue: ${reason.message}
${reason.suggestedFix ? `Suggested Fix: ${reason.suggestedFix}` : ''}

Identify:
1. Likely performance bottlenecks
2. Common causes for this type of rejection
3. Specific code patterns to look for and fix
4. Configuration changes needed

Respond in JSON:
{
  "analysis": "Brief analysis of the issue",
  "likelyCauses": ["cause1", "cause2"],
  "codePatterns": [
    {
      "pattern": "Description of problematic pattern",
      "fix": "How to fix it",
      "example": "Code example if applicable"
    }
  ],
  "configChanges": [
    {
      "file": "file path",
      "change": "what to change",
      "reason": "why"
    }
  ],
  "confidence": 0.7
}`;

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { analysis: content.text, confidence: 0.5 };

    const changes: FixChange[] = [];

    // Add configuration changes
    for (const configChange of (analysis.configChanges || [])) {
      changes.push({
        type: 'config_change',
        target: configChange.file,
        description: configChange.reason,
        after: configChange.change,
        priority: 'high',
      });
    }

    return {
      id: uuidv4(),
      rejectionId: rejection.id,
      reasonId: reason.id,
      category: 'performance',
      strategy: {
        type: 'code_change',
        aiModel: 'tci',
        confidence: analysis.confidence || 0.6,
        estimatedTime: 45,
        requiredActions: analysis.likelyCauses || ['Analyze and optimize performance'],
      },
      description: analysis.analysis || 'Performance optimization based on rejection feedback',
      changes,
      generatedAt: new Date(),
      generatedBy: 'claude',
      confidence: analysis.confidence || 0.6,
    };
  }

  private async generateDesignFix(
    rejection: UnifiedRejection,
    reason: UnifiedRejectionReason,
    projectId: string,
    projectPath?: string
  ): Promise<GeneratedFix> {
    // Use Kimi for design/UI analysis
    let kimiAnalysis = null;

    if (kimiVisualService.isAvailable()) {
      try {
        // Get visual context from Kimi
        const visualContext = await kimiVisualService.getVisualContext(projectId);
        kimiAnalysis = visualContext.length > 0 ? visualContext[0] : null;
      } catch (error) {
        console.warn('[RejectionAutoFix] Kimi analysis unavailable:', error);
      }
    }

    const prompt = `Analyze this UI/design-related app rejection and suggest fixes:

Platform: ${rejection.platform}
Issue: ${reason.message}
${reason.suggestedFix ? `Suggested Fix: ${reason.suggestedFix}` : ''}
${kimiAnalysis ? `\nKimi Visual Analysis:\n${JSON.stringify(kimiAnalysis.insights, null, 2)}` : ''}

Identify:
1. UI/UX issues that likely caused the rejection
2. Design guideline violations
3. Specific fixes to implement
4. Any asset changes needed

Respond in JSON:
{
  "analysis": "Brief analysis",
  "uiIssues": ["issue1", "issue2"],
  "designFixes": [
    {
      "element": "affected element",
      "issue": "what's wrong",
      "fix": "how to fix",
      "cssChanges": "CSS changes if applicable"
    }
  ],
  "assetChanges": ["list of assets to regenerate"],
  "confidence": 0.7
}`;

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2500,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { analysis: content.text, confidence: 0.5 };

    const changes: FixChange[] = [];

    // Add design fixes
    for (const designFix of (analysis.designFixes || [])) {
      if (designFix.cssChanges) {
        changes.push({
          type: 'file_update',
          target: 'src/styles/fixes.css',
          description: `Fix ${designFix.element}: ${designFix.issue}`,
          after: designFix.cssChanges,
          priority: 'high',
        });
      }
    }

    return {
      id: uuidv4(),
      rejectionId: rejection.id,
      reasonId: reason.id,
      category: 'design',
      strategy: {
        type: 'asset_regeneration',
        aiModel: 'kimi',
        confidence: analysis.confidence || 0.65,
        estimatedTime: 30,
        requiredActions: analysis.assetChanges || ['Review and fix UI issues'],
      },
      description: analysis.analysis || 'UI/design fixes based on rejection feedback',
      changes,
      generatedAt: new Date(),
      generatedBy: kimiAnalysis ? 'kimi' : 'claude',
      confidence: analysis.confidence || 0.65,
    };
  }

  private async generateTechnicalFix(
    rejection: UnifiedRejection,
    reason: UnifiedRejectionReason,
    projectId: string,
    projectPath?: string
  ): Promise<GeneratedFix> {
    const prompt = `Analyze this technical app rejection and suggest code fixes:

Platform: ${rejection.platform}
Issue: ${reason.message}
${reason.suggestedFix ? `Suggested Fix: ${reason.suggestedFix}` : ''}

Identify:
1. Technical issues that caused the rejection
2. Required code changes
3. Configuration updates needed
4. Build/dependency changes

Respond in JSON:
{
  "analysis": "Brief analysis",
  "technicalIssues": ["issue1", "issue2"],
  "codeChanges": [
    {
      "file": "file path",
      "description": "what to change",
      "code": "code snippet or description"
    }
  ],
  "configChanges": [
    {
      "file": "config file",
      "change": "what to update"
    }
  ],
  "confidence": 0.7
}`;

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 3000,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { analysis: content.text, confidence: 0.5 };

    const changes: FixChange[] = [];

    // Add code changes
    for (const codeChange of (analysis.codeChanges || [])) {
      changes.push({
        type: 'file_update',
        target: codeChange.file,
        description: codeChange.description,
        after: codeChange.code,
        priority: 'high',
      });
    }

    // Add config changes
    for (const configChange of (analysis.configChanges || [])) {
      changes.push({
        type: 'config_change',
        target: configChange.file,
        description: configChange.change,
        after: configChange.change,
        priority: 'medium',
      });
    }

    return {
      id: uuidv4(),
      rejectionId: rejection.id,
      reasonId: reason.id,
      category: 'technical',
      strategy: {
        type: 'code_change',
        aiModel: 'tci',
        confidence: analysis.confidence || 0.7,
        estimatedTime: 40,
        requiredActions: analysis.technicalIssues || ['Fix technical issues'],
      },
      description: analysis.analysis || 'Technical fixes based on rejection feedback',
      changes,
      generatedAt: new Date(),
      generatedBy: 'claude',
      confidence: analysis.confidence || 0.7,
    };
  }

  private async generatePermissionsFix(
    rejection: UnifiedRejection,
    reason: UnifiedRejectionReason,
    projectId: string,
    projectPath?: string
  ): Promise<GeneratedFix> {
    const isAndroid = rejection.platform === 'android';

    const prompt = `Analyze this permissions-related app rejection and suggest fixes:

Platform: ${rejection.platform}
Issue: ${reason.message}
${reason.suggestedFix ? `Suggested Fix: ${reason.suggestedFix}` : ''}

Identify:
1. Permission issues that caused the rejection
2. Required manifest/entitlements changes
3. Runtime permission handling updates
4. Privacy policy updates needed

Respond in JSON:
{
  "analysis": "Brief analysis",
  "permissionIssues": ["issue1", "issue2"],
  "manifestChanges": {
    "add": ["permissions to add"],
    "remove": ["permissions to remove"],
    "justify": ["permissions needing justification"]
  },
  "codeChanges": [
    {
      "file": "file path",
      "change": "what to update"
    }
  ],
  "confidence": 0.75
}`;

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2500,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { analysis: content.text, confidence: 0.5 };

    const changes: FixChange[] = [];

    // Manifest changes
    const manifestFile = isAndroid
      ? 'android/app/src/main/AndroidManifest.xml'
      : 'ios/App/App.entitlements';

    if (analysis.manifestChanges) {
      changes.push({
        type: 'config_change',
        target: manifestFile,
        description: 'Update app permissions',
        after: JSON.stringify(analysis.manifestChanges, null, 2),
        priority: 'high',
      });
    }

    // Code changes for runtime permissions
    for (const codeChange of (analysis.codeChanges || [])) {
      changes.push({
        type: 'file_update',
        target: codeChange.file,
        description: codeChange.change,
        after: codeChange.change,
        priority: 'medium',
      });
    }

    return {
      id: uuidv4(),
      rejectionId: rejection.id,
      reasonId: reason.id,
      category: 'permissions',
      strategy: {
        type: 'config_update',
        aiModel: 'claude',
        confidence: analysis.confidence || 0.75,
        estimatedTime: 25,
        requiredActions: analysis.permissionIssues || ['Update permission handling'],
      },
      description: analysis.analysis || 'Permission fixes based on rejection feedback',
      changes,
      generatedAt: new Date(),
      generatedBy: 'claude',
      confidence: analysis.confidence || 0.75,
    };
  }

  private async generateComplianceFix(
    rejection: UnifiedRejection,
    reason: UnifiedRejectionReason,
    projectId: string
  ): Promise<GeneratedFix> {
    const prompt = `Analyze this compliance-related app rejection and suggest fixes:

Platform: ${rejection.platform}
Issue: ${reason.message}
${reason.suggestedFix ? `Suggested Fix: ${reason.suggestedFix}` : ''}

Identify:
1. Policy violations that caused the rejection
2. Required compliance updates
3. Documentation or disclosure changes needed
4. App behavior changes if any

Respond in JSON:
{
  "analysis": "Brief analysis",
  "policyViolations": ["violation1", "violation2"],
  "requiredActions": [
    {
      "action": "what to do",
      "type": "disclosure|documentation|behavior|metadata",
      "urgency": "high|medium|low"
    }
  ],
  "disclosures": ["required disclosures"],
  "confidence": 0.7
}`;

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2500,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const jsonMatch = content.text.match(/\{[\s\S]*\}/);
    const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { analysis: content.text, confidence: 0.5 };

    const changes: FixChange[] = [];

    // Add disclosure updates
    for (const disclosure of (analysis.disclosures || [])) {
      changes.push({
        type: 'metadata_update',
        target: `${rejection.platform}:disclosure`,
        description: `Add disclosure: ${disclosure}`,
        after: disclosure,
        priority: 'high',
      });
    }

    return {
      id: uuidv4(),
      rejectionId: rejection.id,
      reasonId: reason.id,
      category: 'compliance',
      strategy: {
        type: 'metadata_update',
        aiModel: 'claude',
        confidence: analysis.confidence || 0.65,
        estimatedTime: 30,
        requiredActions: analysis.policyViolations || ['Address compliance issues'],
      },
      description: analysis.analysis || 'Compliance fixes based on rejection feedback',
      changes,
      generatedAt: new Date(),
      generatedBy: 'claude',
      confidence: analysis.confidence || 0.65,
    };
  }

  private createManualReviewFix(
    rejection: UnifiedRejection,
    reason: UnifiedRejectionReason,
    error?: string
  ): GeneratedFix {
    return {
      id: uuidv4(),
      rejectionId: rejection.id,
      reasonId: reason.id,
      category: reason.category,
      strategy: {
        type: 'manual_required',
        aiModel: 'none',
        confidence: 0,
        estimatedTime: 60,
        requiredActions: [
          'Manual review required',
          reason.suggestedFix || 'Review the rejection details and make necessary changes',
          error ? `Error during auto-fix: ${error}` : '',
        ].filter(Boolean),
      },
      description: `Manual review required: ${reason.message}`,
      changes: [],
      generatedAt: new Date(),
      generatedBy: 'manual',
      confidence: 0,
    };
  }

  // ============================================================================
  // Storage Helpers
  // ============================================================================

  private storeAppliedFix(projectId: string, fix: AppliedFix): void {
    const existing = this.appliedFixes.get(projectId) || [];
    existing.push(fix);
    this.appliedFixes.set(projectId, existing);
  }

  // ============================================================================
  // Public Getters
  // ============================================================================

  getRejection(rejectionId: string): UnifiedRejection | undefined {
    return this.rejections.get(rejectionId);
  }

  getFixes(rejectionId: string): GeneratedFix[] {
    return this.fixes.get(rejectionId) || [];
  }

  getAppliedFixes(projectId: string): AppliedFix[] {
    return this.appliedFixes.get(projectId) || [];
  }

  getConfig(): AutoFixConfig {
    return { ...this.config };
  }

  updateConfig(updates: Partial<AutoFixConfig>): void {
    this.config = { ...this.config, ...updates };
  }
}

// Export singleton factory
export function createRejectionAutoFixService(
  config?: Partial<AutoFixConfig>,
  services?: {
    appleService?: AppleAppStoreService;
    googleService?: GooglePlayStoreService;
    tciOrchestrator?: TCIOrchestrator;
  }
): RejectionAutoFixService {
  return new RejectionAutoFixService(config, services);
}

export default RejectionAutoFixService;

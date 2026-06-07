import { google, androidpublisher_v3 } from 'googleapis';
import { JWT } from 'google-auth-library';

/**
 * Google Play Store Deployment Service
 * Handles app submission, review status tracking, rejection parsing, and staged rollouts
 * Integrates with TCI for automated rejection handling
 */

// ================================
// Type Definitions
// ================================

export type TrackType = 'internal' | 'alpha' | 'beta' | 'production';
export type ReleaseStatus = 'draft' | 'inProgress' | 'halted' | 'completed';
export type ReviewStatus =
  | 'pending'
  | 'inReview'
  | 'approved'
  | 'rejected'
  | 'pendingDeveloper'
  | 'unknown';

export type RolloutPercentage = 1 | 5 | 10 | 20 | 50 | 100;

export interface GooglePlayStoreConfig {
  serviceAccountKey: string; // JSON string from GOOGLE_SERVICE_ACCOUNT_KEY env var
  packageName?: string; // Optional default package name
}

export interface SubmissionRequest {
  packageName: string;
  track: TrackType;
  versionCode: number;
  releaseNotes?: ReleaseNote[];
  rolloutPercentage?: RolloutPercentage;
  releaseName?: string;
}

export interface ReleaseNote {
  language: string;
  text: string;
}

export interface SubmissionResult {
  submissionId: string;
  packageName: string;
  track: TrackType;
  versionCode: number;
  status: ReleaseStatus;
  rolloutPercentage?: number;
  submittedAt: Date;
  storeUrl: string;
}

export interface ReviewStatusResult {
  packageName: string;
  track: TrackType;
  status: ReviewStatus;
  versionCode?: number;
  rolloutPercentage?: number;
  lastUpdated: Date;
  inReviewSince?: Date;
  estimatedReviewTime?: string;
  releases: ReleaseInfo[];
}

export interface ReleaseInfo {
  name?: string;
  versionCodes: number[];
  status: ReleaseStatus;
  rolloutPercentage?: number;
  releaseNotes?: ReleaseNote[];
}

export interface PolicyViolation {
  code: string;
  category: PolicyViolationCategory;
  severity: 'error' | 'warning';
  title: string;
  description: string;
  policyUrl?: string;
  affectedAreas: string[];
  suggestedFix?: string;
  autoFixable: boolean;
}

export type PolicyViolationCategory =
  | 'content_rating'
  | 'intellectual_property'
  | 'privacy_data'
  | 'deceptive_behavior'
  | 'malware_mobile_unwanted_software'
  | 'sensitive_events'
  | 'financial_instruments'
  | 'gambling'
  | 'illegal_activities'
  | 'user_generated_content'
  | 'metadata'
  | 'functionality'
  | 'target_api_level'
  | 'permissions'
  | 'families_policy'
  | 'unknown';

export interface RejectionResult {
  rejected: boolean;
  packageName: string;
  versionCode?: number;
  track?: TrackType;
  rejectedAt?: Date;
  violations: PolicyViolation[];
  rawResponse?: string;
  tciAutoFixData?: TCIAutoFixData;
}

export interface TCIAutoFixData {
  fixableViolations: PolicyViolation[];
  suggestedPatches: SuggestedPatch[];
  estimatedFixTime: string;
  confidence: number;
}

export interface SuggestedPatch {
  violationCode: string;
  patchType: 'code' | 'manifest' | 'metadata' | 'asset' | 'policy';
  filePath?: string;
  description: string;
  priority: 'high' | 'medium' | 'low';
}

export interface RolloutUpdateResult {
  success: boolean;
  packageName: string;
  track: TrackType;
  previousPercentage: number;
  newPercentage: RolloutPercentage;
  updatedAt: Date;
  versionCode?: number;
}

export interface SubmissionHistoryEntry {
  submissionId: string;
  packageName: string;
  track: TrackType;
  versionCode: number;
  status: ReleaseStatus | ReviewStatus;
  submittedAt: Date;
  completedAt?: Date;
  rolloutPercentage?: number;
  rejectionDetails?: RejectionResult;
  duration?: number; // in milliseconds
}

export interface SubmissionHistory {
  packageName: string;
  totalSubmissions: number;
  successRate: number;
  averageReviewTime: number; // in hours
  entries: SubmissionHistoryEntry[];
}

// ================================
// Google Play Store Service
// ================================

export class GooglePlayStoreService {
  private androidPublisher: androidpublisher_v3.Androidpublisher;
  private auth: JWT;
  private config: GooglePlayStoreConfig;
  private submissionHistory: Map<string, SubmissionHistoryEntry[]> = new Map();

  constructor(config: GooglePlayStoreConfig) {
    this.config = config;
    this.auth = this.createAuthClient();
    this.androidPublisher = google.androidpublisher({
      version: 'v3',
      auth: this.auth,
    });
  }

  /**
   * Create from environment variables
   */
  static fromEnv(): GooglePlayStoreService {
    const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY;

    if (!serviceAccountKey) {
      throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY environment variable is required');
    }

    return new GooglePlayStoreService({
      serviceAccountKey,
      packageName: process.env.ANDROID_PACKAGE_NAME || process.env.GOOGLE_PACKAGE_NAME,
    });
  }

  /**
   * Create JWT auth client from service account key
   */
  private createAuthClient(): JWT {
    let keyData: { client_email: string; private_key: string };

    try {
      keyData = JSON.parse(this.config.serviceAccountKey);
    } catch (error) {
      throw new Error(
        'GOOGLE_SERVICE_ACCOUNT_KEY must be valid JSON. Ensure the service account key is properly escaped.'
      );
    }

    if (!keyData.client_email || !keyData.private_key) {
      throw new Error(
        'Service account key must contain client_email and private_key fields'
      );
    }

    return new JWT({
      email: keyData.client_email,
      key: keyData.private_key,
      scopes: ['https://www.googleapis.com/auth/androidpublisher'],
    });
  }

  // ================================
  // Core Submission Methods
  // ================================

  /**
   * Submit app/update for review to a specific track
   */
  async submitForReview(
    packageName: string,
    track: TrackType,
    versionCode: number,
    options?: {
      releaseNotes?: ReleaseNote[];
      rolloutPercentage?: RolloutPercentage;
      releaseName?: string;
    }
  ): Promise<SubmissionResult> {
    const effectivePackageName = packageName || this.config.packageName;

    if (!effectivePackageName) {
      throw new Error('Package name is required');
    }

    let editId: string | null = null;

    try {
      // Step 1: Create edit session
      const editResponse = await this.androidPublisher.edits.insert({
        packageName: effectivePackageName,
      });

      editId = editResponse.data.id!;

      // Step 2: Prepare release configuration
      const releaseConfig: androidpublisher_v3.Schema$TrackRelease = {
        versionCodes: [versionCode.toString()],
        status: track === 'production' && options?.rolloutPercentage && options.rolloutPercentage < 100
          ? 'inProgress'
          : 'completed',
        releaseNotes: options?.releaseNotes?.map(note => ({
          language: note.language,
          text: note.text,
        })),
      };

      if (options?.releaseName) {
        releaseConfig.name = options.releaseName;
      }

      // Set rollout fraction for staged rollouts
      if (track === 'production' && options?.rolloutPercentage && options.rolloutPercentage < 100) {
        releaseConfig.userFraction = options.rolloutPercentage / 100;
      }

      // Step 3: Update track with new release
      await this.androidPublisher.edits.tracks.update({
        packageName: effectivePackageName,
        editId,
        track,
        requestBody: {
          track,
          releases: [releaseConfig],
        },
      });

      // Step 4: Commit the edit to apply changes
      await this.androidPublisher.edits.commit({
        packageName: effectivePackageName,
        editId,
      });

      const submissionId = `gp_${Date.now()}_${versionCode}`;
      const submittedAt = new Date();

      // Track in history
      this.trackSubmission(effectivePackageName, {
        submissionId,
        packageName: effectivePackageName,
        track,
        versionCode,
        status: releaseConfig.status as ReleaseStatus,
        submittedAt,
        rolloutPercentage: options?.rolloutPercentage,
      });

      return {
        submissionId,
        packageName: effectivePackageName,
        track,
        versionCode,
        status: releaseConfig.status as ReleaseStatus,
        rolloutPercentage: options?.rolloutPercentage,
        submittedAt,
        storeUrl: `https://play.google.com/store/apps/details?id=${effectivePackageName}`,
      };
    } catch (error) {
      // Cleanup edit on failure
      if (editId) {
        try {
          await this.androidPublisher.edits.delete({
            packageName: effectivePackageName,
            editId,
          });
        } catch (cleanupError) {
          console.error('Failed to cleanup edit after submission error:', cleanupError);
        }
      }

      throw this.handleApiError(error, 'submitForReview');
    }
  }

  /**
   * Get current review/rollout status for a package
   */
  async getReviewStatus(packageName: string): Promise<ReviewStatusResult> {
    const effectivePackageName = packageName || this.config.packageName;

    if (!effectivePackageName) {
      throw new Error('Package name is required');
    }

    let editId: string | null = null;

    try {
      // Create read-only edit session
      const editResponse = await this.androidPublisher.edits.insert({
        packageName: effectivePackageName,
      });

      editId = editResponse.data.id!;

      // Get all tracks to find active releases
      const tracksResponse = await this.androidPublisher.edits.tracks.list({
        packageName: effectivePackageName,
        editId,
      });

      const tracks = tracksResponse.data.tracks || [];
      let activeTrack: TrackType = 'production';
      let activeReleases: ReleaseInfo[] = [];
      let currentStatus: ReviewStatus = 'unknown';
      let currentVersionCode: number | undefined;
      let currentRollout: number | undefined;

      // Process tracks to find current state
      for (const track of tracks) {
        if (!track.releases || track.releases.length === 0) continue;

        const trackName = track.track as TrackType;

        for (const release of track.releases) {
          const releaseInfo: ReleaseInfo = {
            name: release.name || undefined,
            versionCodes: (release.versionCodes || []).map(Number),
            status: release.status as ReleaseStatus,
            rolloutPercentage: release.userFraction ? release.userFraction * 100 : undefined,
            releaseNotes: release.releaseNotes?.map(note => ({
              language: note.language || 'en-US',
              text: note.text || '',
            })),
          };

          activeReleases.push(releaseInfo);

          // Determine review status based on release state
          if (release.status === 'inProgress') {
            activeTrack = trackName;
            currentStatus = 'inReview';
            currentVersionCode = releaseInfo.versionCodes[0];
            currentRollout = releaseInfo.rolloutPercentage;
          } else if (release.status === 'completed' && currentStatus === 'unknown') {
            currentStatus = 'approved';
            currentVersionCode = releaseInfo.versionCodes[0];
            currentRollout = releaseInfo.rolloutPercentage || 100;
          } else if (release.status === 'halted') {
            currentStatus = 'pendingDeveloper';
          }
        }
      }

      // Cleanup edit
      await this.androidPublisher.edits.delete({
        packageName: effectivePackageName,
        editId,
      });

      return {
        packageName: effectivePackageName,
        track: activeTrack,
        status: currentStatus,
        versionCode: currentVersionCode,
        rolloutPercentage: currentRollout,
        lastUpdated: new Date(),
        releases: activeReleases,
        estimatedReviewTime: this.estimateReviewTime(activeTrack),
      };
    } catch (error) {
      if (editId) {
        try {
          await this.androidPublisher.edits.delete({
            packageName: effectivePackageName,
            editId,
          });
        } catch (cleanupError) {
          console.error('Failed to cleanup edit:', cleanupError);
        }
      }

      throw this.handleApiError(error, 'getReviewStatus');
    }
  }

  /**
   * Parse rejection reasons from API response or error
   * Extracts policy violations and prepares data for TCI auto-fix
   */
  parseRejectionReasons(
    response: any,
    packageName?: string
  ): RejectionResult {
    const effectivePackageName = packageName || this.config.packageName || 'unknown';
    const violations: PolicyViolation[] = [];
    let rejected = false;

    // Handle different response formats
    if (!response) {
      return {
        rejected: false,
        packageName: effectivePackageName,
        violations: [],
      };
    }

    // Check for error response format
    if (response.error || response.errors) {
      rejected = true;
      const errors = response.errors || [response.error];

      for (const err of errors) {
        const violation = this.parseErrorToViolation(err);
        if (violation) {
          violations.push(violation);
        }
      }
    }

    // Check for review rejection format
    if (response.reviewResult === 'REJECTED' || response.status === 'rejected') {
      rejected = true;

      if (response.rejectionReasons) {
        for (const reason of response.rejectionReasons) {
          const violation = this.parseReasonToViolation(reason);
          if (violation) {
            violations.push(violation);
          }
        }
      }
    }

    // Check for policy compliance issues
    if (response.policyIssues || response.complianceIssues) {
      rejected = true;
      const issues = response.policyIssues || response.complianceIssues;

      for (const issue of issues) {
        violations.push(this.parsePolicyIssue(issue));
      }
    }

    // Parse raw message if available
    if (response.message && typeof response.message === 'string') {
      const parsedViolations = this.parseMessageForViolations(response.message);
      violations.push(...parsedViolations);
      if (parsedViolations.length > 0) {
        rejected = true;
      }
    }

    // Generate TCI auto-fix data
    const tciAutoFixData = this.generateTCIAutoFixData(violations);

    return {
      rejected,
      packageName: effectivePackageName,
      versionCode: response.versionCode,
      track: response.track,
      rejectedAt: rejected ? new Date() : undefined,
      violations,
      rawResponse: JSON.stringify(response),
      tciAutoFixData: violations.length > 0 ? tciAutoFixData : undefined,
    };
  }

  /**
   * Update rollout percentage for staged rollout
   */
  async updateRollout(
    packageName: string,
    percentage: RolloutPercentage
  ): Promise<RolloutUpdateResult> {
    const effectivePackageName = packageName || this.config.packageName;

    if (!effectivePackageName) {
      throw new Error('Package name is required');
    }

    // Validate percentage
    const validPercentages: RolloutPercentage[] = [1, 5, 10, 20, 50, 100];
    if (!validPercentages.includes(percentage)) {
      throw new Error(
        `Invalid rollout percentage. Must be one of: ${validPercentages.join(', ')}`
      );
    }

    let editId: string | null = null;

    try {
      // Create edit session
      const editResponse = await this.androidPublisher.edits.insert({
        packageName: effectivePackageName,
      });

      editId = editResponse.data.id!;

      // Get current production track
      const trackResponse = await this.androidPublisher.edits.tracks.get({
        packageName: effectivePackageName,
        editId,
        track: 'production',
      });

      const releases = trackResponse.data.releases || [];
      const activeRelease = releases.find(r => r.status === 'inProgress');

      if (!activeRelease) {
        throw new Error('No active staged rollout found on production track');
      }

      const previousPercentage = (activeRelease.userFraction || 0) * 100;
      const versionCode = activeRelease.versionCodes?.[0]
        ? parseInt(activeRelease.versionCodes[0], 10)
        : undefined;

      // Update release with new rollout percentage
      activeRelease.userFraction = percentage === 100 ? undefined : percentage / 100;
      activeRelease.status = percentage === 100 ? 'completed' : 'inProgress';

      // Apply track update
      await this.androidPublisher.edits.tracks.update({
        packageName: effectivePackageName,
        editId,
        track: 'production',
        requestBody: {
          track: 'production',
          releases: [activeRelease],
        },
      });

      // Commit changes
      await this.androidPublisher.edits.commit({
        packageName: effectivePackageName,
        editId,
      });

      return {
        success: true,
        packageName: effectivePackageName,
        track: 'production',
        previousPercentage,
        newPercentage: percentage,
        updatedAt: new Date(),
        versionCode,
      };
    } catch (error) {
      if (editId) {
        try {
          await this.androidPublisher.edits.delete({
            packageName: effectivePackageName,
            editId,
          });
        } catch (cleanupError) {
          console.error('Failed to cleanup edit:', cleanupError);
        }
      }

      throw this.handleApiError(error, 'updateRollout');
    }
  }

  /**
   * Halt an active rollout
   */
  async haltRollout(packageName: string): Promise<RolloutUpdateResult> {
    const effectivePackageName = packageName || this.config.packageName;

    if (!effectivePackageName) {
      throw new Error('Package name is required');
    }

    let editId: string | null = null;

    try {
      const editResponse = await this.androidPublisher.edits.insert({
        packageName: effectivePackageName,
      });

      editId = editResponse.data.id!;

      const trackResponse = await this.androidPublisher.edits.tracks.get({
        packageName: effectivePackageName,
        editId,
        track: 'production',
      });

      const releases = trackResponse.data.releases || [];
      const activeRelease = releases.find(r => r.status === 'inProgress');

      if (!activeRelease) {
        throw new Error('No active rollout to halt');
      }

      const previousPercentage = (activeRelease.userFraction || 0) * 100;

      // Halt the release
      activeRelease.status = 'halted';

      await this.androidPublisher.edits.tracks.update({
        packageName: effectivePackageName,
        editId,
        track: 'production',
        requestBody: {
          track: 'production',
          releases: [activeRelease],
        },
      });

      await this.androidPublisher.edits.commit({
        packageName: effectivePackageName,
        editId,
      });

      return {
        success: true,
        packageName: effectivePackageName,
        track: 'production',
        previousPercentage,
        newPercentage: 1, // Effectively 0 but using valid type
        updatedAt: new Date(),
      };
    } catch (error) {
      if (editId) {
        try {
          await this.androidPublisher.edits.delete({
            packageName: effectivePackageName,
            editId,
          });
        } catch (cleanupError) {
          console.error('Failed to cleanup edit:', cleanupError);
        }
      }

      throw this.handleApiError(error, 'haltRollout');
    }
  }

  /**
   * Get submission history for a package
   */
  async getSubmissionHistory(
    packageName: string,
    options?: {
      limit?: number;
      track?: TrackType;
      includeRejections?: boolean;
    }
  ): Promise<SubmissionHistory> {
    const effectivePackageName = packageName || this.config.packageName;

    if (!effectivePackageName) {
      throw new Error('Package name is required');
    }

    const entries = this.submissionHistory.get(effectivePackageName) || [];

    let filteredEntries = entries;

    // Filter by track if specified
    if (options?.track) {
      filteredEntries = filteredEntries.filter(e => e.track === options.track);
    }

    // Filter out rejections if not requested
    if (options?.includeRejections === false) {
      filteredEntries = filteredEntries.filter(e => !e.rejectionDetails?.rejected);
    }

    // Apply limit
    if (options?.limit && options.limit > 0) {
      filteredEntries = filteredEntries.slice(-options.limit);
    }

    // Calculate statistics
    const successfulSubmissions = entries.filter(e =>
      e.status === 'completed' || e.status === 'approved'
    );
    const successRate = entries.length > 0
      ? (successfulSubmissions.length / entries.length) * 100
      : 0;

    const durationsInHours = entries
      .filter(e => e.duration)
      .map(e => e.duration! / (1000 * 60 * 60));
    const averageReviewTime = durationsInHours.length > 0
      ? durationsInHours.reduce((a, b) => a + b, 0) / durationsInHours.length
      : 24; // Default estimate

    return {
      packageName: effectivePackageName,
      totalSubmissions: entries.length,
      successRate,
      averageReviewTime,
      entries: filteredEntries,
    };
  }

  // ================================
  // Helper Methods
  // ================================

  /**
   * Track submission in local history
   */
  private trackSubmission(
    packageName: string,
    entry: SubmissionHistoryEntry
  ): void {
    const history = this.submissionHistory.get(packageName) || [];
    history.push(entry);
    this.submissionHistory.set(packageName, history);
  }

  /**
   * Update submission status in history
   */
  updateSubmissionStatus(
    packageName: string,
    submissionId: string,
    status: ReleaseStatus | ReviewStatus,
    rejectionDetails?: RejectionResult
  ): void {
    const history = this.submissionHistory.get(packageName);
    if (!history) return;

    const entry = history.find(e => e.submissionId === submissionId);
    if (!entry) return;

    entry.status = status;
    if (rejectionDetails) {
      entry.rejectionDetails = rejectionDetails;
    }
    if (status === 'completed' || status === 'approved' || status === 'rejected') {
      entry.completedAt = new Date();
      entry.duration = entry.completedAt.getTime() - entry.submittedAt.getTime();
    }
  }

  /**
   * Parse error object to policy violation
   */
  private parseErrorToViolation(error: any): PolicyViolation | null {
    if (!error) return null;

    const message = typeof error === 'string' ? error : error.message || error.reason || '';
    const code = error.code || error.reason || 'UNKNOWN_ERROR';

    const category = this.categorizeViolation(message, code);
    const { title, description, suggestedFix, autoFixable } = this.enrichViolation(category, message);

    return {
      code,
      category,
      severity: 'error',
      title,
      description: description || message,
      policyUrl: this.getPolicyUrl(category),
      affectedAreas: this.getAffectedAreas(category),
      suggestedFix,
      autoFixable,
    };
  }

  /**
   * Parse rejection reason to policy violation
   */
  private parseReasonToViolation(reason: any): PolicyViolation | null {
    if (!reason) return null;

    const code = reason.code || reason.type || 'REJECTION_REASON';
    const message = reason.message || reason.description || reason.text || '';
    const category = this.categorizeViolation(message, code);

    return {
      code,
      category,
      severity: reason.severity === 'warning' ? 'warning' : 'error',
      title: reason.title || this.getTitleForCategory(category),
      description: message,
      policyUrl: reason.policyUrl || this.getPolicyUrl(category),
      affectedAreas: reason.affectedAreas || this.getAffectedAreas(category),
      suggestedFix: reason.suggestedFix,
      autoFixable: this.isAutoFixable(category),
    };
  }

  /**
   * Parse policy issue to violation
   */
  private parsePolicyIssue(issue: any): PolicyViolation {
    const code = issue.issueType || issue.code || 'POLICY_ISSUE';
    const category = this.categorizeViolation(issue.description || '', code);

    return {
      code,
      category,
      severity: issue.severity || 'error',
      title: issue.title || this.getTitleForCategory(category),
      description: issue.description || issue.message || '',
      policyUrl: issue.learnMoreUrl || this.getPolicyUrl(category),
      affectedAreas: issue.affectedResources || this.getAffectedAreas(category),
      suggestedFix: issue.remediation,
      autoFixable: this.isAutoFixable(category),
    };
  }

  /**
   * Parse message string for violation patterns
   */
  private parseMessageForViolations(message: string): PolicyViolation[] {
    const violations: PolicyViolation[] = [];
    const lowerMessage = message.toLowerCase();

    // Common violation patterns
    const patterns: { pattern: RegExp; category: PolicyViolationCategory }[] = [
      { pattern: /target.?api.?level|sdk.?version/i, category: 'target_api_level' },
      { pattern: /permission|dangerous.?permission/i, category: 'permissions' },
      { pattern: /privacy|data.?collection|gdpr|ccpa/i, category: 'privacy_data' },
      { pattern: /metadata|description|title|icon|screenshot/i, category: 'metadata' },
      { pattern: /crash|anr|stability|bug/i, category: 'functionality' },
      { pattern: /content.?rating|age.?rating/i, category: 'content_rating' },
      { pattern: /copyright|trademark|intellectual.?property/i, category: 'intellectual_property' },
      { pattern: /families|children|kids/i, category: 'families_policy' },
      { pattern: /deceptive|misleading|spam/i, category: 'deceptive_behavior' },
      { pattern: /malware|virus|security/i, category: 'malware_mobile_unwanted_software' },
    ];

    for (const { pattern, category } of patterns) {
      if (pattern.test(lowerMessage)) {
        violations.push({
          code: `DETECTED_${category.toUpperCase()}`,
          category,
          severity: 'error',
          title: this.getTitleForCategory(category),
          description: message,
          policyUrl: this.getPolicyUrl(category),
          affectedAreas: this.getAffectedAreas(category),
          suggestedFix: this.getSuggestedFix(category),
          autoFixable: this.isAutoFixable(category),
        });
        break; // Only add one violation per message
      }
    }

    return violations;
  }

  /**
   * Categorize violation based on message and code
   */
  private categorizeViolation(message: string, code: string): PolicyViolationCategory {
    const combined = `${message} ${code}`.toLowerCase();

    if (/api.?level|sdk|target/i.test(combined)) return 'target_api_level';
    if (/permission/i.test(combined)) return 'permissions';
    if (/privacy|data|gdpr|ccpa/i.test(combined)) return 'privacy_data';
    if (/metadata|description|icon|screenshot|title/i.test(combined)) return 'metadata';
    if (/crash|anr|stability|performance/i.test(combined)) return 'functionality';
    if (/content.?rating|age/i.test(combined)) return 'content_rating';
    if (/copyright|trademark|ip/i.test(combined)) return 'intellectual_property';
    if (/families|children|kids/i.test(combined)) return 'families_policy';
    if (/deceptive|misleading/i.test(combined)) return 'deceptive_behavior';
    if (/malware|security/i.test(combined)) return 'malware_mobile_unwanted_software';
    if (/gambling|betting/i.test(combined)) return 'gambling';
    if (/financial|crypto|payment/i.test(combined)) return 'financial_instruments';

    return 'unknown';
  }

  /**
   * Get human-readable title for category
   */
  private getTitleForCategory(category: PolicyViolationCategory): string {
    const titles: Record<PolicyViolationCategory, string> = {
      content_rating: 'Content Rating Issue',
      intellectual_property: 'Intellectual Property Violation',
      privacy_data: 'Privacy & Data Policy Violation',
      deceptive_behavior: 'Deceptive Behavior',
      malware_mobile_unwanted_software: 'Security Concern',
      sensitive_events: 'Sensitive Events Policy',
      financial_instruments: 'Financial Services Policy',
      gambling: 'Gambling Policy Violation',
      illegal_activities: 'Illegal Activities',
      user_generated_content: 'User Generated Content Policy',
      metadata: 'Store Listing Issue',
      functionality: 'App Functionality Issue',
      target_api_level: 'Target API Level Requirement',
      permissions: 'Permissions Issue',
      families_policy: 'Families Policy Violation',
      unknown: 'Policy Violation',
    };

    return titles[category];
  }

  /**
   * Get policy documentation URL
   */
  private getPolicyUrl(category: PolicyViolationCategory): string {
    const baseUrl = 'https://support.google.com/googleplay/android-developer/answer';

    const policyUrls: Partial<Record<PolicyViolationCategory, string>> = {
      privacy_data: `${baseUrl}/9888076`,
      metadata: `${baseUrl}/9898842`,
      target_api_level: `${baseUrl}/11926878`,
      permissions: `${baseUrl}/9888170`,
      families_policy: `${baseUrl}/9893335`,
      content_rating: `${baseUrl}/9859655`,
      deceptive_behavior: `${baseUrl}/9888077`,
    };

    return policyUrls[category] || 'https://play.google.com/about/developer-content-policy/';
  }

  /**
   * Get affected areas for a violation category
   */
  private getAffectedAreas(category: PolicyViolationCategory): string[] {
    const areas: Record<PolicyViolationCategory, string[]> = {
      content_rating: ['app_content', 'questionnaire'],
      intellectual_property: ['app_content', 'assets', 'metadata'],
      privacy_data: ['privacy_policy', 'data_safety', 'permissions'],
      deceptive_behavior: ['app_behavior', 'metadata', 'ads'],
      malware_mobile_unwanted_software: ['app_code', 'dependencies', 'behavior'],
      sensitive_events: ['app_content', 'metadata'],
      financial_instruments: ['app_functionality', 'compliance'],
      gambling: ['app_functionality', 'age_restriction'],
      illegal_activities: ['app_content', 'functionality'],
      user_generated_content: ['moderation', 'reporting'],
      metadata: ['store_listing', 'screenshots', 'description'],
      functionality: ['app_code', 'stability', 'performance'],
      target_api_level: ['build_config', 'gradle', 'manifest'],
      permissions: ['manifest', 'runtime_permissions', 'privacy_policy'],
      families_policy: ['app_content', 'ads', 'data_collection'],
      unknown: ['general'],
    };

    return areas[category];
  }

  /**
   * Get suggested fix for category
   */
  private getSuggestedFix(category: PolicyViolationCategory): string {
    const fixes: Record<PolicyViolationCategory, string> = {
      content_rating: 'Complete or update the content rating questionnaire in Play Console',
      intellectual_property: 'Remove copyrighted content or obtain proper licensing',
      privacy_data: 'Update privacy policy and data safety form; ensure compliant data handling',
      deceptive_behavior: 'Review app behavior and metadata for accuracy',
      malware_mobile_unwanted_software: 'Audit dependencies and remove any suspicious code',
      sensitive_events: 'Review content for sensitivity guidelines',
      financial_instruments: 'Ensure compliance with financial regulations',
      gambling: 'Verify gambling license requirements and age restrictions',
      illegal_activities: 'Remove any content promoting illegal activities',
      user_generated_content: 'Implement content moderation and reporting features',
      metadata: 'Update store listing to meet guidelines',
      functionality: 'Fix crashes and ensure app stability',
      target_api_level: 'Update targetSdkVersion in build.gradle to meet requirements',
      permissions: 'Review and justify permissions; update privacy policy',
      families_policy: 'Ensure app meets Families program requirements',
      unknown: 'Review the specific violation details and policy guidelines',
    };

    return fixes[category];
  }

  /**
   * Check if violation category can be auto-fixed by TCI
   */
  private isAutoFixable(category: PolicyViolationCategory): boolean {
    const autoFixableCategories: PolicyViolationCategory[] = [
      'metadata',
      'target_api_level',
      'functionality', // Some crashes can be auto-fixed
    ];

    return autoFixableCategories.includes(category);
  }

  /**
   * Enrich violation with additional details
   */
  private enrichViolation(
    category: PolicyViolationCategory,
    message: string
  ): { title: string; description?: string; suggestedFix?: string; autoFixable: boolean } {
    return {
      title: this.getTitleForCategory(category),
      suggestedFix: this.getSuggestedFix(category),
      autoFixable: this.isAutoFixable(category),
    };
  }

  /**
   * Generate TCI auto-fix data for violations
   */
  private generateTCIAutoFixData(violations: PolicyViolation[]): TCIAutoFixData {
    const fixableViolations = violations.filter(v => v.autoFixable);

    const suggestedPatches: SuggestedPatch[] = fixableViolations.map(v => ({
      violationCode: v.code,
      patchType: this.getPatchType(v.category),
      filePath: this.getAffectedFilePath(v.category),
      description: v.suggestedFix || 'Manual review required',
      priority: v.severity === 'error' ? 'high' : 'medium',
    }));

    const estimatedMinutes = fixableViolations.length * 5 +
      violations.filter(v => !v.autoFixable).length * 30;

    return {
      fixableViolations,
      suggestedPatches,
      estimatedFixTime: `${estimatedMinutes} minutes`,
      confidence: fixableViolations.length / Math.max(violations.length, 1),
    };
  }

  /**
   * Get patch type for a violation category
   */
  private getPatchType(category: PolicyViolationCategory): SuggestedPatch['patchType'] {
    const patchTypes: Record<PolicyViolationCategory, SuggestedPatch['patchType']> = {
      target_api_level: 'manifest',
      permissions: 'manifest',
      metadata: 'metadata',
      functionality: 'code',
      content_rating: 'metadata',
      privacy_data: 'policy',
      intellectual_property: 'asset',
      deceptive_behavior: 'metadata',
      malware_mobile_unwanted_software: 'code',
      sensitive_events: 'metadata',
      financial_instruments: 'policy',
      gambling: 'policy',
      illegal_activities: 'code',
      user_generated_content: 'code',
      families_policy: 'policy',
      unknown: 'code',
    };

    return patchTypes[category];
  }

  /**
   * Get affected file path for a violation category
   */
  private getAffectedFilePath(category: PolicyViolationCategory): string | undefined {
    const filePaths: Partial<Record<PolicyViolationCategory, string>> = {
      target_api_level: 'android/app/build.gradle',
      permissions: 'android/app/src/main/AndroidManifest.xml',
      functionality: 'src/',
    };

    return filePaths[category];
  }

  /**
   * Estimate review time based on track
   */
  private estimateReviewTime(track: TrackType): string {
    const estimates: Record<TrackType, string> = {
      internal: 'Instant (no review)',
      alpha: '1-2 hours',
      beta: '2-4 hours',
      production: '1-7 days',
    };

    return estimates[track];
  }

  /**
   * Handle API errors consistently
   */
  private handleApiError(error: unknown, operation: string): Error {
    if (error instanceof Error) {
      // Check for specific Google API errors
      const anyError = error as any;

      if (anyError.code === 401 || anyError.code === 403) {
        return new Error(
          `Authentication failed for ${operation}. Check GOOGLE_SERVICE_ACCOUNT_KEY permissions.`
        );
      }

      if (anyError.code === 404) {
        return new Error(
          `Resource not found during ${operation}. Verify package name exists in Play Console.`
        );
      }

      if (anyError.errors && Array.isArray(anyError.errors)) {
        const messages = anyError.errors.map((e: any) => e.message).join('; ');
        return new Error(`${operation} failed: ${messages}`);
      }

      return new Error(`${operation} failed: ${error.message}`);
    }

    return new Error(`${operation} failed with unknown error`);
  }

  /**
   * Validate service account key format
   */
  static validateServiceAccountKey(key: string): { valid: boolean; error?: string } {
    try {
      const parsed = JSON.parse(key);

      if (!parsed.client_email) {
        return { valid: false, error: 'Missing client_email field' };
      }

      if (!parsed.private_key) {
        return { valid: false, error: 'Missing private_key field' };
      }

      if (!parsed.private_key.includes('BEGIN PRIVATE KEY')) {
        return { valid: false, error: 'Invalid private_key format' };
      }

      return { valid: true };
    } catch {
      return { valid: false, error: 'Invalid JSON format' };
    }
  }
}

export default GooglePlayStoreService;

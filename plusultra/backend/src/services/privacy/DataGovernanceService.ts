/**
 * Data Governance Controls - Privacy and data usage management for PlusUltra
 * Handles user consent, data processing preferences, and GDPR compliance
 */

export interface DataProcessingConsent {
  id: string;
  userId: string;
  consentType: 'analytics' | 'model_training' | 'personalization' | 'marketing';
  granted: boolean;
  grantedAt?: Date;
  revokedAt?: Date;
  version: string; // Consent version for tracking changes
  ipAddress?: string;
  userAgent?: string;
}

export interface PrivacySettings {
  userId: string;
  allowAnalytics: boolean;
  allowModelTraining: boolean;
  allowPersonalization: boolean;
  allowMarketing: boolean;
  dataRetentionPreference: 'minimal' | 'standard' | 'extended';
  cookiePreferences: {
    essential: boolean; // Always true, cannot be disabled
    analytics: boolean;
    marketing: boolean;
    personalization: boolean;
  };
  communicationPreferences: {
    email: boolean;
    sms: boolean;
    push: boolean;
  };
  lastUpdated: Date;
}

export interface DataExportRequest {
  id: string;
  userId: string;
  requestType: 'export' | 'deletion';
  status: 'pending' | 'processing' | 'completed' | 'failed';
  requestedAt: Date;
  completedAt?: Date;
  downloadUrl?: string;
  expiresAt?: Date;
}

/**
 * Data Governance Service - Manages user privacy and data processing consent
 */
export class DataGovernanceService {
  private consentStore = new Map<string, DataProcessingConsent[]>();
  private settingsStore = new Map<string, PrivacySettings>();
  private exportRequests = new Map<string, DataExportRequest>();

  /**
   * Record user consent for data processing
   */
  async recordConsent(
    userId: string,
    consentType: DataProcessingConsent['consentType'],
    granted: boolean,
    metadata?: { ipAddress?: string; userAgent?: string }
  ): Promise<void> {
    const existingConsents = this.consentStore.get(userId) || [];

    // Find existing consent of this type
    const existingConsent = existingConsents.find(c => c.consentType === consentType);

    if (existingConsent) {
      // Update existing consent
      existingConsent.granted = granted;
      existingConsent.grantedAt = granted ? new Date() : undefined;
      existingConsent.revokedAt = granted ? undefined : new Date();
      existingConsent.version = this.getCurrentConsentVersion();
      if (metadata) {
        existingConsent.ipAddress = metadata.ipAddress;
        existingConsent.userAgent = metadata.userAgent;
      }
    } else {
      // Create new consent record
      const newConsent: DataProcessingConsent = {
        id: this.generateConsentId(),
        userId,
        consentType,
        granted,
        grantedAt: granted ? new Date() : undefined,
        revokedAt: granted ? undefined : new Date(),
        version: this.getCurrentConsentVersion(),
        ipAddress: metadata?.ipAddress,
        userAgent: metadata?.userAgent
      };

      existingConsents.push(newConsent);
    }

    this.consentStore.set(userId, existingConsents);

    console.log(`📋 Consent ${granted ? 'granted' : 'revoked'} for ${consentType} by user ${userId}`);
  }

  /**
   * Get user's current privacy settings
   */
  async getPrivacySettings(userId: string): Promise<PrivacySettings | null> {
    return this.settingsStore.get(userId) || null;
  }

  /**
   * Update user's privacy settings
   */
  async updatePrivacySettings(userId: string, settings: Partial<PrivacySettings>): Promise<void> {
    const currentSettings = this.settingsStore.get(userId) || this.getDefaultPrivacySettings(userId);

    const updatedSettings: PrivacySettings = {
      ...currentSettings,
      ...settings,
      lastUpdated: new Date()
    };

    this.settingsStore.set(userId, updatedSettings);

    // Update corresponding consents based on settings
    await this.recordConsent(userId, 'analytics', updatedSettings.allowAnalytics);
    await this.recordConsent(userId, 'model_training', updatedSettings.allowModelTraining);
    await this.recordConsent(userId, 'personalization', updatedSettings.allowPersonalization);
    await this.recordConsent(userId, 'marketing', updatedSettings.allowMarketing);

    console.log(`⚙️ Privacy settings updated for user ${userId}`);
  }

  /**
   * Check if user has consented to specific data processing
   */
  async hasConsent(userId: string, consentType: DataProcessingConsent['consentType']): Promise<boolean> {
    const consents = this.consentStore.get(userId) || [];
    const consent = consents.find(c => c.consentType === consentType);

    return consent?.granted || false;
  }

  /**
   * Request data export or deletion
   */
  async requestDataExport(userId: string, requestType: 'export' | 'deletion'): Promise<string> {
    const requestId = this.generateRequestId();

    const request: DataExportRequest = {
      id: requestId,
      userId,
      requestType,
      status: 'pending',
      requestedAt: new Date()
    };

    this.exportRequests.set(requestId, request);

    // Process request asynchronously
    this.processDataRequest(requestId).catch(console.error);

    console.log(`📤 ${requestType} request created for user ${userId}: ${requestId}`);

    return requestId;
  }

  /**
   * Get data export request status
   */
  async getDataExportStatus(requestId: string): Promise<DataExportRequest | null> {
    return this.exportRequests.get(requestId) || null;
  }

  /**
   * Process data export/deletion request
   */
  private async processDataRequest(requestId: string): Promise<void> {
    const request = this.exportRequests.get(requestId);
    if (!request) return;

    try {
      request.status = 'processing';

      if (request.requestType === 'export') {
        await this.generateDataExport(request);
      } else {
        await this.processDataDeletion(request);
      }

      request.status = 'completed';
      request.completedAt = new Date();

      // Set expiry for export downloads
      if (request.requestType === 'export' && request.downloadUrl) {
        request.expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
      }

    } catch (error) {
      console.error(`Failed to process ${request.requestType} request ${requestId}:`, error);
      request.status = 'failed';
    }
  }

  /**
   * Generate comprehensive data export
   */
  private async generateDataExport(request: DataExportRequest): Promise<void> {
    // Collect all user data
    const userData = {
      profile: await this.getUserProfileData(request.userId),
      consents: this.consentStore.get(request.userId) || [],
      settings: this.settingsStore.get(request.userId),
      activity: await this.getUserActivityData(request.userId),
      generatedApps: await this.getUserGeneratedApps(request.userId),
      timestamp: new Date().toISOString()
    };

    // Generate secure download URL (in production, upload to secure storage)
    request.downloadUrl = await this.uploadDataExport(userData, request.id);

    console.log(`📦 Data export generated for user ${request.userId}`);
  }

  /**
   * Process data deletion request
   */
  private async processDataDeletion(request: DataExportRequest): Promise<void> {
    // Anonymize or delete user data based on retention policies
    await this.anonymizeUserData(request.userId);

    console.log(`🗑️ Data deletion processed for user ${request.userId}`);
  }

  /**
   * Check if data processing is allowed for user
   */
  async canProcessData(userId: string, dataType: DataProcessingConsent['consentType']): Promise<boolean> {
    // Check consent
    const hasConsent = await this.hasConsent(userId, dataType);

    // Check if user has opted out of data processing
    const settings = await this.getPrivacySettings(userId);
    if (settings) {
      switch (dataType) {
        case 'analytics':
          return hasConsent && settings.allowAnalytics;
        case 'model_training':
          return hasConsent && settings.allowModelTraining;
        case 'personalization':
          return hasConsent && settings.allowPersonalization;
        case 'marketing':
          return hasConsent && settings.allowMarketing;
      }
    }

    return hasConsent;
  }

  /**
   * Get GDPR compliance status for user
   */
  async getGDPRComplianceStatus(userId: string): Promise<{
    isCompliant: boolean;
    missingConsents: string[];
    dataRetentionDays: number;
    hasExportRequest: boolean;
    lastConsentUpdate: Date | null;
  }> {
    const consents = this.consentStore.get(userId) || [];
    const settings = await this.getPrivacySettings(userId);

    const requiredConsents = ['analytics', 'model_training', 'personalization'];
    const missingConsents = requiredConsents.filter(type => {
      const consent = consents.find(c => c.consentType === type);
      return !consent || !consent.granted;
    });

    const lastConsentUpdate = consents.length > 0
      ? new Date(Math.max(...consents.map(c => c.grantedAt?.getTime() || 0)))
      : null;

    return {
      isCompliant: missingConsents.length === 0 && !!settings,
      missingConsents,
      dataRetentionDays: this.getDataRetentionDays(settings?.dataRetentionPreference || 'standard'),
      hasExportRequest: Array.from(this.exportRequests.values()).some(r => r.userId === userId),
      lastConsentUpdate
    };
  }

  // Helper methods
  private getDefaultPrivacySettings(userId: string): PrivacySettings {
    return {
      userId,
      allowAnalytics: true,
      allowModelTraining: true,
      allowPersonalization: true,
      allowMarketing: false,
      dataRetentionPreference: 'standard',
      cookiePreferences: {
        essential: true,
        analytics: true,
        marketing: false,
        personalization: true
      },
      communicationPreferences: {
        email: true,
        sms: false,
        push: true
      },
      lastUpdated: new Date()
    };
  }

  private generateConsentId(): string {
    return `consent_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateRequestId(): string {
    return `export_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private getCurrentConsentVersion(): string {
    return '1.0'; // In production, this would be versioned
  }

  private getDataRetentionDays(preference: string): number {
    switch (preference) {
      case 'minimal': return 90;
      case 'standard': return 365;
      case 'extended': return 730;
      default: return 365;
    }
  }

  private async getUserProfileData(userId: string): Promise<any> {
    // In production, fetch from user database
    return { userId, email: 'user@example.com' };
  }

  private async getUserActivityData(userId: string): Promise<any[]> {
    // In production, fetch from activity logs
    return [];
  }

  private async getUserGeneratedApps(userId: string): Promise<any[]> {
    // In production, fetch from app generation history
    return [];
  }

  private async uploadDataExport(data: any, requestId: string): Promise<string> {
    // In production, upload to secure cloud storage and return signed URL
    return `https://storage.plusultra.dev/exports/${requestId}.json`;
  }

  private async anonymizeUserData(userId: string): Promise<void> {
    // In production, anonymize or delete user data according to retention policies
    console.log(`Anonymizing data for user ${userId}`);
  }
}

// Initialize global instance
export const dataGovernanceService = new DataGovernanceService();

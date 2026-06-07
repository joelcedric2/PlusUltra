import * as fs from 'fs/promises';
import * as path from 'path';

export interface User {
  id: string;
  email: string;
  roles: string[];
  permissions: Permission[];
  workspaceId?: string;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt?: Date;
  isActive: boolean;
}

export interface Permission {
  resource: string;
  action: string;
  conditions?: Record<string, any>;
}

export interface Role {
  id: string;
  name: string;
  description: string;
  permissions: Permission[];
  isSystem: boolean;
  createdAt: Date;
}

export interface AuditEvent {
  id: string;
  timestamp: Date;
  userId?: string;
  workspaceId?: string;
  eventType: string;
  resource: string;
  action: string;
  details: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
  success: boolean;
  errorMessage?: string;
  sessionId?: string;
}

export interface ComplianceReport {
  id: string;
  type: 'GDPR' | 'HIPAA' | 'SOX' | 'PCI-DSS' | 'CCPA';
  workspaceId?: string;
  period: {
    start: Date;
    end: Date;
  };
  findings: ComplianceFinding[];
  score: number;
  status: 'compliant' | 'non-compliant' | 'partial';
  generatedAt: Date;
  generatedBy: string;
}

export interface ComplianceFinding {
  regulation: string;
  requirement: string;
  status: 'compliant' | 'non-compliant' | 'not-applicable';
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  evidence: string[];
  remediation: string;
  dueDate?: Date;
}

export class RBACService {
  private users: Map<string, User> = new Map();
  private roles: Map<string, Role> = new Map();
  private auditEvents: AuditEvent[] = [];
  private complianceReports: Map<string, ComplianceReport> = new Map();

  constructor() {
    this.initializeSystemRoles();
  }

  /**
   * Initialize system roles and permissions
   */
  private initializeSystemRoles(): void {
    const systemRoles: Role[] = [
      {
        id: 'admin',
        name: 'Administrator',
        description: 'Full system access with all permissions',
        permissions: [
          { resource: '*', action: '*' }
        ],
        isSystem: true,
        createdAt: new Date()
      },
      {
        id: 'workspace-owner',
        name: 'Workspace Owner',
        description: 'Full access to workspace resources',
        permissions: [
          { resource: 'workspace', action: '*' },
          { resource: 'projects', action: '*' },
          { resource: 'users', action: 'read' },
          { resource: 'billing', action: '*' },
          { resource: 'exports', action: '*' }
        ],
        isSystem: true,
        createdAt: new Date()
      },
      {
        id: 'workspace-member',
        name: 'Workspace Member',
        description: 'Standard workspace access',
        permissions: [
          { resource: 'workspace', action: 'read' },
          { resource: 'projects', action: 'read' },
          { resource: 'projects', action: 'create' },
          { resource: 'exports', action: 'create' },
          { resource: 'exports', action: 'read' }
        ],
        isSystem: true,
        createdAt: new Date()
      },
      {
        id: 'viewer',
        name: 'Viewer',
        description: 'Read-only access to workspace',
        permissions: [
          { resource: 'workspace', action: 'read' },
          { resource: 'projects', action: 'read' }
        ],
        isSystem: true,
        createdAt: new Date()
      }
    ];

    systemRoles.forEach(role => {
      this.roles.set(role.id, role);
    });
  }

  /**
   * Create a new user
   */
  async createUser(userData: {
    id: string;
    email: string;
    roles: string[];
    workspaceId?: string;
  }): Promise<User> {
    const user: User = {
      id: userData.id,
      email: userData.email,
      roles: userData.roles,
      permissions: this.resolvePermissions(userData.roles),
      workspaceId: userData.workspaceId,
      createdAt: new Date(),
      updatedAt: new Date(),
      isActive: true
    };

    this.users.set(user.id, user);

    // Audit the user creation
    await this.auditAction({
      userId: user.id,
      eventType: 'user.created',
      resource: 'users',
      action: 'create',
      details: { email: user.email, roles: user.roles },
      success: true
    });

    return user;
  }

  /**
   * Check if user has permission for action
   */
  async checkPermission(userId: string, resource: string, action: string, context?: Record<string, any>): Promise<boolean> {
    const user = this.users.get(userId);
    if (!user || !user.isActive) {
      return false;
    }

    // Check if user has explicit permission
    const hasPermission = user.permissions.some(permission => {
      const resourceMatch = permission.resource === '*' || permission.resource === resource;
      const actionMatch = permission.action === '*' || permission.action === action;

      if (!resourceMatch || !actionMatch) {
        return false;
      }

      // Check conditions if they exist
      if (permission.conditions) {
        return this.evaluateConditions(permission.conditions, context);
      }

      return true;
    });

    // Audit the permission check
    await this.auditAction({
      userId,
      eventType: 'permission.checked',
      resource,
      action,
      details: { granted: hasPermission, context },
      success: hasPermission
    });

    return hasPermission;
  }

  /**
   * Get user roles and permissions
   */
  async getUserPermissions(userId: string): Promise<{
    user: User;
    roles: Role[];
    permissions: Permission[];
  }> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const roles = user.roles.map(roleId => this.roles.get(roleId)).filter(Boolean) as Role[];

    return {
      user,
      roles,
      permissions: user.permissions
    };
  }

  /**
   * Update user roles
   */
  async updateUserRoles(userId: string, roles: string[]): Promise<User> {
    const user = this.users.get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const oldRoles = [...user.roles];
    user.roles = roles;
    user.permissions = this.resolvePermissions(roles);
    user.updatedAt = new Date();

    // Audit the role change
    await this.auditAction({
      userId,
      eventType: 'user.roles.updated',
      resource: 'users',
      action: 'update',
      details: { oldRoles, newRoles: roles },
      success: true
    });

    return user;
  }

  /**
   * Resolve permissions from roles
   */
  private resolvePermissions(roles: string[]): Permission[] {
    const permissions: Permission[] = [];

    roles.forEach(roleId => {
      const role = this.roles.get(roleId);
      if (role) {
        permissions.push(...role.permissions);
      }
    });

    // Remove duplicates
    return permissions.filter((permission, index, self) =>
      index === self.findIndex(p =>
        p.resource === permission.resource && p.action === permission.action
      )
    );
  }

  /**
   * Evaluate permission conditions
   */
  private evaluateConditions(conditions: Record<string, any>, context?: Record<string, any>): boolean {
    if (!context) return true;

    for (const [key, expectedValue] of Object.entries(conditions)) {
      const actualValue = context[key];

      if (Array.isArray(expectedValue)) {
        if (!expectedValue.includes(actualValue)) {
          return false;
        }
      } else if (actualValue !== expectedValue) {
        return false;
      }
    }

    return true;
  }

  /**
   * Audit an action
   */
  async auditAction(event: {
    userId?: string;
    workspaceId?: string;
    eventType: string;
    resource: string;
    action: string;
    details: Record<string, any>;
    success: boolean;
    errorMessage?: string;
    sessionId?: string;
  }): Promise<string> {
    const auditEvent: AuditEvent = {
      id: `audit_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      userId: event.userId,
      workspaceId: event.workspaceId,
      eventType: event.eventType,
      resource: event.resource,
      action: event.action,
      details: event.details,
      success: event.success,
      errorMessage: event.errorMessage,
      sessionId: event.sessionId
    };

    this.auditEvents.push(auditEvent);

    // Keep only recent events (last 10000)
    if (this.auditEvents.length > 10000) {
      this.auditEvents = this.auditEvents.slice(-10000);
    }

    return auditEvent.id;
  }

  /**
   * Get audit events with filtering
   */
  async getAuditEvents(filters?: {
    userId?: string;
    workspaceId?: string;
    eventType?: string;
    resource?: string;
    action?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
  }): Promise<AuditEvent[]> {
    let events = [...this.auditEvents];

    if (filters?.userId) {
      events = events.filter(e => e.userId === filters.userId);
    }

    if (filters?.workspaceId) {
      events = events.filter(e => e.workspaceId === filters.workspaceId);
    }

    if (filters?.eventType) {
      events = events.filter(e => e.eventType === filters.eventType);
    }

    if (filters?.resource) {
      events = events.filter(e => e.resource === filters.resource);
    }

    if (filters?.action) {
      events = events.filter(e => e.action === filters.action);
    }

    if (filters?.startDate) {
      events = events.filter(e => e.timestamp >= filters.startDate!);
    }

    if (filters?.endDate) {
      events = events.filter(e => e.timestamp <= filters.endDate!);
    }

    // Sort by timestamp (newest first)
    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    if (filters?.limit) {
      events = events.slice(0, filters.limit);
    }

    return events;
  }

  /**
   * Generate compliance report
   */
  async generateComplianceReport(
    type: ComplianceReport['type'],
    workspaceId?: string,
    period?: { start: Date; end: Date }
  ): Promise<ComplianceReport> {
    const reportId = `compliance_${type}_${Date.now()}`;
    const reportPeriod = period || {
      start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
      end: new Date()
    };

    const findings = await this.analyzeCompliance(type, workspaceId, reportPeriod);

    const compliantFindings = findings.filter(f => f.status === 'compliant').length;
    const totalFindings = findings.length;
    const score = totalFindings > 0 ? (compliantFindings / totalFindings) * 100 : 100;

    const report: ComplianceReport = {
      id: reportId,
      type,
      workspaceId,
      period: reportPeriod,
      findings,
      score,
      status: score >= 90 ? 'compliant' : score >= 70 ? 'partial' : 'non-compliant',
      generatedAt: new Date(),
      generatedBy: 'system'
    };

    this.complianceReports.set(reportId, report);
    return report;
  }

  /**
   * Analyze compliance for specific regulation
   */
  private async analyzeCompliance(
    regulation: ComplianceReport['type'],
    workspaceId?: string,
    period?: { start: Date; end: Date }
  ): Promise<ComplianceFinding[]> {
    const findings: ComplianceFinding[] = [];

    // Get relevant audit events
    const events = await this.getAuditEvents({
      workspaceId,
      startDate: period?.start,
      endDate: period?.end
    });

    switch (regulation) {
      case 'GDPR':
        findings.push(...this.analyzeGDPRCompliance(events));
        break;
      case 'HIPAA':
        findings.push(...this.analyzeHIPAACompliance(events));
        break;
      case 'SOX':
        findings.push(...this.analyzeSOXCompliance(events));
        break;
      case 'PCI-DSS':
        findings.push(...this.analyzePCIDSSCompliance(events));
        break;
      case 'CCPA':
        findings.push(...this.analyzeCCPACompliance(events));
        break;
    }

    return findings;
  }

  /**
   * Analyze GDPR compliance
   */
  private analyzeGDPRCompliance(events: AuditEvent[]): ComplianceFinding[] {
    const findings: ComplianceFinding[] = [];

    // Check for data processing activities
    const dataProcessingEvents = events.filter(e =>
      e.resource.includes('user') || e.resource.includes('data')
    );

    findings.push({
      regulation: 'GDPR',
      requirement: 'Article 5 - Principles relating to processing of personal data',
      status: dataProcessingEvents.length > 0 ? 'compliant' : 'not-applicable',
      severity: 'high',
      description: 'Personal data processing must be lawful, fair, and transparent',
      evidence: dataProcessingEvents.map(e => `Event: ${e.eventType} at ${e.timestamp.toISOString()}`),
      remediation: 'Ensure all personal data processing has a lawful basis'
    });

    // Check for consent management
    const consentEvents = events.filter(e => e.eventType.includes('consent'));
    findings.push({
      regulation: 'GDPR',
      requirement: 'Article 7 - Conditions for consent',
      status: consentEvents.length > 0 ? 'compliant' : 'non-compliant',
      severity: 'critical',
      description: 'Consent must be freely given, specific, informed, and unambiguous',
      evidence: consentEvents.length > 0 ? [`${consentEvents.length} consent events recorded`] : ['No consent events found'],
      remediation: 'Implement proper consent management system'
    });

    return findings;
  }

  /**
   * Analyze HIPAA compliance
   */
  private analyzeHIPAACompliance(events: AuditEvent[]): ComplianceFinding[] {
    const findings: ComplianceFinding[] = [];

    // Check for PHI access logging
    const phiAccessEvents = events.filter(e =>
      e.resource.includes('health') || e.resource.includes('medical') || e.details.phi === true
    );

    findings.push({
      regulation: 'HIPAA',
      requirement: 'Security Rule §164.312 - Audit Controls',
      status: phiAccessEvents.length > 0 ? 'compliant' : 'not-applicable',
      severity: 'high',
      description: 'Implement hardware, software, and/or procedural mechanisms to record and examine activity in information systems',
      evidence: phiAccessEvents.map(e => `PHI access: ${e.eventType} at ${e.timestamp.toISOString()}`),
      remediation: 'Ensure all PHI access is logged and auditable'
    });

    return findings;
  }

  /**
   * Analyze SOX compliance
   */
  private analyzeSOXCompliance(events: AuditEvent[]): ComplianceFinding[] {
    const findings: ComplianceFinding[] = [];

    // Check for financial data access
    const financialEvents = events.filter(e =>
      e.resource.includes('billing') || e.resource.includes('payment') || e.resource.includes('financial')
    );

    findings.push({
      regulation: 'SOX',
      requirement: 'Section 404 - Internal Control over Financial Reporting',
      status: financialEvents.length > 0 ? 'compliant' : 'not-applicable',
      severity: 'high',
      description: 'Management must establish and maintain adequate internal control over financial reporting',
      evidence: financialEvents.map(e => `Financial event: ${e.eventType} at ${e.timestamp.toISOString()}`),
      remediation: 'Implement proper financial controls and audit trails'
    });

    return findings;
  }

  /**
   * Analyze PCI-DSS compliance
   */
  private analyzePCIDSSCompliance(events: AuditEvent[]): ComplianceFinding[] {
    const findings: ComplianceFinding[] = [];

    // Check for payment data handling
    const paymentEvents = events.filter(e =>
      e.resource.includes('payment') || e.resource.includes('card') || e.resource.includes('billing')
    );

    findings.push({
      regulation: 'PCI-DSS',
      requirement: 'Requirement 10 - Track and monitor all access to network resources and cardholder data',
      status: paymentEvents.length > 0 ? 'compliant' : 'not-applicable',
      severity: 'high',
      description: 'Logging mechanisms and the ability to track user activities are critical',
      evidence: paymentEvents.map(e => `Payment event: ${e.eventType} at ${e.timestamp.toISOString()}`),
      remediation: 'Ensure all payment data access is logged'
    });

    return findings;
  }

  /**
   * Analyze CCPA compliance
   */
  private analyzeCCPACompliance(events: AuditEvent[]): ComplianceFinding[] {
    const findings: ComplianceFinding[] = [];

    // Check for data deletion requests
    const deletionEvents = events.filter(e => e.eventType.includes('delete') || e.eventType.includes('remove'));

    findings.push({
      regulation: 'CCPA',
      requirement: 'Right to Deletion (California Civil Code §1798.105)',
      status: deletionEvents.length > 0 ? 'compliant' : 'not-applicable',
      severity: 'medium',
      description: 'Consumers have the right to request deletion of their personal information',
      evidence: deletionEvents.length > 0 ? [`${deletionEvents.length} deletion events processed`] : ['No deletion events found'],
      remediation: 'Implement data deletion request handling'
    });

    return findings;
  }

  /**
   * Get compliance reports
   */
  async getComplianceReports(filters?: {
    type?: ComplianceReport['type'];
    workspaceId?: string;
    status?: ComplianceReport['status'];
  }): Promise<ComplianceReport[]> {
    let reports = Array.from(this.complianceReports.values());

    if (filters?.type) {
      reports = reports.filter(r => r.type === filters.type);
    }

    if (filters?.workspaceId) {
      reports = reports.filter(r => r.workspaceId === filters.workspaceId);
    }

    if (filters?.status) {
      reports = reports.filter(r => r.status === filters.status);
    }

    return reports.sort((a, b) => b.generatedAt.getTime() - a.generatedAt.getTime());
  }

  /**
   * Export audit logs
   */
  async exportAuditLogs(format: 'json' | 'csv' = 'json'): Promise<string> {
    const exportData = {
      events: this.auditEvents,
      summary: {
        totalEvents: this.auditEvents.length,
        uniqueUsers: new Set(this.auditEvents.map(e => e.userId).filter(Boolean)).size,
        dateRange: {
          earliest: this.auditEvents.length > 0 ? this.auditEvents[this.auditEvents.length - 1].timestamp : null,
          latest: this.auditEvents.length > 0 ? this.auditEvents[0].timestamp : null
        }
      },
      exportedAt: new Date().toISOString()
    };

    if (format === 'csv') {
      // Convert to CSV format
      const headers = ['timestamp', 'userId', 'workspaceId', 'eventType', 'resource', 'action', 'success', 'details'];
      const csvRows = [
        headers.join(','),
        ...this.auditEvents.map(event =>
          [
            event.timestamp.toISOString(),
            event.userId || '',
            event.workspaceId || '',
            event.eventType,
            event.resource,
            event.action,
            event.success.toString(),
            JSON.stringify(event.details).replace(/,/g, ';')
          ].join(',')
        )
      ];

      return csvRows.join('\n');
    }

    return JSON.stringify(exportData, null, 2);
  }

  /**
   * Cleanup old audit events
   */
  async cleanupOldAuditEvents(maxAge: number = 90 * 24 * 60 * 60 * 1000): Promise<void> {
    const cutoffTime = Date.now() - maxAge;
    this.auditEvents = this.auditEvents.filter(event => event.timestamp.getTime() > cutoffTime);

    console.log(`Cleaned up audit events. Remaining: ${this.auditEvents.length} events`);
  }
}

export default RBACService;

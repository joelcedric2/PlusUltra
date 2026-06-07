import { PrismaClient } from '@prisma/client';

export interface AuditEvent {
  id?: string;
  event_type: string;
  resource_type: string;
  resourceId: string;
  action: string;
  userId?: string;
  agent?: string;
  metadata?: Record<string, any>;
  timestamp?: Date;
  ipAddress?: string;
  userAgent?: string;
  session_id?: string;
  compliance_flags?: string[];
}

export interface AccessLogData {
  resource: string;
  patientId?: string;
  action: string;
  userId?: string;
  timestamp?: Date;
  metadata?: Record<string, any>;
}

export interface AuditLogQuery {
  event_type?: string;
  resource_type?: string;
  resourceId?: string;
  userId?: string;
  agent?: string;
  start_date?: Date;
  end_date?: Date;
  limit?: number;
  offset?: number;
}

export interface AuditConfig {
  enableDatabaseLogging: boolean;
  enableConsoleLogging: boolean;
  enableFileLogging: boolean;
  logRetentionDays: number;
  maxLogSize: number; // in MB
  enableHIPAACompliance: boolean;
  enableGDPRCompliance: boolean;
  encryptSensitiveData: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

export class AuditLogger {
  private prisma: PrismaClient;
  private config: AuditConfig;

  constructor(
    private readonly prismaService: any,
    private readonly logger: any,
    config?: Partial<AuditConfig>
  ) {
    this.prisma = prismaService.getClient();
    this.config = {
      enableDatabaseLogging: true,
      enableConsoleLogging: true,
      enableFileLogging: false,
      logRetentionDays: 2555, // 7 years for HIPAA
      maxLogSize: 100,
      enableHIPAACompliance: true,
      enableGDPRCompliance: true,
      encryptSensitiveData: true,
      logLevel: 'info',
      ...config,
    };
  }

  /**
   * Log a general audit event
   */
  async log(event: AuditEvent): Promise<string> {
    const eventId = `audit_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    try {
      // Prepare the audit event
      const auditEvent = {
        id: eventId,
        event_type: event.event_type,
        resource_type: event.resource_type,
        resourceId: event.resourceId,
        action: event.action,
        userId: event.userId,
        agent: event.agent,
        metadata: this.sanitizeMetadata(event.metadata) || undefined,
        timestamp: event.timestamp || new Date(),
        ipAddress: event.ipAddress,
        userAgent: event.userAgent,
        session_id: event.session_id,
        compliance_flags: event.compliance_flags || [],
      };

      // Log to console if enabled
      if (this.config.enableConsoleLogging) {
        this.logger.info('Audit Event', {
          eventId,
          event_type: event.event_type,
          resource_type: event.resource_type,
          resourceId: event.resourceId,
          action: event.action,
          userId: event.userId,
          timestamp: auditEvent.timestamp,
        });
      }

      // Log to database if enabled
      if (this.config.enableDatabaseLogging) {
        await this.storeAuditEvent(auditEvent);
      }

      return eventId;
    } catch (error: any) {
      this.logger.error('Failed to log audit event', {
        eventId,
        error: error.message,
        stack: error.stack,
      });

      // Don't throw - audit logging failures shouldn't break the main operation
      return eventId;
    }
  }

  /**
   * Log HIPAA-compliant access events (for PHI access)
   */
  async logAccess(accessData: AccessLogData): Promise<string> {
    const complianceFlags = [];

    if (this.config.enableHIPAACompliance) {
      complianceFlags.push('HIPAA_ACCESS_LOG');
    }

    if (this.config.enableGDPRCompliance) {
      complianceFlags.push('GDPR_ACCESS_LOG');
    }

    return this.log({
      event_type: 'data_access',
      resource_type: accessData.resource,
      resourceId: accessData.patientId || `resource_${Date.now()}`,
      action: accessData.action,
      userId: accessData.userId,
      metadata: {
        patient_id: accessData.patientId,
        access_type: 'PHI_ACCESS',
        ...accessData.metadata,
      },
      compliance_flags: complianceFlags,
    });
  }

  /**
   * Query audit logs with filtering and pagination
   */
  async queryLogs(query: AuditLogQuery): Promise<AuditEvent[]> {
    try {
      const whereClause: any = {};

      if (query.event_type) {
        whereClause.action = query.event_type; // Map to action field
      }
      if (query.resource_type) {
        whereClause.resource = query.resource_type; // Map to resource field
      }
      if (query.resourceId) {
        whereClause.resourceId = query.resourceId;
      }
      if (query.userId) {
        whereClause.userId = query.userId;
      }
      // Note: agent filtering would require JSON query on metadata
      if (query.start_date || query.end_date) {
        whereClause.timestamp = {};
        if (query.start_date) {
          whereClause.timestamp.gte = query.start_date;
        }
        if (query.end_date) {
          whereClause.timestamp.lte = query.end_date;
        }
      }

      const logs = await this.prisma.auditLog.findMany({
        where: whereClause,
        orderBy: { timestamp: 'desc' },
        take: query.limit || 100,
        skip: query.offset || 0,
      });

      return logs.map((log: any) => {
        const meta = (log.metadata || {}) as Record<string, any>;
        return {
          id: log.id,
          event_type: meta.event_type || log.action,
          resource_type: log.resource,
          resourceId: log.resourceId,
          action: log.action,
          userId: log.userId || undefined,
          agent: meta.agent || undefined,
          metadata: meta,
          timestamp: log.timestamp,
          ipAddress: log.ipAddress || undefined,
          userAgent: log.userAgent || undefined,
          session_id: meta.session_id || undefined,
          compliance_flags: meta.compliance_flags as string[] || [],
        };
      });
    } catch (error: any) {
      this.logger.error('Failed to query audit logs', {
        error: error.message,
        stack: error.stack,
        query,
      });
      throw error;
    }
  }

  /**
   * Clean up old audit logs based on retention policy
   */
  async cleanupOldLogs(): Promise<number> {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.config.logRetentionDays);

      const result = await this.prisma.auditLog.deleteMany({
        where: {
          timestamp: {
            lt: cutoffDate,
          },
        },
      });

      this.logger.info(`Cleaned up ${result.count} old audit logs`);
      return result.count;
    } catch (error: any) {
      this.logger.error('Failed to cleanup old audit logs', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Get audit statistics for compliance reporting
   */
  async getAuditStats(timeRange?: { start: Date; end: Date }): Promise<{
    totalEvents: number;
    eventsByType: Record<string, number>;
    eventsByResourceType: Record<string, number>;
    eventsByUser: Record<string, number>;
    complianceEvents: number;
  }> {
    try {
      const whereClause: any = {};

      if (timeRange) {
        whereClause.timestamp = {
          gte: timeRange.start,
          lte: timeRange.end,
        };
      }

      const logs = await this.prisma.auditLog.findMany({
        where: whereClause,
        select: {
          action: true,
          resource: true,
          userId: true,
          metadata: true,
        },
      });

      const stats = {
        totalEvents: logs.length,
        eventsByType: {} as Record<string, number>,
        eventsByResourceType: {} as Record<string, number>,
        eventsByUser: {} as Record<string, number>,
        complianceEvents: 0,
      };

      for (const log of logs) {
        const meta = (log.metadata || {}) as Record<string, any>;
        const eventType = meta.event_type || log.action;
        const resourceType = log.resource;

        // Count by event type
        stats.eventsByType[eventType] = (stats.eventsByType[eventType] || 0) + 1;

        // Count by resource type
        stats.eventsByResourceType[resourceType] = (stats.eventsByResourceType[resourceType] || 0) + 1;

        // Count by user
        if (log.userId) {
          stats.eventsByUser[log.userId] = (stats.eventsByUser[log.userId] || 0) + 1;
        }

        // Count compliance events
        const complianceFlags = meta.compliance_flags as string[] | undefined;
        if (complianceFlags && complianceFlags.length > 0) {
          stats.complianceEvents++;
        }
      }

      return stats;
    } catch (error: any) {
      this.logger.error('Failed to get audit statistics', {
        error: error.message,
        stack: error.stack,
      });
      throw error;
    }
  }

  /**
   * Store audit event in database with proper error handling and retries
   */
  private async storeAuditEvent(event: AuditEvent): Promise<void> {
    const maxRetries = 3;
    let attempt = 0;

    while (attempt < maxRetries) {
      try {
        await this.prisma.auditLog.create({
          data: {
            id: event.id!,
            action: event.action || event.event_type, // Map event_type to action
            resource: event.resource_type, // Map resource_type to resource
            resourceId: event.resourceId,
            userId: event.userId,
            metadata: {
              ...event.metadata,
              agent: event.agent,
              session_id: event.session_id,
              compliance_flags: event.compliance_flags,
              event_type: event.event_type,
            },
            timestamp: event.timestamp,
            ipAddress: event.ipAddress,
            userAgent: event.userAgent,
          },
        });
        return;
      } catch (error: any) {
        attempt++;
        if (attempt >= maxRetries) {
          throw error;
        }

        // Wait before retrying
        await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
      }
    }
  }

  /**
   * Sanitize metadata for logging (remove sensitive data if encryption is disabled)
   */
  private sanitizeMetadata(metadata?: Record<string, any>): Record<string, any> | null {
    if (!metadata) return null;

    const sanitized = { ...metadata };

    // Remove or mask sensitive fields if encryption is disabled
    if (!this.config.encryptSensitiveData) {
      const sensitiveFields = ['password', 'token', 'secret', 'key', 'ssn', 'phi'];
      for (const field of sensitiveFields) {
        if (field in sanitized) {
          sanitized[field] = '[REDACTED]';
        }
      }
    }

    return sanitized;
  }
}

export default AuditLogger;

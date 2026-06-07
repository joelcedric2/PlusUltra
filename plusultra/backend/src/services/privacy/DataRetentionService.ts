import { PrismaClient } from '@prisma/client';

export type RetentionUnit = 'days' | 'weeks' | 'months';

export interface RetentionRule {
  table: string;
  column?: string; // defaults to created_at
  ttl: number; // time-to-live amount
  unit: RetentionUnit;
  softDelete?: boolean; // if true, mark as deleted instead of hard delete
  softDeleteColumn?: string; // defaults to deleted_at
}

export interface DataRetentionConfig {
  enabled: boolean;
  defaultTtlDays: number;
  rules: RetentionRule[];
}

/**
 * Centralized data retention and automated cleanup service.
 * Uses Prisma for safe execution, but falls back to raw SQL for generic tables.
 */
export class DataRetentionService {
  private prisma: PrismaClient;
  private config: DataRetentionConfig;

  constructor(prisma: PrismaClient, config?: Partial<DataRetentionConfig>) {
    this.prisma = prisma;
    this.config = {
      enabled: (process.env.RETENTION_ENABLED || 'true').toLowerCase() === 'true',
      defaultTtlDays: parseInt(process.env.RETENTION_DEFAULT_TTL_DAYS || '90', 10),
      rules: [],
      ...config,
    } as DataRetentionConfig;
  }

  /** Register or override retention rules at runtime */
  setRules(rules: RetentionRule[]) {
    this.config.rules = rules;
  }

  /** Convert rule to SQL interval */
  private toInterval(rule: RetentionRule): string {
    const unit = rule.unit || 'days';
    return `${rule.ttl} ${unit}`;
  }

  /** Execute cleanup for a single rule */
  private async cleanupRule(rule: RetentionRule): Promise<{ table: string; affected: number }> {
    const timestampColumn = rule.column || 'created_at';
    const interval = this.toInterval(rule);

    if (rule.softDelete) {
      const softDeleteColumn = rule.softDeleteColumn || 'deleted_at';
      const res = await this.prisma.$executeRawUnsafe(
        `UPDATE ${rule.table}
         SET ${softDeleteColumn} = NOW()
         WHERE ${softDeleteColumn} IS NULL
           AND ${timestampColumn} < NOW() - INTERVAL '${interval}';`
      );
      return { table: rule.table, affected: Number(res) || 0 };
    }

    const res = await this.prisma.$executeRawUnsafe(
      `DELETE FROM ${rule.table}
       WHERE ${timestampColumn} < NOW() - INTERVAL '${interval}';`
    );
    return { table: rule.table, affected: Number(res) || 0 };
  }

  /** Run cleanup across all configured rules plus sensible defaults */
  async runCleanup(): Promise<{ success: boolean; results: Array<{ table: string; affected: number }> }> {
    if (!this.config.enabled) return { success: true, results: [] };

    const defaults: RetentionRule[] = [
      { table: 'conversations', ttl: this.config.defaultTtlDays, unit: 'days' },
      { table: 'project_files_versions', column: 'created_at', ttl: 60, unit: 'days' },
      { table: 'audit_logs', column: 'created_at', ttl: 365, unit: 'days' },
      { table: 'build_jobs', column: 'created_at', ttl: 30, unit: 'days' },
      { table: 'token_usage', column: 'created_at', ttl: 180, unit: 'days' },
    ];

    const rules: RetentionRule[] = (this.config.rules && this.config.rules.length > 0)
      ? this.config.rules
      : defaults;

    const results: Array<{ table: string; affected: number }> = [];
    for (const rule of rules) {
      try {
        const res = await this.cleanupRule(rule);
        results.push(res);
      } catch (err) {
        // Continue with other tables even if one fails
        results.push({ table: rule.table, affected: 0 });
      }
    }
    return { success: true, results };
  }
}



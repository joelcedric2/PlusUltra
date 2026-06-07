import { PrismaClient } from '@prisma/client';
import { S3Client, CopyObjectCommand } from '@aws-sdk/client-s3';

export interface ReplicationConfig {
  enabled: boolean;
  secondaryDatabaseUrl?: string;
  r2SecondaryEndpoint?: string;
  r2SecondaryAccessKeyId?: string;
  r2SecondarySecretAccessKey?: string;
  r2SecondaryBucket?: string;
  r2PrimaryBucket?: string;
}

/**
 * Cross-Region Replication Service
 * - Database: Best-effort application-level replication (periodic upsert of hot tables)
 * - Assets (R2): Object copy from primary bucket to secondary bucket/region
 */
export class CrossRegionReplicationService {
  private primaryPrisma: PrismaClient;
  private secondaryPrisma?: PrismaClient;
  private r2Secondary?: S3Client;
  private config: ReplicationConfig;

  constructor(prisma: PrismaClient, config?: Partial<ReplicationConfig>) {
    this.primaryPrisma = prisma;
    this.config = {
      enabled: (process.env.REPLICATION_ENABLED || 'false').toLowerCase() === 'true',
      secondaryDatabaseUrl: process.env.SECONDARY_DATABASE_URL,
      r2SecondaryEndpoint: process.env.R2_SECONDARY_ENDPOINT,
      r2SecondaryAccessKeyId: process.env.R2_SECONDARY_ACCESS_KEY_ID,
      r2SecondarySecretAccessKey: process.env.R2_SECONDARY_SECRET_ACCESS_KEY,
      r2SecondaryBucket: process.env.R2_SECONDARY_BUCKET,
      r2PrimaryBucket: process.env.R2_PRIMARY_BUCKET,
      ...config,
    } as ReplicationConfig;

    if (this.config.secondaryDatabaseUrl) {
      this.secondaryPrisma = new PrismaClient({
        datasources: { db: { url: this.config.secondaryDatabaseUrl } },
      }) as any;
    }

    if (
      this.config.r2SecondaryEndpoint &&
      this.config.r2SecondaryAccessKeyId &&
      this.config.r2SecondarySecretAccessKey
    ) {
      this.r2Secondary = new S3Client({
        region: 'auto',
        endpoint: this.config.r2SecondaryEndpoint,
        credentials: {
          accessKeyId: this.config.r2SecondaryAccessKeyId!,
          secretAccessKey: this.config.r2SecondarySecretAccessKey!,
        },
        forcePathStyle: true,
      });
    }
  }

  /** Replicate hot tables by updated_at window (best-effort) */
  async replicateDatabase(sinceMinutes = 10): Promise<{ success: boolean; tables: string[] }> {
    if (!this.config.enabled || !this.secondaryPrisma) return { success: true, tables: [] };
    const tables: string[] = [];

    const since = new Date(Date.now() - sinceMinutes * 60 * 1000);
    // Users
    try {
      const users = await this.primaryPrisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM users WHERE updated_at > $1`,
        since
      );
      for (const u of users) {
        await (this.secondaryPrisma as any).$executeRawUnsafe(
          `INSERT INTO users (id, email, name, plan, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (id) DO UPDATE SET email=$2, name=$3, plan=$4, updated_at=$6`,
          u.id, u.email, u.name, u.plan, u.created_at, u.updated_at
        );
      }
      tables.push('users');
    } catch {}

    // Projects
    try {
      const projects = await this.primaryPrisma.$queryRawUnsafe<any[]>(
        `SELECT * FROM projects WHERE updated_at > $1`,
        since
      );
      for (const p of projects) {
        await (this.secondaryPrisma as any).$executeRawUnsafe(
          `INSERT INTO projects (id, user_id, name, status, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (id) DO UPDATE SET name=$3, status=$4, updated_at=$6`,
          p.id, p.user_id, p.name, p.status, p.created_at, p.updated_at
        );
      }
      tables.push('projects');
    } catch {}

    // Project files (metadata-only)
    try {
      const files = await this.primaryPrisma.$queryRawUnsafe<any[]>(
        `SELECT id, project_id, path, updated_at, created_at FROM project_files WHERE updated_at > $1`,
        since
      );
      for (const f of files) {
        await (this.secondaryPrisma as any).$executeRawUnsafe(
          `INSERT INTO project_files (id, project_id, path, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (id) DO UPDATE SET path=$3, updated_at=$5`,
          f.id, f.project_id, f.path, f.created_at, f.updated_at
        );
      }
      tables.push('project_files');
    } catch {}

    return { success: true, tables };
  }

  /** Copy a single asset key from primary bucket to secondary */
  async replicateAssetKey(key: string): Promise<{ success: boolean; key: string }> {
    if (!this.r2Secondary || !this.config.r2SecondaryBucket || !this.config.r2PrimaryBucket) {
      return { success: true, key };
    }
    await this.r2Secondary.send(
      new CopyObjectCommand({
        Bucket: this.config.r2SecondaryBucket,
        Key: key,
        CopySource: `/${this.config.r2PrimaryBucket}/${encodeURIComponent(key)}`,
      })
    );
    return { success: true, key };
  }
}




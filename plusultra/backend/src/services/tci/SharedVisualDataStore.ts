/**
 * Shared Visual Data Store - TCI Visual Insights Repository
 *
 * Stores Kimi 2's visual analysis results (video recordings, UI interactions,
 * CSS animations, motion patterns) for other TCI models to query.
 *
 * Features:
 * - Redis-backed storage with in-memory fallback
 * - TTL-based freshness tracking
 * - Query interface for other models (Claude, GPT, Gemini, Grok)
 * - Structured visual context descriptions
 */

import crypto from 'crypto';
import type { KimiVisualInsights, MotionPattern, AnimationTiming, InteractionPattern } from '../../types/tci';

export interface StoredVisualAnalysis {
  id: string;
  projectId: string;
  sandboxId?: string;
  analysisType: 'video' | 'screenshot' | 'animation' | 'interaction';
  insights: KimiVisualInsights;
  createdAt: Date;
  expiresAt: Date;
  accessCount: number;
  lastAccessedAt: Date;
  tags: string[];
}

export interface VisualContextQuery {
  projectId?: string;
  sandboxId?: string;
  analysisType?: 'video' | 'screenshot' | 'animation' | 'interaction';
  tags?: string[];
  freshOnly?: boolean; // Only return non-stale results
  limit?: number;
}

export interface VisualContextSummary {
  description: string;
  motionPatterns: string[];
  animationDetails: string[];
  interactionPatterns: string[];
  cssAnimations: string[];
  timingInfo: string[];
  confidence: number;
  isFresh: boolean;
  analyzedAt: Date;
}

export class SharedVisualDataStore {
  private cache = new Map<string, StoredVisualAnalysis>();
  private projectIndex = new Map<string, Set<string>>(); // projectId -> analysis IDs
  private sandboxIndex = new Map<string, Set<string>>(); // sandboxId -> analysis IDs
  private tagIndex = new Map<string, Set<string>>(); // tag -> analysis IDs

  private maxSize = 5000;
  private defaultTTL = 2 * 60 * 60 * 1000; // 2 hours default
  private staleTTL = 30 * 60 * 1000; // 30 minutes before considered stale
  private redisClient?: any;

  constructor(options?: {
    maxSize?: number;
    defaultTTL?: number;
    staleTTL?: number;
    redisClient?: any;
  }) {
    if (options?.maxSize) this.maxSize = options.maxSize;
    if (options?.defaultTTL) this.defaultTTL = options.defaultTTL;
    if (options?.staleTTL) this.staleTTL = options.staleTTL;
    if (options?.redisClient) this.redisClient = options.redisClient;
  }

  /**
   * Generate unique ID for visual analysis
   */
  private generateId(projectId: string, analysisType: string): string {
    const timestamp = Date.now();
    const random = crypto.randomBytes(8).toString('hex');
    return `kimi-${projectId.slice(0, 8)}-${analysisType}-${timestamp}-${random}`;
  }

  /**
   * Store Kimi's visual analysis results
   */
  async store(
    projectId: string,
    insights: KimiVisualInsights,
    options?: {
      sandboxId?: string;
      analysisType?: 'video' | 'screenshot' | 'animation' | 'interaction';
      tags?: string[];
      ttl?: number;
    }
  ): Promise<string> {
    const analysisType = options?.analysisType || 'video';
    const id = this.generateId(projectId, analysisType);
    const now = new Date();
    const ttl = options?.ttl || this.defaultTTL;

    const entry: StoredVisualAnalysis = {
      id,
      projectId,
      sandboxId: options?.sandboxId,
      analysisType,
      insights,
      createdAt: now,
      expiresAt: new Date(now.getTime() + ttl),
      accessCount: 0,
      lastAccessedAt: now,
      tags: options?.tags || []
    };

    // Store in Redis if available
    if (this.redisClient) {
      try {
        const redisKey = `kimi:visual:${id}`;
        await this.redisClient.setex(
          redisKey,
          Math.floor(ttl / 1000),
          JSON.stringify(entry)
        );

        // Update Redis indexes
        if (projectId) {
          await this.redisClient.sadd(`kimi:project:${projectId}`, id);
          await this.redisClient.expire(`kimi:project:${projectId}`, Math.floor(ttl / 1000));
        }
        if (options?.sandboxId) {
          await this.redisClient.sadd(`kimi:sandbox:${options.sandboxId}`, id);
          await this.redisClient.expire(`kimi:sandbox:${options.sandboxId}`, Math.floor(ttl / 1000));
        }
      } catch (error) {
        console.warn('[SharedVisualDataStore] Redis store failed:', error);
      }
    }

    // Store in memory cache
    this.enforceMaxSize();
    this.cache.set(id, entry);

    // Update indexes
    this.updateIndexes(entry, 'add');

    console.log(`[SharedVisualDataStore] Stored analysis ${id} (type: ${analysisType})`);
    return id;
  }

  /**
   * Get specific visual analysis by ID
   */
  async get(id: string): Promise<StoredVisualAnalysis | null> {
    // Try Redis first
    if (this.redisClient) {
      try {
        const cached = await this.redisClient.get(`kimi:visual:${id}`);
        if (cached) {
          const entry = JSON.parse(cached) as StoredVisualAnalysis;
          entry.createdAt = new Date(entry.createdAt);
          entry.expiresAt = new Date(entry.expiresAt);
          entry.lastAccessedAt = new Date(entry.lastAccessedAt);

          // Check expiration
          if (new Date() > entry.expiresAt) {
            await this.delete(id);
            return null;
          }

          // Update access count
          entry.accessCount++;
          entry.lastAccessedAt = new Date();
          await this.redisClient.setex(
            `kimi:visual:${id}`,
            Math.floor((entry.expiresAt.getTime() - Date.now()) / 1000),
            JSON.stringify(entry)
          );

          return entry;
        }
      } catch (error) {
        console.warn('[SharedVisualDataStore] Redis get failed:', error);
      }
    }

    // Fallback to memory cache
    const entry = this.cache.get(id);
    if (!entry) return null;

    // Check expiration
    if (new Date() > entry.expiresAt) {
      this.cache.delete(id);
      this.updateIndexes(entry, 'remove');
      return null;
    }

    // Update access stats
    entry.accessCount++;
    entry.lastAccessedAt = new Date();

    return entry;
  }

  /**
   * Query visual analyses for a project/sandbox
   * Returns human-readable context summaries that other models can understand
   */
  async query(query: VisualContextQuery): Promise<StoredVisualAnalysis[]> {
    const results: StoredVisualAnalysis[] = [];
    const now = new Date();
    const limit = query.limit || 10;

    // Get candidate IDs from indexes
    let candidateIds: Set<string> | null = null;

    if (query.projectId && this.projectIndex.has(query.projectId)) {
      candidateIds = new Set(this.projectIndex.get(query.projectId));
    }

    if (query.sandboxId && this.sandboxIndex.has(query.sandboxId)) {
      const sandboxIds = this.sandboxIndex.get(query.sandboxId)!;
      if (candidateIds) {
        candidateIds = new Set([...candidateIds].filter(id => sandboxIds.has(id)));
      } else {
        candidateIds = new Set(sandboxIds);
      }
    }

    if (query.tags && query.tags.length > 0) {
      for (const tag of query.tags) {
        if (this.tagIndex.has(tag)) {
          const tagIds = this.tagIndex.get(tag)!;
          if (candidateIds) {
            candidateIds = new Set([...candidateIds].filter(id => tagIds.has(id)));
          } else {
            candidateIds = new Set(tagIds);
          }
        }
      }
    }

    // If no index constraints, use all entries
    if (!candidateIds) {
      candidateIds = new Set(this.cache.keys());
    }

    // Filter and collect results
    for (const id of candidateIds) {
      if (results.length >= limit) break;

      const entry = await this.get(id);
      if (!entry) continue;

      // Apply filters
      if (query.analysisType && entry.analysisType !== query.analysisType) {
        continue;
      }

      if (query.freshOnly) {
        const age = now.getTime() - entry.createdAt.getTime();
        if (age > this.staleTTL) continue;
      }

      results.push(entry);
    }

    // Sort by recency
    results.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return results;
  }

  /**
   * Get context summary for other TCI models
   * Formats Kimi's visual insights into human-readable descriptions
   */
  async getContextForModels(
    projectId: string,
    sandboxId?: string
  ): Promise<VisualContextSummary[]> {
    const analyses = await this.query({
      projectId,
      sandboxId,
      freshOnly: false, // Include stale for completeness
      limit: 5
    });

    return analyses.map(analysis => this.formatForModels(analysis));
  }

  /**
   * Format visual analysis into a summary other models can understand
   */
  private formatForModels(analysis: StoredVisualAnalysis): VisualContextSummary {
    const { insights } = analysis;
    const now = new Date();
    const age = now.getTime() - analysis.createdAt.getTime();
    const isFresh = age < this.staleTTL;

    // Build human-readable description
    const descriptionParts: string[] = [];

    if (insights.videoSummary) {
      descriptionParts.push(`Video analysis: ${insights.videoSummary}`);
    }

    if (insights.uiInteractions && insights.uiInteractions.length > 0) {
      const interactionSummary = insights.uiInteractions
        .slice(0, 3)
        .map(i => `${i.type} on ${i.element}`)
        .join(', ');
      descriptionParts.push(`Observed interactions: ${interactionSummary}`);
    }

    // Format motion patterns
    const motionPatterns = (insights.motionPatterns || []).map(mp => {
      const timing = mp.timing ? ` (${mp.timing.duration}ms ${mp.timing.easing})` : '';
      return `${mp.type}: ${mp.description}${timing}`;
    });

    // Format animations
    const animationDetails = (insights.cssAnimations || []).map(anim => {
      const props = anim.properties ? ` affecting ${anim.properties.join(', ')}` : '';
      return `${anim.name}: ${anim.duration}ms ${anim.easing}${props}`;
    });

    // Format interaction patterns
    const interactionPatterns = (insights.uiInteractions || []).map(interaction => {
      return `${interaction.type} on ${interaction.element} -> ${interaction.effect}`;
    });

    // Format CSS animations as readable strings
    const cssAnimations = (insights.cssAnimations || []).map(anim => {
      return `Kimi observed: ${anim.name} animation with ${anim.duration}ms ${anim.easing}`;
    });

    // Format timing info
    const timingInfo = (insights.motionPatterns || [])
      .filter(mp => mp.timing)
      .map(mp => `${mp.type}: ${mp.timing!.duration}ms, ${mp.timing!.easing} easing`);

    return {
      description: descriptionParts.join('. ') || 'Visual analysis completed',
      motionPatterns,
      animationDetails,
      interactionPatterns,
      cssAnimations,
      timingInfo,
      confidence: insights.confidence,
      isFresh,
      analyzedAt: analysis.createdAt
    };
  }

  /**
   * Generate context string for injection into other model prompts
   * This is the key method other TCI services will use
   */
  async generateModelContext(projectId: string, sandboxId?: string): Promise<string> {
    const summaries = await this.getContextForModels(projectId, sandboxId);

    if (summaries.length === 0) {
      return '';
    }

    const contextParts: string[] = [
      '=== Kimi 2 Visual Analysis Context ===',
      'The following visual insights were captured by Kimi 2 (video/animation specialist):\n'
    ];

    for (const summary of summaries) {
      const freshness = summary.isFresh ? '[FRESH]' : '[STALE - may be outdated]';
      contextParts.push(`${freshness} Analysis from ${summary.analyzedAt.toISOString()}:`);
      contextParts.push(`  ${summary.description}`);

      if (summary.motionPatterns.length > 0) {
        contextParts.push('  Motion patterns:');
        summary.motionPatterns.forEach(mp => contextParts.push(`    - ${mp}`));
      }

      if (summary.cssAnimations.length > 0) {
        contextParts.push('  CSS Animations:');
        summary.cssAnimations.forEach(anim => contextParts.push(`    - ${anim}`));
      }

      if (summary.interactionPatterns.length > 0) {
        contextParts.push('  UI Interactions:');
        summary.interactionPatterns.forEach(ip => contextParts.push(`    - ${ip}`));
      }

      if (summary.timingInfo.length > 0) {
        contextParts.push('  Timing details:');
        summary.timingInfo.forEach(ti => contextParts.push(`    - ${ti}`));
      }

      contextParts.push(`  Confidence: ${(summary.confidence * 100).toFixed(0)}%`);
      contextParts.push('');
    }

    contextParts.push('=== End Kimi 2 Context ===');

    return contextParts.join('\n');
  }

  /**
   * Check if analysis is fresh (not stale)
   */
  isFresh(analysis: StoredVisualAnalysis): boolean {
    const age = Date.now() - analysis.createdAt.getTime();
    return age < this.staleTTL;
  }

  /**
   * Delete specific analysis
   */
  async delete(id: string): Promise<boolean> {
    const entry = this.cache.get(id);

    if (this.redisClient) {
      try {
        await this.redisClient.del(`kimi:visual:${id}`);
        if (entry?.projectId) {
          await this.redisClient.srem(`kimi:project:${entry.projectId}`, id);
        }
        if (entry?.sandboxId) {
          await this.redisClient.srem(`kimi:sandbox:${entry.sandboxId}`, id);
        }
      } catch (error) {
        console.warn('[SharedVisualDataStore] Redis delete failed:', error);
      }
    }

    if (entry) {
      this.updateIndexes(entry, 'remove');
      this.cache.delete(id);
      return true;
    }

    return false;
  }

  /**
   * Clear all analyses for a project
   */
  async clearProject(projectId: string): Promise<number> {
    const ids = this.projectIndex.get(projectId);
    if (!ids) return 0;

    let count = 0;
    for (const id of ids) {
      if (await this.delete(id)) {
        count++;
      }
    }

    return count;
  }

  /**
   * Clear all analyses for a sandbox
   */
  async clearSandbox(sandboxId: string): Promise<number> {
    const ids = this.sandboxIndex.get(sandboxId);
    if (!ids) return 0;

    let count = 0;
    for (const id of ids) {
      if (await this.delete(id)) {
        count++;
      }
    }

    return count;
  }

  /**
   * Get store statistics
   */
  getStats(): {
    totalEntries: number;
    projectCount: number;
    sandboxCount: number;
    freshCount: number;
    staleCount: number;
    avgAccessCount: number;
  } {
    const now = Date.now();
    let freshCount = 0;
    let staleCount = 0;
    let totalAccessCount = 0;

    for (const entry of this.cache.values()) {
      const age = now - entry.createdAt.getTime();
      if (age < this.staleTTL) {
        freshCount++;
      } else {
        staleCount++;
      }
      totalAccessCount += entry.accessCount;
    }

    return {
      totalEntries: this.cache.size,
      projectCount: this.projectIndex.size,
      sandboxCount: this.sandboxIndex.size,
      freshCount,
      staleCount,
      avgAccessCount: this.cache.size > 0 ? totalAccessCount / this.cache.size : 0
    };
  }

  /**
   * Cleanup expired entries
   */
  async cleanup(): Promise<number> {
    const now = new Date();
    let removedCount = 0;

    for (const [id, entry] of this.cache.entries()) {
      if (now > entry.expiresAt) {
        await this.delete(id);
        removedCount++;
      }
    }

    console.log(`[SharedVisualDataStore] Cleanup removed ${removedCount} expired entries`);
    return removedCount;
  }

  /**
   * Update indexes when adding or removing entries
   */
  private updateIndexes(entry: StoredVisualAnalysis, operation: 'add' | 'remove'): void {
    const { id, projectId, sandboxId, tags } = entry;

    if (operation === 'add') {
      // Project index
      if (!this.projectIndex.has(projectId)) {
        this.projectIndex.set(projectId, new Set());
      }
      this.projectIndex.get(projectId)!.add(id);

      // Sandbox index
      if (sandboxId) {
        if (!this.sandboxIndex.has(sandboxId)) {
          this.sandboxIndex.set(sandboxId, new Set());
        }
        this.sandboxIndex.get(sandboxId)!.add(id);
      }

      // Tag index
      for (const tag of tags) {
        if (!this.tagIndex.has(tag)) {
          this.tagIndex.set(tag, new Set());
        }
        this.tagIndex.get(tag)!.add(id);
      }
    } else {
      // Remove from project index
      this.projectIndex.get(projectId)?.delete(id);
      if (this.projectIndex.get(projectId)?.size === 0) {
        this.projectIndex.delete(projectId);
      }

      // Remove from sandbox index
      if (sandboxId) {
        this.sandboxIndex.get(sandboxId)?.delete(id);
        if (this.sandboxIndex.get(sandboxId)?.size === 0) {
          this.sandboxIndex.delete(sandboxId);
        }
      }

      // Remove from tag indexes
      for (const tag of tags) {
        this.tagIndex.get(tag)?.delete(id);
        if (this.tagIndex.get(tag)?.size === 0) {
          this.tagIndex.delete(tag);
        }
      }
    }
  }

  /**
   * Enforce max size by removing oldest entries
   */
  private enforceMaxSize(): void {
    if (this.cache.size < this.maxSize) return;

    // Sort by last accessed time (oldest first)
    const entries = Array.from(this.cache.entries())
      .sort((a, b) => a[1].lastAccessedAt.getTime() - b[1].lastAccessedAt.getTime());

    // Remove oldest 10%
    const removeCount = Math.ceil(this.maxSize * 0.1);
    for (let i = 0; i < removeCount && i < entries.length; i++) {
      const [id, entry] = entries[i];
      this.cache.delete(id);
      this.updateIndexes(entry, 'remove');
    }

    console.log(`[SharedVisualDataStore] Evicted ${removeCount} entries to stay under max size`);
  }
}

// Export singleton instance
export const sharedVisualDataStore = new SharedVisualDataStore();

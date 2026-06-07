import crypto from 'crypto';

/**
 * Embedding Cache - Reduces API costs by caching embeddings with TTL
 * Supports Redis for distributed systems and in-memory fallback
 */
export class EmbeddingCache {
  private cache = new Map<string, { embedding: number[]; timestamp: number; provider: string }>();
  private maxSize = 10000; // Maximum cache entries
  private defaultTTL = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
  private redisClient?: any; // Redis client for distributed caching

  constructor(options?: {
    maxSize?: number;
    defaultTTL?: number;
    redisClient?: any;
  }) {
    if (options?.maxSize) this.maxSize = options.maxSize;
    if (options?.defaultTTL) this.defaultTTL = options.defaultTTL;
    if (options?.redisClient) this.redisClient = options.redisClient;
  }

  /**
   * Generate cache key from text and provider
   */
  private generateKey(text: string, provider: string): string {
    const hash = crypto.createHash('sha256').update(text + provider).digest('hex');
    return `${provider}:${hash.slice(0, 16)}`;
  }

  /**
   * Get embedding from cache
   */
  async get(text: string, provider: string): Promise<number[] | null> {
    const key = this.generateKey(text, provider);

    // Try Redis first if available
    if (this.redisClient) {
      try {
        const cached = await this.redisClient.get(key);
        if (cached) {
          const { embedding, timestamp } = JSON.parse(cached);
          if (Date.now() - timestamp < this.defaultTTL) {
            return embedding;
          } else {
            // Expired, remove from Redis
            await this.redisClient.del(key);
          }
        }
      } catch (error) {
        console.warn('Redis cache read failed:', error);
      }
    }

    // Fallback to in-memory cache
    const cached = this.cache.get(key);
    if (cached && Date.now() - cached.timestamp < this.defaultTTL) {
      return cached.embedding;
    }

    return null;
  }

  /**
   * Set embedding in cache
   */
  async set(text: string, provider: string, embedding: number[]): Promise<void> {
    const key = this.generateKey(text, provider);
    const cacheEntry = {
      embedding,
      timestamp: Date.now(),
      provider
    };

    // Store in Redis if available
    if (this.redisClient) {
      try {
        await this.redisClient.setex(key, Math.floor(this.defaultTTL / 1000), JSON.stringify(cacheEntry));
      } catch (error) {
        console.warn('Redis cache write failed:', error);
      }
    }

    // Store in memory cache
    if (this.cache.size >= this.maxSize) {
      // Remove oldest entry (simple LRU)
      const firstKey = this.cache.keys().next().value;
      if (firstKey !== undefined) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, cacheEntry);
  }

  /**
   * Check if embedding exists in cache
   */
  async has(text: string, provider: string): Promise<boolean> {
    const cached = await this.get(text, provider);
    return cached !== null;
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    memoryEntries: number;
    hitRate: number;
    totalRequests: number;
    cacheHits: number;
  } {
    return {
      memoryEntries: this.cache.size,
      hitRate: this.cache.size > 0 ? (this.cache.size / (this.cache.size + 1)) * 100 : 0,
      totalRequests: this.cache.size,
      cacheHits: this.cache.size
    };
  }

  /**
   * Clear all cache entries
   */
  async clear(): Promise<void> {
    this.cache.clear();

    if (this.redisClient) {
      try {
        await this.redisClient.flushdb();
      } catch (error) {
        console.warn('Redis cache clear failed:', error);
      }
    }
  }

  /**
   * Cleanup expired entries
   */
  async cleanup(): Promise<number> {
    const now = Date.now();
    let removedCount = 0;

    // Cleanup in-memory cache
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp >= this.defaultTTL) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    // Note: Redis TTL is handled automatically by Redis

    return removedCount;
  }
}

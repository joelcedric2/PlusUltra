/**
 * Pinecone Service for TCI Pattern Storage
 *
 * Stores and retrieves TCI pattern embeddings for fast similarity search.
 * Used by the learning loop to find similar code patterns.
 *
 * Architecture:
 * - PostgreSQL: Stores full pattern details, metadata, and accuracy stats
 * - Pinecone: Stores pattern embeddings for fast semantic search
 *
 * Why Pinecone over pgvector alone:
 * - Scales to billions of vectors
 * - Faster similarity search (< 100ms vs seconds)
 * - Better for real-time pattern matching during TCI analysis
 */

import { Pinecone } from '@pinecone-database/pinecone';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

interface PatternEmbedding {
  patternId: string;
  embedding: number[];
  metadata: {
    name: string;
    category: string;
    severity: string;
    accuracy: number;
    occurrenceCount: number;
  };
}

interface SimilarPattern {
  patternId: string;
  name: string;
  category: string;
  severity: string;
  accuracy: number;
  similarity: number;
  codeSignature: string;
  description: string;
}

export class PineconeService {
  private client: Pinecone | null = null;
  private indexName: string;
  private isInitialized = false;

  constructor() {
    this.indexName = process.env.PINECONE_INDEX_NAME || 'plusultra-tci-patterns';
  }

  /**
   * Initialize Pinecone client
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) {
      console.warn('[Pinecone] API key not configured, vector search will be disabled');
      return;
    }

    try {
      this.client = new Pinecone({
        apiKey,
      });

      // Check if index exists, create if needed
      await this.ensureIndexExists();

      this.isInitialized = true;
      console.log('[Pinecone] Initialized successfully');
    } catch (error: any) {
      console.error('[Pinecone] Initialization failed:', error.message);
      // Continue without Pinecone - pattern matching will fall back to PostgreSQL
    }
  }

  /**
   * Ensure the index exists, create if needed
   */
  private async ensureIndexExists(): Promise<void> {
    if (!this.client) return;

    try {
      const indexes = await this.client.listIndexes();
      const indexExists = indexes.indexes?.some((idx) => idx.name === this.indexName);

      if (!indexExists) {
        console.log(`[Pinecone] Creating index: ${this.indexName}`);
        await this.client.createIndex({
          name: this.indexName,
          dimension: 1536, // OpenAI embedding dimension
          metric: 'cosine',
          spec: {
            serverless: {
              cloud: 'aws',
              region: process.env.PINECONE_ENVIRONMENT || 'us-east-1',
            },
          },
        });
        console.log(`[Pinecone] Index created: ${this.indexName}`);
      }
    } catch (error: any) {
      console.error('[Pinecone] Failed to ensure index exists:', error.message);
      throw error;
    }
  }

  /**
   * Store pattern embedding in Pinecone
   */
  async storePatternEmbedding(embedding: PatternEmbedding): Promise<void> {
    if (!this.client || !this.isInitialized) {
      console.warn('[Pinecone] Not initialized, skipping pattern storage');
      return;
    }

    try {
      const index = this.client.index(this.indexName);

      await index.upsert([
        {
          id: embedding.patternId,
          values: embedding.embedding,
          metadata: embedding.metadata as any,
        },
      ]);

      console.log(`[Pinecone] Stored pattern embedding: ${embedding.patternId}`);
    } catch (error: any) {
      console.error('[Pinecone] Failed to store pattern embedding:', error.message);
      // Don't throw - continue without vector search
    }
  }

  /**
   * Find similar patterns using vector similarity search
   */
  async findSimilarPatterns(
    codeEmbedding: number[],
    topK: number = 5,
    minSimilarity: number = 0.7
  ): Promise<SimilarPattern[]> {
    if (!this.client || !this.isInitialized) {
      console.warn('[Pinecone] Not initialized, falling back to PostgreSQL search');
      return this.fallbackSimilaritySearch(topK);
    }

    try {
      const index = this.client.index(this.indexName);

      const queryResponse = await index.query({
        vector: codeEmbedding,
        topK,
        includeMetadata: true,
      });

      if (!queryResponse.matches || queryResponse.matches.length === 0) {
        return [];
      }

      // Filter by minimum similarity and fetch full pattern details from PostgreSQL
      const similarPatterns: SimilarPattern[] = [];

      for (const match of queryResponse.matches) {
        if (match.score && match.score >= minSimilarity) {
          const pattern = await prisma.tCIPattern.findUnique({
            where: { id: match.id },
          });

          if (pattern) {
            similarPatterns.push({
              patternId: pattern.id,
              name: pattern.name,
              category: pattern.category,
              severity: pattern.severity,
              accuracy: pattern.accuracy,
              similarity: match.score,
              codeSignature: pattern.codeSignature,
              description: pattern.description,
            });
          }
        }
      }

      console.log(
        `[Pinecone] Found ${similarPatterns.length} similar patterns (min similarity: ${minSimilarity})`
      );

      return similarPatterns;
    } catch (error: any) {
      console.error('[Pinecone] Failed to find similar patterns:', error.message);
      return this.fallbackSimilaritySearch(topK);
    }
  }

  /**
   * Fallback similarity search using PostgreSQL (when Pinecone is unavailable)
   */
  private async fallbackSimilaritySearch(topK: number): Promise<SimilarPattern[]> {
    try {
      // Get top patterns by accuracy and occurrence count
      const patterns = await prisma.tCIPattern.findMany({
        orderBy: [{ accuracy: 'desc' }, { occurrenceCount: 'desc' }],
        take: topK,
      });

      return patterns.map((pattern) => ({
        patternId: pattern.id,
        name: pattern.name,
        category: pattern.category,
        severity: pattern.severity,
        accuracy: pattern.accuracy,
        similarity: 0.8, // Default similarity for fallback
        codeSignature: pattern.codeSignature,
        description: pattern.description,
      }));
    } catch (error: any) {
      console.error('[Pinecone] Fallback search failed:', error.message);
      return [];
    }
  }

  /**
   * Generate embedding for code using OpenAI
   */
  async generateCodeEmbedding(code: string): Promise<number[]> {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OpenAI API key not configured for embedding generation');
    }

    try {
      const response = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'text-embedding-3-small',
          input: code,
        }),
      });

      if (!response.ok) {
        throw new Error(`OpenAI API error: ${response.statusText}`);
      }

      const data = await response.json() as any;
      return data.data[0].embedding;
    } catch (error: any) {
      console.error('[Pinecone] Failed to generate code embedding:', error.message);
      throw error;
    }
  }

  /**
   * Update pattern metadata in Pinecone (when accuracy changes)
   */
  async updatePatternMetadata(
    patternId: string,
    metadata: PatternEmbedding['metadata']
  ): Promise<void> {
    if (!this.client || !this.isInitialized) {
      return;
    }

    try {
      const index = this.client.index(this.indexName);

      // Pinecone doesn't support updating metadata directly
      // We need to fetch the vector and re-upsert with new metadata
      const fetchResult = await index.fetch([patternId]);
      const vector = fetchResult.records?.[patternId]?.values;

      if (vector) {
        await index.upsert([
          {
            id: patternId,
            values: vector,
            metadata: metadata as any,
          },
        ]);

        console.log(`[Pinecone] Updated pattern metadata: ${patternId}`);
      }
    } catch (error: any) {
      console.error('[Pinecone] Failed to update pattern metadata:', error.message);
    }
  }

  /**
   * Delete pattern from Pinecone
   */
  async deletePattern(patternId: string): Promise<void> {
    if (!this.client || !this.isInitialized) {
      return;
    }

    try {
      const index = this.client.index(this.indexName);
      await index.deleteOne(patternId);

      console.log(`[Pinecone] Deleted pattern: ${patternId}`);
    } catch (error: any) {
      console.error('[Pinecone] Failed to delete pattern:', error.message);
    }
  }

  /**
   * Get Pinecone index statistics
   */
  async getIndexStats(): Promise<{
    totalPatterns: number;
    dimension: number;
    isReady: boolean;
  }> {
    if (!this.client || !this.isInitialized) {
      return {
        totalPatterns: 0,
        dimension: 0,
        isReady: false,
      };
    }

    try {
      const index = this.client.index(this.indexName);
      const stats = await index.describeIndexStats();

      return {
        totalPatterns: stats.totalRecordCount || 0,
        dimension: stats.dimension || 0,
        isReady: this.isInitialized,
      };
    } catch (error: any) {
      console.error('[Pinecone] Failed to get index stats:', error.message);
      return {
        totalPatterns: 0,
        dimension: 0,
        isReady: false,
      };
    }
  }
}

export const pineconeService = new PineconeService();

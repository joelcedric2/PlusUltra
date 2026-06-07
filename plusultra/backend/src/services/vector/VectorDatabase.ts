import { Pinecone } from '@pinecone-database/pinecone';

export interface VectorDocument {
  id: string;
  content: string;
  metadata: {
    type: 'pattern' | 'fix' | 'app_example' | 'user_preference';
    userId?: string;
    projectId?: string;
    tags?: string[];
    timestamp: string;
    [key: string]: any;
  };
  embedding?: number[];
}

export interface SearchResult {
  id: string;
  score: number;
  metadata: VectorDocument['metadata'];
  content?: string;
}

export class VectorDatabaseService {
  private pinecone: Pinecone | null = null;
  private indexName: string;

  constructor() {
    this.indexName = process.env.PINECONE_INDEX_NAME || 'plusultra-vectors';
    this.initializePinecone();
  }

  private async initializePinecone() {
    if (!process.env.PINECONE_API_KEY) {
      console.warn('Pinecone API key not found. Vector database features will be disabled.');
      return;
    }

    try {
      this.pinecone = new Pinecone({
        apiKey: process.env.PINECONE_API_KEY,
      });

      // Ensure index exists
      await this.ensureIndexExists();
    } catch (error) {
      console.error('Failed to initialize Pinecone:', error);
    }
  }

  private async ensureIndexExists() {
    if (!this.pinecone) return;

    try {
      const indexList = await this.pinecone.listIndexes();
      const indexExists = indexList.indexes?.some(index => index.name === this.indexName);

      if (!indexExists) {
        console.log(`Creating Pinecone index: ${this.indexName}`);
        await this.pinecone.createIndex({
          name: this.indexName,
          dimension: 1536, // OpenAI text-embedding-ada-002 dimension
          metric: 'cosine',
          spec: {
            serverless: {
              cloud: 'aws',
              region: 'us-east-1'
            }
          }
        });

        // Wait for index to be ready
        await new Promise(resolve => setTimeout(resolve, 30000));
      }
    } catch (error) {
      console.error('Error ensuring index exists:', error);
    }
  }

  /**
   * Store a document in the vector database
   */
  async storeDocument(document: VectorDocument): Promise<boolean> {
    if (!this.pinecone) {
      console.warn('Vector database not available. Document not stored.');
      return false;
    }

    try {
      const index = this.pinecone.index(this.indexName);

      // Generate embedding if not provided
      const embedding = document.embedding || await this.generateEmbedding(document.content);

      await index.upsert([{
        id: document.id,
        values: embedding,
        metadata: {
          content: document.content,
          ...document.metadata
        }
      }]);

      return true;
    } catch (error) {
      console.error('Error storing document:', error);
      return false;
    }
  }

  /**
   * Search for similar documents
   */
  async searchSimilar(
    query: string,
    filters?: {
      type?: string;
      userId?: string;
      projectId?: string;
      tags?: string[];
    },
    topK: number = 5
  ): Promise<SearchResult[]> {
    if (!this.pinecone) {
      return [];
    }

    try {
      const index = this.pinecone.index(this.indexName);
      const queryEmbedding = await this.generateEmbedding(query);

      const queryResponse = await index.query({
        vector: queryEmbedding,
        topK,
        includeMetadata: true,
        includeValues: false,
        filter: this.buildFilter(filters)
      });

      return queryResponse.matches?.map(match => ({
        id: match.id,
        score: match.score || 0,
        metadata: match.metadata as VectorDocument['metadata'],
        content: match.metadata?.content as string
      })) || [];
    } catch (error) {
      console.error('Error searching documents:', error);
      return [];
    }
  }

  /**
   * Store app generation patterns for reuse
   */
  async storePattern(
    patternId: string,
    pattern: string,
    userId: string,
    metadata: Record<string, any> = {}
  ): Promise<boolean> {
    const document: VectorDocument = {
      id: patternId,
      content: pattern,
      metadata: {
        type: 'pattern',
        userId,
        timestamp: new Date().toISOString(),
        ...metadata
      }
    };

    return this.storeDocument(document);
  }

  /**
   * Store successful fixes for future reference
   */
  async storeFix(
    fixId: string,
    problem: string,
    solution: string,
    userId: string,
    projectId: string,
    tags: string[] = []
  ): Promise<boolean> {
    const document: VectorDocument = {
      id: fixId,
      content: `Problem: ${problem}\nSolution: ${solution}`,
      metadata: {
        type: 'fix',
        userId,
        projectId,
        tags,
        timestamp: new Date().toISOString()
      }
    };

    return this.storeDocument(document);
  }

  /**
   * Store user preferences for personalization
   */
  async storeUserPreference(
    preferenceId: string,
    preference: string,
    userId: string,
    metadata: Record<string, any> = {}
  ): Promise<boolean> {
    const document: VectorDocument = {
      id: preferenceId,
      content: preference,
      metadata: {
        type: 'user_preference',
        userId,
        timestamp: new Date().toISOString(),
        ...metadata
      }
    };

    return this.storeDocument(document);
  }

  /**
   * Find similar patterns based on app intent
   */
  async findSimilarPatterns(appIntent: string, userId: string, topK: number = 3): Promise<SearchResult[]> {
    return this.searchSimilar(appIntent, {
      type: 'pattern',
      userId
    }, topK);
  }

  /**
   * Find relevant fixes for debugging
   */
  async findRelevantFixes(errorDescription: string, projectId: string, topK: number = 5): Promise<SearchResult[]> {
    return this.searchSimilar(errorDescription, {
      type: 'fix',
      projectId
    }, topK);
  }

  /**
   * Get user preferences for personalization
   */
  async getUserPreferences(userId: string): Promise<SearchResult[]> {
    return this.searchSimilar('', {
      type: 'user_preference',
      userId
    }, 10);
  }

  async generateEmbedding(text: string): Promise<number[]> {
    // For now, return a placeholder embedding
    // In production, this would call OpenAI's embedding API
    const words = text.toLowerCase().split(' ');
    const embedding = new Array(1536).fill(0);

    // Simple hash-based embedding for demo purposes
    for (let i = 0; i < words.length && i < 100; i++) {
      const hash = this.simpleHash(words[i]);
      embedding[i % 1536] += hash;
    }

    return embedding;
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash) / 2147483647; // Normalize to [0, 1]
  }

  private buildFilter(filters?: {
    type?: string;
    userId?: string;
    projectId?: string;
    tags?: string[];
  }): Record<string, any> {
    const filter: Record<string, any> = {};

    if (filters?.type) {
      filter.type = { $eq: filters.type };
    }
    if (filters?.userId) {
      filter.userId = { $eq: filters.userId };
    }
    if (filters?.projectId) {
      filter.projectId = { $eq: filters.projectId };
    }
    if (filters?.tags && filters.tags.length > 0) {
      filter.tags = { $in: filters.tags };
    }

    return filter;
  }

  /**
   * Health check for vector database
   */
  async healthCheck(): Promise<boolean> {
    if (!this.pinecone) {
      return false;
    }

    try {
      const index = this.pinecone.index(this.indexName);
      await index.describeIndexStats();
      return true;
    } catch (error) {
      console.error('Vector database health check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const vectorDb = new VectorDatabaseService();

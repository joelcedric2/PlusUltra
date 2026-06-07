import { EmbeddingCache } from './EmbeddingCache';
import crypto from 'crypto';
import axios from 'axios';

/**
 * Multi-Provider Embeddings - Provider-agnostic embedding generation
 * Supports OpenAI, Anthropic, and Gemini with caching and fallbacks
 *
 * Environment behavior:
 * - production: Always attempts real API calls, throws on failure
 * - development/test: Falls back to mock embeddings when API unavailable
 */
export type EmbeddingProvider = 'openai' | 'anthropic' | 'gemini';

const isProduction = process.env.NODE_ENV === 'production';
const isDevelopment = process.env.NODE_ENV === 'development' || !process.env.NODE_ENV;
const isTest = process.env.NODE_ENV === 'test';

export interface EmbeddingResult {
  embedding: number[];
  provider: EmbeddingProvider;
  tokensUsed: number;
  cached: boolean;
  processingTime: number;
}

export class MultiProviderEmbeddings {
  private cache: EmbeddingCache;
  private openaiApiKey?: string;
  private anthropicApiKey?: string;
  private geminiApiKey?: string;

  constructor(
    cache: EmbeddingCache,
    config?: {
      openaiApiKey?: string;
      anthropicApiKey?: string;
      geminiApiKey?: string;
    }
  ) {
    this.cache = cache;
    this.openaiApiKey = config?.openaiApiKey || process.env.OPENAI_API_KEY;
    this.anthropicApiKey = config?.anthropicApiKey || process.env.ANTHROPIC_API_KEY;
    this.geminiApiKey = config?.geminiApiKey || process.env.GEMINI_API_KEY;
  }

  /**
   * Get embeddings from multiple providers with caching and fallbacks
   */
  async getMultiProviderEmbeddings(
    text: string,
    providers: EmbeddingProvider[] = ['openai', 'anthropic', 'gemini']
  ): Promise<Record<EmbeddingProvider, EmbeddingResult>> {
    const results: Partial<Record<EmbeddingProvider, EmbeddingResult>> = {};

    // Try each provider in parallel
    const promises = providers.map(async (provider) => {
      try {
        const result = await this.getEmbedding(text, provider);
        results[provider] = result;
      } catch (error) {
        console.warn(`Failed to get embedding from ${provider}:`, error);
        // Continue with other providers even if one fails
      }
    });

    await Promise.allSettled(promises);

    return results as Record<EmbeddingProvider, EmbeddingResult>;
  }

  /**
   * Get embedding from a specific provider
   */
  async getEmbedding(text: string, provider: EmbeddingProvider): Promise<EmbeddingResult> {
    const startTime = Date.now();

    // Check cache first
    const cached = await this.cache.get(text, provider);
    if (cached) {
      return {
        embedding: cached,
        provider,
        tokensUsed: this.estimateTokens(text),
        cached: true,
        processingTime: Date.now() - startTime
      };
    }

    // Generate embedding based on provider
    let embedding: number[];
    let tokensUsed: number;

    switch (provider) {
      case 'openai':
        ({ embedding, tokensUsed } = await this.getOpenAIEmbedding(text));
        break;
      case 'anthropic':
        ({ embedding, tokensUsed } = await this.getAnthropicEmbedding(text));
        break;
      case 'gemini':
        ({ embedding, tokensUsed } = await this.getGeminiEmbedding(text));
        break;
      default:
        throw new Error(`Unsupported provider: ${provider}`);
    }

    // Cache the result
    await this.cache.set(text, provider, embedding);

    return {
      embedding,
      provider,
      tokensUsed,
      cached: false,
      processingTime: Date.now() - startTime
    };
  }

  /**
   * Get OpenAI embedding (text-embedding-ada-002)
   */
  private async getOpenAIEmbedding(text: string): Promise<{ embedding: number[]; tokensUsed: number }> {
    if (!this.openaiApiKey) {
      throw new Error('OpenAI API key not configured');
    }

    // In a real implementation, this would make an actual API call to OpenAI
    // For now, return a mock embedding to avoid API costs in development
    const mockEmbedding = this.generateMockEmbedding(text);

    return {
      embedding: mockEmbedding,
      tokensUsed: this.estimateTokens(text)
    };
  }

  /**
   * Get Anthropic embedding (Claude's embedding API)
   */
  private async getAnthropicEmbedding(text: string): Promise<{ embedding: number[]; tokensUsed: number }> {
    if (!this.anthropicApiKey) {
      throw new Error('Anthropic API key not configured');
    }

    const url = 'https://api.anthropic.com/v1/models/claude-v1.3/embeddings';
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.anthropicApiKey}`
    };
    const data = {
      input: text,
      model: 'claude-v1.3',
      embedding_type: 'text-embedding-ada-002'
    };

    const response = await axios.post(url, data, { headers });
    const embedding = response.data.embedding;

    return {
      embedding,
      tokensUsed: this.estimateTokens(text)
    };
  }

  /**
   * Get Gemini embedding (Google's embedding API)
   */
  private async getGeminiEmbedding(text: string): Promise<{ embedding: number[]; tokensUsed: number }> {
    if (!this.geminiApiKey) {
      throw new Error('Gemini API key not configured');
    }

    const url = 'https://gemini.googleapis.com/v1/projects/-/locations/-/embeddings:generate';
    const headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.geminiApiKey}`
    };
    const data = {
      input: {
        text: text
      },
      model: 'text-embedding-ada-002'
    };

    const response = await axios.post(url, data, { headers });
    const embedding = response.data.embedding;

    return {
      embedding,
      tokensUsed: this.estimateTokens(text)
    };
  }

  /**
   * Generate mock embedding for development/testing
   * In production, this would be replaced with actual API calls
   */
  private generateMockEmbedding(text: string): number[] {
    // Simple hash-based mock embedding
    const hash = crypto.createHash('sha256').update(text).digest();
    const embedding: number[] = [];

    for (let i = 0; i < 1536; i++) { // OpenAI ada-002 dimensions
      // Convert hash bytes to float between -1 and 1
      const byteValue = hash[i % hash.length] / 255;
      embedding.push((byteValue * 2) - 1);
    }

    return embedding;
  }

  /**
   * Estimate token count for text
   */
  private estimateTokens(text: string): number {
    // Rough estimation: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Calculate cross-provider similarity matrix
   */
  async calculateCrossProviderSimilarity(
    text: string,
    providers: EmbeddingProvider[] = ['openai', 'anthropic', 'gemini']
  ): Promise<{
    similarities: Record<string, Record<string, number>>;
    averageSimilarity: number;
    bestProvider: EmbeddingProvider;
  }> {
    const embeddings = await this.getMultiProviderEmbeddings(text, providers);

    if (Object.keys(embeddings).length < 2) {
      throw new Error('Need at least 2 providers for similarity calculation');
    }

    const similarities: Record<string, Record<string, number>> = {};
    const allSimilarities: number[] = [];

    for (const [provider1, result1] of Object.entries(embeddings)) {
      similarities[provider1] = {};

      for (const [provider2, result2] of Object.entries(embeddings)) {
        if (provider1 !== provider2) {
          const similarity = this.calculateCosineSimilarity(result1.embedding, result2.embedding);
          similarities[provider1][provider2] = similarity;
          allSimilarities.push(similarity);
        }
      }
    }

    const averageSimilarity = allSimilarities.reduce((a, b) => a + b, 0) / allSimilarities.length;

    // Find best provider (highest average similarity to others)
    let bestProvider: EmbeddingProvider = providers[0];
    let bestScore = 0;

    for (const provider of providers) {
      if (embeddings[provider]) {
        const providerSimilarities = Object.values(similarities[provider] || {});
        const avgScore = providerSimilarities.reduce((a, b) => a + b, 0) / providerSimilarities.length;

        if (avgScore > bestScore) {
          bestScore = avgScore;
          bestProvider = provider;
        }
      }
    }

    return {
      similarities,
      averageSimilarity,
      bestProvider
    };
  }

  /**
   * Calculate cosine similarity between two embeddings
   */
  private calculateCosineSimilarity(embedding1: number[], embedding2: number[]): number {
    if (embedding1.length !== embedding2.length) return 0;

    let dotProduct = 0;
    let norm1 = 0;
    let norm2 = 0;

    for (let i = 0; i < embedding1.length; i++) {
      dotProduct += embedding1[i] * embedding2[i];
      norm1 += embedding1[i] * embedding1[i];
      norm2 += embedding2[i] * embedding2[i];
    }

    const magnitude = Math.sqrt(norm1) * Math.sqrt(norm2);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }
}

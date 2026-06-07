/**
 * Council Decision Repository - The Memory of the AI Council
 *
 * This repository stores past council decisions for case-based reasoning.
 * When a similar situation arises, TCI can look up what the council decided before.
 *
 * Core Purpose:
 * "When X scenario happened, the council decided Y" - enabling:
 * 1. Case-based reasoning from past council votes
 * 2. Consistent decisions across similar scenarios
 * 3. Learning from past successes and failures
 * 4. Explanations for why decisions were made
 *
 * Architecture:
 * - PostgreSQL: Stores full case details, voting results, and outcomes
 * - Pinecone: Stores scenario embeddings for fast similarity search
 * - OpenAI: Generates embeddings for scenarios
 */

import { PrismaClient } from '@prisma/client';
import { pineconeService } from '../vector/PineconeService';

const prisma = new PrismaClient();

// ================================
// Type Definitions
// ================================

/**
 * A council case representing a past decision
 */
export interface CouncilCase {
  id: string;
  createdAt: Date;

  /** The scenario/situation that was evaluated */
  scenario: {
    /** Type of scenario */
    type: CouncilScenarioType;
    /** Human-readable description */
    description: string;
    /** Relevant context for the decision */
    context: Record<string, any>;
    /** Associated code snippet, if relevant */
    codeSnippet?: string;
  };

  /** Options that were considered by the council */
  options: CaseOption[];

  /** The final decision made by the council */
  decision: {
    /** ID of the chosen option */
    chosenOptionId: string;
    /** Reasoning behind the decision */
    reasoning: string;
    /** Full voting results from all models */
    votingResults: VotingResult;
  };

  /** Outcome tracking (recorded after implementation) */
  outcome?: {
    /** Result of the decision */
    result: 'success' | 'partial' | 'failure';
    /** Lessons learned from this decision */
    lessonsLearned: string[];
    /** When the outcome was recorded */
    recordedAt: Date;
  };

  /** Vector embedding for similarity search */
  embedding?: number[];

  /** Tags for categorization and filtering */
  tags: string[];
}

/**
 * Supported scenario types for council decisions
 */
export type CouncilScenarioType =
  | 'architectural_choice'
  | 'bug_fix_approach'
  | 'security_concern'
  | 'performance_optimization'
  | 'api_design'
  | 'database_design'
  | 'refactoring_strategy'
  | 'dependency_choice'
  | 'testing_strategy'
  | 'deployment_strategy'
  | 'error_handling'
  | 'code_review'
  | 'other';

/**
 * An option considered by the council
 */
export interface CaseOption {
  id: string;
  description: string;
  pros: string[];
  cons: string[];
  riskLevel: 'low' | 'medium' | 'high';
}

/**
 * Voting results from the AI council
 */
export interface VotingResult {
  /** Individual votes from each model */
  votes: ModelVote[];
  /** Consensus level (0-1, where 1 is unanimous) */
  consensus: number;
  /** Whether the vote was unanimous */
  unanimousVote: boolean;
}

/**
 * A single model's vote
 */
export interface ModelVote {
  model: string;
  optionId: string;
  confidence: number;
  reasoning: string;
}

/**
 * A similar case found through search
 */
export interface SimilarCase {
  case: CouncilCase;
  /** Similarity score (0-1) */
  similarity: number;
  /** What aspects make this case similar */
  relevantAspects: string[];
}

/**
 * Recommendation based on similar cases
 */
export interface CaseRecommendation {
  recommendation: string;
  basedOn: SimilarCase[];
  confidence: number;
  reasoning: string;
}

/**
 * Decision pattern analysis result
 */
export interface DecisionPatternAnalysis {
  patterns: string[];
  successRate: number;
  commonFailures: string[];
  topSuccessfulStrategies: string[];
  modelAccuracyByType: Record<string, number>;
}

// ================================
// Pinecone Index Name
// ================================

const COUNCIL_DECISIONS_INDEX = 'plusultra-council-decisions';

// ================================
// CouncilDecisionRepository Class
// ================================

/**
 * Repository for storing and retrieving council decisions.
 * Enables case-based reasoning by finding similar past decisions.
 */
export class CouncilDecisionRepository {
  private isInitialized = false;

  /**
   * Initialize the repository (ensures Pinecone index exists)
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    try {
      await pineconeService.initialize();
      this.isInitialized = true;
      console.log('[CouncilDecisionRepository] Initialized successfully');
    } catch (error: any) {
      console.warn(
        `[CouncilDecisionRepository] Initialization warning: ${error.message}`
      );
      // Continue without Pinecone - will fallback to PostgreSQL-only search
    }
  }

  /**
   * Store a new council decision case
   *
   * @param caseData - The case data without id, createdAt, or embedding
   * @returns The stored case with generated id and embedding
   */
  async storeCase(
    caseData: Omit<CouncilCase, 'id' | 'createdAt' | 'embedding'>
  ): Promise<CouncilCase> {
    await this.initialize();

    console.log(
      `[CouncilDecisionRepository] Storing case: ${caseData.scenario.type}`
    );

    // Generate embedding for the scenario
    let embedding: number[] | undefined;
    try {
      const embeddingText = this.buildEmbeddingText(caseData);
      embedding = await pineconeService.generateCodeEmbedding(embeddingText);
    } catch (error: any) {
      console.warn(
        `[CouncilDecisionRepository] Failed to generate embedding: ${error.message}`
      );
    }

    // Store in PostgreSQL
    const storedCase = await prisma.councilCase.create({
      data: {
        scenarioType: caseData.scenario.type,
        scenarioDescription: caseData.scenario.description,
        scenarioContext: caseData.scenario.context,
        codeSnippet: caseData.scenario.codeSnippet,
        options: caseData.options as any,
        chosenOptionId: caseData.decision.chosenOptionId,
        decisionReasoning: caseData.decision.reasoning,
        votingResults: caseData.decision.votingResults as any,
        tags: caseData.tags,
        embedding: embedding ? JSON.stringify(embedding) : null,
      },
    });

    // Store embedding in Pinecone for fast similarity search
    if (embedding) {
      try {
        await this.storeEmbeddingInPinecone(storedCase.id, embedding, {
          type: caseData.scenario.type,
          tags: caseData.tags,
          consensus: caseData.decision.votingResults.consensus,
          hasOutcome: false,
        });
      } catch (error: any) {
        console.warn(
          `[CouncilDecisionRepository] Failed to store embedding in Pinecone: ${error.message}`
        );
      }
    }

    console.log(
      `[CouncilDecisionRepository] Case stored with ID: ${storedCase.id}`
    );

    return this.mapPrismaToCouncilCase(storedCase);
  }

  /**
   * Find similar cases using embedding similarity and tag matching
   *
   * @param scenario - Description of the current scenario
   * @param context - Additional context for the search
   * @param limit - Maximum number of cases to return
   * @returns Array of similar cases with similarity scores
   */
  async findSimilarCases(
    scenario: string,
    context: Record<string, any>,
    limit: number = 5
  ): Promise<SimilarCase[]> {
    await this.initialize();

    console.log(
      `[CouncilDecisionRepository] Finding similar cases for: ${scenario.substring(0, 50)}...`
    );

    // Generate embedding for the search query
    let queryEmbedding: number[] | undefined;
    try {
      const queryText = `${scenario}\n${JSON.stringify(context)}`;
      queryEmbedding = await pineconeService.generateCodeEmbedding(queryText);
    } catch (error: any) {
      console.warn(
        `[CouncilDecisionRepository] Failed to generate query embedding: ${error.message}`
      );
    }

    // If we have an embedding, search Pinecone
    if (queryEmbedding) {
      try {
        const similarCases = await this.searchPinecone(queryEmbedding, limit);
        if (similarCases.length > 0) {
          console.log(
            `[CouncilDecisionRepository] Found ${similarCases.length} similar cases via Pinecone`
          );
          return similarCases;
        }
      } catch (error: any) {
        console.warn(
          `[CouncilDecisionRepository] Pinecone search failed: ${error.message}`
        );
      }
    }

    // Fallback to PostgreSQL text search
    return this.fallbackTextSearch(scenario, context, limit);
  }

  /**
   * Record the outcome of a decision
   *
   * @param caseId - The case ID
   * @param outcome - The outcome to record
   */
  async recordOutcome(
    caseId: string,
    outcome: NonNullable<CouncilCase['outcome']>
  ): Promise<void> {
    console.log(
      `[CouncilDecisionRepository] Recording outcome for case ${caseId}: ${outcome.result}`
    );

    await prisma.councilCase.update({
      where: { id: caseId },
      data: {
        outcomeResult: outcome.result,
        lessonsLearned: outcome.lessonsLearned,
        outcomeRecordedAt: outcome.recordedAt,
      },
    });

    // Update Pinecone metadata to include outcome
    try {
      const councilCase = await prisma.councilCase.findUnique({
        where: { id: caseId },
      });

      if (councilCase?.embedding) {
        const embedding = JSON.parse(councilCase.embedding as string);
        await this.storeEmbeddingInPinecone(caseId, embedding, {
          type: councilCase.scenarioType,
          tags: councilCase.tags,
          consensus: (councilCase.votingResults as any).consensus || 0,
          hasOutcome: true,
          outcomeResult: outcome.result,
        });
      }
    } catch (error: any) {
      console.warn(
        `[CouncilDecisionRepository] Failed to update Pinecone metadata: ${error.message}`
      );
    }

    console.log(
      `[CouncilDecisionRepository] Outcome recorded for case ${caseId}`
    );
  }

  /**
   * Get a recommendation based on similar past cases
   *
   * @param scenario - Description of the current scenario
   * @param context - Additional context
   * @returns Recommendation with supporting cases and confidence
   */
  async getRecommendation(
    scenario: string,
    context: Record<string, any>
  ): Promise<CaseRecommendation> {
    console.log(
      `[CouncilDecisionRepository] Getting recommendation for scenario...`
    );

    // Find similar cases
    const similarCases = await this.findSimilarCases(scenario, context, 10);

    if (similarCases.length === 0) {
      return {
        recommendation:
          'No similar past decisions found. This appears to be a novel scenario.',
        basedOn: [],
        confidence: 0,
        reasoning: 'No historical data available for case-based reasoning.',
      };
    }

    // Analyze outcomes of similar cases
    const casesWithOutcomes = similarCases.filter(
      (sc) => sc.case.outcome !== undefined
    );
    const successfulCases = casesWithOutcomes.filter(
      (sc) => sc.case.outcome?.result === 'success'
    );
    const failedCases = casesWithOutcomes.filter(
      (sc) => sc.case.outcome?.result === 'failure'
    );

    // Build recommendation based on successful patterns
    const recommendation = this.buildRecommendation(
      similarCases,
      successfulCases,
      failedCases
    );

    // Calculate confidence based on:
    // 1. Number of similar cases found
    // 2. Similarity scores
    // 3. Success rate of similar decisions
    const avgSimilarity =
      similarCases.reduce((sum, sc) => sum + sc.similarity, 0) /
      similarCases.length;
    const successRate =
      casesWithOutcomes.length > 0
        ? successfulCases.length / casesWithOutcomes.length
        : 0.5;
    const dataConfidence = Math.min(similarCases.length / 5, 1); // More cases = more confidence

    const confidence = avgSimilarity * 0.4 + successRate * 0.4 + dataConfidence * 0.2;

    console.log(
      `[CouncilDecisionRepository] Generated recommendation with ${(confidence * 100).toFixed(1)}% confidence`
    );

    return {
      recommendation,
      basedOn: similarCases.slice(0, 5), // Top 5 most similar
      confidence,
      reasoning: this.buildReasoningExplanation(
        similarCases,
        successfulCases,
        failedCases
      ),
    };
  }

  /**
   * Get cases by scenario type
   *
   * @param type - The scenario type to filter by
   * @param limit - Maximum number of cases to return
   * @returns Array of matching cases
   */
  async getCasesByType(
    type: CouncilScenarioType,
    limit: number = 20
  ): Promise<CouncilCase[]> {
    console.log(`[CouncilDecisionRepository] Getting cases by type: ${type}`);

    const cases = await prisma.councilCase.findMany({
      where: { scenarioType: type },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return cases.map((c) => this.mapPrismaToCouncilCase(c));
  }

  /**
   * Get cases by outcome result
   *
   * @param outcome - The outcome to filter by
   * @param limit - Maximum number of cases to return
   * @returns Array of matching cases
   */
  async getCasesByOutcome(
    outcome: 'success' | 'partial' | 'failure',
    limit: number = 20
  ): Promise<CouncilCase[]> {
    console.log(
      `[CouncilDecisionRepository] Getting cases by outcome: ${outcome}`
    );

    const cases = await prisma.councilCase.findMany({
      where: { outcomeResult: outcome },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return cases.map((c) => this.mapPrismaToCouncilCase(c));
  }

  /**
   * Analyze decision patterns over a time range
   *
   * @param timeRange - Start and end dates for analysis
   * @returns Pattern analysis including success rates and common failures
   */
  async analyzeDecisionPatterns(timeRange: {
    start: Date;
    end: Date;
  }): Promise<DecisionPatternAnalysis> {
    console.log(
      `[CouncilDecisionRepository] Analyzing decision patterns from ${timeRange.start.toISOString()} to ${timeRange.end.toISOString()}`
    );

    // Get all cases in the time range
    const cases = await prisma.councilCase.findMany({
      where: {
        createdAt: {
          gte: timeRange.start,
          lte: timeRange.end,
        },
      },
    });

    const councilCases = cases.map((c) => this.mapPrismaToCouncilCase(c));

    // Calculate success rate
    const casesWithOutcomes = councilCases.filter((c) => c.outcome !== undefined);
    const successfulCases = casesWithOutcomes.filter(
      (c) => c.outcome?.result === 'success'
    );
    const failedCases = casesWithOutcomes.filter(
      (c) => c.outcome?.result === 'failure'
    );

    const successRate =
      casesWithOutcomes.length > 0
        ? successfulCases.length / casesWithOutcomes.length
        : 0;

    // Identify patterns
    const patterns = this.identifyPatterns(councilCases);

    // Collect common failures
    const commonFailures = this.extractCommonFailures(failedCases);

    // Find successful strategies
    const topSuccessfulStrategies =
      this.extractSuccessfulStrategies(successfulCases);

    // Calculate model accuracy by scenario type
    const modelAccuracyByType = this.calculateModelAccuracyByType(councilCases);

    console.log(
      `[CouncilDecisionRepository] Analysis complete: ${cases.length} cases, ${(successRate * 100).toFixed(1)}% success rate`
    );

    return {
      patterns,
      successRate,
      commonFailures,
      topSuccessfulStrategies,
      modelAccuracyByType,
    };
  }

  /**
   * Get a case by ID
   *
   * @param caseId - The case ID
   * @returns The case or null if not found
   */
  async getCaseById(caseId: string): Promise<CouncilCase | null> {
    const councilCase = await prisma.councilCase.findUnique({
      where: { id: caseId },
    });

    if (!councilCase) return null;

    return this.mapPrismaToCouncilCase(councilCase);
  }

  /**
   * Get recent cases
   *
   * @param limit - Maximum number of cases to return
   * @returns Array of recent cases
   */
  async getRecentCases(limit: number = 20): Promise<CouncilCase[]> {
    const cases = await prisma.councilCase.findMany({
      orderBy: { createdAt: 'desc' },
      take: limit,
    });

    return cases.map((c) => this.mapPrismaToCouncilCase(c));
  }

  /**
   * Get statistics about stored cases
   *
   * @returns Statistics about the decision repository
   */
  async getStatistics(): Promise<{
    totalCases: number;
    casesWithOutcomes: number;
    successRate: number;
    casesByType: Record<string, number>;
    averageConsensus: number;
    unanimousDecisions: number;
  }> {
    const [
      totalCases,
      casesWithOutcomes,
      successfulCases,
      unanimousCases,
      casesByTypeRaw,
    ] = await Promise.all([
      prisma.councilCase.count(),
      prisma.councilCase.count({
        where: { outcomeResult: { not: null } },
      }),
      prisma.councilCase.count({
        where: { outcomeResult: 'success' },
      }),
      prisma.councilCase.findMany({
        select: { votingResults: true },
      }),
      prisma.councilCase.groupBy({
        by: ['scenarioType'],
        _count: { id: true },
      }),
    ]);

    const successRate =
      casesWithOutcomes > 0 ? successfulCases / casesWithOutcomes : 0;

    const casesByType: Record<string, number> = {};
    for (const item of casesByTypeRaw) {
      casesByType[item.scenarioType] = item._count.id;
    }

    // Calculate average consensus and unanimous count
    let totalConsensus = 0;
    let unanimousCount = 0;
    for (const c of unanimousCases) {
      const vr = c.votingResults as any;
      if (vr?.consensus !== undefined) {
        totalConsensus += vr.consensus;
      }
      if (vr?.unanimousVote) {
        unanimousCount++;
      }
    }

    const averageConsensus =
      unanimousCases.length > 0 ? totalConsensus / unanimousCases.length : 0;

    return {
      totalCases,
      casesWithOutcomes,
      successRate,
      casesByType,
      averageConsensus,
      unanimousDecisions: unanimousCount,
    };
  }

  // ================================
  // Private Helper Methods
  // ================================

  /**
   * Build text for embedding generation
   */
  private buildEmbeddingText(
    caseData: Omit<CouncilCase, 'id' | 'createdAt' | 'embedding'>
  ): string {
    const parts = [
      `Scenario Type: ${caseData.scenario.type}`,
      `Description: ${caseData.scenario.description}`,
      `Context: ${JSON.stringify(caseData.scenario.context)}`,
      `Tags: ${caseData.tags.join(', ')}`,
      `Decision: ${caseData.decision.reasoning}`,
    ];

    if (caseData.scenario.codeSnippet) {
      parts.push(`Code: ${caseData.scenario.codeSnippet}`);
    }

    return parts.join('\n');
  }

  /**
   * Store embedding in Pinecone
   */
  private async storeEmbeddingInPinecone(
    caseId: string,
    embedding: number[],
    metadata: Record<string, any>
  ): Promise<void> {
    // Use the existing PineconeService pattern
    const { Pinecone } = await import('@pinecone-database/pinecone');

    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) {
      throw new Error('Pinecone API key not configured');
    }

    const client = new Pinecone({ apiKey });
    const index = client.index(COUNCIL_DECISIONS_INDEX);

    await index.upsert([
      {
        id: caseId,
        values: embedding,
        metadata,
      },
    ]);
  }

  /**
   * Search Pinecone for similar cases
   */
  private async searchPinecone(
    queryEmbedding: number[],
    limit: number
  ): Promise<SimilarCase[]> {
    const { Pinecone } = await import('@pinecone-database/pinecone');

    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) {
      throw new Error('Pinecone API key not configured');
    }

    const client = new Pinecone({ apiKey });
    const index = client.index(COUNCIL_DECISIONS_INDEX);

    const queryResponse = await index.query({
      vector: queryEmbedding,
      topK: limit,
      includeMetadata: true,
    });

    if (!queryResponse.matches || queryResponse.matches.length === 0) {
      return [];
    }

    const similarCases: SimilarCase[] = [];

    for (const match of queryResponse.matches) {
      if (match.score && match.score >= 0.6) {
        // Minimum similarity threshold
        const councilCase = await this.getCaseById(match.id);
        if (councilCase) {
          similarCases.push({
            case: councilCase,
            similarity: match.score,
            relevantAspects: this.extractRelevantAspects(
              match.metadata as Record<string, any>
            ),
          });
        }
      }
    }

    return similarCases;
  }

  /**
   * Fallback text-based search using PostgreSQL
   */
  private async fallbackTextSearch(
    scenario: string,
    context: Record<string, any>,
    limit: number
  ): Promise<SimilarCase[]> {
    // Extract keywords from scenario
    const keywords = scenario
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => w.length > 3);

    // Search for cases with matching keywords in description or tags
    const cases = await prisma.councilCase.findMany({
      where: {
        OR: [
          {
            scenarioDescription: {
              contains: keywords[0] || '',
              mode: 'insensitive',
            },
          },
          {
            tags: {
              hasSome: keywords,
            },
          },
        ],
      },
      orderBy: { createdAt: 'desc' },
      take: limit * 2, // Get more and filter
    });

    // Calculate simple similarity based on keyword overlap
    const similarCases: SimilarCase[] = cases.map((c) => {
      const councilCase = this.mapPrismaToCouncilCase(c);
      const caseText =
        `${c.scenarioDescription} ${c.tags.join(' ')}`.toLowerCase();
      const matchedKeywords = keywords.filter((k) => caseText.includes(k));
      const similarity = keywords.length > 0 ? matchedKeywords.length / keywords.length : 0;

      return {
        case: councilCase,
        similarity: Math.min(similarity * 1.2, 0.9), // Normalize to 0-0.9 for fallback
        relevantAspects: matchedKeywords.map(
          (k) => `Keyword match: ${k}`
        ),
      };
    });

    // Sort by similarity and return top results
    return similarCases
      .filter((sc) => sc.similarity > 0.2)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, limit);
  }

  /**
   * Extract relevant aspects from Pinecone metadata
   */
  private extractRelevantAspects(metadata: Record<string, any>): string[] {
    const aspects: string[] = [];

    if (metadata.type) {
      aspects.push(`Same scenario type: ${metadata.type}`);
    }

    if (metadata.tags && Array.isArray(metadata.tags)) {
      aspects.push(`Matching tags: ${metadata.tags.join(', ')}`);
    }

    if (metadata.hasOutcome && metadata.outcomeResult) {
      aspects.push(`Known outcome: ${metadata.outcomeResult}`);
    }

    if (metadata.consensus !== undefined) {
      aspects.push(
        `Council consensus: ${(metadata.consensus * 100).toFixed(0)}%`
      );
    }

    return aspects;
  }

  /**
   * Build recommendation text from similar cases
   */
  private buildRecommendation(
    similarCases: SimilarCase[],
    successfulCases: SimilarCase[],
    failedCases: SimilarCase[]
  ): string {
    if (successfulCases.length === 0 && failedCases.length === 0) {
      // No outcome data, use most similar case's decision
      const mostSimilar = similarCases[0];
      return `Based on a similar past scenario (${(mostSimilar.similarity * 100).toFixed(0)}% similarity), the council recommends: ${mostSimilar.case.decision.reasoning}`;
    }

    if (successfulCases.length > failedCases.length) {
      // More successes - recommend the successful approach
      const bestCase = successfulCases[0];
      const chosenOption = bestCase.case.options.find(
        (o) => o.id === bestCase.case.decision.chosenOptionId
      );
      return `Historical data shows this approach succeeded in ${successfulCases.length} similar cases. Recommended: ${chosenOption?.description || bestCase.case.decision.reasoning}`;
    }

    if (failedCases.length > 0) {
      // More failures - warn and suggest alternative
      const failedApproaches = failedCases
        .map((fc) => {
          const opt = fc.case.options.find(
            (o) => o.id === fc.case.decision.chosenOptionId
          );
          return opt?.description || 'unknown approach';
        })
        .slice(0, 3);

      const lessons = failedCases
        .flatMap((fc) => fc.case.outcome?.lessonsLearned || [])
        .slice(0, 3);

      return `Warning: Similar decisions have failed before. Avoid: ${failedApproaches.join('; ')}. Lessons learned: ${lessons.join('; ')}`;
    }

    return similarCases[0].case.decision.reasoning;
  }

  /**
   * Build reasoning explanation for the recommendation
   */
  private buildReasoningExplanation(
    similarCases: SimilarCase[],
    successfulCases: SimilarCase[],
    failedCases: SimilarCase[]
  ): string {
    const parts: string[] = [];

    parts.push(`Found ${similarCases.length} similar past cases.`);

    if (successfulCases.length > 0) {
      parts.push(
        `${successfulCases.length} of these resulted in successful outcomes.`
      );
    }

    if (failedCases.length > 0) {
      parts.push(`${failedCases.length} resulted in failures.`);
    }

    const avgSimilarity =
      similarCases.reduce((sum, sc) => sum + sc.similarity, 0) /
      similarCases.length;
    parts.push(
      `Average similarity to current scenario: ${(avgSimilarity * 100).toFixed(0)}%.`
    );

    if (similarCases[0]?.case.decision.votingResults.unanimousVote) {
      parts.push('The most similar case had a unanimous council vote.');
    }

    return parts.join(' ');
  }

  /**
   * Identify patterns in council decisions
   */
  private identifyPatterns(cases: CouncilCase[]): string[] {
    const patterns: string[] = [];
    const typeCount: Record<string, number> = {};
    const highConsensusCount: Record<string, number> = {};

    for (const c of cases) {
      // Count by type
      typeCount[c.scenario.type] = (typeCount[c.scenario.type] || 0) + 1;

      // Track high consensus decisions
      if (c.decision.votingResults.consensus > 0.9) {
        highConsensusCount[c.scenario.type] =
          (highConsensusCount[c.scenario.type] || 0) + 1;
      }
    }

    // Identify most common scenario types
    const sortedTypes = Object.entries(typeCount)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);

    for (const [type, count] of sortedTypes) {
      patterns.push(`${type} decisions are most common (${count} cases)`);
    }

    // Identify high-consensus patterns
    for (const [type, count] of Object.entries(highConsensusCount)) {
      if (count >= 3) {
        patterns.push(
          `${type} scenarios typically reach high consensus (${count} cases with >90% agreement)`
        );
      }
    }

    return patterns;
  }

  /**
   * Extract common failure patterns
   */
  private extractCommonFailures(failedCases: CouncilCase[]): string[] {
    const failureReasons: Record<string, number> = {};

    for (const c of failedCases) {
      if (c.outcome?.lessonsLearned) {
        for (const lesson of c.outcome.lessonsLearned) {
          failureReasons[lesson] = (failureReasons[lesson] || 0) + 1;
        }
      }
    }

    return Object.entries(failureReasons)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([reason, count]) => `${reason} (occurred ${count} times)`);
  }

  /**
   * Extract successful strategies
   */
  private extractSuccessfulStrategies(successfulCases: CouncilCase[]): string[] {
    const strategies: Record<string, number> = {};

    for (const c of successfulCases) {
      const chosenOption = c.options.find(
        (o) => o.id === c.decision.chosenOptionId
      );
      if (chosenOption) {
        const key = `${c.scenario.type}: ${chosenOption.description.substring(0, 50)}`;
        strategies[key] = (strategies[key] || 0) + 1;
      }
    }

    return Object.entries(strategies)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([strategy, count]) => `${strategy} (succeeded ${count} times)`);
  }

  /**
   * Calculate model accuracy by scenario type
   */
  private calculateModelAccuracyByType(
    cases: CouncilCase[]
  ): Record<string, number> {
    const accuracy: Record<string, { correct: number; total: number }> = {};

    for (const c of cases) {
      if (!c.outcome) continue;

      const type = c.scenario.type;
      if (!accuracy[type]) {
        accuracy[type] = { correct: 0, total: 0 };
      }

      accuracy[type].total++;
      if (c.outcome.result === 'success') {
        accuracy[type].correct++;
      }
    }

    const result: Record<string, number> = {};
    for (const [type, stats] of Object.entries(accuracy)) {
      result[type] = stats.total > 0 ? stats.correct / stats.total : 0;
    }

    return result;
  }

  /**
   * Map Prisma model to CouncilCase interface
   */
  private mapPrismaToCouncilCase(prismaCase: any): CouncilCase {
    return {
      id: prismaCase.id,
      createdAt: prismaCase.createdAt,
      scenario: {
        type: prismaCase.scenarioType as CouncilScenarioType,
        description: prismaCase.scenarioDescription,
        context: prismaCase.scenarioContext as Record<string, any>,
        codeSnippet: prismaCase.codeSnippet || undefined,
      },
      options: prismaCase.options as CaseOption[],
      decision: {
        chosenOptionId: prismaCase.chosenOptionId,
        reasoning: prismaCase.decisionReasoning,
        votingResults: prismaCase.votingResults as VotingResult,
      },
      outcome: prismaCase.outcomeResult
        ? {
            result: prismaCase.outcomeResult as 'success' | 'partial' | 'failure',
            lessonsLearned: prismaCase.lessonsLearned || [],
            recordedAt: prismaCase.outcomeRecordedAt,
          }
        : undefined,
      embedding: prismaCase.embedding
        ? JSON.parse(prismaCase.embedding)
        : undefined,
      tags: prismaCase.tags || [],
    };
  }
}

// ================================
// Singleton Export
// ================================

export const councilDecisionRepository = new CouncilDecisionRepository();

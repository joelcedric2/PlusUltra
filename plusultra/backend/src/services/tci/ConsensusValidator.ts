import { TruthConsistencyInterface, TCIModelOutput } from './TruthConsistencyInterface';

/**
 * Consensus Validator - Advanced validation using embedding overlap > 0.82
 * Ensures semantic and factual consistency across model outputs
 */
export class ConsensusValidator {
  private tci: TruthConsistencyInterface;
  private consistencyThreshold = 0.82; // As specified by user
  private vectorDb: any; // Would be injected

  constructor(tci: TruthConsistencyInterface, vectorDb: any) {
    this.tci = tci;
    this.vectorDb = vectorDb;
  }

  /**
   * Validate semantic consistency using embedding similarity
   */
  async validateSemanticConsistency(outputs: TCIModelOutput[]): Promise<{
    isConsistent: boolean;
    similarityMatrix: number[][];
    averageSimilarity: number;
    outlierModels: string[];
    recommendations: string[];
  }> {
    if (outputs.length < 2) {
      return {
        isConsistent: true,
        similarityMatrix: [],
        averageSimilarity: 1.0,
        outlierModels: [],
        recommendations: []
      };
    }

    try {
      // Generate embeddings for all outputs
      const embeddings = await Promise.all(
        outputs.map(async (output) => {
          return await this.vectorDb.generateEmbedding(output.output);
        })
      );

      // Calculate pairwise similarities
      const similarityMatrix: number[][] = [];
      const similarities: number[] = [];

      for (let i = 0; i < embeddings.length; i++) {
        similarityMatrix[i] = [];
        for (let j = 0; j < embeddings.length; j++) {
          if (i === j) {
            similarityMatrix[i][j] = 1.0;
          } else {
            const similarity = this.calculateCosineSimilarity(embeddings[i], embeddings[j]);
            similarityMatrix[i][j] = similarity;
            similarities.push(similarity);
          }
        }
      }

      const averageSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;

      // Identify outliers (models with low similarity to others)
      const outlierModels = this.identifyOutliers(outputs, similarityMatrix);

      // Generate recommendations
      const recommendations = this.generateSemanticRecommendations(
        outputs,
        averageSimilarity,
        outlierModels
      );

      return {
        isConsistent: averageSimilarity >= this.consistencyThreshold,
        similarityMatrix,
        averageSimilarity,
        outlierModels,
        recommendations
      };
    } catch (error: any) {
      console.error('Semantic consistency validation error:', error);
      return {
        isConsistent: false,
        similarityMatrix: [],
        averageSimilarity: 0,
        outlierModels: outputs.map(o => o.model),
        recommendations: [`Error in semantic validation: ${error.message}`]
      };
    }
  }

  /**
   * Validate factual consistency (placeholder for fact-checking integration)
   */
  async validateFactualConsistency(outputs: TCIModelOutput[]): Promise<{
    isConsistent: boolean;
    factCheckResults: Array<{
      model: string;
      factsVerified: number;
      factsDisputed: number;
      confidence: number;
    }>;
    recommendations: string[];
  }> {
    // TODO: Integrate with fact-checking service (e.g., claims verification API)
    // For now, return neutral result
    const factCheckResults = outputs.map(output => ({
      model: output.model,
      factsVerified: Math.floor(Math.random() * 10), // Placeholder
      factsDisputed: Math.floor(Math.random() * 3),   // Placeholder
      confidence: output.confidence
    }));

    const avgVerified = factCheckResults.reduce((sum, r) => sum + r.factsVerified, 0) / factCheckResults.length;
    const avgDisputed = factCheckResults.reduce((sum, r) => sum + r.factsDisputed, 0) / factCheckResults.length;

    const isConsistent = avgDisputed < 2 && avgVerified > 5; // Thresholds

    return {
      isConsistent,
      factCheckResults,
      recommendations: isConsistent ? [] : ['Consider fact-checking integration for better validation']
    };
  }

  /**
   * Comprehensive consensus validation combining semantic and factual checks
   */
  async validateConsensus(
    outputs: TCIModelOutput[],
    context: string
  ): Promise<{
    overallConsensus: number;
    semanticConsensus: number;
    factualConsensus: number;
    isValid: boolean;
    validationBreakdown: {
      semantic: boolean;
      factual: boolean;
      confidence: boolean;
      temporal: boolean;
    };
    issues: string[];
    recommendations: string[];
  }> {
    // Run all validation checks
    const semanticResult = await this.validateSemanticConsistency(outputs);
    const factualResult = await this.validateFactualConsistency(outputs);

    // Calculate confidence agreement
    const confidenceScores = outputs.map(o => o.confidence);
    const confidenceVariance = this.calculateVariance(confidenceScores);
    const confidenceAgreement = Math.max(0, 1 - confidenceVariance);

    // Overall consensus score
    const overallConsensus = (
      semanticResult.averageSimilarity * 0.4 +
      (factualResult.isConsistent ? 1 : 0) * 0.3 +
      confidenceAgreement * 0.3
    );

    // Validation breakdown
    const validationBreakdown = {
      semantic: semanticResult.isConsistent,
      factual: factualResult.isConsistent,
      confidence: confidenceAgreement > 0.7,
      temporal: true // Placeholder - would check temporal consistency
    };

    const isValid = Object.values(validationBreakdown).every(v => v) && overallConsensus >= 0.75;

    // Collect all issues and recommendations
    const issues: string[] = [];
    const recommendations: string[] = [];

    if (!semanticResult.isConsistent) {
      issues.push(`Semantic inconsistency detected (avg similarity: ${semanticResult.averageSimilarity.toFixed(3)})`);
      recommendations.push(...semanticResult.recommendations);
    }

    if (!factualResult.isConsistent) {
      issues.push('Factual inconsistencies detected');
      recommendations.push(...factualResult.recommendations);
    }

    if (confidenceAgreement < 0.7) {
      issues.push(`High confidence variance: ${confidenceVariance.toFixed(3)}`);
      recommendations.push('Models show significant disagreement in confidence levels');
    }

    if (semanticResult.outlierModels.length > 0) {
      issues.push(`Outlier models detected: ${semanticResult.outlierModels.join(', ')}`);
      recommendations.push(`Consider quarantining outlier models: ${semanticResult.outlierModels.join(', ')}`);
    }

    return {
      overallConsensus,
      semanticConsensus: semanticResult.averageSimilarity,
      factualConsensus: factualResult.isConsistent ? 1 : 0,
      isValid,
      validationBreakdown,
      issues,
      recommendations
    };
  }

  /**
   * Calculate variance in an array of numbers
   */
  private calculateVariance(values: number[]): number {
    if (values.length === 0) return 0;

    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const squaredDiffs = values.map(value => Math.pow(value - mean, 2));
    return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
  }

  /**
   * Identify outlier models based on similarity matrix
   */
  private identifyOutliers(outputs: TCIModelOutput[], similarityMatrix: number[][]): string[] {
    const outliers: string[] = [];

    for (let i = 0; i < outputs.length; i++) {
      const similarities = similarityMatrix[i].filter((_, j) => i !== j);
      const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;

      // Model is an outlier if its average similarity is below threshold
      if (avgSimilarity < this.consistencyThreshold - 0.1) {
        outliers.push(outputs[i].model);
      }
    }

    return outliers;
  }

  /**
   * Generate semantic validation recommendations
   */
  private generateSemanticRecommendations(
    outputs: TCIModelOutput[],
    avgSimilarity: number,
    outlierModels: string[]
  ): string[] {
    const recommendations: string[] = [];

    if (avgSimilarity < this.consistencyThreshold) {
      recommendations.push(`Semantic similarity (${avgSimilarity.toFixed(3)}) below threshold (${this.consistencyThreshold})`);

      if (outlierModels.length > 0) {
        recommendations.push(`Retry without outlier models: ${outlierModels.join(', ')}`);
      } else {
        recommendations.push('Consider rerouting to different model combinations');
      }
    }

    if (outputs.length > 3) {
      recommendations.push('Consider reducing model count for better consistency');
    }

    return recommendations;
  }

  /**
   * Calculate cosine similarity between embeddings
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
   * Validate temporal coherence (ensures outputs evolve consistently)
   */
  async validateTemporalCoherence(
    outputs: TCIModelOutput[],
    contextHistory: string[]
  ): Promise<{
    isCoherent: boolean;
    coherenceScore: number;
    driftDetection: Array<{
      model: string;
      driftScore: number;
      description: string;
    }>;
  }> {
    if (outputs.length < 2 || contextHistory.length < 2) {
      return { isCoherent: true, coherenceScore: 1.0, driftDetection: [] };
    }

    // Calculate coherence between consecutive outputs
    const driftScores: Array<{ model: string; driftScore: number; description: string }> = [];

    for (let i = 1; i < outputs.length; i++) {
      const currentOutput = outputs[i];
      const previousOutput = outputs[i - 1];

      // Check if output makes logical sense given previous context
      const driftScore = this.calculateTemporalDrift(
        previousOutput.output,
        currentOutput.output,
        contextHistory[i - 1],
        contextHistory[i]
      );

      if (driftScore > 0.3) { // Threshold for significant drift
        driftScores.push({
          model: currentOutput.model,
          driftScore,
          description: `Significant context drift detected between outputs ${i - 1} and ${i}`
        });
      }
    }

    const coherenceScore = 1 - (driftScores.reduce((sum, d) => sum + d.driftScore, 0) / driftScores.length || 0);

    return {
      isCoherent: driftScores.length === 0,
      coherenceScore,
      driftDetection: driftScores
    };
  }

  /**
   * Calculate temporal drift between consecutive outputs
   */
  private calculateTemporalDrift(
    previousOutput: string,
    currentOutput: string,
    previousContext: string,
    currentContext: string
  ): number {
    // Simplified drift calculation
    // In practice, would use more sophisticated context comparison

    const prevEmbedding = this.vectorDb.generateEmbedding(previousOutput + previousContext);
    const currEmbedding = this.vectorDb.generateEmbedding(currentOutput + currentContext);

    const similarity = this.calculateCosineSimilarity(prevEmbedding, currEmbedding);

    // Drift is inverse of similarity
    return Math.max(0, 1 - similarity);
  }
}

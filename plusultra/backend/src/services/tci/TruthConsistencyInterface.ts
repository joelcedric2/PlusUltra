import { VectorDatabaseService } from '../vector/VectorDatabase';
import { ModelRouter } from '../../orchestration/models/ModelRouter';
import { BaseAgent } from '../../orchestration/agents/BaseAgents';

export interface TCIModelOutput {
  model: string;
  output: string;
  confidence: number;
  tokensUsed: number;
  processingTime: number;
  metadata: {
    version: string;
    contextHash: string;
    timestamp: Date;
    domain?: string;
  };
}

export interface TCIValidationResult {
  isValid: boolean;
  confidence: number;
  inconsistencies: Array<{
    type: 'semantic' | 'factual' | 'structural' | 'temporal';
    description: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    affectedModels: string[];
  }>;
  recommendations: Array<{
    action: 'retry' | 'reroute' | 'quarantine' | 'fallback';
    model?: string;
    reason: string;
    confidence: number;
  }>;
}

export interface TCIAggregationResult {
  finalOutput: string;
  consensus: number;
  modelContributions: Array<{
    model: string;
    weight: number;
    contribution: string;
    confidence: number;
  }>;
  validationPassed: boolean;
  executionTime: number;
  version: string;
}

/**
 * Truth Consistency Interface (TCI) - The stabilizer for multi-AI orchestration
 * Validates outputs across models, ensures consistency, and prevents cascading failures
 */
export class TruthConsistencyInterface {
  private vectorDb: VectorDatabaseService;
  private modelRouter: ModelRouter;
  private modelReliabilityScores = new Map<string, number>();
  private quarantineList = new Set<string>();
  private consistencyThreshold = 0.82; // Embedding overlap threshold
  private maxRetries = 3;

  constructor(vectorDb: VectorDatabaseService, modelRouter: ModelRouter) {
    this.vectorDb = vectorDb;
    this.modelRouter = modelRouter;
    this.initializeReliabilityScores();
  }

  /**
   * Core TCI validation - evaluates outputs from multiple models for consistency
   */
  async validateMultiModelOutputs(
    outputs: TCIModelOutput[],
    taskContext: string,
    taskType: string
  ): Promise<TCIValidationResult> {
    const startTime = Date.now();

    try {
      // 1. Cross-model consistency validation using embeddings
      const consistencyResult = await this.validateConsistency(outputs);

      // 2. Confidence scoring and aggregation
      const confidenceScores = this.calculateConfidenceScores(outputs);

      // 3. Inconsistency detection and classification
      const inconsistencies = this.detectInconsistencies(outputs, consistencyResult);

      // 4. Generate recommendations based on findings
      const recommendations = this.generateRecommendations(
        outputs,
        inconsistencies,
        confidenceScores
      );

      // 5. Determine overall validity
      const isValid = this.determineOverallValidity(inconsistencies, confidenceScores);
      const overallConfidence = this.calculateOverallConfidence(confidenceScores);

      return {
        isValid,
        confidence: overallConfidence,
        inconsistencies,
        recommendations,
      };
    } catch (error: any) {
      console.error('TCI validation error:', error);
      // Fallback to basic validation on error
      return {
        isValid: false,
        confidence: 0,
        inconsistencies: [{
          type: 'structural',
          description: 'TCI validation system error',
          severity: 'critical',
          affectedModels: outputs.map(o => o.model)
        }],
        recommendations: [{
          action: 'retry',
          reason: 'System validation error - retry required',
          confidence: 0
        }]
      };
    }
  }

  /**
   * Validate consistency across model outputs using embedding similarity
   */
  private async validateConsistency(outputs: TCIModelOutput[]): Promise<{
    semanticOverlap: number;
    factualAlignment: number;
    temporalCoherence: number;
  }> {
    if (outputs.length < 2) {
      return { semanticOverlap: 1.0, factualAlignment: 1.0, temporalCoherence: 1.0 };
    }

    // Generate embeddings for each output
    const embeddings = await Promise.all(
      outputs.map(async (output) => {
        return await this.vectorDb.generateEmbedding(output.output);
      })
    );

    // Calculate pairwise similarities
    const similarities: number[] = [];
    for (let i = 0; i < embeddings.length; i++) {
      for (let j = i + 1; j < embeddings.length; j++) {
        const similarity = this.calculateCosineSimilarity(embeddings[i], embeddings[j]);
        similarities.push(similarity);
      }
    }

    const avgSimilarity = similarities.reduce((a, b) => a + b, 0) / similarities.length;

    // Temporal coherence check (outputs should be consistent over time)
    const temporalCoherence = this.checkTemporalCoherence(outputs);

    return {
      semanticOverlap: avgSimilarity,
      factualAlignment: avgSimilarity, // Simplified - could be enhanced with fact-checking
      temporalCoherence,
    };
  }

  /**
   * Calculate confidence scores for each model output
   */
  private calculateConfidenceScores(outputs: TCIModelOutput[]): Map<string, number> {
    const scores = new Map<string, number>();

    for (const output of outputs) {
      let confidence = output.confidence;

      // Apply reliability weighting based on historical performance
      const reliability = this.modelReliabilityScores.get(output.model) || 1.0;
      confidence *= reliability;

      // Domain-specific adjustments
      if (output.metadata.domain) {
        confidence *= this.getDomainWeight(output.model, output.metadata.domain);
      }

      // Processing time penalty (faster = potentially less thorough)
      const timePenalty = Math.max(0, 1 - (output.processingTime / 10000)); // 10s baseline
      confidence *= (0.8 + 0.2 * timePenalty);

      scores.set(output.model, Math.max(0, Math.min(1, confidence)));
    }

    return scores;
  }

  /**
   * Detect and classify inconsistencies between model outputs
   */
  private detectInconsistencies(
    outputs: TCIModelOutput[],
    consistencyResult: any
  ): TCIValidationResult['inconsistencies'] {
    const inconsistencies: TCIValidationResult['inconsistencies'] = [];

    // Semantic inconsistency check
    if (consistencyResult.semanticOverlap < this.consistencyThreshold) {
      inconsistencies.push({
        type: 'semantic',
        description: `Model outputs show low semantic similarity (${Math.round(consistencyResult.semanticOverlap * 100)}%)`,
        severity: consistencyResult.semanticOverlap < 0.6 ? 'critical' : 'high',
        affectedModels: outputs.map(o => o.model)
      });
    }

    // Temporal inconsistency check
    if (consistencyResult.temporalCoherence < 0.8) {
      inconsistencies.push({
        type: 'temporal',
        description: 'Model outputs show temporal drift or inconsistency',
        severity: 'medium',
        affectedModels: outputs.map(o => o.model)
      });
    }

    // Confidence variance check
    const confidences = outputs.map(o => o.confidence);
    const maxConf = Math.max(...confidences);
    const minConf = Math.min(...confidences);
    const variance = maxConf - minConf;

    if (variance > 0.5) {
      const lowConfidenceModels = outputs
        .filter(o => o.confidence < 0.5)
        .map(o => o.model);

      if (lowConfidenceModels.length > 0) {
        inconsistencies.push({
          type: 'structural',
          description: `High confidence variance (${Math.round(variance * 100)}%) between models`,
          severity: variance > 0.8 ? 'critical' : 'medium',
          affectedModels: lowConfidenceModels
        });
      }
    }

    return inconsistencies;
  }

  /**
   * Generate actionable recommendations based on validation results
   */
  private generateRecommendations(
    outputs: TCIModelOutput[],
    inconsistencies: TCIValidationResult['inconsistencies'],
    confidenceScores: Map<string, number>
  ): TCIValidationResult['recommendations'] {
    const recommendations: TCIValidationResult['recommendations'] = [];

    // Critical inconsistencies require immediate action
    const criticalInconsistencies = inconsistencies.filter(i => i.severity === 'critical');

    if (criticalInconsistencies.length > 0) {
      // Recommend retrying with different models
      recommendations.push({
        action: 'retry',
        reason: 'Critical inconsistencies detected - retry required for accuracy',
        confidence: 0.9
      });

      // Identify most reliable models for retry
      const reliableModels = Array.from(confidenceScores.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([model]) => model);

      if (reliableModels.length > 0) {
        recommendations.push({
          action: 'reroute',
          model: reliableModels.join(', '),
          reason: 'Route to most reliable models for retry',
          confidence: 0.8
        });
      }
    }

    // Low confidence models should be quarantined
    const lowConfidenceModels = Array.from(confidenceScores.entries())
      .filter(([, score]) => score < 0.3)
      .map(([model]) => model);

    if (lowConfidenceModels.length > 0) {
      recommendations.push({
        action: 'quarantine',
        model: lowConfidenceModels.join(', '),
        reason: 'Models showing consistently low confidence',
        confidence: 0.7
      });
    }

    // If all models have high confidence but low agreement, recommend human review
    const highConfidenceModels = Array.from(confidenceScores.entries())
      .filter(([, score]) => score > 0.7);

    if (highConfidenceModels.length >= 2 && inconsistencies.length > 0) {
      recommendations.push({
        action: 'fallback',
        reason: 'High confidence but low agreement - may need manual review',
        confidence: 0.5
      });
    }

    return recommendations;
  }

  /**
   * Determine overall validity based on inconsistencies and confidence
   */
  private determineOverallValidity(
    inconsistencies: TCIValidationResult['inconsistencies'],
    confidenceScores: Map<string, number>
  ): boolean {
    const criticalInconsistencies = inconsistencies.filter(i => i.severity === 'critical');
    const avgConfidence = Array.from(confidenceScores.values())
      .reduce((a, b) => a + b, 0) / confidenceScores.size;

    // Valid if no critical inconsistencies and average confidence > 0.6
    return criticalInconsistencies.length === 0 && avgConfidence > 0.6;
  }

  /**
   * Calculate overall confidence score
   */
  private calculateOverallConfidence(confidenceScores: Map<string, number>): number {
    const scores = Array.from(confidenceScores.values());
    return scores.reduce((a, b) => a + b, 0) / scores.length;
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
   * Check temporal coherence of outputs
   */
  private checkTemporalCoherence(outputs: TCIModelOutput[]): number {
    if (outputs.length < 2) return 1.0;

    // Sort by timestamp
    const sorted = outputs.sort((a, b) =>
      a.metadata.timestamp.getTime() - b.metadata.timestamp.getTime()
    );

    // Check for logical progression and consistency over time
    let coherence = 1.0;
    for (let i = 1; i < sorted.length; i++) {
      const timeDiff = sorted[i].metadata.timestamp.getTime() - sorted[i-1].metadata.timestamp.getTime();
      const contextDiff = this.calculateContextSimilarity(
        sorted[i-1].metadata.contextHash,
        sorted[i].metadata.contextHash
      );

      // Penalize large context changes over short time periods
      if (timeDiff < 5000 && contextDiff < 0.8) { // 5 seconds
        coherence *= 0.9;
      }
    }

    return coherence;
  }

  /**
   * Calculate context similarity between two context hashes
   */
  private calculateContextSimilarity(hash1: string, hash2: string): number {
    // Simplified - in practice would compare actual context objects
    if (hash1 === hash2) return 1.0;
    return 0.8; // Placeholder
  }

  /**
   * Get domain-specific weight for a model
   */
  private getDomainWeight(model: string, domain: string): number {
    const domainWeights: Record<string, Record<string, number>> = {
      'gpt-5': { coding: 1.1, reasoning: 1.2, facts: 0.9, efficiency: 0.8 },
      'claude-4.5': { coding: 1.2, reasoning: 1.0, facts: 1.1, efficiency: 0.9 },
      'gemini-2.5': { coding: 0.9, reasoning: 1.1, facts: 1.2, efficiency: 1.0 },
      'deepseek': { coding: 1.0, reasoning: 0.8, facts: 0.9, efficiency: 1.3 },
    };

    return domainWeights[model]?.[domain] || 1.0;
  }

  /**
   * Initialize reliability scores for all models
   */
  private initializeReliabilityScores(): void {
    // Initialize with neutral scores, will be updated based on performance
    this.modelReliabilityScores.set('gpt-5', 1.0);
    this.modelReliabilityScores.set('claude-4.5', 1.0);
    this.modelReliabilityScores.set('gemini-2.5', 1.0);
    this.modelReliabilityScores.set('deepseek', 1.0);
  }

  /**
   * Update model reliability based on validation results
   */
  updateModelReliability(model: string, validationResult: TCIValidationResult): void {
    const currentScore = this.modelReliabilityScores.get(model) || 1.0;
    const performanceFactor = validationResult.isValid ? 1.05 : 0.95;
    const newScore = Math.max(0.1, Math.min(2.0, currentScore * performanceFactor));

    this.modelReliabilityScores.set(model, newScore);

    // Quarantine if reliability drops too low
    if (newScore < 0.5) {
      this.quarantineList.add(model);
    } else if (newScore > 0.8) {
      this.quarantineList.delete(model);
    }
  }

  /**
   * Check if a model is currently quarantined
   */
  isModelQuarantined(model: string): boolean {
    return this.quarantineList.has(model);
  }

  /**
   * Get current reliability scores for all models
   */
  getReliabilityScores(): Record<string, number> {
    return Object.fromEntries(this.modelReliabilityScores);
  }

  /**
   * Aggregate multiple model outputs into a single, validated result
   */
  async aggregateOutputs(
    outputs: TCIModelOutput[],
    taskContext: string,
    taskType: string
  ): Promise<TCIAggregationResult> {
    const startTime = Date.now();

    // First, validate all outputs
    const validationResult = await this.validateMultiModelOutputs(outputs, taskContext, taskType);

    if (!validationResult.isValid && validationResult.recommendations.length > 0) {
      // Handle retry logic based on recommendations
      const retryRecommendation = validationResult.recommendations.find(r => r.action === 'retry');
      if (retryRecommendation) {
        throw new Error(`TCI validation failed: ${retryRecommendation.reason}`);
      }
    }

    // Calculate weighted contributions
    const confidenceScores = this.calculateConfidenceScores(outputs);
    const totalWeight = Array.from(confidenceScores.values()).reduce((a, b) => a + b, 0);

    const modelContributions = outputs.map(output => {
      const weight = confidenceScores.get(output.model) || 0;
      const contribution = output.output;
      const confidence = output.confidence;

      return {
        model: output.model,
        weight,
        contribution,
        confidence
      };
    });

    // Generate final output using weighted synthesis
    const finalOutput = this.synthesizeOutput(modelContributions);

    return {
      finalOutput,
      consensus: validationResult.confidence,
      modelContributions,
      validationPassed: validationResult.isValid,
      executionTime: Date.now() - startTime,
      version: this.generateVersionHash(outputs, taskContext)
    };
  }

  /**
   * Synthesize final output from multiple model contributions
   */
  private synthesizeOutput(contributions: TCIAggregationResult['modelContributions']): string {
    if (contributions.length === 0) return '';
    if (contributions.length === 1) return contributions[0].contribution;

    // Sort by weight and take top contributions
    const topContributions = contributions
      .sort((a, b) => b.weight - a.weight)
      .slice(0, Math.min(3, contributions.length));

    // For now, return the highest-weighted contribution
    // In a more sophisticated implementation, this could merge outputs intelligently
    return topContributions[0].contribution;
  }

  /**
   * Store model outputs by request ID for partial consensus handling
   */
  private modelOutputsByRequest = new Map<string, TCIModelOutput[]>();

  /**
   * Store model outputs for a specific request
   */
  storeModelOutputs(requestId: string, outputs: TCIModelOutput[]): void {
    this.modelOutputsByRequest.set(requestId, outputs);
  }

  /**
   * Get available outputs for a request (excluding timed out models)
   */
  getAvailableOutputs(requestId: string): TCIModelOutput[] {
    return this.modelOutputsByRequest.get(requestId) || [];
  }

  /**
   * Handle failed consensus scenario
   */
  async handleFailedConsensus(requestId: string, reason: string): Promise<void> {
    console.error(`❌ Consensus failed for request ${requestId}: ${reason}`);

    // Clean up stored outputs
    this.modelOutputsByRequest.delete(requestId);

    // Could trigger fallback mechanisms here
    // For now, just log the failure
  }

  /**
   * Proceed with partial consensus
   */
  async proceedWithPartialConsensus(
    requestId: string,
    consensusResult: { consensusScore: number; isViable: boolean; missingModels: string[] }
  ): Promise<TCIAggregationResult> {
    const outputs = this.getAvailableOutputs(requestId);
    if (outputs.length === 0) {
      throw new Error(`No outputs available for request ${requestId}`);
    }

    console.log(`✅ Proceeding with partial consensus for request ${requestId} (score: ${consensusResult.consensusScore.toFixed(2)})`);

    // Create a modified aggregation result for partial consensus
    const partialResult: TCIAggregationResult = {
      finalOutput: this.synthesizePartialOutput(outputs, consensusResult.missingModels),
      consensus: consensusResult.consensusScore,
      modelContributions: outputs.map(output => ({
        model: output.model,
        weight: output.confidence,
        contribution: output.output,
        confidence: output.confidence
      })),
      validationPassed: consensusResult.isViable,
      executionTime: 0, // Would be calculated in real implementation
      version: `partial-${Date.now()}`
    };

    // Clean up stored outputs
    this.modelOutputsByRequest.delete(requestId);

    return partialResult;
  }

  /**
   * Synthesize output for partial consensus (simplified version)
   */
  private synthesizePartialOutput(outputs: TCIModelOutput[], missingModels: string[]): string {
    // Filter out any outputs from missing/timed-out models
    const availableOutputs = outputs.filter(output =>
      !missingModels.includes(output.model)
    );

    if (availableOutputs.length === 0) {
      return '';
    }

    // Simple synthesis: return the highest confidence output
    const bestOutput = availableOutputs.reduce((best, current) =>
      current.confidence > best.confidence ? current : best
    );

    return bestOutput.output;
  }

  /**
   * Clear stored outputs for a specific request
   */
  clearRequestOutputs(requestId: string): void {
    this.modelOutputsByRequest.delete(requestId);
  }

  /**
   * Generate version hash for output tracking
   */
  private generateVersionHash(outputs: TCIModelOutput[], context: string): string {
    const combined = outputs.map(o => o.metadata.contextHash).join('') + context;
    return Buffer.from(combined).toString('base64').slice(0, 16);
  }
}

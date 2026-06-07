/**
 * Production-Grade MLOps Service for TCI
 * Implements model evaluation, shadow mode, drift detection, and cost-aware routing
 */

import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';

/**
 * Model performance metrics
 */
export interface ModelMetrics {
  model_id: string;
  timestamp: string;
  total_requests: number;
  successful_requests: number;
  average_latency_ms: number;
  p95_latency_ms: number;
  average_tokens_used: number;
  total_cost_usd: number;
  accuracy_score?: number;
  hallucination_rate?: number;
  bias_score?: number;
  user_satisfaction_score?: number;
}

/**
 * Model evaluation result
 */
export interface ModelEvaluation {
  model_id: string;
  evaluation_id: string;
  timestamp: string;
  dataset_size: number;
  accuracy_score: number;
  precision_score: number;
  recall_score: number;
  f1_score: number;
  hallucination_rate: number;
  bias_score: number;
  cost_per_request: number;
  average_latency_ms: number;
  recommendations: string[];
  is_production_ready: boolean;
}

/**
 * Shadow mode comparison result
 */
export interface ShadowModeResult {
  primary_model_id: string;
  shadow_model_id: string;
  timestamp: string;
  total_comparisons: number;
  agreement_rate: number;
  primary_better_count: number;
  shadow_better_count: number;
  tie_count: number;
  average_latency_diff_ms: number;
  cost_comparison: {
    primary_cost: number;
    shadow_cost: number;
    cost_savings_percent?: number;
  };
  quality_comparison: {
    primary_quality_score: number;
    shadow_quality_score: number;
    improvement_percent?: number;
  };
  recommendation: 'keep_primary' | 'switch_to_shadow' | 'continue_monitoring';
}

/**
 * Model drift detection result
 */
export interface DriftDetectionResult {
  model_id: string;
  timestamp: string;
  drift_detected: boolean;
  drift_severity: 'none' | 'minor' | 'moderate' | 'severe' | 'critical';
  drift_metrics: {
    accuracy_change: number;
    latency_change: number;
    error_rate_change: number;
    output_distribution_change: number;
  };
  recommended_actions: string[];
  retrain_required: boolean;
}

/**
 * Cost-aware model routing decision
 */
export interface RoutingDecision {
  selected_model_id: string;
  reason: string;
  cost_estimate: number;
  expected_latency_ms: number;
  confidence_score: number;
  fallback_models: string[];
}

/**
 * Production-grade MLOps service
 */
export class TCIMLOpsService {
  private modelMetrics: Map<string, ModelMetrics[]> = new Map();
  private modelEvaluations: Map<string, ModelEvaluation[]> = new Map();
  private shadowModeResults: ShadowModeResult[] = [];
  private driftDetections: DriftDetectionResult[] = [];
  private costBudgets: Map<string, number> = new Map();

  constructor(
    private readonly modelRegistry: Map<string, BaseChatModel>,
    private readonly evaluationDataset: Array<{ input: string; expected_output: string }>,
    private readonly costTracker: any
  ) {}

  /**
   * Evaluate model performance on test dataset
   */
  async evaluateModel(
    modelId: string,
    model: BaseChatModel,
    options: {
      dataset?: Array<{ input: string; expected_output: string }>;
      includeHumanEvaluation?: boolean;
      sampleSize?: number;
    } = {}
  ): Promise<ModelEvaluation> {
    const evaluationId = `eval_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();

    const dataset = options.dataset || this.evaluationDataset;
    const sampleSize = options.sampleSize || Math.min(100, dataset.length);

    // Sample dataset for evaluation
    const sample = this.sampleDataset(dataset, sampleSize);

    let totalCorrect = 0;
    let totalHallucinations = 0;
    let totalBiasIssues = 0;
    let totalCost = 0;
    let totalLatency = 0;
    let totalTokens = 0;

    // Run evaluation
    for (const testCase of sample) {
      try {
        const evalStartTime = Date.now();
        const response = await model.invoke([
          new SystemMessage('You are an expert software engineer. Provide accurate, helpful responses.'),
          new HumanMessage(testCase.input)
        ]);
        const latency = Date.now() - evalStartTime;

        totalLatency += latency;
        totalTokens += response.usage_metadata?.total_tokens || 0;
        totalCost += this.estimateTokenCost(modelId, response.usage_metadata?.total_tokens || 0);

        // Evaluate response quality
        const quality = await this.evaluateResponseQuality(testCase.expected_output, response.content as string);
        if (quality.accurate) totalCorrect++;
        if (quality.hasHallucinations) totalHallucinations++;
        if (quality.hasBias) totalBiasIssues++;

      } catch (error) {
        console.error(`Evaluation failed for test case:`, error);
      }
    }

    // Calculate metrics
    const accuracyScore = totalCorrect / sample.length;
    const hallucinationRate = totalHallucinations / sample.length;
    const biasScore = 1 - (totalBiasIssues / sample.length); // Higher is better
    const averageLatency = totalLatency / sample.length;
    const averageTokens = totalTokens / sample.length;
    const costPerRequest = totalCost / sample.length;

    // Determine if model is production ready
    const isProductionReady = accuracyScore >= 0.85 && hallucinationRate <= 0.05 && biasScore >= 0.9;

    const evaluation: ModelEvaluation = {
      model_id: modelId,
      evaluation_id: evaluationId,
      timestamp: new Date().toISOString(),
      dataset_size: sample.length,
      accuracy_score: accuracyScore,
      precision_score: accuracyScore, // Simplified for now
      recall_score: accuracyScore,    // Simplified for now
      f1_score: accuracyScore,       // Simplified for now
      hallucination_rate: hallucinationRate,
      bias_score: biasScore,
      cost_per_request: costPerRequest,
      average_latency_ms: averageLatency,
      recommendations: this.generateRecommendations(accuracyScore, hallucinationRate, biasScore, averageLatency),
      is_production_ready: isProductionReady
    };

    // Store evaluation
    const evaluations = this.modelEvaluations.get(modelId) || [];
    evaluations.push(evaluation);
    this.modelEvaluations.set(modelId, evaluations);

    return evaluation;
  }

  /**
   * Run shadow mode evaluation comparing two models
   */
  async runShadowMode(
    primaryModelId: string,
    shadowModelId: string,
    primaryModel: BaseChatModel,
    shadowModel: BaseChatModel,
    inputRequests: string[],
    durationHours: number = 24
  ): Promise<ShadowModeResult> {
    const startTime = Date.now();
    const endTime = startTime + (durationHours * 60 * 60 * 1000);

    let primaryResponses: string[] = [];
    let shadowResponses: string[] = [];
    let agreements = 0;
    let primaryBetter = 0;
    let shadowBetter = 0;
    let primaryLatency = 0;
    let shadowLatency = 0;
    let primaryCost = 0;
    let shadowCost = 0;

    const totalRequests = inputRequests.length;
    let processedRequests = 0;

    // Process requests in shadow mode
    for (const input of inputRequests) {
      if (Date.now() > endTime) break;

      try {
        // Run both models concurrently
        const [primaryResult, shadowResult] = await Promise.allSettled([
          this.runModelWithMetrics(primaryModel, input, 'primary'),
          this.runModelWithMetrics(shadowModel, input, 'shadow')
        ]);

        if (primaryResult.status === 'fulfilled' && shadowResult.status === 'fulfilled') {
          primaryResponses.push(primaryResult.value.response);
          shadowResponses.push(shadowResult.value.response);
          primaryLatency += primaryResult.value.latency;
          shadowLatency += shadowResult.value.latency;
          primaryCost += primaryResult.value.cost;
          shadowCost += shadowResult.value.cost;

          // Compare responses
          const comparison = await this.compareResponses(
            primaryResult.value.response,
            shadowResult.value.response
          );

          if (comparison.agreement) agreements++;
          else if (comparison.primaryBetter) primaryBetter++;
          else if (comparison.shadowBetter) shadowBetter++;

          processedRequests++;
        }

        // Small delay to avoid overwhelming the APIs
        await new Promise(resolve => setTimeout(resolve, 100));
      } catch (error) {
        console.error(`Shadow mode comparison failed:`, error);
      }
    }

    // Calculate final metrics
    const agreementRate = processedRequests > 0 ? agreements / processedRequests : 0;
    const averageLatencyDiff = (shadowLatency - primaryLatency) / processedRequests;

    // Quality comparison using evaluation metrics
    const primaryQuality = await this.calculateResponseQuality(primaryResponses);
    const shadowQuality = await this.calculateResponseQuality(shadowResponses);

    // Determine recommendation
    let recommendation: ShadowModeResult['recommendation'] = 'continue_monitoring';
    if (agreementRate > 0.95 && shadowQuality > primaryQuality && shadowCost < primaryCost) {
      recommendation = 'switch_to_shadow';
    } else if (primaryQuality > shadowQuality || primaryCost < shadowCost) {
      recommendation = 'keep_primary';
    }

    const result: ShadowModeResult = {
      primary_model_id: primaryModelId,
      shadow_model_id: shadowModelId,
      timestamp: new Date().toISOString(),
      total_comparisons: processedRequests,
      agreement_rate: agreementRate,
      primary_better_count: primaryBetter,
      shadow_better_count: shadowBetter,
      tie_count: agreements,
      average_latency_diff_ms: averageLatencyDiff,
      cost_comparison: {
        primary_cost: primaryCost,
        shadow_cost: shadowCost,
        cost_savings_percent: primaryCost > 0 ? ((primaryCost - shadowCost) / primaryCost) * 100 : 0
      },
      quality_comparison: {
        primary_quality_score: primaryQuality,
        shadow_quality_score: shadowQuality,
        improvement_percent: primaryQuality > 0 ? ((shadowQuality - primaryQuality) / primaryQuality) * 100 : 0
      },
      recommendation
    };

    this.shadowModeResults.push(result);
    return result;
  }

  /**
   * Detect model drift by comparing current performance to baseline
   */
  async detectModelDrift(modelId: string, currentModel: BaseChatModel): Promise<DriftDetectionResult> {
    const evaluations = this.modelEvaluations.get(modelId) || [];
    if (evaluations.length < 2) {
      return {
        model_id: modelId,
        timestamp: new Date().toISOString(),
        drift_detected: false,
        drift_severity: 'none',
        drift_metrics: {
          accuracy_change: 0,
          latency_change: 0,
          error_rate_change: 0,
          output_distribution_change: 0
        },
        recommended_actions: [],
        retrain_required: false
      };
    }

    // Get baseline (most recent evaluation) and current evaluation
    const sortedEvaluations = evaluations.sort((a, b) =>
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );

    const baseline = sortedEvaluations[1]; // Second most recent
    const current = sortedEvaluations[0];   // Most recent

    // Calculate drift metrics
    const accuracyChange = current.accuracy_score - baseline.accuracy_score;
    const latencyChange = current.average_latency_ms - baseline.average_latency_ms;
    const errorRateChange = (1 - current.accuracy_score) - (1 - baseline.accuracy_score);

    // Simplified output distribution change (in real implementation, would use more sophisticated metrics)
    const outputDistributionChange = Math.abs(current.hallucination_rate - baseline.hallucination_rate);

    // Determine if drift is significant
    const driftThresholds = {
      accuracy: -0.05,    // 5% drop
      latency: 1000,      // 1 second increase
      error_rate: 0.05,   // 5% increase
      distribution: 0.1   // 10% change
    };

    const driftDetected =
      accuracyChange < driftThresholds.accuracy ||
      latencyChange > driftThresholds.latency ||
      errorRateChange > driftThresholds.error_rate ||
      outputDistributionChange > driftThresholds.distribution;

    // Calculate severity
    let severity: DriftDetectionResult['drift_severity'] = 'none';
    if (driftDetected) {
      const severityScore =
        Math.abs(accuracyChange) * 10 +
        (latencyChange > 0 ? latencyChange / 100 : 0) +
        Math.abs(errorRateChange) * 10 +
        outputDistributionChange * 5;

      if (severityScore > 20) severity = 'critical';
      else if (severityScore > 15) severity = 'severe';
      else if (severityScore > 10) severity = 'moderate';
      else if (severityScore > 5) severity = 'minor';
    }

    // Generate recommendations
    const recommendedActions: string[] = [];
    if (driftDetected) {
      if (accuracyChange < -0.1) recommendedActions.push('Immediate model retraining required');
      if (latencyChange > 2000) recommendedActions.push('Performance optimization needed');
      if (errorRateChange > 0.1) recommendedActions.push('Model architecture review required');
      if (outputDistributionChange > 0.15) recommendedActions.push('Bias and fairness audit needed');
    }

    return {
      model_id: modelId,
      timestamp: new Date().toISOString(),
      drift_detected: driftDetected,
      drift_severity: severity,
      drift_metrics: {
        accuracy_change: accuracyChange,
        latency_change: latencyChange,
        error_rate_change: errorRateChange,
        output_distribution_change: outputDistributionChange
      },
      recommended_actions: recommendedActions,
      retrain_required: severity === 'critical' || severity === 'severe'
    };
  }

  /**
   * Make cost-aware model routing decision
   */
  async routeRequest(
    requestType: 'code_generation' | 'debug' | 'review' | 'analysis',
    complexity: 'low' | 'medium' | 'high',
    userTier: 'free' | 'pro' | 'enterprise',
    availableBudget?: number
  ): Promise<RoutingDecision> {
    const models = Array.from(this.modelRegistry.keys());
    const candidates: Array<{
      model_id: string;
      estimated_cost: number;
      expected_latency: number;
      quality_score: number;
      confidence: number;
    }> = [];

    // Evaluate each model for this request type
    for (const modelId of models) {
      const metrics = this.getLatestMetrics(modelId);
      if (!metrics) continue;

      const costEstimate = this.estimateRequestCost(modelId, requestType, complexity);
      const latencyEstimate = metrics.average_latency_ms;
      const qualityScore = this.calculateModelQualityScore(modelId, requestType);

      // Check budget constraints
      if (availableBudget && costEstimate > availableBudget) {
        continue;
      }

      candidates.push({
        model_id: modelId,
        estimated_cost: costEstimate,
        expected_latency: latencyEstimate,
        quality_score: qualityScore,
        confidence: this.calculateConfidenceScore(modelId, requestType)
      });
    }

    // Sort by cost-effectiveness (quality per dollar)
    candidates.sort((a, b) => {
      const aEfficiency = a.quality_score / a.estimated_cost;
      const bEfficiency = b.quality_score / b.estimated_cost;
      return bEfficiency - aEfficiency;
    });

    if (candidates.length === 0) {
      throw new Error('No suitable models available for routing');
    }

    const selected = candidates[0];
    const fallbackModels = candidates.slice(1, 4).map(c => c.model_id);

    return {
      selected_model_id: selected.model_id,
      reason: `Selected based on cost-effectiveness (${selected.quality_score.toFixed(2)} quality / $${selected.estimated_cost.toFixed(4)})`,
      cost_estimate: selected.estimated_cost,
      expected_latency_ms: selected.expected_latency,
      confidence_score: selected.confidence,
      fallback_models: fallbackModels
    };
  }

  /**
   * Get comprehensive model performance report
   */
  getModelPerformanceReport(modelId: string): {
    metrics: ModelMetrics[];
    evaluations: ModelEvaluation[];
    drift_analysis: DriftDetectionResult[];
    shadow_mode_results: ShadowModeResult[];
    recommendations: string[];
  } {
    return {
      metrics: this.modelMetrics.get(modelId) || [],
      evaluations: this.modelEvaluations.get(modelId) || [],
      drift_analysis: this.driftDetections.filter(d => d.model_id === modelId),
      shadow_mode_results: this.shadowModeResults.filter(r =>
        r.primary_model_id === modelId || r.shadow_model_id === modelId
      ),
      recommendations: this.generateModelRecommendations(modelId)
    };
  }

  /**
   * Set budget for a user/workspace
   */
  setBudget(userId: string, monthlyBudget: number): void {
    this.costBudgets.set(userId, monthlyBudget);
  }

  /**
   * Get current budget usage
   */
  getBudgetUsage(userId: string): { used: number; remaining: number; percentage: number } {
    const budget = this.costBudgets.get(userId) || 0;
    const used = this.costTracker.getUsageForUser(userId) || 0;

    return {
      used,
      remaining: Math.max(0, budget - used),
      percentage: budget > 0 ? (used / budget) * 100 : 0
    };
  }

  // Private helper methods

  private sampleDataset(dataset: Array<{ input: string; expected_output: string }>, size: number) {
    const shuffled = [...dataset].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, size);
  }

  private async evaluateResponseQuality(expected: string, actual: string): Promise<{
    accurate: boolean;
    hasHallucinations: boolean;
    hasBias: boolean;
  }> {
    // Simplified evaluation - in production would use more sophisticated ML models
    const expectedLower = expected.toLowerCase();
    const actualLower = actual.toLowerCase();

    // Check for hallucinations (mentions of non-existent concepts)
    const hallucinationKeywords = ['nonexistent', 'imaginary', 'fake api', 'unreal'];
    const hasHallucinations = hallucinationKeywords.some(keyword =>
      actualLower.includes(keyword) && !expectedLower.includes(keyword)
    );

    // Check for bias (simplified)
    const biasKeywords = ['stupid', 'idiot', 'obviously', 'everyone knows'];
    const hasBias = biasKeywords.some(keyword => actualLower.includes(keyword));

    // Check accuracy (simplified overlap)
    const accuracy = this.calculateTextSimilarity(expected, actual);

    return {
      accurate: accuracy > 0.7,
      hasHallucinations,
      hasBias
    };
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    // Simple Jaccard similarity for demonstration
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));

    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);

    return intersection.size / union.size;
  }

  private async runModelWithMetrics(model: BaseChatModel, input: string, type: string): Promise<{
    response: string;
    latency: number;
    cost: number;
  }> {
    const startTime = Date.now();
    const response = await model.invoke([
      new SystemMessage('You are a helpful assistant.'),
      new HumanMessage(input)
    ]);
    const latency = Date.now() - startTime;
    const cost = this.estimateTokenCost(type, response.usage_metadata?.total_tokens || 0);

    return {
      response: response.content as string,
      latency,
      cost
    };
  }

  private async compareResponses(response1: string, response2: string): Promise<{
    agreement: boolean;
    primaryBetter: boolean;
    shadowBetter: boolean;
  }> {
    // Simplified comparison - in production would use semantic similarity
    const similarity = this.calculateTextSimilarity(response1, response2);

    return {
      agreement: similarity > 0.8,
      primaryBetter: similarity < 0.8 && response1.length > response2.length, // Simplified heuristic
      shadowBetter: similarity < 0.8 && response2.length > response1.length
    };
  }

  private async calculateResponseQuality(responses: string[]): Promise<number> {
    // Simplified quality score based on response characteristics
    let totalScore = 0;

    for (const response of responses) {
      let score = 0;

      // Length appropriateness (not too short, not too long)
      if (response.length > 100 && response.length < 2000) score += 0.3;
      else if (response.length > 50 && response.length < 3000) score += 0.2;

      // Code-like content (for code generation tasks)
      if (response.includes('function') || response.includes('class') || response.includes('import')) {
        score += 0.4;
      }

      // Clarity indicators
      if (response.includes('step') || response.includes('example') || response.includes('note')) {
        score += 0.3;
      }

      totalScore += score;
    }

    return totalScore / responses.length;
  }

  private estimateTokenCost(modelId: string, tokens: number): number {
    // Simplified cost estimation - in production would use actual pricing
    const costPerToken: Record<string, number> = {
      'gpt-5': 0.00001,
      'claude-4.5': 0.000008,
      'gemini-2.5': 0.000005,
      'starcoder': 0.000002
    };

    return (costPerToken[modelId] || 0.00001) * tokens;
  }

  private estimateRequestCost(modelId: string, requestType: string, complexity: string): number {
    // Base tokens by request type and complexity
    const baseTokens: Record<string, Record<string, number>> = {
      'code_generation': { 'low': 500, 'medium': 1000, 'high': 2000 },
      'debug': { 'low': 300, 'medium': 600, 'high': 1200 },
      'review': { 'low': 400, 'medium': 800, 'high': 1600 },
      'analysis': { 'low': 200, 'medium': 400, 'high': 800 }
    };

    const tokens = baseTokens[requestType]?.[complexity] || 500;
    return this.estimateTokenCost(modelId, tokens);
  }

  private calculateModelQualityScore(modelId: string, requestType: string): number {
    const evaluations = this.modelEvaluations.get(modelId) || [];
    if (evaluations.length === 0) return 0.5; // Default score

    const latest = evaluations[evaluations.length - 1];
    return (latest.accuracy_score + latest.bias_score + (1 - latest.hallucination_rate)) / 3;
  }

  private calculateConfidenceScore(modelId: string, requestType: string): number {
    const metrics = this.getLatestMetrics(modelId);
    if (!metrics) return 0.5;

    // Base confidence on success rate and consistency
    const successRate = metrics.successful_requests / metrics.total_requests;
    const consistencyScore = Math.min(1, 1 - (metrics.p95_latency_ms - metrics.average_latency_ms) / metrics.average_latency_ms);

    return (successRate + consistencyScore) / 2;
  }

  private getLatestMetrics(modelId: string): ModelMetrics | undefined {
    const metrics = this.modelMetrics.get(modelId) || [];
    return metrics[metrics.length - 1];
  }

  private generateRecommendations(
    accuracy: number,
    hallucinationRate: number,
    biasScore: number,
    latency: number
  ): string[] {
    const recommendations: string[] = [];

    if (accuracy < 0.8) {
      recommendations.push('Model needs accuracy improvement - consider fine-tuning or prompt engineering');
    }

    if (hallucinationRate > 0.05) {
      recommendations.push('High hallucination rate detected - implement fact-checking mechanisms');
    }

    if (biasScore < 0.9) {
      recommendations.push('Bias detected - review training data diversity');
    }

    if (latency > 5000) {
      recommendations.push('High latency - consider model optimization or caching strategies');
    }

    if (recommendations.length === 0) {
      recommendations.push('Model performance is within acceptable parameters');
    }

    return recommendations;
  }

  private generateModelRecommendations(modelId: string): string[] {
    const evaluations = this.modelEvaluations.get(modelId) || [];
    const driftResults = this.driftDetections.filter(d => d.model_id === modelId);
    const shadowResults = this.shadowModeResults.filter(r =>
      r.primary_model_id === modelId || r.shadow_model_id === modelId
    );

    const recommendations: string[] = [];

    // Check latest evaluation
    if (evaluations.length > 0) {
      const latest = evaluations[evaluations.length - 1];
      if (!latest.is_production_ready) {
        recommendations.push('Model is not production ready - address accuracy and hallucination issues');
      }
    }

    // Check for drift
    const latestDrift = driftResults[driftResults.length - 1];
    if (latestDrift?.drift_detected) {
      recommendations.push(`Model drift detected (${latestDrift.drift_severity}) - ${latestDrift.recommended_actions.join(', ')}`);
    }

    // Check shadow mode results
    const latestShadow = shadowResults[shadowResults.length - 1];
    if (latestShadow?.recommendation === 'switch_to_shadow') {
      recommendations.push(`Consider switching to ${latestShadow.shadow_model_id} based on shadow mode evaluation`);
    }

    return recommendations;
  }
}

export default TCIMLOpsService;

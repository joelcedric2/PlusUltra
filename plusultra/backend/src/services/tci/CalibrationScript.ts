import { MultiProviderEmbeddings, EmbeddingProvider, EmbeddingResult } from './MultiProviderEmbeddings';

/**
 * Calibration Script - Scientifically validates embedding thresholds using ROC/PR curves
 * Generates statistically valid thresholds for production deployment
 */
export interface CalibrationDataset {
  canonicalOutput: string;
  candidateOutputs: Array<{
    output: string;
    model: string;
    expectedQuality: 'correct' | 'minor_issue' | 'fail';
    metadata?: any;
  }>;
  taskType: string;
  domain: string;
}

export interface CalibrationResult {
  thresholds: {
    lowRisk: number;      // Accept automatically
    mediumRisk: number;   // Retry/staging
    highRisk: number;     // Quarantine/human review
  };
  performance: {
    auc: number;          // Area Under Curve
    precision: number[];
    recall: number[];
    f1Scores: number[];
  };
  recommendations: string[];
  validationMetrics: {
    truePositiveRate: number;
    falsePositiveRate: number;
    accuracy: number;
  };
}

export class CalibrationScript {
  private embeddings: MultiProviderEmbeddings;
  private dataset: CalibrationDataset[];

  constructor(embeddings: MultiProviderEmbeddings, dataset: CalibrationDataset[]) {
    this.embeddings = embeddings;
    this.dataset = dataset;
  }

  /**
   * Run complete calibration experiment
   */
  async runCalibration(): Promise<CalibrationResult> {
    console.log(`🔬 Starting calibration with ${this.dataset.length} samples`);

    // 1. Generate embeddings for all samples
    const embeddingResults = await this.generateAllEmbeddings();

    // 2. Calculate similarity scores for each sample
    const similarityScores = await this.calculateSimilarityScores(embeddingResults);

    // 3. Generate ROC/PR curves
    const { rocCurve, prCurve } = this.generateCurves(similarityScores);

    // 4. Calculate optimal thresholds
    const thresholds = this.calculateOptimalThresholds(rocCurve, prCurve);

    // 5. Calculate performance metrics
    const performance = this.calculatePerformanceMetrics(rocCurve, prCurve);

    // 6. Generate validation metrics
    const validationMetrics = this.calculateValidationMetrics(similarityScores, thresholds);

    // 7. Generate recommendations
    const recommendations = this.generateRecommendations(thresholds, performance, validationMetrics);

    const result: CalibrationResult = {
      thresholds,
      performance,
      recommendations,
      validationMetrics
    };

    console.log('✅ Calibration complete:', result);
    return result;
  }

  /**
   * Generate embeddings for all dataset samples
   */
  private async generateAllEmbeddings(): Promise<Array<{
    sample: CalibrationDataset;
    embeddings: Record<EmbeddingProvider, EmbeddingResult>;
  }>> {
    const results = [];

    for (const sample of this.dataset) {
      try {
        const embeddings = await this.embeddings.getMultiProviderEmbeddings(
          sample.canonicalOutput,
          ['openai', 'anthropic', 'gemini'] as EmbeddingProvider[]
        );

        results.push({
          sample,
          embeddings
        });
      } catch (error) {
        console.warn(`Failed to generate embeddings for sample:`, error);
      }
    }

    return results;
  }

  /**
   * Calculate similarity scores between canonical and candidate outputs
   */
  private async calculateSimilarityScores(
    embeddingResults: Array<{
      sample: CalibrationDataset;
      embeddings: Record<EmbeddingProvider, EmbeddingResult>;
    }>
  ): Promise<Array<{
    sample: CalibrationDataset;
    similarities: Array<{
      candidate: string;
      similarity: number;
      model: string;
      expectedQuality: string;
    }>;
  }>> {
    const results = [];

    for (const { sample, embeddings } of embeddingResults) {
      const similarities = [];

      for (const candidate of sample.candidateOutputs) {
        // Get embedding for candidate output
        const candidateEmbedding = await this.embeddings.getEmbedding(
          candidate.output,
          'openai' as EmbeddingProvider // Use OpenAI as reference
        );

        // Calculate average similarity across providers
        let totalSimilarity = 0;
        let providerCount = 0;

        for (const [provider, canonicalEmbedding] of Object.entries(embeddings)) {
          const similarity = this.calculateCosineSimilarity(canonicalEmbedding.embedding, candidateEmbedding.embedding);
          totalSimilarity += similarity;
          providerCount++;
        }

        const avgSimilarity = totalSimilarity / providerCount;

        similarities.push({
          candidate: candidate.output,
          similarity: avgSimilarity,
          model: candidate.model,
          expectedQuality: candidate.expectedQuality
        });
      }

      results.push({
        sample,
        similarities
      });
    }

    return results;
  }

  /**
   * Generate ROC and PR curves from similarity scores
   */
  private generateCurves(similarityResults: Array<{
    sample: CalibrationDataset;
    similarities: Array<{
      candidate: string;
      similarity: number;
      model: string;
      expectedQuality: string;
    }>;
  }>): {
    rocCurve: Array<{ threshold: number; tpr: number; fpr: number }>;
    prCurve: Array<{ threshold: number; precision: number; recall: number }>;
  } {
    // Flatten all similarities for analysis
    const allSimilarities: Array<{
      similarity: number;
      expectedQuality: string;
    }> = [];

    for (const { similarities } of similarityResults) {
      for (const sim of similarities) {
        allSimilarities.push({
          similarity: sim.similarity,
          expectedQuality: sim.expectedQuality
        });
      }
    }

    // Generate curves by testing different thresholds
    const thresholds = this.generateThresholds(allSimilarities);
    const rocCurve: Array<{ threshold: number; tpr: number; fpr: number }> = [];
    const prCurve: Array<{ threshold: number; precision: number; recall: number }> = [];

    for (const threshold of thresholds) {
      const metrics = this.calculateMetricsAtThreshold(allSimilarities, threshold);

      rocCurve.push({
        threshold,
        tpr: metrics.truePositiveRate,
        fpr: metrics.falsePositiveRate
      });

      prCurve.push({
        threshold,
        precision: metrics.precision,
        recall: metrics.recall
      });
    }

    return { rocCurve, prCurve };
  }

  /**
   * Generate threshold values for testing
   */
  private generateThresholds(similarities: Array<{ similarity: number; expectedQuality: string }>): number[] {
    const sortedSimilarities = similarities
      .map(s => s.similarity)
      .sort((a, b) => a - b);

    const thresholds = [];
    const step = 0.01; // 1% steps

    for (let threshold = 0.5; threshold <= 1.0; threshold += step) {
      thresholds.push(threshold);
    }

    // Add key points around the data distribution
    const percentiles = [0.1, 0.25, 0.5, 0.75, 0.9];
    for (const percentile of percentiles) {
      const index = Math.floor(sortedSimilarities.length * percentile);
      if (index < sortedSimilarities.length) {
        thresholds.push(sortedSimilarities[index]);
      }
    }

    return [...new Set(thresholds)].sort((a, b) => a - b);
  }

  /**
   * Calculate metrics at a specific threshold
   */
  private calculateMetricsAtThreshold(
    similarities: Array<{ similarity: number; expectedQuality: string }>,
    threshold: number
  ): {
    truePositiveRate: number;
    falsePositiveRate: number;
    precision: number;
    recall: number;
  } {
    let truePositives = 0;
    let falsePositives = 0;
    let falseNegatives = 0;
    let trueNegatives = 0;

    for (const { similarity, expectedQuality } of similarities) {
      const predictedPositive = similarity >= threshold;
      const actualPositive = expectedQuality === 'correct' || expectedQuality === 'minor_issue';

      if (predictedPositive && actualPositive) {
        truePositives++;
      } else if (predictedPositive && !actualPositive) {
        falsePositives++;
      } else if (!predictedPositive && actualPositive) {
        falseNegatives++;
      } else {
        trueNegatives++;
      }
    }

    const totalPositives = truePositives + falseNegatives;
    const totalNegatives = falsePositives + trueNegatives;

    return {
      truePositiveRate: totalPositives > 0 ? truePositives / totalPositives : 0,
      falsePositiveRate: totalNegatives > 0 ? falsePositives / totalNegatives : 0,
      precision: (truePositives + falsePositives) > 0 ? truePositives / (truePositives + falsePositives) : 0,
      recall: totalPositives > 0 ? truePositives / totalPositives : 0
    };
  }

  /**
   * Calculate optimal thresholds based on ROC/PR curves
   */
  private calculateOptimalThresholds(
    rocCurve: Array<{ threshold: number; tpr: number; fpr: number }>,
    prCurve: Array<{ threshold: number; precision: number; recall: number }>
  ): CalibrationResult['thresholds'] {
    // Find threshold that maximizes Youden's J statistic (TPR - FPR)
    let bestYoudenThreshold = 0.8;
    let bestYoudenScore = 0;

    for (const point of rocCurve) {
      const youdenScore = point.tpr - point.fpr;
      if (youdenScore > bestYoudenScore) {
        bestYoudenScore = youdenScore;
        bestYoudenThreshold = point.threshold;
      }
    }

    // Find threshold that maximizes F1 score
    let bestF1Threshold = 0.8;
    let bestF1Score = 0;

    for (const point of prCurve) {
      if (point.precision + point.recall > 0) {
        const f1Score = (2 * point.precision * point.recall) / (point.precision + point.recall);
        if (f1Score > bestF1Score) {
          bestF1Score = f1Score;
          bestF1Threshold = point.threshold;
        }
      }
    }

    // Define risk levels based on thresholds
    return {
      lowRisk: bestYoudenThreshold * 0.9,      // Slightly lower for auto-accept
      mediumRisk: bestYoudenThreshold,         // Standard threshold for retry
      highRisk: bestYoudenThreshold * 1.1      // Slightly higher for quarantine
    };
  }

  /**
   * Calculate performance metrics (AUC, etc.)
   */
  private calculatePerformanceMetrics(
    rocCurve: Array<{ threshold: number; tpr: number; fpr: number }>,
    prCurve: Array<{ threshold: number; precision: number; recall: number }>
  ): CalibrationResult['performance'] {
    // Calculate AUC for ROC curve using trapezoidal rule
    const auc = this.calculateAUC(rocCurve.map(p => ({ x: p.fpr, y: p.tpr })));

    // Find best F1 score
    let bestF1 = 0;
    const precision = [];
    const recall = [];
    const f1Scores = [];

    for (const point of prCurve) {
      precision.push(point.precision);
      recall.push(point.recall);

      if (point.precision + point.recall > 0) {
        const f1 = (2 * point.precision * point.recall) / (point.precision + point.recall);
        f1Scores.push(f1);
        bestF1 = Math.max(bestF1, f1);
      }
    }

    return {
      auc,
      precision,
      recall,
      f1Scores
    };
  }

  private calculateValidationMetrics(
    similarityResults: Array<{
      sample: CalibrationDataset;
      similarities: Array<{
        candidate: string;
        similarity: number;
        model: string;
        expectedQuality: string;
      }>;
    }>,
    thresholds: CalibrationResult['thresholds']
  ): CalibrationResult['validationMetrics'] {
    // Phase 1: Calculate accuracy (first pass)
    let totalCorrect = 0;
    let totalIncorrect = 0;

    for (const { similarities } of similarityResults) {
      for (const sim of similarities) {
        const predictedQuality = this.classifyQuality(sim.similarity, thresholds);
        const actualQuality = sim.expectedQuality;

        if (predictedQuality === actualQuality) {
          totalCorrect++;
        } else {
          totalIncorrect++;
        }
      }
    }

    const total = totalCorrect + totalIncorrect;
    const accuracy = total > 0 ? totalCorrect / total : 0;

    // Phase 2: Calculate TPR and FPR (second pass)
    const allSimilarities: Array<{
      similarity: number;
      expectedQuality: string;
      predictedQuality: string;
    }> = [];

    for (const { similarities } of similarityResults) {
      for (const sim of similarities) {
        const predictedQuality = this.classifyQuality(sim.similarity, thresholds);
        allSimilarities.push({
          similarity: sim.similarity,
          expectedQuality: sim.expectedQuality,
          predictedQuality
        });
      }
    }

    const positives = allSimilarities.filter(s => s.expectedQuality !== 'fail').length;
    const negatives = allSimilarities.filter(s => s.expectedQuality === 'fail').length;

    const truePositives = allSimilarities.filter(s =>
      s.expectedQuality !== 'fail' && s.predictedQuality !== 'fail'
    ).length;

    const falsePositives = allSimilarities.filter(s =>
      s.expectedQuality === 'fail' && s.predictedQuality !== 'fail'
    ).length;

    return {
      truePositiveRate: positives > 0 ? truePositives / positives : 0,
      falsePositiveRate: negatives > 0 ? falsePositives / negatives : 0,
      accuracy
    };
  }

  /**
   * Classify quality based on similarity and thresholds
   */
  private classifyQuality(similarity: number, thresholds: CalibrationResult['thresholds']): string {
    if (similarity >= thresholds.lowRisk) return 'correct';
    if (similarity >= thresholds.mediumRisk) return 'minor_issue';
    return 'fail';
  }

  /**
   * Generate recommendations based on calibration results
   */
  private generateRecommendations(
    thresholds: CalibrationResult['thresholds'],
    performance: CalibrationResult['performance'],
    validationMetrics: CalibrationResult['validationMetrics']
  ): string[] {
    const recommendations: string[] = [];

    if (performance.auc > 0.9) {
      recommendations.push('✅ Excellent model performance - thresholds are well-calibrated');
    } else if (performance.auc > 0.8) {
      recommendations.push('⚠️ Good performance - consider collecting more diverse samples');
    } else {
      recommendations.push('🚨 Poor performance - may need better embedding model or more data');
    }

    if (validationMetrics.accuracy < 0.8) {
      recommendations.push('🔧 Low accuracy - consider adjusting thresholds or improving dataset');
    }

    if (validationMetrics.falsePositiveRate > 0.1) {
      recommendations.push('📈 High false positive rate - consider raising low-risk threshold');
    }

    if (validationMetrics.truePositiveRate < 0.8) {
      recommendations.push('📉 Low true positive rate - consider lowering high-risk threshold');
    }

    recommendations.push(`🎯 Recommended thresholds: Low=${thresholds.lowRisk.toFixed(3)}, Medium=${thresholds.mediumRisk.toFixed(3)}, High=${thresholds.highRisk.toFixed(3)}`);

    return recommendations;
  }

  /**
   * Calculate AUC using trapezoidal rule
   */
  private calculateAUC(points: Array<{ x: number; y: number }>): number {
    if (points.length < 2) return 0;

    let auc = 0;
    for (let i = 1; i < points.length; i++) {
      const x1 = points[i-1].x;
      const y1 = points[i-1].y;
      const x2 = points[i].x;
      const y2 = points[i].y;

      // Trapezoidal rule
      auc += (x2 - x1) * (y1 + y2) / 2;
    }

    return auc;
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
   * Export calibration results to CSV for analysis
   */
  exportToCSV(result: CalibrationResult): string {
    const lines = [
      'Threshold,TPR,FPR,Precision,Recall,F1',
      ...result.performance.f1Scores.map((f1, i) => {
        const threshold = 0.5 + (i * 0.01); // Approximate threshold
        const rocPoint = result.performance.f1Scores.findIndex((_, idx) => idx === i);
        return `${threshold.toFixed(3)},${result.performance.recall[i]?.toFixed(3) || 0},${result.performance.precision[i]?.toFixed(3) || 0},${result.performance.precision[i]?.toFixed(3) || 0},${result.performance.recall[i]?.toFixed(3) || 0},${f1.toFixed(3)}`;
      })
    ];

    return lines.join('\n');
  }
}

import { Injectable } from '@nestjs/common';

export interface PredictionRequest {
  changeId: string;
  context?: {
    filePaths?: string[];
    branch?: string;
    environment?: string;
    teamSize?: number;
    projectAge?: number;
  };
  predictionTypes?: Array<'regression_risk' | 'performance' | 'review_time' | 'deployment_risk' | 'security_risk'>;
}

export interface PredictionResult {
  changeId: string;
  predictions: {
    regressionRisk?: {
      probability: number;
      confidence: number;
      explanation: string;
      affectedTests: string[];
      mitigation: string[];
    };
    performance?: {
      latencyDelta: number;
      memoryDelta: number;
      throughputDelta: number;
      confidence: number;
      explanation: string;
      benchmarks: Array<{
        metric: string;
        before: number;
        after: number;
        impact: 'positive' | 'negative' | 'neutral';
      }>;
    };
    reviewTime?: {
      estimatedMinutes: number;
      confidence: number;
      explanation: string;
      factors: Array<{
        factor: string;
        impact: 'increase' | 'decrease';
        weight: number;
      }>;
    };
    deploymentRisk?: {
      rollbackProbability: number;
      incidentProbability: number;
      confidence: number;
      explanation: string;
      riskFactors: string[];
      mitigation: string[];
    };
    securityRisk?: {
      score: number; // 0-100
      vulnerabilities: Array<{
        type: string;
        severity: 'low' | 'medium' | 'high' | 'critical';
        cwe?: string;
        description: string;
      }>;
      confidence: number;
      explanation: string;
    };
  };
  overall: {
    riskLevel: 'low' | 'medium' | 'high' | 'critical';
    recommendation: string;
    requiresApproval: boolean;
    estimatedImpact: string;
  };
}

export class TCIPredictionService {
  constructor(
    private readonly mlModelService: any = null, // Your ML model service
    private readonly temporalDB: any = null, // TemporalGraphDB
    private readonly featureExtractor: any = null // Feature extraction service
  ) {}

  /**
   * Generate predictions for a proposed change
   */
  async predict(request: PredictionRequest): Promise<PredictionResult> {
    // Get change details
    const change = await this.temporalDB.getChange(request.changeId);
    if (!change) {
      throw new Error(`Change ${request.changeId} not found`);
    }

    // Extract features for ML models
    const features = await this.featureExtractor.extractFeatures(change, request.context);

    const result: PredictionResult = {
      changeId: request.changeId,
      predictions: {},
      overall: {
        riskLevel: 'low',
        recommendation: 'Proceed with normal review process',
        requiresApproval: false,
        estimatedImpact: 'Minimal impact expected'
      }
    };

    // Generate predictions based on requested types
    const predictionTypes = request.predictionTypes || [
      'regression_risk', 'performance', 'review_time', 'deployment_risk', 'security_risk'
    ];

    for (const type of predictionTypes) {
      switch (type) {
        case 'regression_risk':
          result.predictions.regressionRisk = await this.predictRegressionRisk(features, change);
          break;
        case 'performance':
          result.predictions.performance = await this.predictPerformance(features, change);
          break;
        case 'review_time':
          result.predictions.reviewTime = await this.predictReviewTime(features, change);
          break;
        case 'deployment_risk':
          result.predictions.deploymentRisk = await this.predictDeploymentRisk(features, change);
          break;
        case 'security_risk':
          result.predictions.securityRisk = await this.predictSecurityRisk(features, change);
          break;
      }
    }

    // Calculate overall assessment
    result.overall = this.calculateOverallRisk(result.predictions);

    return result;
  }

  /**
   * Predict regression risk (test failures)
   */
  private async predictRegressionRisk(features: any, change: any): Promise<PredictionResult['predictions']['regressionRisk']> {
    // Use ML model to predict regression probability
    const modelInput = {
      change_complexity: features.complexity,
      file_centrality: features.centrality,
      test_coverage: features.testCoverage,
      author_experience: features.authorExperience,
      change_size: features.changeSize,
      dependency_count: features.dependencyCount
    };

    const prediction = await this.mlModelService.predict('regression_risk', modelInput);

    // Find likely affected tests
    const affectedTests = await this.identifyAffectedTests(change, features);

    return {
      probability: prediction.probability,
      confidence: prediction.confidence,
      explanation: `Based on ${features.historicalChanges} similar changes, this modification has a ${Math.round(prediction.probability * 100)}% chance of breaking existing functionality.`,
      affectedTests,
      mitigation: this.generateRegressionMitigation(affectedTests, prediction.probability)
    };
  }

  /**
   * Predict performance impact
   */
  private async predictPerformance(features: any, change: any): Promise<PredictionResult['predictions']['performance']> {
    const modelInput = {
      change_type: features.changeType,
      file_complexity: features.fileComplexity,
      dependency_depth: features.dependencyDepth,
      algorithm_complexity: features.algorithmComplexity,
      memory_allocation: features.memoryAllocation
    };

    const prediction = await this.mlModelService.predict('performance_impact', modelInput);

    // Generate benchmark predictions
    const benchmarks = await this.generatePerformanceBenchmarks(prediction, features);

    return {
      latencyDelta: prediction.latencyDelta,
      memoryDelta: prediction.memoryDelta,
      throughputDelta: prediction.throughputDelta,
      confidence: prediction.confidence,
      explanation: this.generatePerformanceExplanation(prediction, features),
      benchmarks
    };
  }

  /**
   * Predict code review time
   */
  private async predictReviewTime(features: any, change: any): Promise<PredictionResult['predictions']['reviewTime']> {
    const modelInput = {
      change_complexity: features.complexity,
      file_count: features.fileCount,
      author_reputation: features.authorReputation,
      team_velocity: features.teamVelocity,
      change_urgency: features.urgency,
      domain_complexity: features.domainComplexity
    };

    const prediction = await this.mlModelService.predict('review_time', modelInput);

    const factors = this.analyzeReviewTimeFactors(prediction, features);

    return {
      estimatedMinutes: prediction.estimatedMinutes,
      confidence: prediction.confidence,
      explanation: `Estimated review time based on ${features.historicalReviews} similar changes and current team velocity.`,
      factors
    };
  }

  /**
   * Predict deployment risk
   */
  private async predictDeploymentRisk(features: any, change: any): Promise<PredictionResult['predictions']['deploymentRisk']> {
    const modelInput = {
      change_scope: features.changeScope,
      environment_stability: features.environmentStability,
      deployment_frequency: features.deploymentFrequency,
      rollback_history: features.rollbackHistory,
      incident_rate: features.incidentRate
    };

    const prediction = await this.mlModelService.predict('deployment_risk', modelInput);

    const riskFactors = this.identifyDeploymentRiskFactors(prediction, features);

    return {
      rollbackProbability: prediction.rollbackProbability,
      incidentProbability: prediction.incidentProbability,
      confidence: prediction.confidence,
      explanation: this.generateDeploymentRiskExplanation(prediction, features),
      riskFactors,
      mitigation: this.generateDeploymentMitigation(riskFactors, prediction)
    };
  }

  /**
   * Predict security risks
   */
  private async predictSecurityRisk(features: any, change: any): Promise<PredictionResult['predictions']['securityRisk']> {
    const modelInput = {
      authentication_changes: features.authChanges,
      authorization_changes: features.authzChanges,
      input_validation_changes: features.inputValidationChanges,
      cryptography_changes: features.cryptoChanges,
      dependency_updates: features.dependencyUpdates
    };

    const prediction = await this.mlModelService.predict('security_risk', modelInput);

    const vulnerabilities = await this.identifySecurityVulnerabilities(change, prediction);

    return {
      score: prediction.securityScore,
      vulnerabilities,
      confidence: prediction.confidence,
      explanation: this.generateSecurityExplanation(prediction, vulnerabilities)
    };
  }

  // Helper methods

  private async identifyAffectedTests(change: any, features: any): Promise<string[]> {
    // Analyze which tests are likely to be affected by this change
    // This would use AST analysis and historical test failure patterns

    const affectedTests = [];

    if (features.testMapping) {
      // Use pre-computed test-to-file mappings
      for (const filePath of change.filePaths || []) {
        if (features.testMapping[filePath]) {
          affectedTests.push(...features.testMapping[filePath]);
        }
      }
    }

    // Add tests based on change type
    if (change.changeType === 'api' || change.intent?.includes('endpoint')) {
      affectedTests.push('API integration tests', 'endpoint validation tests');
    }

    if (change.intent?.includes('auth') || change.intent?.includes('security')) {
      affectedTests.push('authentication tests', 'authorization tests');
    }

    return [...new Set(affectedTests)]; // Remove duplicates
  }

  private generateRegressionMitigation(affectedTests: string[], probability: number): string[] {
    const mitigation = [];

    if (probability > 0.7) {
      mitigation.push('Run full test suite before merging');
      mitigation.push('Consider pair programming for complex changes');
    }

    if (probability > 0.5) {
      mitigation.push('Focus testing on high-risk areas');
      mitigation.push('Consider incremental rollout');
    }

    if (affectedTests.length > 5) {
      mitigation.push('Break change into smaller, testable increments');
    }

    return mitigation;
  }

  private async generatePerformanceBenchmarks(prediction: any, features: any): Promise<Array<{
    metric: string;
    before: number;
    after: number;
    impact: 'positive' | 'negative' | 'neutral';
  }>> {
    const benchmarks = [];

    // Generate realistic benchmark predictions
    benchmarks.push({
      metric: 'API Response Time',
      before: 150, // ms
      after: 150 + prediction.latencyDelta,
      impact: prediction.latencyDelta > 0 ? 'negative' as const : prediction.latencyDelta < -10 ? 'positive' as const : 'neutral' as const
    });

    benchmarks.push({
      metric: 'Memory Usage',
      before: 45, // MB
      after: 45 + prediction.memoryDelta,
      impact: prediction.memoryDelta > 5 ? 'negative' as const : prediction.memoryDelta < -5 ? 'positive' as const : 'neutral' as const
    });

    return benchmarks;
  }

  private generatePerformanceExplanation(prediction: any, features: any): string {
    let explanation = `Performance prediction based on change complexity (${features.complexity}/100) and historical performance data.`;

    if (prediction.latencyDelta > 20) {
      explanation += ' Significant latency increase expected due to complex algorithmic changes.';
    } else if (prediction.latencyDelta < -10) {
      explanation += ' Performance improvement expected from optimization changes.';
    } else {
      explanation += ' Minimal performance impact expected.';
    }

    return explanation;
  }

  private analyzeReviewTimeFactors(prediction: any, features: any): Array<{
    factor: string;
    impact: 'increase' | 'decrease';
    weight: number;
  }> {
    const factors = [];

    if (features.complexity > 70) {
      factors.push({
        factor: 'High change complexity',
        impact: 'increase' as const,
        weight: 0.4
      });
    }

    if (features.fileCount > 10) {
      factors.push({
        factor: 'Large number of files changed',
        impact: 'increase' as const,
        weight: 0.3
      });
    }

    if (features.authorReputation > 0.8) {
      factors.push({
        factor: 'Experienced author',
        impact: 'decrease' as const,
        weight: 0.2
      });
    }

    return factors;
  }

  private identifyDeploymentRiskFactors(prediction: any, features: any): string[] {
    const riskFactors = [];

    if (features.environmentStability < 0.7) {
      riskFactors.push('Unstable deployment environment');
    }

    if (features.rollbackHistory > 0.1) {
      riskFactors.push('High historical rollback rate');
    }

    if (features.changeScope === 'major') {
      riskFactors.push('Major architectural change');
    }

    return riskFactors;
  }

  private generateDeploymentRiskExplanation(prediction: any, features: any): string {
    let explanation = `Deployment risk assessment based on ${features.historicalDeployments} previous deployments.`;

    if (prediction.rollbackProbability > 0.3) {
      explanation += ' High rollback risk due to change scope and environment factors.';
    } else if (prediction.incidentProbability > 0.2) {
      explanation += ' Moderate incident risk expected.';
    } else {
      explanation += ' Low deployment risk with standard monitoring recommended.';
    }

    return explanation;
  }

  private generateDeploymentMitigation(riskFactors: string[], prediction: any): string[] {
    const mitigation = [];

    if (prediction.rollbackProbability > 0.3) {
      mitigation.push('Implement feature flags for gradual rollout');
      mitigation.push('Prepare detailed rollback plan');
      mitigation.push('Schedule deployment during low-traffic period');
    }

    if (riskFactors.includes('Unstable deployment environment')) {
      mitigation.push('Stabilize environment before deployment');
      mitigation.push('Run additional pre-deployment tests');
    }

    return mitigation;
  }

  private async identifySecurityVulnerabilities(change: any, prediction: any): Promise<Array<{
    type: string;
    severity: 'low' | 'medium' | 'high' | 'critical';
    cwe?: string;
    description: string;
  }>> {
    const vulnerabilities = [];

    // Analyze change for common security issues
    if (change.intent?.includes('auth') || change.diff?.includes('password')) {
      vulnerabilities.push({
        type: 'Authentication',
        severity: 'high' as const,
        cwe: 'CWE-287',
        description: 'Potential authentication bypass or weak authentication mechanism'
      });
    }

    if (change.diff?.includes('input') || change.diff?.includes('user') || change.diff?.includes('data')) {
      vulnerabilities.push({
        type: 'Input Validation',
        severity: 'medium' as const,
        cwe: 'CWE-20',
        description: 'Potential input validation or sanitization issues'
      });
    }

    return vulnerabilities;
  }

  private generateSecurityExplanation(prediction: any, vulnerabilities: any[]): string {
    let explanation = `Security risk score: ${prediction.securityScore}/100 based on static analysis and historical vulnerability patterns.`;

    if (vulnerabilities.length > 0) {
      explanation += ` Found ${vulnerabilities.length} potential security issues requiring review.`;
    } else {
      explanation += ' No immediate security concerns detected.';
    }

    return explanation;
  }

  private calculateOverallRisk(predictions: PredictionResult['predictions']): PredictionResult['overall'] {
    let maxRisk = 0;
    let riskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
    let requiresApproval = false;
    let recommendation = 'Proceed with normal review process';

    // Calculate maximum risk across all predictions
    if (predictions.regressionRisk?.probability && predictions.regressionRisk.probability > maxRisk) {
      maxRisk = predictions.regressionRisk.probability;
    }

    if (predictions.deploymentRisk?.rollbackProbability && predictions.deploymentRisk.rollbackProbability > maxRisk) {
      maxRisk = predictions.deploymentRisk.rollbackProbability;
    }

    if (predictions.securityRisk?.score && (predictions.securityRisk.score / 100) > maxRisk) {
      maxRisk = predictions.securityRisk.score / 100;
    }

    // Determine risk level and recommendations
    if (maxRisk > 0.7) {
      riskLevel = 'critical';
      requiresApproval = true;
      recommendation = 'Requires senior developer or architect approval before merging';
    } else if (maxRisk > 0.5) {
      riskLevel = 'high';
      requiresApproval = true;
      recommendation = 'Requires peer review and additional testing before merging';
    } else if (maxRisk > 0.3) {
      riskLevel = 'medium';
      recommendation = 'Consider additional testing and peer review';
    }

    // Check for specific high-risk indicators
    if (predictions.securityRisk?.vulnerabilities?.some(v => v.severity === 'critical')) {
      riskLevel = 'critical';
      requiresApproval = true;
      recommendation = 'Security review required - potential critical vulnerabilities detected';
    }

    return {
      riskLevel,
      recommendation,
      requiresApproval,
      estimatedImpact: this.generateImpactDescription(predictions)
    };
  }

  private generateImpactDescription(predictions: PredictionResult['predictions']): string {
    const impacts = [];

    if (predictions.performance?.latencyDelta) {
      const delta = predictions.performance.latencyDelta;
      if (delta > 50) {
        impacts.push('significant performance degradation');
      } else if (delta > 20) {
        impacts.push('moderate performance impact');
      } else if (delta < -20) {
        impacts.push('performance improvement');
      }
    }

    if (predictions.regressionRisk?.probability && predictions.regressionRisk.probability > 0.5) {
      impacts.push('high regression risk');
    }

    if (predictions.securityRisk?.score && predictions.securityRisk.score > 70) {
      impacts.push('security concerns');
    }

    if (impacts.length === 0) {
      return 'Minimal impact expected';
    }

    return impacts.join(', ') + ' expected';
  }
}

export default TCIPredictionService;

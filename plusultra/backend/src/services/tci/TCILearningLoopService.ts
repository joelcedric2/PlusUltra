/**
 * TCI Learning Loop Service
 *
 * Automatically adjusts model weights based on outcome feedback.
 *
 * How it works:
 * 1. User submits feedback via POST /api/v1/tci/feedback
 * 2. Learning loop calculates accuracy for each layer
 * 3. Model weights are adjusted (higher weight = more influence in consensus)
 * 4. Pattern library grows with confirmed patterns
 * 5. Pattern embeddings are stored in Pinecone for fast similarity search
 *
 * This creates a self-improving system that gets better over time.
 */

import { PrismaClient } from '@prisma/client';
import { pineconeService } from '../vector/PineconeService';

const prisma = new PrismaClient();

export class TCILearningLoopService {
  /**
   * Process feedback and update model weights
   */
  async processFeedback(feedbackId: string): Promise<{
    modelWeightsUpdated: string[];
    patternsAdded: number;
    accuracyImpact: Record<string, number>;
  }> {
    console.log(`[TCI Learning Loop] Processing feedback ${feedbackId}...`);

    // Get feedback with analysis and outcome
    const feedback = await prisma.tCIFeedback.findUnique({
      where: { id: feedbackId },
    });

    if (!feedback) {
      throw new Error(`Feedback ${feedbackId} not found`);
    }

    const analysis = await prisma.tCIAnalysis.findUnique({
      where: { id: feedback.analysisId },
      include: { outcome: true },
    });

    if (!analysis || !analysis.outcome) {
      throw new Error(`Analysis or outcome not found for feedback ${feedbackId}`);
    }

    const modelWeightsUpdated: string[] = [];
    const accuracyImpact: Record<string, number> = {};
    let patternsAdded = 0;

    // Update model weights for each layer
    const layerFeedback = [
      { model: 'deepseek', analysisType: 'visual', correct: analysis.outcome.visualCorrect },
      { model: 'claude', analysisType: 'causal', correct: analysis.outcome.causalCorrect },
      { model: 'gpt5', analysisType: 'historical', correct: analysis.outcome.historicalCorrect },
      { model: 'grok', analysisType: 'logic', correct: analysis.outcome.logicCorrect },
      { model: 'gemini', analysisType: 'synthesis', correct: analysis.outcome.synthesisCorrect },
      { model: 'claude', analysisType: 'implementation', correct: feedback.wasHelpful },
    ];

    for (const layer of layerFeedback) {
      const updated = await this.updateModelWeight(
        layer.model,
        layer.analysisType,
        layer.correct
      );

      if (updated) {
        modelWeightsUpdated.push(`${layer.model}:${layer.analysisType}`);
        accuracyImpact[`${layer.model}:${layer.analysisType}`] = updated.newAccuracy;
      }
    }

    // Extract and add patterns to library
    if (analysis.outcome.bugsFound && Array.isArray(analysis.outcome.bugsFound)) {
      for (const bug of analysis.outcome.bugsFound as string[]) {
        await this.addPatternToLibrary(bug, analysis);
        patternsAdded++;
      }
    }

    console.log(
      `[TCI Learning Loop] Updated ${modelWeightsUpdated.length} model weights, added ${patternsAdded} patterns`
    );

    return {
      modelWeightsUpdated,
      patternsAdded,
      accuracyImpact,
    };
  }

  /**
   * Update model weight based on feedback
   */
  private async updateModelWeight(
    model: string,
    analysisType: string,
    correct: boolean
  ): Promise<{ newAccuracy: number; newWeight: number } | null> {
    // Find or create model weight record
    let modelWeight = await prisma.modelWeight.findUnique({
      where: {
        model_analysisType: {
          model,
          analysisType,
        },
      },
    });

    if (!modelWeight) {
      // Create new model weight record
      modelWeight = await prisma.modelWeight.create({
        data: {
          model,
          analysisType,
          currentWeight: 1.0,
          accuracy: 0.5,
          totalAnalyses: 0,
          correctPredictions: 0,
        },
      });
    }

    // Update statistics
    const newTotalAnalyses = modelWeight.totalAnalyses + 1;
    const newCorrectPredictions = modelWeight.correctPredictions + (correct ? 1 : 0);
    const newAccuracy = newCorrectPredictions / newTotalAnalyses;

    // Calculate new weight using exponential moving average
    // Weight is based on accuracy with a learning rate of 0.1
    const learningRate = 0.1;
    const targetWeight = this.accuracyToWeight(newAccuracy);
    const newWeight =
      modelWeight.currentWeight * (1 - learningRate) + targetWeight * learningRate;

    // Update model weight
    await prisma.modelWeight.update({
      where: { id: modelWeight.id },
      data: {
        currentWeight: newWeight,
        accuracy: newAccuracy,
        totalAnalyses: newTotalAnalyses,
        correctPredictions: newCorrectPredictions,
      },
    });

    console.log(
      `  ✓ ${model}:${analysisType} - Accuracy: ${(newAccuracy * 100).toFixed(1)}% (${newCorrectPredictions}/${newTotalAnalyses}), Weight: ${newWeight.toFixed(3)}`
    );

    return { newAccuracy, newWeight };
  }

  /**
   * Convert accuracy to weight
   * Higher accuracy → higher weight
   */
  private accuracyToWeight(accuracy: number): number {
    // Sigmoid function to map accuracy (0-1) to weight (0.1-2.0)
    // accuracy < 0.5 → weight < 1.0 (less influence)
    // accuracy > 0.5 → weight > 1.0 (more influence)
    // accuracy = 0.9+ → weight ~ 2.0 (double influence)

    if (accuracy < 0.3) return 0.1; // Very low accuracy, minimal weight
    if (accuracy < 0.5) return 0.5 + (accuracy - 0.3) * 2.5; // 0.5 - 1.0
    if (accuracy < 0.7) return 1.0 + (accuracy - 0.5) * 2.0; // 1.0 - 1.4
    if (accuracy < 0.9) return 1.4 + (accuracy - 0.7) * 2.5; // 1.4 - 1.9
    return 2.0; // Excellent accuracy, maximum weight
  }

  /**
   * Add pattern to library from confirmed bug
   */
  private async addPatternToLibrary(
    bugDescription: string,
    analysis: any
  ): Promise<void> {
    // Extract pattern from bug description and code
    const visualInsights = analysis.visualInsights;
    const historicalInsights = analysis.historicalInsights;

    // Try to find existing pattern
    const patternName = this.extractPatternName(bugDescription, historicalInsights);

    const existingPattern = await prisma.tCIPattern.findUnique({
      where: { name: patternName },
    });

    if (existingPattern) {
      // Update occurrence count
      const updatedPattern = await prisma.tCIPattern.update({
        where: { id: existingPattern.id },
        data: {
          occurrenceCount: existingPattern.occurrenceCount + 1,
          detectionCount: existingPattern.detectionCount + 1, // TCI detected it
          accuracy: (existingPattern.detectionCount + 1) / (existingPattern.occurrenceCount + 1),
        },
      });

      // Update Pinecone metadata
      await pineconeService.updatePatternMetadata(updatedPattern.id, {
        name: updatedPattern.name,
        category: updatedPattern.category,
        severity: updatedPattern.severity,
        accuracy: updatedPattern.accuracy,
        occurrenceCount: updatedPattern.occurrenceCount,
      });

      console.log(`  ✓ Pattern "${patternName}" occurrence count increased`);
    } else {
      // Create new pattern
      const category = this.categorizePattern(bugDescription);
      const severity = this.assessSeverity(bugDescription, visualInsights);

      const newPattern = await prisma.tCIPattern.create({
        data: {
          name: patternName,
          description: bugDescription,
          category,
          severity,
          codeSignature: this.generateCodeSignature(analysis.code),
          visualSignature: visualInsights?.visualPatterns || null,
          occurrenceCount: 1,
          detectionCount: 1,
          missedCount: 0,
          accuracy: 1.0,
        },
      });

      // Store pattern embedding in Pinecone for fast similarity search
      try {
        const embedding = await pineconeService.generateCodeEmbedding(analysis.code);
        await pineconeService.storePatternEmbedding({
          patternId: newPattern.id,
          embedding,
          metadata: {
            name: newPattern.name,
            category: newPattern.category,
            severity: newPattern.severity,
            accuracy: newPattern.accuracy,
            occurrenceCount: newPattern.occurrenceCount,
          },
        });
      } catch (error: any) {
        console.warn(`  ⚠️  Failed to store pattern embedding in Pinecone: ${error.message}`);
        // Continue without Pinecone - pattern is still stored in PostgreSQL
      }

      console.log(`  ✓ New pattern "${patternName}" added to library`);
    }
  }

  /**
   * Extract pattern name from bug description and historical insights
   */
  private extractPatternName(bugDescription: string, historicalInsights: any): string {
    // Try to use historical pattern name if available
    if (historicalInsights?.thisCodeMatchesPattern) {
      return historicalInsights.thisCodeMatchesPattern;
    }

    // Otherwise generate from bug description
    const keywords = [
      'SQL injection',
      'XSS',
      'CSRF',
      'Race condition',
      'Memory leak',
      'Buffer overflow',
      'Null pointer',
      'Type error',
      'Undefined behavior',
      'Hardcoded credentials',
    ];

    for (const keyword of keywords) {
      if (bugDescription.toLowerCase().includes(keyword.toLowerCase())) {
        return keyword;
      }
    }

    // Fallback: use first 50 chars of description
    return bugDescription.substring(0, 50).trim();
  }

  /**
   * Categorize pattern
   */
  private categorizePattern(bugDescription: string): string {
    const desc = bugDescription.toLowerCase();

    if (
      desc.includes('injection') ||
      desc.includes('xss') ||
      desc.includes('csrf') ||
      desc.includes('security')
    ) {
      return 'vulnerability';
    }

    if (
      desc.includes('crash') ||
      desc.includes('error') ||
      desc.includes('exception') ||
      desc.includes('fail')
    ) {
      return 'bug';
    }

    if (
      desc.includes('performance') ||
      desc.includes('slow') ||
      desc.includes('memory leak')
    ) {
      return 'anti-pattern';
    }

    return 'bug'; // Default
  }

  /**
   * Assess severity from description and visual insights
   */
  private assessSeverity(bugDescription: string, visualInsights: any): string {
    const desc = bugDescription.toLowerCase();

    // Check for critical keywords
    if (
      desc.includes('critical') ||
      desc.includes('security') ||
      desc.includes('data loss') ||
      desc.includes('injection')
    ) {
      return 'HIGH';
    }

    // Check visual insights
    if (visualInsights?.visualPatterns) {
      const hasHighSeverity = visualInsights.visualPatterns.some(
        (p: any) => p.severity === 'HIGH'
      );
      if (hasHighSeverity) return 'HIGH';
    }

    // Check for medium keywords
    if (
      desc.includes('error') ||
      desc.includes('incorrect') ||
      desc.includes('wrong')
    ) {
      return 'MEDIUM';
    }

    return 'LOW';
  }

  /**
   * Generate code signature (simplified regex pattern)
   */
  private generateCodeSignature(code: string): string {
    // Extract key patterns (simplified for demo)
    // In production, would use AST analysis

    const patterns: string[] = [];

    // SQL concatenation pattern
    if (code.match(/["']SELECT.*\+.*["']/)) {
      patterns.push('SQL_CONCATENATION');
    }

    // Unhandled promise
    if (code.match(/\.then\([^)]*\)(?!\s*\.catch)/)) {
      patterns.push('UNHANDLED_PROMISE');
    }

    // Missing null check
    if (code.match(/\.\w+\(/) && !code.includes('if') && !code.includes('?')) {
      patterns.push('MISSING_NULL_CHECK');
    }

    return patterns.join('|') || 'GENERIC';
  }

  /**
   * Get current model weights
   */
  async getModelWeights(): Promise<Record<string, number>> {
    const weights = await prisma.modelWeight.findMany();

    const result: Record<string, number> = {};
    for (const weight of weights) {
      result[`${weight.model}:${weight.analysisType}`] = weight.currentWeight;
    }

    return result;
  }

  /**
   * Get learning statistics
   */
  async getStatistics(): Promise<{
    totalFeedback: number;
    averageAccuracy: number;
    modelAccuracies: Record<string, number>;
    patternLibrarySize: number;
    topPatterns: Array<{ name: string; occurrences: number; accuracy: number }>;
  }> {
    const totalFeedback = await prisma.tCIFeedback.count();

    const outcomes = await prisma.tCIOutcome.aggregate({
      _avg: { overallAccuracy: true },
    });

    const modelWeights = await prisma.modelWeight.findMany();
    const modelAccuracies: Record<string, number> = {};
    for (const weight of modelWeights) {
      modelAccuracies[`${weight.model}:${weight.analysisType}`] = weight.accuracy;
    }

    const patternLibrarySize = await prisma.tCIPattern.count();

    const topPatterns = await prisma.tCIPattern.findMany({
      orderBy: { occurrenceCount: 'desc' },
      take: 5,
      select: {
        name: true,
        occurrenceCount: true,
        accuracy: true,
      },
    });

    return {
      totalFeedback,
      averageAccuracy: outcomes._avg.overallAccuracy || 0,
      modelAccuracies,
      patternLibrarySize,
      topPatterns: topPatterns.map((p) => ({
        name: p.name,
        occurrences: p.occurrenceCount,
        accuracy: p.accuracy,
      })),
    };
  }
}

export const tciLearningLoopService = new TCILearningLoopService();

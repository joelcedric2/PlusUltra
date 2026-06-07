/**
 * Model Voting Telemetry Service
 * Tracks AI model voting patterns to identify underperforming models
 *
 * Purpose: Optimize costs by identifying which models rarely win votes
 * after 3-6 months of operation, those models can be dropped
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export type VotingRecord = {
  id?: string; // Optional for creation, will be auto-generated
  timestamp?: Date; // Optional for creation, will default to now
  taskType: 'code_generation' | 'app_design' | 'project_planning' | 'debugging' | 'optimization' | 'design_review' | 'code_review';
  winner: 'claude' | 'gpt5' | 'gemini' | 'grok' | 'deepseek' | 'none'; // 'none' if no clear winner
  votes: {
    claude: number;
    gpt5: number;
    gemini: number;
    grok: number;
    deepseek: number;
  };
  agreement: number; // 0-1
  userId: string;
  sessionId?: string;
  consensusReached: boolean;
  metadata?: Record<string, any>;
};

export interface ModelPerformanceMetrics {
  model: 'claude' | 'gpt5' | 'gemini' | 'grok' | 'deepseek';
  totalParticipations: number;
  totalWins: number;
  winRate: number;
  averageVoteScore: number;
  byTaskType: Record<string, {
    participations: number;
    wins: number;
    winRate: number;
    averageVoteScore: number;
  }>;
}

export interface TelemetryAnalytics {
  dateRange: {
    start: Date;
    end: Date;
  };
  totalVotingSessions: number;
  modelPerformance: ModelPerformanceMetrics[];
  recommendations: {
    modelsToDrop: string[];
    modelsToKeep: string[];
    reasoning: string[];
  };
  costProjections: {
    currentMonthly: number;
    projectedWithOptimization: number;
    potentialSavings: number;
  };
}

export class ModelVotingTelemetryService {
  /**
   * Record a voting result
   */
  async recordVote(record: Omit<VotingRecord, 'id' | 'timestamp'>): Promise<void> {
    try {
      await prisma.modelVote.create({
        data: {
          taskType: record.taskType,
          winner: record.winner,
          claudeVote: record.votes.claude,
          gpt5Vote: record.votes.gpt5,
          geminiVote: record.votes.gemini,
          grokVote: record.votes.grok,
          deepseekVote: record.votes.deepseek,
          agreement: record.agreement,
          userId: record.userId,
          sessionId: record.sessionId,
          consensusReached: record.consensusReached,
        },
      });
      console.log('📊 Recording voting result:', {
        taskType: record.taskType,
        winner: record.winner,
        consensusReached: record.consensusReached,
      });
    } catch (error) {
      console.error('Failed to record vote:', error);
      // Don't throw - telemetry failure shouldn't break orchestration
    }
  }

  /**
   * Get analytics for a date range
   */
  /**
   * Helper to transform Prisma vote record to expected format with nested votes object
   */
  private transformVoteRecord(vote: any): VotingRecord {
    return {
      ...vote,
      votes: {
        claude: vote.claudeVote,
        gpt5: vote.gpt5Vote,
        gemini: vote.geminiVote,
        grok: vote.grokVote,
        deepseek: vote.deepseekVote,
      },
    };
  }

  async getAnalytics(
    startDate: Date,
    endDate: Date = new Date()
  ): Promise<TelemetryAnalytics> {
    const rawVotes = await prisma.modelVote.findMany({
      where: {
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    // Transform to expected format
    const votes = rawVotes.map(v => this.transformVoteRecord(v));

    const totalVotingSessions = votes.length;

    const models = ['claude', 'gpt5', 'gemini', 'grok', 'deepseek'];
    const modelPerformance: ModelPerformanceMetrics[] = models.map((model) => {
      let totalParticipations = 0;
      let totalWins = 0;
      let totalVoteScore = 0;

      const byTaskType: Record<string, {
        participations: number;
        wins: number;
        winRate: number;
        averageVoteScore: number;
      }> = {};

      votes.forEach((vote) => {
        // Participations are when the model received a vote
        if (vote.votes[model as keyof typeof vote.votes] > 0) {
          totalParticipations++;
          totalVoteScore += vote.votes[model as keyof typeof vote.votes];

          if (!byTaskType[vote.taskType]) {
            byTaskType[vote.taskType] = { participations: 0, wins: 0, winRate: 0, averageVoteScore: 0 };
          }
          byTaskType[vote.taskType].participations++;
          byTaskType[vote.taskType].averageVoteScore += vote.votes[model as keyof typeof vote.votes];
        }

        // Wins are when the model was the declared winner
        if (vote.winner === model) {
          totalWins++;
          if (!byTaskType[vote.taskType]) {
            byTaskType[vote.taskType] = { participations: 0, wins: 0, winRate: 0, averageVoteScore: 0 };
          }
          byTaskType[vote.taskType].wins++;
        }
      });

      // Calculate win rates and average scores for task types
      for (const taskType in byTaskType) {
        const data = byTaskType[taskType];
        data.winRate = data.participations > 0 ? data.wins / data.participations : 0;
        data.averageVoteScore = data.participations > 0 ? data.averageVoteScore / data.participations : 0;
      }

      const winRate = totalParticipations > 0 ? totalWins / totalParticipations : 0;
      const averageVoteScore = totalParticipations > 0 ? totalVoteScore / totalParticipations : 0;

      return {
        model: model as 'claude' | 'gpt5' | 'gemini' | 'grok' | 'deepseek',
        totalParticipations,
        totalWins,
        winRate,
        averageVoteScore,
        byTaskType,
      };
    });

    // Identify recommendations
    const recommendations = await this.identifyUnderperformingModels(3, 0.15, modelPerformance); // Use 3 months threshold, 15% min win rate

    const costProjections = this.calculateProjectedCostSavings(modelPerformance);


    return {
      dateRange: { start: startDate, end: endDate },
      totalVotingSessions,
      modelPerformance,
      recommendations: {
        modelsToDrop: recommendations.underperformingModels.filter(m => m.recommendDrop).map(m => m.model),
        modelsToKeep: models.filter(m => !recommendations.underperformingModels.some(up => up.model === m)),
        reasoning: recommendations.underperformingModels.map(m => m.reasoning),
      },
      costProjections: await costProjections,
    };
  }

  /**
   * Get model win rate by task type
   */
  async getModelWinRateByTaskType(
    taskType: VotingRecord['taskType'],
    startDate: Date,
    endDate: Date = new Date()
  ): Promise<{
    taskType: string;
    models: Array<{
      model: string;
      wins: number;
      participations: number;
      winRate: number;
      averageVoteScore: number;
    }>;
  }> {
    const rawVotes = await prisma.modelVote.findMany({
      where: {
        taskType,
        timestamp: {
          gte: startDate,
          lte: endDate,
        },
      },
    });

    // Transform to expected format
    const votes = rawVotes.map(v => this.transformVoteRecord(v));

    const models = ['claude', 'gpt5', 'gemini', 'grok', 'deepseek'];
    const modelStats: Record<string, { wins: number; participations: number; averageVoteScore: number }> = {};

    models.forEach(model => {
      modelStats[model] = { wins: 0, participations: 0, averageVoteScore: 0 };
    });

    votes.forEach(vote => {
      models.forEach(model => {
        if (vote.votes[model as keyof typeof vote.votes] > 0) {
          modelStats[model].participations++;
          modelStats[model].averageVoteScore += vote.votes[model as keyof typeof vote.votes];
        }
        if (vote.winner === model) {
          modelStats[model].wins++;
        }
      });
    });

    const resultModels = models.map(model => {
      const stats = modelStats[model];
      const winRate = stats.participations > 0 ? stats.wins / stats.participations : 0;
      const averageVoteScore = stats.participations > 0 ? stats.averageVoteScore / stats.participations : 0;
      return {
        model: model as 'claude' | 'gpt5' | 'gemini' | 'grok' | 'deepseek',
        wins: stats.wins,
        participations: stats.participations,
        winRate,
        averageVoteScore,
      };
    });

    return {
      taskType,
      models: resultModels,
    };
  }

  /**
   * Identify underperforming models
   * Models with win rate < 15% over 3+ months should be flagged
   * @param minMonths The minimum number of months to consider for analysis.
   * @param minWinRate The minimum win rate threshold.
   * @param modelPerformance Optional pre-calculated model performance metrics.
   */
  async identifyUnderperformingModels(
    minMonths: number = 3,
    minWinRate: number = 0.15,
    modelPerformance?: ModelPerformanceMetrics[]
  ): Promise<{
    underperformingModels: Array<{
      model: string;
      winRate: number;
      recommendDrop: boolean;
      reasoning: string;
    }>;
  }> {
    const threeMonthsAgo = new Date();
    threeMonthsAgo.setMonth(threeMonthsAgo.getMonth() - minMonths);

    const metrics = modelPerformance || (await this.getAnalytics(threeMonthsAgo)).modelPerformance;

    const underperforming = metrics
      .filter((m) => m.winRate < minWinRate && m.totalParticipations > 50) // Minimum sample size for valid stats
      .map((m) => ({
        model: m.model,
        winRate: m.winRate,
        recommendDrop: true,
        reasoning: `Win rate of ${(m.winRate * 100).toFixed(1)}% is below ${(minWinRate * 100)}% threshold over ${minMonths} months with ${m.totalParticipations} participations`,
      }));

    return { underperformingModels: underperforming };
  }

  /**
   * Calculate cost savings from dropping models
   */
  private async calculateProjectedCostSavings(modelPerformance: ModelPerformanceMetrics[]): Promise<TelemetryAnalytics['costProjections']> {
    const costPer1MTokens: Record<string, number> = {
      claude: 15,
      gpt5: 25,
      gemini: 7,
      grok: 5,
      deepseek: 3,
    };

    let totalCurrentMonthlyCost = 0;
    let totalProjectedMonthlyCost = 0;
    const monthlyVolume = 1_000_000; // Assume 1M tokens processed monthly for estimation

    const underperformingModelsResult = await this.identifyUnderperformingModels(3, 0.15, modelPerformance);
    const underperforming = (underperformingModelsResult as any).underperformingModels || [];

    modelPerformance.forEach(mp => {
      const modelCost = costPer1MTokens[mp.model] || 0;
      totalCurrentMonthlyCost += modelCost;

      // Only add to projected cost if the model is performing well enough to keep
      if (!underperforming.some((up: any) => up.model === mp.model)) {
        totalProjectedMonthlyCost += modelCost;
      }
    });

    const currentMonthly = (totalCurrentMonthlyCost * monthlyVolume) / 1_000_000; // Cost if all models are active
    const projectedWithOptimization = (totalProjectedMonthlyCost * monthlyVolume) / 1_000_000; // Cost if underperforming models are dropped
    const potentialSavings = currentMonthly - projectedWithOptimization;

    return {
      currentMonthly,
      projectedWithOptimization,
      potentialSavings,
    };
  }

  /**
   * Calculate cost savings from dropping a model
   */
  calculateCostSavings(
    model: 'claude' | 'gpt5' | 'gemini' | 'grok' | 'deepseek',
    monthlyVolume: number
  ): {
    currentCost: number;
    projectedCost: number;
    savings: number;
    savingsPercentage: number;
  } {
    // Average API costs per 1M tokens (approximate 2025 pricing)
    const costPer1MTokens: Record<string, number> = {
      claude: 15, // Claude Sonnet 4.5 ~$15/1M
      gpt5: 25, // GPT-5 ~$25/1M (estimated lower than GPT-4)
      gemini: 7, // Gemini 2.5 Pro ~$7/1M
      grok: 5, // Grok-2 ~$5/1M
      deepseek: 3, // DeepSeek OCR ~$3/1M
    };

    const modelCost = costPer1MTokens[model];
    const totalCurrentCost = Object.values(costPer1MTokens).reduce((a, b) => a + b, 0);
    const projectedCost = totalCurrentCost - modelCost;

    const currentMonthlyCost = (totalCurrentCost * monthlyVolume) / 1_000_000;
    const projectedMonthlyCost = (projectedCost * monthlyVolume) / 1_000_000;
    const savings = currentMonthlyCost - projectedMonthlyCost;

    return {
      currentCost: currentMonthlyCost,
      projectedCost: projectedMonthlyCost,
      savings,
      savingsPercentage: (savings / currentMonthlyCost) * 100,
    };
  }

  /**
   * Get task-specific model recommendations
   * Identifies which models excel at which tasks
   */
  async getTaskSpecificRecommendations(): Promise<
    Record<
      VotingRecord['taskType'],
      {
        recommendedModels: string[];
        topPerformer: string;
        reasoning: string;
      }
    >
  > {
    const models = ['claude', 'gpt5', 'gemini', 'grok', 'deepseek'];
    const taskTypes: VotingRecord['taskType'][] = [
      'code_generation', 'app_design', 'project_planning', 'debugging', 'optimization', 'design_review', 'code_review'
    ];
    
    const recommendations: Record<
      VotingRecord['taskType'],
      {
        recommendedModels: string[];
        topPerformer: string;
        reasoning: string;
      }
    > = {} as any;

    for (const taskType of taskTypes) {
      const result = await this.getModelWinRateByTaskType(taskType, new Date(0)); // Analyze all history
      
      if (result.models.length === 0) {
        recommendations[taskType] = {
          recommendedModels: [],
          topPerformer: 'none',
          reasoning: 'No data for this task type.',
        };
        continue;
      }

      // Sort models by win rate
      const sortedModels = result.models.sort((a, b) => b.winRate - a.winRate);
      const topPerformer = sortedModels[0];

      if (topPerformer && topPerformer.winRate > 0) {
        recommendations[taskType] = {
          recommendedModels: sortedModels.filter(m => m.winRate > 0).map(m => m.model),
          topPerformer: topPerformer.model,
          reasoning: `${topPerformer.model} consistently wins ${taskType} tasks with a ${(topPerformer.winRate * 100).toFixed(0)}% win rate.`,
        };
      } else {
        recommendations[taskType] = {
          recommendedModels: [],
          topPerformer: 'none',
          reasoning: 'No clear top performer for this task type.',
        };
      }
    }
    return recommendations;
  }
}

export const modelVotingTelemetry = new ModelVotingTelemetryService();

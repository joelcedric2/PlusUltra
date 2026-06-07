import TemporalGraphDB from './TemporalGraphDB';
import ChangeIntentLogger from './ChangeIntentLogger';
import ReplayEngine from './ReplayEngine';
import PredictiveForkSimulator from './PredictiveForkSimulator';
import TCIEnvelopeService from './TCIEnvelopeService';
import TCIMultiAgentOrchestrator from './TCIMultiAgentOrchestrator';
import TCIDeterministicReplay from './TCIDeterministicReplay';
import TCIGovernanceService, { TCIPolicyEngine, TCIAuditTrail } from './TCISafeguards';
import { CloudflareR2Storage } from '../storage/CloudflareR2Storage';

export interface TCIQuery {
  question: string;
  context?: {
    filePaths?: string[];
    timeRange?: { start: Date; end: Date };
    sessionId?: string;
  };
}

export interface TCIResponse {
  answer: string;
  confidence: number;
  supportingEvidence: Array<{
    type: 'historical_change' | 'prediction' | 'replay' | 'intent';
    data: any;
    relevance: number;
  }>;
  suggestions?: string[];
  alternativeApproaches?: Array<{
    description: string;
    pros: string[];
    cons: string[];
  }>;
}

type QueryHandler = (query: TCIQuery, context: any) => Promise<TCIResponse>;

// Type for the query routing map
type QueryRouter = Map<string[], QueryHandler>;

export class TemporalCodeIntelligence {
  private envelopeService: TCIEnvelopeService;
  private agentOrchestrator: TCIMultiAgentOrchestrator;
  private deterministicReplay: TCIDeterministicReplay;
  private safeguards: TCIGovernanceService;

  constructor(
    // ... existing dependencies
    // ---
    private readonly temporalDB: TemporalGraphDB,
    private readonly changeLogger: ChangeIntentLogger,
    private readonly replayEngine: ReplayEngine,
    private readonly forkSimulator: PredictiveForkSimulator,
    private readonly storageService: CloudflareR2Storage,
    private readonly vectorDB: any,
    private readonly auditLogger: any,
    private readonly modelRouter: any,
    private readonly rbacService: any,
    private readonly jobQueue: any
  ) {
    // Initialize comprehensive TCI services
    this.envelopeService = new TCIEnvelopeService(storageService, auditLogger, vectorDB);
    this.agentOrchestrator = new TCIMultiAgentOrchestrator(modelRouter, storageService, vectorDB, auditLogger);
    this.deterministicReplay = new TCIDeterministicReplay(storageService, jobQueue);
    this.safeguards = new TCIGovernanceService(
      new TCIPolicyEngine(auditLogger, rbacService),
      new TCIAuditTrail(storageService, {} as any), // cryptoService placeholder
      rbacService
    );
  }
  
  // Define the query router using a Map for scalability
  private getQueryRouter(): QueryRouter {
    const router: QueryRouter = new Map();
    router.set(['why', 'explain', 'reason'], this.handleExplanationQuery.bind(this));
    router.set(['revert', 'undo', 'rollback'], this.handleRevertQuery.bind(this));
    router.set(['simulate', 'predict', 'what if', 'future'], this.handlePredictionQuery.bind(this));
    router.set(['evolution', 'history', 'how did'], this.handleEvolutionQuery.bind(this));
    router.set(['alternative', 'different way', 'another approach'], this.handleAlternativeQuery.bind(this));
    router.set(['generate', 'create', 'build', 'make'], this.handleGenerationQuery.bind(this));
    return router;
  }

  private findHandler(question: string): QueryHandler {
    const router = this.getQueryRouter();
    for (const [keywords, handler] of router.entries()) {
      if (keywords.some(keyword => question.includes(keyword))) {
        return handler;
      }
    }
    // Default to the explanation handler if no keywords match
    return this.handleExplanationQuery.bind(this);
  }

  /**
   * Main entry point for TCI queries - Enhanced with comprehensive TCI system
   */
  async query(query: TCIQuery): Promise<TCIResponse> {
    const question = query.question.toLowerCase();
    const context = {
      sessionId: query.context?.sessionId || `session_${Date.now()}`,
      userId: query.context?.filePaths?.[0] || 'anonymous', // Simplified for demo
      workspaceId: 'default',
      operationId: `query_${Date.now()}`,
    };

    // Use the router to find and execute the appropriate handler
    const handler = this.findHandler(question);
    return handler(query, context);
  }

  /**
   * Log a code generation or modification event
   */
  async logCodeEvent(event: {
    filePath: string;
    changeType: string;
    oldContent?: string;
    newContent: string;
    context: {
      userId: string;
      sessionId: string;
      prompt?: string;
      agents: string[];
      workflowType: string;
    };
  }): Promise<void> {
    await this.changeLogger.logCodeChange({
      filePath: event.filePath,
      changeType: event.changeType as any,
      oldContent: event.oldContent,
      newContent: event.newContent,
      context: event.context
    });
  }

  /**
   * Get comprehensive context for a file or session
   */
  async getContext(filePaths?: string[], sessionId?: string): Promise<{
    evolution: any[];
    currentState: Record<string, string>;
    predictions: any[];
    insights: string[];
  }> {
    const evolution = await this.temporalDB.queryChanges({
      filePaths,
      limit: 100
    });

    const currentState: Record<string, string> = {};
    for (const filePath of filePaths || []) {
      const fileEvolution = await this.temporalDB.getFileEvolution(filePath);
      if (fileEvolution.length > 0) {
        currentState[filePath] = fileEvolution[fileEvolution.length - 1].codeSnapshot.after;
      }
    }

    const predictions = await this.forkSimulator.predictEvolution(filePaths || [], 30) as any;

    const insights = this.generateContextualInsights(evolution, predictions);

    return {
      evolution,
      currentState,
      predictions,
      insights
    };
  }

  // Private query handlers

  private async handleExplanationQuery(query: TCIQuery): Promise<TCIResponse> {
    const filePaths = query.context?.filePaths || [];

    if (filePaths.length === 0) {
      return {
        answer: "Please specify which files you'd like me to explain.",
        confidence: 0.1,
        supportingEvidence: []
      };
    }

    const explanations = await Promise.all(
      filePaths.map(filePath => this.temporalDB.explainCodeIntent(filePath))
    );

    const bestExplanation = explanations.reduce((best, current) =>
      current.confidence > best.confidence ? current : best
    );

    return {
      answer: bestExplanation.explanation,
      confidence: bestExplanation.confidence,
      supportingEvidence: [
        {
          type: 'intent',
          data: bestExplanation,
          relevance: 0.9
        }
      ],
      suggestions: [
        "Ask me to show the evolution of this code",
        "Ask me to predict what happens if we change this",
        "Ask me about alternative implementations"
      ]
    };
  }

  private async handleRevertQuery(query: TCIQuery): Promise<TCIResponse> {
    const timeRange = query.context?.timeRange;
    const filePaths = query.context?.filePaths;

    if (!timeRange) {
      return {
        answer: "Please specify a time range to revert to.",
        confidence: 0.1,
        supportingEvidence: []
      };
    }

    const simulation = await this.replayEngine.simulateRevert([], timeRange?.start);

    const impactDescription = this.describeRevertImpact(simulation.predictedImpact);

    return {
      answer: `Reverting to ${timeRange.start.toISOString().split('T')[0]} would ${impactDescription}. This involves reverting across ${simulation.differences.length} files.`,
      confidence: 0.8,
      supportingEvidence: [
        {
          type: 'replay',
          data: simulation,
          relevance: 0.9
        }
      ],
      suggestions: [
        "Review the specific changes that would be reverted",
        "See what the code looked like before these changes",
        "Consider a partial revert of only certain changes"
      ]
    };
  }

  private async handlePredictionQuery(query: TCIQuery): Promise<TCIResponse> {
    const filePaths = query.context?.filePaths || [];

    if (filePaths.length === 0) {
      return {
        answer: "Please specify which files you'd like me to analyze for future predictions.",
        confidence: 0.1,
        supportingEvidence: []
      };
    }

    const predictions = await this.forkSimulator.predictEvolution(filePaths, 90);

    const predictionSummary = this.summarizePredictions(predictions);

    return {
      answer: predictionSummary,
      confidence: predictions.confidence,
      supportingEvidence: [
        {
          type: 'prediction',
          data: predictions,
          relevance: 0.9
        }
      ],
      suggestions: [
        "Ask me to simulate specific proposed changes",
        "See alternative architectural approaches",
        "Understand the reasoning behind predicted changes"
      ]
    };
  }

  private async handleEvolutionQuery(query: TCIQuery): Promise<TCIResponse> {
    const filePaths = query.context?.filePaths || [];
    const timeRange = query.context?.timeRange;

    if (filePaths.length === 0) {
      return {
        answer: "Please specify which files you'd like to see the evolution for.",
        confidence: 0.1,
        supportingEvidence: []
      };
    }

    const evolution = await Promise.all(
      filePaths.map(filePath => this.temporalDB.getFileEvolution(filePath, timeRange?.start))
    );

    const flattenedEvolution = evolution.flat();

    if (flattenedEvolution.length === 0) {
      return {
        answer: "No evolution history found for the specified files and time range.",
        confidence: 0.1,
        supportingEvidence: []
      };
    }

    const evolutionNarrative = this.buildEvolutionNarrative(flattenedEvolution);

    return {
      answer: evolutionNarrative,
      confidence: 0.9,
      supportingEvidence: [
        {
          type: 'historical_change',
          data: flattenedEvolution,
          relevance: 1.0
        }
      ],
      suggestions: [
        "Ask me why specific changes were made",
        "See what would happen if we reverted certain changes",
        "Understand the intent behind the current code structure"
      ]
    };
  }

  private async handleAlternativeQuery(query: TCIQuery): Promise<TCIResponse> {
    const filePaths = query.context?.filePaths || [];

    if (filePaths.length === 0) {
      return {
        answer: "Please specify which files you'd like alternative approaches for.",
        confidence: 0.1,
        supportingEvidence: []
      };
    }

    // Get recent changes for these files
    const recentChanges = await this.temporalDB.queryChanges({
      filePaths,
      limit: 10
    });

    const alternatives = this.generateAlternativeApproaches(recentChanges);

    return {
      answer: `Here are alternative approaches based on the evolution of these files:`,
      confidence: 0.7,
      supportingEvidence: [
        {
          type: 'historical_change',
          data: recentChanges,
          relevance: 0.8
        }
      ],
      alternativeApproaches: alternatives
    };
  }

  // Helper methods

  private describeRevertImpact(impact: any): string {
    const parts = [];

    if (impact.linesRemoved > 0) {
      parts.push(`remove ${impact.linesRemoved} lines of code`);
    }

    if (impact.featuresAffected.length > 0) {
      parts.push(`affect ${impact.featuresAffected.length} features`);
    }

    const riskDescriptions = {
      low: 'low risk',
      medium: 'moderate risk',
      high: 'high risk'
    };

    const maintainabilityLevel = impact.maintainability as keyof typeof riskDescriptions;
    const maintainabilityDescription = riskDescriptions[maintainabilityLevel] || 'unknown risk';

    parts.push(`with ${maintainabilityDescription} maintainability impact`);

    return parts.join(' and ');
  }

  private summarizePredictions(predictions: any): string {
    const totalPredictions = predictions.predictedChanges.length;
    const highProbabilityPredictions = predictions.predictedChanges.filter((p: any) => p.probability > 0.6);

    let summary = `Based on historical patterns, I predict ${totalPredictions} likely changes over the next 90 days. `;

    if (highProbabilityPredictions.length > 0) {
      summary += `${highProbabilityPredictions.length} of these have high probability (>60%). `;
    }

    summary += `The overall trajectory appears ${predictions.overallTrajectory}.`;

    return summary;
  }

  private buildEvolutionNarrative(changes: any[]): string {
    if (changes.length === 0) {
      return "No evolution history available.";
    }

    const startDate = changes[0].timestamp.toISOString().split('T')[0];
    const endDate = changes[changes.length - 1].timestamp.toISOString().split('T')[0];
    const totalChanges = changes.length;
    const uniqueFiles = new Set(changes.map(c => c.filePath)).size;

    let narrative = `This code evolved from ${startDate} to ${endDate} through ${totalChanges} tracked changes across ${uniqueFiles} files.\n\n`;

    // Group changes by intent
    const intentGroups: Record<string, any[]> = {};
    for (const change of changes) {
      if (!intentGroups[change.intent]) {
        intentGroups[change.intent] = [];
      }
      intentGroups[change.intent].push(change);
    }

    for (const [intent, intentChanges] of Object.entries(intentGroups)) {
      narrative += `**${intent}**: ${intentChanges.length} changes, `;
      narrative += `latest on ${intentChanges[intentChanges.length - 1].timestamp.toISOString().split('T')[0]}\n`;
    }

    return narrative;
  }

  private generateAlternativeApproaches(changes: any[]): Array<{
    description: string;
    pros: string[];
    cons: string[];
  }> {
    const alternatives: Array<{
      description: string;
      pros: string[];
      cons: string[];
    }> = [];

    // Analyze change patterns to suggest alternatives
    const refactorChanges = changes.filter(c => c.changeType === 'refactor');
    const featureChanges = changes.filter(c => c.intent.toLowerCase().includes('feature'));

    if (refactorChanges.length > 2) {
      alternatives.push({
        description: "Consider a more incremental refactoring approach",
        pros: [
          "Easier to test and validate each step",
          "Lower risk of breaking existing functionality",
          "Easier to rollback if issues arise"
        ],
        cons: [
          "Takes longer to complete the full refactoring",
          "May require more coordination across the team"
        ]
      });
    }

    if (featureChanges.length > 3) {
      alternatives.push({
        description: "Consider breaking large features into smaller, shippable increments",
        pros: [
          "Faster time to value for users",
          "Easier to gather feedback on each increment",
          "Lower risk of building the wrong thing"
        ],
        cons: [
          "May result in temporary inconsistencies in the UI",
          "Requires more careful planning of the feature roadmap"
        ]
      });
    }

    return alternatives;
  }

  // Helper methods

  private generateContextualInsights(evolution: any[], predictions: any): string[] {
    const insights: string[] = [];

    // Analyze evolution patterns
    if (evolution.length > 0) {
      const recentChanges = evolution.slice(-5); // Last 5 changes
      const changeTypes = recentChanges.map((c: any) => c.changeType);
      const mostCommonType = changeTypes.reduce((acc: Record<string, number>, type: string) => {
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {});

      const dominantType = Object.entries(mostCommonType).sort(([,a], [,b]) => (b as number) - (a as number))[0];
      if (dominantType) {
        insights.push(`Recent changes show a focus on ${dominantType[0]} (${dominantType[1]} changes)`);
      }
    }

    // Analyze predictions
    if (predictions && typeof predictions === 'object' && 'predictedChanges' in predictions) {
      const predChanges = (predictions as any).predictedChanges || [];
      const highProbChanges = predChanges.filter((p: any) => p.probability > 0.7);
      if (highProbChanges.length > 0) {
        insights.push(`High-confidence predictions suggest ${highProbChanges.length} upcoming changes`);
      }

      if (predictions.overallTrajectory) {
        insights.push(`Overall trajectory: ${predictions.overallTrajectory}`);
      }
    }

    return insights.length > 0 ? insights : ['No significant insights available'];
  }

  private async handleGenerationQuery(query: TCIQuery, context: any): Promise<TCIResponse> {
    // Evaluate operation for governance compliance
    const governanceResult = await this.safeguards.evaluateGovernance({
      type: 'code_generation',
      actor: 'TCI-System',
      files_affected: query.context?.filePaths || [],
      risk_factors: { confidence: 0.8 },
    }, {
      user_id: context.userId,
      workspace_id: context.workspaceId,
    });

    if (!governanceResult.approved && !governanceResult.requires_approval) {
      return {
        answer: 'Operation blocked by governance policy',
        confidence: 0,
        supportingEvidence: [],
      };
    }

    // Execute multi-agent workflow
    const workflowResult = await this.agentOrchestrator.executeWorkflow(
      query.question,
      context,
      ['Planner', 'Coder', 'UXReviewer', 'ComplianceAgent']
    );

    if (!workflowResult.success) {
      const errorDetails = workflowResult.errors.join('; ');
      return { answer: `Generation failed: ${errorDetails}`, confidence: 0, supportingEvidence: [] };
    }

    // Extract results from envelopes
    const latestEnvelope = workflowResult.envelopes[workflowResult.envelopes.length - 1];
    const answer = latestEnvelope?.outputs?.explanation || 'Code generation workflow completed.';

    return {
      answer,
      confidence: latestEnvelope?.intent?.confidence || 0.8,
      supportingEvidence: workflowResult.envelopes.map(envelope => ({
        type: 'intent' as const,
        data: { agent: envelope.actor, explanation: envelope.outputs.explanation, files: envelope.outputs.files },
        relevance: 0.9,
      })),
      suggestions: latestEnvelope?.outputs?.changes?.map((c: any) => `Consider ${c.change_type} in ${c.file_path}`),
    };
  }
}
export default TemporalCodeIntelligence;

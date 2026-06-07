import { TruthConsistencyInterface, TCIModelOutput, TCIAggregationResult } from './TruthConsistencyInterface';
import { ModelQuarantineLayer } from './ModelQuarantineLayer';
import { WeightedVotingSystem } from './ModelQuarantineLayer';
import { LatencyBreakerSystem } from './LatencyBreakerSystem';
import { SchemaValidationLayer } from './LatencyBreakerSystem';
import { ConsensusValidator } from './ConsensusValidator';
import { EmbeddingCache } from './EmbeddingCache';
import { MultiProviderEmbeddings } from './MultiProviderEmbeddings';
import { CalibrationScript, CalibrationDataset } from './CalibrationScript';
import { CalibrationExperimentRunner, CalibrationDatasetEntry } from './CalibrationExperimentRunner';
import { quarantineService } from './ModelQuarantineService';
import ClaudeBlindScoringService, { BlindScoringContext, ConsensusResult, ModelScore } from './ClaudeBlindScoringService';

// NEW: Import the learning engine components
import { intentPredictionService, PredictedIntent, IntentSignal } from './IntentPredictionService';
import { architecturalPlanService, ArchitecturalPlan } from './ArchitecturalPlanService';
import { consensusProtocol, ConsensusDecision } from './ConsensusProtocol';
import { councilDecisionRepository, CouncilCase } from './CouncilDecisionRepository';

// NEW: Import Kimi 2 Visual Service for frontend/animation tasks
import { kimiVisualService, KimiAnalysisOptions, VideoAnalysisRequest } from './KimiVisualService';
import { sharedVisualDataStore } from './SharedVisualDataStore';
import type { KimiVisualInsights } from '../../types/tci';

/**
 * TCI Orchestrator - Main coordinator for the Truth Consistency Interface
 * Integrates all TCI components for comprehensive multi-AI validation
 *
 * Model Ensemble:
 * - DeepSeek: Static code visual patterns (Layer 1)
 * - Kimi 2: Video/animation understanding for frontend (Layer 1b)
 * - Claude 4.5: Causal reasoning (Layer 2) + Implementation (Layer 6)
 * - GPT-5: Historical pattern matching (Layer 3)
 * - Grok: Symbolic logic verification (Layer 4)
 * - Gemini: Cross-model synthesis (Layer 5)
 */
export class TCIOrchestrator {
  private tci: TruthConsistencyInterface;
  private quarantineLayer: ModelQuarantineLayer;
  private votingSystem: WeightedVotingSystem;
  private latencyBreaker: LatencyBreakerSystem;
  private schemaValidator: SchemaValidationLayer;
  private consensusValidator: ConsensusValidator;
  private embeddingCache: EmbeddingCache;
  private multiProviderEmbeddings: MultiProviderEmbeddings;
  private claudeBlindScoring: ClaudeBlindScoringService;

  // Kimi 2 integration for frontend/animation tasks
  private kimiEnabled: boolean;

  constructor(
    tci: TruthConsistencyInterface,
    vectorDb: any,
    config?: {
      cacheOptions?: { maxSize?: number; defaultTTL?: number };
      embeddingConfig?: {
        openaiApiKey?: string;
        anthropicApiKey?: string;
        geminiApiKey?: string;
      };
      kimiConfig?: {
        enabled?: boolean;
        staleTTL?: number;
      };
    }
  ) {
    this.tci = tci;

    // Initialize cache and multi-provider embeddings
    this.embeddingCache = new EmbeddingCache(config?.cacheOptions);
    this.multiProviderEmbeddings = new MultiProviderEmbeddings(
      this.embeddingCache,
      config?.embeddingConfig
    );

    this.quarantineLayer = new ModelQuarantineLayer(tci);
    this.votingSystem = new WeightedVotingSystem();
    this.latencyBreaker = new LatencyBreakerSystem(tci);
    this.schemaValidator = new SchemaValidationLayer(tci);
    this.consensusValidator = new ConsensusValidator(tci, vectorDb);
    this.claudeBlindScoring = new ClaudeBlindScoringService();

    // Initialize Kimi 2 integration
    this.kimiEnabled = config?.kimiConfig?.enabled ?? kimiVisualService.isAvailable();
    if (this.kimiEnabled) {
      console.log('🎬 Kimi 2 Visual Service enabled for frontend/animation analysis');
    }
  }

  /**
   * Run calibration experiment for threshold validation
   */
  async runCalibrationExperiment(dataset: CalibrationDataset[]): Promise<{
    calibrationResult: any;
    csvData: string;
    recommendations: string[];
  }> {
    const calibrationScript = new CalibrationScript(this.multiProviderEmbeddings, dataset);
    const calibrationResult = await calibrationScript.runCalibration();
    const csvData = calibrationScript.exportToCSV(calibrationResult);

    return {
      calibrationResult,
      csvData,
      recommendations: calibrationResult.recommendations
    };
  }

  /**
   * Orchestrate multi-AI validation with Claude as blind judge
   * Claude judges code quality WITHOUT seeing other models' scores first
   * Only after Claude commits to its judgment are consensus results revealed
   *
   * @param codeGenerated - The generated code to validate
   * @param intent - The original user intent/prompt
   * @param otherModelOutputs - Outputs from GPT-5, Grok, etc. (excluding Claude)
   * @param projectId - Optional project ID for historical context
   * @param targetFile - Optional target file path
   * @param environment - Optional environment context
   */
  async orchestrateWithBlindJudge(
    codeGenerated: string,
    intent: string,
    otherModelOutputs: TCIModelOutput[],
    projectId?: string,
    targetFile?: string,
    environment?: string
  ): Promise<{
    consensusResult: ConsensusResult;
    claudeApproved: boolean;
    finalDecision: 'approved' | 'quarantined' | 'needs_review';
    performanceMetrics: {
      claudeJudgmentLatency: number;
      consensusCalculationLatency: number;
      totalLatency: number;
    };
  }> {
    const startTime = Date.now();

    try {
      console.log('🎯 Starting blind judge orchestration...');

      // 1. Extract historical context from TCI (NOT from other models' scores)
      const historicalContext = await this.extractHistoricalContext(projectId, targetFile);

      // 2. Build blind scoring context (Claude sees code + history, NOT other scores)
      const blindScoringContext: BlindScoringContext = {
        codeGenerated,
        intent,
        targetFile,
        environment,
        historicalContext,
        projectId
      };

      console.log('⚖️ Claude judging blindly (without seeing other model scores)...');

      // 3. PHASE 1: Claude's blind judgment (critical - must happen BEFORE seeing others)
      const claudeJudgmentStart = Date.now();
      const claudeJudgment = await this.claudeBlindScoring.blindJudgment(blindScoringContext);
      const claudeJudgmentLatency = Date.now() - claudeJudgmentStart;

      console.log(`⚖️ Claude's judgment: ${claudeJudgment.confidenceScore}% confidence (${claudeJudgment.approved ? 'APPROVED' : 'NEEDS REVIEW'})`);

      // 4. Extract scores from other models
      const otherScores: ModelScore[] = otherModelOutputs.map(output => ({
        model: output.model,
        score: output.confidence * 100, // Convert to 0-100 scale
        confidence: output.confidence,
        reasoning: (output.metadata as any)?.reasoning || 'No reasoning provided'
      }));

      console.log('📊 Revealing other model scores to determine consensus...');

      // 5. PHASE 2: Determine consensus (NOW Claude's score is compared with others)
      const consensusStart = Date.now();
      const consensusResult = await this.claudeBlindScoring.determineConsensus(
        claudeJudgment,
        otherScores,
        { code: codeGenerated, intent, targetFile, environment } as any
      );
      const consensusCalculationLatency = Date.now() - consensusStart;

      console.log(`📊 Consensus: ${consensusResult.finalDecision.toUpperCase()} (consensus score: ${consensusResult.consensusScore.toFixed(2)})`);

      // 6. Update quarantine status based on decision
      if (consensusResult.finalDecision === 'quarantined') {
        // Quarantine models with low scores
        for (const score of otherScores) {
          if (score.score < 50) {
            this.quarantineLayer.quarantineModel(
              score.model,
              `Low score: ${score.score.toFixed(1)}% - Failed Claude blind judgment consensus`
            );
          }
        }
      }

      // 7. Performance metrics
      const performanceMetrics = {
        claudeJudgmentLatency,
        consensusCalculationLatency,
        totalLatency: Date.now() - startTime
      };

      return {
        consensusResult,
        claudeApproved: claudeJudgment.approved,
        finalDecision: consensusResult.finalDecision,
        performanceMetrics
      };

    } catch (error: any) {
      console.error('❌ Blind judge orchestration error:', error);

      // Fallback: If Claude fails, reject automatically (safe default)
      return {
        consensusResult: {
          claudeJudgment: {
            confidenceScore: 0,
            reasoning: `Error during blind judgment: ${error.message}`,
            riskFactors: ['System error during validation'],
            qualityAssessment: {
              correctness: 0,
              security: 0,
              maintainability: 0,
              performance: 0
            },
            approved: false,
            historicalAlignment: 0
          },
          otherScores: [],
          finalDecision: 'quarantined',
          consensusScore: 0,
          explanation: `Blind judge orchestration failed: ${error.message}`
        },
        claudeApproved: false,
        finalDecision: 'quarantined',
        performanceMetrics: {
          claudeJudgmentLatency: 0,
          consensusCalculationLatency: 0,
          totalLatency: Date.now() - startTime
        }
      };
    }
  }

  /**
   * Extract historical context from TCI for blind scoring
   * Uses temporal graph data, past commits, and code patterns
   */
  private async extractHistoricalContext(projectId?: string, targetFile?: string): Promise<any> {
    if (!projectId) {
      return {
        similarChanges: [],
        commitHistory: [],
        codePatterns: [],
        projectStandards: {}
      };
    }

    // In a real implementation, this would query Neo4j for:
    // - Similar code changes in the past
    // - Commit history for the target file
    // - Common code patterns in the project
    // - Project coding standards and conventions

    // For now, return placeholder structure
    return {
      similarChanges: [
        // Would contain embeddings of similar past changes
      ],
      commitHistory: [
        // Would contain recent commits to targetFile
      ],
      codePatterns: [
        // Would contain common patterns detected in project
      ],
      projectStandards: {
        // Would contain project-specific coding standards
      }
    };
  }

  // ============================================================
  // Kimi 2 Integration for Frontend/Animation Tasks
  // ============================================================

  /**
   * Orchestrate frontend task validation with Kimi 2 visual understanding
   * Use this for:
   * - CSS animation validation
   * - UI interaction analysis
   * - Motion design verification
   * - Visual effects that other models struggle with
   *
   * @param codeGenerated - The frontend code (CSS, JS, React, etc.)
   * @param projectId - Project identifier
   * @param options - Analysis options
   */
  async orchestrateFrontendWithKimi(
    codeGenerated: string,
    projectId: string,
    options?: {
      sandboxId?: string;
      videoRecording?: {
        url?: string;
        buffer?: Buffer;
        duration?: number;
      };
      cssCode?: string;
      htmlContext?: string;
      focusAreas?: ('animations' | 'transitions' | 'interactions' | 'motion' | 'effects')[];
      includeOtherModels?: boolean; // Also run through other TCI models
    }
  ): Promise<{
    kimiInsights: KimiVisualInsights | null;
    visualContext: string;
    otherModelResults?: TCIAggregationResult;
    recommendations: string[];
    performanceMetrics: {
      kimiLatency: number;
      totalLatency: number;
    };
  }> {
    const startTime = Date.now();
    console.log('🎬 Starting frontend orchestration with Kimi 2...');

    let kimiInsights: KimiVisualInsights | null = null;
    let kimiLatency = 0;
    const recommendations: string[] = [];

    // Step 1: Run Kimi 2 analysis if enabled
    if (this.kimiEnabled) {
      const kimiStart = Date.now();

      try {
        // Video analysis (if recording provided)
        if (options?.videoRecording?.url || options?.videoRecording?.buffer) {
          console.log('  📹 Analyzing video recording with Kimi 2...');
          const videoResult = await kimiVisualService.analyzeVideoRecording(
            {
              videoUrl: options.videoRecording.url,
              videoBuffer: options.videoRecording.buffer,
              duration: options.videoRecording.duration
            },
            {
              projectId,
              sandboxId: options?.sandboxId,
              focusAreas: options?.focusAreas || ['animations', 'transitions', 'interactions'],
              tags: ['frontend', 'video-analysis']
            }
          );
          kimiInsights = videoResult.insights;
        }
        // CSS animation analysis (if CSS provided)
        else if (options?.cssCode) {
          console.log('  🎨 Analyzing CSS animations with Kimi 2...');
          const cssResult = await kimiVisualService.analyzeCSSAnimations(
            options.cssCode,
            options.htmlContext || codeGenerated,
            {
              projectId,
              sandboxId: options?.sandboxId,
              tags: ['frontend', 'css-animation']
            }
          );

          // Convert to KimiVisualInsights format
          kimiInsights = {
            cssAnimations: cssResult.cssAnimations,
            motionPatterns: cssResult.cssAnimations.map(anim => ({
              type: 'css-animation' as const,
              description: `${anim.name}: ${anim.properties?.join(', ') || 'transform'}`,
              timing: {
                duration: anim.duration,
                easing: anim.easing,
                delay: anim.delay || 0
              },
              elements: [anim.selector || 'unknown']
            })),
            uiInteractions: [],
            confidence: cssResult.confidence,
            videoSummary: `Analyzed ${cssResult.cssAnimations.length} CSS animations`
          };
        }
        // Code-only analysis
        else {
          console.log('  📝 Running Kimi 2 code-based visual inference...');
          // Extract any inline styles or animation patterns from code
          kimiInsights = await this.inferVisualPatternsFromCode(codeGenerated, projectId, options?.sandboxId);
        }

        kimiLatency = Date.now() - kimiStart;
        console.log(`  ✅ Kimi 2 analysis complete (${kimiLatency}ms)`);

        // Generate recommendations from Kimi insights
        if (kimiInsights) {
          recommendations.push(...this.generateKimiRecommendations(kimiInsights));
        }

      } catch (error: any) {
        console.error('  ❌ Kimi 2 analysis failed:', error.message);
        kimiLatency = Date.now() - kimiStart;
      }
    } else {
      console.log('  ⚠️ Kimi 2 not available, skipping visual analysis');
    }

    // Step 2: Get visual context for other models
    const visualContext = await sharedVisualDataStore.generateModelContext(projectId, options?.sandboxId);

    // Step 3: Optionally run through other TCI models with Kimi context
    let otherModelResults: TCIAggregationResult | undefined;
    if (options?.includeOtherModels && visualContext) {
      console.log('  🤖 Running through other TCI models with Kimi context...');

      // Inject Kimi's visual context into the task context for other models
      const enrichedContext = `
${visualContext}

=== Code to Analyze ===
${codeGenerated}
`;

      // Create mock outputs for demonstration (in real implementation, would call actual models)
      const mockOutputs: TCIModelOutput[] = [
        {
          model: 'claude',
          output: 'Analysis with Kimi visual context',
          confidence: 0.85,
          processingTime: 500,
          tokensUsed: 1000,
          metadata: {
            version: '1.0',
            contextHash: 'hash123',
            timestamp: new Date(),
            domain: 'frontend'
          }
        }
      ];

      // Note: In production, this would call the actual multi-model orchestration
      // with the enriched context that includes Kimi's visual insights
    }

    const totalLatency = Date.now() - startTime;
    console.log(`🎬 Frontend orchestration complete (${totalLatency}ms)`);

    return {
      kimiInsights,
      visualContext,
      otherModelResults,
      recommendations,
      performanceMetrics: {
        kimiLatency,
        totalLatency
      }
    };
  }

  /**
   * Analyze sandbox UI with Kimi 2 video capture
   * Captures screen recording of sandbox and analyzes UI interactions
   */
  async analyzeSandboxWithKimi(
    sandboxId: string,
    projectId: string,
    previewPort: number,
    options?: {
      recordDuration?: number; // Duration to record in seconds
      focusAreas?: ('animations' | 'transitions' | 'interactions' | 'motion' | 'effects')[];
      interactionScript?: {
        type: 'click' | 'scroll' | 'hover';
        target: string;
        delay?: number;
      }[];
    }
  ): Promise<{
    analysisId: string;
    insights: KimiVisualInsights;
    visualContext: string;
    recommendations: string[];
  }> {
    console.log(`🎬 Analyzing sandbox ${sandboxId} with Kimi 2...`);

    if (!this.kimiEnabled) {
      throw new Error('Kimi 2 service is not available. Please configure KIMI_API_KEY.');
    }

    // In a real implementation, this would:
    // 1. Start screen recording of the sandbox preview
    // 2. Execute the interaction script if provided
    // 3. Stop recording after duration
    // 4. Send video to Kimi for analysis

    // For now, analyze based on sandbox state
    const result = await kimiVisualService.analyzeVideoRecording(
      {
        videoUrl: `http://localhost:${previewPort}`, // Placeholder - would be actual video URL
        duration: options?.recordDuration || 10
      },
      {
        projectId,
        sandboxId,
        focusAreas: options?.focusAreas || ['animations', 'interactions'],
        tags: ['sandbox', 'live-preview']
      }
    );

    const visualContext = await sharedVisualDataStore.generateModelContext(projectId, sandboxId);
    const recommendations = this.generateKimiRecommendations(result.insights);

    return {
      analysisId: result.analysisId,
      insights: result.insights,
      visualContext,
      recommendations
    };
  }

  /**
   * Get Kimi's visual context for injection into other model prompts
   * Use this when you want Claude/GPT/Gemini to understand what Kimi observed
   */
  async getKimiContextForModels(projectId: string, sandboxId?: string): Promise<string> {
    return sharedVisualDataStore.generateModelContext(projectId, sandboxId);
  }

  /**
   * Check if frontend code has fresh Kimi analysis
   */
  async hasValidKimiAnalysis(projectId: string, sandboxId?: string): Promise<boolean> {
    const analyses = await sharedVisualDataStore.query({
      projectId,
      sandboxId,
      freshOnly: true,
      limit: 1
    });
    return analyses.length > 0;
  }

  /**
   * Infer visual patterns from code without video
   * Used when video recording is not available
   */
  private async inferVisualPatternsFromCode(
    code: string,
    projectId: string,
    sandboxId?: string
  ): Promise<KimiVisualInsights> {
    // Extract animation-related patterns from code
    const cssAnimationRegex = /animation:\s*([^;]+)/g;
    const transitionRegex = /transition:\s*([^;]+)/g;
    const keyframesRegex = /@keyframes\s+(\w+)/g;
    const transformRegex = /transform:\s*([^;]+)/g;

    const animations: any[] = [];
    const motionPatterns: any[] = [];

    // Find CSS animations
    let match;
    while ((match = cssAnimationRegex.exec(code)) !== null) {
      const parts = match[1].trim().split(/\s+/);
      animations.push({
        name: parts[0] || 'animation',
        duration: this.parseDuration(parts[1]) || 300,
        easing: parts[2] || 'ease',
        properties: ['animation']
      });
    }

    // Find transitions
    while ((match = transitionRegex.exec(code)) !== null) {
      const parts = match[1].trim().split(/\s+/);
      motionPatterns.push({
        type: 'transition' as const,
        description: `Transition on ${parts[0] || 'all'}`,
        timing: {
          duration: this.parseDuration(parts[1]) || 200,
          easing: parts[2] || 'ease',
          delay: 0
        },
        elements: ['inferred from code']
      });
    }

    // Find keyframes
    while ((match = keyframesRegex.exec(code)) !== null) {
      animations.push({
        name: match[1],
        duration: 500,
        easing: 'ease',
        properties: ['keyframe']
      });
    }

    const insights: KimiVisualInsights = {
      cssAnimations: animations,
      motionPatterns,
      uiInteractions: [],
      confidence: 0.6, // Lower confidence for code-only analysis
      videoSummary: `Inferred ${animations.length} animations and ${motionPatterns.length} transitions from code`
    };

    // Store for other models
    if (animations.length > 0 || motionPatterns.length > 0) {
      await sharedVisualDataStore.store(projectId, insights, {
        sandboxId,
        analysisType: 'animation',
        tags: ['code-inference', 'no-video']
      });
    }

    return insights;
  }

  /**
   * Parse CSS duration string to milliseconds
   */
  private parseDuration(duration: string | undefined): number {
    if (!duration) return 0;
    const match = duration.match(/^(\d+(?:\.\d+)?)(s|ms)?$/);
    if (!match) return 0;
    const value = parseFloat(match[1]);
    const unit = match[2] || 'ms';
    return unit === 's' ? value * 1000 : value;
  }

  /**
   * Generate recommendations based on Kimi's visual analysis
   */
  private generateKimiRecommendations(insights: KimiVisualInsights): string[] {
    const recommendations: string[] = [];

    // Check animation count
    if (insights.cssAnimations.length > 10) {
      recommendations.push('Consider reducing the number of simultaneous animations for better performance');
    }

    // Check for long animations
    const longAnimations = insights.cssAnimations.filter(a => a.duration > 1000);
    if (longAnimations.length > 0) {
      recommendations.push(`${longAnimations.length} animation(s) exceed 1 second - consider if users will wait`);
    }

    // Check easing variety
    const easings = new Set(insights.cssAnimations.map(a => a.easing));
    if (easings.size === 1 && insights.cssAnimations.length > 3) {
      recommendations.push('Using varied easing curves can improve visual hierarchy and user experience');
    }

    // Check for accessibility
    if (insights.motionPatterns.some(mp => mp.type === 'parallax')) {
      recommendations.push('Parallax effects detected - ensure prefers-reduced-motion is respected for accessibility');
    }

    // Check confidence
    if (insights.confidence < 0.7) {
      recommendations.push('Analysis confidence is low - consider providing a video recording for better accuracy');
    }

    return recommendations;
  }

  /**
   * Comprehensive multi-AI validation and aggregation
   */
  async orchestrateMultiAIValidation(
    outputs: TCIModelOutput[],
    taskContext: string,
    taskType: string,
    schema?: any,
    isTypeScript: boolean = false
  ): Promise<{
    finalResult: TCIAggregationResult;
    validationReport: {
      semanticConsistency: number;
      factualConsistency: number;
      temporalCoherence: number;
      schemaValidation: boolean;
      overallScore: number;
    };
    quarantineActions: Array<{
      model: string;
      action: 'quarantined' | 'released' | 'monitored';
      reason: string;
    }>;
    performanceMetrics: {
      totalLatency: number;
      modelLatencies: Record<string, number>;
      validationOverhead: number;
    };
  }> {
    const startTime = Date.now();

    try {
      // 1. Pre-validation: Check for quarantined models and adjust workload
      const quarantineActions = this.handleQuarantinePreCheck(outputs);

      // 2. Schema validation (if applicable)
      let schemaValidation: {
        isValid: boolean;
        errors: string[];
        warnings: string[];
        score: number;
      } = { isValid: true, errors: [], warnings: [], score: 1.0 };
      if (schema || isTypeScript) {
        const primaryOutput = outputs[0]?.output || '';
        schemaValidation = await this.schemaValidator.validateCompleteOutput(
          primaryOutput,
          schema,
          isTypeScript
        );
      }

      // 3. Core TCI validation with multi-provider embeddings
      const validationResult = await this.tci.validateMultiModelOutputs(outputs, taskContext, taskType);

      // 4. Enhanced consensus validation with cross-provider embeddings
      const crossProviderSimilarities = await this.multiProviderEmbeddings.calculateCrossProviderSimilarity(taskContext);
      console.log(`🔍 Cross-provider similarity: ${crossProviderSimilarities.averageSimilarity.toFixed(3)}`);

      // 5. Consensus validation (embedding-based)
      const consensusResult = await this.consensusValidator.validateConsensus(outputs, taskContext);

      // 6. Temporal coherence check
      const contextHistory = this.extractContextHistory(outputs);
      const temporalResult = await this.consensusValidator.validateTemporalCoherence(outputs, contextHistory);

      // 7. Update model reliability and quarantine status
      this.updateModelReliability(outputs, validationResult);

      // 8. Aggregate outputs using weighted voting with consensus detection
      const finalResult = await this.aggregateOutputsWithVoting(outputs, taskContext, taskType);

      // 9. Calculate comprehensive validation report
      const validationReport = {
        semanticConsistency: consensusResult.semanticConsensus,
        factualConsistency: consensusResult.factualConsensus,
        temporalCoherence: temporalResult.coherenceScore,
        schemaValidation: schemaValidation.isValid,
        overallScore: this.calculateOverallValidationScore([
          consensusResult.overallConsensus,
          validationResult.confidence,
          temporalResult.coherenceScore,
          schemaValidation.score,
          crossProviderSimilarities.averageSimilarity
        ])
      };

      // 10. Performance metrics
      const performanceMetrics = {
        totalLatency: Date.now() - startTime,
        modelLatencies: this.extractModelLatencies(outputs),
        validationOverhead: Date.now() - startTime - (outputs.reduce((sum, o) => sum + o.processingTime, 0))
      };

      return {
        finalResult,
        validationReport,
        quarantineActions,
        performanceMetrics
      };

    } catch (error: any) {
      console.error('TCI orchestration error:', error);

      // Fallback to basic aggregation on critical failure
      return {
        finalResult: await this.createFallbackResult(outputs, error.message),
        validationReport: {
          semanticConsistency: 0,
          factualConsistency: 0,
          temporalCoherence: 0,
          schemaValidation: false,
          overallScore: 0
        },
        quarantineActions: [],
        performanceMetrics: {
          totalLatency: Date.now() - startTime,
          modelLatencies: {},
          validationOverhead: 0
        }
      };
    }
  }

  /**
   * Get comprehensive TCI status and metrics
   */
  async getTCIStatus(): Promise<{
    systemHealth: {
      tciCore: boolean;
      quarantineLayer: boolean;
      votingSystem: boolean;
      latencyBreaker: boolean;
      schemaValidator: boolean;
      consensusValidator: boolean;
      embeddingCache: boolean;
      multiProviderEmbeddings: boolean;
    };
    modelMetrics: {
      reliabilityScores: Record<string, number>;
      quarantinedModels: string[];
      performanceStats: Record<string, any>;
    };
    validationMetrics: {
      totalValidations: number;
      averageConfidence: number;
      failureRate: number;
      averageLatency: number;
    };
    recommendations: string[];
  }> {
    const reliabilityScores = this.tci.getReliabilityScores();
    const quarantinedModels = Object.keys(reliabilityScores).filter(model =>
      this.quarantineLayer.isModelQuarantined(model)
    );

    // Get performance stats for each model
    const performanceStats: Record<string, any> = {};
    for (const model of Object.keys(reliabilityScores)) {
      performanceStats[model] = this.votingSystem.getModelPerformanceStats(model);
    }

    // Get cache statistics
    const cacheStats = this.embeddingCache.getStats();

    // Calculate validation metrics (would be tracked in real implementation)
    const validationMetrics = {
      totalValidations: 0, // Would be incremented during actual validations
      averageConfidence: 0.75, // Placeholder
      failureRate: 0.05, // Placeholder
      averageLatency: 1500 // Placeholder in ms
    };

    // Generate system recommendations
    const recommendations = this.generateSystemRecommendations(reliabilityScores, quarantinedModels, cacheStats);

    return {
      systemHealth: {
        tciCore: true,
        quarantineLayer: true,
        votingSystem: true,
        latencyBreaker: true,
        schemaValidator: true,
        consensusValidator: true,
        embeddingCache: true,
        multiProviderEmbeddings: true
      },
      modelMetrics: {
        reliabilityScores,
        quarantinedModels,
        performanceStats
      },
      validationMetrics,
      recommendations
    };
  }

  /**
   * Generate system-level recommendations including cache and embedding insights
   */
  private generateSystemRecommendations(
    reliabilityScores: Record<string, number>,
    quarantinedModels: string[],
    cacheStats: any
  ): string[] {
    const recommendations: string[] = [];

    // Cache performance recommendations
    if (cacheStats.hitRate < 50) {
      recommendations.push('💾 Low cache hit rate - consider increasing cache size or TTL');
    } else if (cacheStats.hitRate > 90) {
      recommendations.push('✅ Excellent cache performance - embeddings are being reused effectively');
    }

    // Model reliability recommendations
    const lowReliabilityModels = Object.entries(reliabilityScores)
      .filter(([, score]) => score < 0.3)
      .map(([model]) => model);

    if (lowReliabilityModels.length > 0) {
      recommendations.push(`🚨 Critical: Models ${lowReliabilityModels.join(', ')} have very low reliability (< 30%)`);
      recommendations.push('Consider removing these models from production rotation');
    }

    // Quarantine recommendations
    if (quarantinedModels.length > 2) {
      recommendations.push(`⚠️ Warning: ${quarantinedModels.length} models currently quarantined`);
      recommendations.push('This may impact system capacity - consider model retraining');
    }

    return recommendations;
  }

  /**
   * Handle quarantine checks before validation
   */
  private handleQuarantinePreCheck(outputs: TCIModelOutput[]): Array<{
    model: string;
    action: 'quarantined' | 'released' | 'monitored';
    reason: string;
  }> {
    const actions: Array<{
      model: string;
      action: 'quarantined' | 'released' | 'monitored';
      reason: string;
    }> = [];

    for (const output of outputs) {
      const model = output.model;
      const reliability = this.tci.getReliabilityScores()[model] || 1.0;

      if (this.quarantineLayer.isModelQuarantined(model)) {
        // Already quarantined
        actions.push({
          model,
          action: 'monitored',
          reason: 'Model currently under quarantine monitoring'
        });
      } else if (reliability < 0.5) {
        // Low reliability - trigger quarantine
        this.quarantineLayer.quarantineModel(model, `Low reliability: ${(reliability * 100).toFixed(1)}%`);
        actions.push({
          model,
          action: 'quarantined',
          reason: `Reliability below threshold: ${(reliability * 100).toFixed(1)}%`
        });
      }
    }

    return actions;
  }

  /**
   * Update model reliability based on validation results
   */
  private updateModelReliability(outputs: TCIModelOutput[], validationResult: any): void {
    for (const output of outputs) {
      // Record failure if validation failed
      if (!validationResult.isValid) {
        this.quarantineLayer.recordFailure(output.model, 'Validation failed', output.confidence);
      }

      this.tci.updateModelReliability(output.model, validationResult);

      // Update voting system performance tracking
      const domain = output.metadata.domain || 'general';
      this.votingSystem.updatePerformance(output.model, domain, output.confidence);
    }
  }

  /**
   * Extract context history from outputs for temporal validation
   */
  private extractContextHistory(outputs: TCIModelOutput[]): string[] {
    return outputs.map(output => output.metadata.contextHash);
  }

  /**
   * Extract model latencies from outputs
   */
  private extractModelLatencies(outputs: TCIModelOutput[]): Record<string, number> {
    return outputs.reduce((acc, output) => {
      acc[output.model] = output.processingTime;
      return acc;
    }, {} as Record<string, number>);
  }

  /**
   * Calculate overall validation score from multiple metrics
   */
  private calculateOverallValidationScore(metrics: number[]): number {
    if (metrics.length === 0) return 0;

    const validMetrics = metrics.filter(m => !isNaN(m) && isFinite(m));
    if (validMetrics.length === 0) return 0;

    return validMetrics.reduce((a, b) => a + b, 0) / validMetrics.length;
  }

  /**
   * Aggregate outputs using weighted voting with consensus detection
   * Implements the specification requirement for multi-model voting
   */
  private async aggregateOutputsWithVoting(
    outputs: TCIModelOutput[],
    taskContext: string,
    taskType: string
  ): Promise<TCIAggregationResult> {
    if (outputs.length === 0) {
      throw new Error('No outputs to aggregate');
    }

    // 1. Calculate weighted votes for each model
    const votes = this.votingSystem.calculateWeightedVote(outputs, taskType);

    // 2. Detect consensus level
    const topVote = votes[0];
    const secondVote = votes[1] || { model: '', weightedScore: 0 };
    const consensusGap = topVote.weightedScore - secondVote.weightedScore;

    console.log(`🗳️ Voting results: Top: ${topVote.model} (${topVote.weightedScore.toFixed(3)}), ` +
                `Second: ${secondVote.model} (${secondVote.weightedScore.toFixed(3)}), ` +
                `Consensus gap: ${consensusGap.toFixed(3)}`);

    // 3. Low agreement detection (gap < 0.2 triggers quarantine)
    if (consensusGap < 0.2 && votes.length > 1) {
      console.warn(`⚠️ LOW CONSENSUS detected (gap: ${consensusGap.toFixed(3)}) - Quarantining models`);

      // Quarantine all models involved for producing conflicting outputs
      for (const output of outputs) {
        this.quarantineLayer.recordFailure(
          output.model,
          `Low consensus - conflicting outputs (gap: ${consensusGap.toFixed(3)})`,
          output.confidence
        );
      }

      // Return best-effort result with quarantine flag
      const winner = outputs.find(o => o.model === topVote.model)!;

      return {
        finalOutput: winner.output,
        consensus: consensusGap,
        modelContributions: outputs.map(o => ({
          model: o.model,
          weight: votes.find(v => v.model === o.model)?.weightedScore || 0,
          contribution: o.output,
          confidence: o.confidence
        })),
        validationPassed: false,
        executionTime: outputs.reduce((sum, o) => sum + o.processingTime, 0),
        version: `quarantined-${Date.now()}`
      };
    }

    // 4. High confidence consensus - return winner
    const winner = outputs.find(o => o.model === topVote.model);
    if (!winner) {
      throw new Error(`Winner model ${topVote.model} not found in outputs`);
    }

    console.log(`✅ CONSENSUS REACHED: ${topVote.model} with gap ${consensusGap.toFixed(3)}`);

    return {
      finalOutput: winner.output,
      consensus: consensusGap,
      modelContributions: outputs.map(o => ({
        model: o.model,
        weight: votes.find(v => v.model === o.model)?.weightedScore || 0,
        contribution: o.output,
        confidence: o.confidence
      })),
      validationPassed: true,
      executionTime: outputs.reduce((sum, o) => sum + o.processingTime, 0),
      version: `consensus-${Date.now()}`
    };
  }

  /**
   * Create fallback result when TCI fails
   */
  private async createFallbackResult(outputs: TCIModelOutput[], errorMessage: string): Promise<TCIAggregationResult> {
    // Simple fallback: return highest confidence output
    const bestOutput = outputs.reduce((best, current) =>
      current.confidence > best.confidence ? current : best
    );

    return {
      finalOutput: bestOutput.output,
      consensus: 0,
      modelContributions: outputs.map(output => ({
        model: output.model,
        weight: output.confidence,
        contribution: output.output,
        confidence: output.confidence
      })),
      validationPassed: false,
      executionTime: 0,
      version: `fallback-${Date.now()}`
    };
  }

  // ============================================================
  // NEW: Self-Healing Learning Engine Methods
  // TCI is the brain that learns from mistakes, predicts intent,
  // and orchestrates the AI council for architectural decisions
  // ============================================================

  /**
   * MAIN ENTRY POINT: Intelligent orchestration with intent prediction
   *
   * Flow:
   * 1. Collect signals → Predict intent
   * 2. Check for similar past decisions
   * 3. Generate architectural plan if needed
   * 4. AI council votes on approach
   * 5. Store decision for future learning
   * 6. Execute with self-healing
   */
  async orchestrateWithLearning(
    userId: string,
    projectId: string,
    signals: IntentSignal[],
    projectContext: any
  ): Promise<{
    intent: PredictedIntent;
    plan?: ArchitecturalPlan;
    recommendation: string;
    warnings: string[];
    councilDecision?: ConsensusDecision;
    similarCases: CouncilCase[];
  }> {
    console.log('🧠 TCI Learning Engine: Starting intelligent orchestration...');
    const startTime = Date.now();

    try {
      // Step 1: Predict developer intent from signals
      console.log('🔮 Step 1: Predicting developer intent...');
      const intent = await intentPredictionService.predictIntent(signals, projectContext);
      console.log(`   Predicted goal: "${intent.predictedGoal}" (confidence: ${(intent.confidence * 100).toFixed(0)}%)`);

      // Step 2: Check for similar past decisions (case-based reasoning)
      console.log('📚 Step 2: Searching knowledge base for similar cases...');
      const similarCases = await councilDecisionRepository.findSimilarCases(
        intent.predictedGoal,
        projectContext,
        5
      );
      console.log(`   Found ${similarCases.length} similar past cases`);

      // Step 3: Get recommendation based on past decisions
      console.log('💡 Step 3: Generating recommendations from past learnings...');
      const caseRecommendation = await councilDecisionRepository.getRecommendation(
        intent.predictedGoal,
        projectContext
      );

      // Step 4: Generate architectural plan for significant changes
      let plan: ArchitecturalPlan | undefined;
      let councilDecision: ConsensusDecision | undefined;

      if (this.requiresArchitecturalPlan(intent)) {
        console.log('🏗️ Step 4: Generating architectural plan...');
        plan = await architecturalPlanService.generatePlan(
          intent.predictedGoal,
          projectContext,
          userId
        );

        // Step 5: Submit plan to AI council for voting
        console.log('🗳️ Step 5: AI Council voting on architectural plan...');
        const councilVote = await architecturalPlanService.submitForVoting(plan.id);

        // Record the consensus decision
        councilDecision = await consensusProtocol.recordDecision({
          decisionType: 'architectural_plan',
          subject: intent.predictedGoal,
          decision: `Approved plan: ${plan.id}`,
          votes: councilVote.votes.map(v => ({
            model: v.model,
            vote: v.planId === councilVote.winner ? 'approve' : 'reject',
            confidence: v.confidence,
            reasoning: v.reasoning,
            timestamp: new Date()
          })),
          consensusLevel: councilVote.consensus,
          quorumMet: councilVote.votes.length >= 3,
          enforcementRules: [],
          createdBy: 'ai_council'
        });

        console.log(`   Council decision: ${councilVote.consensus >= 0.6 ? 'APPROVED' : 'NEEDS_REVIEW'} (consensus: ${(councilVote.consensus * 100).toFixed(0)}%)`);

        // Store case for future learning
        await councilDecisionRepository.storeCase({
          scenario: {
            type: 'architectural_choice',
            description: intent.predictedGoal,
            context: projectContext
          },
          options: plan.alternatives.map(alt => ({
            id: alt.id,
            description: alt.summary,
            pros: alt.pros,
            cons: alt.cons,
            riskLevel: alt.estimatedComplexity === 'high' ? 'high' : alt.estimatedComplexity === 'medium' ? 'medium' : 'low'
          })),
          decision: {
            chosenOptionId: plan.id,
            reasoning: councilVote.reasoning,
            votingResults: {
              votes: councilVote.votes.map(v => ({
                model: v.model,
                optionId: v.planId,
                confidence: v.confidence,
                reasoning: v.reasoning
              })),
              consensus: councilVote.consensus,
              unanimousVote: councilVote.votes.every(v => v.planId === councilVote.winner)
            }
          },
          tags: ['architectural', intent.predictedGoal.split(' ')[0].toLowerCase()]
        });
      }

      const totalTime = Date.now() - startTime;
      console.log(`✅ TCI Learning Engine complete (${totalTime}ms)`);

      return {
        intent,
        plan,
        recommendation: caseRecommendation.recommendation,
        warnings: intent.warnings,
        councilDecision,
        similarCases: similarCases.map(sc => sc.case)
      };

    } catch (error: any) {
      console.error('❌ TCI Learning Engine error:', error);
      throw error;
    }
  }

  /**
   * Record outcome of a prediction/decision for continuous learning
   * This is how TCI learns from its mistakes
   */
  async recordOutcome(
    intentId: string,
    caseId: string | undefined,
    outcome: 'success' | 'partial' | 'failure',
    lessonsLearned: string[]
  ): Promise<void> {
    console.log(`📝 Recording outcome: ${outcome} for intent ${intentId}`);

    // Update intent prediction accuracy
    await intentPredictionService.recordIntentOutcome(intentId, outcome === 'failure' ? 'failed' : outcome, lessonsLearned);

    // Update case outcome if we stored a case
    if (caseId) {
      await councilDecisionRepository.recordOutcome(caseId, {
        result: outcome,
        lessonsLearned,
        recordedAt: new Date()
      });
    }

    console.log(`   Lessons recorded: ${lessonsLearned.length} items added to knowledge base`);
  }

  /**
   * Proactive self-healing: Detect and fix errors automatically
   * Called when an error is detected during preview/execution
   */
  async selfHeal(
    error: Error,
    codeContext: string,
    projectContext: any,
    userId: string
  ): Promise<{
    fixed: boolean;
    solution: string;
    explanation: string;
    similarPastFixes: CouncilCase[];
  }> {
    console.log('🔧 TCI Self-Healing: Analyzing error...');

    // Create error signal
    const errorSignal: IntentSignal = {
      type: 'error_pattern',
      content: `${error.name}: ${error.message}`,
      weight: 1.0,
      timestamp: new Date()
    };

    // Find similar past errors that were fixed
    const similarFixes = await councilDecisionRepository.findSimilarCases(
      `Fix error: ${error.message}`,
      { errorType: error.name, codeContext },
      5
    );

    // Filter to only successful fixes
    const successfulFixes = similarFixes.filter(
      sf => sf.case.outcome?.result === 'success'
    );

    if (successfulFixes.length > 0) {
      // We've seen this before and know how to fix it!
      const bestFix = successfulFixes[0];
      console.log(`   Found ${successfulFixes.length} successful past fixes for similar errors`);

      return {
        fixed: true,
        solution: bestFix.case.decision.reasoning,
        explanation: `TCI has seen this error ${successfulFixes.length} times before. Based on past successes, the recommended fix is: ${bestFix.case.decision.reasoning}`,
        similarPastFixes: successfulFixes.map(sf => sf.case)
      };
    }

    // Novel error - need to figure it out
    console.log('   Novel error - generating new solution...');

    // Predict intent behind the error
    const intent = await intentPredictionService.predictIntent(
      [errorSignal],
      { ...projectContext, errorContext: true }
    );

    return {
      fixed: false,
      solution: intent.recommendedApproach,
      explanation: `TCI hasn't seen this exact error before. Based on similar patterns, the recommended approach is: ${intent.recommendedApproach}`,
      similarPastFixes: []
    };
  }

  /**
   * Check if a proposed action conflicts with existing council decisions
   */
  async checkDecisionConflict(
    subject: string,
    proposedAction: string
  ): Promise<{
    allowed: boolean;
    conflictingDecisions: ConsensusDecision[];
    recommendation: string;
  }> {
    const result = await consensusProtocol.checkConsensus(subject, proposedAction);

    let recommendation = 'Action is allowed - no conflicts with existing decisions.';
    if (!result.allowed) {
      const conflicts = result.conflictingDecisions.map(d => d.decision).join('; ');
      recommendation = `Action conflicts with existing council decisions: ${conflicts}. Override requires human approval.`;
    }

    return {
      ...result,
      recommendation
    };
  }

  /**
   * Get TCI learning statistics
   */
  async getLearningStats(): Promise<{
    totalPredictions: number;
    predictionAccuracy: number;
    totalCases: number;
    caseSuccessRate: number;
    activeDecisions: number;
    patternsLearned: number;
  }> {
    const intentStats = (intentPredictionService as any).getStatistics?.() || { totalPredictions: 0, accuracy: 0 };
    const caseStats = await councilDecisionRepository.getStatistics();
    const activeDecisions = await consensusProtocol.getActiveDecisions();

    return {
      totalPredictions: intentStats.totalPredictions,
      predictionAccuracy: intentStats.accuracy,
      totalCases: caseStats.totalCases,
      caseSuccessRate: caseStats.successRate,
      activeDecisions: activeDecisions.length,
      patternsLearned: caseStats.totalCases // Each case is a learned pattern
    };
  }

  /**
   * Determine if a predicted intent requires architectural planning
   */
  private requiresArchitecturalPlan(intent: PredictedIntent): boolean {
    // Require architectural plan for:
    // - Low confidence predictions (need more validation)
    // - Complex goals (multiple components)
    // - Security-related changes
    // - Database schema changes

    const complexKeywords = ['authentication', 'database', 'schema', 'api', 'security', 'migration', 'refactor'];
    const goalLower = intent.predictedGoal.toLowerCase();

    const isComplex = complexKeywords.some(kw => goalLower.includes(kw));
    const isLowConfidence = intent.confidence < 0.7;

    return isComplex || isLowConfidence;
  }
}

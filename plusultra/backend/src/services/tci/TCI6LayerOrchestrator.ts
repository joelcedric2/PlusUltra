/**
 * TCI 6-Layer Orchestrator - Main Coordinator for Multi-Model Code Analysis
 *
 * Coordinates all 6 TCI layers:
 * - Layer 1: Visual Pattern Recognition (DeepSeek Vision)
 * - Layer 2: Causal Chain Analysis (Claude 4.5)
 * - Layer 3: Historical Pattern Matching (GPT-5)
 * - Layer 4: Symbolic Logic Verification (Grok)
 * - Layer 5: Cross-Model Synthesis (Gemini)
 * - Layer 6: Implementation (Claude 4.5)
 *
 * Execution Strategy:
 * - Layers 1-4 run in PARALLEL (independent analyses)
 * - Layer 5 runs AFTER 1-4 complete (needs all inputs for synthesis)
 * - Layer 6 runs AFTER 5 completes (needs synthesis for implementation)
 *
 * Modes:
 * - FULL: All 6 layers ($0.90, 20-30s, 93-95% accuracy)
 * - QUICK: Layers 1 + 3 only ($0.30, 6-8s, ~75% accuracy)
 */

import type {
  TCIReport,
  ProjectContext,
  VisualInsights,
  CausalChain,
  HistoricalInsights,
  LogicVerification,
  TCIVerdict,
  ImplementationResult,
} from '../../types/tci';

import { visualCodeAnalysisService } from './VisualCodeAnalysisService';
import { causalChainAnalysisService } from './CausalChainAnalysisService';
import { historicalPatternService } from './HistoricalPatternService';
import { symbolicVerificationService } from './SymbolicVerificationService';
import { crossModelSynthesisService } from './CrossModelSynthesisService';
import { claudeImplementationService } from './ClaudeImplementationService';
import { projectContextAnalyzer } from './ProjectContextAnalyzer';

export type TCIMode = 'full' | 'quick';

export interface TCI6Options {
  mode: TCIMode;
  filePath?: string;
  language: string;
  proposedChange?: string; // For causal analysis
  implementFixes?: boolean; // Whether to run Layer 6 implementation
}

export class TCI6LayerOrchestrator {
  /**
   * Run complete TCI analysis (all 6 layers)
   */
  async analyze(code: string, options: TCI6Options): Promise<TCIReport> {
    const startTime = Date.now();
    console.log('\n╔════════════════════════════════════════════════════════════╗');
    console.log(`║  TCI 6-Layer Analysis (${options.mode.toUpperCase()} MODE)${' '.repeat(29 - options.mode.length)}║`);
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    // 1. Extract project context
    const context = await this.extractContext(code, options);

    // 2. Run analysis based on mode
    if (options.mode === 'quick') {
      return this.runQuickAnalysis(code, context, startTime);
    } else {
      return this.runFullAnalysis(code, context, options, startTime);
    }
  }

  /**
   * Quick mode: Layers 1 + 3 only
   * Cost: $0.30, Time: 6-8s, Accuracy: ~75%
   */
  private async runQuickAnalysis(
    code: string,
    context: ProjectContext,
    startTime: number
  ): Promise<TCIReport> {
    const timings = {
      visual: 0,
      causal: 0,
      historical: 0,
      logic: 0,
      synthesis: 0,
      implementation: 0,
    };

    // Run Layer 1 (Visual) and Layer 3 (Historical) in parallel
    const [visual, historical] = await Promise.all([
      this.runLayer1(code, context, timings),
      this.runLayer3(code, context, timings),
    ]);

    // Create simple verdict for quick mode
    const verdict = this.createQuickVerdict(visual, historical);

    const totalTime = Date.now() - startTime;
    console.log(`\n✅ TCI Quick Analysis Complete (${totalTime}ms total)\n`);

    return {
      visual,
      causal: null,
      historical,
      logic: this.createEmptyLogicVerification(),
      verdict,
      implementation: this.createEmptyImplementation(code),
      timings,
    };
  }

  /**
   * Full mode: All 6 layers
   * Cost: $0.90, Time: 20-30s, Accuracy: 93-95%
   */
  private async runFullAnalysis(
    code: string,
    context: ProjectContext,
    options: TCI6Options,
    startTime: number
  ): Promise<TCIReport> {
    const timings = {
      visual: 0,
      causal: 0,
      historical: 0,
      logic: 0,
      synthesis: 0,
      implementation: 0,
    };

    // PHASE 1: Run layers 1-4 in parallel (independent analyses)
    console.log('🔄 Phase 1: Running parallel analyses (Layers 1-4)...\n');

    const [visual, causal, historical, logic] = await Promise.all([
      this.runLayer1(code, context, timings),
      this.runLayer2(code, context, options, timings),
      this.runLayer3(code, context, timings),
      this.runLayer4(code, context, timings),
    ]);

    // PHASE 2: Run layer 5 (synthesis) - needs results from 1-4
    console.log('\n🔄 Phase 2: Synthesizing insights (Layer 5)...\n');
    const verdict = await this.runLayer5(visual, causal, historical, logic, timings);

    // PHASE 3: Run layer 6 (implementation) - needs synthesis
    console.log('\n🔄 Phase 3: Implementing fixes (Layer 6)...\n');
    const implementation = options.implementFixes
      ? await this.runLayer6(code, visual, causal, historical, logic, verdict, timings)
      : this.createEmptyImplementation(code);

    const totalTime = Date.now() - startTime;
    console.log(`\n✅ TCI Full Analysis Complete (${totalTime}ms total)\n`);
    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log(`║  Final Verdict: ${verdict.verdict}${' '.repeat(44 - verdict.verdict.length)}║`);
    console.log(`║  Overall Risk: ${verdict.synthesizedRisk.overall}/10${' '.repeat(40)}║`);
    console.log(`║  Confidence: ${(verdict.confidence * 100).toFixed(0)}%${' '.repeat(45)}║`);
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    return {
      visual,
      causal,
      historical,
      logic,
      verdict,
      implementation,
      timings,
    };
  }

  /**
   * Layer 1: Visual Pattern Recognition
   */
  private async runLayer1(
    code: string,
    context: ProjectContext,
    timings: TCIReport['timings']
  ): Promise<VisualInsights> {
    const start = Date.now();
    const result = await visualCodeAnalysisService.analyzeCode(code, context);
    timings.visual = Date.now() - start;
    return result;
  }

  /**
   * Layer 2: Causal Chain Analysis
   */
  private async runLayer2(
    code: string,
    context: ProjectContext,
    options: TCI6Options,
    timings: TCIReport['timings']
  ): Promise<CausalChain | null> {
    const start = Date.now();
    const result = await causalChainAnalysisService.analyzeImpact(
      code,
      options.proposedChange || null,
      context
    );
    timings.causal = Date.now() - start;
    return result;
  }

  /**
   * Layer 3: Historical Pattern Matching
   */
  private async runLayer3(
    code: string,
    context: ProjectContext,
    timings: TCIReport['timings']
  ): Promise<HistoricalInsights> {
    const start = Date.now();
    const result = await historicalPatternService.analyzePatterns(code, context);
    timings.historical = Date.now() - start;
    return result;
  }

  /**
   * Layer 4: Symbolic Logic Verification
   */
  private async runLayer4(
    code: string,
    context: ProjectContext,
    timings: TCIReport['timings']
  ): Promise<LogicVerification> {
    const start = Date.now();
    const result = await symbolicVerificationService.verifyLogic(code, context);
    timings.logic = Date.now() - start;
    return result;
  }

  /**
   * Layer 5: Cross-Model Synthesis
   */
  private async runLayer5(
    visual: VisualInsights,
    causal: CausalChain | null,
    historical: HistoricalInsights,
    logic: LogicVerification,
    timings: TCIReport['timings']
  ): Promise<TCIVerdict> {
    const start = Date.now();
    const result = await crossModelSynthesisService.synthesize(
      visual,
      causal,
      historical,
      logic
    );
    timings.synthesis = Date.now() - start;
    return result;
  }

  /**
   * Layer 6: Implementation
   */
  private async runLayer6(
    code: string,
    visual: VisualInsights,
    causal: CausalChain | null,
    historical: HistoricalInsights,
    logic: LogicVerification,
    verdict: TCIVerdict,
    timings: TCIReport['timings']
  ): Promise<ImplementationResult> {
    const start = Date.now();
    const result = await claudeImplementationService.implement(
      code,
      visual,
      causal,
      historical,
      logic,
      verdict
    );
    timings.implementation = Date.now() - start;
    return result;
  }

  /**
   * Extract project context from code
   */
  private async extractContext(
    code: string,
    options: TCI6Options
  ): Promise<ProjectContext> {
    if (options.filePath) {
      return projectContextAnalyzer.analyzeContext(
        code,
        options.filePath,
        options.language
      );
    } else {
      return projectContextAnalyzer.quickContext(code, options.language);
    }
  }

  /**
   * Create simple verdict for quick mode
   */
  private createQuickVerdict(
    visual: VisualInsights,
    historical: HistoricalInsights
  ): TCIVerdict {
    const visualRisk = 10 - visual.overallCodeHealth;
    const historicalRisk = historical.riskAssessment.vulnerabilities.length > 0 ? 8.0 : 5.0;
    const overall = (visualRisk + historicalRisk) / 2;

    return {
      agreements: [
        `Visual health: ${visual.overallCodeHealth}/10`,
        `Pattern match: ${historical.thisCodeMatchesPattern}`,
      ],
      conflicts: [],
      conflictResolutions: [],
      synthesizedRisk: {
        visual: visualRisk,
        causal: 0,
        historical: historicalRisk,
        logical: 0,
        overall,
      },
      actionableSteps: [],
      verdict: overall > 7 ? 'REJECT' : overall > 5 ? 'REVIEW' : 'SHIP',
      confidence: (visual.confidence + historical.confidence) / 2,
    };
  }

  /**
   * Create empty logic verification (for quick mode)
   */
  private createEmptyLogicVerification(): LogicVerification {
    return {
      verifications: [],
      overallCorrectness: 0.5,
      recommendation: 'NOT_ANALYZED',
    };
  }

  /**
   * Create empty implementation (when not requested)
   */
  private createEmptyImplementation(code: string): ImplementationResult {
    return {
      originalCode: code,
      improvedCode: code,
      changes: [],
      implementedFixes: [],
      explanation: 'Implementation not requested',
      confidence: 0,
      remainingIssues: [],
    };
  }

  /**
   * Get cost estimate for analysis
   */
  getCostEstimate(mode: TCIMode): number {
    return mode === 'quick' ? 0.30 : 0.90;
  }

  /**
   * Get estimated time for analysis
   */
  getTimeEstimate(mode: TCIMode): string {
    return mode === 'quick' ? '6-8 seconds' : '20-30 seconds';
  }
}

export const tci6LayerOrchestrator = new TCI6LayerOrchestrator();

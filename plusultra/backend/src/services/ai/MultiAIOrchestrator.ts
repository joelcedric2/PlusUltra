import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import { TokenEconomyService } from '../billing/TokenEconomyService';
import { modelVotingTelemetry } from './ModelVotingTelemetry';
import { confidenceEngine, type ModelResponse as ConfidenceModelResponse } from './ConfidenceEngine';
import { modelQuarantine } from './ModelQuarantineService';
import { logConfidenceResult } from '../../routes/ai/confidence-quarantine';
import { metaPromptEngine, type EnhancedPrompt } from './MetaPromptEngine';
import { turnBasedReviewEngine, type TurnBasedReviewResult } from './TurnBasedReviewEngine';

/**
 * Multi-AI Orchestrator
 * Coordinates multiple AI models (Claude 4.5 Sonnet, GPT-5, Gemini 2.5 Pro, Grok, DeepSeek OCR) to work together
 * Implements AI voting/consensus and tracks total token consumption
 *
 * Token Tracking:
 * - 100 PlusUltra tokens = All AI calls for a complete task
 * - Each task may trigger multiple AI models
 * - All tokens from all models are summed and tracked together
 *
 * Model Versions (2025):
 * - Claude 4.5 Sonnet (claude-sonnet-4-5-20250929)
 * - GPT-5 (gpt-5)
 * - Gemini 2.5 Pro (gemini-2.5-pro)
 * - Grok (grok-2)
 * - DeepSeek OCR (deepseek-ocr-v1)
 */

export interface AIModel {
  name: 'claude' | 'gpt5' | 'gemini' | 'grok' | 'deepseek';
  priority: number; // 1-5, where 1 is highest
  specialization: 'reasoning' | 'coding' | 'creative' | 'analysis' | 'ocr';
}

export interface OrchestratedRequest {
  userId: string;
  task: string;
  context?: string;
  taskType: 'code_generation' | 'app_design' | 'project_planning' | 'debugging' | 'optimization';
  requireConsensus?: boolean; // If true, all models vote
  models?: AIModel['name'][]; // Specific models to use, or all 4
  maxTokensPerModel?: number;
  useNewOrchestration?: boolean; // Enable meta-prompting + turn-based review (default: true)
}

export interface AIResponse {
  model: AIModel['name'];
  response: string;
  tokensUsed: {
    input: number;
    output: number;
    total: number;
  };
  selfReportedConfidence?: number; // Model's own confidence assessment (0-1)
  responseTime: number; // milliseconds
  reasoning?: string;
}

export interface OrchestratedResponse {
  finalResponse: string;
  allResponses: AIResponse[];
  totalTokensUsed: {
    claude: number;
    gpt5: number;
    gemini: number;
    grok: number;
    deepseek: number;
    total: number; // Sum of all
  };
  plusultraTokensConsumed: number;
  consensusReached: boolean;
  confidence: {
    overall: number; // 0-1
    consensus: number; // 0-1
    quality: number; // 0-1
    decision: 'ship' | 'review' | 'reject';
    reasoning: string;
    winner: AIModel['name'];
    modelScores: Array<{
      model: string;
      overall: number;
      quality: number;
      selfConfidence: number;
    }>;
  };
  votingResults?: {
    winner: AIModel['name'];
    votes: Record<AIModel['name'], number>;
    agreement: number; // 0-1
  };
  taskCompleted: boolean;
  // New fields for meta-prompting + turn-based review
  enhancedPrompt?: EnhancedPrompt;
  reviewHistory?: TurnBasedReviewResult;
  systemMetrics?: {
    metaPromptTimeMs?: number;
    generationTimeMs?: number;
    reviewTimeMs?: number;
    totalTimeMs: number;
    phaseCosts?: {
      metaPrompt: number;
      generation: number;
      review: number;
    };
  };
  usedNewOrchestration?: boolean;
}

export class MultiAIOrchestrator {
  private anthropic: Anthropic;
  private openai: OpenAI;
  private gemini: GoogleGenerativeAI;
  private grokApiKey: string;
  private tokenService: TokenEconomyService;

  // AI model configurations
  private modelConfigs: Record<AIModel['name'], AIModel> = {
    claude: {
      name: 'claude',
      priority: 1,
      specialization: 'reasoning', // Best at complex reasoning
    },
    gpt5: {
      name: 'gpt5',
      priority: 2,
      specialization: 'creative', // Best at creative solutions
    },
    gemini: {
      name: 'gemini',
      priority: 3,
      specialization: 'analysis', // Best at data analysis
    },
    grok: {
      name: 'grok',
      priority: 4,
      specialization: 'coding', // Best at code generation
    },
    deepseek: {
      name: 'deepseek',
      priority: 5,
      specialization: 'ocr', // Best at optical character recognition and vision
    },
  };

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || '',
    });

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    });

    this.gemini = new GoogleGenerativeAI(
      process.env.GOOGLE_API_KEY || ''
    );

    this.grokApiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY || '';

    this.tokenService = new TokenEconomyService();
  }

  /**
   * Orchestrate multiple AI models to complete a task
   * This is the main entry point for multi-AI workflows
   *
   * New System (useNewOrchestration=true, default):
   * 1. Meta-Prompting: Expand vague request into detailed specifications
   * 2. Generation: All models generate code using enhanced prompt
   * 3. Ground Truth Validation: Filter invalid responses
   * 4. Best Candidate Selection: Pick winner using confidence scoring
   * 5. Turn-Based Review: Sequential refinement by remaining models
   *
   * Old System (useNewOrchestration=false):
   * - Parallel generation + voting consensus
   */
  async orchestrate(request: OrchestratedRequest): Promise<OrchestratedResponse> {
    const useNewSystem = request.useNewOrchestration !== false; // Default: true

    if (useNewSystem) {
      return this.orchestrateV2(request);
    } else {
      return this.orchestrateV1(request);
    }
  }

  /**
   * V2 Orchestration: Meta-Prompting + Turn-Based Review
   */
  private async orchestrateV2(request: OrchestratedRequest): Promise<OrchestratedResponse> {
    console.log(`🎯 [V2] Orchestrating task: ${request.taskType} (Meta-Prompting + Turn-Based Review)`);
    const orchestrationStartTime = Date.now();

    // Pre-check token availability
    const estimatedTokens = this.estimateTaskTokens(request.taskType);
    const canConsume = await this.tokenService.canConsumeTokens(
      request.userId,
      estimatedTokens
    );

    if (!canConsume.allowed) {
      throw new Error(canConsume.reason || 'Insufficient tokens for this task');
    }

    // Select models based on task type
    let selectedModels = request.models || this.selectModelsForTask(request.taskType);

    // Filter out quarantined models
    const allModels: AIModel['name'][] = ['claude', 'gpt5', 'gemini', 'grok', 'deepseek'];
    const availableModels = modelQuarantine.getAvailableModels(allModels);
    selectedModels = selectedModels.filter(m => availableModels.includes(m));

    if (selectedModels.length === 0) {
      throw new Error('No available models - all selected models are quarantined');
    }

    console.log(`🤖 Using models: ${selectedModels.join(', ')} (${allModels.length - availableModels.length} quarantined)`);

    // ============================================================
    // PHASE 0: META-PROMPTING
    // ============================================================
    console.log(`🔍 [Phase 0] Meta-prompting user request...`);
    const metaPromptStartTime = Date.now();

    let enhancedPrompt: EnhancedPrompt;

    // Skip meta-prompting for trivial requests
    if (metaPromptEngine.shouldSkipMetaPrompt(request.task)) {
      console.log(`  ⏭️  Skipping meta-prompt (trivial request)`);
      enhancedPrompt = {
        originalRequest: request.task,
        expandedRequirements: {
          security: [],
          edgeCases: [],
          accessibility: [],
          performance: [],
          suggestedLibraries: [],
          errorHandling: [],
          testing: [],
        },
        criticalQuestions: [],
        enhancedPrompt: request.task,
        estimatedComplexity: 'TRIVIAL',
        recommendedApproach: 'Direct implementation',
        warnings: [],
      };
    } else {
      enhancedPrompt = await metaPromptEngine.expandPrompt(request.task, request.context);
    }

    const metaPromptTimeMs = Date.now() - metaPromptStartTime;
    console.log(`  ✅ Meta-prompt complete (${metaPromptTimeMs}ms, complexity: ${enhancedPrompt.estimatedComplexity})`);

    // ============================================================
    // PHASE 1: GENERATION (All models in parallel)
    // ============================================================
    console.log(`🚀 [Phase 1] Generating code with ${selectedModels.length} models...`);
    const generationStartTime = Date.now();

    // Use enhanced prompt for generation
    const enhancedRequest = {
      ...request,
      task: enhancedPrompt.enhancedPrompt,
      context: request.context,
    };

    const responses = await this.callAllModels(enhancedRequest, selectedModels);
    const generationTimeMs = Date.now() - generationStartTime;
    console.log(`  ✅ Generated ${responses.length} responses (${generationTimeMs}ms)`);

    // ============================================================
    // PHASE 2: GROUND TRUTH VALIDATION
    // ============================================================
    console.log(`🔍 [Phase 2] Validating responses...`);

    // Basic validation: filter responses with syntax errors
    const validResponses = responses.filter(r => {
      const hasContent = r.response.trim().length > 0;
      const noErrors = !r.response.toLowerCase().includes('error:') &&
                       !r.response.toLowerCase().includes('syntaxerror');
      return hasContent && noErrors;
    });

    console.log(`  ✅ ${validResponses.length}/${responses.length} responses passed validation`);

    if (validResponses.length === 0) {
      throw new Error('All model responses failed validation');
    }

    // ============================================================
    // PHASE 3: BEST CANDIDATE SELECTION
    // ============================================================
    console.log(`🏆 [Phase 3] Selecting best candidate...`);

    // Calculate confidence for all valid responses
    const confidenceResponses: ConfidenceModelResponse[] = validResponses.map(r => ({
      model: r.model,
      content: r.response,
      selfReportedConfidence: r.selfReportedConfidence,
      metadata: {
        tokensUsed: r.tokensUsed.total,
        responseTime: r.responseTime,
        timestamp: new Date(),
      },
    }));

    const confidenceScore = await confidenceEngine.calculateConfidence(confidenceResponses);

    // Winner is the model with highest overall score
    const bestCandidate = validResponses.find(r => r.model === confidenceScore.winner);

    if (!bestCandidate) {
      throw new Error('Failed to select best candidate');
    }

    console.log(`  ✅ Best candidate: ${confidenceScore.winner} (overall: ${confidenceScore.overall.toFixed(2)})`);

    // ============================================================
    // PHASE 4: TURN-BASED REVIEW
    // ============================================================
    console.log(`🔄 [Phase 4] Turn-based review...`);
    const reviewStartTime = Date.now();

    // Get remaining models for review (exclude winner)
    const reviewerModels = validResponses
      .filter(r => r.model !== bestCandidate.model)
      .map(r => r.model);

    let reviewHistory: TurnBasedReviewResult | undefined;

    if (reviewerModels.length > 0) {
      reviewHistory = await turnBasedReviewEngine.review(
        bestCandidate.response,
        enhancedPrompt.enhancedPrompt,
        reviewerModels
      );

      const reviewTimeMs = Date.now() - reviewStartTime;
      console.log(`  ✅ Review complete: ${reviewHistory.finalVerdict} (${reviewTimeMs}ms)`);
      console.log(`     Issues found: ${reviewHistory.issuesFound}, Fixed: ${reviewHistory.issuesFixed}`);
      console.log(`     Early exit: ${reviewHistory.earlyExit}, Reviews: ${reviewHistory.totalReviews}`);
    } else {
      console.log(`  ⏭️  Skipping review (no other models available)`);
    }

    const reviewTimeMs = reviewHistory ? Date.now() - reviewStartTime : 0;

    // ============================================================
    // PHASE 5: FINALIZATION
    // ============================================================

    // Use reviewed code if available, otherwise use best candidate
    const finalResponse = reviewHistory?.finalCode || bestCandidate.response;

    // Calculate total tokens used
    const totalTokensUsed = {
      claude: 0,
      gpt5: 0,
      gemini: 0,
      grok: 0,
      deepseek: 0,
      total: 0,
    };

    for (const response of responses) {
      totalTokensUsed[response.model] += response.tokensUsed.total;
      totalTokensUsed.total += response.tokensUsed.total;
    }

    // Add review tokens
    if (reviewHistory) {
      totalTokensUsed.total += reviewHistory.totalTokensUsed;
    }

    // Convert to PlusUltra tokens
    const plusultraTokensConsumed = this.tokenService.convertToPlusultraTokens(
      totalTokensUsed.total
    );

    // Record token consumption
    await this.tokenService.consumeTokens({
      userId: request.userId,
      apiTokens: totalTokensUsed.total,
      source: 'claude',
      description: `Multi-AI orchestration V2: ${request.taskType}`,
      metadata: {
        taskType: request.taskType,
        modelsUsed: selectedModels,
        tokenBreakdown: totalTokensUsed,
        enhancedComplexity: enhancedPrompt.estimatedComplexity,
        reviewVerdict: reviewHistory?.finalVerdict,
        issuesFixed: reviewHistory?.issuesFixed,
      },
    });

    // Record performance for quarantine evaluation
    modelQuarantine.recordPerformance(
      confidenceScore.modelScores,
      confidenceScore.consensus
    );

    // Log confidence result for admin dashboard
    logConfidenceResult({
      taskType: request.taskType,
      confidence: {
        overall: confidenceScore.overall,
        consensus: confidenceScore.consensus,
        quality: confidenceScore.quality,
        decision: confidenceScore.decision,
        reasoning: confidenceScore.reasoning,
        winner: confidenceScore.winner,
        modelScores: confidenceScore.modelScores,
      },
    });

    const totalTimeMs = Date.now() - orchestrationStartTime;

    console.log(`✅ [V2] Orchestration complete (${totalTimeMs}ms)`);
    console.log(`   Meta-Prompt: ${metaPromptTimeMs}ms | Generation: ${generationTimeMs}ms | Review: ${reviewTimeMs}ms`);

    return {
      finalResponse,
      allResponses: responses,
      totalTokensUsed,
      plusultraTokensConsumed,
      consensusReached: true, // V2 always reaches consensus via review
      confidence: {
        overall: confidenceScore.overall,
        consensus: confidenceScore.consensus,
        quality: confidenceScore.quality,
        decision: confidenceScore.decision,
        reasoning: confidenceScore.reasoning,
        winner: confidenceScore.winner,
        modelScores: confidenceScore.modelScores,
      },
      taskCompleted: true,
      enhancedPrompt,
      reviewHistory,
      systemMetrics: {
        metaPromptTimeMs,
        generationTimeMs,
        reviewTimeMs,
        totalTimeMs,
        phaseCosts: {
          metaPrompt: 0, // GPT-4 cost for meta-prompting (tracked separately)
          generation: totalTokensUsed.total - (reviewHistory?.totalTokensUsed || 0),
          review: reviewHistory?.totalTokensUsed || 0,
        },
      },
      usedNewOrchestration: true,
    };
  }

  /**
   * V1 Orchestration: Original parallel voting system
   */
  private async orchestrateV1(request: OrchestratedRequest): Promise<OrchestratedResponse> {
    console.log(`🎯 [V1] Orchestrating task: ${request.taskType} (Parallel Voting)`);

    // Pre-check token availability
    const estimatedTokens = this.estimateTaskTokens(request.taskType);
    const canConsume = await this.tokenService.canConsumeTokens(
      request.userId,
      estimatedTokens
    );

    if (!canConsume.allowed) {
      throw new Error(canConsume.reason || 'Insufficient tokens for this task');
    }

    // Select models based on task type
    let selectedModels = request.models || this.selectModelsForTask(request.taskType);

    // Filter out quarantined models
    const allModels: AIModel['name'][] = ['claude', 'gpt5', 'gemini', 'grok', 'deepseek'];
    const availableModels = modelQuarantine.getAvailableModels(allModels);
    selectedModels = selectedModels.filter(m => availableModels.includes(m));

    if (selectedModels.length === 0) {
      throw new Error('No available models - all selected models are quarantined');
    }

    console.log(`🤖 Using models: ${selectedModels.join(', ')} (${allModels.length - availableModels.length} quarantined)`);

    // Call all selected models in parallel
    const responses = await this.callAllModels(request, selectedModels);

    // Calculate total tokens used
    const totalTokensUsed = {
      claude: 0,
      gpt5: 0,
      gemini: 0,
      grok: 0,
      deepseek: 0,
      total: 0,
    };

    for (const response of responses) {
      totalTokensUsed[response.model] += response.tokensUsed.total;
      totalTokensUsed.total += response.tokensUsed.total;
    }

    // Convert to PlusUltra tokens
    const plusultraTokensConsumed = this.tokenService.convertToPlusultraTokens(
      totalTokensUsed.total
    );

    // Determine final response
    let finalResponse: string;
    let consensusReached = false;
    let votingResults;

    if (request.requireConsensus && responses.length > 1) {
      // Run voting algorithm
      const voteResult = await this.runVoting(responses, request);
      finalResponse = voteResult.finalResponse;
      consensusReached = voteResult.consensusReached;
      votingResults = voteResult.votingResults;
    } else if (responses.length === 1) {
      // Single model response
      finalResponse = responses[0].response;
      consensusReached = true;
    } else {
      // Use highest priority model's response
      const priorityResponse = this.selectByPriority(responses);
      finalResponse = priorityResponse.response;
      consensusReached = false;
    }

    // Record token consumption
    await this.tokenService.consumeTokens({
      userId: request.userId,
      apiTokens: totalTokensUsed.total,
      source: 'claude', // Primary model for tracking
      description: `Multi-AI orchestration V1: ${request.taskType}`,
      metadata: {
        taskType: request.taskType,
        modelsUsed: selectedModels,
        tokenBreakdown: totalTokensUsed,
        consensusReached,
      },
    });

    // Calculate confidence using ConfidenceEngine
    const confidenceResponses: ConfidenceModelResponse[] = responses.map(r => ({
      model: r.model,
      content: r.response,
      selfReportedConfidence: r.selfReportedConfidence,
      metadata: {
        tokensUsed: r.tokensUsed.total,
        responseTime: r.responseTime,
        timestamp: new Date(),
      },
    }));

    const confidenceScore = await confidenceEngine.calculateConfidence(confidenceResponses);

    // Record performance for quarantine evaluation
    modelQuarantine.recordPerformance(
      confidenceScore.modelScores,
      confidenceScore.consensus
    );

    // Log confidence result for admin dashboard
    logConfidenceResult({
      taskType: request.taskType,
      confidence: {
        overall: confidenceScore.overall,
        consensus: confidenceScore.consensus,
        quality: confidenceScore.quality,
        decision: confidenceScore.decision,
        reasoning: confidenceScore.reasoning,
        winner: confidenceScore.winner,
        modelScores: confidenceScore.modelScores,
      },
    });

    // Record voting telemetry for analytics
    if (votingResults) {
      await modelVotingTelemetry.recordVote({
        taskType: request.taskType,
        winner: votingResults.winner,
        votes: votingResults.votes,
        agreement: votingResults.agreement,
        userId: request.userId,
        consensusReached,
      });
    }

    console.log(`✅ [V1] Confidence Analysis: Overall=${confidenceScore.overall.toFixed(2)}, Decision=${confidenceScore.decision}`);

    return {
      finalResponse,
      allResponses: responses,
      totalTokensUsed,
      plusultraTokensConsumed,
      consensusReached,
      confidence: {
        overall: confidenceScore.overall,
        consensus: confidenceScore.consensus,
        quality: confidenceScore.quality,
        decision: confidenceScore.decision,
        reasoning: confidenceScore.reasoning,
        winner: confidenceScore.winner,
        modelScores: confidenceScore.modelScores,
      },
      votingResults,
      taskCompleted: true,
      usedNewOrchestration: false,
    };
  }

  /**
   * Select best models for task type
   */
  private selectModelsForTask(taskType: OrchestratedRequest['taskType']): AIModel['name'][] {
    switch (taskType) {
      case 'code_generation':
        return ['grok', 'claude', 'gpt5']; // Grok leads, Claude reasons, GPT-5 reviews

      case 'app_design':
        return ['gpt5', 'claude', 'gemini']; // GPT-5 creative, Claude reasons, Gemini analyzes

      case 'project_planning':
        return ['claude', 'gpt5', 'gemini', 'grok']; // All 4 for comprehensive planning

      case 'debugging':
        return ['grok', 'claude']; // Grok codes, Claude reasons

      case 'optimization':
        return ['gemini', 'grok', 'claude']; // Gemini analyzes, Grok optimizes, Claude validates

      default:
        return ['claude', 'gpt5', 'gemini', 'grok']; // All 4 by default
    }
  }

  /**
   * Estimate token consumption for task type
   */
  private estimateTaskTokens(taskType: OrchestratedRequest['taskType']): number {
    // Estimates in API tokens
    const estimates: Record<OrchestratedRequest['taskType'], number> = {
      code_generation: 15_000_000, // 15M tokens (~15 PT)
      app_design: 10_000_000, // 10M tokens (~10 PT)
      project_planning: 20_000_000, // 20M tokens (~20 PT)
      debugging: 5_000_000, // 5M tokens (~5 PT)
      optimization: 8_000_000, // 8M tokens (~8 PT)
    };

    return estimates[taskType] || 10_000_000;
  }

  /**
   * Call all selected models in parallel
   */
  private async callAllModels(
    request: OrchestratedRequest,
    models: AIModel['name'][]
  ): Promise<AIResponse[]> {
    const promises = models.map((model) => this.callModel(model, request));
    const responses = await Promise.allSettled(promises);

    // Filter successful responses
    return responses
      .filter((result): result is PromiseFulfilledResult<AIResponse> =>
        result.status === 'fulfilled'
      )
      .map((result) => result.value);
  }

  /**
   * Call specific AI model
   */
  private async callModel(
    model: AIModel['name'],
    request: OrchestratedRequest
  ): Promise<AIResponse> {
    const prompt = this.buildPrompt(request, model);

    switch (model) {
      case 'claude':
        return await this.callClaude(prompt, request.maxTokensPerModel);

      case 'gpt5':
        return await this.callGPT5(prompt, request.maxTokensPerModel);

      case 'gemini':
        return await this.callGemini(prompt, request.maxTokensPerModel);

      case 'grok':
        return await this.callGrok(prompt, request.maxTokensPerModel);

      case 'deepseek':
        return await this.callDeepSeek(prompt, request.maxTokensPerModel);

      default:
        throw new Error(`Unknown model: ${model}`);
    }
  }

  /**
   * Build prompt for specific model
   */
  private buildPrompt(request: OrchestratedRequest, model: AIModel['name']): string {
    const basePrompt = request.context
      ? `${request.context}\n\nTask: ${request.task}`
      : request.task;

    // Add model-specific instructions
    const modelInstructions: Record<AIModel['name'], string> = {
      claude: 'Provide a well-reasoned, logical response with clear explanations.',
      gpt5: 'Provide a creative, innovative solution with multiple perspectives.',
      gemini: 'Provide a data-driven analysis with metrics and insights.',
      grok: 'Provide high-quality code with best practices and comprehensive documentation.',
      deepseek: 'Provide OCR analysis, image understanding, and visual content recognition.',
    };

    // Request confidence self-assessment from model
    const confidenceRequest = `\n\nIMPORTANT: At the end of your response, include your confidence assessment in this exact format:
Confidence: X.XX (where X.XX is a number between 0.00 and 1.00 representing your confidence in this response)`;

    return `${basePrompt}\n\n${modelInstructions[model]}${confidenceRequest}`;
  }

  /**
   * Call Claude 4.5 Sonnet
   */
  private async callClaude(prompt: string, maxTokens = 4096): Promise<AIResponse> {
    const startTime = Date.now();

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: maxTokens,
      messages: [{ role: 'user', content: prompt }],
    });

    const responseTime = Date.now() - startTime;

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    // Extract self-reported confidence from response
    const selfReportedConfidence = confidenceEngine.extractSelfReportedConfidence(content.text);

    return {
      model: 'claude',
      response: content.text,
      tokensUsed: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        total: response.usage.input_tokens + response.usage.output_tokens,
      },
      selfReportedConfidence,
      responseTime,
    };
  }

  /**
   * Call GPT-5
   */
  private async callGPT5(prompt: string, maxTokens = 4096): Promise<AIResponse> {
    const startTime = Date.now();

    const response = await this.openai.chat.completions.create({
      model: 'gpt-5',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: maxTokens,
    });

    const responseTime = Date.now() - startTime;
    const content = response.choices[0]?.message?.content || '';
    const selfReportedConfidence = confidenceEngine.extractSelfReportedConfidence(content);

    return {
      model: 'gpt5',
      response: content,
      tokensUsed: {
        input: response.usage?.prompt_tokens || 0,
        output: response.usage?.completion_tokens || 0,
        total: response.usage?.total_tokens || 0,
      },
      selfReportedConfidence,
      responseTime,
    };
  }

  /**
   * Call Gemini 2.5 Pro
   */
  private async callGemini(prompt: string, maxTokens = 4096): Promise<AIResponse> {
    const startTime = Date.now();

    const model = this.gemini.getGenerativeModel({ model: 'gemini-2.5-pro' });

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: maxTokens,
      },
    });

    const responseTime = Date.now() - startTime;
    const text = result.response.text();
    const inputTokens = this.estimateTokens(prompt);
    const outputTokens = this.estimateTokens(text);
    const selfReportedConfidence = confidenceEngine.extractSelfReportedConfidence(text);

    return {
      model: 'gemini',
      response: text,
      tokensUsed: {
        input: inputTokens,
        output: outputTokens,
        total: inputTokens + outputTokens,
      },
      selfReportedConfidence,
      responseTime,
    };
  }

  /**
   * Call Grok (xAI API)
   */
  private async callGrok(prompt: string, maxTokens = 4096): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      const response = await axios.post(
        'https://api.x.ai/v1/chat/completions',
        {
          model: 'grok-2',
          messages: [
            {
              role: 'system',
              content: 'You are Grok, an AI assistant specialized in complex logical reasoning and high-quality code generation.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: maxTokens,
          temperature: 0.7,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.grokApiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const responseTime = Date.now() - startTime;
      const text = response.data.choices[0]?.message?.content || '';
      const usage = response.data.usage;
      const selfReportedConfidence = confidenceEngine.extractSelfReportedConfidence(text);

      return {
        model: 'grok',
        response: text,
        tokensUsed: {
          input: usage?.prompt_tokens || 0,
          output: usage?.completion_tokens || 0,
          total: usage?.total_tokens || 0,
        },
        selfReportedConfidence,
        responseTime,
      };
    } catch (error) {
      console.error('Grok API call failed:', error);
      throw new Error(`Grok API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Call DeepSeek OCR
   */
  private async callDeepSeek(prompt: string, maxTokens = 4096): Promise<AIResponse> {
    const startTime = Date.now();

    try {
      // DeepSeek API endpoint (adjust based on their actual API)
      const response = await axios.post(
        'https://api.deepseek.com/v1/chat/completions',
        {
          model: 'deepseek-ocr-v1',
          messages: [
            {
              role: 'system',
              content: 'You are DeepSeek, an AI assistant specialized in optical character recognition, image understanding, and visual content analysis.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: maxTokens,
          temperature: 0.5, // Lower temperature for OCR accuracy
        },
        {
          headers: {
            'Authorization': `Bearer ${process.env.DEEPSEEK_API_KEY || ''}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const responseTime = Date.now() - startTime;
      const text = response.data.choices[0]?.message?.content || '';
      const usage = response.data.usage;
      const selfReportedConfidence = confidenceEngine.extractSelfReportedConfidence(text);

      return {
        model: 'deepseek',
        response: text,
        tokensUsed: {
          input: usage?.prompt_tokens || 0,
          output: usage?.completion_tokens || 0,
          total: usage?.total_tokens || 0,
        },
        selfReportedConfidence,
        responseTime,
      };
    } catch (error) {
      console.error('DeepSeek API call failed:', error);
      throw new Error(`DeepSeek API error: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Run voting algorithm to determine consensus
   */
  private async runVoting(
    responses: AIResponse[],
    request: OrchestratedRequest
  ): Promise<{
    finalResponse: string;
    consensusReached: boolean;
    votingResults: {
      winner: AIModel['name'];
      votes: Record<AIModel['name'], number>;
      agreement: number;
    };
  }> {
    // Use Claude as the "judge" to evaluate all responses
    const votingPrompt = `You are a neutral judge evaluating multiple AI responses to the same task.

Task: ${request.task}

Responses:
${responses.map((r, i) => `\n${i + 1}. ${r.model.toUpperCase()}: ${r.response.substring(0, 500)}...`).join('\n')}

Evaluate each response based on:
1. Correctness and accuracy
2. Completeness
3. Code quality (if applicable)
4. Clarity and explanation

Provide your evaluation in JSON format:
{
  "winner": "model_name",
  "votes": { "claude": 0-10, "gpt5": 0-10, "gemini": 0-10, "grok": 0-10, "deepseek": 0-10 },
  "reasoning": "explanation",
  "agreement": 0.0-1.0
}`;

    const judgeResponse = await this.callClaude(votingPrompt, 2000);

    try {
      // Extract JSON from response
      const jsonMatch = judgeResponse.response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        // Fallback: use highest priority model
        return this.fallbackVoting(responses);
      }

      const evaluation = JSON.parse(jsonMatch[0]);

      // Find winner's response
      const winnerResponse = responses.find(
        (r) => r.model === evaluation.winner
      );

      if (!winnerResponse) {
        return this.fallbackVoting(responses);
      }

      return {
        finalResponse: winnerResponse.response,
        consensusReached: evaluation.agreement >= 0.7,
        votingResults: {
          winner: evaluation.winner,
          votes: evaluation.votes,
          agreement: evaluation.agreement,
        },
      };
    } catch (error) {
      console.error('Voting evaluation failed:', error);
      return this.fallbackVoting(responses);
    }
  }

  /**
   * Fallback voting: use highest priority model
   */
  private fallbackVoting(responses: AIResponse[]): {
    finalResponse: string;
    consensusReached: boolean;
    votingResults: {
      winner: AIModel['name'];
      votes: Record<AIModel['name'], number>;
      agreement: number;
    };
  } {
    const winner = this.selectByPriority(responses);

    const votes: Record<AIModel['name'], number> = {
      claude: 0,
      gpt5: 0,
      gemini: 0,
      grok: 0,
      deepseek: 0,
    };
    votes[winner.model] = 10;

    return {
      finalResponse: winner.response,
      consensusReached: false,
      votingResults: {
        winner: winner.model,
        votes,
        agreement: 0.5,
      },
    };
  }

  /**
   * Select response by model priority
   */
  private selectByPriority(responses: AIResponse[]): AIResponse {
    responses.sort((a, b) => {
      return this.modelConfigs[a.model].priority - this.modelConfigs[b.model].priority;
    });

    return responses[0];
  }

  /**
   * Estimate tokens (rough approximation)
   */
  private estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Project Manager AI - Complete app generation workflow
   * This is the main entry point for building entire apps
   */
  async manageProject(data: {
    userId: string;
    projectDescription: string;
    platform: 'ios' | 'android' | 'web' | 'all';
    features?: string[];
  }): Promise<{
    success: boolean;
    projectPlan: string;
    codeGenerated: string;
    assetsGenerated: string[];
    totalTokensUsed: number;
    plusultraTokensConsumed: number;
    stages: {
      planning: OrchestratedResponse;
      design: OrchestratedResponse;
      coding: OrchestratedResponse;
      review: OrchestratedResponse;
    };
  }> {
    console.log('🚀 Starting Project Manager AI workflow...');

    // Stage 1: Project Planning (All 4 AIs)
    console.log('📋 Stage 1: Project Planning');
    const planningResult = await this.orchestrate({
      userId: data.userId,
      task: `Create a comprehensive project plan for: ${data.projectDescription}`,
      context: `Platform: ${data.platform}\nFeatures: ${data.features?.join(', ')}`,
      taskType: 'project_planning',
      requireConsensus: true,
      models: ['claude', 'gpt5', 'gemini', 'grok'],
    });

    // Stage 2: App Design (GPT-5, Claude, Gemini)
    console.log('🎨 Stage 2: App Design');
    const designResult = await this.orchestrate({
      userId: data.userId,
      task: `Design the UI/UX and architecture based on this plan:\n${planningResult.finalResponse}`,
      taskType: 'app_design',
      requireConsensus: true,
      models: ['gpt5', 'claude', 'gemini'],
    });

    // Stage 3: Code Generation (Grok, Claude, GPT-5)
    console.log('💻 Stage 3: Code Generation');
    const codingResult = await this.orchestrate({
      userId: data.userId,
      task: `Generate production-ready code based on:\nPlan: ${planningResult.finalResponse}\nDesign: ${designResult.finalResponse}`,
      taskType: 'code_generation',
      requireConsensus: true,
      models: ['grok', 'claude', 'gpt5'],
    });

    // Stage 4: Code Review & Optimization (All 4 AIs)
    console.log('🔍 Stage 4: Code Review');
    const reviewResult = await this.orchestrate({
      userId: data.userId,
      task: `Review and optimize this code:\n${codingResult.finalResponse}`,
      taskType: 'optimization',
      requireConsensus: true,
      models: ['claude', 'grok', 'gemini', 'gpt5'],
    });

    // Calculate total tokens used
    const totalTokensUsed =
      planningResult.totalTokensUsed.total +
      designResult.totalTokensUsed.total +
      codingResult.totalTokensUsed.total +
      reviewResult.totalTokensUsed.total;

    const plusultraTokensConsumed =
      planningResult.plusultraTokensConsumed +
      designResult.plusultraTokensConsumed +
      codingResult.plusultraTokensConsumed +
      reviewResult.plusultraTokensConsumed;

    console.log(`✅ Project completed! Total PlusUltra tokens: ${plusultraTokensConsumed}`);

    return {
      success: true,
      projectPlan: planningResult.finalResponse,
      codeGenerated: reviewResult.finalResponse, // Use reviewed/optimized code
      assetsGenerated: [], // To be integrated with Canva service
      totalTokensUsed,
      plusultraTokensConsumed,
      stages: {
        planning: planningResult,
        design: designResult,
        coding: codingResult,
        review: reviewResult,
      },
    };
  }
}

export default MultiAIOrchestrator;

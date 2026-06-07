import { TCIEnvelopeService, TCIEnvelope, TCIContext } from './TCIEnvelopeService';
import { CloudflareR2Storage } from '../storage/CloudflareR2Storage';

/**
 * Enhanced Multi-Agent Orchestration System for TCI
 * Production-ready implementation with proper error handling and API integration points
 */

/**
 * Agent execution result
 */
export interface AgentExecutionResult {
  success: boolean;
  envelope?: TCIEnvelope;
  error?: string;
  executionTime: number;
  tokensUsed?: number;
  model?: string;
}

/**
 * Workflow execution result
 */
export interface WorkflowExecutionResult {
  envelopes: TCIEnvelope[];
  totalExecutionTime: number;
  totalTokensUsed: number;
  success: boolean;
  errors: string[];
}

/**
 * Agent types and their responsibilities
 */
export type TCIAgent =
  | 'Planner'
  | 'Coder'
  | 'UXReviewer'
  | 'DebugAgent'
  | 'ComplianceAgent'
  | 'ProductManager'
  | 'SafetyAgent'
  | 'PatchVerifier';

/**
 * Agent capabilities and model preferences
 */
interface AgentConfig {
  model: 'gpt-5' | 'claude-4.5' | 'gemini-2.5' | 'starcoder';
  capabilities: string[];
  cost: number; // Token cost multiplier
  contextWindow: number;
  specializations: string[];
  fallbackModels?: string[]; // Fallback models if primary unavailable
  promptInstruction: string; // New: Agent-specific instruction
}

/**
 * Enhanced Agent registry with configurations
 */
const AGENT_CONFIGS: Record<TCIAgent, AgentConfig> = {
  Planner: {
    model: 'gemini-2.5',
    capabilities: ['architecture', 'planning', 'dependency-analysis', 'roadmap'],
    cost: 1.2,
    contextWindow: 128000,
    specializations: ['high-level-design', 'stack-choice', 'roadmap', 'system-architecture'],
    fallbackModels: ['gpt-5', 'claude-4.5'],
    promptInstruction:
      'Analyze the user request and create a comprehensive development plan. Consider: architecture patterns, technology stack, dependencies, and implementation phases.',
  },
  Coder: {
    model: 'gpt-5',
    capabilities: ['code-generation', 'refactoring', 'testing', 'implementation'],
    cost: 2.0,
    contextWindow: 64000,
    specializations: ['implementation', 'unit-tests', 'integration', 'api-design'],
    fallbackModels: ['claude-4.5', 'starcoder'],
    promptInstruction:
      'Generate production-ready code based on the provided plan and requirements. Include: proper error handling, TypeScript types, unit tests, and documentation.',
  },
  UXReviewer: {
    model: 'claude-4.5',
    capabilities: ['accessibility', 'ux-analysis', 'i18n', 'usability'],
    cost: 1.5,
    contextWindow: 96000,
    specializations: ['usability', 'accessibility', 'localization', 'user-experience'],
    fallbackModels: ['gpt-5', 'gemini-2.5'],
    promptInstruction:
      'Review the implementation for user experience and accessibility. Check: WCAG compliance, intuitive navigation, responsive design, and inclusive language.',
  },
  DebugAgent: {
    model: 'gpt-5',
    capabilities: ['error-analysis', 'patch-generation', 'debugging', 'troubleshooting'],
    cost: 1.8,
    contextWindow: 64000,
    specializations: ['root-cause-analysis', 'fix-suggestion', 'validation', 'testing'],
    fallbackModels: ['claude-4.5', 'gemini-2.5'],
    promptInstruction:
      'Analyze errors and generate targeted fixes. Provide: root cause analysis, specific code changes, and test validation.',
  },
  ComplianceAgent: {
    model: 'claude-4.5',
    capabilities: ['gdpr', 'hipaa', 'pci', 'security-scan', 'privacy'],
    cost: 1.3,
    contextWindow: 96000,
    specializations: ['privacy', 'security', 'regulatory-compliance', 'data-protection'],
    fallbackModels: ['gpt-5', 'gemini-2.5'],
    promptInstruction:
      'Review for regulatory compliance and security. Check: GDPR, HIPAA, PCI compliance, security vulnerabilities, and data privacy.',
  },
  ProductManager: {
    model: 'gpt-5',
    capabilities: ['feature-planning', 'user-stories', 'requirements', 'prioritization'],
    cost: 1.4,
    contextWindow: 64000,
    specializations: ['product-strategy', 'user-experience', 'feature-prioritization', 'roadmap'],
    fallbackModels: ['claude-4.5', 'gemini-2.5'],
    promptInstruction:
      'Evaluate from a product perspective. Consider: user value, market fit, feature prioritization, and success metrics.',
  },
  SafetyAgent: {
    model: 'claude-4.5',
    capabilities: ['safety-check', 'hallucination-detection', 'content-filtering', 'bias-detection'],
    cost: 1.1,
    contextWindow: 48000,
    specializations: ['content-safety', 'bias-detection', 'ethical-ai', 'harmful-content'],
    fallbackModels: ['gpt-5', 'gemini-2.5'],
    promptInstruction:
      'Perform safety and content analysis. Check: harmful content, bias, misinformation, and ethical implications.',
  },
  PatchVerifier: {
    model: 'starcoder',
    capabilities: ['static-analysis', 'linting', 'performance-check', 'security-scanning'],
    cost: 0.8,
    contextWindow: 32000,
    specializations: ['code-quality', 'performance', 'security-scanning', 'testing'],
    fallbackModels: ['gpt-5', 'claude-4.5'],
    promptInstruction:
      'Verify code quality and safety. Run: static analysis, linting, performance checks, and security scans.',
  },
};

/**
 * Multi-Agent Orchestration Service
 */
export class TCIMultiAgentOrchestrator {
  private agents: Map<TCIAgent, any> = new Map(); // Model service instances
  private envelopeService: TCIEnvelopeService;
  private executionMetrics: Map<string, { startTime: number; tokensUsed: number }> = new Map();

  constructor(
    private readonly modelRouter: any, // AIRouter service - ready for API integration
    private readonly storageService: CloudflareR2Storage,
    private readonly vectorDB: any, // VectorDB service - ready for Pinecone integration
    private readonly auditLogger: any // AuditLogger service - ready for API integration
  ) {
    this.envelopeService = new TCIEnvelopeService(storageService, auditLogger, vectorDB);
  }

  /**
   * Initialize agents with their respective model services - ready for API integration
   */
  async initializeAgents(): Promise<{ initialized: TCIAgent[]; failed: TCIAgent[] }> {
    const initialized: TCIAgent[] = [];
    const failed: TCIAgent[] = [];

    for (const [agentName, config] of Object.entries(AGENT_CONFIGS)) {
      const agent = agentName as TCIAgent;

      try {
        // Try to get primary model service
        let modelService = await this.getModelService(config.model);

        // If primary unavailable, try fallbacks
        if (!modelService && config.fallbackModels) {
          for (const fallbackModel of config.fallbackModels) {
            modelService = await this.getModelService(fallbackModel);
            if (modelService) break;
          }
        }

        if (modelService) {
          this.agents.set(agent, modelService);
          initialized.push(agent);
          console.log(`✅ Initialized ${agent} agent with ${config.model} model`);
        } else {
          failed.push(agent);
          console.warn(`⚠️ Could not initialize ${agent} agent - no model service available`);
        }

      } catch (error) {
        failed.push(agent);
        console.error(`❌ Failed to initialize ${agent} agent:`, error);
      }
    }

    return { initialized, failed };
  }

  /**
   * Execute a multi-agent workflow for a given task - enhanced with error handling
   */
  async executeWorkflow(
    task: string,
    context: TCIContext,
    agents: TCIAgent[] = ['Planner', 'Coder', 'UXReviewer', 'ComplianceAgent'],
    options: {
      maxTokens?: number;
      timeout?: number;
      parallel?: boolean;
    } = {}
  ): Promise<WorkflowExecutionResult> {
    const workflowId = `workflow_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const startTime = Date.now();
    const envelopes: TCIEnvelope[] = [];
    const errors: string[] = [];
    let totalTokensUsed = 0;

    try {
      // Validate inputs
      if (!task || task.trim().length === 0) {
        throw new Error('Task cannot be empty');
      }

      if (!context.session_id) {
        context.session_id = `session_${Date.now()}`;
      }

      // Retrieve relevant context from vector memory - ready for Pinecone integration
      const similarPatterns = await this.getSimilarPatterns(task, context);

      const executionResult = options.parallel
        ? await this.runParallelWorkflow(agents, task, context, similarPatterns, workflowId)
        : await this.runSequentialWorkflow(agents, task, context, similarPatterns, workflowId);

      envelopes.push(...executionResult.envelopes);
      errors.push(...executionResult.errors);
      totalTokensUsed += executionResult.tokensUsed;

      const success = errors.length === 0 && envelopes.length > 0;

      return {
        envelopes,
        totalExecutionTime: Date.now() - startTime,
        totalTokensUsed,
        success,
        errors,
      };

    } catch (error) {
      return {
        envelopes,
        totalExecutionTime: Date.now() - startTime,
        totalTokensUsed,
        success: false,
        errors: [...errors, `Workflow execution failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
      };
    }
  }

  /**
   * Runs a sequential workflow where agents execute one after another.
   */
  private async runSequentialWorkflow(
    agents: TCIAgent[],
    task: string,
    context: TCIContext,
    similarPatterns: any[],
    workflowId: string,
    options: {
      maxTokens?: number;
      timeout?: number;
      parallel?: boolean;
    } = {}
  ): Promise<{ envelopes: TCIEnvelope[]; errors: string[]; tokensUsed: number }> {
    const envelopes: TCIEnvelope[] = [];
    const errors: string[] = [];
    let tokensUsed = 0;

    for (const agentName of agents) {
      try {
        const result = await this.executeAgent(agentName, task, context, similarPatterns, envelopes, workflowId, options);
        if (result.success && result.envelope) {
          envelopes.push(result.envelope);
          tokensUsed += result.tokensUsed || 0;
        }

        if (result.envelope?.decision.requires_human_review) {
          console.log(`Agent ${agentName} requires human review, stopping workflow`);
          await this.auditLogger.log({
            event_type: 'tci_workflow_paused',
            resource_id: workflowId,
            action: 'pause',
            metadata: { reason: 'human_review_required', agent: agentName }
          });
          break; // Stop the sequence
        }
      } catch (error) {
        const errorMsg = `Agent ${agentName} failed: ${error instanceof Error ? error.message : 'Unknown error'}`;
        errors.push(errorMsg);
        const errorEnvelope = await this.createErrorEnvelope(agentName, task, errorMsg, context);
        envelopes.push(errorEnvelope);
        // In a sequential workflow, we might want to break on failure.
        // For resilience, we'll continue, but this is a design choice.
      }
    }
    return { envelopes, errors, tokensUsed };
  }

  /**
   * Runs a parallel workflow where agents execute concurrently.
   */
  private async runParallelWorkflow(
    agents: TCIAgent[],
    task: string,
    context: TCIContext,
    similarPatterns: any[],
    workflowId: string,
    options: {
      maxTokens?: number;
      timeout?: number;
      parallel?: boolean;
    } = {}
  ): Promise<{ envelopes: TCIEnvelope[]; errors: string[]; tokensUsed: number }> {
    const envelopes: TCIEnvelope[] = [];
    const errors: string[] = [];
    let tokensUsed = 0;

    const agentPromises = agents.map(agent =>
      this.executeAgent(agent, task, context, similarPatterns, [], workflowId, options) // Pass empty previous envelopes for parallel
    );

    const results = await Promise.allSettled(agentPromises);

    for (const result of results) {
      if (result.status === 'fulfilled' && result.value.success && result.value.envelope) {
        envelopes.push(result.value.envelope);
        tokensUsed += result.value.tokensUsed || 0;
      } else {
        const reason = result.status === 'rejected'
          ? result.reason?.message || 'Unknown parallel execution error'
          : result.value.error || 'Agent failed in parallel execution';
        errors.push(reason);
        // Optionally create error envelopes for parallel failures
      }
    }
    return { envelopes, errors, tokensUsed };
  }

  /**
   * Execute a single agent with proper error handling and metrics
   */
  private async executeAgent(
    agent: TCIAgent,
    task: string,
    context: TCIContext,
    similarPatterns: any[],
    previousEnvelopes: TCIEnvelope[],
    workflowId: string,
    options: {
      maxTokens?: number;
      timeout?: number;
      parallel?: boolean;
    } = {}
  ): Promise<AgentExecutionResult> {
    const agentStartTime = Date.now();
    const config = AGENT_CONFIGS[agent];
    const modelService = this.agents.get(agent);

    if (!modelService) {
      throw new Error(`Agent ${agent} not initialized or model service unavailable`);
    }

    try {
      // Prepare agent prompt with enhanced context
      const prompt = await this.buildAgentPrompt(agent, task, context, similarPatterns, previousEnvelopes);

      // Track execution metrics
      const executionId = `${workflowId}_${agent}_${Date.now()}`;
      this.executionMetrics.set(executionId, { startTime: agentStartTime, tokensUsed: 0 });

      // Execute agent with timeout and error handling
      const response = await this.executeWithTimeout(
        () => modelService.generate({
          prompt,
          context: {
            max_tokens: Math.min(config.contextWindow, context.session_id ? 32000 : 16000),
            temperature: this.getOptimalTemperature(agent),
            agent: agent,
            operation_id: context.operation_id,
            workflow_id: workflowId,
          },
        }),
        options.timeout || 120000 // 2 minute default timeout
      );

      // Update metrics
      const metrics = this.executionMetrics.get(executionId);
      if (metrics) {
        metrics.tokensUsed = (response as any).tokensUsed || estimateTokens(prompt + ((response as any).text || ''));
      }

      // Parse response and create envelope
      const intent = this.createAgentIntent(agent, task, response);
      const inputs = this.createAgentInputs(task, context, similarPatterns, previousEnvelopes);
      const outputs = this.createAgentOutputs(response);

      // Create envelope through envelope service
      const envelope = await this.envelopeService.createEnvelope(
        agent,
        intent,
        inputs,
        outputs,
        {
          ...context,
          operation_id: `${context.operation_id}_${agent}`,
        }
      );

      return {
        success: true,
        envelope,
        executionTime: Date.now() - agentStartTime,
        tokensUsed: (response as any).tokensUsed || estimateTokens(prompt + ((response as any).text || '')),
        model: config.model,
      };

    } catch (error) {
      console.error(`Agent ${agent} execution failed:`, error);

      // Create error envelope for tracking
      const errorEnvelope = await this.createErrorEnvelope(agent, task, error instanceof Error ? error.message : 'Unknown error', context, Date.now() - agentStartTime);

      return {
        success: false,
        envelope: errorEnvelope,
        error: error instanceof Error ? error.message : 'Unknown error',
        executionTime: Date.now() - agentStartTime,
        model: config.model,
      };
    }
  }

  /**
   * Build agent-specific prompt
   */
  private async buildAgentPrompt(
    agent: TCIAgent,
    task: string,
    context: TCIContext,
    similarPatterns: any[],
    previousEnvelopes: TCIEnvelope[]
  ): Promise<string> {
    const config = AGENT_CONFIGS[agent];
    let prompt = '';

    // Base prompt structure
    prompt += `You are ${agent}, a specialized AI agent for ${config.specializations.join(' and ')}.\n`;
    prompt += `Your capabilities: ${config.capabilities.join(', ')}\n\n`;
    // Add agent-specific instruction from config
    prompt += `${config.promptInstruction}\n`;

    // Add context from similar patterns
    if (similarPatterns.length > 0) {
      prompt += `\nRelevant patterns from similar projects:\n`;
      similarPatterns.slice(0, 3).forEach((pattern, i) => {
        prompt += `${i + 1}. ${pattern.description}\n`;
      });
    }

    // Add context from previous agents
    if (previousEnvelopes.length > 0) {
      prompt += `\nPrevious agent outputs:\n`;
      previousEnvelopes.forEach((envelope, i) => {
        prompt += `${i + 1}. ${envelope.actor}: ${envelope.outputs.explanation}\n`;
      });
    }

    prompt += `\nTask: ${task}\n`;
    prompt += `Context: ${JSON.stringify(context, null, 2)}\n`;

    return prompt;
  }

  /**
   * Retrieve similar patterns from vector memory
   */
  private async getSimilarPatterns(task: string, context: TCIContext): Promise<any[]> {
    const queryEmbedding = await this.vectorDB.embed(task);

    const results = await this.vectorDB.search({
      vector: queryEmbedding,
      limit: 5,
      filter: {
        workspace_id: context.workspace_id,
        type: 'pattern',
      },
    });

    return results.map((result: any) => ({
      description: result.metadata?.description || '',
      success_rate: result.metadata?.success_rate || 0,
      tags: result.metadata?.tags || [],
    }));
  }

  /**
   * Get agent for specific capability
   */
  getAgentForCapability(capability: string): TCIAgent | null {
    for (const [agent, config] of Object.entries(AGENT_CONFIGS)) {
      if (config.capabilities.includes(capability)) {
        return agent as TCIAgent;
      }
    }
    return null;
  }

  /**
   * Get execution metrics for monitoring - ready for observability integration
   */
  getExecutionMetrics(): Map<string, { startTime: number; tokensUsed: number }> {
    return this.executionMetrics;
  }

  /**
   * Create error envelope for failed operations
   */
  private async createErrorEnvelope(
    agent: TCIAgent,
    task: string,
    error: string,
    context: TCIContext,
    executionTime?: number
  ): Promise<TCIEnvelope> {
    const errorIntent = {
      text: `Failed: ${task}`,
      confidence: 0,
      category: 'debug' as const,
    };

    const errorOutputs = {
      explanation: `Agent ${agent} execution failed: ${error}`,
      changes: [],
      metrics: { error_count: 1, execution_time: executionTime || 0 },
    };

    return await this.envelopeService.createEnvelope(
      `${agent}_ERROR`,
      errorIntent,
      { prompt: task, context },
      errorOutputs,
      context
    );
  }

  /**
   * Get model service with fallback handling - ready for API integration
   */
  private async getModelService(modelName: string): Promise<any> {
    try {
      if (!this.modelRouter) {
        console.warn(`Model router not available for ${modelName}`);
        return null;
      }

      return await this.modelRouter.getModelService(modelName);
    } catch (error) {
      console.error(`Failed to get model service for ${modelName}:`, error);
      return null;
    }
  }

  /**
   * Execute with timeout - utility for preventing hanging operations
   */
  private async executeWithTimeout<T>(
    operation: () => Promise<T>,
    timeoutMs: number
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      operation()
        .then(result => {
          clearTimeout(timeout);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeout);
          reject(error);
        });
    });
  }

  /**
   * Get optimal temperature for agent type
   */
  private getOptimalTemperature(agent: TCIAgent): number {
    const temperatureMap: Record<TCIAgent, number> = {
      Planner: 0.7,      // Creative planning
      Coder: 0.3,        // Consistent code generation
      UXReviewer: 0.5,   // Balanced UX analysis
      DebugAgent: 0.4,   // Systematic debugging
      ComplianceAgent: 0.2, // Conservative compliance checking
      ProductManager: 0.6,  // Strategic thinking
      SafetyAgent: 0.1,     // Conservative safety checking
      PatchVerifier: 0.2,   // Precise code analysis
    };

    return temperatureMap[agent];
  }

  /**
   * Create agent intent from response
   */
  private createAgentIntent(agent: TCIAgent, task: string, response: any) {
    return {
      text: task,
      confidence: response.confidence || this.getDefaultConfidence(agent),
      category: this.mapAgentToCategory(agent),
      metadata: {
        agent,
        model: AGENT_CONFIGS[agent].model,
        capabilities: AGENT_CONFIGS[agent].capabilities,
        response_quality: response.quality || 'unknown',
      },
    };
  }

  /**
   * Create agent inputs from context
   */
  private createAgentInputs(task: string, context: TCIContext, similarPatterns: any[], previousEnvelopes: TCIEnvelope[]) {
    return {
      prompt: task,
      context: {
        similar_patterns_count: similarPatterns.length,
        previous_agents: previousEnvelopes.map(e => e.actor),
        session_context: {
          session_id: context.session_id,
          workspace_id: context.workspace_id,
          project_id: context.project_id,
        },
      },
      previous_envelope_id: previousEnvelopes[previousEnvelopes.length - 1]?.envelope_id,
    };
  }

  /**
   * Create agent outputs from response
   */
  private createAgentOutputs(response: any) {
    return {
      explanation: response.explanation || response.text || 'Agent completed task successfully',
      reasoning: response.reasoning,
      files: response.generated_files || [],
      changes: response.changes || [],
      metrics: {
        tokens_used: response.tokensUsed,
        processing_time: response.processingTime,
        confidence_score: response.confidence,
      },
      artifacts: response.artifacts || [],
    };
  }

  /**
   * Get default confidence for agent type
   */
  private getDefaultConfidence(agent: TCIAgent): number {
    const defaults: Record<TCIAgent, number> = {
      Planner: 0.85,
      Coder: 0.90,
      UXReviewer: 0.80,
      DebugAgent: 0.75,
      ComplianceAgent: 0.95,
      ProductManager: 0.80,
      SafetyAgent: 0.95,
      PatchVerifier: 0.90,
    };

    return defaults[agent];
  }

  /**
   * Map agent to intent category
   */
  private mapAgentToCategory(agent: TCIAgent): TCIEnvelope['intent']['category'] {
    const mapping: Record<TCIAgent, TCIEnvelope['intent']['category']> = {
      Planner: 'analysis',
      Coder: 'code_generation',
      UXReviewer: 'review',
      DebugAgent: 'debug',
      ComplianceAgent: 'review',
      ProductManager: 'analysis',
      SafetyAgent: 'review',
      PatchVerifier: 'review',
    };

    return mapping[agent];
  }
}

/**
 * Utility function to estimate tokens (simplified)
 */
function estimateTokens(text: string): number {
  // Rough estimation: 1 token ≈ 4 characters for English text
  return Math.ceil(text.length / 4);
}

export default TCIMultiAgentOrchestrator;

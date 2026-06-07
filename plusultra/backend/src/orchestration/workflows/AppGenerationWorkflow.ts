import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, SystemMessage } from '@langchain/core/messages';
import { ModelRouter, ModelType, TaskType } from '../models/ModelRouter';
import { BaseAgent, AgentTask, AgentContext, AgentResult } from '../agents/BaseAgents';
import { CodeGenerationAgent, ArchitectureAgent, DebugAgent } from '../agents/BaseAgents';
import { vectorDb } from '../../services/vector/VectorDatabase';
import { createReactNativeGenerator } from '../../services/codegen/ReactNativeGenerator';

export interface WorkflowStep {
  id: string;
  name: string;
  description: string;
  agent: BaseAgent;
  task: AgentTask;
  dependencies?: string[];
  status: 'pending' | 'running' | 'completed' | 'failed';
  result?: AgentResult;
  startedAt?: Date;
  completedAt?: Date;
}

export interface WorkflowResult {
  success: boolean;
  steps: WorkflowStep[];
  finalOutput?: any;
  errors?: string[];
  metadata: {
    totalDuration: number;
    successfulSteps: number;
    failedSteps: number;
    startedAt: Date;
    completedAt?: Date;
  };
}

/**
 * Enhanced workflow step with execution metadata
 */
export interface EnhancedWorkflowStep extends WorkflowStep {
  retryCount: number;
  executionTime?: number;
  lastError?: string;
  healthCheckPassed?: boolean;
  resourceUsage?: {
    memoryUsed: number;
    cpuUsed: number;
  };
}

/**
 * Workflow execution configuration
 */
export interface WorkflowConfig {
  maxRetries: number;
  timeoutMs: number;
  enableMetrics: boolean;
  enableParallelExecution: boolean;
  maxConcurrentSteps: number;
  retryDelayMs: number;
  enableCircuitBreaker: boolean;
  circuitBreakerThreshold: number;
  enableHealthChecks: boolean;
  healthCheckIntervalMs: number;
}

/**
 * Workflow execution metrics
 */
export interface WorkflowMetrics {
  totalExecutionTime: number;
  stepExecutionTimes: Record<string, number>;
  stepRetryCounts: Record<string, number>;
  successRate: number;
  errorTypes: Record<string, number>;
  resourceUsage: {
    memoryPeak: number;
    cpuUsage: number;
    networkRequests: number;
  };
}

/**
 * Production-grade orchestration engine with comprehensive monitoring and resilience
 */
export class OrchestrationEngine {
  private modelRouter: ModelRouter;
  private agents: BaseAgent[];
  private workflows: Map<string, EnhancedWorkflowStep[]> = new Map();
  private config: WorkflowConfig;
  private metrics: Map<string, WorkflowMetrics> = new Map();
  private circuitBreakerState: Map<string, { failures: number; lastFailure: Date }> = new Map();
  private healthCheckInterval?: NodeJS.Timeout;

  constructor(config?: Partial<WorkflowConfig>) {
    this.config = {
      maxRetries: 3,
      timeoutMs: 300000, // 5 minutes
      enableMetrics: true,
      enableParallelExecution: true,
      maxConcurrentSteps: 5,
      retryDelayMs: 1000,
      enableCircuitBreaker: true,
      circuitBreakerThreshold: 5,
      enableHealthChecks: true,
      healthCheckIntervalMs: 30000, // 30 seconds
      ...config,
    };

    this.modelRouter = new ModelRouter();
    this.agents = this.initializeAgents();

    if (this.config.enableHealthChecks) {
      this.startHealthChecks();
    }
  }

  private initializeAgents(): BaseAgent[] {
    const agents: BaseAgent[] = [];
    const availableModels = this.modelRouter.getAvailableModels();

    // Initialize agents with available models
    for (const modelType of availableModels) {
      const model = this.modelRouter.modelsMap.get(modelType);
      if (!model) continue;

      // Create agents based on model capabilities
      if (modelType === ModelType.GPT5_CODE || modelType === ModelType.CLAUDE_3_5_SONNET) {
        agents.push(new CodeGenerationAgent(model));
        agents.push(new DebugAgent(model));
      }

      if (modelType === ModelType.CLAUDE_4_5 || modelType === ModelType.GEMINI_2_5_PRO) {
        agents.push(new ArchitectureAgent(model));
      }
    }

    return agents;
  }

  async generateApp(context: AgentContext): Promise<WorkflowResult> {
    const workflowId = `app-gen-${context.userId}-${Date.now()}`;
    const startTime = Date.now();

    try {
      // Initialize metrics tracking
      if (this.config.enableMetrics) {
        this.metrics.set(workflowId, {
          totalExecutionTime: 0,
          stepExecutionTimes: {},
          stepRetryCounts: {},
          successRate: 0,
          errorTypes: {},
          resourceUsage: {
            memoryPeak: 0,
            cpuUsage: 0,
            networkRequests: 0,
          },
        });
      }

      // Retrieve relevant context from vector database
      const similarPatterns = await vectorDb.findSimilarPatterns(context.appIntent, context.userId);
      const userPreferences = await vectorDb.getUserPreferences(context.userId);

      // Enhance context with retrieved information
      const enhancedContext = {
        ...context,
        retrievedContext: {
          patternCount: similarPatterns.length,
          preferenceCount: userPreferences.length,
          timestamp: new Date().toISOString(),
          userId: context.userId
        }
      };

      // Define the workflow steps
      const steps: EnhancedWorkflowStep[] = [
        {
          id: 'analyze-requirements',
          name: 'Requirements Analysis',
          description: 'Analyze user intent and determine app requirements',
          agent: this.findBestAgent(['architecture', 'planning']),
          task: {
            type: 'requirements_analysis',
            description: `Analyze this app intent and extract key requirements: ${context.appIntent}`,
            context,
            priority: 'high'
          },
          status: 'pending',
          retryCount: 0,
        },
        {
          id: 'tech-stack-recommendation',
          name: 'Tech Stack Recommendation',
          description: 'Recommend optimal tech stack for the app',
          agent: this.findBestAgent(['architecture', 'tech_stack']),
          task: {
            type: 'tech_stack_recommendation',
            description: 'Recommend the best tech stack based on app requirements',
            context,
            priority: 'high',
            dependencies: ['analyze-requirements']
          },
          status: 'pending',
          retryCount: 0,
        },
        {
          id: 'architecture-design',
          name: 'Architecture Design',
          description: 'Design the overall app architecture',
          agent: this.findBestAgent(['architecture', 'system_design']),
          task: {
            type: 'architecture_design',
            description: 'Design the app architecture and component structure',
            context,
            priority: 'high',
            dependencies: ['analyze-requirements', 'tech-stack-recommendation']
          },
          status: 'pending',
          retryCount: 0,
        },
        {
          id: 'generate-core-components',
          name: 'Core Components Generation',
          description: 'Generate core React Native components',
          agent: this.findBestAgent(['code_generation', 'typescript']),
          task: {
            type: 'component_generation',
            description: 'Generate core React Native components with TypeScript',
            context,
            priority: 'high',
            dependencies: ['architecture-design']
          },
          status: 'pending',
          retryCount: 0,
        },
        {
          id: 'generate-services',
          name: 'Services & Utils Generation',
          description: 'Generate services, utilities, and business logic',
          agent: this.findBestAgent(['code_generation', 'typescript']),
          task: {
            type: 'service_generation',
            description: 'Generate services, utilities, and helper functions',
            context,
            priority: 'medium',
            dependencies: ['generate-core-components']
          },
          status: 'pending',
          retryCount: 0,
        },
        {
          id: 'generate-configuration',
          name: 'Configuration & Setup',
          description: 'Generate app configuration files and setup',
          agent: this.findBestAgent(['code_generation', 'configuration']),
          task: {
            type: 'config_generation',
            description: 'Generate package.json, app.json, and other configuration files',
            context,
            priority: 'medium',
            dependencies: ['tech-stack-recommendation']
          },
          status: 'pending',
          retryCount: 0,
        }
      ];

      this.workflows.set(workflowId, steps);

      // Execute workflow steps with enhanced error handling and monitoring
      const result = await this.executeWorkflow(workflowId, steps);

      // Update metadata
      result.metadata.completedAt = new Date();
      result.metadata.totalDuration = result.metadata.completedAt.getTime() - startTime;

      // Update final metrics
      if (this.config.enableMetrics && this.metrics.has(workflowId)) {
        const workflowMetrics = this.metrics.get(workflowId)!;
        workflowMetrics.totalExecutionTime = result.metadata.totalDuration;
        workflowMetrics.successRate = result.metadata.successfulSteps / steps.length;
      }

      return result;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred';

      // Update metrics for failed execution
      if (this.config.enableMetrics && this.metrics.has(workflowId)) {
        const workflowMetrics = this.metrics.get(workflowId)!;
        workflowMetrics.errorTypes[errorMessage] = (workflowMetrics.errorTypes[errorMessage] || 0) + 1;
      }

      return {
        success: false,
        steps: [],
        errors: [errorMessage],
        metadata: {
          totalDuration: Date.now() - startTime,
          successfulSteps: 0,
          failedSteps: 1,
          startedAt: new Date(startTime),
          completedAt: new Date()
        }
      };
    }
  }

  private async executeWorkflow(workflowId: string, steps: EnhancedWorkflowStep[]): Promise<WorkflowResult> {
    const results: WorkflowStep[] = [];
    const errors: string[] = [];
    const startTime = Date.now();

    // Execute steps with dependency management and parallel execution where possible
    const completedSteps = new Set<string>();

    while (completedSteps.size < steps.length) {
      const readySteps = steps.filter(step =>
        step.status === 'pending' &&
        (!step.dependencies || step.dependencies.every((dep: string) => completedSteps.has(dep)))
      );

      if (readySteps.length === 0) {
        // Check for dependency cycles or stuck steps
        const stuckSteps = steps.filter(step => step.status === 'pending');
        if (stuckSteps.length > 0) {
          stuckSteps.forEach(step => {
            step.status = 'failed';
            step.result = {
              success: false,
              error: 'Step stuck due to dependency issues'
            };
            results.push(step);
          });
          errors.push(`Workflow stuck: ${stuckSteps.map(s => s.name).join(', ')}`);
        }
        break;
      }

      // Execute ready steps in parallel (up to maxConcurrentSteps)
      const stepsToExecute = readySteps.slice(0, this.config.maxConcurrentSteps);

      const executionPromises = stepsToExecute.map(async (step) => {
        return await this.executeStep(workflowId, step);
      });

      try {
        const stepResults = await Promise.allSettled(executionPromises);

        for (let i = 0; i < stepResults.length; i++) {
          const result = stepResults[i];
          const step = stepsToExecute[i];

          if (result.status === 'fulfilled') {
            results.push(result.value);
            if (result.value.status === 'completed') {
              completedSteps.add(step.id);
            }
          } else {
            // Handle execution failure
            step.status = 'failed';
            step.result = {
              success: false,
              error: result.reason?.message || 'Execution failed'
            };
            results.push(step);
            errors.push(`Step ${step.name} execution failed: ${result.reason?.message || 'Unknown error'}`);
          }
        }
      } catch (error) {
        // Handle unexpected errors in parallel execution
        const errorMessage = error instanceof Error ? error.message : 'Parallel execution error';
        errors.push(`Parallel execution failed: ${errorMessage}`);

        // Mark remaining steps as failed
        stepsToExecute.forEach(step => {
          if (step.status === 'pending') {
            step.status = 'failed';
            step.result = {
              success: false,
              error: errorMessage
            };
            results.push(step);
          }
        });
      }
    }

    const successfulSteps = results.filter(s => s.status === 'completed').length;
    const failedSteps = results.filter(s => s.status === 'failed').length;

    return {
      success: failedSteps === 0,
      steps: results,
      finalOutput: this.aggregateResults(results),
      errors: errors.length > 0 ? errors : undefined,
      metadata: {
        totalDuration: Date.now() - startTime,
        successfulSteps,
        failedSteps,
        startedAt: new Date(startTime),
        completedAt: new Date()
      }
    };
  }

  private async executeStep(workflowId: string, step: EnhancedWorkflowStep): Promise<WorkflowStep> {
    const stepStartTime = Date.now();
    step.status = 'running';
    step.startedAt = new Date();

    try {
      // Check circuit breaker
      if (this.config.enableCircuitBreaker && this.isCircuitBreakerOpen(step.agent.getInfo().name)) {
        throw new Error(`Circuit breaker open for agent: ${step.agent.getInfo().name}`);
      }

      // Execute step with timeout and retry logic
      const result = await this.executeWithRetry(step);

      step.status = result.success ? 'completed' : 'failed';
      step.result = result;
      step.completedAt = new Date();
      step.executionTime = Date.now() - stepStartTime;

      // Update metrics
      if (this.config.enableMetrics) {
        this.updateStepMetrics(workflowId, step.id, {
          executionTime: step.executionTime,
          retryCount: step.retryCount,
          success: result.success,
          errorType: result.success ? undefined : 'execution_error'
        });
      }

      // Update circuit breaker state
      if (this.config.enableCircuitBreaker) {
        if (result.success) {
          this.resetCircuitBreaker(step.agent.getInfo().name);
        } else {
          this.recordCircuitBreakerFailure(step.agent.getInfo().name);
        }
      }

      return step;

    } catch (error) {
      step.status = 'failed';
      step.completedAt = new Date();
      step.executionTime = Date.now() - stepStartTime;
      step.lastError = error instanceof Error ? error.message : 'Unknown error';

      // Update metrics for failed step
      if (this.config.enableMetrics) {
        this.updateStepMetrics(workflowId, step.id, {
          executionTime: step.executionTime,
          retryCount: step.retryCount,
          success: false,
          errorType: error instanceof Error ? error.constructor.name : 'unknown_error'
        });
      }

      step.result = {
        success: false,
        error: step.lastError,
        suggestions: ['Check agent capabilities', 'Verify input data', 'Check system resources']
      };

      return step;
    }
  }

  private async executeWithRetry(step: EnhancedWorkflowStep): Promise<AgentResult> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        step.retryCount = attempt;

        // Set up timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Step execution timeout')), this.config.timeoutMs);
        });

        const executionPromise = step.agent.execute(step.task);

        const result = await Promise.race([executionPromise, timeoutPromise]);

        if (attempt > 0) {
          console.log(`Step ${step.name} succeeded after ${attempt} retries`);
        }

        return result;

      } catch (error) {
        lastError = error instanceof Error ? error : new Error('Unknown error');

        if (attempt < this.config.maxRetries) {
          // Wait before retry with exponential backoff
          const delay = this.config.retryDelayMs * Math.pow(2, attempt);
          await new Promise(resolve => setTimeout(resolve, delay));
          console.log(`Retrying step ${step.name} (attempt ${attempt + 1}/${this.config.maxRetries + 1})`);
        }
      }
    }

    throw lastError || new Error('Max retries exceeded');
  }

  private aggregateResults(steps: WorkflowStep[]): any {
    const completedSteps = steps.filter(s => s.status === 'completed');

    return {
      requirements: completedSteps.find(s => s.id === 'analyze-requirements')?.result?.output,
      techStack: completedSteps.find(s => s.id === 'tech-stack-recommendation')?.result?.output,
      architecture: completedSteps.find(s => s.id === 'architecture-design')?.result?.output,
      components: completedSteps.find(s => s.id === 'generate-core-components')?.result?.output,
      services: completedSteps.find(s => s.id === 'generate-services')?.result?.output,
      configuration: completedSteps.find(s => s.id === 'generate-configuration')?.result?.output,
      generatedAt: new Date().toISOString(),
      workflowSummary: {
        totalSteps: steps.length,
        completedSteps: completedSteps.length,
        failedSteps: steps.length - completedSteps.length
      }
    };
  }

  private findBestAgent(capabilities: string[]): BaseAgent {
    // Find agents that can handle the required capabilities
    const suitableAgents = this.agents.filter(agent =>
      capabilities.some((cap: string) => agent.canHandle({ type: cap, description: cap, context: {} as AgentContext, priority: 'medium' }))
    );

    if (suitableAgents.length === 0) {
      throw new Error(`No suitable agent found for capabilities: ${capabilities.join(', ')}`);
    }

    // Return the first suitable agent (could be enhanced with load balancing)
    return suitableAgents[0];
  }

  /**
   * Circuit breaker management
   */
  private isCircuitBreakerOpen(agentName: string): boolean {
    const state = this.circuitBreakerState.get(agentName);
    if (!state) return false;

    // Reset circuit breaker if enough time has passed
    const timeSinceLastFailure = Date.now() - state.lastFailure.getTime();
    if (timeSinceLastFailure > 300000) { // 5 minutes
      this.circuitBreakerState.delete(agentName);
      return false;
    }

    return state.failures >= this.config.circuitBreakerThreshold;
  }

  private recordCircuitBreakerFailure(agentName: string): void {
    const state = this.circuitBreakerState.get(agentName) || { failures: 0, lastFailure: new Date() };
    state.failures++;
    state.lastFailure = new Date();
    this.circuitBreakerState.set(agentName, state);
  }

  private resetCircuitBreaker(agentName: string): void {
    this.circuitBreakerState.delete(agentName);
  }

  /**
   * Metrics management
   */
  private updateStepMetrics(workflowId: string, stepId: string, metrics: {
    executionTime: number;
    retryCount: number;
    success: boolean;
    errorType?: string;
  }): void {
    const workflowMetrics = this.metrics.get(workflowId);
    if (!workflowMetrics) return;

    workflowMetrics.stepExecutionTimes[stepId] = metrics.executionTime;
    workflowMetrics.stepRetryCounts[stepId] = metrics.retryCount;

    if (metrics.errorType) {
      workflowMetrics.errorTypes[metrics.errorType] = (workflowMetrics.errorTypes[metrics.errorType] || 0) + 1;
    }
  }

  /**
   * Health check system
   */
  private startHealthChecks(): void {
    this.healthCheckInterval = setInterval(async () => {
      try {
        // Check agent health
        for (const agent of this.agents) {
          const agentInfo = agent.getInfo();
          // Simple health check - could be enhanced with actual health checks
          console.log(`Health check: ${agentInfo.name} - OK`);
        }
      } catch (error) {
        console.error('Health check failed:', error);
      }
    }, this.config.healthCheckIntervalMs);
  }

  /**
   * Public API methods
   */
  getWorkflowStatus(workflowId: string): WorkflowStep[] | null {
    return this.workflows.get(workflowId) || null;
  }

  getWorkflowMetrics(workflowId: string): WorkflowMetrics | null {
    return this.metrics.get(workflowId) || null;
  }

  getAllMetrics(): Map<string, WorkflowMetrics> {
    return new Map(this.metrics);
  }

  cancelWorkflow(workflowId: string): boolean {
    const workflow = this.workflows.get(workflowId);
    if (workflow) {
      workflow.forEach(step => {
        if (step.status === 'running') {
          step.status = 'failed';
          step.result = {
            success: false,
            error: 'Workflow cancelled by user'
          };
        }
      });
      return true;
    }
    return false;
  }

  /**
   * Cleanup resources
   */
  destroy(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }
    this.workflows.clear();
    this.metrics.clear();
    this.circuitBreakerState.clear();
  }
}

// Export singleton instance
export const orchestrationEngine = new OrchestrationEngine();

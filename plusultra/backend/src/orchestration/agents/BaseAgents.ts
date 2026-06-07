import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { HumanMessage, AIMessage, SystemMessage } from '@langchain/core/messages';
import { TruthConsistencyInterface, TCIModelOutput } from '../../services/tci/TruthConsistencyInterface';
import { TCIOrchestrator } from '../../services/tci/TCIOrchestrator';

export interface AgentContext {
  userId: string;
  projectId: string;
  appIntent: string;
  techStack?: string[];
  conversationHistory?: Array<HumanMessage | AIMessage | SystemMessage>;
  metadata?: Record<string, any>;
}

export interface AgentResult {
  success: boolean;
  output?: string;
  metadata?: Record<string, any>;
  error?: string;
  suggestions?: string[];
  tciValidation?: any; // TCI validation results
}

export interface AgentTask {
  type: string;
  description: string;
  context: AgentContext;
  priority: 'low' | 'medium' | 'high';
  dependencies?: string[];
  timeout?: number;
}

export abstract class BaseAgent {
  protected model: BaseChatModel;
  protected name: string;
  protected description: string;
  protected capabilities: string[];
  protected tciOrchestrator?: TCIOrchestrator;

  constructor(
    model: BaseChatModel,
    name: string,
    description: string,
    capabilities: string[],
    tciOrchestrator?: TCIOrchestrator
  ) {
    this.model = model;
    this.name = name;
    this.description = description;
    this.capabilities = capabilities;
    this.tciOrchestrator = tciOrchestrator;
  }

  /**
   * Execute with TCI validation (enhanced version)
   */
  async executeWithTCI(task: AgentTask): Promise<AgentResult> {
    const startTime = Date.now();

    try {
      // Execute the core agent logic
      const result = await this.execute(task);

      const processingTime = Date.now() - startTime;

      // Create TCI model output record
      const modelOutput: TCIModelOutput = {
        model: this.name,
        output: result.output || '',
        confidence: this.calculateConfidence(result, task),
        tokensUsed: result.metadata?.tokensUsed || this.estimateTokens(task.description),
        processingTime,
        metadata: {
          version: '1.0',
          contextHash: this.generateContextHash(task.context),
          timestamp: new Date(),
          domain: this.determineDomain(task)
        }
      };

      // If TCI is available, run validation (for multi-model scenarios)
      if (this.tciOrchestrator && result.success) {
        try {
          // Note: In a real multi-agent scenario, this would collect outputs from multiple agents
          // and run them through TCI validation together
          const tciValidation = await this.tciOrchestrator.orchestrateMultiAIValidation(
            [modelOutput],
            task.context.appIntent,
            this.determineDomain(task) || 'general'
          );

          return {
            ...result,
            tciValidation,
            metadata: {
              ...result.metadata,
              tciValidated: true,
              validationScore: tciValidation.validationReport.overallScore
            }
          };
        } catch (tciError) {
          console.warn('TCI validation failed, proceeding without validation:', tciError);
          // Continue without TCI validation if it fails
        }
      }

      return result;

    } catch (error: any) {
      console.error(`Agent ${this.name} execution error:`, error);

      return {
        success: false,
        error: error.message,
        suggestions: ['Check agent configuration', 'Verify model availability', 'Review task requirements']
      };
    }
  }

  /**
   * Execute the agent's primary function (original method)
   */
  abstract execute(task: AgentTask): Promise<AgentResult>;

  /**
   * Check if this agent can handle the given task
   */
  canHandle(task: AgentTask): boolean {
    return this.capabilities.some(capability =>
      task.description.toLowerCase().includes(capability.toLowerCase()) ||
      task.type.toLowerCase().includes(capability.toLowerCase())
    );
  }

  /**
   * Calculate confidence score for the result
   */
  protected calculateConfidence(result: AgentResult, task: AgentTask): number {
    if (!result.success) return 0;

    let confidence = 0.8; // Base confidence

    // Adjust based on output quality indicators
    if (result.output && result.output.length > 100) confidence += 0.1;
    if (result.suggestions && result.suggestions.length > 0) confidence += 0.05;
    if (result.metadata?.tokensUsed && result.metadata.tokensUsed > 500) confidence += 0.05;

    return Math.min(1.0, confidence);
  }

  /**
   * Estimate token usage
   */
  protected estimateTokens(text: string): number {
    return Math.ceil(text.length / 4);
  }

  /**
   * Generate context hash for versioning
   */
  private generateContextHash(context: AgentContext): string {
    const contextString = JSON.stringify({
      appIntent: context.appIntent,
      techStack: context.techStack,
      projectId: context.projectId
    });
    return Buffer.from(contextString.slice(0, 100)).toString('base64').slice(0, 16);
  }

  /**
   * Determine domain for the task
   */
  private determineDomain(task: AgentTask): string {
    const description = task.description.toLowerCase();

    if (description.includes('code') || description.includes('component') || description.includes('typescript')) {
      return 'coding';
    }
    if (description.includes('architecture') || description.includes('design') || description.includes('structure')) {
      return 'reasoning';
    }
    if (description.includes('error') || description.includes('debug') || description.includes('fix')) {
      return 'debugging';
    }

    return 'general';
  }

  /**
   * Get agent information
   */
  getInfo() {
    return {
      name: this.name,
      description: this.description,
      capabilities: this.capabilities
    };
  }
}

/**
 * Specialized agent for code generation
 */
export class CodeGenerationAgent extends BaseAgent {
  constructor(model: BaseChatModel) {
    super(
      model,
      'CodeGenerationAgent',
      'Generates high-quality React Native code with TypeScript',
      ['code_generation', 'typescript', 'react_native', 'component_creation']
    );
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    try {
      const prompt = `
You are an expert React Native developer. Generate production-ready code based on this request:

${task.description}

Context:
- User Intent: ${task.context.appIntent}
- Tech Stack: ${task.context.techStack?.join(', ') || 'React Native + TypeScript'}
- Target Platforms: iOS, Android

Requirements:
1. Use TypeScript for all code
2. Follow React Native best practices
3. Include proper error handling
4. Add JSDoc comments for functions
5. Use functional components with hooks where appropriate
6. Follow the specified coding style and patterns

Generate the complete, runnable code:
`;

      const response = await this.model.invoke([
        new SystemMessage('You are a senior React Native developer with expertise in TypeScript, Expo, and mobile app development.'),
        new HumanMessage(prompt)
      ]);

      return {
        success: true,
        output: response.content as string,
        metadata: {
          generatedAt: new Date().toISOString(),
          model: this.model.constructor.name,
          tokensUsed: response.usage_metadata?.total_tokens || 0
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        suggestions: ['Check if the intent description is clear enough', 'Verify tech stack compatibility']
      };
    }
  }
}

/**
 * Specialized agent for architecture planning
 */
export class ArchitectureAgent extends BaseAgent {
  constructor(model: BaseChatModel) {
    super(
      model,
      'ArchitectureAgent',
      'Designs optimal app architecture and tech stack recommendations',
      ['architecture', 'tech_stack', 'system_design', 'scalability']
    );
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    try {
      const prompt = `
You are a senior software architect. Analyze this app requirement and design the optimal architecture:

App Intent: ${task.context.appIntent}

Please provide:
1. Recommended tech stack with justification
2. High-level architecture diagram (text-based)
3. Component structure and data flow
4. Scalability considerations
5. Security recommendations
6. Development best practices

Format your response as structured JSON for easy parsing.
`;

      const response = await this.model.invoke([
        new SystemMessage('You are a senior software architect with expertise in mobile app development, React Native, and scalable system design.'),
        new HumanMessage(prompt)
      ]);

      return {
        success: true,
        output: response.content as string,
        metadata: {
          generatedAt: new Date().toISOString(),
          model: this.model.constructor.name,
          tokensUsed: response.usage_metadata?.total_tokens || 0
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        suggestions: ['Simplify the app requirements', 'Check for conflicting requirements']
      };
    }
  }
}

/**
 * Specialized agent for debugging and fixes
 */
export class DebugAgent extends BaseAgent {
  constructor(model: BaseChatModel) {
    super(
      model,
      'DebugAgent',
      'Identifies and fixes code issues, errors, and bugs',
      ['debugging', 'error_fixing', 'troubleshooting', 'code_review']
    );
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    try {
      const prompt = `
You are an expert debugger. Analyze this error and provide a fix:

Error/Context: ${task.description}

Previous conversation history:
${task.context.conversationHistory?.map(msg => `${msg.constructor.name}: ${msg.content}`).join('\n') || 'None'}

Please provide:
1. Root cause analysis
2. Specific fix with code changes
3. Prevention recommendations
4. Testing suggestions

Provide the fix in a clear, actionable format.
`;

      const response = await this.model.invoke([
        new SystemMessage('You are a senior software engineer specializing in debugging React Native applications, TypeScript errors, and build issues.'),
        new HumanMessage(prompt)
      ]);

      return {
        success: true,
        output: response.content as string,
        metadata: {
          generatedAt: new Date().toISOString(),
          model: this.model.constructor.name,
          tokensUsed: response.usage_metadata?.total_tokens || 0
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
        suggestions: ['Provide more error details', 'Include stack traces', 'Share relevant code snippets']
      };
    }
  }
}

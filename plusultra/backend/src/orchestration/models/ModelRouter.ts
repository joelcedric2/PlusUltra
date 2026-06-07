import { ChatOpenAI } from '@langchain/openai';
import { ChatAnthropic } from '@langchain/anthropic';
import { ChatGoogleGenerativeAI } from '@langchain/google-genai';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';

export enum ModelType {
  GPT5_CODE = 'gpt5-code',
  CLAUDE_4_5 = 'claude-4.5',
  GEMINI_2_5_PRO = 'gemini-2.5-pro',
  CLAUDE_3_5_SONNET = 'claude-3.5-sonnet',
  GEMINI_ENTERPRISE = 'gemini-enterprise'
}

export enum TaskType {
  CODE_GENERATION = 'code_generation',
  UX_DESIGN = 'ux_design',
  ARCHITECTURE_PLANNING = 'architecture_planning',
  DEBUGGING = 'debugging',
  SAFETY_REVIEW = 'safety_review',
  TECH_STACK_RECOMMENDATION = 'tech_stack_recommendation'
}

export class ModelRouter {
  private models: Map<ModelType, BaseChatModel>;

  constructor() {
    this.models = new Map();

    // Initialize models based on availability
    this.initializeModels();
  }

  private initializeModels() {
    // GPT-5 Code for high-quality code generation
    if (process.env.OPENAI_API_KEY) {
      this.models.set(ModelType.GPT5_CODE, new ChatOpenAI({
        modelName: 'gpt-5-code',
        openAIApiKey: process.env.OPENAI_API_KEY,
        temperature: 0.3, // Lower temperature for code generation
      }));
    }

    // Claude 4.5 for safe reasoning and UX
    if (process.env.ANTHROPIC_API_KEY) {
      this.models.set(ModelType.CLAUDE_4_5, new ChatAnthropic({
        modelName: 'claude-3-5-sonnet-20241022', // Using available model as proxy for 4.5
        anthropicApiKey: process.env.ANTHROPIC_API_KEY,
        temperature: 0.7,
      }));

      this.models.set(ModelType.CLAUDE_3_5_SONNET, new ChatAnthropic({
        modelName: 'claude-3-5-sonnet-20241022',
        anthropicApiKey: process.env.ANTHROPIC_API_KEY,
        temperature: 0.7,
      }));
    }

    // Gemini for long-context planning
    if (process.env.GOOGLE_GENAI_API_KEY) {
      this.models.set(ModelType.GEMINI_2_5_PRO, new ChatGoogleGenerativeAI({
        model: 'gemini-1.5-pro', // Using available model as proxy for 2.5
        apiKey: process.env.GOOGLE_GENAI_API_KEY,
        temperature: 0.5,
      }));

      this.models.set(ModelType.GEMINI_ENTERPRISE, new ChatGoogleGenerativeAI({
        model: 'gemini-1.5-pro', // Using available model as proxy for enterprise
        apiKey: process.env.GOOGLE_GENAI_API_KEY,
        temperature: 0.5,
      }));
    }
  }

  /**
   * Routes a task to the optimal model based on task type and requirements
   */
  async routeTask(taskType: TaskType, context?: string): Promise<BaseChatModel | null> {
    const modelMapping = this.getModelMapping();

    const preferredModel = modelMapping[taskType];
    if (preferredModel && this.models.has(preferredModel)) {
      return this.models.get(preferredModel)!;
    }

    // Fallback logic
    return this.getFallbackModel(taskType);
  }

  private getModelMapping(): Record<TaskType, ModelType> {
    return {
      [TaskType.CODE_GENERATION]: ModelType.GPT5_CODE,
      [TaskType.UX_DESIGN]: ModelType.CLAUDE_4_5,
      [TaskType.ARCHITECTURE_PLANNING]: ModelType.GEMINI_2_5_PRO,
      [TaskType.DEBUGGING]: ModelType.GPT5_CODE,
      [TaskType.SAFETY_REVIEW]: ModelType.CLAUDE_3_5_SONNET,
      [TaskType.TECH_STACK_RECOMMENDATION]: ModelType.GEMINI_ENTERPRISE
    };
  }

  private getFallbackModel(taskType: TaskType): BaseChatModel | null {
    // Fallback hierarchy based on task type
    switch (taskType) {
      case TaskType.CODE_GENERATION:
      case TaskType.DEBUGGING:
        // For code tasks, prefer Claude if GPT-5 not available
        return this.models.get(ModelType.CLAUDE_3_5_SONNET) || this.models.get(ModelType.CLAUDE_4_5) || null;

      case TaskType.UX_DESIGN:
      case TaskType.SAFETY_REVIEW:
        // For UX/safety, prefer GPT if Claude not available
        return this.models.get(ModelType.GPT5_CODE) || this.models.get(ModelType.CLAUDE_3_5_SONNET) || null;

      case TaskType.ARCHITECTURE_PLANNING:
      case TaskType.TECH_STACK_RECOMMENDATION:
        // For planning, prefer Claude if Gemini not available
        return this.models.get(ModelType.CLAUDE_4_5) || this.models.get(ModelType.GPT5_CODE) || null;

      default:
        return this.models.get(ModelType.CLAUDE_3_5_SONNET) || null;
    }
  }

  /**
   * Get cost estimate for a model call
   */
  getModelCost(modelType: ModelType, inputTokens: number, outputTokens: number): number {
    const costPerToken = this.getCostPerToken(modelType);

    return (inputTokens * costPerToken.input) + (outputTokens * costPerToken.output);
  }

  private getCostPerToken(modelType: ModelType): { input: number, output: number } {
    // Approximate costs as of Oct 2025 (adjust based on actual pricing)
    const costs = {
      [ModelType.GPT5_CODE]: { input: 0.000003, output: 0.000015 }, // Hypothetical GPT-5 pricing
      [ModelType.CLAUDE_4_5]: { input: 0.000003, output: 0.000015 }, // Hypothetical Claude 4.5 pricing
      [ModelType.CLAUDE_3_5_SONNET]: { input: 0.000003, output: 0.000015 },
      [ModelType.GEMINI_2_5_PRO]: { input: 0.0000025, output: 0.000010 },
      [ModelType.GEMINI_ENTERPRISE]: { input: 0.0000025, output: 0.000010 }
    };

    return costs[modelType] || { input: 0.000003, output: 0.000015 };
  }

  /**
   * Get all available models
   */
  getAvailableModels(): ModelType[] {
    return Array.from(this.models.keys());
  }

  /**
   * Get the models map (for internal use)
   */
  get modelsMap(): Map<ModelType, BaseChatModel> {
    return this.models;
  }
}

// Singleton instance
export const modelRouter = new ModelRouter();

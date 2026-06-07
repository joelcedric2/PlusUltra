import { OpenAI } from 'openai';
import { Anthropic } from '@anthropic-ai/sdk';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { Pinecone } from '@pinecone-database/pinecone';
import { PostgresVectorStore } from '../vector/PostgresVectorStore';

export interface AIModelConfig {
  name: string;
  provider: 'openai' | 'anthropic' | 'google' | 'local';
  model: string;
  role: 'planner' | 'coder' | 'ux' | 'safety' | 'compliance';
  capabilities: string[];
  contextWindow: number;
  costPerToken: number;
}

export interface AIRequest {
  task: string;
  context?: any;
  requirements?: string[];
  constraints?: string[];
  previousResults?: any[];
}

export interface AIResponse {
  model: string;
  content: string;
  confidence: number;
  reasoning: string;
  metadata: {
    tokensUsed: number;
    cost: number;
    processingTime: number;
  };
}

export class AIRouter {
  private openai: OpenAI;
  private anthropic: Anthropic;
  private gemini: GoogleGenerativeAI;
  private vectorStore: PostgresVectorStore;
  private models!: Map<string, AIModelConfig>;

  constructor() {
    // Initialize AI providers
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });

    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    this.gemini = new GoogleGenerativeAI(process.env.GOOGLE_AI_API_KEY!);

    this.vectorStore = new PostgresVectorStore();

    this.initializeModels();
  }

  private initializeModels() {
    this.models = new Map([
      ['gpt5-coder', {
        name: 'GPT-5 Coder',
        provider: 'openai',
        model: 'gpt-5',
        role: 'coder',
        capabilities: ['code_generation', 'debugging', 'refactoring', 'testing'],
        contextWindow: 128000,
        costPerToken: 0.00002
      }],
      ['claude-ux', {
        name: 'Claude 4.5 UX',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        role: 'ux',
        capabilities: ['ui_design', 'accessibility', 'user_experience', 'usability'],
        contextWindow: 200000,
        costPerToken: 0.000015
      }],
      ['gemini-planner', {
        name: 'Gemini 2.5 Planner',
        provider: 'google',
        model: 'gemini-1.5-pro',
        role: 'planner',
        capabilities: ['planning', 'analysis', 'architecture', 'research'],
        contextWindow: 2097152,
        costPerToken: 0.0000025
      }],
      ['claude-safety', {
        name: 'Claude 4.5 Safety',
        provider: 'anthropic',
        model: 'claude-3-5-sonnet-20241022',
        role: 'safety',
        capabilities: ['security_review', 'privacy_analysis', 'risk_assessment'],
        contextWindow: 200000,
        costPerToken: 0.000015
      }],
      ['starcoder-local', {
        name: 'StarCoder Local',
        provider: 'local',
        model: 'starcoder2-15b',
        role: 'coder',
        capabilities: ['code_completion', 'syntax_checking', 'optimization'],
        contextWindow: 8192,
        costPerToken: 0
      }]
    ]);
  }

  async routeRequest(request: AIRequest): Promise<AIResponse[]> {
    const startTime = Date.now();

    // Get relevant models for the task
    const relevantModels = this.selectModelsForTask(request);

    // Execute requests in parallel
    const promises = relevantModels.map(async (modelConfig) => {
      try {
        const response = await this.callModel(modelConfig, request);
        return {
          model: modelConfig.name,
          content: response.content,
          confidence: response.confidence,
          reasoning: response.reasoning,
          metadata: {
            tokensUsed: response.tokensUsed,
            cost: response.tokensUsed * modelConfig.costPerToken,
            processingTime: Date.now() - startTime
          }
        };
      } catch (error) {
        console.error(`Error calling ${modelConfig.name}:`, error);
        return {
          model: modelConfig.name,
          content: '',
          confidence: 0,
          reasoning: `Error: ${error}`,
          metadata: {
            tokensUsed: 0,
            cost: 0,
            processingTime: Date.now() - startTime
          }
        };
      }
    });

    const results = await Promise.allSettled(promises);

    return results
      .filter((result): result is PromiseFulfilledResult<AIResponse> => result.status === 'fulfilled')
      .map(result => result.value);
  }

  private selectModelsForTask(request: AIRequest): AIModelConfig[] {
    const selectedModels: AIModelConfig[] = [];

    // Route based on task type and requirements
    if (request.task.includes('code') || request.task.includes('generate') || request.task.includes('debug')) {
      selectedModels.push(this.models.get('gpt5-coder')!);
    }

    if (request.task.includes('ui') || request.task.includes('design') || request.task.includes('accessibility')) {
      selectedModels.push(this.models.get('claude-ux')!);
    }

    if (request.task.includes('plan') || request.task.includes('analyze') || request.task.includes('architecture')) {
      selectedModels.push(this.models.get('gemini-planner')!);
    }

    if (request.task.includes('security') || request.task.includes('privacy') || request.task.includes('compliance')) {
      selectedModels.push(this.models.get('claude-safety')!);
    }

    // Always include local model for fast completion
    if (!selectedModels.some(m => m.provider === 'local')) {
      selectedModels.push(this.models.get('starcoder-local')!);
    }

    return selectedModels;
  }

  private async callModel(modelConfig: AIModelConfig, request: AIRequest): Promise<any> {
    const contextPrompt = this.buildContextPrompt(request);

    switch (modelConfig.provider) {
      case 'openai':
        return this.callOpenAI(modelConfig, contextPrompt);
      case 'anthropic':
        return this.callAnthropic(modelConfig, contextPrompt);
      case 'google':
        return this.callGoogle(modelConfig, contextPrompt);
      case 'local':
        return this.callLocalModel(modelConfig, contextPrompt);
      default:
        throw new Error(`Unsupported provider: ${modelConfig.provider}`);
    }
  }

  private buildContextPrompt(request: AIRequest): string {
    let prompt = `Task: ${request.task}\n\n`;

    if (request.context) {
      prompt += `Context: ${JSON.stringify(request.context)}\n\n`;
    }

    if (request.requirements && request.requirements.length > 0) {
      prompt += `Requirements:\n${request.requirements.map(r => `- ${r}`).join('\n')}\n\n`;
    }

    if (request.constraints && request.constraints.length > 0) {
      prompt += `Constraints:\n${request.constraints.map(c => `- ${c}`).join('\n')}\n\n`;
    }

    if (request.previousResults && request.previousResults.length > 0) {
      prompt += `Previous Results:\n${request.previousResults.map(r => `- ${JSON.stringify(r)}`).join('\n')}\n\n`;
    }

    prompt += 'Please provide a detailed response with reasoning and confidence level.';

    return prompt;
  }

  private async callOpenAI(modelConfig: AIModelConfig, prompt: string): Promise<any> {
    const response = await this.openai.chat.completions.create({
      model: modelConfig.model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 4096,
      temperature: 0.7,
    });

    const content = response.choices[0]?.message?.content || '';
    const tokensUsed = response.usage?.total_tokens || 0;

    return {
      content,
      confidence: 0.8, // Could be enhanced with more sophisticated confidence scoring
      reasoning: 'OpenAI response',
      tokensUsed
    };
  }

  private async callAnthropic(modelConfig: AIModelConfig, prompt: string): Promise<any> {
    const response = await this.anthropic.messages.create({
      model: modelConfig.model,
      max_tokens: 4096,
      temperature: 0.7,
      messages: [{ role: 'user', content: prompt }],
    });

    // Extract content from the first content block, handling different block types
    const firstBlock = response.content[0];
    let content = '';

    if (firstBlock) {
      if (firstBlock.type === 'text') {
        content = firstBlock.text || '';
      } else if (firstBlock.type === 'thinking') {
        // For thinking blocks, we might want to use the thinking content or skip it
        content = firstBlock.thinking || '';
      } else {
        content = '';
      }
    }

    const tokensUsed = response.usage?.input_tokens + response.usage?.output_tokens || 0;

    return {
      content,
      confidence: 0.85,
      reasoning: 'Anthropic response',
      tokensUsed
    };
  }

  private async callGoogle(modelConfig: AIModelConfig, prompt: string): Promise<any> {
    const model = this.gemini.getGenerativeModel({ model: modelConfig.model });
    const result = await model.generateContent(prompt);
    const response = await result.response;
    const content = response.text();
    const tokensUsed = response.usageMetadata?.totalTokenCount || 0;

    return {
      content,
      confidence: 0.75,
      reasoning: 'Google Gemini response',
      tokensUsed
    };
  }

  private async callLocalModel(modelConfig: AIModelConfig, prompt: string): Promise<any> {
    // Placeholder for local model integration
    // This would integrate with local StarCoder or similar models
    return {
      content: 'Local model response placeholder',
      confidence: 0.6,
      reasoning: 'Local model processing',
      tokensUsed: 100
    };
  }

  async getContextualMemory(userId: string, task: string): Promise<any[]> {
    // Retrieve relevant context from vector database
    return this.vectorStore.similaritySearch(task, {
      userId,
      limit: 5
    });
  }

  async storeInteraction(userId: string, request: AIRequest, responses: AIResponse[]): Promise<void> {
    // Store interaction for future context
    await this.vectorStore.addDocuments([{
      content: `Task: ${request.task}\nResponses: ${responses.map(r => r.content).join('\n')}`,
      metadata: {
        userId,
        timestamp: new Date().toISOString(),
        taskType: request.task,
        modelCount: responses.length
      }
    }]);
  }
}

export default AIRouter;

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { TokenEconomyService } from '../billing/TokenEconomyService';

/**
 * Metered AI Service
 * Wraps AI API calls with automatic token tracking and billing
 */

export interface AIRequest {
  userId: string;
  prompt: string;
  context?: string;
  maxTokens?: number;
  temperature?: number;
  model?: 'claude' | 'gpt5' | 'gemini' | 'grok' | 'deepseek';
}

export interface AIResponse {
  text: string;
  tokensUsed: {
    input: number;
    output: number;
    total: number;
  };
  plusultraTokensConsumed: number;
  model: string;
}

export class MeteredAIService {
  private anthropic: Anthropic;
  private openai: OpenAI;
  private gemini: GoogleGenerativeAI;
  private tokenService: TokenEconomyService;

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

    this.tokenService = new TokenEconomyService();
  }

  /**
   * Generate text with automatic metering
   */
  async generate(request: AIRequest): Promise<AIResponse> {
    const model = request.model || 'claude';

    // Pre-check if user has enough tokens (estimate)
    const estimatedTokens = this.estimateTokens(request.prompt, request.context);
    const canConsume = await this.tokenService.canConsumeTokens(
      request.userId,
      estimatedTokens
    );

    if (!canConsume.allowed) {
      throw new Error(canConsume.reason || 'Insufficient tokens');
    }

    // Call appropriate AI service
    let response: AIResponse;

    switch (model) {
      case 'claude':
        response = await this.generateWithClaude(request);
        break;
      case 'gpt5':
        response = await this.generateWithGPT5(request);
        break;
      case 'gemini':
        response = await this.generateWithGemini(request);
        break;
      case 'grok':
        response = await this.generateWithGrok(request);
        break;
      case 'deepseek':
        response = await this.generateWithDeepSeek(request);
        break;
      default:
        throw new Error(`Unsupported model: ${model}`);
    }

    // Record actual token consumption
    await this.tokenService.consumeTokens({
      userId: request.userId,
      apiTokens: response.tokensUsed.total,
      source: model,
      description: `AI generation (${model})`,
      metadata: {
        model: response.model,
        inputTokens: response.tokensUsed.input,
        outputTokens: response.tokensUsed.output,
      },
    });

    return response;
  }

  /**
   * Generate with Claude
   */
  private async generateWithClaude(request: AIRequest): Promise<AIResponse> {
    const prompt = request.context
      ? `${request.context}\n\n${request.prompt}`
      : request.prompt;

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: request.maxTokens || 4096,
      temperature: request.temperature || 1,
      messages: [
        {
          role: 'user',
          content: prompt,
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    const inputTokens = response.usage.input_tokens;
    const outputTokens = response.usage.output_tokens;
    const totalTokens = inputTokens + outputTokens;

    return {
      text: content.text,
      tokensUsed: {
        input: inputTokens,
        output: outputTokens,
        total: totalTokens,
      },
      plusultraTokensConsumed: this.tokenService.convertToPlusultraTokens(totalTokens),
      model: 'claude-sonnet-4-5-20250929',
    };
  }

  /**
   * Generate with GPT-5
   */
  private async generateWithGPT5(request: AIRequest): Promise<AIResponse> {
    const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];

    if (request.context) {
      messages.push({
        role: 'system',
        content: request.context,
      });
    }

    messages.push({
      role: 'user',
      content: request.prompt,
    });

    const response = await this.openai.chat.completions.create({
      model: 'gpt-5',
      messages: messages,
      max_tokens: request.maxTokens || 4096,
      temperature: request.temperature || 1,
    });

    const inputTokens = response.usage?.prompt_tokens || 0;
    const outputTokens = response.usage?.completion_tokens || 0;
    const totalTokens = response.usage?.total_tokens || 0;

    return {
      text: response.choices[0]?.message?.content || '',
      tokensUsed: {
        input: inputTokens,
        output: outputTokens,
        total: totalTokens,
      },
      plusultraTokensConsumed: this.tokenService.convertToPlusultraTokens(totalTokens),
      model: 'gpt-5',
    };
  }

  /**
   * Generate with Gemini
   */
  private async generateWithGemini(request: AIRequest): Promise<AIResponse> {
    const model = this.gemini.getGenerativeModel({ model: 'gemini-2.5-pro' });

    const prompt = request.context
      ? `${request.context}\n\n${request.prompt}`
      : request.prompt;

    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: request.maxTokens || 4096,
        temperature: request.temperature || 1,
      },
    });

    const response = result.response;
    const text = response.text();

    // Gemini doesn't return exact token counts in the same way
    // We'll estimate based on response
    const inputTokens = this.estimateTokens(prompt);
    const outputTokens = this.estimateTokens(text);
    const totalTokens = inputTokens + outputTokens;

    return {
      text,
      tokensUsed: {
        input: inputTokens,
        output: outputTokens,
        total: totalTokens,
      },
      plusultraTokensConsumed: this.tokenService.convertToPlusultraTokens(totalTokens),
      model: 'gemini-2.5-pro',
    };
  }

  /**
   * Generate with Grok (placeholder - would need xAI SDK)
   */
  private async generateWithGrok(request: AIRequest): Promise<AIResponse> {
    // Placeholder implementation - would require xAI SDK
    // For now, fallback to GPT-5
    console.warn('Grok generation not yet implemented, falling back to GPT-5');
    return this.generateWithGPT5(request);
  }

  /**
   * Generate with DeepSeek (placeholder - would need DeepSeek SDK)
   */
  private async generateWithDeepSeek(request: AIRequest): Promise<AIResponse> {
    // Placeholder implementation - would require DeepSeek SDK
    // For now, fallback to Gemini for vision tasks
    console.warn('DeepSeek generation not yet implemented, falling back to Gemini');
    return this.generateWithGemini(request);
  }

  /**
   * Estimate tokens for text (rough approximation)
   */
  private estimateTokens(...texts: (string | undefined)[]): number {
    const text = texts.filter(Boolean).join(' ');
    // Rough estimate: 1 token ≈ 4 characters
    return Math.ceil(text.length / 4);
  }

  /**
   * Generate code with Starcoder (via HuggingFace)
   */
  async generateCode(request: {
    userId: string;
    prompt: string;
    language?: string;
    maxTokens?: number;
  }): Promise<AIResponse> {
    // For now, use Claude for code generation
    // In production, you'd integrate with HuggingFace Starcoder API
    return this.generate({
      userId: request.userId,
      prompt: `Generate ${request.language || 'code'} for: ${request.prompt}`,
      model: 'claude',
      maxTokens: request.maxTokens,
    });
  }

  /**
   * Analyze image (for asset generation)
   */
  async analyzeImage(request: {
    userId: string;
    imageUrl: string;
    prompt: string;
  }): Promise<AIResponse> {
    // Use Claude's vision capabilities
    const response = await this.anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1024,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: {
                type: 'url',
                url: request.imageUrl,
              },
            },
            {
              type: 'text',
              text: request.prompt,
            },
          ],
        },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type');
    }

    const totalTokens = response.usage.input_tokens + response.usage.output_tokens;

    // Record consumption
    await this.tokenService.consumeTokens({
      userId: request.userId,
      apiTokens: totalTokens,
      source: 'claude',
      description: 'Image analysis',
      metadata: {
        imageUrl: request.imageUrl,
      },
    });

    return {
      text: content.text,
      tokensUsed: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
        total: totalTokens,
      },
      plusultraTokensConsumed: this.tokenService.convertToPlusultraTokens(totalTokens),
      model: 'claude-3-5-sonnet-20241022',
    };
  }

  /**
   * Stream generation (for real-time responses)
   */
  async *generateStream(request: AIRequest): AsyncGenerator<{
    chunk: string;
    tokensUsed: number;
  }> {
    const model = request.model || 'claude';

    if (model !== 'claude') {
      throw new Error('Streaming only supported for Claude');
    }

    const prompt = request.context
      ? `${request.context}\n\n${request.prompt}`
      : request.prompt;

    const stream = await this.anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: request.maxTokens || 4096,
      temperature: request.temperature || 1,
      messages: [{ role: 'user', content: prompt }],
      stream: true,
    });

    let totalTokens = 0;

    for await (const event of stream) {
      if (event.type === 'content_block_delta') {
        if (event.delta.type === 'text_delta') {
          const chunk = event.delta.text;
          const estimatedTokens = this.estimateTokens(chunk);
          totalTokens += estimatedTokens;

          yield {
            chunk,
            tokensUsed: totalTokens,
          };
        }
      }

      if (event.type === 'message_stop') {
        // Record final consumption
        await this.tokenService.consumeTokens({
          userId: request.userId,
          apiTokens: totalTokens,
          source: 'claude',
          description: 'AI generation (streaming)',
        });
      }
    }
  }

  /**
   * Batch processing with token management
   */
  async generateBatch(requests: AIRequest[]): Promise<AIResponse[]> {
    const results: AIResponse[] = [];

    for (const request of requests) {
      try {
        const response = await this.generate(request);
        results.push(response);
      } catch (error) {
        console.error('Batch generation failed for request:', error);
        // Continue with other requests
      }
    }

    return results;
  }

  /**
   * Get cost estimate without consuming tokens
   */
  async estimateCost(request: {
    prompt: string;
    context?: string;
    maxTokens?: number;
  }): Promise<{
    estimatedApiTokens: number;
    estimatedPlusultraTokens: number;
    canAfford: Record<string, boolean>;
  }> {
    const estimatedTokens = this.estimateTokens(
      request.prompt,
      request.context
    );

    // Add estimated output tokens
    const estimatedOutputTokens = request.maxTokens || 1000;
    const totalEstimated = estimatedTokens + estimatedOutputTokens;

    const estimate = this.tokenService.estimateCost(totalEstimated);

    return {
      estimatedApiTokens: totalEstimated,
      estimatedPlusultraTokens: (estimate as any).plusultraTokens || estimate.tiers.free.plusultraTokens,
      canAfford: {
        free: estimate.tiers.free.canAfford,
        starter: estimate.tiers.starter.canAfford,
        pro: estimate.tiers.pro.canAfford,
        enterprise: estimate.tiers.enterprise.canAfford,
      },
    };
  }
}

export default MeteredAIService;

/**
 * AI Orchestration Service
 */

import { apiClient } from './api';

export interface OrchestrationRequest {
  task: string;
  context?: string;
  taskType: 'code_generation' | 'app_design' | 'project_planning' | 'debugging' | 'optimization';
  requireConsensus?: boolean;
  models?: Array<'claude' | 'gpt4' | 'gemini' | 'grok'>;
  maxTokensPerModel?: number;
}

export interface OrchestrationResponse {
  finalResponse: string;
  allResponses: Array<{
    model: string;
    response: string;
    tokensUsed: {
      input: number;
      output: number;
      total: number;
    };
    confidence?: number;
    reasoning?: string;
  }>;
  totalTokensUsed: {
    claude: number;
    gpt4: number;
    gemini: number;
    grok: number;
    total: number;
  };
  plusultraTokensConsumed: number;
  consensusReached: boolean;
  votingResults?: {
    winner: string;
    votes: Record<string, number>;
    agreement: number;
  };
  taskCompleted: boolean;
}

export interface ProjectManagerRequest {
  projectDescription: string;
  platform: 'ios' | 'android' | 'web' | 'all';
  features?: string[];
}

export interface ProjectManagerResponse {
  success: boolean;
  projectPlan: string;
  codeGenerated: string;
  assetsGenerated: string[];
  totalTokensUsed: number;
  plusultraTokensConsumed: number;
  stages: {
    planning: OrchestrationResponse;
    design: OrchestrationResponse;
    coding: OrchestrationResponse;
    review: OrchestrationResponse;
  };
}

export class AIOrchestrationService {
  async orchestrate(request: OrchestrationRequest): Promise<OrchestrationResponse> {
    const response = await apiClient.post<OrchestrationResponse>('/api/v1/ai/orchestrate', request);

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'AI orchestration failed');
  }

  async manageProject(request: ProjectManagerRequest): Promise<ProjectManagerResponse> {
    const response = await apiClient.post<ProjectManagerResponse>('/api/v1/ai/project-manager', request);

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Project management failed');
  }

  async getModelStatus(): Promise<{
    available: Array<'claude' | 'gpt4' | 'gemini' | 'grok'>;
    unavailable: Array<'claude' | 'gpt4' | 'gemini' | 'grok'>;
  }> {
    const response = await apiClient.get<{
      available: Array<'claude' | 'gpt4' | 'gemini' | 'grok'>;
      unavailable: Array<'claude' | 'gpt4' | 'gemini' | 'grok'>;
    }>('/api/v1/ai/status');

    return response.success ? response.data! : { available: [], unavailable: ['claude', 'gpt4', 'gemini', 'grok'] };
  }
}

export const aiOrchestrationService = new AIOrchestrationService();

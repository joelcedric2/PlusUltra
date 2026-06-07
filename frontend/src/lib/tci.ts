/**
 * Temporal Code Intelligence Service
 */

import { apiClient } from './api';

export interface TCIQuery {
  question: string;
  context?: {
    filePaths?: string[];
    timeRange?: {
      start: string; // ISO string
      end: string;   // ISO string
    };
    sessionId?: string;
  };
}

export interface TCIResponse {
  answer: string;
  confidence: number;
  supportingEvidence: Array<{
    type: 'historical_change' | 'prediction' | 'replay' | 'intent';
    data: any;
    relevance: number;
  }>;
  suggestions?: string[];
  alternativeApproaches?: Array<{
    description: string;
    pros: string[];
    cons: string[];
  }>;
}

export interface CodeEvent {
  filePath: string;
  changeType: 'create' | 'modify' | 'delete' | 'refactor' | 'fix';
  oldContent?: string;
  newContent: string;
  context: {
    userId: string;
    sessionId: string;
    prompt?: string;
    agents: string[];
    workflowType: string;
  };
  metadata?: Record<string, any>;
}

export interface SimulationRequest {
  proposedChanges: Array<{
    filePath: string;
    changeType: string;
    description: string;
    estimatedImpact: {
      linesChanged: number;
      complexity: 'low' | 'medium' | 'high';
    };
  }>;
  context: {
    currentFileCount: number;
    teamSize: number;
    projectAge: number;
    technologyStack: string[];
  };
  predictionHorizon?: number;
}

export interface EvolutionQuery {
  filePaths: string[];
  since?: string; // ISO string
  horizonDays?: number;
}

export class TCIService {
  async query(request: TCIQuery): Promise<TCIResponse> {
    const response = await apiClient.post<TCIResponse>('/api/v1/temporal/query', request);

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'TCI query failed');
  }

  async logCodeEvent(event: CodeEvent): Promise<void> {
    const response = await apiClient.post('/api/v1/temporal/log-change', event);

    if (!response.success) {
      throw new Error(response.error || 'Failed to log code event');
    }
  }

  async getContext(filePaths?: string[], sessionId?: string): Promise<{
    evolution: any[];
    currentState: Record<string, string>;
    predictions: any[];
    insights: string[];
  }> {
    const params = new URLSearchParams();
    if (filePaths) params.append('filePaths', filePaths.join(','));
    if (sessionId) params.append('sessionId', sessionId);

    const response = await apiClient.get<{
      evolution: any[];
      currentState: Record<string, string>;
      predictions: any[];
      insights: string[];
    }>(`/api/v1/temporal/context?${params.toString()}`);

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Failed to get context');
  }

  async simulateChanges(request: SimulationRequest): Promise<any> {
    const response = await apiClient.post('/api/v1/temporal/simulate', request);

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Simulation failed');
  }

  async getEvolution(query: EvolutionQuery): Promise<any> {
    const params = new URLSearchParams();
    params.append('filePaths', query.filePaths.join(','));
    if (query.since) params.append('since', query.since);
    if (query.horizonDays) params.append('horizonDays', query.horizonDays.toString());

    const response = await apiClient.get(`/api/v1/temporal/evolution?${params.toString()}`);

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Failed to get evolution');
  }

  async explainCode(filePath: string, lineRange?: string): Promise<any> {
    const params = new URLSearchParams();
    params.append('filePath', filePath);
    if (lineRange) params.append('lineRange', lineRange);

    const response = await apiClient.get(`/api/v1/temporal/explain?${params.toString()}`);

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Failed to explain code');
  }

  async predictEvolution(filePaths: string[], horizonDays: number = 90): Promise<any> {
    const params = new URLSearchParams();
    params.append('filePaths', filePaths.join(','));
    params.append('horizonDays', horizonDays.toString());

    const response = await apiClient.get(`/api/v1/temporal/predict?${params.toString()}`);

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Prediction failed');
  }

  async getAlternatives(filePath: string, changeId?: string): Promise<any> {
    const params = new URLSearchParams();
    params.append('filePath', filePath);
    if (changeId) params.append('changeId', changeId);

    const response = await apiClient.get(`/api/v1/temporal/alternatives?${params.toString()}`);

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Failed to get alternatives');
  }
}

export const tciService = new TCIService();

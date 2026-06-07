/**
 * TCI API Client
 *
 * React Query hooks for TCI endpoints.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  TCIAnalysisResponse,
  TCIFeedbackRequest,
  TCIUsageStats,
  AnalysisType,
} from './types';
import { useAuth } from '@/contexts/AuthContext'; // Import useAuth

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

// Helper for API calls
async function apiCall<T>(endpoint: string, options?: RequestInit, token?: string): Promise<T> {
  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options?.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    headers,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: response.statusText }));
    throw new Error(error.error || error.message || 'API request failed');
  }

  return response.json();
}

// Analyze code (full or quick)
export interface AnalyzeCodeRequest {
  code: string;
  language: 'typescript' | 'javascript' | 'python' | 'go' | 'rust';
  filePath?: string;
  proposedChange?: string;
  implementFixes?: boolean;
}

export function useAnalyzeCode(type: AnalysisType = 'quick') {
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth(); // Use auth context

  return useMutation({
    mutationFn: async (request: AnalyzeCodeRequest) => {
      if (!isAuthenticated || !user) {
        throw new Error('User not authenticated');
      }
      const endpoint =
        type === 'quick' ? '/api/v1/tci/analyze/quick' : '/api/v1/tci/analyze';

      return apiCall<TCIAnalysisResponse>(endpoint, {
        method: 'POST',
        body: JSON.stringify(request),
        headers: {
          'X-User-Tier': user.tier, // Use user tier from auth context
        },
      }, user.token); // Pass token to apiCall
    },
    onSuccess: (data) => {
      // Cache the analysis result
      queryClient.setQueryData(['tci-analysis', data.analysisId], data);

      // Invalidate usage stats to refresh quota
      queryClient.invalidateQueries({ queryKey: ['tci-usage'] });
    },
  });
}

// Get analysis by ID
export function useTCIAnalysis(analysisId: string | null) {
  const { user, isAuthenticated } = useAuth(); // Use auth context

  return useQuery({
    queryKey: ['tci-analysis', analysisId],
    queryFn: async () => {
      if (!isAuthenticated || !user) {
        throw new Error('User not authenticated');
      }
      if (!analysisId) throw new Error('No analysis ID provided');

      return apiCall<{
        analysis: any;
        report: any;
        outcome: any;
      }>(`/api/v1/tci/analysis/${analysisId}`, {}, user.token); // Pass token to apiCall
    },
    enabled: !!analysisId && isAuthenticated,
    staleTime: 60 * 60 * 1000, // 1 hour - analyses don't change
  });
}

// Submit feedback
export function useSubmitFeedback() {
  const queryClient = useQueryClient();
  const { user, isAuthenticated } = useAuth(); // Use auth context

  return useMutation({
    mutationFn: async (feedback: TCIFeedbackRequest) => {
      if (!isAuthenticated || !user) {
        throw new Error('User not authenticated');
      }
      return apiCall<{
        message: string;
        accuracyUpdate: {
          message: string;
          modelsUpdated: string[];
          patternsAdded: number;
          newAccuracies: Record<string, number>;
        };
      }>('/api/v1/tci/feedback', {
        method: 'POST',
        body: JSON.stringify(feedback),
      }, user.token); // Pass token to apiCall
    },
    onSuccess: (_, variables) => {
      // Invalidate the analysis to show feedback was submitted
      queryClient.invalidateQueries({
        queryKey: ['tci-analysis', variables.analysisId]
      });
    },
  });
}

// Get usage statistics
export function useTCIUsage() {
  const { user, isAuthenticated } = useAuth(); // Use auth context

  return useQuery({
    queryKey: ['tci-usage'],
    queryFn: async () => {
      if (!isAuthenticated || !user) {
        throw new Error('User not authenticated');
      }
      return apiCall<TCIUsageStats>('/api/v1/tci/usage', {
        headers: {
          'X-User-Id': user.id, // Use user ID from auth context
        },
      }, user.token); // Pass token to apiCall
    },
    enabled: isAuthenticated,
    staleTime: 30 * 1000, // 30 seconds
    refetchInterval: 60 * 1000, // Refetch every minute
  });
}

// Get cost estimate
export function useCostEstimate(mode: 'full' | 'quick') {
  const { user, isAuthenticated } = useAuth(); // Use auth context

  return useQuery({
    queryKey: ['tci-cost-estimate', mode],
    queryFn: async () => {
      if (!isAuthenticated || !user) {
        throw new Error('User not authenticated');
      }
      return apiCall<{
        mode: string;
        cost: number;
        estimatedTime: string;
        accuracy: string;
        layers: string[];
      }>(`/api/v1/tci/cost-estimate?mode=${mode}`, {}, user.token); // Pass token to apiCall
    },
    enabled: isAuthenticated,
    staleTime: Infinity, // Cost estimates don't change
  });
}

// Admin: Get TCI overview
export function useTCIOverview() {
  const { user, isAuthenticated } = useAuth(); // Use auth context

  return useQuery({
    queryKey: ['tci-admin-overview'],
    queryFn: async () => {
      if (!isAuthenticated || !user || user.role !== 'ADMIN') { // Add role check
        throw new Error('Unauthorized');
      }
      return apiCall<{
        totalAnalyses: number;
        averageConfidence: number;
        averageRisk: number;
        totalCost: number;
        accuracyRate: number;
        recentAnalyses: number;
      }>('/api/v1/admin/tci/overview', {}, user.token); // Pass token to apiCall
    },
    enabled: isAuthenticated && user?.role === 'ADMIN',
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}

// Admin: Get layer performance
export function useTCILayerPerformance() {
  const { user, isAuthenticated } = useAuth(); // Use auth context

  return useQuery({
    queryKey: ['tci-admin-layer-performance'],
    queryFn: async () => {
      if (!isAuthenticated || !user || user.role !== 'ADMIN') { // Add role check
        throw new Error('Unauthorized');
      }
      return apiCall<{
        layers: Array<{
          layer: string;
          model: string;
          accuracy: number;
          confidence: number;
          averageTime: number;
        }>;
      }>('/api/v1/admin/tci/layer-performance', {}, user.token); // Pass token to apiCall
    },
    enabled: isAuthenticated && user?.role === 'ADMIN',
    staleTime: 5 * 60 * 1000,
  });
}

// Admin: Get pattern library stats
export function useTCIPatternLibrary() {
  const { user, isAuthenticated } = useAuth(); // Use auth context

  return useQuery({
    queryKey: ['tci-admin-pattern-library'],
    queryFn: async () => {
      if (!isAuthenticated || !user || user.role !== 'ADMIN') { // Add role check
        throw new Error('Unauthorized');
      }
      return apiCall<{
        totalPatterns: number;
        byCategory: Record<string, number>;
        bySeverity: Record<string, number>;
        topPatterns: Array<{
          name: string;
          category: string;
          severity: string;
          occurrences: number;
          accuracy: number;
        }>;
      }>('/api/v1/admin/tci/pattern-library', {}, user.token); // Pass token to apiCall
    },
    enabled: isAuthenticated && user?.role === 'ADMIN',
    staleTime: 5 * 60 * 1000,
  });
}

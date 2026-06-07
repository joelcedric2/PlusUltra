/**
 * Build and Deployment Service
 */

import { apiClient } from './api';

export interface BuildConfig {
  platform: 'ios' | 'android' | 'all';
  profile?: string;
  clearCache?: boolean;
  autoSubmit?: boolean;
  submitProfile?: string;
  metadata?: {
    name?: string;
    description?: string;
    version?: string;
    buildNumber?: string;
    packageName?: string;
    bundleIdentifier?: string;
  };
}

export interface BuildResult {
  id: string;
  status: 'pending' | 'building' | 'success' | 'failed';
  platform: 'ios' | 'android';
  profile: string;
  buildNumber: string;
  version: string;
  artifacts: Array<{
    type: string;
    url: string;
    size: number;
  }>;
  logs: string[];
  createdAt: string;
  completedAt?: string;
  error?: string;
}

export interface SubmissionResult {
  id: string;
  platform: 'ios' | 'android';
  status: 'pending' | 'processing' | 'success' | 'failed';
  store: 'app-store' | 'play-store';
  buildId: string;
  submittedAt: string;
  completedAt?: string;
  error?: string;
  storeUrl?: string;
  trackingId?: string;
}

export class BuildService {
  async configureEAS(projectPath: string, config: BuildConfig): Promise<void> {
    const response = await apiClient.post('/api/v1/build/configure', {
      projectPath,
      ...config,
    });

    if (!response.success) {
      throw new Error(response.error || 'EAS configuration failed');
    }
  }

  async triggerBuild(projectPath: string, config: BuildConfig): Promise<BuildResult> {
    const response = await apiClient.post<BuildResult>('/api/v1/build/trigger', {
      projectPath,
      ...config,
    });

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Build trigger failed');
  }

  async submitToStore(projectPath: string, config: BuildConfig): Promise<SubmissionResult> {
    const response = await apiClient.post<SubmissionResult>('/api/v1/build/submit', {
      projectPath,
      ...config,
    });

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Store submission failed');
  }

  async getBuildStatus(buildId: string): Promise<BuildResult> {
    const response = await apiClient.get<BuildResult>(`/api/v1/build/${buildId}/status`);

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Failed to get build status');
  }

  async generateAssets(projectPath: string, metadata: BuildConfig['metadata']): Promise<void> {
    const response = await apiClient.post('/api/v1/build/assets', {
      projectPath,
      metadata,
    });

    if (!response.success) {
      throw new Error(response.error || 'Asset generation failed');
    }
  }

  async deploy(projectPath: string, config: BuildConfig & { skipSubmission?: boolean }): Promise<{
    build: BuildResult;
    submission: SubmissionResult | null;
  }> {
    const response = await apiClient.post<{
      build: BuildResult;
      submission: SubmissionResult | null;
    }>('/api/v1/build/deploy', {
      projectPath,
      ...config,
    });

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Deployment failed');
  }
}

export const buildService = new BuildService();

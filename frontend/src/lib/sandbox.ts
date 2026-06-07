/**
 * Sandbox and Preview Service
 */

import { apiClient } from './api';

export interface SandboxConfig {
  userId: string;
  projectId: string;
  workspaceId: string;
  framework: 'nextjs' | 'react-native' | 'expo';
  port?: number;
  memory?: string;
  cpu?: string;
}

export interface SandboxStatus {
  workspaceId: string;
  containerId?: string;
  status: 'creating' | 'running' | 'stopped' | 'error' | 'restarting';
  previewUrl?: string;
  startedAt?: string;
  error?: string;
  logs?: string[];
}

export interface PreviewConnection {
  workspaceId: string;
  userId: string;
  connected: boolean;
  connectedAt: string;
}

export interface PreviewEvent {
  type: 'log' | 'error' | 'reload' | 'status' | 'stats';
  data: any;
  timestamp: string;
}

export class SandboxService {
  private eventSource: EventSource | null = null;

  async createSandbox(config: SandboxConfig, projectPath: string): Promise<SandboxStatus> {
    const response = await apiClient.post<SandboxStatus>('/api/v1/sandbox/create', {
      config,
      projectPath,
    });

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Sandbox creation failed');
  }

  async getSandboxStatus(workspaceId: string): Promise<SandboxStatus> {
    const response = await apiClient.get<SandboxStatus>(`/api/v1/sandbox/${workspaceId}/status`);

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Failed to get sandbox status');
  }

  async startSandbox(workspaceId: string): Promise<SandboxStatus> {
    const response = await apiClient.post<SandboxStatus>(`/api/v1/sandbox/${workspaceId}/start`);

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Failed to start sandbox');
  }

  async stopSandbox(workspaceId: string): Promise<void> {
    const response = await apiClient.post(`/api/v1/sandbox/${workspaceId}/stop`);

    if (!response.success) {
      throw new Error(response.error || 'Failed to stop sandbox');
    }
  }

  async restartSandbox(workspaceId: string): Promise<SandboxStatus> {
    const response = await apiClient.post<SandboxStatus>(`/api/v1/sandbox/${workspaceId}/restart`);

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Failed to restart sandbox');
  }

  async getSandboxLogs(workspaceId: string, limit: number = 100): Promise<string[]> {
    const response = await apiClient.get<{ logs: string[] }>(`/api/v1/sandbox/${workspaceId}/logs?limit=${limit}`);

    if (response.success && response.data) {
      return response.data.logs;
    }

    throw new Error(response.error || 'Failed to get sandbox logs');
  }

  // Live preview WebSocket connection
  connectToPreview(workspaceId: string, userId: string, onEvent: (event: PreviewEvent) => void): void {
    if (this.eventSource) {
      this.eventSource.close();
    }

    const eventSource = new EventSource(`${apiClient['baseURL']}/api/v1/sandbox/${workspaceId}/events?userId=${userId}`);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onEvent(data);
      } catch (error) {
        console.error('Failed to parse preview event:', error);
      }
    };

    eventSource.onerror = (error) => {
      console.error('Preview connection error:', error);
    };

    this.eventSource = eventSource;
  }

  disconnectFromPreview(): void {
    if (this.eventSource) {
      this.eventSource.close();
      this.eventSource = null;
    }
  }

  async uploadFileToSandbox(workspaceId: string, filePath: string, content: string): Promise<void> {
    const response = await apiClient.post(`/api/v1/sandbox/${workspaceId}/files`, {
      filePath,
      content,
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to upload file to sandbox');
    }
  }
}

export const sandboxService = new SandboxService();

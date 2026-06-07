/**
 * API Configuration and Base Client
 */

export const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar?: string;
  tier: string;
  tokenBalance: number;
}

export interface Project {
  id: string;
  name: string;
  description?: string;
  platform: 'ios' | 'android' | 'web' | 'all';
  status: 'draft' | 'in-progress' | 'completed' | 'published';
  createdAt: string;
  updatedAt: string;
  userId: string;
  collaborators: string[];
}

class ApiClient {
  private baseURL: string;
  private token: string | null = null;

  constructor(baseURL: string) {
    this.baseURL = baseURL;
    // Load token from localStorage if available
    this.token = localStorage.getItem('auth_token');
  }

  setToken(token: string) {
    this.token = token;
    localStorage.setItem('auth_token', token);
  }

  clearToken() {
    this.token = null;
    localStorage.removeItem('auth_token');
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseURL}${endpoint}`;

    const config: RequestInit = {
      headers: {
        'Content-Type': 'application/json',
        ...(this.token && { Authorization: `Bearer ${this.token}` }),
        ...options.headers,
      },
      ...options,
    };

    try {
      const response = await fetch(url, config);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }

      const data = await response.json();
      return data;
    } catch (error) {
      console.error(`API request failed: ${endpoint}`, error);
      throw error;
    }
  }

  async get<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'GET' });
  }

  async post<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'POST',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async put<T>(endpoint: string, data?: any): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, {
      method: 'PUT',
      body: data ? JSON.stringify(data) : undefined,
    });
  }

  async delete<T>(endpoint: string): Promise<ApiResponse<T>> {
    return this.request<T>(endpoint, { method: 'DELETE' });
  }
}

export const apiClient = new ApiClient(API_BASE_URL);

export interface Workspace {
  id: string;
  userId: string;
  projectId: string;
  name: string;
  framework: 'nextjs' | 'react-native' | 'expo';
  projectPath: string;
  status: 'creating' | 'running' | 'stopped' | 'error';
  url?: string;
  port?: number;
  createdAt: string;
  updatedAt: string;
  metadata?: Record<string, any>;
}

export interface SandboxHealth {
  status: 'healthy' | 'unhealthy';
  uptime: number;
  memory: {
    used: number;
    total: number;
    percentage: number;
  };
  cpu: {
    used: number;
    percentage: number;
  };
  issues: string[];
  fixes: string[];
}

// Sandbox API functions
export const createWorkspace = async (data: {
  projectId: string;
  userId: string;
  name: string;
  framework: 'nextjs' | 'react-native' | 'expo';
  projectPath: string;
  metadata?: Record<string, any>;
}): Promise<ApiResponse<Workspace>> => {
  return apiClient.post('/api/v1/sandbox/workspace', data);
};

export const getWorkspace = async (workspaceId: string): Promise<ApiResponse<Workspace>> => {
  return apiClient.get(`/api/v1/sandbox/workspace/${workspaceId}`);
};

export const updateWorkspaceFiles = async (
  workspaceId: string,
  userId: string,
  files: Record<string, string>
): Promise<ApiResponse<{ message: string }>> => {
  return apiClient.post(`/api/v1/sandbox/workspace/${workspaceId}/files`, { userId, files });
};

export const getWorkspaceHealth = async (workspaceId: string): Promise<ApiResponse<SandboxHealth>> => {
  return apiClient.get(`/api/v1/sandbox/workspace/${workspaceId}/health`);
};

export const restartWorkspace = async (workspaceId: string, userId: string): Promise<ApiResponse<Workspace>> => {
  return apiClient.post(`/api/v1/sandbox/workspace/${workspaceId}/restart`, { userId });
};

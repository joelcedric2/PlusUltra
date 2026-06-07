/**
 * Authentication Service
 */

import { apiClient, AuthUser } from './api';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  name: string;
  email: string;
  password: string;
  inviteToken?: string;
}

export interface GitHubAuthResponse {
  url: string;
  state: string;
}



export class AuthService {
  async login(credentials: LoginRequest): Promise<{ user: AuthUser; token: string }> {
    const response = await apiClient.post<{ user: AuthUser; token: string }>('/api/v1/auth/login', credentials);

    if (response.success && response.data) {
      apiClient.setToken(response.data.token);
      return response.data;
    }

    throw new Error(response.error || 'Login failed');
  }

  async register(userData: RegisterRequest): Promise<{ user: AuthUser; token: string }> {
    const response = await apiClient.post<{ user: AuthUser; token: string }>('/api/v1/auth/register', userData);

    if (response.success && response.data) {
      apiClient.setToken(response.data.token);
      return response.data;
    }

    throw new Error(response.error || 'Registration failed');
  }

  async getGitHubAuthUrl(): Promise<GitHubAuthResponse> {
    const response = await apiClient.get<GitHubAuthResponse>('/api/v1/auth/github');

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Failed to get GitHub auth URL');
  }

  async handleGitHubCallback(code: string, state: string): Promise<{ user: AuthUser; token: string }> {
    const response = await apiClient.post<{ user: AuthUser; token: string }>('/api/v1/auth/github/callback', {
      code,
      state,
    });

    if (response.success && response.data) {
      apiClient.setToken(response.data.token);
      return response.data;
    }

    throw new Error(response.error || 'GitHub authentication failed');
  }

  async getCurrentUser(): Promise<AuthUser> {
    const response = await apiClient.get<AuthUser>('/api/v1/auth/me');

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Failed to get current user');
  }

  async logout(): Promise<void> {
    try {
      await apiClient.post('/api/v1/auth/logout');
    } catch (error) {
      // Continue with logout even if API call fails
      console.warn('Logout API call failed:', error);
    } finally {
      apiClient.clearToken();
    }
  }

  async refreshToken(): Promise<string> {
    const response = await apiClient.post<{ token: string }>('/api/v1/auth/refresh');

    if (response.success && response.data) {
      apiClient.setToken(response.data.token);
      return response.data.token;
    }

    throw new Error(response.error || 'Token refresh failed');
  }
}

export const authService = new AuthService();

/**
 * Authentication Context and State Management
 *
 * AUTH DISABLED: Currently bypassed with a mock user for development.
 * To re-enable auth, set AUTH_DISABLED to false.
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { authService } from '@/lib/auth';
import { AuthUser } from '@/lib/api';

// Toggle this to re-enable authentication
const AUTH_DISABLED = true;

// Mock user for development when auth is disabled
const MOCK_USER: AuthUser = {
  id: 'dev-user-001',
  email: 'dev@plusultra.ai',
  name: 'Developer',
  avatarUrl: undefined,
  createdAt: new Date().toISOString(),
};

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string, inviteToken?: string) => Promise<void>;
  loginWithGitHub: () => Promise<void>;
  handleGitHubCallback: (code: string, state: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<AuthUser | null>(AUTH_DISABLED ? MOCK_USER : null);
  const [isLoading, setIsLoading] = useState(!AUTH_DISABLED);

  useEffect(() => {
    // Skip auth check if disabled
    if (AUTH_DISABLED) {
      return;
    }
    // Check if user is already authenticated on app start
    checkAuthStatus();
  }, []);

  const checkAuthStatus = async () => {
    if (AUTH_DISABLED) return;
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
    } catch (error) {
      // User is not authenticated
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    if (AUTH_DISABLED) {
      setUser(MOCK_USER);
      return;
    }
    setIsLoading(true);
    try {
      const { user: userData } = await authService.login({ email, password });
      setUser(userData);
    } catch (error) {
      setIsLoading(false);
      throw error;
    }
    setIsLoading(false);
  };

  const register = async (name: string, email: string, password: string, inviteToken?: string) => {
    if (AUTH_DISABLED) {
      setUser(MOCK_USER);
      return;
    }
    setIsLoading(true);
    try {
      const { user: userData } = await authService.register({ name, email, password, inviteToken });
      setUser(userData);
    } catch (error) {
      setIsLoading(false);
      throw error;
    }
    setIsLoading(false);
  };

  const loginWithGitHub = async () => {
    if (AUTH_DISABLED) {
      setUser(MOCK_USER);
      return;
    }
    try {
      const { url } = await authService.getGitHubAuthUrl();
      window.location.href = url;
    } catch (error) {
      throw error;
    }
  };

  const handleGitHubCallback = async (code: string, state: string) => {
    if (AUTH_DISABLED) {
      setUser(MOCK_USER);
      return;
    }
    setIsLoading(true);
    try {
      const { user: userData } = await authService.handleGitHubCallback(code, state);
      setUser(userData);
    } catch (error) {
      setIsLoading(false);
      throw error;
    }
    setIsLoading(false);
  };

  const logout = async () => {
    if (AUTH_DISABLED) {
      // In disabled mode, just reset to mock user
      setUser(MOCK_USER);
      return;
    }
    try {
      await authService.logout();
      setUser(null);
    } catch (error) {
      // Even if logout fails, clear local state
      setUser(null);
      throw error;
    }
  };

  const refreshUser = async () => {
    if (AUTH_DISABLED) return;
    try {
      const currentUser = await authService.getCurrentUser();
      setUser(currentUser);
    } catch (error) {
      setUser(null);
      throw error;
    }
  };

  const value: AuthContextType = {
    user,
    isLoading,
    isAuthenticated: AUTH_DISABLED ? true : !!user,
    login,
    register,
    loginWithGitHub,
    handleGitHubCallback,
    logout,
    refreshUser,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

export { AuthContext };

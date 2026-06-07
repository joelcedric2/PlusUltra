import { createClient, SupabaseClient, User, Session, AuthError } from '@supabase/supabase-js';
import * as crypto from 'crypto';

/**
 * Supabase Authentication Service
 * Handles user authentication, OAuth, and session management
 */

export interface SignUpData {
  email: string;
  password: string;
  userData?: {
    fullName?: string;
    avatarUrl?: string;
    tier?: 'free' | 'starter' | 'pro' | 'enterprise';
  };
}

export interface SignInData {
  email: string;
  password: string;
}

export interface OAuthProvider {
  provider: 'google' | 'github' | 'apple' | 'azure' | 'gitlab' | 'bitbucket';
  redirectUrl?: string;
  scopes?: string;
}

export interface UserProfile {
  id: string;
  email: string;
  fullName?: string;
  avatarUrl?: string;
  tier: 'free' | 'starter' | 'pro' | 'enterprise';
  stripeCustomerId?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface SessionData {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: User;
}

export class SupabaseAuthService {
  private supabase: SupabaseClient;

  constructor(
    supabaseUrl: string = process.env.SUPABASE_URL || '',
    supabaseKey: string = process.env.SUPABASE_ANON_KEY || ''
  ) {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase URL and key are required');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Sign up a new user
   */
  async signUp(data: SignUpData): Promise<{
    user: User | null;
    session: Session | null;
    error: AuthError | null;
  }> {
    try {
      // Sign up the user
      const { data: authData, error: authError } = await this.supabase.auth.signUp({
        email: data.email,
        password: data.password,
        options: {
          data: data.userData,
          emailRedirectTo: process.env.AUTH_REDIRECT_URL,
        },
      });

      if (authError) {
        return { user: null, session: null, error: authError };
      }

      // Create user profile
      if (authData.user) {
        await this.createUserProfile({
          userId: authData.user.id,
          email: data.email,
          fullName: data.userData?.fullName,
          avatarUrl: data.userData?.avatarUrl,
          tier: data.userData?.tier || 'free',
        });
      }

      return {
        user: authData.user,
        session: authData.session,
        error: null,
      };
    } catch (error) {
      console.error('Sign up failed:', error);
      return {
        user: null,
        session: null,
        error: error as AuthError,
      };
    }
  }

  /**
   * Sign in an existing user
   */
  async signIn(data: SignInData): Promise<{
    user: User | null;
    session: Session | null;
    error: AuthError | null;
  }> {
    try {
      const { data: authData, error: authError } = await this.supabase.auth.signInWithPassword({
        email: data.email,
        password: data.password,
      });

      if (authError) {
        return { user: null, session: null, error: authError };
      }

      // Update last sign in
      if (authData.user) {
        await this.updateUserProfile(authData.user.id, {
          lastSignInAt: new Date(),
        });
      }

      return {
        user: authData.user,
        session: authData.session,
        error: null,
      };
    } catch (error) {
      console.error('Sign in failed:', error);
      return {
        user: null,
        session: null,
        error: error as AuthError,
      };
    }
  }

  /**
   * Sign out user
   */
  async signOut(): Promise<{ error: AuthError | null }> {
    try {
      const { error } = await this.supabase.auth.signOut();
      return { error };
    } catch (error) {
      console.error('Sign out failed:', error);
      return { error: error as AuthError };
    }
  }

  /**
   * Get OAuth URL for provider
   */
  async getOAuthUrl(config: OAuthProvider): Promise<{
    url: string | null;
    error: AuthError | null;
  }> {
    try {
      const { data, error } = await this.supabase.auth.signInWithOAuth({
        provider: config.provider,
        options: {
          redirectTo: config.redirectUrl || process.env.OAUTH_REDIRECT_URL,
          scopes: config.scopes,
        },
      });

      if (error) {
        return { url: null, error };
      }

      return { url: data.url, error: null };
    } catch (error) {
      console.error('OAuth URL generation failed:', error);
      return { url: null, error: error as AuthError };
    }
  }

  /**
   * Handle OAuth callback
   */
  async handleOAuthCallback(code: string): Promise<{
    user: User | null;
    session: Session | null;
    error: AuthError | null;
  }> {
    try {
      const { data, error } = await this.supabase.auth.exchangeCodeForSession(code);

      if (error) {
        return { user: null, session: null, error };
      }

      // Check if user profile exists, create if not
      if (data.user) {
        const profile = await this.getUserProfile(data.user.id);
        if (!profile) {
          await this.createUserProfile({
            userId: data.user.id,
            email: data.user.email || '',
            fullName: data.user.user_metadata?.full_name,
            avatarUrl: data.user.user_metadata?.avatar_url,
            tier: 'free',
          });
        }
      }

      return {
        user: data.user,
        session: data.session,
        error: null,
      };
    } catch (error) {
      console.error('OAuth callback failed:', error);
      return { user: null, session: null, error: error as AuthError };
    }
  }

  /**
   * Refresh session
   */
  async refreshSession(refreshToken: string): Promise<{
    session: Session | null;
    error: AuthError | null;
  }> {
    try {
      const { data, error } = await this.supabase.auth.refreshSession({
        refresh_token: refreshToken,
      });

      return {
        session: data.session,
        error: error,
      };
    } catch (error) {
      console.error('Session refresh failed:', error);
      return { session: null, error: error as AuthError };
    }
  }

  /**
   * Get current user
   */
  async getCurrentUser(): Promise<User | null> {
    try {
      const { data: { user } } = await this.supabase.auth.getUser();
      return user;
    } catch (error) {
      console.error('Get current user failed:', error);
      return null;
    }
  }

  /**
   * Get current session
   */
  async getCurrentSession(): Promise<Session | null> {
    try {
      const { data: { session } } = await this.supabase.auth.getSession();
      return session;
    } catch (error) {
      console.error('Get current session failed:', error);
      return null;
    }
  }

  /**
   * Reset password
   */
  async resetPassword(email: string): Promise<{ error: AuthError | null }> {
    try {
      const { error } = await this.supabase.auth.resetPasswordForEmail(email, {
        redirectTo: process.env.PASSWORD_RESET_REDIRECT_URL,
      });

      return { error };
    } catch (error) {
      console.error('Password reset failed:', error);
      return { error: error as AuthError };
    }
  }

  /**
   * Update password
   */
  async updatePassword(newPassword: string): Promise<{ error: AuthError | null }> {
    try {
      const { error } = await this.supabase.auth.updateUser({
        password: newPassword,
      });

      return { error };
    } catch (error) {
      console.error('Password update failed:', error);
      return { error: error as AuthError };
    }
  }

  /**
   * Verify email with OTP
   */
  async verifyEmail(email: string, token: string): Promise<{
    user: User | null;
    session: Session | null;
    error: AuthError | null;
  }> {
    try {
      const { data, error } = await this.supabase.auth.verifyOtp({
        email,
        token,
        type: 'email',
      });

      return {
        user: data.user,
        session: data.session,
        error,
      };
    } catch (error) {
      console.error('Email verification failed:', error);
      return { user: null, session: null, error: error as AuthError };
    }
  }

  /**
   * Send magic link
   */
  async sendMagicLink(email: string): Promise<{ error: AuthError | null }> {
    try {
      const { error } = await this.supabase.auth.signInWithOtp({
        email,
        options: {
          emailRedirectTo: process.env.MAGIC_LINK_REDIRECT_URL,
        },
      });

      return { error };
    } catch (error) {
      console.error('Magic link failed:', error);
      return { error: error as AuthError };
    }
  }

  /**
   * Create user profile
   */
  private async createUserProfile(data: {
    userId: string;
    email: string;
    fullName?: string;
    avatarUrl?: string;
    tier: 'free' | 'starter' | 'pro' | 'enterprise';
  }): Promise<void> {
    try {
      const { error } = await this.supabase.from('users').insert({
        id: data.userId,
        email: data.email,
        full_name: data.fullName,
        avatar_url: data.avatarUrl,
        tier: data.tier,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });

      if (error) {
        console.error('Failed to create user profile:', error);
        throw error;
      }
    } catch (error) {
      console.error('Create user profile failed:', error);
      throw error;
    }
  }

  /**
   * Get user profile
   */
  async getUserProfile(userId: string): Promise<UserProfile | null> {
    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('*')
        .eq('id', userId)
        .single();

      if (error) {
        console.error('Failed to get user profile:', error);
        return null;
      }

      return {
        id: data.id,
        email: data.email,
        fullName: data.full_name,
        avatarUrl: data.avatar_url,
        tier: data.tier,
        stripeCustomerId: data.stripe_customer_id,
        metadata: data.metadata,
        createdAt: new Date(data.created_at),
        updatedAt: new Date(data.updated_at),
      };
    } catch (error) {
      console.error('Get user profile failed:', error);
      return null;
    }
  }

  /**
   * Update user profile
   */
  async updateUserProfile(
    userId: string,
    updates: Partial<{
      fullName: string;
      avatarUrl: string;
      tier: 'free' | 'starter' | 'pro' | 'enterprise';
      stripeCustomerId: string;
      metadata: Record<string, any>;
      lastSignInAt: Date;
    }>
  ): Promise<{ error: Error | null }> {
    try {
      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (updates.fullName !== undefined) updateData.full_name = updates.fullName;
      if (updates.avatarUrl !== undefined) updateData.avatar_url = updates.avatarUrl;
      if (updates.tier !== undefined) updateData.tier = updates.tier;
      if (updates.stripeCustomerId !== undefined) updateData.stripe_customer_id = updates.stripeCustomerId;
      if (updates.metadata !== undefined) updateData.metadata = updates.metadata;
      if (updates.lastSignInAt !== undefined) updateData.last_sign_in_at = updates.lastSignInAt.toISOString();

      const { error } = await this.supabase
        .from('users')
        .update(updateData)
        .eq('id', userId);

      return { error };
    } catch (error) {
      console.error('Update user profile failed:', error);
      return { error: error as Error };
    }
  }

  /**
   * Delete user account
   */
  async deleteUser(userId: string): Promise<{ error: Error | null }> {
    try {
      // Delete from auth (this will cascade to user profile via RLS)
      const { error: authError } = await this.supabase.auth.admin.deleteUser(userId);

      if (authError) {
        return { error: authError };
      }

      // Delete user profile (if not cascaded)
      const { error: profileError } = await this.supabase
        .from('users')
        .delete()
        .eq('id', userId);

      return { error: profileError };
    } catch (error) {
      console.error('Delete user failed:', error);
      return { error: error as Error };
    }
  }

  /**
   * Generate API key for user
   */
  async generateApiKey(userId: string, name: string): Promise<{
    apiKey: string;
    error: Error | null;
  }> {
    try {
      const apiKey = crypto.randomBytes(32).toString('hex');
      const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');

      const { error } = await this.supabase.from('api_keys').insert({
        user_id: userId,
        name: name,
        key_hash: hashedKey,
        created_at: new Date().toISOString(),
      });

      if (error) {
        return { apiKey: '', error };
      }

      // Return the plain key (only time it's visible)
      return { apiKey, error: null };
    } catch (error) {
      console.error('Generate API key failed:', error);
      return { apiKey: '', error: error as Error };
    }
  }

  /**
   * Validate API key
   */
  async validateApiKey(apiKey: string): Promise<{
    valid: boolean;
    userId?: string;
  }> {
    try {
      const hashedKey = crypto.createHash('sha256').update(apiKey).digest('hex');

      const { data, error } = await this.supabase
        .from('api_keys')
        .select('user_id')
        .eq('key_hash', hashedKey)
        .single();

      if (error || !data) {
        return { valid: false };
      }

      return { valid: true, userId: data.user_id };
    } catch (error) {
      console.error('Validate API key failed:', error);
      return { valid: false };
    }
  }

  /**
   * Revoke API key
   */
  async revokeApiKey(userId: string, keyId: string): Promise<{ error: Error | null }> {
    try {
      const { error } = await this.supabase
        .from('api_keys')
        .delete()
        .eq('id', keyId)
        .eq('user_id', userId);

      return { error };
    } catch (error) {
      console.error('Revoke API key failed:', error);
      return { error: error as Error };
    }
  }
}

export default SupabaseAuthService;

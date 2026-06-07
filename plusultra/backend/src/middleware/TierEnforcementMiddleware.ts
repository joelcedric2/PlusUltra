import { FastifyRequest, FastifyReply } from 'fastify';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { Tier, TokenEconomyService } from '../services/billing/TokenEconomyService';

/**
 * Tier Enforcement Middleware
 * Enforces tier-based limits on API endpoints
 */

export interface TierRequirement {
  minimumTier?: Tier;
  requiresToken?: boolean;
  estimatedTokenCost?: number;
  requiresFeature?: 'tci' | 'custom_domains' | 'advanced_integrations' | 'custom_branding';
  maxProjects?: boolean;
  maxCollaborators?: boolean;
  maxStorage?: boolean;
}

export class TierEnforcementMiddleware {
  private supabase: SupabaseClient;
  private tokenService: TokenEconomyService;

  // Tier hierarchy for minimum tier checks
  private tierHierarchy: Record<Tier, number> = {
    free: 0,
    starter: 1,
    pro: 2,
    enterprise: 3,
  };

  constructor() {
    this.supabase = createClient(
      process.env.SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || ''
    );

    this.tokenService = new TokenEconomyService();
  }

  /**
   * Enforce tier requirements
   */
  enforce(requirements: TierRequirement) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Get user from request (assumes authentication middleware has run)
        const userId = (request as any).user?.id;

        if (!userId) {
          return reply.code(401).send({
            error: 'Unauthorized',
            message: 'Authentication required',
          });
        }

        // Get user's tier and limits
        const { data: user } = await this.supabase
          .from('users')
          .select('tier')
          .eq('id', userId)
          .single();

        if (!user) {
          return reply.code(404).send({
            error: 'User not found',
          });
        }

        const userTier = (user.tier as Tier) || 'free';
        const limits = this.tokenService.getTierLimits(userTier);

        // Check minimum tier requirement
        if (requirements.minimumTier) {
          if (
            this.tierHierarchy[userTier] <
            this.tierHierarchy[requirements.minimumTier]
          ) {
            return reply.code(403).send({
              error: 'Insufficient tier',
              message: `This feature requires ${requirements.minimumTier} tier or higher`,
              currentTier: userTier,
              requiredTier: requirements.minimumTier,
              upgradeUrl: '/billing/upgrade',
            });
          }
        }

        // Check feature requirements
        if (requirements.requiresFeature) {
          const hasFeature = this.checkFeatureAccess(
            limits,
            requirements.requiresFeature
          );

          if (!hasFeature) {
            return reply.code(403).send({
              error: 'Feature not available',
              message: `This feature is not available in your current tier`,
              currentTier: userTier,
              feature: requirements.requiresFeature,
              upgradeUrl: '/billing/upgrade',
            });
          }
        }

        // Check token requirements
        if (requirements.requiresToken && requirements.estimatedTokenCost) {
          const canConsume = await this.tokenService.canConsumeTokens(
            userId,
            requirements.estimatedTokenCost
          );

          if (!canConsume.allowed) {
            return reply.code(429).send({
              error: 'Insufficient tokens',
              message: canConsume.reason,
              currentTier: userTier,
              upgradeUrl: '/billing/upgrade',
            });
          }
        }

        // Check project limit
        if (requirements.maxProjects) {
          const projectCount = await this.getProjectCount(userId);

          if (limits.maxProjects !== -1 && projectCount >= limits.maxProjects) {
            return reply.code(403).send({
              error: 'Project limit reached',
              message: `You have reached the maximum number of projects (${limits.maxProjects}) for your tier`,
              currentTier: userTier,
              currentCount: projectCount,
              limit: limits.maxProjects,
              upgradeUrl: '/billing/upgrade',
            });
          }
        }

        // Check collaborator limit
        if (requirements.maxCollaborators) {
          const collaboratorCount = await this.getCollaboratorCount(userId);

          if (
            limits.maxCollaborators !== -1 &&
            collaboratorCount >= limits.maxCollaborators
          ) {
            return reply.code(403).send({
              error: 'Collaborator limit reached',
              message: `You have reached the maximum number of collaborators (${limits.maxCollaborators}) for your tier`,
              currentTier: userTier,
              currentCount: collaboratorCount,
              limit: limits.maxCollaborators,
              upgradeUrl: '/billing/upgrade',
            });
          }
        }

        // Check storage limit
        if (requirements.maxStorage) {
          const storageUsedGB = await this.getStorageUsed(userId);

          if (limits.storageGB !== -1 && storageUsedGB >= limits.storageGB) {
            return reply.code(403).send({
              error: 'Storage limit reached',
              message: `You have reached the maximum storage (${limits.storageGB}GB) for your tier`,
              currentTier: userTier,
              currentUsage: storageUsedGB,
              limit: limits.storageGB,
              upgradeUrl: '/billing/upgrade',
            });
          }
        }

        // All checks passed, continue to route handler
      } catch (error) {
        console.error('Tier enforcement failed:', error);
        return reply.code(500).send({
          error: 'Internal server error',
          message: 'Failed to enforce tier requirements',
        });
      }
    };
  }

  /**
   * Check if user has access to feature
   */
  private checkFeatureAccess(
    limits: any,
    feature: TierRequirement['requiresFeature']
  ): boolean {
    switch (feature) {
      case 'tci':
        return limits.hasTCI;
      case 'custom_domains':
        return limits.hasCustomDomains;
      case 'advanced_integrations':
        return limits.hasAdvancedIntegrations;
      case 'custom_branding':
        return limits.hasCustomBranding;
      default:
        return false;
    }
  }

  /**
   * Get project count for user
   */
  private async getProjectCount(userId: string): Promise<number> {
    const { count, error } = await this.supabase
      .from('projects')
      .select('*', { count: 'exact', head: true })
      .eq('owner_id', userId);

    if (error) {
      console.error('Failed to get project count:', error);
      return 0;
    }

    return count || 0;
  }

  /**
   * Get collaborator count for user
   */
  private async getCollaboratorCount(userId: string): Promise<number> {
    // Get all projects owned by user
    const { data: projects } = await this.supabase
      .from('projects')
      .select('id')
      .eq('owner_id', userId);

    if (!projects || projects.length === 0) {
      return 0;
    }

    const projectIds = projects.map((p) => p.id);

    // Count unique collaborators across all projects
    const { data: members } = await this.supabase
      .from('project_members')
      .select('user_id')
      .in('project_id', projectIds)
      .neq('user_id', userId); // Exclude owner

    if (!members) {
      return 0;
    }

    // Get unique collaborators
    const uniqueCollaborators = new Set(members.map((m) => m.user_id));
    return uniqueCollaborators.size;
  }

  /**
   * Get storage used by user (in GB)
   */
  private async getStorageUsed(userId: string): Promise<number> {
    // Get all projects owned by user
    const { data: projects } = await this.supabase
      .from('projects')
      .select('id')
      .eq('owner_id', userId);

    if (!projects || projects.length === 0) {
      return 0;
    }

    const projectIds = projects.map((p) => p.id);

    // Get all assets for these projects
    const { data: assets } = await this.supabase
      .from('project_assets')
      .select('metadata')
      .in('project_id', projectIds);

    if (!assets) {
      return 0;
    }

    // Sum up file sizes (assuming metadata contains size in bytes)
    let totalBytes = 0;
    for (const asset of assets) {
      if (asset.metadata?.size) {
        totalBytes += asset.metadata.size;
      }
    }

    // Convert to GB
    return totalBytes / (1024 * 1024 * 1024);
  }
}

/**
 * Helper function to create enforcement middleware
 */
export function enforceTier(requirements: TierRequirement) {
  const middleware = new TierEnforcementMiddleware();
  return middleware.enforce(requirements);
}

/**
 * Preset enforcement configurations
 */
export const TierPresets = {
  // AI operations that consume tokens
  aiOperation: (estimatedTokens: number): TierRequirement => ({
    requiresToken: true,
    estimatedTokenCost: estimatedTokens,
  }),

  // Project creation
  createProject: (): TierRequirement => ({
    maxProjects: true,
  }),

  // Add collaborator
  addCollaborator: (): TierRequirement => ({
    maxCollaborators: true,
  }),

  // Upload asset
  uploadAsset: (): TierRequirement => ({
    maxStorage: true,
  }),

  // TCI features
  tciFeature: (): TierRequirement => ({
    minimumTier: 'pro',
    requiresFeature: 'tci',
  }),

  // Custom domains
  customDomain: (): TierRequirement => ({
    minimumTier: 'starter',
    requiresFeature: 'custom_domains',
  }),

  // Advanced integrations
  advancedIntegration: (): TierRequirement => ({
    minimumTier: 'pro',
    requiresFeature: 'advanced_integrations',
  }),

  // Custom branding
  customBranding: (): TierRequirement => ({
    minimumTier: 'pro',
    requiresFeature: 'custom_branding',
  }),

  // Starter tier minimum
  starterMinimum: (): TierRequirement => ({
    minimumTier: 'starter',
  }),

  // Pro tier minimum
  proMinimum: (): TierRequirement => ({
    minimumTier: 'pro',
  }),

  // Enterprise only
  enterpriseOnly: (): TierRequirement => ({
    minimumTier: 'enterprise',
  }),
};

export default TierEnforcementMiddleware;

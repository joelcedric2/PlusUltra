import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Project Service
 * Handles CRUD operations for projects and asset management
 */

export interface ProjectData {
  name: string;
  description?: string;
  platform: 'ios' | 'android' | 'both' | 'web';
  framework: 'nextjs' | 'swiftui' | 'flutter' | 'react-native';
  codeUrl?: string;
  repositoryUrl?: string;
  metadata?: Record<string, any>;
}

export interface Project {
  id: string;
  ownerId: string;
  name: string;
  description?: string;
  platform: 'ios' | 'android' | 'both' | 'web';
  framework: 'nextjs' | 'swiftui' | 'flutter' | 'react-native';
  status: 'draft' | 'building' | 'published' | 'failed';
  codeUrl?: string;
  repositoryUrl?: string;
  assets?: ProjectAsset[];
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

export interface ProjectAsset {
  id: string;
  projectId: string;
  type: 'logo' | 'screenshot' | 'feature_graphic' | 'icon' | 'splash';
  platform?: 'ios' | 'android' | 'web';
  url: string;
  cdnUrl?: string;
  metadata?: Record<string, any>;
  version: number;
  createdAt: Date;
}

export interface ProjectMember {
  projectId: string;
  userId: string;
  role: 'viewer' | 'editor' | 'admin' | 'owner';
  invitedAt: Date;
  invitedBy?: string;
}

export class ProjectService {
  private supabase: SupabaseClient;

  constructor(
    supabaseUrl: string = process.env.SUPABASE_URL || '',
    supabaseKey: string = process.env.SUPABASE_SERVICE_ROLE_KEY || ''
  ) {
    if (!supabaseUrl || !supabaseKey) {
      throw new Error('Supabase URL and service role key are required');
    }

    this.supabase = createClient(supabaseUrl, supabaseKey);
  }

  /**
   * Create a new project
   */
  async createProject(userId: string, data: ProjectData): Promise<Project> {
    try {
      // Insert project
      const { data: project, error: projectError } = await this.supabase
        .from('projects')
        .insert({
          owner_id: userId,
          name: data.name,
          description: data.description,
          platform: data.platform,
          framework: data.framework,
          status: 'draft',
          code_url: data.codeUrl,
          repository_url: data.repositoryUrl,
          metadata: data.metadata || {},
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (projectError) {
        throw projectError;
      }

      // Add owner as project member
      await this.addProjectMember({
        projectId: project.id,
        userId: userId,
        role: 'owner',
      });

      return this.mapProjectFromDB(project);
    } catch (error) {
      console.error('Failed to create project:', error);
      throw new Error(`Failed to create project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get project by ID
   */
  async getProject(projectId: string, userId: string): Promise<Project | null> {
    try {
      // Check if user has access
      const hasAccess = await this.checkProjectAccess(projectId, userId);
      if (!hasAccess) {
        throw new Error('Access denied');
      }

      // Fetch project with assets
      const { data: project, error: projectError } = await this.supabase
        .from('projects')
        .select(`
          *,
          project_assets (*)
        `)
        .eq('id', projectId)
        .single();

      if (projectError) {
        throw projectError;
      }

      if (!project) {
        return null;
      }

      return this.mapProjectFromDB(project);
    } catch (error) {
      console.error('Failed to get project:', error);
      return null;
    }
  }

  /**
   * Get all projects for a user
   */
  async getUserProjects(userId: string, options?: {
    limit?: number;
    offset?: number;
    status?: Project['status'];
    platform?: Project['platform'];
  }): Promise<Project[]> {
    try {
      let query = this.supabase
        .from('projects')
        .select(`
          *,
          project_assets (*)
        `)
        .or(`owner_id.eq.${userId},project_members.user_id.eq.${userId}`);

      if (options?.status) {
        query = query.eq('status', options.status);
      }

      if (options?.platform) {
        query = query.eq('platform', options.platform);
      }

      if (options?.limit) {
        query = query.limit(options.limit);
      }

      if (options?.offset) {
        query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
      }

      query = query.order('updated_at', { ascending: false });

      const { data: projects, error } = await query;

      if (error) {
        throw error;
      }

      return projects.map(this.mapProjectFromDB);
    } catch (error) {
      console.error('Failed to get user projects:', error);
      return [];
    }
  }

  /**
   * Update project
   */
  async updateProject(
    projectId: string,
    userId: string,
    updates: Partial<ProjectData & { status?: Project['status'] }>
  ): Promise<Project> {
    try {
      // Check if user has editor or admin access
      const hasAccess = await this.checkProjectAccess(projectId, userId, ['editor', 'admin', 'owner']);
      if (!hasAccess) {
        throw new Error('Access denied');
      }

      const updateData: any = {
        updated_at: new Date().toISOString(),
      };

      if (updates.name !== undefined) updateData.name = updates.name;
      if (updates.description !== undefined) updateData.description = updates.description;
      if (updates.platform !== undefined) updateData.platform = updates.platform;
      if (updates.framework !== undefined) updateData.framework = updates.framework;
      if (updates.status !== undefined) updateData.status = updates.status;
      if (updates.codeUrl !== undefined) updateData.code_url = updates.codeUrl;
      if (updates.repositoryUrl !== undefined) updateData.repository_url = updates.repositoryUrl;
      if (updates.metadata !== undefined) updateData.metadata = updates.metadata;

      const { data: project, error } = await this.supabase
        .from('projects')
        .update(updateData)
        .eq('id', projectId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return this.mapProjectFromDB(project);
    } catch (error) {
      console.error('Failed to update project:', error);
      throw new Error(`Failed to update project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete project
   */
  async deleteProject(projectId: string, userId: string): Promise<void> {
    try {
      // Check if user is owner
      const hasAccess = await this.checkProjectAccess(projectId, userId, ['owner']);
      if (!hasAccess) {
        throw new Error('Only project owner can delete project');
      }

      // Delete assets from storage (R2/S3)
      await this.deleteProjectAssets(projectId);

      // Delete project (will cascade to project_members and project_assets via FK)
      const { error } = await this.supabase
        .from('projects')
        .delete()
        .eq('id', projectId);

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Failed to delete project:', error);
      throw new Error(`Failed to delete project: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Link assets to project
   */
  async linkAssetsToProject(projectId: string, assets: Array<{
    type: ProjectAsset['type'];
    platform?: ProjectAsset['platform'];
    url: string;
    cdnUrl?: string;
    metadata?: Record<string, any>;
  }>): Promise<ProjectAsset[]> {
    try {
      const assetRecords = assets.map(asset => ({
        project_id: projectId,
        type: asset.type,
        platform: asset.platform,
        url: asset.url,
        cdn_url: asset.cdnUrl,
        metadata: asset.metadata || {},
        version: 1,
        created_at: new Date().toISOString(),
      }));

      const { data, error } = await this.supabase
        .from('project_assets')
        .insert(assetRecords)
        .select();

      if (error) {
        throw error;
      }

      return data.map(this.mapAssetFromDB);
    } catch (error) {
      console.error('Failed to link assets:', error);
      throw new Error(`Failed to link assets: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get project assets
   */
  async getProjectAssets(projectId: string, filters?: {
    type?: ProjectAsset['type'];
    platform?: ProjectAsset['platform'];
  }): Promise<ProjectAsset[]> {
    try {
      let query = this.supabase
        .from('project_assets')
        .select('*')
        .eq('project_id', projectId);

      if (filters?.type) {
        query = query.eq('type', filters.type);
      }

      if (filters?.platform) {
        query = query.eq('platform', filters.platform);
      }

      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) {
        throw error;
      }

      return data.map(this.mapAssetFromDB);
    } catch (error) {
      console.error('Failed to get project assets:', error);
      return [];
    }
  }

  /**
   * Update asset
   */
  async updateAsset(
    assetId: string,
    updates: Partial<{
      url: string;
      cdnUrl: string;
      metadata: Record<string, any>;
      version: number;
    }>
  ): Promise<ProjectAsset> {
    try {
      const updateData: any = {};

      if (updates.url !== undefined) updateData.url = updates.url;
      if (updates.cdnUrl !== undefined) updateData.cdn_url = updates.cdnUrl;
      if (updates.metadata !== undefined) updateData.metadata = updates.metadata;
      if (updates.version !== undefined) updateData.version = updates.version;

      const { data, error } = await this.supabase
        .from('project_assets')
        .update(updateData)
        .eq('id', assetId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return this.mapAssetFromDB(data);
    } catch (error) {
      console.error('Failed to update asset:', error);
      throw new Error(`Failed to update asset: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Delete asset
   */
  async deleteAsset(assetId: string): Promise<void> {
    try {
      // Get asset info to delete from storage
      const { data: asset, error: getError } = await this.supabase
        .from('project_assets')
        .select('*')
        .eq('id', assetId)
        .single();

      if (getError) {
        throw getError;
      }

      // Delete from storage (R2/S3)
      // TODO: Implement R2/S3 deletion

      // Delete from database
      const { error } = await this.supabase
        .from('project_assets')
        .delete()
        .eq('id', assetId);

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Failed to delete asset:', error);
      throw new Error(`Failed to delete asset: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Add project member
   */
  async addProjectMember(data: {
    projectId: string;
    userId: string;
    role: ProjectMember['role'];
    invitedBy?: string;
  }): Promise<void> {
    try {
      const { error } = await this.supabase.from('project_members').insert({
        project_id: data.projectId,
        user_id: data.userId,
        role: data.role,
        invited_at: new Date().toISOString(),
        invited_by: data.invitedBy,
      });

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Failed to add project member:', error);
      throw new Error(`Failed to add project member: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Remove project member
   */
  async removeProjectMember(projectId: string, userId: string): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('project_members')
        .delete()
        .eq('project_id', projectId)
        .eq('user_id', userId);

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Failed to remove project member:', error);
      throw new Error(`Failed to remove project member: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Get project members
   */
  async getProjectMembers(projectId: string): Promise<ProjectMember[]> {
    try {
      const { data, error } = await this.supabase
        .from('project_members')
        .select('*')
        .eq('project_id', projectId);

      if (error) {
        throw error;
      }

      return data.map(member => ({
        projectId: member.project_id,
        userId: member.user_id,
        role: member.role,
        invitedAt: new Date(member.invited_at),
        invitedBy: member.invited_by,
      }));
    } catch (error) {
      console.error('Failed to get project members:', error);
      return [];
    }
  }

  /**
   * Update member role
   */
  async updateMemberRole(projectId: string, userId: string, role: ProjectMember['role']): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('project_members')
        .update({ role })
        .eq('project_id', projectId)
        .eq('user_id', userId);

      if (error) {
        throw error;
      }
    } catch (error) {
      console.error('Failed to update member role:', error);
      throw new Error(`Failed to update member role: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Check if user has access to project
   */
  async checkProjectAccess(
    projectId: string,
    userId: string,
    requiredRoles?: ProjectMember['role'][]
  ): Promise<boolean> {
    try {
      // Check if user is owner
      const { data: project, error: projectError } = await this.supabase
        .from('projects')
        .select('owner_id')
        .eq('id', projectId)
        .single();

      if (projectError) {
        return false;
      }

      if (project.owner_id === userId) {
        return true;
      }

      // Check if user is a member
      const { data: member, error: memberError } = await this.supabase
        .from('project_members')
        .select('role')
        .eq('project_id', projectId)
        .eq('user_id', userId)
        .single();

      if (memberError || !member) {
        return false;
      }

      // If specific roles required, check if user has one of them
      if (requiredRoles && requiredRoles.length > 0) {
        return requiredRoles.includes(member.role);
      }

      return true;
    } catch (error) {
      console.error('Failed to check project access:', error);
      return false;
    }
  }

  /**
   * Delete all project assets from storage
   */
  private async deleteProjectAssets(projectId: string): Promise<void> {
    try {
      const assets = await this.getProjectAssets(projectId);

      // TODO: Implement R2/S3 deletion for each asset
      for (const asset of assets) {
        console.log('Would delete asset from storage:', asset.url);
      }
    } catch (error) {
      console.error('Failed to delete project assets:', error);
    }
  }

  /**
   * Map project from database format
   */
  private mapProjectFromDB(dbProject: any): Project {
    return {
      id: dbProject.id,
      ownerId: dbProject.owner_id,
      name: dbProject.name,
      description: dbProject.description,
      platform: dbProject.platform,
      framework: dbProject.framework,
      status: dbProject.status,
      codeUrl: dbProject.code_url,
      repositoryUrl: dbProject.repository_url,
      assets: dbProject.project_assets?.map(this.mapAssetFromDB) || [],
      metadata: dbProject.metadata,
      createdAt: new Date(dbProject.created_at),
      updatedAt: new Date(dbProject.updated_at),
    };
  }

  /**
   * Map asset from database format
   */
  private mapAssetFromDB(dbAsset: any): ProjectAsset {
    return {
      id: dbAsset.id,
      projectId: dbAsset.project_id,
      type: dbAsset.type,
      platform: dbAsset.platform,
      url: dbAsset.url,
      cdnUrl: dbAsset.cdn_url,
      metadata: dbAsset.metadata,
      version: dbAsset.version,
      createdAt: new Date(dbAsset.created_at),
    };
  }
}

export default ProjectService;

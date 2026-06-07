/**
 * Project Management Service
 */

import { apiClient, Project } from './api';

export interface CreateProjectRequest {
  name: string;
  description?: string;
  platform: 'ios' | 'android' | 'web' | 'all';
  template?: string;
  features?: string[];
}

export interface UpdateProjectRequest {
  name?: string;
  description?: string;
  platform?: 'ios' | 'android' | 'web' | 'all';
  status?: 'draft' | 'in-progress' | 'completed' | 'published';
}

export interface ProjectFile {
  path: string;
  content: string;
  lastModified: string;
  size: number;
}

export class ProjectService {
  async createProject(request: CreateProjectRequest): Promise<Project> {
    const response = await apiClient.post<Project>('/api/v1/projects', request);

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Project creation failed');
  }

  async getProjects(): Promise<Project[]> {
    const response = await apiClient.get<Project[]>('/api/v1/projects');

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Failed to get projects');
  }

  async getProject(projectId: string): Promise<Project> {
    const response = await apiClient.get<Project>(`/api/v1/projects/${projectId}`);

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Failed to get project');
  }

  async updateProject(projectId: string, updates: UpdateProjectRequest): Promise<Project> {
    const response = await apiClient.put<Project>(`/api/v1/projects/${projectId}`, updates);

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Project update failed');
  }

  async deleteProject(projectId: string): Promise<void> {
    const response = await apiClient.delete(`/api/v1/projects/${projectId}`);

    if (!response.success) {
      throw new Error(response.error || 'Project deletion failed');
    }
  }

  async getProjectFiles(projectId: string): Promise<ProjectFile[]> {
    const response = await apiClient.get<ProjectFile[]>(`/api/v1/projects/${projectId}/files`);

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Failed to get project files');
  }

  async getProjectFile(projectId: string, filePath: string): Promise<ProjectFile> {
    const response = await apiClient.get<ProjectFile>(`/api/v1/projects/${projectId}/files/${encodeURIComponent(filePath)}`);

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Failed to get project file');
  }

  async updateProjectFile(projectId: string, filePath: string, content: string): Promise<void> {
    const response = await apiClient.put(`/api/v1/projects/${projectId}/files/${encodeURIComponent(filePath)}`, {
      content,
    });

    if (!response.success) {
      throw new Error(response.error || 'File update failed');
    }
  }

  async createProjectFile(projectId: string, filePath: string, content: string): Promise<void> {
    const response = await apiClient.post(`/api/v1/projects/${projectId}/files`, {
      filePath,
      content,
    });

    if (!response.success) {
      throw new Error(response.error || 'File creation failed');
    }
  }

  async deleteProjectFile(projectId: string, filePath: string): Promise<void> {
    const response = await apiClient.delete(`/api/v1/projects/${projectId}/files/${encodeURIComponent(filePath)}`);

    if (!response.success) {
      throw new Error(response.error || 'File deletion failed');
    }
  }

  async inviteCollaborator(projectId: string, email: string, role: string = 'editor'): Promise<void> {
    const response = await apiClient.post(`/api/v1/projects/${projectId}/collaborators`, {
      email,
      role,
    });

    if (!response.success) {
      throw new Error(response.error || 'Invitation failed');
    }
  }

  async removeCollaborator(projectId: string, userId: string): Promise<void> {
    const response = await apiClient.delete(`/api/v1/projects/${projectId}/collaborators/${userId}`);

    if (!response.success) {
      throw new Error(response.error || 'Collaborator removal failed');
    }
  }

  async getCollaborators(projectId: string): Promise<Array<{
    id: string;
    email: string;
    name: string;
    role: string;
    joinedAt: string;
  }>> {
    const response = await apiClient.get<Array<{
      id: string;
      email: string;
      name: string;
      role: string;
      joinedAt: string;
    }>>(`/api/v1/projects/${projectId}/collaborators`);

    if (response.success && response.data) {
      return response.data;
    }

    throw new Error(response.error || 'Failed to get collaborators');
  }
}

export type { Project } from './api';

export const projectService = new ProjectService();

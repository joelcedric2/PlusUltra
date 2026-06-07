/**
 * React Query Hooks for API Integration
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { aiOrchestrationService, OrchestrationRequest, OrchestrationResponse, ProjectManagerRequest, ProjectManagerResponse } from '@/lib/ai-orchestration';
import { tciService, TCIQuery, TCIResponse, CodeEvent, SimulationRequest, EvolutionQuery } from '@/lib/tci';
import { buildService, BuildConfig, BuildResult, SubmissionResult } from '@/lib/build';
import { assetService, AssetGenerationRequest, AssetProject, GeneratedAsset, LogoGenerationOptions, ScreenshotGenerationOptions, FeatureGraphicOptions } from '@/lib/assets';
import { sandboxService, SandboxConfig, SandboxStatus } from '@/lib/sandbox';
import { projectService, CreateProjectRequest, UpdateProjectRequest, Project } from '@/lib/projects';
import { tokenService } from '@/lib/token';
import { useAuth } from '@/contexts/AuthContext';
import { v4 as uuidv4 } from 'uuid';

// AI Orchestration Hooks
export const useAIOrchestration = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const orchestrateMutation = useMutation({
    mutationFn: (request: OrchestrationRequest) => aiOrchestrationService.orchestrate(request),
    onSuccess: async (data: OrchestrationResponse) => {
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['tci'] });

      // Track token usage
      if (user && data.plusultraTokensConsumed > 0) {
        try {
          await tokenService.recordUsage(
            user.id,
            uuidv4(),
            'ai_orchestration',
            [{
              model: 'Claude', // Simplified - actual model varies
              complexity: 'medium',
              tokens: data.plusultraTokensConsumed
            }]
          );
          // Refresh user's token pool
          queryClient.invalidateQueries({ queryKey: ['token-pool'] });
        } catch (error) {
          console.error('Failed to record token usage:', error);
        }
      }
    },
  });

  const projectManagerMutation = useMutation({
    mutationFn: (request: ProjectManagerRequest) => aiOrchestrationService.manageProject(request),
    onSuccess: async (data: ProjectManagerResponse) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['tci'] });

      // Track token usage
      if (user && data.plusultraTokensConsumed > 0) {
        try {
          await tokenService.recordUsage(
            user.id,
            uuidv4(),
            'project_management',
            [{
              model: 'Claude',
              complexity: 'high',
              tokens: data.plusultraTokensConsumed
            }]
          );
          // Refresh user's token pool
          queryClient.invalidateQueries({ queryKey: ['token-pool'] });
        } catch (error) {
          console.error('Failed to record token usage:', error);
        }
      }
    },
  });

  const modelStatusQuery = useQuery({
    queryKey: ['ai-models', 'status'],
    queryFn: () => aiOrchestrationService.getModelStatus(),
    refetchInterval: 30000, // Refetch every 30 seconds
  });

  return {
    orchestrate: orchestrateMutation.mutate,
    orchestrateAsync: orchestrateMutation.mutateAsync,
    isOrchestrating: orchestrateMutation.isPending,
    projectManager: projectManagerMutation.mutate,
    projectManagerAsync: projectManagerMutation.mutateAsync,
    isManagingProject: projectManagerMutation.isPending,
    modelStatus: modelStatusQuery.data,
    isLoadingModels: modelStatusQuery.isLoading,
  };
};

// TCI Hooks
export const useTCI = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const queryMutation = useMutation({
    mutationFn: (request: TCIQuery) => tciService.query(request),
    onSuccess: async () => {
      // Track token usage for TCI queries
      if (user) {
        try {
          await tokenService.recordUsage(
            user.id,
            uuidv4(),
            'tci_query',
            [{
              model: 'Claude',
              complexity: 'medium',
              tokens: 8 // Estimated tokens for TCI query
            }]
          );
          queryClient.invalidateQueries({ queryKey: ['token-pool'] });
        } catch (error) {
          console.error('Failed to record TCI token usage:', error);
        }
      }
    },
  });

  const logEventMutation = useMutation({
    mutationFn: (event: CodeEvent) => tciService.logCodeEvent(event),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tci'] });
      // Event logging doesn't consume tokens - it's passive tracking
    },
  });

  const contextQuery = useQuery({
    queryKey: ['tci', 'context', 'filePaths', 'sessionId'],
    queryFn: ({ queryKey }) => {
      const [, , , filePaths, sessionId] = queryKey as string[];
      return tciService.getContext(
        filePaths ? filePaths.split(',') : undefined,
        sessionId
      );
    },
    enabled: false, // Only run when explicitly called
  });

  const evolutionQuery = useQuery({
    queryKey: ['tci', 'evolution', 'filePaths', 'since', 'horizonDays'],
    queryFn: ({ queryKey }) => {
      const [, , , filePaths, since, horizonDays] = queryKey as string[];
      return tciService.getEvolution({
        filePaths: filePaths.split(','),
        since,
        horizonDays: horizonDays ? parseInt(horizonDays) : undefined,
      });
    },
    enabled: false,
  });

  const predictionQuery = useQuery({
    queryKey: ['tci', 'prediction', 'filePaths', 'horizonDays'],
    queryFn: ({ queryKey }) => {
      const [, , , filePaths, horizonDays] = queryKey as string[];
      return tciService.predictEvolution(
        filePaths.split(','),
        horizonDays ? parseInt(horizonDays) : 90
      );
    },
    enabled: false,
  });

  return {
    query: queryMutation.mutate,
    queryAsync: queryMutation.mutateAsync,
    isQuerying: queryMutation.isPending,
    logEvent: logEventMutation.mutate,
    logEventAsync: logEventMutation.mutateAsync,
    getContext: (filePaths?: string[], sessionId?: string) =>
      contextQuery.refetch({ queryKey: ['tci', 'context', filePaths?.join(','), sessionId] }),
    context: contextQuery.data,
    isLoadingContext: contextQuery.isLoading,
    getEvolution: (query: EvolutionQuery) =>
      evolutionQuery.refetch({ queryKey: ['tci', 'evolution', query.filePaths.join(','), query.since, query.horizonDays?.toString()] }),
    evolution: evolutionQuery.data,
    isLoadingEvolution: evolutionQuery.isLoading,
    getPredictions: (filePaths: string[], horizonDays?: number) =>
      predictionQuery.refetch({ queryKey: ['tci', 'prediction', filePaths.join(','), horizonDays?.toString()] }),
    predictions: predictionQuery.data,
    isLoadingPredictions: predictionQuery.isLoading,
  };
};

// Build System Hooks
export const useBuild = () => {
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const triggerBuildMutation = useMutation({
    mutationFn: ({ projectPath, config }: { projectPath: string; config: BuildConfig }) =>
      buildService.triggerBuild(projectPath, config),
    onSuccess: async () => {
      // Track token usage for build
      if (user) {
        try {
          await tokenService.recordUsage(
            user.id,
            uuidv4(),
            'build',
            [{
              model: 'StarCoder', // Build operations typically use StarCoder
              complexity: 'medium',
              tokens: 10 // Estimated tokens for build operation
            }]
          );
          queryClient.invalidateQueries({ queryKey: ['token-pool'] });
        } catch (error) {
          console.error('Failed to record build token usage:', error);
        }
      }
    },
  });

  const submitMutation = useMutation({
    mutationFn: ({ projectPath, config }: { projectPath: string; config: BuildConfig }) =>
      buildService.submitToStore(projectPath, config),
    onSuccess: async () => {
      // Track token usage for submission
      if (user) {
        try {
          await tokenService.recordUsage(
            user.id,
            uuidv4(),
            'store_submission',
            [{
              model: 'StarCoder',
              complexity: 'low',
              tokens: 5 // Estimated tokens for submission
            }]
          );
          queryClient.invalidateQueries({ queryKey: ['token-pool'] });
        } catch (error) {
          console.error('Failed to record submission token usage:', error);
        }
      }
    },
  });

  const deployMutation = useMutation({
    mutationFn: ({ projectPath, config }: { projectPath: string; config: BuildConfig & { skipSubmission?: boolean } }) =>
      buildService.deploy(projectPath, config),
    onSuccess: async () => {
      // Track token usage for deployment
      if (user) {
        try {
          await tokenService.recordUsage(
            user.id,
            uuidv4(),
            'deployment',
            [{
              model: 'StarCoder',
              complexity: 'high',
              tokens: 20 // Estimated tokens for full deployment
            }]
          );
          queryClient.invalidateQueries({ queryKey: ['token-pool'] });
        } catch (error) {
          console.error('Failed to record deployment token usage:', error);
        }
      }
    },
  });

  const buildStatusQuery = useQuery({
    queryKey: ['build', 'status', 'buildId'],
    queryFn: ({ queryKey }) => {
      const [, , , buildId] = queryKey as string[];
      return buildService.getBuildStatus(buildId);
    },
    enabled: false,
    refetchInterval: (data) => {
      // Refetch every 5 seconds if build is in progress
      return data?.status === 'building' || data?.status === 'pending' ? 5000 : false;
    },
  });

  return {
    triggerBuild: triggerBuildMutation.mutate,
    triggerBuildAsync: triggerBuildMutation.mutateAsync,
    isBuilding: triggerBuildMutation.isPending,
    submitToStore: submitMutation.mutate,
    submitToStoreAsync: submitMutation.mutateAsync,
    isSubmitting: submitMutation.isPending,
    deploy: deployMutation.mutate,
    deployAsync: deployMutation.mutateAsync,
    isDeploying: deployMutation.isPending,
    getBuildStatus: (buildId: string) =>
      buildStatusQuery.refetch({ queryKey: ['build', 'status', buildId] }),
    buildStatus: buildStatusQuery.data,
    isLoadingBuildStatus: buildStatusQuery.isLoading,
  };
};

// Asset Management Hooks
export const useAssets = () => {
  const queryClient = useQueryClient();

  const generateBundleMutation = useMutation({
    mutationFn: (request: AssetGenerationRequest) => assetService.generateCompleteBundle(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const generateLogoMutation = useMutation({
    mutationFn: (options: LogoGenerationOptions) => assetService.generateLogo(options),
  });

  const generateScreenshotsMutation = useMutation({
    mutationFn: (options: ScreenshotGenerationOptions) => assetService.generateScreenshots(options),
  });

  const generateFeatureGraphicMutation = useMutation({
    mutationFn: (options: FeatureGraphicOptions) => assetService.generateFeatureGraphic(options),
  });

  return {
    generateBundle: generateBundleMutation.mutate,
    generateBundleAsync: generateBundleMutation.mutateAsync,
    isGeneratingBundle: generateBundleMutation.isPending,
    generateLogo: generateLogoMutation.mutate,
    generateLogoAsync: generateLogoMutation.mutateAsync,
    isGeneratingLogo: generateLogoMutation.isPending,
    generateScreenshots: generateScreenshotsMutation.mutate,
    generateScreenshotsAsync: generateScreenshotsMutation.mutateAsync,
    isGeneratingScreenshots: generateScreenshotsMutation.isPending,
    generateFeatureGraphic: generateFeatureGraphicMutation.mutate,
    generateFeatureGraphicAsync: generateFeatureGraphicMutation.mutateAsync,
    isGeneratingFeatureGraphic: generateFeatureGraphicMutation.isPending,
  };
};

// Sandbox Hooks
export const useSandbox = () => {
  const queryClient = useQueryClient();

  const createSandboxMutation = useMutation({
    mutationFn: ({ config, projectPath }: { config: SandboxConfig; projectPath: string }) =>
      sandboxService.createSandbox(config, projectPath),
  });

  const sandboxStatusQuery = useQuery({
    queryKey: ['sandbox', 'status', 'workspaceId'],
    queryFn: ({ queryKey }) => {
      const [, , , workspaceId] = queryKey as string[];
      return sandboxService.getSandboxStatus(workspaceId);
    },
    enabled: false,
    refetchInterval: (data) => {
      // Refetch every 2 seconds if sandbox is running
      return data?.status === 'running' ? 2000 : false;
    },
  });

  const logsQuery = useQuery({
    queryKey: ['sandbox', 'logs', 'workspaceId', 'limit'],
    queryFn: ({ queryKey }) => {
      const [, , , workspaceId, limit] = queryKey as string[];
      return sandboxService.getSandboxLogs(workspaceId, parseInt(limit));
    },
    enabled: false,
  });

  return {
    createSandbox: createSandboxMutation.mutate,
    createSandboxAsync: createSandboxMutation.mutateAsync,
    isCreatingSandbox: createSandboxMutation.isPending,
    getSandboxStatus: (workspaceId: string) =>
      sandboxStatusQuery.refetch({ queryKey: ['sandbox', 'status', workspaceId] }),
    sandboxStatus: sandboxStatusQuery.data,
    isLoadingSandboxStatus: sandboxStatusQuery.isLoading,
    getLogs: (workspaceId: string, limit?: number) =>
      logsQuery.refetch({ queryKey: ['sandbox', 'logs', workspaceId, (limit || 100).toString()] }),
    logs: logsQuery.data,
    isLoadingLogs: logsQuery.isLoading,
    connectToPreview: sandboxService.connectToPreview.bind(sandboxService),
    disconnectFromPreview: sandboxService.disconnectFromPreview.bind(sandboxService),
  };
};

// Project Management Hooks
export const useProjects = () => {
  const queryClient = useQueryClient();

  const projectsQuery = useQuery({
    queryKey: ['projects'],
    queryFn: () => projectService.getProjects(),
  });

  const createProjectMutation = useMutation({
    mutationFn: (request: CreateProjectRequest) => projectService.createProject(request),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const updateProjectMutation = useMutation({
    mutationFn: ({ projectId, updates }: { projectId: string; updates: UpdateProjectRequest }) =>
      projectService.updateProject(projectId, updates),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  const deleteProjectMutation = useMutation({
    mutationFn: (projectId: string) => projectService.deleteProject(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
    },
  });

  return {
    projects: projectsQuery.data,
    isLoadingProjects: projectsQuery.isLoading,
    createProject: createProjectMutation.mutate,
    createProjectAsync: createProjectMutation.mutateAsync,
    isCreatingProject: createProjectMutation.isPending,
    updateProject: updateProjectMutation.mutate,
    updateProjectAsync: updateProjectMutation.mutateAsync,
    isUpdatingProject: updateProjectMutation.isPending,
    deleteProject: deleteProjectMutation.mutate,
    deleteProjectAsync: deleteProjectMutation.mutateAsync,
    isDeletingProject: deleteProjectMutation.isPending,
  };
};

export const useApi = () => {
  return {
    ...useAIOrchestration(),
    ...useTCI(),
    ...useBuild(),
    ...useAssets(),
    ...useSandbox(),
    ...useProjects(),
  };
};


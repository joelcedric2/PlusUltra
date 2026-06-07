import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import * as fs from 'fs';
import { githubService, GitHubTokenData, GitHubUser } from '../../services/github/GitHubService';
import { GitHubExportService } from '../../services/github/GitHubExportService';
import { ProjectService } from '../../services/storage/ProjectService';
import { projectPackaging } from '../../services/packaging/ProjectPackaging';

interface GitHubAuthRequest {
  Body: {
    code: string;
    state?: string;
  };
}

interface GitHubCallbackParams {
  code?: string;
  state?: string;
  error?: string;
  error_description?: string;
}

export async function authRoutes(fastify: FastifyInstance) {
  // Initiate GitHub OAuth
  fastify.get('/api/v1/auth/github', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const state = `plusultra-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const authUrl = githubService.getOAuthUrl(state);

      // Store state for verification
      await fastify.redis.set(`github_oauth_state:${state}`, 'pending', 'EX', 600); // 10 minutes

      return reply.code(200).send({
        success: true,
        authUrl,
        state
      });
    } catch (error: unknown) {
      fastify.log.error('Error initiating GitHub OAuth: %s', error instanceof Error ? error.message : 'Unknown error');
      return reply.code(500).send({
        success: false,
        error: 'Failed to initiate GitHub authentication',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Handle GitHub OAuth callback
  fastify.post('/api/v1/auth/github/callback', async (request: FastifyRequest<GitHubAuthRequest>, reply: FastifyReply) => {
    try {
      const { code, state } = request.body;

      if (!code) {
        return reply.code(400).send({
          error: 'Authorization code is required'
        });
      }

      // Verify state parameter
      if (state) {
        const storedState = await fastify.redis.get(`github_oauth_state:${state}`);
        if (!storedState) {
          return reply.code(400).send({
            error: 'Invalid or expired state parameter'
          });
        }
        await fastify.redis.del(`github_oauth_state:${state}`);
      }

      // Exchange code for access token
      const tokenData: GitHubTokenData = await githubService.exchangeCodeForToken(code);

      // Get user information
      githubService.setAccessToken(tokenData.access_token);
      const user: GitHubUser = await githubService.getUser();

      // Store user session (in production, use proper session management)
      const sessionId = `github_session_${user.id}_${Date.now()}`;
      await fastify.redis.set(`github_session:${sessionId}`, JSON.stringify({
        accessToken: tokenData.access_token,
        user: user,
        createdAt: new Date().toISOString()
      }), 'EX', 86400); // 24 hours

      return reply.code(200).send({
        success: true,
        sessionId,
        user: {
          id: user.id,
          login: user.login,
          name: user.name,
          avatar_url: user.avatar_url
        },
        accessToken: tokenData.access_token // In production, don't send this to client
      });
    } catch (error: unknown) {
      fastify.log.error('Error in GitHub OAuth callback: %s', error instanceof Error ? error.message : 'Unknown error');
      return reply.code(500).send({
        success: false,
        error: 'GitHub authentication failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get user repositories
  fastify.get('/api/v1/github/repositories', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const sessionId = request.headers['x-github-session'] as string;

      if (!sessionId) {
        return reply.code(401).send({
          error: 'GitHub session required'
        });
      }

      // Get session data
      const sessionData = await fastify.redis.get(`github_session:${sessionId}`);
      if (!sessionData) {
        return reply.code(401).send({
          error: 'Invalid or expired session'
        });
      }

      const session = JSON.parse(sessionData);
      githubService.setAccessToken(session.accessToken);

      // Get repositories
      const repositories = await githubService.getUserRepositories();

      return reply.code(200).send({
        success: true,
        repositories: repositories.map((repo: any) => ({
          id: repo.id,
          name: repo.name,
          full_name: repo.full_name,
          description: repo.description,
          private: repo.private,
          html_url: repo.html_url,
          clone_url: repo.clone_url,
          created_at: repo.created_at,
          updated_at: repo.updated_at,
          language: repo.language
        }))
      });
    } catch (error: unknown) {
      fastify.log.error('Error getting GitHub repositories: %s', error instanceof Error ? error.message : 'Unknown error');
      return reply.code(500).send({
        success: false,
        error: 'Failed to get repositories',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Create repository and upload project
  fastify.post('/api/v1/github/create-project', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const sessionId = request.headers['x-github-session'] as string;
      const { projectId, repositoryName, description, private: isPrivate = false, userId } = request.body as any;

      if (!sessionId || !projectId || !repositoryName || !userId) {
        return reply.code(400).send({
          error: 'sessionId, projectId, userId, and repositoryName are required'
        });
      }

      // Get session data
      const sessionData = await fastify.redis.get(`github_session:${sessionId}`);
      if (!sessionData) {
        return reply.code(401).send({
          error: 'Invalid or expired session'
        });
      }

      const session = JSON.parse(sessionData);
      githubService.setAccessToken(session.accessToken);

      // Initialize services
      const projectService = new ProjectService();
      const exportService = new GitHubExportService(githubService);

      // Get project from database
      const project = await projectService.getProject(projectId, userId);
      if (!project) {
        return reply.code(404).send({
          error: 'Project not found or access denied'
        });
      }

      // Verify project has generated code
      if (!project.codeUrl) {
        return reply.code(400).send({
          error: 'Project has no generated code to export. Please generate the project first.'
        });
      }

      // Export project to GitHub
      const exportResult = await exportService.exportProject({
        repositoryName,
        description: description || project.description,
        private: isPrivate,
        projectPath: project.codeUrl,
        owner: session.user.login
      });

      if (!exportResult.success) {
        return reply.code(400).send({
          error: exportResult.error || 'Failed to export project to GitHub'
        });
      }

      // Update project with repository URL
      await projectService.updateProject(projectId, userId, {
        repositoryUrl: exportResult.repositoryUrl
      });

      return reply.code(200).send({
        success: true,
        repository: {
          html_url: exportResult.repositoryUrl,
          clone_url: exportResult.cloneUrl
        },
        message: 'Project successfully exported to GitHub'
      });
    } catch (error: unknown) {
      fastify.log.error('Error creating GitHub project: %s', error instanceof Error ? error.message : 'Unknown error');
      return reply.code(500).send({
        success: false,
        error: 'Failed to create GitHub project',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get GitHub user info
  fastify.get('/api/v1/github/user', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const sessionId = request.headers['x-github-session'] as string;

      if (!sessionId) {
        return reply.code(401).send({
          error: 'GitHub session required'
        });
      }

      const sessionData = await fastify.redis.get(`github_session:${sessionId}`);
      if (!sessionData) {
        return reply.code(401).send({
          error: 'Invalid or expired session'
        });
      }

      const session = JSON.parse(sessionData);
      githubService.setAccessToken(session.accessToken);

      const user = await githubService.getUser();

      return reply.code(200).send({
        success: true,
        user: {
          id: user.id,
          login: user.login,
          name: user.name,
          email: user.email,
          avatar_url: user.avatar_url,
          company: user.company,
          location: user.location
        }
      });
    } catch (error: unknown) {
      fastify.log.error('Error getting GitHub user: %s', error instanceof Error ? error.message : 'Unknown error');
      return reply.code(500).send({
        success: false,
        error: 'Failed to get user information',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Connect existing repository to project
  fastify.post('/api/v1/github/connect-repository', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const sessionId = request.headers['x-github-session'] as string;
      const { projectId, repositoryOwner, repositoryName, userId } = request.body as any;

      if (!sessionId || !projectId || !repositoryOwner || !repositoryName || !userId) {
        return reply.code(400).send({
          error: 'sessionId, projectId, userId, repositoryOwner, and repositoryName are required'
        });
      }

      // Get session data
      const sessionData = await fastify.redis.get(`github_session:${sessionId}`);
      if (!sessionData) {
        return reply.code(401).send({
          error: 'Invalid or expired session'
        });
      }

      const session = JSON.parse(sessionData);
      githubService.setAccessToken(session.accessToken);

      // Initialize services
      const projectService = new ProjectService();
      const exportService = new GitHubExportService(githubService);

      // Verify repository exists and user has access
      const connectResult = await exportService.connectRepository(repositoryOwner, repositoryName);

      if (!connectResult.success) {
        return reply.code(400).send({
          error: connectResult.error || 'Failed to connect repository'
        });
      }

      // Update project with repository URL
      await projectService.updateProject(projectId, userId, {
        repositoryUrl: connectResult.repositoryUrl
      });

      return reply.code(200).send({
        success: true,
        repository: {
          html_url: connectResult.repositoryUrl,
          clone_url: connectResult.cloneUrl
        },
        message: 'Repository successfully connected to project'
      });
    } catch (error: unknown) {
      fastify.log.error('Error connecting repository: %s', error instanceof Error ? error.message : 'Unknown error');
      return reply.code(500).send({
        success: false,
        error: 'Failed to connect repository',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Disconnect GitHub session
  fastify.post('/api/v1/auth/github/disconnect', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const sessionId = request.headers['x-github-session'] as string;

      if (sessionId) {
        await fastify.redis.del(`github_session:${sessionId}`);
      }

      return reply.code(200).send({
        success: true,
        message: 'GitHub session disconnected successfully'
      });
    } catch (error: unknown) {
      fastify.log.error('Error disconnecting GitHub session: %s', error instanceof Error ? error.message : 'Unknown error');
      return reply.code(500).send({
        success: false,
        error: 'Failed to disconnect GitHub session',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}

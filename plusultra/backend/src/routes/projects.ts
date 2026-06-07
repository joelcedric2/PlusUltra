import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';

// Types for project management
interface Project {
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

interface ProjectFile {
  path: string;
  content: string;
  lastModified: string;
  size: number;
}

// Mock data for testing
let mockProjects: Project[] = [
  {
    id: '1',
    name: 'Test React App',
    description: 'A test application for PlusUltra',
    platform: 'web',
    status: 'in-progress',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userId: '1',
    collaborators: []
  },
  {
    id: '2',
    name: 'Mobile Todo App',
    description: 'Cross-platform todo application',
    platform: 'all',
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    userId: '1',
    collaborators: []
  }
];

let mockUsers = [
  {
    id: '1',
    email: 'test@example.com',
    name: 'Test User',
    avatar: null,
    tier: 'pro',
    tokenBalance: 1000,
    password: 'test123' // In real app, this would be hashed
  }
];

// Basic authentication endpoints
export async function basicAuthRoutes(fastify: FastifyInstance) {
  // Email/password login
  fastify.post('/api/v1/auth/login', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { email, password } = request.body as { email: string; password: string };

      const user = mockUsers.find(u => u.email === email && u.password === password);

      if (!user) {
        return reply.code(401).send({
          success: false,
          error: 'Invalid credentials'
        });
      }

      const token = `mock-jwt-${Date.now()}`;

      return reply.code(200).send({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email,
            name: user.name,
            avatar: user.avatar,
            tier: user.tier,
            tokenBalance: user.tokenBalance
          },
          token
        }
      });
    } catch (error: unknown) {
      return reply.code(500).send({
        success: false,
        error: 'Login failed',
        message: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });

  // Get current user
  fastify.get('/api/v1/auth/me', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authHeader = request.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return reply.code(401).send({
          success: false,
          error: 'No token provided'
        });
      }

      // For mock, just return the test user
      const user = mockUsers[0];

      return reply.code(200).send({
        success: true,
        data: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatar: user.avatar,
          tier: user.tier,
          tokenBalance: user.tokenBalance
        }
      });
    } catch (error: unknown) {
      return reply.code(500).send({
        success: false,
        error: 'Failed to get user info'
      });
    }
  });

  // Logout
  fastify.post('/api/v1/auth/logout', async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.code(200).send({
      success: true,
      data: null
    });
  });
}

// Project management routes
export async function projectRoutes(fastify: FastifyInstance) {
  // Get all projects
  fastify.get('/api/v1/projects', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      return reply.code(200).send({
        success: true,
        data: mockProjects
      });
    } catch (error: unknown) {
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch projects'
      });
    }
  });

  // Create new project
  fastify.post('/api/v1/projects', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as Partial<Project>;

      const newProject: Project = {
        id: Date.now().toString(),
        name: body.name || 'Untitled Project',
        description: body.description,
        platform: body.platform || 'web',
        status: 'draft',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        userId: '1', // Mock user
        collaborators: []
      };

      mockProjects.push(newProject);

      return reply.code(201).send({
        success: true,
        data: newProject
      });
    } catch (error: unknown) {
      return reply.code(500).send({
        success: false,
        error: 'Failed to create project'
      });
    }
  });

  // Get project by ID
  fastify.get('/api/v1/projects/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const project = mockProjects.find(p => p.id === id);

      if (!project) {
        return reply.code(404).send({
          success: false,
          error: 'Project not found'
        });
      }

      return reply.code(200).send({
        success: true,
        data: project
      });
    } catch (error: unknown) {
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch project'
      });
    }
  });

  // Update project
  fastify.put('/api/v1/projects/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const updates = request.body as Partial<Project>;

      const index = mockProjects.findIndex(p => p.id === id);
      if (index === -1) {
        return reply.code(404).send({
          success: false,
          error: 'Project not found'
        });
      }

      mockProjects[index] = {
        ...mockProjects[index],
        ...updates,
        updatedAt: new Date().toISOString()
      };

      return reply.code(200).send({
        success: true,
        data: mockProjects[index]
      });
    } catch (error: unknown) {
      return reply.code(500).send({
        success: false,
        error: 'Failed to update project'
      });
    }
  });

  // Delete project
  fastify.delete('/api/v1/projects/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };

      const index = mockProjects.findIndex(p => p.id === id);
      if (index === -1) {
        return reply.code(404).send({
          success: false,
          error: 'Project not found'
        });
      }

      mockProjects.splice(index, 1);

      return reply.code(200).send({
        success: true,
        data: null
      });
    } catch (error: unknown) {
      return reply.code(500).send({
        success: false,
        error: 'Failed to delete project'
      });
    }
  });

  // Get project files
  fastify.get('/api/v1/projects/:id/files', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { id } = request.params as { id: string };
      const project = mockProjects.find(p => p.id === id);

      if (!project) {
        return reply.code(404).send({
          success: false,
          error: 'Project not found'
        });
      }

      // Mock file structure
      const mockFiles: ProjectFile[] = [
        {
          path: 'src/App.tsx',
          content: `import React, { useState } from 'react';
import './App.css';

function App() {
  const [count, setCount] = useState(0);

  return (
    <div className="App">
      <header className="App-header">
        <h1>${project.name}</h1>
        <p>${project.description || 'A PlusUltra project'}</p>
        <button onClick={() => setCount(count + 1)}>
          Clicked {count} times
        </button>
      </header>
    </div>
  );
}

export default App;`,
          lastModified: new Date().toISOString(),
          size: 456
        },
        {
          path: 'src/index.tsx',
          content: `import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);`,
          lastModified: new Date().toISOString(),
          size: 234
        }
      ];

      return reply.code(200).send({
        success: true,
        data: mockFiles
      });
    } catch (error: unknown) {
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch project files'
      });
    }
  });

  // Get individual file (with proper URL decoding)
  fastify.get('/api/v1/projects/:projectId/files/:filePath(*)', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { projectId, filePath } = request.params as { projectId: string; filePath: string };
      const decodedFilePath = decodeURIComponent(filePath);
      const project = mockProjects.find(p => p.id === projectId);

      if (!project) {
        return reply.code(404).send({
          success: false,
          error: 'Project not found'
        });
      }

      // Return mock content based on file type
      let content = '';
      if (decodedFilePath.endsWith('.tsx') || decodedFilePath.endsWith('.ts')) {
        content = `// ${decodedFilePath}
// Generated by PlusUltra

import React, { useState } from 'react';

export const ${decodedFilePath.split('/').pop()?.replace('.tsx', '').replace('.ts', '')} = () => {
  const [count, setCount] = useState(0);

  return (
    <div>
      <h1>${project.name}</h1>
      <p>This is the ${decodedFilePath} file</p>
      <button onClick={() => setCount(count + 1)}>
        Clicked {count} times
      </button>
    </div>
  );
};

export default ${decodedFilePath.split('/').pop()?.replace('.tsx', '').replace('.ts', '')};`;
      } else if (decodedFilePath.endsWith('.css')) {
        content = `/* ${decodedFilePath} */
.app {
  text-align: center;
  padding: 20px;
}

.header {
  background-color: #282c34;
  padding: 20px;
  color: white;
}`;
      } else if (decodedFilePath.endsWith('.json')) {
        content = JSON.stringify({
          name: project.name.toLowerCase().replace(/\s+/g, '-'),
          version: '1.0.0',
          description: project.description
        }, null, 2);
      }

      return reply.code(200).send({
        success: true,
        data: {
          path: decodedFilePath,
          content,
          lastModified: new Date().toISOString(),
          size: content.length
        }
      });
    } catch (error: unknown) {
      return reply.code(500).send({
        success: false,
        error: 'Failed to fetch file'
      });
    }
  });

  // Update file content
  fastify.put('/api/v1/projects/:projectId/files/:filePath(*)', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { projectId, filePath } = request.params as { projectId: string; filePath: string };
      const { content } = request.body as { content: string };
      const decodedFilePath = decodeURIComponent(filePath);

      const project = mockProjects.find(p => p.id === projectId);
      if (!project) {
        return reply.code(404).send({
          success: false,
          error: 'Project not found'
        });
      }

      // In a real implementation, this would save to the file system
      // For now, just return success
      return reply.code(200).send({
        success: true,
        data: {
          path: decodedFilePath,
          content,
          lastModified: new Date().toISOString(),
          size: content.length
        }
      });
    } catch (error: unknown) {
      return reply.code(500).send({
        success: false,
        error: 'Failed to save file'
      });
    }
  });
}

/**
 * Backend Integration Routes
 * API endpoints for connecting projects to backend services
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

// Validation schemas
const TestConnectionSchema = z.object({
  provider: z.enum(['supabase', 'firebase', 'aws', 'azure']),
  config: z.record(z.string()),
});

const GenerateSchemaSchema = z.object({
  provider: z.enum(['supabase', 'firebase', 'aws', 'azure']),
  config: z.record(z.string()),
});

const CreateConnectionSchema = z.object({
  projectId: z.string(),
  provider: z.enum(['supabase', 'firebase', 'aws', 'azure']),
  connectionName: z.string().min(1),
  config: z.record(z.string()),
  schema: z
    .object({
      tables: z.array(
        z.object({
          name: z.string(),
          columns: z.array(
            z.object({
              name: z.string(),
              type: z.string(),
              nullable: z.boolean(),
              defaultValue: z.string().optional(),
            })
          ),
          primaryKey: z.array(z.string()),
        })
      ),
      relationships: z.array(
        z.object({
          fromTable: z.string(),
          toTable: z.string(),
          fromColumn: z.string(),
          toColumn: z.string(),
          type: z.enum(['one-to-one', 'one-to-many', 'many-to-many']),
        })
      ),
    })
    .optional(),
});

interface BackendConnection {
  id: string;
  provider: 'supabase' | 'firebase' | 'aws' | 'azure';
  projectId: string;
  connectionName: string;
  config: Record<string, string>;
  schema?: any;
  status: 'connected' | 'disconnected' | 'error';
  createdAt: Date;
  lastSync?: Date;
}

// In-memory storage (replace with database in production)
const connections: Map<string, BackendConnection> = new Map();

/**
 * Test connection to backend service
 */
async function testSupabaseConnection(config: Record<string, string>): Promise<{ valid: boolean; message: string }> {
  const { url, anonKey } = config;

  if (!url || !anonKey) {
    return { valid: false, message: 'Missing required fields: url and anonKey' };
  }

  try {
    // Test connection by making a simple request
    const response = await fetch(`${url}/rest/v1/`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
      },
    });

    if (response.ok || response.status === 404) {
      // 404 is ok - it means auth worked but no tables found
      return { valid: true, message: 'Connection successful' };
    } else {
      return { valid: false, message: `Connection failed with status ${response.status}` };
    }
  } catch (error) {
    return {
      valid: false,
      message: error instanceof Error ? error.message : 'Connection test failed',
    };
  }
}

async function testFirebaseConnection(config: Record<string, string>): Promise<{ valid: boolean; message: string }> {
  const { apiKey, authDomain, projectId } = config;

  if (!apiKey || !authDomain || !projectId) {
    return { valid: false, message: 'Missing required Firebase credentials' };
  }

  // Basic validation - in production, you'd actually test the connection
  if (apiKey.startsWith('AIzaSy') && authDomain.includes('firebaseapp.com')) {
    return { valid: true, message: 'Firebase configuration appears valid' };
  }

  return { valid: false, message: 'Invalid Firebase configuration' };
}

async function testAWSConnection(config: Record<string, string>): Promise<{ valid: boolean; message: string }> {
  const { region, accessKeyId, secretAccessKey } = config;

  if (!region || !accessKeyId || !secretAccessKey) {
    return { valid: false, message: 'Missing required AWS credentials' };
  }

  // Basic validation - in production, you'd use AWS SDK to test
  if (accessKeyId.startsWith('AKIA') && region.match(/^[a-z]{2}-[a-z]+-\d$/)) {
    return { valid: true, message: 'AWS configuration appears valid' };
  }

  return { valid: false, message: 'Invalid AWS configuration' };
}

async function testAzureConnection(config: Record<string, string>): Promise<{ valid: boolean; message: string }> {
  const { connectionString, subscriptionId } = config;

  if (!connectionString || !subscriptionId) {
    return { valid: false, message: 'Missing required Azure credentials' };
  }

  // Basic validation
  if (connectionString.includes('Server=tcp:') && subscriptionId.match(/^[0-9a-f-]{36}$/)) {
    return { valid: true, message: 'Azure configuration appears valid' };
  }

  return { valid: false, message: 'Invalid Azure configuration' };
}

/**
 * Generate database schema from connection
 */
async function generateSupabaseSchema(config: Record<string, string>): Promise<any> {
  const { url, anonKey } = config;

  try {
    // Fetch table information from Supabase
    const response = await fetch(`${url}/rest/v1/`, {
      headers: {
        apikey: anonKey,
        Authorization: `Bearer ${anonKey}`,
        Accept: 'application/json',
      },
    });

    // Mock schema for demonstration
    // In production, you'd use Supabase's introspection APIs
    return {
      tables: [
        {
          name: 'users',
          columns: [
            { name: 'id', type: 'uuid', nullable: false, defaultValue: 'uuid_generate_v4()' },
            { name: 'email', type: 'text', nullable: false },
            { name: 'created_at', type: 'timestamp', nullable: false, defaultValue: 'now()' },
          ],
          primaryKey: ['id'],
        },
        {
          name: 'profiles',
          columns: [
            { name: 'id', type: 'uuid', nullable: false },
            { name: 'user_id', type: 'uuid', nullable: false },
            { name: 'full_name', type: 'text', nullable: true },
            { name: 'avatar_url', type: 'text', nullable: true },
          ],
          primaryKey: ['id'],
        },
      ],
      relationships: [
        {
          fromTable: 'profiles',
          toTable: 'users',
          fromColumn: 'user_id',
          toColumn: 'id',
          type: 'many-to-one' as const,
        },
      ],
    };
  } catch (error) {
    throw new Error('Failed to generate Supabase schema');
  }
}

async function generateFirebaseSchema(config: Record<string, string>): Promise<any> {
  // Mock Firebase schema
  return {
    tables: [
      {
        name: 'users',
        columns: [
          { name: 'uid', type: 'string', nullable: false },
          { name: 'email', type: 'string', nullable: false },
          { name: 'displayName', type: 'string', nullable: true },
        ],
        primaryKey: ['uid'],
      },
    ],
    relationships: [],
  };
}

export async function backendIntegrationRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/v1/backend/test-connection
   * Test connection to a backend service
   */
  fastify.post(
    '/api/v1/backend/test-connection',
    {
      schema: {
        body: TestConnectionSchema,
      },
    },
    async (request: FastifyRequest<{ Body: z.infer<typeof TestConnectionSchema> }>, reply: FastifyReply) => {
      try {
        const { provider, config } = request.body;

        let result: { valid: boolean; message: string };

        switch (provider) {
          case 'supabase':
            result = await testSupabaseConnection(config);
            break;
          case 'firebase':
            result = await testFirebaseConnection(config);
            break;
          case 'aws':
            result = await testAWSConnection(config);
            break;
          case 'azure':
            result = await testAzureConnection(config);
            break;
          default:
            result = { valid: false, message: 'Unsupported provider' };
        }

        return reply.status(200).send({
          success: true,
          data: result,
        });
      } catch (error) {
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Connection test failed',
        });
      }
    }
  );

  /**
   * POST /api/v1/backend/generate-schema
   * Generate database schema from connection
   */
  fastify.post(
    '/api/v1/backend/generate-schema',
    {
      schema: {
        body: GenerateSchemaSchema,
      },
    },
    async (request: FastifyRequest<{ Body: z.infer<typeof GenerateSchemaSchema> }>, reply: FastifyReply) => {
      try {
        const { provider, config } = request.body;

        let schema: any;

        switch (provider) {
          case 'supabase':
            schema = await generateSupabaseSchema(config);
            break;
          case 'firebase':
            schema = await generateFirebaseSchema(config);
            break;
          case 'aws':
          case 'azure':
            // Mock schemas for other providers
            schema = { tables: [], relationships: [] };
            break;
          default:
            throw new Error('Unsupported provider');
        }

        return reply.status(200).send({
          success: true,
          data: schema,
        });
      } catch (error) {
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Schema generation failed',
        });
      }
    }
  );

  /**
   * POST /api/v1/backend/connections
   * Create a new backend connection
   */
  fastify.post(
    '/api/v1/backend/connections',
    {
      schema: {
        body: CreateConnectionSchema,
      },
    },
    async (request: FastifyRequest<{ Body: z.infer<typeof CreateConnectionSchema> }>, reply: FastifyReply) => {
      try {
        const { projectId, provider, connectionName, config, schema } = request.body;

        const connection: BackendConnection = {
          id: uuidv4(),
          provider,
          projectId,
          connectionName,
          config,
          schema,
          status: 'connected',
          createdAt: new Date(),
          lastSync: new Date(),
        };

        connections.set(connection.id, connection);

        console.log(`✅ Created backend connection: ${connectionName} (${provider}) for project ${projectId}`);

        return reply.status(201).send({
          success: true,
          data: connection,
        });
      } catch (error) {
        return reply.status(500).send({
          success: false,
          error: error instanceof Error ? error.message : 'Failed to create connection',
        });
      }
    }
  );

  /**
   * GET /api/v1/backend/connections/:projectId
   * Get all connections for a project
   */
  fastify.get('/api/v1/backend/connections/:projectId', async (request: FastifyRequest<{ Params: { projectId: string } }>, reply: FastifyReply) => {
    try {
      const { projectId } = request.params;

      const projectConnections = Array.from(connections.values()).filter(
        (conn) => conn.projectId === projectId
      );

      return reply.status(200).send({
        success: true,
        data: projectConnections,
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch connections',
      });
    }
  });

  /**
   * DELETE /api/v1/backend/connections/:id
   * Delete a backend connection
   */
  fastify.delete('/api/v1/backend/connections/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    try {
      const { id } = request.params;

      if (!connections.has(id)) {
        return reply.status(404).send({
          success: false,
          error: 'Connection not found',
        });
      }

      connections.delete(id);

      console.log(`🗑️ Deleted backend connection: ${id}`);

      return reply.status(200).send({
        success: true,
        message: 'Connection deleted successfully',
      });
    } catch (error) {
      return reply.status(500).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to delete connection',
      });
    }
  });
}

export default backendIntegrationRoutes;

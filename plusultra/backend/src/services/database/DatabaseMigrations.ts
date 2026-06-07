import { Pool } from 'pg';

export class DatabaseMigrations {
  protected pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }

  async initializeDatabase(): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      // Enable pgvector extension
      await client.query('CREATE EXTENSION IF NOT EXISTS vector;');

      // Create vector documents table
      await client.query(`
        CREATE TABLE IF NOT EXISTS vector_documents (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          content TEXT NOT NULL,
          metadata JSONB NOT NULL,
          embedding vector(1536), -- OpenAI embedding dimension
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        -- Create index for vector similarity search
        CREATE INDEX IF NOT EXISTS vector_documents_embedding_idx
        ON vector_documents USING ivfflat (embedding vector_cosine_ops);

        -- Create index for metadata searches
        CREATE INDEX IF NOT EXISTS vector_documents_metadata_idx
        ON vector_documents USING gin (metadata);

        -- Create index for user-based queries
        CREATE INDEX IF NOT EXISTS vector_documents_user_idx
        ON vector_documents ((metadata->>'userId'));
      `);

      // Create AI interactions table for tracking usage
      await client.query(`
        CREATE TABLE IF NOT EXISTS ai_interactions (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id TEXT NOT NULL,
          session_id TEXT NOT NULL,
          task_type TEXT NOT NULL,
          models_used JSONB NOT NULL,
          tokens_used INTEGER NOT NULL,
          cost DECIMAL(10,6) NOT NULL,
          duration_ms INTEGER NOT NULL,
          success BOOLEAN NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS ai_interactions_user_idx ON ai_interactions (user_id);
        CREATE INDEX IF NOT EXISTS ai_interactions_session_idx ON ai_interactions (session_id);
        CREATE INDEX IF NOT EXISTS ai_interactions_task_idx ON ai_interactions (task_type);
      `);

      // Create project analytics table
      await client.query(`
        CREATE TABLE IF NOT EXISTS project_analytics (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id TEXT NOT NULL,
          project_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          event_data JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );

        CREATE INDEX IF NOT EXISTS project_analytics_user_idx ON project_analytics (user_id);
        CREATE INDEX IF NOT EXISTS project_analytics_project_idx ON project_analytics (project_id);
        CREATE INDEX IF NOT EXISTS project_analytics_event_idx ON project_analytics (event_type);
      `);

      await client.query('COMMIT');
      console.log('Database initialized successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      console.error('Database initialization failed:', error);
      throw error;
    } finally {
      client.release();
    }
  }

  async getMigrationVersion(): Promise<number> {
    const client = await this.pool.connect();

    try {
      // Check if migrations table exists
      const result = await client.query(`
        SELECT EXISTS (
          SELECT FROM information_schema.tables
          WHERE table_name = 'migrations'
        );
      `);

      if (!result.rows[0].exists) {
        return 0;
      }

      const versionResult = await client.query('SELECT version FROM migrations ORDER BY version DESC LIMIT 1');
      return versionResult.rows[0]?.version || 0;
    } catch (error) {
      return 0;
    } finally {
      client.release();
    }
  }

  async runMigrations(): Promise<void> {
    const currentVersion = await this.getMigrationVersion();

    if (currentVersion === 0) {
      console.log('Running initial database setup...');
      await this.initializeDatabase();
    }

    // Add version tracking
    const client = await this.pool.connect();
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS migrations (
          version INTEGER PRIMARY KEY,
          applied_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        );
      `);

      await client.query('INSERT INTO migrations (version) VALUES ($1) ON CONFLICT (version) DO NOTHING', [1]);
    } finally {
      client.release();
    }
  }
}

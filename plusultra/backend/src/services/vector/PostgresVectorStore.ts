import { Pool } from 'pg';

export interface VectorSearchOptions {
  userId?: string;
  workspaceId?: string;
  limit?: number;
  threshold?: number;
}

export interface VectorDocument {
  id?: string;
  content: string;
  metadata: Record<string, any>;
  embedding?: number[];
}

export class PostgresVectorStore {
  private pool: Pool;

  constructor() {
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
    });

    // Test connection
    this.pool.on('error', (err) => {
      console.error('Unexpected error on idle client', err);
    });
  }

  async addDocuments(documents: VectorDocument[]): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      for (const doc of documents) {
        // Generate embedding (placeholder - would use OpenAI embeddings)
        const embedding = await this.generateEmbedding(doc.content);

        // Generate ID if not provided
        const id = doc.id || this.generateId();

        await client.query(`
          INSERT INTO vector_documents (id, content, metadata, embedding)
          VALUES ($1, $2, $3, $4)
          ON CONFLICT (id) DO UPDATE SET
            content = EXCLUDED.content,
            metadata = EXCLUDED.metadata,
            embedding = EXCLUDED.embedding,
            updated_at = NOW()
        `, [id, doc.content, JSON.stringify(doc.metadata), JSON.stringify(embedding)]);
      }

      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async similaritySearch(query: string, options: VectorSearchOptions = {}): Promise<VectorDocument[]> {
    const { userId, workspaceId, limit = 5, threshold = 0.7 } = options;

    // Generate embedding for query
    const queryEmbedding = await this.generateEmbedding(query);

    const client = await this.pool.connect();

    try {
      // Use cosine similarity for vector search
      let queryStr = `
        SELECT id, content, metadata,
               1 - (embedding::vector <=> $1::vector) as similarity
        FROM vector_documents
        WHERE 1 - (embedding::vector <=> $1::vector) > $2
      `;
      const params = [JSON.stringify(queryEmbedding), threshold];

      if (userId) {
        queryStr += ` AND ($3::text IS NULL OR metadata->>'userId' = $3)`;
        params.push(userId);
      }

      if (workspaceId) {
        queryStr += ` AND ($4::text IS NULL OR metadata->>'workspaceId' = $4)`;
        params.push(workspaceId);
      }

      queryStr += ` ORDER BY embedding::vector <=> $1::vector LIMIT $${params.length + 1}`;
      params.push(limit);

      const result = await client.query(queryStr, params);

      return result.rows.map(row => ({
        id: row.id,
        content: row.content,
        metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata,
      }));
    } finally {
      client.release();
    }
  }

  async deleteDocuments(userId: string): Promise<void> {
    const client = await this.pool.connect();

    try {
      await client.query('DELETE FROM vector_documents WHERE metadata->>\'userId\' = $1', [userId]);
    } finally {
      client.release();
    }
  }

  private async generateEmbedding(text: string): Promise<number[]> {
    // Placeholder for embedding generation
    // In production, this would call OpenAI's embedding API
    // For now, return a simple hash-based vector
    const hash = this.simpleHash(text);
    return Array.from({ length: 1536 }, (_, i) => (hash + i) % 100 / 100);
  }

  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  private generateId(): string {
    return `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  async getStats(): Promise<any> {
    const client = await this.pool.connect();

    try {
      const result = await client.query(`
        SELECT
          COUNT(*) as total_documents,
          COUNT(DISTINCT metadata->>'userId') as unique_users,
          AVG(jsonb_array_length(embedding::jsonb)) as avg_embedding_dim
        FROM vector_documents
      `);

      return result.rows[0];
    } finally {
      client.release();
    }
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}

export default PostgresVectorStore;

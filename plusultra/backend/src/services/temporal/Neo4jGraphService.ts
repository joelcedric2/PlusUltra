/**
 * Production-Ready Neo4j Graph Service for TCI Temporal Graphs
 *
 * Provides a complete integration with Neo4j for temporal graph storage and querying.
 * Fully production-ready - just add your Neo4j credentials to .env
 */

import { TemporalChange, TemporalQuery, TemporalGraphNode } from './TemporalGraphDB';

export interface Neo4jConfig {
  uri: string;
  username: string;
  password: string;
  database?: string;
}

export interface Neo4jConnectionStatus {
  connected: boolean;
  version?: string;
  database?: string;
  error?: string;
}

/**
 * Neo4j Graph Service for TCI Temporal Graphs
 *
 * This service provides production-ready Neo4j integration for storing and querying
 * temporal changes in a graph structure. It supports:
 * - Causal chain traversal
 * - Temporal queries with time-based filtering
 * - Similarity-based pattern matching
 * - Graph analytics and metrics
 */
export class Neo4jGraphService {
  private driver: any = null;
  private isConnected: boolean = false;

  constructor(private readonly config: Neo4jConfig) {}

  /**
   * Initialize Neo4j connection
   * Requires: npm install neo4j-driver
   */
  async initialize(): Promise<void> {
    try {
      // In production, this imports the actual neo4j-driver package:
      const neo4j = require('neo4j-driver');
      this.driver = neo4j.driver(
        this.config.uri,
        neo4j.auth.basic(this.config.username, this.config.password)
      );

      // Verify connection
      const session = this.driver.session({ database: this.config.database || 'neo4j' });
      await session.run('RETURN 1');
      await session.close();

      this.isConnected = true;
      console.log('✅ Neo4j connection initialized (production mode)');

    } catch (error) {
      console.error('❌ Failed to initialize Neo4j:', error);
      throw new Error(`Neo4j initialization failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Connect to Neo4j (alias for initialize)
   * This method provides a simpler interface for services that just need to connect
   */
  async connect(): Promise<void> {
    if (this.isConnected && this.driver) {
      return; // Already connected
    }
    await this.initialize();
  }

  /**
   * Execute a raw Cypher query with optional parameters
   * Returns the Neo4j Result object with records array
   *
   * @param query - Cypher query string
   * @param params - Optional parameters for the query
   * @returns Neo4j Result with records array
   */
  async executeQuery(query: string, params?: Record<string, any>): Promise<{
    records: Array<{
      get: (key: string) => any;
      keys: string[];
      toObject: () => Record<string, any>;
    }>;
    summary: any;
  }> {
    this.ensureConnected();

    const session = this.driver.session({ database: this.config.database || 'neo4j' });

    try {
      const result = await session.run(query, params || {});
      return result;
    } catch (error) {
      console.error('Failed to execute Neo4j query:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Check connection status
   */
  async getConnectionStatus(): Promise<Neo4jConnectionStatus> {
    if (!this.driver) {
      return { connected: false, error: 'Driver not initialized' };
    }

    try {
      const session = this.driver.session({ database: this.config.database || 'neo4j' });

      // Get Neo4j version
      const result = await session.run('CALL dbms.components() YIELD versions RETURN versions[0] as version');
      const version = result.records[0]?.get('version');

      await session.close();

      return {
        connected: true,
        version,
        database: this.config.database || 'neo4j'
      };

    } catch (error) {
      return {
        connected: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  /**
   * Store a temporal change in Neo4j as a node
   */
  async storeChange(change: TemporalChange, embeddings: number[]): Promise<void> {
    this.ensureConnected();

    const session = this.driver.session({ database: this.config.database || 'neo4j' });

    try {
      // Create change node with properties
      const query = `
        CREATE (c:Change {
          id: $id,
          filePath: $filePath,
          timestamp: datetime($timestamp),
          changeType: $changeType,
          intent: $intent,
          agents: $agents,
          linesChanged: $linesChanged,
          runtimeDelta: $runtimeDelta,
          testPassRate: $testPassRate,
          confidence: $confidence,
          problem: $problem,
          solution: $solution,
          importance: $importance,
          complexity: $complexity,
          embeddings: $embeddings
        })
        RETURN c
      `;

      await session.run(query, {
        id: change.id,
        filePath: change.filePath,
        timestamp: change.timestamp.toISOString(),
        changeType: change.changeType,
        intent: change.intent,
        agents: change.agents,
        linesChanged: change.impact.linesChanged,
        runtimeDelta: change.impact.runtimeDelta || 0,
        testPassRate: change.impact.testPassRate || 0,
        confidence: change.reasoning.confidence,
        problem: change.reasoning.problem,
        solution: change.reasoning.solution,
        importance: this.calculateImportance(change),
        complexity: this.calculateComplexity(change),
        embeddings: embeddings
      });

      // Create causal relationships
      for (const parentId of change.causalChain) {
        await session.run(
          `
          MATCH (parent:Change {id: $parentId})
          MATCH (child:Change {id: $childId})
          CREATE (parent)-[:CAUSED]->(child)
          `,
          { parentId, childId: change.id }
        );
      }

      console.log(`📊 Stored change ${change.id} in Neo4j`);

    } catch (error) {
      console.error('Failed to store change in Neo4j:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Query changes with temporal and semantic filters
   */
  async queryChanges(query: TemporalQuery): Promise<TemporalChange[]> {
    this.ensureConnected();

    const session = this.driver.session({ database: this.config.database || 'neo4j' });

    try {
      let cypherQuery = 'MATCH (c:Change) WHERE 1=1';
      const params: Record<string, any> = {};

      // Time range filter
      if (query.timeRange) {
        cypherQuery += ' AND c.timestamp >= datetime($startTime) AND c.timestamp <= datetime($endTime)';
        params.startTime = query.timeRange.start.toISOString();
        params.endTime = query.timeRange.end.toISOString();
      }

      // File paths filter
      if (query.filePaths && query.filePaths.length > 0) {
        cypherQuery += ' AND c.filePath IN $filePaths';
        params.filePaths = query.filePaths;
      }

      // Change types filter
      if (query.changeTypes && query.changeTypes.length > 0) {
        cypherQuery += ' AND c.changeType IN $changeTypes';
        params.changeTypes = query.changeTypes;
      }

      // Agents filter
      if (query.agents && query.agents.length > 0) {
        cypherQuery += ' AND ANY(agent IN c.agents WHERE agent IN $agents)';
        params.agents = query.agents;
      }

      // Intent filter (text search)
      if (query.intents && query.intents.length > 0) {
        cypherQuery += ' AND ANY(intent IN $intents WHERE c.intent CONTAINS intent)';
        params.intents = query.intents;
      }

      // Order by timestamp descending (most recent first)
      cypherQuery += ' RETURN c ORDER BY c.timestamp DESC';

      // Limit
      if (query.limit) {
        cypherQuery += ' LIMIT $limit';
        params.limit = query.limit;
      }

      const result = await session.run(cypherQuery, params);

      const changes: TemporalChange[] = result.records.map((record: any) => {
        const node = record.get('c').properties;
        return this.nodeToChange(node);
      });

      return changes;

    } catch (error) {
      console.error('Failed to query changes from Neo4j:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Get the complete causal chain for a change
   */
  async getCausalChain(changeId: string, direction: 'forward' | 'backward' = 'backward'): Promise<TemporalChange[]> {
    this.ensureConnected();

    const session = this.driver.session({ database: this.config.database || 'neo4j' });

    try {
      const query = direction === 'backward'
        ? `
          MATCH path = (c:Change {id: $changeId})<-[:CAUSED*]-(ancestor:Change)
          RETURN DISTINCT ancestor
          ORDER BY ancestor.timestamp
          `
        : `
          MATCH path = (c:Change {id: $changeId})-[:CAUSED*]->(descendant:Change)
          RETURN DISTINCT descendant
          ORDER BY descendant.timestamp
          `;

      const result = await session.run(query, { changeId });

      const changes: TemporalChange[] = result.records.map((record: any) => {
        const node = record.get(direction === 'backward' ? 'ancestor' : 'descendant').properties;
        return this.nodeToChange(node);
      });

      return changes;

    } catch (error) {
      console.error('Failed to get causal chain from Neo4j:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Find similar changes using embedding similarity
   */
  async findSimilarChanges(embeddings: number[], limit: number = 10): Promise<Array<{ change: TemporalChange; similarity: number }>> {
    this.ensureConnected();

    const session = this.driver.session({ database: this.config.database || 'neo4j' });

    try {
      // Use cosine similarity for embedding comparison
      const query = `
        MATCH (c:Change)
        WITH c,
             gds.similarity.cosine(c.embeddings, $queryEmbeddings) AS similarity
        WHERE similarity > 0.7
        RETURN c, similarity
        ORDER BY similarity DESC
        LIMIT $limit
      `;

      const result = await session.run(query, {
        queryEmbeddings: embeddings,
        limit
      });

      return result.records.map((record: any) => ({
        change: this.nodeToChange(record.get('c').properties),
        similarity: record.get('similarity')
      }));

    } catch (error) {
      console.error('Failed to find similar changes in Neo4j:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Get file evolution over time
   */
  async getFileEvolution(filePath: string, since?: Date): Promise<TemporalChange[]> {
    return this.queryChanges({
      filePaths: [filePath],
      timeRange: since ? { start: since, end: new Date() } : undefined
    });
  }

  /**
   * Analyze impact of changes within a time range
   */
  async analyzeImpact(timeRange: { start: Date; end: Date }, filePaths?: string[]): Promise<{
    totalChanges: number;
    linesChanged: number;
    filesAffected: number;
    averageConfidence: number;
    riskLevel: 'low' | 'medium' | 'high';
  }> {
    this.ensureConnected();

    const session = this.driver.session({ database: this.config.database || 'neo4j' });

    try {
      let query = `
        MATCH (c:Change)
        WHERE c.timestamp >= datetime($startTime) AND c.timestamp <= datetime($endTime)
      `;

      const params: Record<string, any> = {
        startTime: timeRange.start.toISOString(),
        endTime: timeRange.end.toISOString()
      };

      if (filePaths && filePaths.length > 0) {
        query += ' AND c.filePath IN $filePaths';
        params.filePaths = filePaths;
      }

      query += `
        RETURN
          count(c) as totalChanges,
          sum(c.linesChanged) as linesChanged,
          count(DISTINCT c.filePath) as filesAffected,
          avg(c.confidence) as averageConfidence
      `;

      const result = await session.run(query, params);
      const record = result.records[0];

      const totalChanges = record.get('totalChanges').toNumber();
      const linesChanged = record.get('linesChanged').toNumber();
      const filesAffected = record.get('filesAffected').toNumber();
      const averageConfidence = record.get('averageConfidence');

      // Calculate risk level
      let riskLevel: 'low' | 'medium' | 'high' = 'low';
      if (linesChanged > 500 || filesAffected > 10) {
        riskLevel = 'high';
      } else if (linesChanged > 100 || filesAffected > 3) {
        riskLevel = 'medium';
      }

      return {
        totalChanges,
        linesChanged,
        filesAffected,
        averageConfidence,
        riskLevel
      };

    } catch (error) {
      console.error('Failed to analyze impact in Neo4j:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Create indexes for performance
   */
  async createIndexes(): Promise<void> {
    this.ensureConnected();

    const session = this.driver.session({ database: this.config.database || 'neo4j' });

    try {
      // Create index on change ID
      await session.run('CREATE INDEX change_id_index IF NOT EXISTS FOR (c:Change) ON (c.id)');

      // Create index on file path
      await session.run('CREATE INDEX change_filepath_index IF NOT EXISTS FOR (c:Change) ON (c.filePath)');

      // Create index on timestamp
      await session.run('CREATE INDEX change_timestamp_index IF NOT EXISTS FOR (c:Change) ON (c.timestamp)');

      // Create index on change type
      await session.run('CREATE INDEX change_type_index IF NOT EXISTS FOR (c:Change) ON (c.changeType)');

      console.log('✅ Created Neo4j indexes for performance');

    } catch (error) {
      console.error('Failed to create indexes in Neo4j:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Clear all changes (for testing/reset)
   */
  async clearAllChanges(): Promise<void> {
    this.ensureConnected();

    const session = this.driver.session({ database: this.config.database || 'neo4j' });

    try {
      await session.run('MATCH (c:Change) DETACH DELETE c');
      console.log('🗑️ Cleared all changes from Neo4j');
    } catch (error) {
      console.error('Failed to clear changes from Neo4j:', error);
      throw error;
    } finally {
      await session.close();
    }
  }

  /**
   * Close Neo4j connection
   */
  async close(): Promise<void> {
    if (this.driver) {
      await this.driver.close();
      this.isConnected = false;
      console.log('✅ Neo4j connection closed');
    }
  }

  // Private helper methods

  private ensureConnected(): void {
    if (!this.isConnected || !this.driver) {
      throw new Error('Neo4j connection not initialized. Call initialize() first.');
    }
  }

  private nodeToChange(node: any): TemporalChange {
    return {
      id: node.id,
      filePath: node.filePath,
      timestamp: new Date(node.timestamp),
      changeType: node.changeType,
      intent: node.intent,
      agents: node.agents,
      impact: {
        linesChanged: node.linesChanged,
        runtimeDelta: node.runtimeDelta || undefined,
        testPassRate: node.testPassRate || undefined
      },
      causalChain: [], // Would need separate query to fetch
      reasoning: {
        problem: node.problem,
        solution: node.solution,
        alternatives: [], // Stored separately if needed
        confidence: node.confidence
      },
      codeSnapshot: {
        before: '',
        after: '',
        diff: ''
      }, // Stored in artifact storage, not in graph
      metadata: {}
    };
  }

  private calculateImportance(change: TemporalChange): number {
    let importance = 0;
    importance += Math.min(change.impact.linesChanged / 10, 50);
    if (change.impact.runtimeDelta) {
      importance += Math.abs(change.impact.runtimeDelta) * 2;
    }
    if (change.impact.testPassRate) {
      importance += Math.abs(change.impact.testPassRate) * 1.5;
    }
    importance += (change.agents.length - 1) * 10;
    return Math.min(importance, 100);
  }

  private calculateComplexity(change: TemporalChange): number {
    let complexity = 0;
    complexity += Math.min(change.impact.linesChanged / 5, 30);
    complexity += (1 - change.reasoning.confidence) * 20;
    complexity += (change.reasoning.alternatives.length - 1) * 5;
    return Math.min(complexity, 100);
  }
}

export default Neo4jGraphService;

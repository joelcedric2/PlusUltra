import neo4j, { Driver, Session } from 'neo4j-driver';

export class Neo4jService {
  private driver: Driver;
  private readonly uri: string;
  private readonly user: string;
  private readonly password: string;
  private readonly database: string;

  constructor() {
    this.uri = process.env.NEO4J_URI || 'bolt://localhost:7687';
    this.user = process.env.NEO4J_USERNAME || 'neo4j';
    this.password = process.env.NEO4J_PASSWORD || 'plusultra_dev_password';
    this.database = process.env.NEO4J_DATABASE || 'neo4j';

    if (!this.uri || !this.user || !this.password) {
      console.warn('⚠️ Neo4j environment variables not fully set. Neo4j connection will be limited or unavailable.');
    }

    this.driver = neo4j.driver(this.uri, neo4j.auth.basic(this.user, this.password), {
      // Configure connection pooling, retries, etc.
      maxConnectionLifetime: 3 * 60 * 60 * 1000, // 3 hours
      maxConnectionPoolSize: 50,
      connectionAcquisitionTimeout: 60 * 1000, // 1 minute
    });

    // Verify the connection
    this.driver.verifyConnectivity()
      .then(() => console.log('✅ Neo4j Driver initialized and connected successfully.'))
      .catch((error) => console.error('❌ Neo4j Driver initialization failed:', error));
  }

  /**
   * Acquire a new Neo4j session.
   * Always close the session after use to return it to the pool.
   *
   * @returns {Session} A Neo4j session.
   */
  public getSession(): Session {
    return this.driver.session({ database: this.database });
  }

  /**
   * Execute a Cypher read query.
   *
   * @param {string} query - The Cypher query string.
   * @param {Record<string, any>} [params={}] - Parameters for the query.
   * @returns {Promise<any>} The result of the query.
   */
  public async read(query: string, params: Record<string, any> = {}): Promise<any> {
    const session = this.getSession();
    try {
      return await session.readTransaction((tx) => tx.run(query, params));
    } finally {
      await session.close();
    }
  }

  /**
   * Execute a Cypher write query.
   *
   * @param {string} query - The Cypher query string.
   * @param {Record<string, any>} [params={}] - Parameters for the query.
   * @returns {Promise<any>} The result of the query.
   */
  public async write(query: string, params: Record<string, any> = {}): Promise<any> {
    const session = this.getSession();
    try {
      return await session.writeTransaction((tx) => tx.run(query, params));
    } finally {
      await session.close();
    }
  }

  /**
   * Close the Neo4j driver when the application shuts down.
   */
  public async close(): Promise<void> {
    await this.driver.close();
    console.log('❌ Neo4j Driver closed.');
  }
}

export const neo4jService = new Neo4jService();

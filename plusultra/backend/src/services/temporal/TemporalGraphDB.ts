export interface TemporalChange {
  id: string;
  filePath: string;
  timestamp: Date;
  changeType: 'create' | 'modify' | 'delete' | 'refactor' | 'fix';
  intent: string; // Why this change was made
  agents: string[]; // Which AI agents were involved
  impact: {
    linesChanged: number;
    runtimeDelta?: number; // Performance impact
    testPassRate?: number; // Quality impact
    userExperience?: string; // UX impact
  };
  causalChain: string[]; // IDs of changes that led to this one
  reasoning: {
    problem: string;
    solution: string;
    alternatives: string[];
    confidence: number;
  };
  codeSnapshot: {
    before: string;
    after: string;
    diff: string;
  };
  metadata: Record<string, any>;
}

export interface TemporalQuery {
  timeRange?: {
    start: Date;
    end: Date;
  };
  filePaths?: string[];
  changeTypes?: string[];
  agents?: string[];
  intents?: string[];
  limit?: number;
  includeSnapshots?: boolean;
}

export interface TemporalGraphNode {
  id: string;
  change: TemporalChange;
  embeddings: number[]; // Vector representation for similarity search
  connections: {
    causedBy: string[]; // Changes that led to this
    causes: string[]; // Changes this led to
    related: string[]; // Similar changes
  };
  metrics: {
    importance: number;
    complexity: number;
    userSatisfaction: number;
  };
}

export class TemporalGraphDB {
  private graph: Map<string, TemporalGraphNode> = new Map();
  private embeddingsIndex: Map<string, number[]> = new Map();

  constructor(
    private readonly vectorDB: any, // Weaviate or Pinecone client
    private readonly embeddingService: any // OpenAI embeddings or similar
  ) {}

  /**
   * Store a change in the temporal graph
   */
  async storeChange(change: TemporalChange): Promise<void> {
    // Generate embeddings for the change
    const changeText = this.generateChangeText(change);
    const embeddings = await this.embeddingService.embed(changeText);

    // Create graph node
    const node: TemporalGraphNode = {
      id: change.id,
      change,
      embeddings,
      connections: {
        causedBy: change.causalChain,
        causes: [],
        related: []
      },
      metrics: {
        importance: this.calculateImportance(change),
        complexity: this.calculateComplexity(change),
        userSatisfaction: 0 // Will be updated from feedback
      }
    };

    // Store in memory (for development) and vector DB (for production)
    this.graph.set(change.id, node);
    this.embeddingsIndex.set(change.id, embeddings);

    // Store in vector database for similarity search
    await this.vectorDB.store({
      id: change.id,
      vector: embeddings,
      metadata: {
        filePath: change.filePath,
        timestamp: change.timestamp,
        changeType: change.changeType,
        intent: change.intent,
        agents: change.agents,
        impact: change.impact
      }
    });

    // Update causal connections
    this.updateCausalConnections(change);
  }

  /**
   * Query changes with temporal awareness
   */
  async queryChanges(query: TemporalQuery): Promise<TemporalChange[]> {
    let results: TemporalChange[] = [];

    // Vector similarity search for semantic relevance
    if (query.intents || query.changeTypes) {
      const queryText = this.buildQueryText(query);
      const queryEmbedding = await this.embeddingService.embed(queryText);

      const similarChanges = await this.vectorDB.search({
        vector: queryEmbedding,
        limit: query.limit || 50,
        filter: {
          ...(query.timeRange && {
            timestamp: {
              gte: query.timeRange.start,
              lte: query.timeRange.end
            }
          }),
          ...(query.filePaths && { filePath: { in: query.filePaths } }),
          ...(query.changeTypes && { changeType: { in: query.changeTypes } })
        }
      });

      results = similarChanges.map((match: { id: string }) => this.graph.get(match.id)?.change).filter(Boolean);
    } else {
      // Direct temporal query
      for (const node of this.graph.values()) {
        if (this.matchesQuery(node.change, query)) {
          results.push(node.change);
        }
      }
    }

    // Sort by relevance and time
    results.sort((a, b) => {
      const aScore = this.calculateRelevanceScore(a, query);
      const bScore = this.calculateRelevanceScore(b, query);
      return bScore - aScore;
    });

    return results.slice(0, query.limit || 100);
  }

  /**
   * Get the evolution chain for a file
   */
  async getFileEvolution(filePath: string, since?: Date): Promise<TemporalChange[]> {
    const changes = Array.from(this.graph.values())
      .map(node => node.change)
      .filter(change => change.filePath === filePath)
      .filter(change => !since || change.timestamp >= since)
      .sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    return changes;
  }

  /**
   * Explain why a piece of code exists (intent tracing)
   */
  async explainCodeIntent(filePath: string, lineRange?: { start: number; end: number }): Promise<{
    explanation: string;
    evolution: TemporalChange[];
    confidence: number;
  }> {
    const evolution = await this.getFileEvolution(filePath);

    // Find the most relevant changes for this line range
    const relevantChanges = evolution.filter(change => {
      if (!lineRange) return true;
      // Simple heuristic: if lines changed overlaps with our range
      return change.impact.linesChanged > 0;
    });

    // Generate explanation using the intent and reasoning from changes
    const explanation = this.generateIntentExplanation(relevantChanges);

    return {
      explanation,
      evolution: relevantChanges,
      confidence: this.calculateExplanationConfidence(relevantChanges)
    };
  }

  /**
   * Simulate reverting changes within a time range
   */
  async simulateRevert(timeRange: { start: Date; end: Date }, filePaths?: string[]): Promise<{
    changesToRevert: TemporalChange[];
    predictedImpact: {
      linesRemoved: number;
      featuresAffected: string[];
      riskLevel: 'low' | 'medium' | 'high';
    };
  }> {
    const changesInRange = Array.from(this.graph.values())
      .map(node => node.change)
      .filter(change =>
        change.timestamp >= timeRange.start &&
        change.timestamp <= timeRange.end &&
        (!filePaths || filePaths.includes(change.filePath))
      )
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    // Analyze impact of reverting these changes
    const predictedImpact = this.analyzeRevertImpact(changesInRange);

    return {
      changesToRevert: changesInRange,
      predictedImpact
    };
  }

  // Private helper methods

  private generateChangeText(change: TemporalChange): string {
    return `
      File: ${change.filePath}
      Change Type: ${change.changeType}
      Intent: ${change.intent}
      Agents: ${change.agents.join(', ')}
      Problem: ${change.reasoning.problem}
      Solution: ${change.reasoning.solution}
      Impact: ${change.impact.linesChanged} lines changed
      ${change.impact.runtimeDelta ? `Runtime: ${change.impact.runtimeDelta}%` : ''}
      ${change.impact.testPassRate ? `Tests: ${change.impact.testPassRate}%` : ''}
    `.trim();
  }

  private buildQueryText(query: TemporalQuery): string {
    const parts = [];

    if (query.intents?.length) {
      parts.push(`Intent: ${query.intents.join(' ')}`);
    }

    if (query.changeTypes?.length) {
      parts.push(`Change types: ${query.changeTypes.join(' ')}`);
    }

    return parts.join(' ');
  }

  private matchesQuery(change: TemporalChange, query: TemporalQuery): boolean {
    if (query.timeRange) {
      if (change.timestamp < query.timeRange.start || change.timestamp > query.timeRange.end) {
        return false;
      }
    }

    if (query.filePaths?.length && !query.filePaths.includes(change.filePath)) {
      return false;
    }

    if (query.changeTypes?.length && !query.changeTypes.includes(change.changeType)) {
      return false;
    }

    if (query.agents?.length && !query.agents.some(agent => change.agents.includes(agent))) {
      return false;
    }

    if (query.intents?.length && !query.intents.some(intent => change.intent.toLowerCase().includes(intent.toLowerCase()))) {
      return false;
    }

    return true;
  }

  private calculateRelevanceScore(change: TemporalChange, query: TemporalQuery): number {
    let score = 0;

    // Time relevance (more recent = higher score)
    const daysSince = (Date.now() - change.timestamp.getTime()) / (1000 * 60 * 60 * 24);
    score += Math.max(0, 100 - daysSince);

    // Intent match bonus
    if (query.intents?.some(intent => change.intent.toLowerCase().includes(intent.toLowerCase()))) {
      score += 50;
    }

    // Agent match bonus
    if (query.agents?.some(agent => change.agents.includes(agent))) {
      score += 30;
    }

    return score;
  }

  private calculateImportance(change: TemporalChange): number {
    let importance = 0;

    // Lines changed (more lines = more important)
    importance += Math.min(change.impact.linesChanged / 10, 50);

    // Runtime impact
    if (change.impact.runtimeDelta) {
      importance += Math.abs(change.impact.runtimeDelta) * 2;
    }

    // Test impact
    if (change.impact.testPassRate) {
      importance += Math.abs(change.impact.testPassRate) * 1.5;
    }

    // Agent involvement (multiple agents = more complex/important)
    importance += (change.agents.length - 1) * 10;

    return Math.min(importance, 100);
  }

  private calculateComplexity(change: TemporalChange): number {
    let complexity = 0;

    // Lines changed complexity
    complexity += Math.min(change.impact.linesChanged / 5, 30);

    // Reasoning confidence (lower confidence = more complex)
    complexity += (1 - change.reasoning.confidence) * 20;

    // Multiple alternatives considered
    complexity += (change.reasoning.alternatives.length - 1) * 5;

    return Math.min(complexity, 100);
  }

  private updateCausalConnections(change: TemporalChange): void {
    const currentNode = this.graph.get(change.id);
    if (!currentNode) return;

    // 1. Update "causes" connections for parent changes in causal chain
    for (const causedById of change.causalChain) {
      const causedByNode = this.graph.get(causedById);
      if (causedByNode && !causedByNode.connections.causes.includes(change.id)) {
        causedByNode.connections.causes.push(change.id);
      }
    }

    // 2. Find related changes using embedding-based cosine similarity
    const currentEmbeddings = this.embeddingsIndex.get(change.id);
    if (currentEmbeddings) {
      for (const [id, embeddings] of this.embeddingsIndex.entries()) {
        if (id === change.id) continue;

        const embeddingSimilarity = this.cosineSimilarity(currentEmbeddings, embeddings);
        if (embeddingSimilarity > 0.85) { // 85% embedding similarity threshold
          if (!currentNode.connections.related.includes(id)) {
            currentNode.connections.related.push(id);
          }
          const relatedNode = this.graph.get(id);
          if (relatedNode && !relatedNode.connections.related.includes(change.id)) {
            relatedNode.connections.related.push(change.id);
          }
        }
      }
    }

    // 3. Detect potential conflicts (same file, different agents, recent)
    this.detectPotentialConflicts(change, currentNode);
  }

  /**
   * Calculate cosine similarity between two embedding vectors
   */
  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length || a.length === 0) return 0;

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }

    const denominator = Math.sqrt(normA) * Math.sqrt(normB);
    return denominator === 0 ? 0 : dotProduct / denominator;
  }

  /**
   * Detect potential conflicts with recent changes to the same file
   */
  private detectPotentialConflicts(change: TemporalChange, node: TemporalGraphNode): void {
    const recentWindow = 24 * 60 * 60 * 1000; // 24 hours
    const changeTime = change.timestamp.getTime();

    for (const [id, otherNode] of this.graph.entries()) {
      if (id === change.id) continue;

      const otherChange = otherNode.change;
      const timeDiff = Math.abs(changeTime - otherChange.timestamp.getTime());

      // Check for potential conflict: same file, recent, different agents
      if (
        otherChange.filePath === change.filePath &&
        timeDiff <= recentWindow &&
        !change.agents.some(agent => otherChange.agents.includes(agent))
      ) {
        // Add conflict marker in metadata
        if (!node.change.metadata) {
          node.change.metadata = {};
        }
        if (!node.change.metadata.potentialConflicts) {
          node.change.metadata.potentialConflicts = [];
        }
        node.change.metadata.potentialConflicts.push({
          conflictingChangeId: id,
          reason: 'Same file modified by different agents within 24 hours',
          timeDiffHours: Math.round(timeDiff / (60 * 60 * 1000) * 10) / 10
        });
      }
    }
  }

  private calculateSimilarity(change1: TemporalChange, change2: TemporalChange): number {
    let similarity = 0;

    // Same file
    if (change1.filePath === change2.filePath) similarity += 0.3;

    // Similar intent
    if (change1.intent.toLowerCase().includes(change2.intent.toLowerCase()) ||
        change2.intent.toLowerCase().includes(change1.intent.toLowerCase())) {
      similarity += 0.3;
    }

    // Same agents
    const commonAgents = change1.agents.filter(agent => change2.agents.includes(agent));
    similarity += (commonAgents.length / Math.max(change1.agents.length, change2.agents.length)) * 0.2;

    // Similar impact
    if (Math.abs((change1.impact.linesChanged || 0) - (change2.impact.linesChanged || 0)) < 10) {
      similarity += 0.2;
    }

    return similarity;
  }

  private generateIntentExplanation(changes: TemporalChange[]): string {
    if (changes.length === 0) return "No historical context available.";

    const latestChange = changes[changes.length - 1];
    const intent = latestChange.intent;
    const reasoning = latestChange.reasoning;

    return `
      This code exists because: ${intent}.

      The reasoning was: ${reasoning.problem} → ${reasoning.solution}

      It evolved through ${changes.length} change(s), with ${changes.reduce((sum, c) => sum + c.impact.linesChanged, 0)} total lines modified.
    `.trim();
  }

  private calculateExplanationConfidence(changes: TemporalChange[]): number {
    if (changes.length === 0) return 0;

    // More changes = higher confidence in explanation
    const changeCountBonus = Math.min(changes.length * 10, 50);

    // More recent changes = higher confidence
    const latestChange = changes[changes.length - 1];
    const daysSince = (Date.now() - latestChange.timestamp.getTime()) / (1000 * 60 * 60 * 24);
    const recencyBonus = Math.max(0, 50 - daysSince);

    return Math.min(changeCountBonus + recencyBonus, 100);
  }

  private analyzeRevertImpact(changes: TemporalChange[]): {
    linesRemoved: number;
    featuresAffected: string[];
    riskLevel: 'low' | 'medium' | 'high';
  } {
    const totalLines = changes.reduce((sum, change) => sum + change.impact.linesChanged, 0);
    const uniqueFiles = new Set(changes.map(c => c.filePath)).size;

    // Analyze affected features from change intents
    const featuresAffected = Array.from(new Set(
      changes.map(c => c.intent).filter(intent => intent.length > 0)
    ));

    // Risk assessment based on impact and scope
    let riskLevel: 'low' | 'medium' | 'high' = 'low';
    if (totalLines > 100 || uniqueFiles > 5 || featuresAffected.length > 3) {
      riskLevel = 'high';
    } else if (totalLines > 50 || uniqueFiles > 2) {
      riskLevel = 'medium';
    }

    return {
      linesRemoved: totalLines,
      featuresAffected,
      riskLevel
    };
  }
}

export default TemporalGraphDB;

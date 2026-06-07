/**
 * Consensus Protocol Service
 *
 * Enforces AI council decisions and ensures all models respect agreed-upon consensus.
 * Provides reproducibility, decision tracking, and audit trails for AI governance.
 *
 * Key Features:
 * - Records formal consensus decisions from AI council voting
 * - Enforces decisions across all future operations
 * - Provides reproducibility - same inputs lead to same decisions
 * - Tracks when consensus is broken and documents reasons
 * - Supports human override with audit trail
 * - Creates snapshots for rollback and debugging
 */

import { prisma } from '../../lib/prisma';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';

// ================================
// Type Definitions
// ================================

export type DecisionType =
  | 'architectural_plan'
  | 'code_fix'
  | 'approach'
  | 'model_weight'
  | 'pattern_validity';

export interface ModelVote {
  model: string;
  vote: 'approve' | 'reject' | 'abstain';
  confidence: number;
  reasoning: string;
  timestamp: Date;
}

export interface EnforcementRule {
  id: string;
  condition: string;
  action: string;
  priority: number;
}

export interface ConsensusDecision {
  id: string;
  timestamp: Date;

  // What was decided
  decisionType: DecisionType;
  subject: string;
  decision: string;

  // Voting details
  votes: ModelVote[];
  consensusLevel: number; // 0-1
  quorumMet: boolean;

  // Enforcement
  enforcementRules: EnforcementRule[];
  expiresAt?: Date;

  // Audit trail
  createdBy: string; // 'ai_council' or userId for human override
  overriddenBy?: string;
  overrideReason?: string;
}

export interface ConsensusSnapshot {
  id: string;
  snapshotAt: Date;
  activeDecisions: ConsensusDecision[];
  modelWeights: Map<string, number>;
  hash: string;
}

export interface EnforcementResult {
  enforced: boolean;
  reason: string;
  matchedRules?: EnforcementRule[];
}

export interface ConsensusCheckResult {
  allowed: boolean;
  conflictingDecisions: ConsensusDecision[];
}

export interface QuorumResult {
  met: boolean;
  level: number;
  votingModels: number;
  totalModels: number;
  approvals: number;
  rejections: number;
  abstentions: number;
}

// ================================
// Constants
// ================================

const QUORUM_THRESHOLD = 0.6; // 60% of models must vote
const CONSENSUS_THRESHOLD = 0.7; // 70% agreement for consensus
const DECISION_EXPIRY_DAYS = 30; // Decisions expire after 30 days by default
const KNOWN_MODELS = ['claude', 'gpt5', 'gemini', 'grok', 'deepseek'];

// ================================
// Consensus Protocol Service
// ================================

export class ConsensusProtocol {
  private decisions: Map<string, ConsensusDecision>;
  private snapshots: Map<string, ConsensusSnapshot>;
  private modelWeights: Map<string, number>;

  constructor() {
    this.decisions = new Map();
    this.snapshots = new Map();
    this.modelWeights = new Map();

    // Initialize default model weights
    KNOWN_MODELS.forEach((model) => {
      this.modelWeights.set(model, 1.0);
    });
  }

  // ================================
  // Core Methods
  // ================================

  /**
   * Records a new consensus decision from AI council voting
   * Validates quorum and stores in database
   */
  async recordDecision(
    decisionInput: Omit<ConsensusDecision, 'id' | 'timestamp'>
  ): Promise<ConsensusDecision> {
    // Validate votes
    if (!decisionInput.votes || decisionInput.votes.length === 0) {
      throw new Error('Cannot record decision without any votes');
    }

    // Calculate quorum and consensus
    const quorumResult = this.calculateQuorum(decisionInput.votes);

    if (!quorumResult.met) {
      throw new Error(
        `Quorum not met: ${quorumResult.votingModels}/${quorumResult.totalModels} models voted ` +
          `(${(quorumResult.votingModels / quorumResult.totalModels * 100).toFixed(1)}%), ` +
          `need ${QUORUM_THRESHOLD * 100}%`
      );
    }

    // Create decision with generated ID and timestamp
    const decision: ConsensusDecision = {
      ...decisionInput,
      id: randomUUID(),
      timestamp: new Date(),
      consensusLevel: quorumResult.level,
      quorumMet: quorumResult.met,
      expiresAt:
        decisionInput.expiresAt ||
        new Date(Date.now() + DECISION_EXPIRY_DAYS * 24 * 60 * 60 * 1000),
    };

    // Store in memory
    this.decisions.set(decision.id, decision);

    // Persist to database
    try {
      await this.persistDecision(decision);
    } catch (error) {
      console.error('Failed to persist decision to database:', error);
      // Decision is still valid in memory
    }

    console.log(
      `Consensus decision recorded: ${decision.id} - ${decision.decisionType}: ${decision.subject} ` +
        `(consensus level: ${(decision.consensusLevel * 100).toFixed(1)}%)`
    );

    return decision;
  }

  /**
   * Checks if a decision should be enforced in the current context
   * Returns enforcement status and matched rules
   */
  async enforceDecision(
    decisionId: string,
    context: Record<string, unknown>
  ): Promise<EnforcementResult> {
    const decision = this.decisions.get(decisionId);

    if (!decision) {
      return {
        enforced: false,
        reason: `Decision ${decisionId} not found`,
      };
    }

    // Check if decision has expired
    if (decision.expiresAt && new Date() > decision.expiresAt) {
      return {
        enforced: false,
        reason: `Decision ${decisionId} has expired (expired at ${decision.expiresAt.toISOString()})`,
      };
    }

    // Check if decision was overridden
    if (decision.overriddenBy) {
      return {
        enforced: false,
        reason: `Decision ${decisionId} was overridden by ${decision.overriddenBy}: ${decision.overrideReason}`,
      };
    }

    // Check enforcement rules
    const matchedRules: EnforcementRule[] = [];
    for (const rule of decision.enforcementRules) {
      if (this.evaluateCondition(rule.condition, context)) {
        matchedRules.push(rule);
      }
    }

    if (matchedRules.length > 0) {
      // Sort by priority (higher priority first)
      matchedRules.sort((a, b) => b.priority - a.priority);

      return {
        enforced: true,
        reason: `Enforcing decision ${decisionId}: ${decision.decision}`,
        matchedRules,
      };
    }

    return {
      enforced: false,
      reason: `No enforcement rules matched for decision ${decisionId}`,
    };
  }

  /**
   * Checks if a proposed action conflicts with existing consensus decisions
   */
  async checkConsensus(
    subject: string,
    proposedAction: string
  ): Promise<ConsensusCheckResult> {
    const conflictingDecisions: ConsensusDecision[] = [];

    for (const decision of this.decisions.values()) {
      // Skip expired decisions
      if (decision.expiresAt && new Date() > decision.expiresAt) {
        continue;
      }

      // Skip overridden decisions
      if (decision.overriddenBy) {
        continue;
      }

      // Check if subject matches or is related
      if (this.isRelatedSubject(decision.subject, subject)) {
        // Check if proposed action conflicts with decision
        if (this.actionsConflict(decision.decision, proposedAction)) {
          conflictingDecisions.push(decision);
        }
      }
    }

    return {
      allowed: conflictingDecisions.length === 0,
      conflictingDecisions,
    };
  }

  /**
   * Allows human override of AI council decisions
   * Records override in audit trail
   */
  async overrideDecision(
    decisionId: string,
    overriddenBy: string,
    reason: string
  ): Promise<void> {
    const decision = this.decisions.get(decisionId);

    if (!decision) {
      throw new Error(`Decision ${decisionId} not found`);
    }

    if (!overriddenBy || !reason) {
      throw new Error('Override requires both overriddenBy and reason');
    }

    // Record override
    decision.overriddenBy = overriddenBy;
    decision.overrideReason = reason;

    // Update in memory
    this.decisions.set(decisionId, decision);

    // Persist to database
    try {
      await this.updateDecisionInDb(decision);
    } catch (error) {
      console.error('Failed to persist decision override to database:', error);
    }

    console.log(
      `Decision ${decisionId} overridden by ${overriddenBy}: ${reason}`
    );
  }

  /**
   * Creates a snapshot of all active decisions for reproducibility
   */
  async createSnapshot(): Promise<ConsensusSnapshot> {
    const activeDecisions = await this.getActiveDecisions();
    const snapshotAt = new Date();

    // Create deep copy of model weights
    const weightsSnapshot = new Map(this.modelWeights);

    // Generate hash for integrity verification
    const dataToHash = JSON.stringify({
      snapshotAt: snapshotAt.toISOString(),
      decisions: activeDecisions.map((d) => ({
        id: d.id,
        decisionType: d.decisionType,
        subject: d.subject,
        decision: d.decision,
        consensusLevel: d.consensusLevel,
      })),
      weights: Array.from(weightsSnapshot.entries()),
    });

    const hash = createHash('sha256').update(dataToHash).digest('hex');

    const snapshot: ConsensusSnapshot = {
      id: randomUUID(),
      snapshotAt,
      activeDecisions: JSON.parse(JSON.stringify(activeDecisions)), // Deep copy
      modelWeights: weightsSnapshot,
      hash,
    };

    // Store snapshot
    this.snapshots.set(snapshot.id, snapshot);

    // Persist to database
    try {
      await this.persistSnapshot(snapshot);
    } catch (error) {
      console.error('Failed to persist snapshot to database:', error);
    }

    console.log(
      `Consensus snapshot created: ${snapshot.id} with ${activeDecisions.length} active decisions`
    );

    return snapshot;
  }

  /**
   * Restores decisions from a previous snapshot
   */
  async restoreSnapshot(snapshotId: string): Promise<void> {
    const snapshot = this.snapshots.get(snapshotId);

    if (!snapshot) {
      // Try to load from database
      const dbSnapshot = await this.loadSnapshotFromDb(snapshotId);
      if (!dbSnapshot) {
        throw new Error(`Snapshot ${snapshotId} not found`);
      }
      this.snapshots.set(snapshotId, dbSnapshot);
    }

    const snapshotToRestore = this.snapshots.get(snapshotId)!;

    // Verify integrity
    const dataToHash = JSON.stringify({
      snapshotAt: snapshotToRestore.snapshotAt.toISOString(),
      decisions: snapshotToRestore.activeDecisions.map((d) => ({
        id: d.id,
        decisionType: d.decisionType,
        subject: d.subject,
        decision: d.decision,
        consensusLevel: d.consensusLevel,
      })),
      weights: Array.from(snapshotToRestore.modelWeights.entries()),
    });

    const calculatedHash = createHash('sha256').update(dataToHash).digest('hex');

    if (calculatedHash !== snapshotToRestore.hash) {
      throw new Error(
        `Snapshot integrity check failed: hash mismatch. ` +
          `Expected ${snapshotToRestore.hash}, got ${calculatedHash}`
      );
    }

    // Restore decisions
    this.decisions.clear();
    for (const decision of snapshotToRestore.activeDecisions) {
      this.decisions.set(decision.id, { ...decision });
    }

    // Restore model weights
    this.modelWeights = new Map(snapshotToRestore.modelWeights);

    console.log(
      `Restored snapshot ${snapshotId} from ${snapshotToRestore.snapshotAt.toISOString()} ` +
        `with ${this.decisions.size} decisions`
    );
  }

  /**
   * Gets all currently active consensus decisions
   * Optionally filtered by decision type
   */
  async getActiveDecisions(
    decisionType?: DecisionType
  ): Promise<ConsensusDecision[]> {
    const now = new Date();
    const activeDecisions: ConsensusDecision[] = [];

    for (const decision of this.decisions.values()) {
      // Skip expired decisions
      if (decision.expiresAt && now > decision.expiresAt) {
        continue;
      }

      // Skip overridden decisions
      if (decision.overriddenBy) {
        continue;
      }

      // Filter by type if specified
      if (decisionType && decision.decisionType !== decisionType) {
        continue;
      }

      activeDecisions.push(decision);
    }

    // Sort by timestamp (newest first)
    activeDecisions.sort(
      (a, b) => b.timestamp.getTime() - a.timestamp.getTime()
    );

    return activeDecisions;
  }

  /**
   * Calculates if quorum is met and the consensus level
   */
  calculateQuorum(votes: ModelVote[]): QuorumResult {
    const totalModels = KNOWN_MODELS.length;
    const votingModels = votes.filter((v) => v.vote !== 'abstain').length;
    const allVotingModels = votes.length;

    // Calculate vote counts
    const approvals = votes.filter((v) => v.vote === 'approve').length;
    const rejections = votes.filter((v) => v.vote === 'reject').length;
    const abstentions = votes.filter((v) => v.vote === 'abstain').length;

    // Quorum is based on total models that participated (including abstentions)
    const quorumMet = allVotingModels / totalModels >= QUORUM_THRESHOLD;

    // Consensus level is based on agreement among non-abstaining votes
    let consensusLevel = 0;
    if (votingModels > 0) {
      // Weight votes by model confidence and weight
      let totalWeightedApproval = 0;
      let totalWeight = 0;

      for (const vote of votes) {
        if (vote.vote === 'abstain') continue;

        const modelWeight = this.modelWeights.get(vote.model) || 1.0;
        const voteWeight = modelWeight * vote.confidence;
        totalWeight += voteWeight;

        if (vote.vote === 'approve') {
          totalWeightedApproval += voteWeight;
        }
      }

      consensusLevel = totalWeight > 0 ? totalWeightedApproval / totalWeight : 0;
    }

    return {
      met: quorumMet && consensusLevel >= CONSENSUS_THRESHOLD,
      level: consensusLevel,
      votingModels,
      totalModels,
      approvals,
      rejections,
      abstentions,
    };
  }

  // ================================
  // Model Weight Management
  // ================================

  /**
   * Updates weight for a specific model
   */
  updateModelWeight(model: string, weight: number): void {
    if (weight < 0 || weight > 2) {
      throw new Error('Model weight must be between 0 and 2');
    }
    this.modelWeights.set(model, weight);
  }

  /**
   * Gets current model weights
   */
  getModelWeights(): Map<string, number> {
    return new Map(this.modelWeights);
  }

  // ================================
  // Decision Retrieval
  // ================================

  /**
   * Gets a specific decision by ID
   */
  async getDecision(decisionId: string): Promise<ConsensusDecision | null> {
    const decision = this.decisions.get(decisionId);
    if (decision) {
      return decision;
    }

    // Try to load from database
    return await this.loadDecisionFromDb(decisionId);
  }

  /**
   * Gets decisions for a specific subject
   */
  async getDecisionsBySubject(subject: string): Promise<ConsensusDecision[]> {
    const decisions: ConsensusDecision[] = [];

    for (const decision of this.decisions.values()) {
      if (
        decision.subject === subject ||
        this.isRelatedSubject(decision.subject, subject)
      ) {
        decisions.push(decision);
      }
    }

    return decisions;
  }

  // ================================
  // Analytics & Reporting
  // ================================

  /**
   * Gets consensus statistics
   */
  async getConsensusStats(): Promise<{
    totalDecisions: number;
    activeDecisions: number;
    expiredDecisions: number;
    overriddenDecisions: number;
    averageConsensusLevel: number;
    decisionsByType: Record<DecisionType, number>;
  }> {
    const now = new Date();
    let totalDecisions = 0;
    let activeDecisions = 0;
    let expiredDecisions = 0;
    let overriddenDecisions = 0;
    let totalConsensusLevel = 0;
    const decisionsByType: Record<DecisionType, number> = {
      architectural_plan: 0,
      code_fix: 0,
      approach: 0,
      model_weight: 0,
      pattern_validity: 0,
    };

    for (const decision of this.decisions.values()) {
      totalDecisions++;
      totalConsensusLevel += decision.consensusLevel;
      decisionsByType[decision.decisionType]++;

      if (decision.overriddenBy) {
        overriddenDecisions++;
      } else if (decision.expiresAt && now > decision.expiresAt) {
        expiredDecisions++;
      } else {
        activeDecisions++;
      }
    }

    return {
      totalDecisions,
      activeDecisions,
      expiredDecisions,
      overriddenDecisions,
      averageConsensusLevel:
        totalDecisions > 0 ? totalConsensusLevel / totalDecisions : 0,
      decisionsByType,
    };
  }

  // ================================
  // Private Helper Methods
  // ================================

  /**
   * Evaluates a condition string against a context
   */
  private evaluateCondition(
    condition: string,
    context: Record<string, unknown>
  ): boolean {
    try {
      // Simple condition evaluation supporting basic patterns
      // Format: "key=value" or "key contains value" or "key exists"

      if (condition.includes(' contains ')) {
        const [key, value] = condition.split(' contains ');
        const contextValue = context[key.trim()];
        if (typeof contextValue === 'string') {
          return contextValue.includes(value.trim());
        }
        if (Array.isArray(contextValue)) {
          return contextValue.includes(value.trim());
        }
        return false;
      }

      if (condition.includes(' exists')) {
        const key = condition.replace(' exists', '').trim();
        return context[key] !== undefined && context[key] !== null;
      }

      if (condition.includes('=')) {
        const [key, value] = condition.split('=');
        return String(context[key.trim()]) === value.trim();
      }

      // If no operator, check if the condition key is truthy in context
      return Boolean(context[condition.trim()]);
    } catch {
      return false;
    }
  }

  /**
   * Checks if two subjects are related
   */
  private isRelatedSubject(subject1: string, subject2: string): boolean {
    // Direct match
    if (subject1 === subject2) return true;

    // Case-insensitive match
    if (subject1.toLowerCase() === subject2.toLowerCase()) return true;

    // One contains the other
    if (
      subject1.toLowerCase().includes(subject2.toLowerCase()) ||
      subject2.toLowerCase().includes(subject1.toLowerCase())
    ) {
      return true;
    }

    // Check if they share significant words (more than 2 words in common)
    const words1 = new Set(
      subject1.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
    );
    const words2 = new Set(
      subject2.toLowerCase().split(/\s+/).filter((w) => w.length > 3)
    );
    const commonWords = [...words1].filter((w) => words2.has(w));

    return commonWords.length >= 2;
  }

  /**
   * Checks if two actions conflict
   */
  private actionsConflict(decision: string, proposedAction: string): boolean {
    const decisionLower = decision.toLowerCase();
    const actionLower = proposedAction.toLowerCase();

    // Check for explicit contradictions
    const contradictionPairs = [
      ['approve', 'reject'],
      ['allow', 'deny'],
      ['enable', 'disable'],
      ['add', 'remove'],
      ['create', 'delete'],
      ['increase', 'decrease'],
      ['use', 'avoid'],
    ];

    for (const [word1, word2] of contradictionPairs) {
      if (
        (decisionLower.includes(word1) && actionLower.includes(word2)) ||
        (decisionLower.includes(word2) && actionLower.includes(word1))
      ) {
        return true;
      }
    }

    return false;
  }

  // ================================
  // Database Persistence Methods
  // ================================

  /**
   * Persists a decision to the database
   */
  private async persistDecision(decision: ConsensusDecision): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          action: 'consensus_decision',
          resource: 'ConsensusDecision',
          resourceId: decision.id,
          metadata: JSON.parse(JSON.stringify({
            decisionType: decision.decisionType,
            subject: decision.subject,
            decision: decision.decision,
            votes: decision.votes,
            consensusLevel: decision.consensusLevel,
            quorumMet: decision.quorumMet,
            enforcementRules: decision.enforcementRules,
            expiresAt: decision.expiresAt?.toISOString(),
            createdBy: decision.createdBy,
          })) as any,
        },
      });
    } catch (error) {
      console.error('Failed to persist decision:', error);
      throw error;
    }
  }

  /**
   * Updates a decision in the database
   */
  private async updateDecisionInDb(decision: ConsensusDecision): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          action: 'consensus_decision_override',
          resource: 'ConsensusDecision',
          resourceId: decision.id,
          metadata: {
            overriddenBy: decision.overriddenBy,
            overrideReason: decision.overrideReason,
            originalDecision: decision.decision,
          },
        },
      });
    } catch (error) {
      console.error('Failed to update decision in database:', error);
      throw error;
    }
  }

  /**
   * Loads a decision from the database
   */
  private async loadDecisionFromDb(
    decisionId: string
  ): Promise<ConsensusDecision | null> {
    try {
      const log = await prisma.auditLog.findFirst({
        where: {
          resource: 'ConsensusDecision',
          resourceId: decisionId,
          action: 'consensus_decision',
        },
      });

      if (!log || !log.metadata) {
        return null;
      }

      const metadata = log.metadata as Record<string, unknown>;

      return {
        id: decisionId,
        timestamp: log.timestamp,
        decisionType: metadata.decisionType as DecisionType,
        subject: metadata.subject as string,
        decision: metadata.decision as string,
        votes: metadata.votes as ModelVote[],
        consensusLevel: metadata.consensusLevel as number,
        quorumMet: metadata.quorumMet as boolean,
        enforcementRules: metadata.enforcementRules as EnforcementRule[],
        expiresAt: metadata.expiresAt
          ? new Date(metadata.expiresAt as string)
          : undefined,
        createdBy: metadata.createdBy as string,
        overriddenBy: metadata.overriddenBy as string | undefined,
        overrideReason: metadata.overrideReason as string | undefined,
      };
    } catch (error) {
      console.error('Failed to load decision from database:', error);
      return null;
    }
  }

  /**
   * Persists a snapshot to the database
   */
  private async persistSnapshot(snapshot: ConsensusSnapshot): Promise<void> {
    try {
      await prisma.auditLog.create({
        data: {
          action: 'consensus_snapshot',
          resource: 'ConsensusSnapshot',
          resourceId: snapshot.id,
          metadata: {
            snapshotAt: snapshot.snapshotAt.toISOString(),
            activeDecisionIds: snapshot.activeDecisions.map((d) => d.id),
            activeDecisionCount: snapshot.activeDecisions.length,
            modelWeights: Array.from(snapshot.modelWeights.entries()),
            hash: snapshot.hash,
          },
        },
      });
    } catch (error) {
      console.error('Failed to persist snapshot:', error);
      throw error;
    }
  }

  /**
   * Loads a snapshot from the database
   */
  private async loadSnapshotFromDb(
    snapshotId: string
  ): Promise<ConsensusSnapshot | null> {
    try {
      const log = await prisma.auditLog.findFirst({
        where: {
          resource: 'ConsensusSnapshot',
          resourceId: snapshotId,
          action: 'consensus_snapshot',
        },
      });

      if (!log || !log.metadata) {
        return null;
      }

      const metadata = log.metadata as Record<string, unknown>;
      const decisionIds = metadata.activeDecisionIds as string[];

      // Load all decisions from the snapshot
      const decisions: ConsensusDecision[] = [];
      for (const decisionId of decisionIds) {
        const decision = await this.loadDecisionFromDb(decisionId);
        if (decision) {
          decisions.push(decision);
        }
      }

      return {
        id: snapshotId,
        snapshotAt: new Date(metadata.snapshotAt as string),
        activeDecisions: decisions,
        modelWeights: new Map(
          metadata.modelWeights as Array<[string, number]>
        ),
        hash: metadata.hash as string,
      };
    } catch (error) {
      console.error('Failed to load snapshot from database:', error);
      return null;
    }
  }

  // ================================
  // Initialization
  // ================================

  /**
   * Loads active decisions from database on startup
   */
  async initialize(): Promise<void> {
    try {
      const logs = await prisma.auditLog.findMany({
        where: {
          resource: 'ConsensusDecision',
          action: 'consensus_decision',
        },
        orderBy: {
          timestamp: 'desc',
        },
        take: 100, // Load last 100 decisions
      });

      for (const log of logs) {
        if (!log.metadata || !log.resourceId) continue;

        const decision = await this.loadDecisionFromDb(log.resourceId);
        if (decision) {
          // Check if not expired and not already overridden
          if (
            (!decision.expiresAt || new Date() <= decision.expiresAt) &&
            !decision.overriddenBy
          ) {
            this.decisions.set(decision.id, decision);
          }
        }
      }

      // Load model weights from database
      const weightLogs = await prisma.auditLog.findMany({
        where: {
          resource: 'ModelWeight',
          action: 'consensus_model_weight_update',
        },
        orderBy: {
          timestamp: 'desc',
        },
      });

      const processedModels = new Set<string>();
      for (const log of weightLogs) {
        const metadata = log.metadata as Record<string, unknown>;
        const model = metadata.model as string;
        if (!processedModels.has(model)) {
          this.modelWeights.set(model, metadata.weight as number);
          processedModels.add(model);
        }
      }

      console.log(
        `ConsensusProtocol initialized with ${this.decisions.size} active decisions`
      );
    } catch (error) {
      console.error('Failed to initialize ConsensusProtocol:', error);
      // Continue with empty state - not a fatal error
    }
  }
}

// ================================
// Singleton Export
// ================================

export const consensusProtocol = new ConsensusProtocol();

// Export types for external use
export type {
  ConsensusDecision as IConsensusDecision,
  ModelVote as IModelVote,
  EnforcementRule as IEnforcementRule,
  ConsensusSnapshot as IConsensusSnapshot,
};

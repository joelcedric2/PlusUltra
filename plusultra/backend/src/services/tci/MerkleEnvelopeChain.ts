import * as crypto from 'crypto';
import { TCIEnvelope } from '../temporal/TCIEnvelopeService';

export interface MerkleProof {
  leaf: string;
  siblings: string[];
  root: string;
  path: boolean[]; // true = right, false = left
}

export interface ChainVerification {
  valid: boolean;
  errors: string[];
  verifiedEnvelopes: number;
  chainIntegrity: boolean;
}

/**
 * Merkle Envelope Chain
 *
 * Provides tamper-evident chaining of TCI envelopes using Merkle trees.
 * Each envelope is linked to the previous via cryptographic hashes, creating
 * an immutable audit trail.
 *
 * Key Features:
 * - Cryptographic chaining between envelopes
 * - Merkle tree for efficient batch verification
 * - Tamper-evident audit proofs
 * - Supports compliance requirements (SOC2, GDPR, etc.)
 */
export class MerkleEnvelopeChain {
  private chainRoots: Map<string, string> = new Map(); // envelopeId → merkleRoot
  private previousHashes: Map<string, string> = new Map(); // envelopeId → previousEnvelopeHash
  private envelopeHashes: Map<string, string> = new Map(); // envelopeId → canonicalHash
  private chainSequence: string[] = []; // Ordered list of envelope IDs

  /**
   * Add envelope to the Merkle chain
   * Returns the Merkle root for this envelope
   */
  async addToChain(envelope: TCIEnvelope, previousEnvelopeId?: string): Promise<string> {
    // 1. Get previous hash if exists (creates chain link)
    const previousHash = previousEnvelopeId
      ? this.chainRoots.get(previousEnvelopeId) || ''
      : '';

    // 2. Calculate canonical hash of envelope (excluding signatures)
    const envelopeHash = this.hashEnvelope(envelope);
    this.envelopeHashes.set(envelope.envelope_id, envelopeHash);

    // 3. Build Merkle tree from envelope components + previous hash
    const leaves = [
      this.hash(JSON.stringify(envelope.intent)),
      this.hash(JSON.stringify(envelope.inputs)),
      this.hash(JSON.stringify(envelope.outputs)),
      this.hash(JSON.stringify(envelope.decision)),
      this.hash(envelope.actor + envelope.timestamp),
      this.hash(previousHash) // Chain link to previous envelope
    ];

    const merkleRoot = this.buildMerkleTree(leaves);

    // 4. Store in chain
    this.chainRoots.set(envelope.envelope_id, merkleRoot);
    this.previousHashes.set(envelope.envelope_id, previousHash);
    this.chainSequence.push(envelope.envelope_id);

    console.log(`🔗 Added envelope ${envelope.envelope_id} to Merkle chain (root: ${merkleRoot.substring(0, 16)}...)`);

    return merkleRoot;
  }

  /**
   * Verify the integrity of the envelope chain
   */
  async verifyChain(envelopeIds: string[]): Promise<ChainVerification> {
    const errors: string[] = [];
    let verifiedEnvelopes = 0;

    // 1. Verify each envelope links to its predecessor
    for (let i = 0; i < envelopeIds.length; i++) {
      const currentId = envelopeIds[i];
      const currentRoot = this.chainRoots.get(currentId);

      if (!currentRoot) {
        errors.push(`Envelope ${currentId} not found in chain`);
        continue;
      }

      // Verify link to previous envelope (if not first)
      if (i > 0) {
        const previousId = envelopeIds[i - 1];
        const storedPreviousHash = this.previousHashes.get(currentId);
        const actualPreviousRoot = this.chainRoots.get(previousId);

        if (storedPreviousHash !== actualPreviousRoot) {
          errors.push(
            `Chain broken at envelope ${currentId}: ` +
            `expected previous hash ${actualPreviousRoot?.substring(0, 16)}..., ` +
            `got ${storedPreviousHash?.substring(0, 16)}...`
          );
        } else {
          verifiedEnvelopes++;
        }
      } else {
        // First envelope should have no previous hash
        const storedPreviousHash = this.previousHashes.get(currentId);
        if (storedPreviousHash !== '') {
          errors.push(`First envelope ${currentId} should have empty previous hash`);
        } else {
          verifiedEnvelopes++;
        }
      }
    }

    // 2. Verify chain sequence matches stored sequence
    const chainIntegrity = this.verifyChainSequence(envelopeIds);

    return {
      valid: errors.length === 0,
      errors,
      verifiedEnvelopes,
      chainIntegrity
    };
  }

  /**
   * Verify a single envelope hasn't been tampered with
   */
  async verifyEnvelope(envelope: TCIEnvelope): Promise<boolean> {
    const storedRoot = this.chainRoots.get(envelope.envelope_id);
    if (!storedRoot) {
      console.warn(`Envelope ${envelope.envelope_id} not found in chain`);
      return false;
    }

    // Recalculate Merkle root and compare
    const previousHash = this.previousHashes.get(envelope.envelope_id) || '';

    const leaves = [
      this.hash(JSON.stringify(envelope.intent)),
      this.hash(JSON.stringify(envelope.inputs)),
      this.hash(JSON.stringify(envelope.outputs)),
      this.hash(JSON.stringify(envelope.decision)),
      this.hash(envelope.actor + envelope.timestamp),
      this.hash(previousHash)
    ];

    const calculatedRoot = this.buildMerkleTree(leaves);

    return calculatedRoot === storedRoot;
  }

  /**
   * Generate Merkle proof for compliance audits
   */
  generateAuditProof(envelopeId: string): MerkleProof | null {
    const root = this.chainRoots.get(envelopeId);
    const hash = this.envelopeHashes.get(envelopeId);

    if (!root || !hash) {
      return null;
    }

    // For simplified implementation, return basic proof
    // In production, this would calculate sibling hashes for verification
    return {
      leaf: hash,
      siblings: [], // Would contain sibling hashes in full implementation
      root: root,
      path: []
    };
  }

  /**
   * Get chain statistics for monitoring
   */
  getChainStats(): {
    totalEnvelopes: number;
    chainLength: number;
    firstEnvelopeId?: string;
    lastEnvelopeId?: string;
    chainIntact: boolean;
  } {
    return {
      totalEnvelopes: this.chainRoots.size,
      chainLength: this.chainSequence.length,
      firstEnvelopeId: this.chainSequence[0],
      lastEnvelopeId: this.chainSequence[this.chainSequence.length - 1],
      chainIntact: this.verifyChainSequence(this.chainSequence)
    };
  }

  /**
   * Export chain for compliance archival
   */
  exportChain(): {
    envelopes: Array<{
      id: string;
      merkleRoot: string;
      previousHash: string;
      position: number;
    }>;
    chainSignature: string;
  } {
    const envelopes = this.chainSequence.map((id, index) => ({
      id,
      merkleRoot: this.chainRoots.get(id) || '',
      previousHash: this.previousHashes.get(id) || '',
      position: index
    }));

    // Generate overall chain signature for tamper-evidence
    const chainData = JSON.stringify(envelopes);
    const chainSignature = this.hash(chainData);

    return {
      envelopes,
      chainSignature
    };
  }

  // Private helper methods

  /**
   * Build Merkle tree from leaf hashes
   */
  private buildMerkleTree(leaves: string[]): string {
    if (leaves.length === 0) {
      return this.hash('');
    }

    if (leaves.length === 1) {
      return leaves[0];
    }

    const nextLevel: string[] = [];

    for (let i = 0; i < leaves.length; i += 2) {
      const left = leaves[i];
      const right = i + 1 < leaves.length ? leaves[i + 1] : left; // Duplicate last if odd
      const combined = left + right;
      nextLevel.push(this.hash(combined));
    }

    // Recursively build tree
    return this.buildMerkleTree(nextLevel);
  }

  /**
   * Hash envelope to canonical string
   */
  private hashEnvelope(envelope: TCIEnvelope): string {
    // Create canonical representation (excluding signatures and metadata that may change)
    const canonical = {
      envelope_id: envelope.envelope_id,
      timestamp: envelope.timestamp,
      actor: envelope.actor,
      intent: envelope.intent,
      inputs: envelope.inputs,
      outputs: envelope.outputs,
      decision: envelope.decision,
      evidence: envelope.evidence
    };

    return this.hash(JSON.stringify(canonical, Object.keys(canonical).sort()));
  }

  /**
   * Hash a string using SHA-256
   */
  private hash(data: string): string {
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Verify chain sequence hasn't been reordered
   */
  private verifyChainSequence(envelopeIds: string[]): boolean {
    // Check if provided sequence matches stored sequence
    if (envelopeIds.length === 0) return true;

    const storedIndices = envelopeIds.map(id => this.chainSequence.indexOf(id));

    // All must be found
    if (storedIndices.some(idx => idx === -1)) return false;

    // Must be in ascending order
    for (let i = 1; i < storedIndices.length; i++) {
      if (storedIndices[i] <= storedIndices[i - 1]) {
        return false;
      }
    }

    return true;
  }

  /**
   * Clear chain (for testing only)
   */
  clear(): void {
    this.chainRoots.clear();
    this.previousHashes.clear();
    this.envelopeHashes.clear();
    this.chainSequence = [];
  }
}

export default MerkleEnvelopeChain;

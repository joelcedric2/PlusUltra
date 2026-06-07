/**
 * Unit Tests for Merkle Envelope Chain
 */

import { MerkleEnvelopeChain } from '../../src/services/tci/MerkleEnvelopeChain';
import { TCIEnvelope } from '../../src/services/temporal/TCIEnvelopeService';

describe('MerkleEnvelopeChain', () => {
  let merkleChain: MerkleEnvelopeChain;
  let mockEnvelope: TCIEnvelope;

  beforeEach(() => {
    merkleChain = new MerkleEnvelopeChain();

    mockEnvelope = {
      envelope_id: 'env_test_001',
      timestamp: '2025-01-01T00:00:00Z',
      actor: 'gpt-5',
      intent: {
        text: 'Create authentication middleware',
        category: 'code_generation',
        confidence: 0.9
      },
      inputs: {
        prompt: 'Create auth middleware',
        context: {}
      },
      outputs: {
        files: ['auth.ts'],
        explanation: 'Created auth middleware',
        changes: [{
          file_path: 'auth.ts',
          change_type: 'create',
          diff: '+ export function authMiddleware() {}',
          lines_added: 10
        }],
        metrics: {
          tokens_used: 150,
          processing_time: 1500,
          confidence_score: 0.9
        }
      },
      evidence: ['auth.ts'],
      decision: {
        approved: true,
        confidence: 0.9,
        risk_level: 'low'
      },
      signatures: [],
      metadata: {},
      version: '1.0.0'
    };
  });

  afterEach(() => {
    merkleChain.clear();
  });

  describe('addToChain', () => {
    it('should add envelope to chain and return merkle root', async () => {
      const merkleRoot = await merkleChain.addToChain(mockEnvelope);

      expect(merkleRoot).toBeDefined();
      expect(typeof merkleRoot).toBe('string');
      expect(merkleRoot.length).toBe(64); // SHA-256 hex hash length
    });

    it('should link to previous envelope when provided', async () => {
      const firstRoot = await merkleChain.addToChain(mockEnvelope);

      const secondEnvelope = { ...mockEnvelope, envelope_id: 'env_test_002' };
      const secondRoot = await merkleChain.addToChain(secondEnvelope, 'env_test_001');

      expect(secondRoot).toBeDefined();
      expect(secondRoot).not.toBe(firstRoot);
    });

    it('should handle multiple envelopes in sequence', async () => {
      const roots: string[] = [];

      for (let i = 0; i < 5; i++) {
        const envelope = { ...mockEnvelope, envelope_id: `env_test_${i}` };
        const root = await merkleChain.addToChain(envelope, i > 0 ? `env_test_${i - 1}` : undefined);
        roots.push(root);
      }

      expect(roots.length).toBe(5);
      // All roots should be unique
      const uniqueRoots = new Set(roots);
      expect(uniqueRoots.size).toBe(5);
    });
  });

  describe('verifyChain', () => {
    beforeEach(async () => {
      // Create a chain of 3 envelopes
      await merkleChain.addToChain(mockEnvelope);

      const env2 = { ...mockEnvelope, envelope_id: 'env_test_002' };
      await merkleChain.addToChain(env2, 'env_test_001');

      const env3 = { ...mockEnvelope, envelope_id: 'env_test_003' };
      await merkleChain.addToChain(env3, 'env_test_002');
    });

    it('should verify valid chain', async () => {
      const verification = await merkleChain.verifyChain(['env_test_001', 'env_test_002', 'env_test_003']);

      expect(verification.valid).toBe(true);
      expect(verification.errors).toHaveLength(0);
      expect(verification.verifiedEnvelopes).toBe(3);
      expect(verification.chainIntegrity).toBe(true);
    });

    it('should detect broken chain', async () => {
      // Try to verify chain with wrong order
      const verification = await merkleChain.verifyChain(['env_test_003', 'env_test_001', 'env_test_002']);

      expect(verification.chainIntegrity).toBe(false);
    });

    it('should detect missing envelope', async () => {
      const verification = await merkleChain.verifyChain(['env_test_001', 'env_test_999']);

      expect(verification.valid).toBe(false);
      expect(verification.errors.length).toBeGreaterThan(0);
    });
  });

  describe('verifyEnvelope', () => {
    it('should verify untampered envelope', async () => {
      await merkleChain.addToChain(mockEnvelope);

      const isValid = await merkleChain.verifyEnvelope(mockEnvelope);
      expect(isValid).toBe(true);
    });

    it('should detect tampered envelope', async () => {
      await merkleChain.addToChain(mockEnvelope);

      // Tamper with envelope
      const tamperedEnvelope = {
        ...mockEnvelope,
        decision: { ...mockEnvelope.decision, approved: false }
      };

      const isValid = await merkleChain.verifyEnvelope(tamperedEnvelope);
      expect(isValid).toBe(false);
    });
  });

  describe('getChainStats', () => {
    it('should return correct stats for empty chain', () => {
      const stats = merkleChain.getChainStats();

      expect(stats.totalEnvelopes).toBe(0);
      expect(stats.chainLength).toBe(0);
      expect(stats.firstEnvelopeId).toBeUndefined();
      expect(stats.lastEnvelopeId).toBeUndefined();
    });

    it('should return correct stats for populated chain', async () => {
      await merkleChain.addToChain(mockEnvelope);

      const env2 = { ...mockEnvelope, envelope_id: 'env_test_002' };
      await merkleChain.addToChain(env2, 'env_test_001');

      const stats = merkleChain.getChainStats();

      expect(stats.totalEnvelopes).toBe(2);
      expect(stats.chainLength).toBe(2);
      expect(stats.firstEnvelopeId).toBe('env_test_001');
      expect(stats.lastEnvelopeId).toBe('env_test_002');
      expect(stats.chainIntact).toBe(true);
    });
  });

  describe('exportChain', () => {
    it('should export chain data correctly', async () => {
      await merkleChain.addToChain(mockEnvelope);

      const env2 = { ...mockEnvelope, envelope_id: 'env_test_002' };
      await merkleChain.addToChain(env2, 'env_test_001');

      const exported = merkleChain.exportChain();

      expect(exported.envelopes).toHaveLength(2);
      expect(exported.chainSignature).toBeDefined();
      expect(exported.envelopes[0].id).toBe('env_test_001');
      expect(exported.envelopes[1].id).toBe('env_test_002');
      expect(exported.envelopes[0].position).toBe(0);
      expect(exported.envelopes[1].position).toBe(1);
    });
  });

  describe('generateAuditProof', () => {
    it('should generate audit proof for existing envelope', async () => {
      await merkleChain.addToChain(mockEnvelope);

      const proof = merkleChain.generateAuditProof('env_test_001');

      expect(proof).not.toBeNull();
      expect(proof?.leaf).toBeDefined();
      expect(proof?.root).toBeDefined();
    });

    it('should return null for non-existent envelope', () => {
      const proof = merkleChain.generateAuditProof('env_nonexistent');

      expect(proof).toBeNull();
    });
  });
});

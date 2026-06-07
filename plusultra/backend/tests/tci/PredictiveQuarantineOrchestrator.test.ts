/**
 * Unit Tests for Predictive Quarantine Orchestrator
 */

import { PredictiveQuarantineOrchestrator, CodeContext, CodeGenerationResult } from '../../src/services/tci/PredictiveQuarantineOrchestrator';
import { TCIPredictionService } from '../../src/services/temporal/enterprise/TCIPredictionService';
import { ModelQuarantineLayer } from '../../src/services/tci/ModelQuarantineLayer';
import { TCIEnvelopeService } from '../../src/services/temporal/TCIEnvelopeService';

// Mock services
const mockStorageService = {
  uploadFile: jest.fn(),
  getFile: jest.fn()
};

const mockAuditLogger = {
  log: jest.fn()
};

const mockVectorDB = {
  store: jest.fn(),
  embed: jest.fn(() => Promise.resolve(new Array(1536).fill(0.1)))
};

describe('PredictiveQuarantineOrchestrator', () => {
  let orchestrator: PredictiveQuarantineOrchestrator;
  let predictionService: TCIPredictionService;
  let quarantineLayer: ModelQuarantineLayer;
  let envelopeService: TCIEnvelopeService;

  beforeEach(() => {
    predictionService = new TCIPredictionService(mockVectorDB, {} as any);
    envelopeService = new TCIEnvelopeService(mockStorageService, mockAuditLogger, mockVectorDB);

    // Create TCI instance for quarantine layer
    const mockTCI = {
      getReliabilityScores: jest.fn(() => ({ 'gpt-5': 0.9 }))
    } as any;

    quarantineLayer = new ModelQuarantineLayer(mockTCI);

    orchestrator = new PredictiveQuarantineOrchestrator(
      predictionService,
      quarantineLayer,
      envelopeService
    );
  });

  describe('generateWithPrediction', () => {
    it('should auto-approve low-risk code generation', async () => {
      const context: CodeContext = {
        targetFile: 'test.ts',
        environment: 'development',
        userId: 'user_123',
        workspaceId: 'ws_123',
        projectId: 'proj_123'
      };

      const generateCodeFn = async (intent: string, ctx: CodeContext): Promise<CodeGenerationResult> => {
        return {
          code: 'function test() { return true; }',
          confidence: 0.95,
          explanation: 'Simple test function',
          tokensUsed: 50,
          processingTime: 100
        };
      };

      const result = await orchestrator.generateWithPrediction(
        'gpt-5',
        'Create a simple test function',
        context,
        generateCodeFn
      );

      expect(result).toBeDefined();
      expect(result.envelope).toBeDefined();
      expect(result.prediction).toBeDefined();
      expect(result.quarantined).toBe(false);
      expect(result.envelope.decision.approved).toBe(true);
    });

    it('should quarantine high-risk code generation', async () => {
      const context: CodeContext = {
        targetFile: 'auth.ts',
        environment: 'production',
        userId: 'user_123',
        workspaceId: 'ws_123',
        projectId: 'proj_123'
      };

      const generateCodeFn = async (intent: string, ctx: CodeContext): Promise<CodeGenerationResult> => {
        return {
          code: 'async function loginUser(password: string) { /* security issue */ }',
          confidence: 0.6,
          explanation: 'Login function with potential security issues',
          tokensUsed: 200,
          processingTime: 500
        };
      };

      // Mock high-risk prediction
      jest.spyOn(predictionService, 'predict').mockResolvedValue({
        overall: {
          riskLevel: 'critical',
          recommendation: 'High security risk detected'
        },
        predictions: {
          securityRisk: {
            score: 95,
            vulnerabilities: [
              {
                type: 'insecure_authentication',
                severity: 'critical',
                description: 'Password handling vulnerability',
                location: { file: 'auth.ts', line: 1 },
                cwe: 'CWE-521',
                recommendation: 'Use proper password hashing'
              }
            ]
          }
        }
      } as any);

      const result = await orchestrator.generateWithPrediction(
        'gpt-5',
        'Create authentication function',
        context,
        generateCodeFn
      );

      expect(result.quarantined).toBe(true);
      expect(result.envelope.decision.approved).toBe(false);
      expect(result.envelope.decision.requires_human_review).toBe(true);
      expect(result.suggestedFixes).toBeDefined();
      expect(result.suggestedFixes!.length).toBeGreaterThan(0);
      expect(result.riskMitigation).toBeDefined();
    });

    it('should provide suggested fixes for quarantined code', async () => {
      const context: CodeContext = {
        targetFile: 'api.ts',
        environment: 'production'
      };

      const generateCodeFn = async (): Promise<CodeGenerationResult> => {
        return {
          code: 'const data = req.body; db.query(data);',
          confidence: 0.7,
          explanation: 'API endpoint',
          tokensUsed: 100,
          processingTime: 200
        };
      };

      // Mock SQL injection risk
      jest.spyOn(predictionService, 'predict').mockResolvedValue({
        overall: {
          riskLevel: 'high',
          recommendation: 'SQL injection vulnerability detected'
        },
        predictions: {
          securityRisk: {
            score: 85,
            vulnerabilities: [
              {
                type: 'sql_injection',
                severity: 'high',
                description: 'Unsanitized database query',
                location: { file: 'api.ts', line: 1 },
                cwe: 'CWE-89',
                recommendation: 'Use parameterized queries'
              }
            ]
          }
        }
      } as any);

      const result = await orchestrator.generateWithPrediction(
        'gpt-5',
        'Create API endpoint',
        context,
        generateCodeFn
      );

      expect(result.quarantined).toBe(true);
      expect(result.suggestedFixes).toContain(expect.stringContaining('sql_injection'));
    });
  });

  describe('getQuarantineStatus', () => {
    it('should return quarantine status for model', () => {
      quarantineLayer.quarantineModel('bad-model', 'Low performance');

      const status = orchestrator.getQuarantineStatus('bad-model');

      expect(status.isQuarantined).toBe(true);
      expect(status.reason).toContain('Low performance');
    });

    it('should return not quarantined for normal model', () => {
      const status = orchestrator.getQuarantineStatus('gpt-5');

      expect(status.isQuarantined).toBe(false);
    });
  });

  describe('releaseModelFromQuarantine', () => {
    it('should release quarantined model', () => {
      quarantineLayer.quarantineModel('test-model', 'Testing');

      const released = orchestrator.releaseModelFromQuarantine('test-model', 'Testing complete');

      expect(released).toBe(true);

      const status = orchestrator.getQuarantineStatus('test-model');
      expect(status.isQuarantined).toBe(false);
    });
  });
});

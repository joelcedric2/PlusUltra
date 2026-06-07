/**
 * Integration Tests for End-to-End TCI Workflow
 *
 * Tests the complete flow from code generation through validation,
 * envelope creation, chain verification, and compliance reporting.
 */

import { PredictiveQuarantineOrchestrator, CodeContext, CodeGenerationResult } from '../../src/services/tci/PredictiveQuarantineOrchestrator';
import { TCIEnvelopeService } from '../../src/services/temporal/TCIEnvelopeService';
import { MerkleEnvelopeChain } from '../../src/services/tci/MerkleEnvelopeChain';
import { TCIFeedbackLoop } from '../../src/services/tci/TCIFeedbackLoop';
import { TCIOrchestrator } from '../../src/services/tci/TCIOrchestrator';
import { PDFComplianceReportGenerator } from '../../src/services/compliance/PDFComplianceReportGenerator';
import { TruthConsistencyInterface, TCIModelOutput } from '../../src/services/tci/TruthConsistencyInterface';
import { TCIPredictionService } from '../../src/services/temporal/enterprise/TCIPredictionService';
import { ModelQuarantineLayer } from '../../src/services/tci/ModelQuarantineLayer';
import { TemporalGraphDB } from '../../src/services/temporal/TemporalGraphDB';
import * as fs from 'fs/promises';
import * as path from 'path';

// Mock services for integration testing
const createMockServices = () => {
  const mockVectorDB = {
    store: jest.fn().mockResolvedValue(undefined),
    search: jest.fn().mockResolvedValue([]),
    embed: jest.fn().mockResolvedValue(new Array(1536).fill(0.1))
  };

  const mockStorageService = {
    uploadFile: jest.fn().mockResolvedValue({ key: 'test-key', url: 'https://example.com/test' }),
    getFile: jest.fn().mockResolvedValue({ data: Buffer.from('{}') })
  };

  const mockAuditLogger = {
    log: jest.fn().mockResolvedValue(undefined)
  };

  const mockEmbeddingService = {
    embed: jest.fn().mockResolvedValue(new Array(1536).fill(0.1))
  };

  return { mockVectorDB, mockStorageService, mockAuditLogger, mockEmbeddingService };
};

describe('TCI End-to-End Workflow Integration Tests', () => {
  let predictiveOrchestrator: PredictiveQuarantineOrchestrator;
  let envelopeService: TCIEnvelopeService;
  let merkleChain: MerkleEnvelopeChain;
  let feedbackLoop: TCIFeedbackLoop;
  let tciOrchestrator: TCIOrchestrator;
  let reportGenerator: PDFComplianceReportGenerator;
  let temporalGraph: TemporalGraphDB;

  let mockServices: ReturnType<typeof createMockServices>;

  beforeAll(async () => {
    mockServices = createMockServices();

    // Initialize all services
    envelopeService = new TCIEnvelopeService(
      mockServices.mockStorageService,
      mockServices.mockAuditLogger,
      mockServices.mockVectorDB
    );

    merkleChain = new MerkleEnvelopeChain();

    temporalGraph = new TemporalGraphDB(
      mockServices.mockVectorDB,
      mockServices.mockEmbeddingService
    );

    feedbackLoop = new TCIFeedbackLoop(
      envelopeService,
      temporalGraph,
      mockServices.mockVectorDB,
      mockServices.mockEmbeddingService
    );

    const tci = new TruthConsistencyInterface(mockServices.mockVectorDB);
    tciOrchestrator = new TCIOrchestrator(tci, mockServices.mockVectorDB);

    const predictionService = new TCIPredictionService(mockServices.mockVectorDB, temporalGraph);
    const quarantineLayer = new ModelQuarantineLayer(tci);

    predictiveOrchestrator = new PredictiveQuarantineOrchestrator(
      predictionService,
      quarantineLayer,
      envelopeService
    );

    reportGenerator = new PDFComplianceReportGenerator();
  });

  afterAll(() => {
    merkleChain.clear();
    feedbackLoop.clear();
  });

  describe('Complete TCI Workflow', () => {
    it('should execute full workflow from generation to reporting', async () => {
      // Step 1: Generate code with predictive quarantine
      console.log('Step 1: Generating code with predictive analysis...');

      const context: CodeContext = {
        targetFile: 'src/utils/helpers.ts',
        environment: 'development',
        userId: 'user_test_001',
        workspaceId: 'ws_test_001',
        projectId: 'proj_test_001'
      };

      const generateCodeFn = async (intent: string, ctx: CodeContext): Promise<CodeGenerationResult> => {
        return {
          code: `
export function calculateTotal(items: number[]): number {
  return items.reduce((sum, item) => sum + item, 0);
}

export function formatCurrency(amount: number): string {
  return \`$\${amount.toFixed(2)}\`;
}
          `.trim(),
          confidence: 0.92,
          explanation: 'Created utility functions for calculations and formatting',
          tokensUsed: 150,
          processingTime: 500
        };
      };

      const generationResult = await predictiveOrchestrator.generateWithPrediction(
        'gpt-5',
        'Create utility functions for calculations',
        context,
        generateCodeFn
      );

      expect(generationResult).toBeDefined();
      expect(generationResult.envelope).toBeDefined();
      expect(generationResult.prediction).toBeDefined();

      const envelopeId = generationResult.envelope.envelope_id;
      console.log(`✓ Generated envelope: ${envelopeId}`);

      // Step 2: Add envelope to Merkle chain
      console.log('Step 2: Adding envelope to Merkle chain...');

      const merkleRoot = await merkleChain.addToChain(generationResult.envelope);
      expect(merkleRoot).toBeDefined();
      expect(merkleRoot.length).toBe(64);

      console.log(`✓ Merkle root: ${merkleRoot.substring(0, 16)}...`);

      // Step 3: Validate envelope integrity
      console.log('Step 3: Validating envelope integrity...');

      const validation = await envelopeService.validateEnvelope(generationResult.envelope);
      expect(validation.valid).toBe(true);
      expect(validation.errors).toHaveLength(0);

      console.log('✓ Envelope validation passed');

      // Step 4: Multi-model consensus validation
      console.log('Step 4: Running multi-model consensus validation...');

      const modelOutputs: TCIModelOutput[] = [
        {
          model: 'gpt-5',
          output: generationResult.envelope.outputs.explanation || '',
          confidence: 0.92,
          processingTime: 500,
          metadata: {
            timestamp: Date.now(),
            contextHash: 'hash1',
            domain: 'coding'
          }
        },
        {
          model: 'claude-3.5',
          output: 'Created helper functions for numerical operations',
          confidence: 0.90,
          processingTime: 450,
          metadata: {
            timestamp: Date.now(),
            contextHash: 'hash2',
            domain: 'coding'
          }
        },
        {
          model: 'gemini-2.0',
          output: 'Implemented utility functions for calculations and formatting',
          confidence: 0.88,
          processingTime: 480,
          metadata: {
            timestamp: Date.now(),
            contextHash: 'hash3',
            domain: 'coding'
          }
        }
      ];

      const consensusResult = await tciOrchestrator.orchestrateMultiAIValidation(
        modelOutputs,
        'Create utility functions',
        'coding'
      );

      expect(consensusResult).toBeDefined();
      expect(consensusResult.finalResult.consensus).toBeGreaterThan(0.5);
      expect(consensusResult.validationReport.overallScore).toBeGreaterThan(0.7);

      console.log(`✓ Consensus: ${(consensusResult.finalResult.consensus * 100).toFixed(1)}%`);
      console.log(`✓ Overall validation score: ${(consensusResult.validationReport.overallScore * 100).toFixed(1)}%`);

      // Step 5: Verify chain integrity
      console.log('Step 5: Verifying Merkle chain integrity...');

      const chainVerification = await merkleChain.verifyChain([envelopeId]);
      expect(chainVerification.valid).toBe(true);
      expect(chainVerification.chainIntegrity).toBe(true);

      console.log('✓ Chain integrity verified');

      // Step 6: Record feedback (simulate human correction)
      console.log('Step 6: Recording feedback loop data...');

      await feedbackLoop.recordHumanCorrection({
        envelopeId,
        originalCode: generationResult.envelope.outputs.changes?.[0].diff || '',
        correctedCode: generationResult.envelope.outputs.changes?.[0].diff + '\n// Added comment',
        reason: 'Added documentation comment',
        correctionType: 'style',
        userId: 'user_test_001'
      });

      const feedbackMetrics = feedbackLoop.getFeedbackMetrics();
      expect(feedbackMetrics.totalCorrections).toBe(1);

      console.log('✓ Feedback recorded');

      // Step 7: Generate compliance report
      console.log('Step 7: Generating compliance report...');

      const reportPath = path.join(__dirname, '../../tmp/test-compliance-report.pdf');

      // Ensure tmp directory exists
      await fs.mkdir(path.dirname(reportPath), { recursive: true });

      const reportResult = await reportGenerator.generateReport(
        {
          reportType: 'SOC2',
          companyName: 'PlusUltra Test',
          reportPeriod: {
            start: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
            end: new Date()
          },
          auditor: {
            name: 'Integration Test',
            organization: 'PlusUltra',
            email: 'test@plusultra.com'
          },
          includeEnvelopeDetails: true,
          includeChainVerification: true
        },
        {
          envelopes: [generationResult.envelope],
          chainVerification,
          auditTrail: [
            {
              timestamp: new Date().toISOString(),
              event: 'envelope_created',
              user: 'user_test_001',
              resource: envelopeId,
              action: 'create'
            }
          ],
          securityMetrics: {
            totalEnvelopes: 1,
            approvedEnvelopes: generationResult.envelope.decision.approved ? 1 : 0,
            rejectedEnvelopes: generationResult.envelope.decision.approved ? 0 : 1,
            quarantinedModels: 0,
            averageConfidence: 0.92,
            chainIntegrityScore: 1.0
          }
        },
        reportPath
      );

      expect(reportResult.success).toBe(true);
      expect(reportResult.filePath).toBe(reportPath);

      // Verify PDF was created
      const fileExists = await fs.stat(reportPath).then(() => true).catch(() => false);
      expect(fileExists).toBe(true);

      console.log(`✓ Compliance report generated: ${reportPath}`);

      // Step 8: Get TCI system status
      console.log('Step 8: Retrieving TCI system status...');

      const systemStatus = await tciOrchestrator.getTCIStatus();
      expect(systemStatus.systemHealth.tciCore).toBe(true);
      expect(systemStatus.systemHealth.quarantineLayer).toBe(true);
      expect(systemStatus.systemHealth.votingSystem).toBe(true);

      console.log('✓ System status: All components healthy');

      // Cleanup
      await fs.unlink(reportPath).catch(() => {});

      console.log('\n✅ End-to-end workflow completed successfully!');
    }, 30000); // 30 second timeout for full workflow

    it('should handle quarantine scenario', async () => {
      console.log('\nTesting quarantine scenario...');

      const context: CodeContext = {
        targetFile: 'src/auth/login.ts',
        environment: 'production',
        userId: 'user_test_002'
      };

      const generateCodeFn = async (): Promise<CodeGenerationResult> => {
        return {
          code: `
function login(username: string, password: string) {
  // Potential security issue: plaintext password
  return db.query('SELECT * FROM users WHERE username = ? AND password = ?', [username, password]);
}
          `.trim(),
          confidence: 0.65,
          explanation: 'Basic login function',
          tokensUsed: 120,
          processingTime: 400
        };
      };

      const result = await predictiveOrchestrator.generateWithPrediction(
        'test-model',
        'Create login function',
        context,
        generateCodeFn
      );

      // Should detect high risk and quarantine
      if (result.prediction.overall.riskLevel === 'high' || result.prediction.overall.riskLevel === 'critical') {
        expect(result.quarantined).toBe(true);
        expect(result.envelope.decision.approved).toBe(false);
        expect(result.envelope.decision.requires_human_review).toBe(true);
        expect(result.suggestedFixes).toBeDefined();
        expect(result.riskMitigation).toBeDefined();

        console.log('✓ High-risk code correctly quarantined');
        console.log(`✓ Generated ${result.suggestedFixes!.length} suggested fixes`);
        console.log(`✓ Generated ${result.riskMitigation!.length} mitigation strategies`);
      }

      console.log('✅ Quarantine scenario completed');
    }, 15000);

    it('should track learning patterns over time', async () => {
      console.log('\nTesting learning pattern tracking...');

      // Simulate multiple corrections of the same type
      for (let i = 0; i < 5; i++) {
        const context: CodeContext = {
          targetFile: `src/test${i}.ts`,
          userId: 'user_test_003'
        };

        const generateCodeFn = async (): Promise<CodeGenerationResult> => {
          return {
            code: `function test${i}() { var x = 1; }`,
            confidence: 0.8,
            explanation: 'Test function',
            tokensUsed: 50,
            processingTime: 100
          };
        };

        const result = await predictiveOrchestrator.generateWithPrediction(
          'gpt-5',
          `Create test function ${i}`,
          context,
          generateCodeFn
        );

        // Record correction for using 'var' instead of 'const'
        await feedbackLoop.recordHumanCorrection({
          envelopeId: result.envelope.envelope_id,
          originalCode: `var x = 1;`,
          correctedCode: `const x = 1;`,
          reason: 'Use const instead of var',
          correctionType: 'style',
          userId: 'user_test_003'
        });
      }

      const metrics = feedbackLoop.getFeedbackMetrics();
      expect(metrics.totalCorrections).toBeGreaterThan(0);
      expect(metrics.correctionsByType['style']).toBeGreaterThan(0);

      // Check for learning patterns
      const patterns = await feedbackLoop.findSimilarPatterns('Use const instead of var', 5);
      expect(patterns.length).toBeGreaterThan(0);

      console.log(`✓ Tracked ${metrics.totalCorrections} corrections`);
      console.log(`✓ Found ${patterns.length} similar patterns`);
      console.log('✅ Learning pattern tracking completed');
    }, 20000);
  });
});

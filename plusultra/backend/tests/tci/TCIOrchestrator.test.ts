/**
 * Unit Tests for TCI Orchestrator
 */

import { TCIOrchestrator } from '../../src/services/tci/TCIOrchestrator';
import { TruthConsistencyInterface, TCIModelOutput } from '../../src/services/tci/TruthConsistencyInterface';

// Mock dependencies
const mockVectorDB = {
  store: jest.fn(),
  search: jest.fn(),
  embed: jest.fn(() => Promise.resolve(new Array(1536).fill(0.1)))
};

describe('TCIOrchestrator', () => {
  let orchestrator: TCIOrchestrator;
  let tci: TruthConsistencyInterface;

  beforeEach(() => {
    tci = new TruthConsistencyInterface(mockVectorDB);
    orchestrator = new TCIOrchestrator(tci, mockVectorDB, {
      cacheOptions: { maxSize: 100, defaultTTL: 3600 },
      embeddingConfig: {
        openaiApiKey: 'test-key'
      }
    });
  });

  describe('orchestrateMultiAIValidation', () => {
    it('should aggregate outputs with high consensus', async () => {
      const outputs: TCIModelOutput[] = [
        {
          model: 'gpt-5',
          output: 'function test() { return true; }',
          confidence: 0.95,
          processingTime: 100,
          metadata: {
            timestamp: Date.now(),
            contextHash: 'hash1',
            domain: 'coding'
          }
        },
        {
          model: 'claude-3.5',
          output: 'function test() { return true; }',
          confidence: 0.93,
          processingTime: 120,
          metadata: {
            timestamp: Date.now(),
            contextHash: 'hash2',
            domain: 'coding'
          }
        },
        {
          model: 'gemini-2.0',
          output: 'function test() { return true; }',
          confidence: 0.92,
          processingTime: 110,
          metadata: {
            timestamp: Date.now(),
            contextHash: 'hash3',
            domain: 'coding'
          }
        }
      ];

      const result = await orchestrator.orchestrateMultiAIValidation(
        outputs,
        'Create test function',
        'coding'
      );

      expect(result).toBeDefined();
      expect(result.finalResult).toBeDefined();
      expect(result.validationReport).toBeDefined();
      expect(result.performanceMetrics).toBeDefined();
      expect(result.validationReport.overallScore).toBeGreaterThan(0);
    });

    it('should detect low consensus and quarantine models', async () => {
      const outputs: TCIModelOutput[] = [
        {
          model: 'gpt-5',
          output: 'function test() { return true; }',
          confidence: 0.5,
          processingTime: 100,
          metadata: {
            timestamp: Date.now(),
            contextHash: 'hash1',
            domain: 'coding'
          }
        },
        {
          model: 'claude-3.5',
          output: 'const test = () => false;',
          confidence: 0.5,
          processingTime: 120,
          metadata: {
            timestamp: Date.now(),
            contextHash: 'hash2',
            domain: 'coding'
          }
        }
      ];

      const result = await orchestrator.orchestrateMultiAIValidation(
        outputs,
        'Create test function',
        'coding'
      );

      expect(result.finalResult.consensus).toBeLessThan(0.3);
      expect(result.finalResult.validationPassed).toBe(false);
    });

    it('should handle schema validation', async () => {
      const outputs: TCIModelOutput[] = [
        {
          model: 'gpt-5',
          output: 'interface User { name: string; age: number; }',
          confidence: 0.95,
          processingTime: 100,
          metadata: {
            timestamp: Date.now(),
            contextHash: 'hash1',
            domain: 'coding'
          }
        }
      ];

      const result = await orchestrator.orchestrateMultiAIValidation(
        outputs,
        'Create User interface',
        'coding',
        undefined,
        true // isTypeScript
      );

      expect(result.validationReport.schemaValidation).toBeDefined();
    });
  });

  describe('getTCIStatus', () => {
    it('should return comprehensive system status', async () => {
      const status = await orchestrator.getTCIStatus();

      expect(status.systemHealth).toBeDefined();
      expect(status.modelMetrics).toBeDefined();
      expect(status.validationMetrics).toBeDefined();
      expect(status.recommendations).toBeDefined();

      // Check system health
      expect(status.systemHealth.tciCore).toBe(true);
      expect(status.systemHealth.quarantineLayer).toBe(true);
      expect(status.systemHealth.votingSystem).toBe(true);
      expect(status.systemHealth.embeddingCache).toBe(true);

      // Check model metrics structure
      expect(status.modelMetrics.reliabilityScores).toBeDefined();
      expect(status.modelMetrics.quarantinedModels).toBeInstanceOf(Array);
      expect(status.modelMetrics.performanceStats).toBeDefined();
    });
  });

  describe('runCalibrationExperiment', () => {
    it('should run calibration and return results', async () => {
      const dataset = [
        {
          scenario: 'High similarity - same intent',
          prompt1: 'Create a login function',
          prompt2: 'Implement user authentication',
          expectedSimilarity: 0.85,
          category: 'coding'
        }
      ];

      const result = await orchestrator.runCalibrationExperiment(dataset);

      expect(result).toBeDefined();
      expect(result.calibrationResult).toBeDefined();
      expect(result.csvData).toBeDefined();
      expect(result.recommendations).toBeInstanceOf(Array);
    });
  });
});

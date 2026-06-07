/**
 * Integration Tests for Self-Healing System
 *
 * Tests the complete flow: Sentry → Analysis → TCI → Validation → Deployment
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import { prisma } from '../../src/lib/prisma';
import { sentryWebhookService } from '../../src/services/self-healing/SentryWebhookService';
import { errorAnalysisService } from '../../src/services/self-healing/ErrorAnalysisService';
import { selfHealingOrchestrator } from '../../src/services/self-healing/SelfHealingOrchestrator';
import type { SentryWebhookPayload } from '../../src/services/self-healing/SentryWebhookService';

describe('Self-Healing System Integration', () => {
  const testProjectId = 'test-project-integration';
  let testErrorId: string;
  let testAttemptId: string;

  beforeAll(async () => {
    // Create healing config for test project
    await prisma.healingConfig.upsert({
      where: { projectId: testProjectId },
      create: {
        projectId: testProjectId,
        enabled: true,
        autoHealStaging: true,
        autoHealProduction: false,
        minConfidence: 0.85,
        maxAttemptsPerHour: 5,
        maxAttemptsPerError: 3,
        requireApproval: false,
        emergencyKillSwitch: false,
        notificationChannels: {},
        notifyOnAttempt: false,
        notifyOnSuccess: false,
        notifyOnFailure: false,
      },
      update: {
        enabled: true,
        emergencyKillSwitch: false,
      },
    });
  });

  afterAll(async () => {
    // Cleanup test data
    await prisma.healingMetrics.deleteMany({
      where: { projectId: testProjectId },
    });
    await prisma.fixDeployment.deleteMany({
      where: { projectId: testProjectId },
    });
    await prisma.healingAttempt.deleteMany({
      where: { error: { projectId: testProjectId } },
    });
    await prisma.sentryError.deleteMany({
      where: { projectId: testProjectId },
    });
    await prisma.healingConfig.deleteMany({
      where: { projectId: testProjectId },
    });
  });

  beforeEach(async () => {
    // Clean between tests
    await prisma.healingAttempt.deleteMany({
      where: { error: { projectId: testProjectId } },
    });
    await prisma.sentryError.deleteMany({
      where: { projectId: testProjectId },
    });
  });

  describe('Sentry Webhook Processing', () => {
    it('should process Sentry webhook and create error record', async () => {
      const payload: SentryWebhookPayload = {
        id: 'test-webhook-1',
        project: testProjectId,
        project_name: 'Test Project',
        project_slug: 'test-project',
        event: {
          event_id: 'test-event-1',
          timestamp: new Date().toISOString(),
          received: new Date().toISOString(),
          platform: 'node',
          tags: [
            { key: 'environment', value: 'staging' },
          ],
          exception: {
            values: [
              {
                type: 'TypeError',
                value: 'Cannot read property "foo" of undefined',
                stacktrace: {
                  frames: [
                    {
                      filename: 'src/services/test.ts',
                      function: 'testFunction',
                      lineno: 42,
                      colno: 10,
                      in_app: true,
                    },
                  ],
                },
              },
            ],
          },
          environment: 'staging',
          level: 'error',
        },
        url: 'https://sentry.io/test',
        web_url: 'https://sentry.io/test-web',
      };

      const result = await sentryWebhookService.processWebhook(payload);

      expect(result).toBeDefined();
      expect(result?.errorType).toBe('TypeError');
      expect(result?.errorMessage).toBe('Cannot read property "foo" of undefined');
      expect(result?.environment).toBe('staging');

      testErrorId = result!.id;

      // Verify error was created in database
      const error = await prisma.sentryError.findUnique({
        where: { id: testErrorId },
      });

      expect(error).toBeDefined();
      expect(error?.status).toBe('new');
    });

    it('should deduplicate errors from same event', async () => {
      const eventId = 'test-event-dedup';

      const payload: SentryWebhookPayload = {
        id: 'test-webhook-2',
        project: testProjectId,
        project_name: 'Test Project',
        project_slug: 'test-project',
        event: {
          event_id: eventId,
          timestamp: new Date().toISOString(),
          received: new Date().toISOString(),
          platform: 'node',
          tags: [],
          exception: {
            values: [
              {
                type: 'Error',
                value: 'Test error',
                stacktrace: { frames: [] },
              },
            ],
          },
          environment: 'staging',
          level: 'error',
        },
        url: 'https://sentry.io/test',
        web_url: 'https://sentry.io/test-web',
      };

      // Process same event twice
      const result1 = await sentryWebhookService.processWebhook(payload);
      const result2 = await sentryWebhookService.processWebhook(payload);

      expect(result1?.id).toBe(result2?.id);

      // Check occurrence count incremented
      const error = await prisma.sentryError.findUnique({
        where: { id: result1!.id },
      });

      expect(error?.occurrenceCount).toBe(2);
    });
  });

  describe('Error Analysis', () => {
    it('should analyze error and extract context', async () => {
      // Create test error
      const error = await prisma.sentryError.create({
        data: {
          sentryEventId: 'test-analysis-1',
          projectId: testProjectId,
          environment: 'staging',
          errorMessage: 'Test error for analysis',
          errorType: 'TypeError',
          stackTrace: 'at testFunction (src/test.ts:42:10)',
          filePath: 'src/test.ts',
          lineNumber: 42,
          columnNumber: 10,
          status: 'new',
          severity: 'error',
        },
      });

      testErrorId = error.id;

      // Note: This would fail without actual file, but tests the structure
      const context = await errorAnalysisService.analyzeError(error.id);

      expect(context).toBeDefined();
      expect(context?.errorId).toBe(error.id);
      expect(context?.errorType).toBe('TypeError');
      expect(context?.language).toBe('typescript');
    });

    it('should detect error patterns', async () => {
      const context = {
        errorId: 'test',
        errorMessage: 'Cannot read property "test" of undefined',
        errorType: 'TypeError',
        filePath: 'test.ts',
        lineNumber: 1,
        columnNumber: 1,
        errorLine: '',
        surroundingCode: '',
        beforeContext: [],
        afterContext: [],
        language: 'typescript',
        fileContent: '',
        projectId: testProjectId,
        environment: 'staging',
        stackTrace: '',
        userContext: null,
        requestContext: null,
      };

      const pattern = await errorAnalysisService.checkKnownPattern(context);

      expect(pattern).toBe('Add null check before accessing property');
    });

    it('should estimate fix complexity', () => {
      const simpleContext = {
        errorId: 'test',
        errorMessage: 'Cannot read property "test" of undefined',
        errorType: 'TypeError',
        filePath: 'test.ts',
        lineNumber: 1,
        columnNumber: 1,
        errorLine: '',
        surroundingCode: '',
        beforeContext: [],
        afterContext: [],
        language: 'typescript',
        fileContent: '',
        projectId: testProjectId,
        environment: 'staging',
        stackTrace: 'single line',
        userContext: null,
        requestContext: null,
      };

      const complexity = errorAnalysisService.estimateComplexity(simpleContext);

      expect(complexity).toBe('simple');
    });
  });

  describe('Healing Orchestration', () => {
    it('should check if healing should be triggered', async () => {
      // Create error
      const error = await prisma.sentryError.create({
        data: {
          sentryEventId: 'test-trigger-1',
          projectId: testProjectId,
          environment: 'staging',
          errorMessage: 'Test error',
          errorType: 'Error',
          stackTrace: '',
          status: 'new',
          severity: 'error',
        },
      });

      const shouldHeal = await sentryWebhookService.shouldTriggerHealing(error.id);

      expect(shouldHeal).toBe(true);
    });

    it('should not trigger healing if already healing', async () => {
      const error = await prisma.sentryError.create({
        data: {
          sentryEventId: 'test-trigger-2',
          projectId: testProjectId,
          environment: 'staging',
          errorMessage: 'Test error',
          errorType: 'Error',
          stackTrace: '',
          status: 'healing',
          severity: 'error',
        },
      });

      const shouldHeal = await sentryWebhookService.shouldTriggerHealing(error.id);

      expect(shouldHeal).toBe(false);
    });

    it('should respect rate limits', async () => {
      const error = await prisma.sentryError.create({
        data: {
          sentryEventId: 'test-rate-limit',
          projectId: testProjectId,
          environment: 'staging',
          errorMessage: 'Test error',
          errorType: 'Error',
          stackTrace: '',
          status: 'new',
          severity: 'error',
        },
      });

      // Create 5 recent attempts (at max rate limit)
      for (let i = 0; i < 5; i++) {
        await prisma.healingAttempt.create({
          data: {
            errorId: error.id,
            triggerSource: 'auto',
            fixCode: '',
            fixDescription: '',
            confidence: 0,
            status: 'failed',
          },
        });
      }

      const shouldHeal = await sentryWebhookService.shouldTriggerHealing(error.id);

      expect(shouldHeal).toBe(false);
    });

    it('should not heal warnings or info level errors', async () => {
      const error = await prisma.sentryError.create({
        data: {
          sentryEventId: 'test-severity',
          projectId: testProjectId,
          environment: 'staging',
          errorMessage: 'Test warning',
          errorType: 'Warning',
          stackTrace: '',
          status: 'new',
          severity: 'warning',
        },
      });

      const shouldHeal = await sentryWebhookService.shouldTriggerHealing(error.id);

      expect(shouldHeal).toBe(false);
    });
  });

  describe('Statistics and Metrics', () => {
    it('should track healing metrics', async () => {
      const error = await prisma.sentryError.create({
        data: {
          sentryEventId: 'test-metrics-1',
          projectId: testProjectId,
          environment: 'staging',
          errorMessage: 'Test error',
          errorType: 'Error',
          stackTrace: '',
          status: 'new',
          severity: 'error',
        },
      });

      const attempt = await prisma.healingAttempt.create({
        data: {
          errorId: error.id,
          triggerSource: 'auto',
          fixCode: 'fixed code',
          fixDescription: 'test fix',
          confidence: 0.9,
          status: 'deployed',
          duration: 5000,
        },
      });

      // Get stats
      const stats = await selfHealingOrchestrator.getStats(testProjectId);

      expect(stats.totalAttempts).toBeGreaterThan(0);
    });

    it('should calculate success rate', async () => {
      const error = await prisma.sentryError.create({
        data: {
          sentryEventId: 'test-success-rate',
          projectId: testProjectId,
          environment: 'staging',
          errorMessage: 'Test error',
          errorType: 'Error',
          stackTrace: '',
          status: 'new',
          severity: 'error',
        },
      });

      // Create 3 successful and 1 failed attempt
      for (let i = 0; i < 3; i++) {
        await prisma.healingAttempt.create({
          data: {
            errorId: error.id,
            triggerSource: 'auto',
            fixCode: '',
            fixDescription: '',
            confidence: 0.9,
            status: 'deployed',
          },
        });
      }

      await prisma.healingAttempt.create({
        data: {
          errorId: error.id,
          triggerSource: 'auto',
          fixCode: '',
          fixDescription: '',
          confidence: 0.5,
          status: 'failed',
        },
      });

      const stats = await selfHealingOrchestrator.getStats(testProjectId);

      expect(stats.successRate).toBe(0.75); // 3/4 = 75%
    });
  });

  describe('Configuration Management', () => {
    it('should create default config if not exists', async () => {
      const newProjectId = 'new-test-project';

      // Get config (should create default)
      let config = await prisma.healingConfig.findUnique({
        where: { projectId: newProjectId },
      });

      if (!config) {
        config = await prisma.healingConfig.create({
          data: { projectId: newProjectId },
        });
      }

      expect(config).toBeDefined();
      expect(config.enabled).toBe(false); // Default is disabled
      expect(config.minConfidence).toBe(0.85);

      // Cleanup
      await prisma.healingConfig.delete({
        where: { projectId: newProjectId },
      });
    });

    it('should respect emergency kill switch', async () => {
      // Enable kill switch
      await prisma.healingConfig.update({
        where: { projectId: testProjectId },
        data: { emergencyKillSwitch: true },
      });

      const error = await prisma.sentryError.create({
        data: {
          sentryEventId: 'test-kill-switch',
          projectId: testProjectId,
          environment: 'staging',
          errorMessage: 'Test error',
          errorType: 'Error',
          stackTrace: '',
          status: 'new',
          severity: 'error',
        },
      });

      const shouldHeal = await sentryWebhookService.shouldTriggerHealing(error.id);

      expect(shouldHeal).toBe(false);

      // Disable kill switch for other tests
      await prisma.healingConfig.update({
        where: { projectId: testProjectId },
        data: { emergencyKillSwitch: false },
      });
    });
  });

  describe('End-to-End Error Report Building', () => {
    it('should build comprehensive error report', async () => {
      const errorContext = {
        errorId: 'test-report',
        errorMessage: 'Cannot read property "test" of undefined',
        errorType: 'TypeError',
        filePath: 'src/test.ts',
        lineNumber: 42,
        columnNumber: 10,
        errorLine: 'const value = obj.test;',
        surroundingCode: 'function test() {\n  const value = obj.test;\n}',
        beforeContext: ['function test() {'],
        afterContext: ['}'],
        language: 'typescript',
        fileContent: 'function test() {\n  const value = obj.test;\n}',
        projectId: testProjectId,
        environment: 'staging',
        stackTrace: 'at test (src/test.ts:42:10)',
        userContext: null,
        requestContext: null,
      };

      const report = await errorAnalysisService.buildErrorReport(errorContext);

      expect(report).toContain('ERROR REPORT FOR SELF-HEALING');
      expect(report).toContain('TypeError');
      expect(report).toContain('Cannot read property "test" of undefined');
      expect(report).toContain('src/test.ts');
      expect(report).toContain('Line 42');
      expect(report).toContain('staging');
    });
  });
});

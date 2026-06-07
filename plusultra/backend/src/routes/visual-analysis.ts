/**
 * Visual Analysis API Routes
 * Provides endpoints for Gemini-powered visual bug detection and analysis
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { geminiScreenCaptureService } from '../services/visual/GeminiScreenCaptureService';
import { visualBugDetectionService } from '../services/visual/VisualBugDetectionService';
import { visualSandboxMonitor } from '../services/sandbox/VisualSandboxMonitor';
import { enhancedVisualAnalysisService } from '../services/tci/EnhancedVisualAnalysisService';

const prisma = new PrismaClient();

export default async function visualAnalysisRoutes(fastify: FastifyInstance) {
  // ============================================
  // Screenshot & Analysis
  // ============================================

  /**
   * Capture and analyze screenshot of a URL
   * POST /api/visual/analyze-url
   */
  fastify.post('/api/visual/analyze-url', async (request: FastifyRequest, reply: FastifyReply) => {
    const { url, projectId, viewport, expectedBehavior } = request.body as any;

    if (!url) {
      return reply.code(400).send({ error: 'URL is required' });
    }

    try {
      const report = await visualBugDetectionService.detectVisualBugs({
        url,
        viewport: viewport || { width: 1920, height: 1080 },
        expectedBehavior
      });

      // Store visual bugs in database
      const visualBugs = await Promise.all(
        report.analysisResult.issues.map(async (issue) => {
          return prisma.visualBug.create({
            data: {
              projectId,
              type: issue.type,
              severity: issue.severity,
              description: issue.description,
              screenshotPath: report.screenshotPath,
              location: issue.location || {},
              detectedBy: 'gemini',
              confidence: issue.confidence / 100,
              geminiAnalysis: JSON.parse(JSON.stringify({ issue })) as any,
              suggestedFix: issue.suggestedFix,
              status: 'new'
            }
          });
        })
      );

      return {
        success: true,
        report,
        visualBugs,
        summary: {
          totalIssues: visualBugs.length,
          critical: visualBugs.filter(b => b.severity === 'critical').length,
          high: visualBugs.filter(b => b.severity === 'high').length,
          medium: visualBugs.filter(b => b.severity === 'medium').length,
          low: visualBugs.filter(b => b.severity === 'low').length
        }
      };
    } catch (error) {
      console.error('Visual analysis failed:', error);
      return reply.code(500).send({ error: 'Visual analysis failed', details: error });
    }
  });

  /**
   * Analyze sandbox preview
   * POST /api/visual/analyze-sandbox
   */
  fastify.post('/api/visual/analyze-sandbox', async (request: FastifyRequest, reply: FastifyReply) => {
    const { sandboxId, previewPort, projectId } = request.body as any;

    if (!sandboxId || !previewPort) {
      return reply.code(400).send({ error: 'sandboxId and previewPort are required' });
    }

    try {
      // Capture screenshot
      const screenshotPath = await visualBugDetectionService.captureSandboxPreview(
        sandboxId,
        previewPort
      );

      // Analyze with enhanced visual service
      const analysisResult = await enhancedVisualAnalysisService.analyzeCode(
        '',
        { language: 'typescript', framework: 'react' } as any,
        { mode: 'ui', sandboxId, previewPort }
      );

      // Store visual bugs
      const visualBugs = [];
      if (analysisResult.uiAnalysis?.visualIssues) {
        for (const issue of analysisResult.uiAnalysis.visualIssues) {
          const bug = await prisma.visualBug.create({
            data: {
              sandboxId,
              projectId,
              type: issue.type,
              severity: issue.severity,
              description: issue.description,
              screenshotPath,
              location: issue.location || {},
              detectedBy: 'gemini',
              confidence: issue.confidence / 100,
              geminiAnalysis: JSON.parse(JSON.stringify({ issue })) as any,
              suggestedFix: issue.suggestedFix,
              status: 'new'
            }
          });
          visualBugs.push(bug);
        }
      }

      // Store health check
      await prisma.visualHealthCheck.create({
        data: {
          sandboxId,
          projectId,
          status: (analysisResult.uiAnalysis?.overallScore ?? 0) > 80 ? 'healthy' :
                  (analysisResult.uiAnalysis?.overallScore ?? 0) > 60 ? 'degraded' : 'unhealthy',
          overallScore: analysisResult.uiAnalysis?.overallScore || 0,
          accessibilityScore: analysisResult.uiAnalysis?.accessibilityScore || null,
          screenshotPath,
          criticalIssues: visualBugs.filter(b => b.severity === 'critical').length,
          highIssues: visualBugs.filter(b => b.severity === 'high').length,
          mediumIssues: visualBugs.filter(b => b.severity === 'medium').length,
          lowIssues: visualBugs.filter(b => b.severity === 'low').length,
          regressionDetected: false,
          geminiResponse: analysisResult.uiAnalysis || {}
        }
      });

      return {
        success: true,
        analysisResult,
        visualBugs,
        summary: {
          totalIssues: visualBugs.length,
          overallScore: analysisResult.uiAnalysis?.overallScore || 0,
          accessibilityScore: analysisResult.uiAnalysis?.accessibilityScore || 0
        }
      };
    } catch (error) {
      console.error('Sandbox analysis failed:', error);
      return reply.code(500).send({ error: 'Sandbox analysis failed', details: error });
    }
  });

  // ============================================
  // Visual Regression Testing
  // ============================================

  /**
   * Create visual regression test
   * POST /api/visual/regression-tests
   */
  fastify.post('/api/visual/regression-tests', async (request: FastifyRequest, reply: FastifyReply) => {
    const { testName, sandboxId, projectId, url, viewport, threshold } = request.body as any;

    if (!testName) {
      return reply.code(400).send({ error: 'testName is required' });
    }

    try {
      // Capture baseline screenshot
      let baselineScreenshot: string;
      if (sandboxId) {
        const monitorData = visualSandboxMonitor['monitoredSandboxes'].get(sandboxId);
        if (!monitorData) {
          return reply.code(404).send({ error: 'Sandbox not being monitored' });
        }
        baselineScreenshot = await visualBugDetectionService.captureSandboxPreview(
          sandboxId,
          monitorData.previewPort
        );
      } else if (url) {
        baselineScreenshot = await visualBugDetectionService.captureScreenshot({
          url,
          viewport: viewport || { width: 1920, height: 1080 }
        });
      } else {
        return reply.code(400).send({ error: 'Either sandboxId or url is required' });
      }

      // Create test in database
      const test = await prisma.visualRegressionTest.create({
        data: {
          testName,
          sandboxId,
          projectId,
          url,
          viewport: viewport || { width: 1920, height: 1080 },
          threshold: threshold || 0.05,
          baselineScreenshot,
          enabled: true
        }
      });

      return {
        success: true,
        test
      };
    } catch (error) {
      console.error('Failed to create regression test:', error);
      return reply.code(500).send({ error: 'Failed to create regression test', details: error });
    }
  });

  /**
   * Run visual regression test
   * POST /api/visual/regression-tests/:testId/run
   */
  fastify.post('/api/visual/regression-tests/:testId/run', async (request: FastifyRequest, reply: FastifyReply) => {
    const { testId } = request.params as any;

    try {
      const test = await prisma.visualRegressionTest.findUnique({
        where: { id: testId }
      });

      if (!test) {
        return reply.code(404).send({ error: 'Test not found' });
      }

      if (!test.enabled) {
        return reply.code(400).send({ error: 'Test is disabled' });
      }

      // Capture current screenshot
      let currentScreenshot: string;
      if (test.sandboxId) {
        const monitorData = visualSandboxMonitor['monitoredSandboxes'].get(test.sandboxId);
        if (!monitorData) {
          return reply.code(404).send({ error: 'Sandbox not being monitored' });
        }
        currentScreenshot = await visualBugDetectionService.captureSandboxPreview(
          test.sandboxId,
          monitorData.previewPort
        );
      } else if (test.url) {
        currentScreenshot = await visualBugDetectionService.captureScreenshot({
          url: test.url,
          viewport: test.viewport as any
        });
      } else {
        return reply.code(400).send({ error: 'Test has no sandbox or URL configured' });
      }

      // Compare screenshots
      const comparison = await visualBugDetectionService.compareScreenshots(
        test.baselineScreenshot,
        currentScreenshot,
        test.testName
      );

      const hasFailed = comparison.diffPercentage > (test.threshold * 100);

      // Run Gemini analysis if regression detected
      let regressionAnalysis = null;
      if (hasFailed) {
        const analysis = await geminiScreenCaptureService.detectVisualRegression(
          test.baselineScreenshot,
          currentScreenshot,
          { changeDescription: `Visual regression test: ${test.testName}` }
        );
        regressionAnalysis = analysis;
      }

      // Update test in database
      await prisma.visualRegressionTest.update({
        where: { id: testId },
        data: {
          currentScreenshot,
          diffImagePath: comparison.diffImagePath,
          lastTestAt: new Date(),
          hasFailed,
          pixelDifference: comparison.pixelDiff,
          diffPercentage: comparison.diffPercentage,
          regressionAnalysis: JSON.parse(JSON.stringify(regressionAnalysis || {})) as any
        }
      });

      return {
        success: true,
        passed: !hasFailed,
        comparison,
        regressionAnalysis
      };
    } catch (error) {
      console.error('Failed to run regression test:', error);
      return reply.code(500).send({ error: 'Failed to run regression test', details: error });
    }
  });

  /**
   * Get regression tests
   * GET /api/visual/regression-tests
   */
  fastify.get('/api/visual/regression-tests', async (request: FastifyRequest, reply: FastifyReply) => {
    const { projectId, sandboxId } = request.query as any;

    try {
      const where: any = {};
      if (projectId) where.projectId = projectId;
      if (sandboxId) where.sandboxId = sandboxId;

      const tests = await prisma.visualRegressionTest.findMany({
        where,
        orderBy: { lastTestAt: 'desc' }
      });

      return {
        success: true,
        tests,
        summary: {
          total: tests.length,
          failed: tests.filter(t => t.hasFailed).length,
          passed: tests.filter(t => !t.hasFailed && t.lastTestAt).length,
          pending: tests.filter(t => !t.lastTestAt).length
        }
      };
    } catch (error) {
      console.error('Failed to fetch regression tests:', error);
      return reply.code(500).send({ error: 'Failed to fetch regression tests', details: error });
    }
  });

  /**
   * Update baseline
   * POST /api/visual/regression-tests/:testId/update-baseline
   */
  fastify.post('/api/visual/regression-tests/:testId/update-baseline', async (request: FastifyRequest, reply: FastifyReply) => {
    const { testId } = request.params as any;

    try {
      const test = await prisma.visualRegressionTest.findUnique({
        where: { id: testId }
      });

      if (!test) {
        return reply.code(404).send({ error: 'Test not found' });
      }

      // Use current screenshot as new baseline
      if (test.currentScreenshot) {
        await prisma.visualRegressionTest.update({
          where: { id: testId },
          data: {
            baselineScreenshot: test.currentScreenshot,
            baselineUpdatedAt: new Date(),
            hasFailed: false,
            pixelDifference: 0,
            diffPercentage: 0
          }
        });

        return {
          success: true,
          message: 'Baseline updated successfully'
        };
      } else {
        return reply.code(400).send({ error: 'No current screenshot available to set as baseline' });
      }
    } catch (error) {
      console.error('Failed to update baseline:', error);
      return reply.code(500).send({ error: 'Failed to update baseline', details: error });
    }
  });

  // ============================================
  // Sandbox Visual Monitoring
  // ============================================

  /**
   * Start visual monitoring for sandbox
   * POST /api/visual/monitoring/start
   */
  fastify.post('/api/visual/monitoring/start', async (request: FastifyRequest, reply: FastifyReply) => {
    const { sandboxId, previewPort, captureBaseline, enableRegressionTesting, interval } = request.body as any;

    if (!sandboxId || !previewPort) {
      return reply.code(400).send({ error: 'sandboxId and previewPort are required' });
    }

    try {
      await visualSandboxMonitor.startMonitoring(sandboxId, previewPort, {
        interval,
        captureBaseline,
        enableRegressionTesting
      });

      return {
        success: true,
        message: `Visual monitoring started for sandbox ${sandboxId}`
      };
    } catch (error) {
      console.error('Failed to start monitoring:', error);
      return reply.code(500).send({ error: 'Failed to start monitoring', details: error });
    }
  });

  /**
   * Stop visual monitoring
   * POST /api/visual/monitoring/stop
   */
  fastify.post('/api/visual/monitoring/stop', async (request: FastifyRequest, reply: FastifyReply) => {
    const { sandboxId } = request.body as any;

    if (!sandboxId) {
      return reply.code(400).send({ error: 'sandboxId is required' });
    }

    try {
      visualSandboxMonitor.stopMonitoring(sandboxId);

      return {
        success: true,
        message: `Visual monitoring stopped for sandbox ${sandboxId}`
      };
    } catch (error) {
      console.error('Failed to stop monitoring:', error);
      return reply.code(500).send({ error: 'Failed to stop monitoring', details: error });
    }
  });

  /**
   * Get monitoring status
   * GET /api/visual/monitoring/status
   */
  fastify.get('/api/visual/monitoring/status', async (request: FastifyRequest, reply: FastifyReply) => {
    const { sandboxId } = request.query as any;

    try {
      if (sandboxId) {
        const isMonitoring = visualSandboxMonitor.isMonitoring(sandboxId);
        const issues = visualSandboxMonitor.getIssues(sandboxId);

        return {
          success: true,
          isMonitoring,
          issues
        };
      } else {
        const monitoredSandboxes = visualSandboxMonitor.getMonitoredSandboxes();

        return {
          success: true,
          monitoredSandboxes
        };
      }
    } catch (error) {
      console.error('Failed to get monitoring status:', error);
      return reply.code(500).send({ error: 'Failed to get monitoring status', details: error });
    }
  });

  // ============================================
  // Visual Bugs Management
  // ============================================

  /**
   * Get visual bugs
   * GET /api/visual/bugs
   */
  fastify.get('/api/visual/bugs', async (request: FastifyRequest, reply: FastifyReply) => {
    const { projectId, sandboxId, status, severity } = request.query as any;

    try {
      const where: any = {};
      if (projectId) where.projectId = projectId;
      if (sandboxId) where.sandboxId = sandboxId;
      if (status) where.status = status;
      if (severity) where.severity = severity;

      const bugs = await prisma.visualBug.findMany({
        where,
        orderBy: { detectedAt: 'desc' },
        take: 100
      });

      return {
        success: true,
        bugs,
        summary: {
          total: bugs.length,
          critical: bugs.filter(b => b.severity === 'critical').length,
          high: bugs.filter(b => b.severity === 'high').length,
          medium: bugs.filter(b => b.severity === 'medium').length,
          low: bugs.filter(b => b.severity === 'low').length,
          new: bugs.filter(b => b.status === 'new').length,
          fixed: bugs.filter(b => b.status === 'fixed').length
        }
      };
    } catch (error) {
      console.error('Failed to fetch visual bugs:', error);
      return reply.code(500).send({ error: 'Failed to fetch visual bugs', details: error });
    }
  });

  /**
   * Get visual bug details
   * GET /api/visual/bugs/:bugId
   */
  fastify.get('/api/visual/bugs/:bugId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { bugId } = request.params as any;

    try {
      const bug = await prisma.visualBug.findUnique({
        where: { id: bugId }
      });

      if (!bug) {
        return reply.code(404).send({ error: 'Visual bug not found' });
      }

      return {
        success: true,
        bug
      };
    } catch (error) {
      console.error('Failed to fetch visual bug:', error);
      return reply.code(500).send({ error: 'Failed to fetch visual bug', details: error });
    }
  });

  /**
   * Update visual bug status
   * PATCH /api/visual/bugs/:bugId
   */
  fastify.patch('/api/visual/bugs/:bugId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { bugId } = request.params as any;
    const { status, fixedBy, fixCode } = request.body as any;

    try {
      const updated = await prisma.visualBug.update({
        where: { id: bugId },
        data: {
          status,
          fixedAt: status === 'fixed' ? new Date() : undefined,
          fixedBy,
          fixCode
        }
      });

      return {
        success: true,
        bug: updated
      };
    } catch (error) {
      console.error('Failed to update visual bug:', error);
      return reply.code(500).send({ error: 'Failed to update visual bug', details: error });
    }
  });

  // ============================================
  // Responsive & Accessibility Testing
  // ============================================

  /**
   * Test responsive design
   * POST /api/visual/test-responsive
   */
  fastify.post('/api/visual/test-responsive', async (request: FastifyRequest, reply: FastifyReply) => {
    const { sandboxId } = request.body as any;

    if (!sandboxId) {
      return reply.code(400).send({ error: 'sandboxId is required' });
    }

    try {
      const result = await visualSandboxMonitor.testResponsiveDesign(sandboxId);

      return {
        success: true,
        ...result
      };
    } catch (error) {
      console.error('Responsive test failed:', error);
      return reply.code(500).send({ error: 'Responsive test failed', details: error });
    }
  });

  /**
   * Test accessibility
   * POST /api/visual/test-accessibility
   */
  fastify.post('/api/visual/test-accessibility', async (request: FastifyRequest, reply: FastifyReply) => {
    const { url, sandboxId } = request.body as any;

    if (!url && !sandboxId) {
      return reply.code(400).send({ error: 'Either url or sandboxId is required' });
    }

    try {
      let targetUrl: string;
      if (sandboxId) {
        const monitorData = visualSandboxMonitor['monitoredSandboxes'].get(sandboxId);
        if (!monitorData) {
          return reply.code(404).send({ error: 'Sandbox not being monitored' });
        }
        targetUrl = `http://localhost:${monitorData.previewPort}`;
      } else {
        targetUrl = url;
      }

      const result = await visualBugDetectionService.testAccessibility(targetUrl);

      return {
        success: true,
        ...result
      };
    } catch (error) {
      console.error('Accessibility test failed:', error);
      return reply.code(500).send({ error: 'Accessibility test failed', details: error });
    }
  });

  // ============================================
  // Visual Analysis Configuration
  // ============================================

  /**
   * Get visual analysis config
   * GET /api/visual/config/:projectId
   */
  fastify.get('/api/visual/config/:projectId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { projectId } = request.params as any;

    try {
      let config = await prisma.visualAnalysisConfig.findUnique({
        where: { projectId }
      });

      if (!config) {
        // Create default config
        config = await prisma.visualAnalysisConfig.create({
          data: {
            projectId,
            enableVisualMonitoring: false,
            enableRegressionTesting: false,
            enableAccessibilityCheck: true,
            enableResponsiveCheck: true,
            monitoringInterval: 10000,
            regressionThreshold: 0.05,
            autoFixVisualBugs: false,
            minConfidence: 0.85,
            notifyOnRegressions: true,
            notifyOnCriticalIssues: true,
            notificationChannels: { slack: false, email: false, webhook: false },
            screenshotRetentionDays: 30,
            captureFullPage: true
          }
        });
      }

      return {
        success: true,
        config
      };
    } catch (error) {
      console.error('Failed to fetch config:', error);
      return reply.code(500).send({ error: 'Failed to fetch config', details: error });
    }
  });

  /**
   * Update visual analysis config
   * PUT /api/visual/config/:projectId
   */
  fastify.put('/api/visual/config/:projectId', async (request: FastifyRequest, reply: FastifyReply) => {
    const { projectId } = request.params as any;
    const configData = request.body as any;

    try {
      const config = await prisma.visualAnalysisConfig.upsert({
        where: { projectId },
        update: configData,
        create: {
          projectId,
          ...configData
        }
      });

      return {
        success: true,
        config
      };
    } catch (error) {
      console.error('Failed to update config:', error);
      return reply.code(500).send({ error: 'Failed to update config', details: error });
    }
  });

  /**
   * Get visual health checks
   * GET /api/visual/health-checks
   */
  fastify.get('/api/visual/health-checks', async (request: FastifyRequest, reply: FastifyReply) => {
    const { sandboxId, projectId, limit } = request.query as any;

    try {
      const where: any = {};
      if (sandboxId) where.sandboxId = sandboxId;
      if (projectId) where.projectId = projectId;

      const checks = await prisma.visualHealthCheck.findMany({
        where,
        orderBy: { timestamp: 'desc' },
        take: parseInt(limit) || 50
      });

      return {
        success: true,
        checks
      };
    } catch (error) {
      console.error('Failed to fetch health checks:', error);
      return reply.code(500).send({ error: 'Failed to fetch health checks', details: error });
    }
  });
}

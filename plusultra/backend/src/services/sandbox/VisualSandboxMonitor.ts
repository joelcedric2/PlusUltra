/**
 * VisualSandboxMonitor.ts
 * Integrates Gemini visual analysis with sandbox monitoring
 * Provides real-time visual bug detection and regression testing
 */

import { EventEmitter } from 'events';
import { enhancedVisualAnalysisService } from '../tci/EnhancedVisualAnalysisService';
import { visualBugDetectionService } from '../visual/VisualBugDetectionService';

export interface VisualIssue {
  id: string;
  sandboxId: string;
  type: 'layout' | 'styling' | 'content' | 'accessibility' | 'responsive' | 'regression';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  screenshotPath: string;
  location?: {
    selector?: string;
    x?: number;
    y?: number;
  };
  detectedAt: Date;
  suggestedFix?: string;
  confidence: number;
}

export interface VisualHealthCheck {
  sandboxId: string;
  timestamp: Date;
  status: 'healthy' | 'degraded' | 'unhealthy';
  overallScore: number; // 0-100
  visualIssues: VisualIssue[];
  accessibilityScore?: number;
  screenshotPath: string;
  regressionDetected: boolean;
}

export class VisualSandboxMonitor extends EventEmitter {
  private monitoredSandboxes: Map<string, {
    interval: NodeJS.Timeout;
    previewPort: number;
    lastScreenshot: string | null;
    baselineScreenshot: string | null;
  }> = new Map();

  private detectedIssues: Map<string, VisualIssue[]> = new Map();
  private readonly DEFAULT_INTERVAL = 10000; // 10 seconds
  private readonly REGRESSION_THRESHOLD = 0.05; // 5% pixel difference

  /**
   * Start visual monitoring for a sandbox
   */
  async startMonitoring(
    sandboxId: string,
    previewPort: number,
    options?: {
      interval?: number;
      captureBaseline?: boolean;
      enableRegressionTesting?: boolean;
    }
  ): Promise<void> {
    if (this.monitoredSandboxes.has(sandboxId)) {
      console.log(`Visual monitoring already active for sandbox ${sandboxId}`);
      return;
    }

    console.log(`[Visual Monitor] Starting monitoring for sandbox ${sandboxId} on port ${previewPort}`);

    // Capture baseline screenshot if requested
    let baselineScreenshot: string | null = null;
    if (options?.captureBaseline || options?.enableRegressionTesting) {
      try {
        baselineScreenshot = await visualBugDetectionService.captureSandboxPreview(
          sandboxId,
          previewPort
        );
        console.log(`  📸 Baseline captured: ${baselineScreenshot}`);
      } catch (error) {
        console.error('Failed to capture baseline:', error);
      }
    }

    // Start monitoring interval
    const interval = setInterval(async () => {
      await this.performVisualHealthCheck(sandboxId, previewPort, options);
    }, options?.interval || this.DEFAULT_INTERVAL);

    this.monitoredSandboxes.set(sandboxId, {
      interval,
      previewPort,
      lastScreenshot: null,
      baselineScreenshot
    });

    // Perform initial check
    await this.performVisualHealthCheck(sandboxId, previewPort, options);

    this.emit('monitoring:started', { sandboxId, previewPort });
  }

  /**
   * Stop visual monitoring for a sandbox
   */
  stopMonitoring(sandboxId: string): void {
    const monitorData = this.monitoredSandboxes.get(sandboxId);
    if (monitorData) {
      clearInterval(monitorData.interval);
      this.monitoredSandboxes.delete(sandboxId);
      this.detectedIssues.delete(sandboxId);

      console.log(`[Visual Monitor] Stopped monitoring sandbox ${sandboxId}`);
      this.emit('monitoring:stopped', { sandboxId });
    }
  }

  /**
   * Perform visual health check
   */
  async performVisualHealthCheck(
    sandboxId: string,
    previewPort: number,
    options?: {
      enableRegressionTesting?: boolean;
      checkAccessibility?: boolean;
    }
  ): Promise<VisualHealthCheck> {
    try {
      const monitorData = this.monitoredSandboxes.get(sandboxId);
      if (!monitorData) {
        throw new Error('Sandbox not being monitored');
      }

      // Capture current screenshot
      const screenshotPath = await visualBugDetectionService.captureSandboxPreview(
        sandboxId,
        previewPort
      );

      // Analyze with enhanced visual service
      const analysisResult = await enhancedVisualAnalysisService.analyzeCode(
        '', // No code needed for UI mode
        { language: 'typescript', framework: 'react' } as any,
        {
          mode: 'ui',
          sandboxId,
          previewPort
        }
      );

      // Check for regression if baseline exists
      let regressionDetected = false;
      if (options?.enableRegressionTesting && monitorData.baselineScreenshot) {
        const regressionResult = await visualBugDetectionService.compareScreenshots(
          monitorData.baselineScreenshot,
          screenshotPath,
          `sandbox-${sandboxId}`
        );

        if (regressionResult.diffPercentage > this.REGRESSION_THRESHOLD * 100) {
          regressionDetected = true;
          console.warn(`⚠️  Visual regression detected in sandbox ${sandboxId}: ${regressionResult.diffPercentage.toFixed(2)}% difference`);
        }
      }

      // Convert Gemini issues to VisualIssue format
      const visualIssues: VisualIssue[] = [];
      if (analysisResult.uiAnalysis?.visualIssues) {
        for (const issue of analysisResult.uiAnalysis.visualIssues) {
          visualIssues.push({
            id: `${sandboxId}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
            sandboxId,
            type: issue.type,
            severity: issue.severity,
            description: issue.description,
            screenshotPath,
            location: issue.location,
            detectedAt: new Date(),
            suggestedFix: issue.suggestedFix,
            confidence: issue.confidence
          });
        }
      }

      // Add regression issue if detected
      if (regressionDetected) {
        visualIssues.push({
          id: `${sandboxId}-regression-${Date.now()}`,
          sandboxId,
          type: 'regression',
          severity: 'high',
          description: 'Visual regression detected compared to baseline',
          screenshotPath,
          detectedAt: new Date(),
          confidence: 95
        });
      }

      // Calculate health status
      const criticalCount = visualIssues.filter(i => i.severity === 'critical').length;
      const highCount = visualIssues.filter(i => i.severity === 'high').length;
      const status = criticalCount > 0 ? 'unhealthy' :
                     highCount > 0 ? 'degraded' : 'healthy';

      const healthCheck: VisualHealthCheck = {
        sandboxId,
        timestamp: new Date(),
        status,
        overallScore: analysisResult.uiAnalysis?.overallScore || 100,
        visualIssues,
        accessibilityScore: analysisResult.uiAnalysis?.accessibilityScore,
        screenshotPath,
        regressionDetected
      };

      // Store issues
      this.detectedIssues.set(sandboxId, visualIssues);

      // Update last screenshot
      monitorData.lastScreenshot = screenshotPath;

      // Emit events
      this.emit('health:checked', healthCheck);

      if (regressionDetected) {
        this.emit('regression:detected', {
          sandboxId,
          screenshotPath,
          baselineScreenshot: monitorData.baselineScreenshot
        });
      }

      if (criticalCount > 0) {
        this.emit('issue:critical', {
          sandboxId,
          issues: visualIssues.filter(i => i.severity === 'critical')
        });
      }

      return healthCheck;

    } catch (error) {
      console.error('Visual health check failed:', error);
      throw error;
    }
  }

  /**
   * Run visual regression test on demand
   */
  async runRegressionTest(
    sandboxId: string,
    testName: string,
    options?: {
      updateBaseline?: boolean;
      threshold?: number;
    }
  ): Promise<{
    passed: boolean;
    pixelDifference: number;
    diffPercentage: number;
    diffImagePath: string;
  }> {
    const monitorData = this.monitoredSandboxes.get(sandboxId);
    if (!monitorData) {
      throw new Error('Sandbox not being monitored');
    }

    const result = await enhancedVisualAnalysisService.runVisualRegressionTest(
      sandboxId,
      monitorData.previewPort,
      testName,
      options
    );

    if (!result.passed) {
      this.emit('regression:failed', {
        sandboxId,
        testName,
        report: result.report
      });
    }

    return {
      passed: result.passed,
      pixelDifference: result.report.pixelDifference,
      diffPercentage: result.report.diffPercentage,
      diffImagePath: result.report.diffImagePath
    };
  }

  /**
   * Test responsive design
   */
  async testResponsiveDesign(sandboxId: string): Promise<{
    isResponsive: boolean;
    issues: any[];
    screenshots: any[];
  }> {
    const monitorData = this.monitoredSandboxes.get(sandboxId);
    if (!monitorData) {
      throw new Error('Sandbox not being monitored');
    }

    const result = await enhancedVisualAnalysisService.testResponsiveDesign(
      sandboxId,
      monitorData.previewPort
    );

    if (!result.isResponsive) {
      this.emit('responsive:failed', {
        sandboxId,
        issues: result.issues
      });
    }

    return result;
  }

  /**
   * Analyze specific component rendering
   */
  async analyzeComponent(
    sandboxId: string,
    componentName: string,
    expectedProps?: Record<string, any>
  ): Promise<{
    isRenderedCorrectly: boolean;
    issues: string[];
    suggestions: string[];
    screenshot: string;
  }> {
    const monitorData = this.monitoredSandboxes.get(sandboxId);
    if (!monitorData) {
      throw new Error('Sandbox not being monitored');
    }

    return enhancedVisualAnalysisService.analyzeComponent(
      sandboxId,
      monitorData.previewPort,
      componentName,
      expectedProps
    );
  }

  /**
   * Update baseline screenshot
   */
  async updateBaseline(sandboxId: string): Promise<string> {
    const monitorData = this.monitoredSandboxes.get(sandboxId);
    if (!monitorData) {
      throw new Error('Sandbox not being monitored');
    }

    const baselineScreenshot = await visualBugDetectionService.captureSandboxPreview(
      sandboxId,
      monitorData.previewPort
    );

    monitorData.baselineScreenshot = baselineScreenshot;
    console.log(`[Visual Monitor] Baseline updated for sandbox ${sandboxId}`);

    this.emit('baseline:updated', { sandboxId, baselineScreenshot });

    return baselineScreenshot;
  }

  /**
   * Get current issues for a sandbox
   */
  getIssues(sandboxId: string): VisualIssue[] {
    return this.detectedIssues.get(sandboxId) || [];
  }

  /**
   * Get monitoring status
   */
  isMonitoring(sandboxId: string): boolean {
    return this.monitoredSandboxes.has(sandboxId);
  }

  /**
   * Get all monitored sandboxes
   */
  getMonitoredSandboxes(): string[] {
    return Array.from(this.monitoredSandboxes.keys());
  }

  /**
   * Stop all monitoring
   */
  stopAll(): void {
    for (const sandboxId of this.monitoredSandboxes.keys()) {
      this.stopMonitoring(sandboxId);
    }
  }
}

// Singleton instance
export const visualSandboxMonitor = new VisualSandboxMonitor();

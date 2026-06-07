/**
 * Enhanced Visual Analysis Service - TCI Layer 1 (Enhanced)
 *
 * Combines:
 * - DeepSeek: Static code visual pattern analysis
 * - Gemini 2.0 Flash: Dynamic UI/app screenshot analysis
 *
 * Two modes:
 * 1. CODE mode: Analyzes syntax-highlighted code screenshots (DeepSeek)
 * 2. UI mode: Analyzes running application screenshots (Gemini)
 */

import type { VisualInsights, ProjectContext } from '../../types/tci';
import { visualCodeAnalysisService } from './VisualCodeAnalysisService';
import { geminiScreenCaptureService } from '../visual/GeminiScreenCaptureService';
import { visualBugDetectionService } from '../visual/VisualBugDetectionService';

export type VisualAnalysisMode = 'code' | 'ui' | 'both';

export interface EnhancedVisualOptions {
  mode: VisualAnalysisMode;
  screenshotUrl?: string; // URL of running app to analyze
  sandboxId?: string; // If analyzing sandbox
  previewPort?: number; // Port for sandbox preview
}

export interface EnhancedVisualInsights extends VisualInsights {
  uiAnalysis?: {
    screenshotPath: string;
    visualIssues: any[];
    overallScore: number;
    summary: string;
    recommendations: string[];
    accessibilityScore?: number;
    accessibilityIssues?: any[];
  };
  combinedScore?: number;
  analysisMode: VisualAnalysisMode;
}

export class EnhancedVisualAnalysisService {
  /**
   * Analyze code with enhanced visual capabilities
   * Combines static code analysis (DeepSeek) with dynamic UI analysis (Gemini)
   */
  async analyzeCode(
    code: string,
    context: ProjectContext,
    options?: EnhancedVisualOptions
  ): Promise<EnhancedVisualInsights> {
    const mode = options?.mode || 'code';

    console.log(`[Enhanced TCI Layer 1] Visual analysis (${mode} mode)...`);

    let codeAnalysis: VisualInsights | null = null;
    let uiAnalysis: any = null;

    // 1. Static code analysis (DeepSeek)
    if (mode === 'code' || mode === 'both') {
      console.log('  🔍 Running static code analysis (DeepSeek)...');
      codeAnalysis = await visualCodeAnalysisService.analyzeCode(code, context);
    }

    // 2. Dynamic UI analysis (Gemini)
    if (mode === 'ui' || mode === 'both') {
      console.log('  📸 Running dynamic UI analysis (Gemini)...');
      uiAnalysis = await this.analyzeUI(options);
    }

    // 3. Combine results
    return this.combineAnalyses(codeAnalysis, uiAnalysis, mode);
  }

  /**
   * Analyze running application UI with Gemini
   */
  private async analyzeUI(options?: EnhancedVisualOptions): Promise<any> {
    try {
      let screenshotPath: string;

      // Capture screenshot
      if (options?.sandboxId && options?.previewPort) {
        // Analyze sandbox preview
        screenshotPath = await visualBugDetectionService.captureSandboxPreview(
          options.sandboxId,
          options.previewPort
        );
      } else if (options?.screenshotUrl) {
        // Capture screenshot from URL
        screenshotPath = await visualBugDetectionService.captureScreenshot({
          url: options.screenshotUrl
        });
      } else {
        console.warn('No screenshot URL or sandbox provided for UI analysis');
        return null;
      }

      // Analyze with Gemini
      const analysisResult = await geminiScreenCaptureService.analyzeScreenshot({
        imagePath: screenshotPath,
        prompt: `Analyze this application screenshot for:
1. Visual bugs and layout issues
2. UI/UX problems
3. Accessibility concerns
4. Responsive design issues
5. Component rendering problems

Provide detailed feedback with severity levels.`,
        context: {
          url: options?.screenshotUrl,
          expectedBehavior: 'Application should render correctly with no visual bugs'
        }
      });

      // Also run accessibility analysis
      const accessibilityResult = await geminiScreenCaptureService.detectAccessibilityIssues(
        screenshotPath
      );

      return {
        screenshotPath,
        visualIssues: analysisResult.issues,
        overallScore: analysisResult.overallScore,
        summary: analysisResult.summary,
        recommendations: analysisResult.recommendations,
        accessibilityScore: accessibilityResult.score,
        accessibilityIssues: accessibilityResult.issues
      };

    } catch (error) {
      console.error('UI analysis failed:', error);
      return null;
    }
  }

  /**
   * Combine static code and dynamic UI analyses
   */
  private combineAnalyses(
    codeAnalysis: VisualInsights | null,
    uiAnalysis: any,
    mode: VisualAnalysisMode
  ): EnhancedVisualInsights {
    // Base result
    const result: EnhancedVisualInsights = {
      visualPatterns: codeAnalysis?.visualPatterns || [],
      overallCodeHealth: codeAnalysis?.overallCodeHealth || 5,
      reasoning: codeAnalysis?.reasoning || '',
      confidence: codeAnalysis?.confidence || 0.5,
      analysisMode: mode
    };

    // Add UI analysis if available
    if (uiAnalysis) {
      result.uiAnalysis = uiAnalysis;

      // Calculate combined score
      if (codeAnalysis) {
        // Weight: 60% code health, 40% UI score
        result.combinedScore = (
          (codeAnalysis.overallCodeHealth * 0.6) +
          (uiAnalysis.overallScore / 10 * 0.4)
        );
      } else {
        result.combinedScore = uiAnalysis.overallScore / 10;
      }

      // Enhance reasoning with UI insights
      if (uiAnalysis.summary) {
        result.reasoning += `\n\nUI Analysis: ${uiAnalysis.summary}`;
      }

      // Combine confidence scores
      if (codeAnalysis) {
        result.confidence = (codeAnalysis.confidence + 0.9) / 2; // Gemini high confidence
      } else {
        result.confidence = 0.9;
      }
    }

    return result;
  }

  /**
   * Run visual regression test on sandbox
   * Compares current sandbox state with baseline
   */
  async runVisualRegressionTest(
    sandboxId: string,
    previewPort: number,
    testName: string,
    options?: {
      updateBaseline?: boolean;
      threshold?: number;
    }
  ): Promise<{
    passed: boolean;
    report: any;
  }> {
    console.log(`[Visual Regression] Testing sandbox ${sandboxId}...`);

    const url = `http://localhost:${previewPort}`;
    const report = await visualBugDetectionService.runVisualRegressionTest(
      `${testName}-${sandboxId}`,
      url,
      options
    );

    return {
      passed: !report.hasFailed,
      report
    };
  }

  /**
   * Monitor sandbox for visual changes in real-time
   * Returns interval ID that can be cleared
   */
  async startVisualMonitoring(
    sandboxId: string,
    previewPort: number,
    callback?: (changes: any) => void
  ): Promise<NodeJS.Timeout> {
    console.log(`[Visual Monitor] Starting monitoring for sandbox ${sandboxId}...`);

    return visualBugDetectionService.monitorSandboxVisualChanges(
      sandboxId,
      previewPort,
      5000 // Check every 5 seconds
    );
  }

  /**
   * Test responsive design of sandbox app
   */
  async testResponsiveDesign(
    sandboxId: string,
    previewPort: number
  ): Promise<{
    isResponsive: boolean;
    issues: any[];
    screenshots: any[];
  }> {
    console.log(`[Responsive Test] Testing sandbox ${sandboxId}...`);

    const url = `http://localhost:${previewPort}`;
    const result = await visualBugDetectionService.testResponsiveDesign(url);

    return {
      isResponsive: result.isResponsive,
      issues: result.analysis.issues,
      screenshots: result.screenshots
    };
  }

  /**
   * Analyze specific component in sandbox
   */
  async analyzeComponent(
    sandboxId: string,
    previewPort: number,
    componentName: string,
    expectedProps?: Record<string, any>
  ): Promise<{
    isRenderedCorrectly: boolean;
    issues: string[];
    suggestions: string[];
    screenshot: string;
  }> {
    console.log(`[Component Analysis] Analyzing ${componentName} in sandbox ${sandboxId}...`);

    const result = await visualBugDetectionService.analyzeComponentInSandbox(
      sandboxId,
      previewPort,
      componentName,
      expectedProps
    );

    return {
      isRenderedCorrectly: result.isRenderedCorrectly,
      issues: result.issues,
      suggestions: result.suggestions,
      screenshot: result.screenshotPath
    };
  }
}

export const enhancedVisualAnalysisService = new EnhancedVisualAnalysisService();

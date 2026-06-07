/**
 * GeminiScreenCaptureService.ts
 * Uses Gemini's advanced vision capabilities to analyze screenshots and detect visual issues
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import * as fs from 'fs';
import * as path from 'path';

export interface ScreenAnalysisRequest {
  imagePath?: string;
  imageBuffer?: Buffer;
  imageBase64?: string;
  prompt: string;
  context?: {
    expectedBehavior?: string;
    previousScreenshot?: string;
    errorMessage?: string;
    url?: string;
    viewport?: { width: number; height: number };
  };
}

export interface VisualIssue {
  type: 'layout' | 'styling' | 'content' | 'accessibility' | 'responsive' | 'performance';
  severity: 'critical' | 'high' | 'medium' | 'low';
  description: string;
  location?: {
    x?: number;
    y?: number;
    width?: number;
    height?: number;
    selector?: string;
  };
  suggestedFix?: string;
  confidence: number;
}

export interface ScreenAnalysisResult {
  success: boolean;
  issues: VisualIssue[];
  summary: string;
  overallScore: number; // 0-100, where 100 is perfect
  recommendations: string[];
  geminiResponse: string;
  analysisTime: number;
}

export interface VisualRegressionResult {
  hasRegression: boolean;
  differences: Array<{
    type: string;
    description: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    location?: string;
  }>;
  summary: string;
  confidence: number;
}

export class GeminiScreenCaptureService {
  private genAI: GoogleGenerativeAI;
  private visionModel: GenerativeModel;
  private apiKey: string;

  // Gemini 2.0 Flash with enhanced vision capabilities
  private readonly MODEL_NAME = 'gemini-2.0-flash-exp';

  constructor() {
    this.apiKey = process.env.GOOGLE_API_KEY || '';
    if (!this.apiKey) {
      throw new Error('GOOGLE_API_KEY is required for GeminiScreenCaptureService');
    }

    this.genAI = new GoogleGenerativeAI(this.apiKey);
    this.visionModel = this.genAI.getGenerativeModel({ model: this.MODEL_NAME });
  }

  /**
   * Analyze a screenshot for visual bugs and issues
   */
  async analyzeScreenshot(request: ScreenAnalysisRequest): Promise<ScreenAnalysisResult> {
    const startTime = Date.now();

    try {
      // Prepare the image data
      const imageData = await this.prepareImageData(request);

      // Build the comprehensive analysis prompt
      const analysisPrompt = this.buildAnalysisPrompt(request);

      // Call Gemini with vision
      const result = await this.visionModel.generateContent([
        analysisPrompt,
        imageData
      ]);

      const response = result.response;
      const text = response.text();

      // Parse Gemini's response into structured issues
      const analysisResult = this.parseAnalysisResponse(text);
      analysisResult.analysisTime = Date.now() - startTime;
      analysisResult.geminiResponse = text;

      return analysisResult;

    } catch (error) {
      console.error('Gemini screenshot analysis failed:', error);
      return {
        success: false,
        issues: [],
        summary: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        overallScore: 0,
        recommendations: [],
        geminiResponse: '',
        analysisTime: Date.now() - startTime
      };
    }
  }

  /**
   * Detect visual regressions by comparing two screenshots
   */
  async detectVisualRegression(
    beforeImage: string | Buffer,
    afterImage: string | Buffer,
    context?: { changeDescription?: string; expectedChanges?: string[] }
  ): Promise<VisualRegressionResult> {
    try {
      const beforeData = await this.prepareImageData({
        imagePath: typeof beforeImage === 'string' ? beforeImage : undefined,
        imageBuffer: Buffer.isBuffer(beforeImage) ? beforeImage : undefined,
        prompt: ''
      });

      const afterData = await this.prepareImageData({
        imagePath: typeof afterImage === 'string' ? afterImage : undefined,
        imageBuffer: Buffer.isBuffer(afterImage) ? afterImage : undefined,
        prompt: ''
      });

      const regressionPrompt = `
Compare these two screenshots (BEFORE and AFTER) and identify visual regressions.

${context?.changeDescription ? `Context: ${context.changeDescription}` : ''}
${context?.expectedChanges?.length ? `Expected changes: ${context.expectedChanges.join(', ')}` : ''}

Analyze for:
1. Unintended layout shifts or broken layouts
2. Missing or misaligned elements
3. Color/styling changes that seem unintentional
4. Text overflow or truncation
5. Broken images or icons
6. Accessibility issues (contrast, size)
7. Responsive design problems

Return JSON format:
{
  "hasRegression": boolean,
  "differences": [
    {
      "type": "layout|styling|content|accessibility",
      "description": "detailed description",
      "severity": "critical|high|medium|low",
      "location": "description of where"
    }
  ],
  "summary": "overall summary",
  "confidence": 0-100
}

Focus on UNINTENDED changes that would negatively impact users.
`;

      const result = await this.visionModel.generateContent([
        regressionPrompt,
        { inlineData: { mimeType: 'image/png', data: beforeData.inlineData.data } },
        { inlineData: { mimeType: 'image/png', data: afterData.inlineData.data } }
      ]);

      const response = result.response.text();
      return this.parseRegressionResponse(response);

    } catch (error) {
      console.error('Visual regression detection failed:', error);
      return {
        hasRegression: false,
        differences: [],
        summary: `Regression detection failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
        confidence: 0
      };
    }
  }

  /**
   * Analyze UI component rendering
   */
  async analyzeComponentRendering(
    screenshot: string | Buffer,
    componentName: string,
    expectedProps?: Record<string, any>
  ): Promise<{
    isRenderedCorrectly: boolean;
    issues: string[];
    suggestions: string[];
  }> {
    try {
      const imageData = await this.prepareImageData({
        imagePath: typeof screenshot === 'string' ? screenshot : undefined,
        imageBuffer: Buffer.isBuffer(screenshot) ? screenshot : undefined,
        prompt: ''
      });

      const prompt = `
Analyze this screenshot of the "${componentName}" component.

${expectedProps ? `Expected props: ${JSON.stringify(expectedProps, null, 2)}` : ''}

Check:
1. Is the component visible and rendered?
2. Are all expected elements present?
3. Is the styling correct (colors, spacing, fonts)?
4. Are interactive elements (buttons, inputs) properly styled?
5. Is the layout responsive and well-aligned?
6. Any accessibility issues?

Return JSON:
{
  "isRenderedCorrectly": boolean,
  "issues": ["list of issues found"],
  "suggestions": ["list of improvement suggestions"]
}
`;

      const result = await this.visionModel.generateContent([prompt, imageData]);
      const response = result.response.text();

      return this.parseComponentAnalysis(response);

    } catch (error) {
      console.error('Component rendering analysis failed:', error);
      return {
        isRenderedCorrectly: false,
        issues: [`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`],
        suggestions: []
      };
    }
  }

  /**
   * Validate responsive design across viewports
   */
  async validateResponsiveDesign(
    screenshots: Array<{ viewport: string; image: string | Buffer }>,
    url: string
  ): Promise<{
    isResponsive: boolean;
    issues: Array<{ viewport: string; problems: string[] }>;
    score: number;
  }> {
    try {
      const analyses = await Promise.all(
        screenshots.map(async ({ viewport, image }) => {
          const imageData = await this.prepareImageData({
            imagePath: typeof image === 'string' ? image : undefined,
            imageBuffer: Buffer.isBuffer(image) ? image : undefined,
            prompt: ''
          });

          const prompt = `
Analyze this ${viewport} screenshot for responsive design issues.

Check:
1. Content fits viewport without horizontal scroll
2. Text is readable (not too small)
3. Touch targets are adequately sized (min 44x44px)
4. Images scale appropriately
5. Layout adapts well to screen size
6. No overlapping elements

List any issues found.
`;

          const result = await this.visionModel.generateContent([prompt, imageData]);
          return {
            viewport,
            response: result.response.text()
          };
        })
      );

      return this.parseResponsiveAnalysis(analyses);

    } catch (error) {
      console.error('Responsive design validation failed:', error);
      return {
        isResponsive: false,
        issues: [{ viewport: 'all', problems: [`Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`] }],
        score: 0
      };
    }
  }

  /**
   * Detect accessibility issues from screenshot
   */
  async detectAccessibilityIssues(
    screenshot: string | Buffer
  ): Promise<{
    issues: Array<{
      type: 'contrast' | 'size' | 'spacing' | 'focus' | 'alt-text';
      description: string;
      wcagLevel: 'A' | 'AA' | 'AAA';
      suggestion: string;
    }>;
    score: number;
    summary: string;
  }> {
    try {
      const imageData = await this.prepareImageData({
        imagePath: typeof screenshot === 'string' ? screenshot : undefined,
        imageBuffer: Buffer.isBuffer(screenshot) ? screenshot : undefined,
        prompt: ''
      });

      const prompt = `
Analyze this screenshot for accessibility (a11y) issues following WCAG 2.1 guidelines.

Check:
1. Color contrast ratios (text/background should be 4.5:1 for AA, 7:1 for AAA)
2. Text size (min 16px for body text)
3. Touch target sizes (min 44x44px)
4. Focus indicators visibility
5. Visual hierarchy and readability
6. Images that might need alt text
7. Form field labels visibility

Return JSON:
{
  "issues": [
    {
      "type": "contrast|size|spacing|focus|alt-text",
      "description": "detailed issue",
      "wcagLevel": "A|AA|AAA",
      "suggestion": "how to fix"
    }
  ],
  "score": 0-100,
  "summary": "overall accessibility summary"
}
`;

      const result = await this.visionModel.generateContent([prompt, imageData]);
      const response = result.response.text();

      return this.parseAccessibilityAnalysis(response);

    } catch (error) {
      console.error('Accessibility analysis failed:', error);
      return {
        issues: [],
        score: 0,
        summary: `Analysis failed: ${error instanceof Error ? error.message : 'Unknown error'}`
      };
    }
  }

  /**
   * Prepare image data for Gemini API
   */
  private async prepareImageData(request: ScreenAnalysisRequest): Promise<any> {
    let base64Data: string;

    if (request.imageBase64) {
      base64Data = request.imageBase64;
    } else if (request.imageBuffer) {
      base64Data = request.imageBuffer.toString('base64');
    } else if (request.imagePath) {
      const imageBuffer = await fs.promises.readFile(request.imagePath);
      base64Data = imageBuffer.toString('base64');
    } else {
      throw new Error('No image data provided');
    }

    return {
      inlineData: {
        mimeType: 'image/png',
        data: base64Data
      }
    };
  }

  /**
   * Build comprehensive analysis prompt
   */
  private buildAnalysisPrompt(request: ScreenAnalysisRequest): string {
    const { context } = request;

    let prompt = request.prompt || 'Analyze this screenshot for visual bugs and issues.';

    if (context) {
      prompt += '\n\nAdditional Context:';

      if (context.expectedBehavior) {
        prompt += `\n- Expected Behavior: ${context.expectedBehavior}`;
      }

      if (context.errorMessage) {
        prompt += `\n- Error Message: ${context.errorMessage}`;
      }

      if (context.url) {
        prompt += `\n- URL: ${context.url}`;
      }

      if (context.viewport) {
        prompt += `\n- Viewport: ${context.viewport.width}x${context.viewport.height}`;
      }
    }

    prompt += `

Please analyze this screenshot and provide:

1. Visual Issues Detected (categorize as layout, styling, content, accessibility, responsive, or performance)
   - For each issue, specify:
     * Type
     * Severity (critical, high, medium, low)
     * Description
     * Location (if identifiable)
     * Suggested fix

2. Overall Quality Score (0-100)

3. Summary of findings

4. Prioritized recommendations

Return response in this JSON format:
{
  "success": true,
  "issues": [
    {
      "type": "layout|styling|content|accessibility|responsive|performance",
      "severity": "critical|high|medium|low",
      "description": "detailed description",
      "location": { "x": 0, "y": 0, "selector": ".class" },
      "suggestedFix": "how to fix it",
      "confidence": 0-100
    }
  ],
  "overallScore": 0-100,
  "summary": "comprehensive summary",
  "recommendations": ["prioritized list of recommendations"]
}

Focus on issues that would impact user experience.
`;

    return prompt;
  }

  /**
   * Parse Gemini's analysis response into structured format
   */
  private parseAnalysisResponse(text: string): ScreenAnalysisResult {
    try {
      // Try to extract JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          success: parsed.success ?? true,
          issues: parsed.issues || [],
          summary: parsed.summary || text,
          overallScore: parsed.overallScore || 0,
          recommendations: parsed.recommendations || [],
          geminiResponse: text,
          analysisTime: 0
        };
      }

      // Fallback: parse text manually
      return this.parseTextResponse(text);

    } catch (error) {
      console.error('Failed to parse Gemini response:', error);
      return {
        success: false,
        issues: [],
        summary: text,
        overallScore: 0,
        recommendations: [],
        geminiResponse: text,
        analysisTime: 0
      };
    }
  }

  /**
   * Parse text response when JSON parsing fails
   */
  private parseTextResponse(text: string): ScreenAnalysisResult {
    const issues: VisualIssue[] = [];
    const recommendations: string[] = [];

    // Simple heuristics to extract issues
    const lines = text.split('\n');
    let currentIssue: Partial<VisualIssue> | null = null;

    for (const line of lines) {
      const trimmed = line.trim();

      if (trimmed.toLowerCase().includes('critical') ||
          trimmed.toLowerCase().includes('error') ||
          trimmed.toLowerCase().includes('broken')) {
        if (currentIssue) issues.push(currentIssue as VisualIssue);
        currentIssue = {
          type: 'layout',
          severity: 'critical',
          description: trimmed,
          confidence: 80
        };
      } else if (trimmed.toLowerCase().includes('warning') ||
                 trimmed.toLowerCase().includes('issue')) {
        if (currentIssue) issues.push(currentIssue as VisualIssue);
        currentIssue = {
          type: 'styling',
          severity: 'medium',
          description: trimmed,
          confidence: 70
        };
      } else if (trimmed.toLowerCase().includes('recommend') ||
                 trimmed.toLowerCase().includes('suggest')) {
        recommendations.push(trimmed);
      }
    }

    if (currentIssue) issues.push(currentIssue as VisualIssue);

    return {
      success: true,
      issues,
      summary: text,
      overallScore: Math.max(0, 100 - (issues.length * 10)),
      recommendations,
      geminiResponse: text,
      analysisTime: 0
    };
  }

  private parseRegressionResponse(text: string): VisualRegressionResult {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]);
        return {
          hasRegression: parsed.hasRegression ?? false,
          differences: parsed.differences || [],
          summary: parsed.summary || text,
          confidence: parsed.confidence || 0
        };
      }
    } catch (error) {
      console.error('Failed to parse regression response:', error);
    }

    return {
      hasRegression: text.toLowerCase().includes('regression') || text.toLowerCase().includes('different'),
      differences: [],
      summary: text,
      confidence: 50
    };
  }

  private parseComponentAnalysis(text: string): { isRenderedCorrectly: boolean; issues: string[]; suggestions: string[] } {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Failed to parse component analysis:', error);
    }

    return {
      isRenderedCorrectly: !text.toLowerCase().includes('issue') && !text.toLowerCase().includes('problem'),
      issues: [],
      suggestions: []
    };
  }

  private parseResponsiveAnalysis(analyses: Array<{ viewport: string; response: string }>): {
    isResponsive: boolean;
    issues: Array<{ viewport: string; problems: string[] }>;
    score: number;
  } {
    const issues = analyses.map(({ viewport, response }) => {
      const problems: string[] = [];

      if (response.toLowerCase().includes('issue') || response.toLowerCase().includes('problem')) {
        const lines = response.split('\n').filter(l =>
          l.toLowerCase().includes('issue') ||
          l.toLowerCase().includes('problem') ||
          l.toLowerCase().includes('error')
        );
        problems.push(...lines.map(l => l.trim()));
      }

      return { viewport, problems };
    });

    const totalIssues = issues.reduce((sum, i) => sum + i.problems.length, 0);

    return {
      isResponsive: totalIssues === 0,
      issues,
      score: Math.max(0, 100 - (totalIssues * 10))
    };
  }

  private parseAccessibilityAnalysis(text: string): {
    issues: Array<{
      type: 'contrast' | 'size' | 'spacing' | 'focus' | 'alt-text';
      description: string;
      wcagLevel: 'A' | 'AA' | 'AAA';
      suggestion: string;
    }>;
    score: number;
    summary: string;
  } {
    try {
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.error('Failed to parse accessibility analysis:', error);
    }

    return {
      issues: [],
      score: 100,
      summary: text
    };
  }
}

// Singleton instance
export const geminiScreenCaptureService = new GeminiScreenCaptureService();

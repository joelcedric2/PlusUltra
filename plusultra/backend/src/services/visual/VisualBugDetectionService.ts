/**
 * VisualBugDetectionService.ts
 * Captures screenshots and detects visual bugs using Puppeteer + Gemini
 */

import puppeteer, { Browser, Page } from 'puppeteer';
import * as fs from 'fs';
import * as path from 'path';
import { geminiScreenCaptureService, ScreenAnalysisResult, VisualIssue } from './GeminiScreenCaptureService';
import pixelmatch from 'pixelmatch';
import { PNG } from 'pngjs';
import sharp from 'sharp';

export interface ScreenshotOptions {
  url: string;
  viewport?: { width: number; height: number };
  waitForSelector?: string;
  waitForTimeout?: number;
  fullPage?: boolean;
  screenshotPath?: string;
}

export interface VisualBugReport {
  url: string;
  timestamp: Date;
  screenshotPath: string;
  analysisResult: ScreenAnalysisResult;
  pixelDiffCount?: number;
  diffPercentage?: number;
  diffImagePath?: string;
}

export interface VisualRegressionTest {
  testName: string;
  baselineScreenshot: string;
  currentScreenshot: string;
  hasFailed: boolean;
  pixelDifference: number;
  diffPercentage: number;
  diffImagePath: string;
  geminiAnalysis?: any;
}

export class VisualBugDetectionService {
  private browser: Browser | null = null;
  private readonly SCREENSHOTS_DIR = path.join(process.cwd(), 'tmp', 'screenshots');
  private readonly BASELINE_DIR = path.join(process.cwd(), 'tmp', 'baselines');
  private readonly DIFF_DIR = path.join(process.cwd(), 'tmp', 'diffs');

  constructor() {
    this.ensureDirectories();
  }

  /**
   * Initialize browser instance
   */
  private async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu'
        ]
      });
    }
    return this.browser;
  }

  /**
   * Capture screenshot of a URL
   */
  async captureScreenshot(options: ScreenshotOptions): Promise<string> {
    const browser = await this.getBrowser();
    const page = await browser.newPage();

    try {
      // Set viewport
      if (options.viewport) {
        await page.setViewport(options.viewport);
      } else {
        await page.setViewport({ width: 1920, height: 1080 });
      }

      // Navigate to URL
      await page.goto(options.url, { waitUntil: 'networkidle2', timeout: 30000 });

      // Wait for specific selector if provided
      if (options.waitForSelector) {
        await page.waitForSelector(options.waitForSelector, { timeout: 10000 });
      }

      // Additional wait if specified
      if (options.waitForTimeout) {
        await new Promise(resolve => setTimeout(resolve, options.waitForTimeout));
      }

      // Generate screenshot path
      const timestamp = Date.now();
      const screenshotPath = options.screenshotPath ||
        path.join(this.SCREENSHOTS_DIR, `screenshot-${timestamp}.png`);

      // Take screenshot
      await page.screenshot({
        path: screenshotPath as `${string}.png`,
        fullPage: options.fullPage ?? true
      });

      return screenshotPath;

    } finally {
      await page.close();
    }
  }

  /**
   * Capture and analyze a URL for visual bugs
   */
  async detectVisualBugs(options: ScreenshotOptions & {
    expectedBehavior?: string;
    errorMessage?: string;
  }): Promise<VisualBugReport> {
    // Capture screenshot
    const screenshotPath = await this.captureScreenshot(options);

    // Analyze with Gemini
    const analysisResult = await geminiScreenCaptureService.analyzeScreenshot({
      imagePath: screenshotPath,
      prompt: 'Analyze this screenshot for visual bugs, layout issues, and UI problems.',
      context: {
        expectedBehavior: options.expectedBehavior,
        errorMessage: options.errorMessage,
        url: options.url,
        viewport: options.viewport
      }
    });

    return {
      url: options.url,
      timestamp: new Date(),
      screenshotPath,
      analysisResult
    };
  }

  /**
   * Run visual regression test
   */
  async runVisualRegressionTest(
    testName: string,
    url: string,
    options?: {
      viewport?: { width: number; height: number };
      threshold?: number; // 0-1, default 0.1 (10% difference triggers failure)
      updateBaseline?: boolean;
    }
  ): Promise<VisualRegressionTest> {
    const threshold = options?.threshold ?? 0.1;

    // Capture current screenshot
    const currentScreenshot = await this.captureScreenshot({
      url,
      viewport: options?.viewport,
      screenshotPath: path.join(this.SCREENSHOTS_DIR, `${testName}-current.png`)
    });

    // Check if baseline exists
    const baselineScreenshot = path.join(this.BASELINE_DIR, `${testName}-baseline.png`);

    if (!fs.existsSync(baselineScreenshot) || options?.updateBaseline) {
      // Create baseline
      fs.copyFileSync(currentScreenshot, baselineScreenshot);
      return {
        testName,
        baselineScreenshot,
        currentScreenshot,
        hasFailed: false,
        pixelDifference: 0,
        diffPercentage: 0,
        diffImagePath: ''
      };
    }

    // Compare screenshots
    const comparison = await this.compareScreenshots(
      baselineScreenshot,
      currentScreenshot,
      testName
    );

    // If difference exceeds threshold, analyze with Gemini
    let geminiAnalysis;
    if (comparison.diffPercentage > threshold) {
      geminiAnalysis = await geminiScreenCaptureService.detectVisualRegression(
        baselineScreenshot,
        currentScreenshot,
        { changeDescription: `Visual regression test for ${testName}` }
      );
    }

    return {
      testName,
      baselineScreenshot,
      currentScreenshot,
      hasFailed: comparison.diffPercentage > threshold,
      pixelDifference: comparison.pixelDiff,
      diffPercentage: comparison.diffPercentage,
      diffImagePath: comparison.diffImagePath,
      geminiAnalysis
    };
  }

  /**
   * Compare two screenshots pixel by pixel
   */
  async compareScreenshots(
    baselinePath: string,
    currentPath: string,
    testName: string
  ): Promise<{
    pixelDiff: number;
    diffPercentage: number;
    diffImagePath: string;
  }> {
    // Read images
    const baseline = PNG.sync.read(fs.readFileSync(baselinePath));
    const current = PNG.sync.read(fs.readFileSync(currentPath));

    // Ensure same dimensions
    if (baseline.width !== current.width || baseline.height !== current.height) {
      // Resize current to match baseline
      const resizedBuffer = await sharp(currentPath)
        .resize(baseline.width, baseline.height)
        .png()
        .toBuffer();

      current.data = PNG.sync.read(resizedBuffer).data;
      current.width = baseline.width;
      current.height = baseline.height;
    }

    // Create diff image
    const diff = new PNG({ width: baseline.width, height: baseline.height });

    // Compare pixels
    const pixelDiff = pixelmatch(
      baseline.data,
      current.data,
      diff.data,
      baseline.width,
      baseline.height,
      { threshold: 0.1 }
    );

    // Save diff image
    const diffImagePath = path.join(this.DIFF_DIR, `${testName}-diff.png`);
    fs.writeFileSync(diffImagePath, PNG.sync.write(diff));

    const totalPixels = baseline.width * baseline.height;
    const diffPercentage = (pixelDiff / totalPixels) * 100;

    return {
      pixelDiff,
      diffPercentage,
      diffImagePath
    };
  }

  /**
   * Capture screenshots across multiple viewports
   */
  async captureResponsiveScreenshots(url: string): Promise<Array<{
    viewport: string;
    screenshotPath: string;
    dimensions: { width: number; height: number };
  }>> {
    const viewports = [
      { name: 'mobile', width: 375, height: 667 },
      { name: 'tablet', width: 768, height: 1024 },
      { name: 'desktop', width: 1920, height: 1080 },
      { name: 'desktop-large', width: 2560, height: 1440 }
    ];

    const screenshots = [];

    for (const viewport of viewports) {
      const screenshotPath = await this.captureScreenshot({
        url,
        viewport: { width: viewport.width, height: viewport.height },
        screenshotPath: path.join(
          this.SCREENSHOTS_DIR,
          `${viewport.name}-${Date.now()}.png`
        )
      });

      screenshots.push({
        viewport: viewport.name,
        screenshotPath,
        dimensions: { width: viewport.width, height: viewport.height }
      });
    }

    return screenshots;
  }

  /**
   * Test responsive design with Gemini analysis
   */
  async testResponsiveDesign(url: string): Promise<{
    isResponsive: boolean;
    screenshots: Array<{ viewport: string; path: string }>;
    analysis: any;
  }> {
    // Capture screenshots
    const screenshots = await this.captureResponsiveScreenshots(url);

    // Analyze with Gemini
    const analysis = await geminiScreenCaptureService.validateResponsiveDesign(
      screenshots.map(s => ({
        viewport: s.viewport,
        image: s.screenshotPath
      })),
      url
    );

    return {
      isResponsive: analysis.isResponsive,
      screenshots: screenshots.map(s => ({
        viewport: s.viewport,
        path: s.screenshotPath
      })),
      analysis
    };
  }

  /**
   * Capture screenshot of Docker sandbox preview
   */
  async captureSandboxPreview(
    sandboxId: string,
    previewPort: number
  ): Promise<string> {
    const url = `http://localhost:${previewPort}`;

    try {
      const screenshotPath = await this.captureScreenshot({
        url,
        viewport: { width: 1920, height: 1080 },
        waitForTimeout: 2000, // Wait for app to load
        screenshotPath: path.join(
          this.SCREENSHOTS_DIR,
          `sandbox-${sandboxId}-${Date.now()}.png`
        )
      });

      return screenshotPath;
    } catch (error) {
      console.error('Failed to capture sandbox preview:', error);
      throw error;
    }
  }

  /**
   * Monitor sandbox for visual changes
   */
  async monitorSandboxVisualChanges(
    sandboxId: string,
    previewPort: number,
    intervalMs: number = 5000
  ): Promise<NodeJS.Timeout> {
    let previousScreenshot: string | null = null;

    const interval = setInterval(async () => {
      try {
        const currentScreenshot = await this.captureSandboxPreview(sandboxId, previewPort);

        if (previousScreenshot) {
          const comparison = await this.compareScreenshots(
            previousScreenshot,
            currentScreenshot,
            `sandbox-${sandboxId}`
          );

          // If significant change detected (>5%), analyze with Gemini
          if (comparison.diffPercentage > 5) {
            console.log(`Visual change detected in sandbox ${sandboxId}: ${comparison.diffPercentage.toFixed(2)}%`);

            const analysis = await geminiScreenCaptureService.detectVisualRegression(
              previousScreenshot,
              currentScreenshot,
              { changeDescription: `Sandbox ${sandboxId} visual change` }
            );

            // Emit event or notify (integrate with notification system)
            if (analysis.hasRegression) {
              console.warn('Potential visual regression detected:', analysis.summary);
            }
          }
        }

        previousScreenshot = currentScreenshot;

      } catch (error) {
        console.error('Sandbox monitoring error:', error);
      }
    }, intervalMs);

    return interval;
  }

  /**
   * Test accessibility of a page
   */
  async testAccessibility(url: string): Promise<{
    screenshotPath: string;
    issues: any[];
    score: number;
    summary: string;
  }> {
    const screenshotPath = await this.captureScreenshot({ url });

    const analysis = await geminiScreenCaptureService.detectAccessibilityIssues(
      screenshotPath
    );

    return {
      screenshotPath,
      ...analysis
    };
  }

  /**
   * Analyze component rendering
   */
  async analyzeComponentInSandbox(
    sandboxId: string,
    previewPort: number,
    componentName: string,
    expectedProps?: Record<string, any>
  ): Promise<{
    screenshotPath: string;
    isRenderedCorrectly: boolean;
    issues: string[];
    suggestions: string[];
  }> {
    const screenshotPath = await this.captureSandboxPreview(sandboxId, previewPort);

    const analysis = await geminiScreenCaptureService.analyzeComponentRendering(
      screenshotPath,
      componentName,
      expectedProps
    );

    return {
      screenshotPath,
      ...analysis
    };
  }

  /**
   * Cleanup old screenshots
   */
  async cleanup(olderThanMs: number = 24 * 60 * 60 * 1000): Promise<number> {
    let deletedCount = 0;
    const now = Date.now();

    const dirs = [this.SCREENSHOTS_DIR, this.DIFF_DIR];

    for (const dir of dirs) {
      const files = fs.readdirSync(dir);

      for (const file of files) {
        const filePath = path.join(dir, file);
        const stats = fs.statSync(filePath);

        if (now - stats.mtimeMs > olderThanMs) {
          fs.unlinkSync(filePath);
          deletedCount++;
        }
      }
    }

    return deletedCount;
  }

  /**
   * Close browser
   */
  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Ensure screenshot directories exist
   */
  private ensureDirectories(): void {
    const dirs = [this.SCREENSHOTS_DIR, this.BASELINE_DIR, this.DIFF_DIR];

    for (const dir of dirs) {
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }
  }
}

// Singleton instance
export const visualBugDetectionService = new VisualBugDetectionService();

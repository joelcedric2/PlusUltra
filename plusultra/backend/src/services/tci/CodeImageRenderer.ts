/**
 * Code Image Renderer
 *
 * Converts code to syntax-highlighted images for visual pattern analysis by DeepSeek OCR.
 *
 * Why images?
 * - Visual patterns (density, color, asymmetry) are easier to detect in rendered code
 * - Syntax highlighting reveals semantic issues through color patterns
 * - Indentation and structure are visually apparent
 */

import puppeteer, { Browser, Page } from 'puppeteer';

// @ts-ignore - prismjs doesn't have types
const Prism = require('prismjs');
require('prismjs/components/prism-typescript');
require('prismjs/components/prism-javascript');
require('prismjs/components/prism-python');
require('prismjs/components/prism-go');
require('prismjs/components/prism-rust');
import type { CodeImage } from '../../types/tci';

export interface RenderOptions {
  language: string; // 'typescript' | 'javascript' | 'python' | 'go' | 'rust'
  theme?: 'github' | 'dracula' | 'monokai' | 'vscode';
  fontSize?: number;
  lineNumbers?: boolean;
  width?: number;
  highlightLines?: number[]; // Lines to highlight
}

export class CodeImageRenderer {
  private browser: Browser | null = null;

  /**
   * Initialize Puppeteer browser (reuse across requests)
   */
  async initialize(): Promise<void> {
    if (!this.browser) {
      this.browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
      });
    }
  }

  /**
   * Close browser when shutting down
   */
  async cleanup(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }

  /**
   * Render code to image
   */
  async renderCodeToImage(code: string, options: RenderOptions): Promise<CodeImage> {
    await this.initialize();

    if (!this.browser) {
      throw new Error('Browser failed to initialize');
    }

    const page = await this.browser.newPage();

    try {
      // Set viewport (wider for code)
      await page.setViewport({
        width: options.width || 1200,
        height: 1200, // Will auto-adjust based on content
        deviceScaleFactor: 2, // Retina quality
      });

      // Generate syntax-highlighted HTML
      const html = this.generateHTML(code, options);

      // Render HTML
      await page.setContent(html, { waitUntil: 'networkidle0' });

      // Get actual content height
      const contentHeight = await page.evaluate(() => {
        const element = (globalThis as any).document?.getElementById('code-container');
        return element ? element.offsetHeight : 1200;
      });

      // Adjust viewport to content
      await page.setViewport({
        width: options.width || 1200,
        height: Math.min(contentHeight + 40, 4000), // Max 4000px
        deviceScaleFactor: 2,
      });

      // Take screenshot
      const screenshot = await page.screenshot({
        type: 'png',
        fullPage: false,
      });

      return {
        buffer: Buffer.from(screenshot),
        width: options.width || 1200,
        height: contentHeight,
        format: 'png',
      };
    } finally {
      await page.close();
    }
  }

  /**
   * Generate HTML with syntax highlighting
   */
  private generateHTML(code: string, options: RenderOptions): string {
    const {
      language = 'typescript',
      theme = 'github',
      fontSize = 14,
      lineNumbers = true,
      highlightLines = [],
    } = options;

    // Syntax highlight code
    const grammar = this.getPrismGrammar(language);
    const highlighted = Prism.highlight(code, grammar, language);

    // Split into lines
    const lines = highlighted.split('\n');

    // Generate line HTML
    const lineHTML = lines
      .map((line: any, index: any) => {
        const lineNumber = index + 1;
        const isHighlighted = highlightLines.includes(lineNumber);
        return `
        <div class="code-line ${isHighlighted ? 'highlighted' : ''}" data-line="${lineNumber}">
          ${lineNumbers ? `<span class="line-number">${lineNumber}</span>` : ''}
          <span class="line-content">${line || ' '}</span>
        </div>
      `;
      })
      .join('');

    const themeCSS = this.getThemeCSS(theme);

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <style>
          * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
          }

          body {
            font-family: 'Monaco', 'Menlo', 'Ubuntu Mono', 'Courier New', monospace;
            font-size: ${fontSize}px;
            line-height: 1.5;
            padding: 20px;
            ${themeCSS.body}
          }

          #code-container {
            ${themeCSS.container}
            padding: 20px;
            border-radius: 8px;
            overflow-x: auto;
          }

          .code-line {
            display: flex;
            min-height: 1.5em;
          }

          .code-line.highlighted {
            background-color: ${themeCSS.highlightBackground};
          }

          .line-number {
            display: inline-block;
            width: 50px;
            text-align: right;
            padding-right: 15px;
            user-select: none;
            ${themeCSS.lineNumber}
          }

          .line-content {
            flex: 1;
            white-space: pre;
            tab-size: 2;
          }

          /* Prism Syntax Highlighting */
          ${themeCSS.syntax}
        </style>
      </head>
      <body>
        <div id="code-container">
          ${lineHTML}
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Get Prism grammar for language
   */
  private getPrismGrammar(language: string): any {
    const grammarMap: Record<string, any> = {
      typescript: Prism.languages.typescript,
      javascript: Prism.languages.javascript,
      python: Prism.languages.python,
      go: Prism.languages.go,
      rust: Prism.languages.rust,
    };

    return grammarMap[language] || Prism.languages.typescript;
  }

  /**
   * Get theme CSS
   */
  private getThemeCSS(theme: string): {
    body: string;
    container: string;
    lineNumber: string;
    highlightBackground: string;
    syntax: string;
  } {
    const themes = {
      github: {
        body: 'background: #ffffff; color: #24292e;',
        container: 'background: #f6f8fa; border: 1px solid #e1e4e8;',
        lineNumber: 'color: #6a737d;',
        highlightBackground: 'rgba(255, 255, 0, 0.1);',
        syntax: `
          .token.comment, .token.prolog, .token.doctype, .token.cdata { color: #6a737d; }
          .token.punctuation { color: #24292e; }
          .token.property, .token.tag, .token.boolean, .token.number, .token.constant, .token.symbol, .token.deleted { color: #005cc5; }
          .token.selector, .token.attr-name, .token.string, .token.char, .token.builtin, .token.inserted { color: #032f62; }
          .token.operator, .token.entity, .token.url { color: #d73a49; }
          .token.atrule, .token.attr-value, .token.keyword { color: #d73a49; }
          .token.function, .token.class-name { color: #6f42c1; }
          .token.regex, .token.important, .token.variable { color: #e36209; }
        `,
      },
      dracula: {
        body: 'background: #282a36; color: #f8f8f2;',
        container: 'background: #282a36; border: 1px solid #44475a;',
        lineNumber: 'color: #6272a4;',
        highlightBackground: 'rgba(255, 184, 108, 0.1);',
        syntax: `
          .token.comment, .token.prolog, .token.doctype, .token.cdata { color: #6272a4; }
          .token.punctuation { color: #f8f8f2; }
          .token.property, .token.tag, .token.boolean, .token.number, .token.constant, .token.symbol, .token.deleted { color: #bd93f9; }
          .token.selector, .token.attr-name, .token.string, .token.char, .token.builtin, .token.inserted { color: #f1fa8c; }
          .token.operator, .token.entity, .token.url { color: #ff79c6; }
          .token.atrule, .token.attr-value, .token.keyword { color: #ff79c6; }
          .token.function, .token.class-name { color: #50fa7b; }
          .token.regex, .token.important, .token.variable { color: #ffb86c; }
        `,
      },
      monokai: {
        body: 'background: #272822; color: #f8f8f2;',
        container: 'background: #272822; border: 1px solid #49483e;',
        lineNumber: 'color: #75715e;',
        highlightBackground: 'rgba(255, 255, 255, 0.1);',
        syntax: `
          .token.comment, .token.prolog, .token.doctype, .token.cdata { color: #75715e; }
          .token.punctuation { color: #f8f8f2; }
          .token.property, .token.tag, .token.boolean, .token.number, .token.constant, .token.symbol, .token.deleted { color: #ae81ff; }
          .token.selector, .token.attr-name, .token.string, .token.char, .token.builtin, .token.inserted { color: #e6db74; }
          .token.operator, .token.entity, .token.url { color: #f92672; }
          .token.atrule, .token.attr-value, .token.keyword { color: #f92672; }
          .token.function, .token.class-name { color: #a6e22e; }
          .token.regex, .token.important, .token.variable { color: #fd971f; }
        `,
      },
      vscode: {
        body: 'background: #1e1e1e; color: #d4d4d4;',
        container: 'background: #1e1e1e; border: 1px solid #3e3e3e;',
        lineNumber: 'color: #858585;',
        highlightBackground: 'rgba(255, 255, 255, 0.1);',
        syntax: `
          .token.comment, .token.prolog, .token.doctype, .token.cdata { color: #6a9955; }
          .token.punctuation { color: #d4d4d4; }
          .token.property, .token.tag, .token.boolean, .token.number, .token.constant, .token.symbol, .token.deleted { color: #b5cea8; }
          .token.selector, .token.attr-name, .token.string, .token.char, .token.builtin, .token.inserted { color: #ce9178; }
          .token.operator, .token.entity, .token.url { color: #d4d4d4; }
          .token.atrule, .token.attr-value, .token.keyword { color: #569cd6; }
          .token.function, .token.class-name { color: #dcdcaa; }
          .token.regex, .token.important, .token.variable { color: #9cdcfe; }
        `,
      },
    };

    return themes[theme as keyof typeof themes] || themes.github;
  }

  /**
   * Analyze color distribution in rendered code (for pattern detection)
   */
  async analyzeColorDistribution(code: string, options: RenderOptions): Promise<{
    red: number; // Strings
    green: number; // Comments
    purple: number; // Keywords
    blue: number; // Functions/types
    orange: number; // Numbers/constants
    total: number;
  }> {
    const grammar = this.getPrismGrammar(options.language);
    const highlighted = Prism.highlight(code, grammar, options.language);

    // Count token types (colors)
    const colorCounts = {
      red: 0, // strings, operators
      green: 0, // comments
      purple: 0, // keywords
      blue: 0, // functions, properties
      orange: 0, // numbers, constants
      total: 0,
    };

    // Parse tokens
    const stringMatch = highlighted.match(/<span class="token string[^>]*>.*?<\/span>/g) || [];
    const commentMatch = highlighted.match(/<span class="token comment[^>]*>.*?<\/span>/g) || [];
    const keywordMatch = highlighted.match(/<span class="token keyword[^>]*>.*?<\/span>/g) || [];
    const functionMatch = highlighted.match(/<span class="token function[^>]*>.*?<\/span>/g) || [];
    const numberMatch = highlighted.match(/<span class="token number[^>]*>.*?<\/span>/g) || [];

    colorCounts.red = stringMatch.length;
    colorCounts.green = commentMatch.length;
    colorCounts.purple = keywordMatch.length;
    colorCounts.blue = functionMatch.length;
    colorCounts.orange = numberMatch.length;
    colorCounts.total = code.split('\n').length;

    return colorCounts;
  }
}

export const codeImageRenderer = new CodeImageRenderer();

import OpenAI from 'openai';

/**
 * Meta-Prompt Engine
 *
 * Transforms vague user requests into detailed, comprehensive specifications.
 * Uses GPT-5 to analyze user input and expand it with:
 * - Security requirements
 * - Edge cases
 * - Accessibility needs
 * - Performance considerations
 * - Library recommendations
 * - Error handling strategies
 * - Testing requirements
 *
 * This ensures all 5 AI models receive a detailed, unambiguous prompt
 * instead of making their own assumptions.
 */

export interface EnhancedRequirements {
  security: string[];
  edgeCases: string[];
  accessibility: string[];
  performance: string[];
  suggestedLibraries: string[];
  errorHandling: string[];
  testing: string[];
}

export interface CriticalQuestion {
  question: string;
  rationale: string;
  impact: 'HIGH' | 'MEDIUM' | 'LOW';
}

export interface EnhancedPrompt {
  originalRequest: string;
  expandedRequirements: EnhancedRequirements;
  criticalQuestions: CriticalQuestion[];
  enhancedPrompt: string;
  estimatedComplexity: 'TRIVIAL' | 'SIMPLE' | 'MODERATE' | 'COMPLEX' | 'VERY_COMPLEX';
  recommendedApproach: string;
  warnings: string[];
}

export class MetaPromptEngine {
  private openai: OpenAI;

  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    });
  }

  /**
   * Expand a user's request into a detailed specification
   */
  async expandPrompt(userRequest: string, context?: string): Promise<EnhancedPrompt> {
    const metaPrompt = this.buildMetaPrompt(userRequest, context);

    console.log('🔍 [MetaPromptEngine] Analyzing user request...');
    const startTime = Date.now();

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-4-turbo-preview', // GPT-5 when available
        messages: [
          {
            role: 'system',
            content: `You are an expert requirements analyst and software architect. Your job is to take vague user requests and expand them into comprehensive, production-ready specifications that will help AI code generators produce secure, robust, and well-tested code.

You MUST be thorough and consider:
- Security vulnerabilities (OWASP Top 10, injection attacks, XSS, CSRF, etc.)
- Edge cases and error states
- Accessibility (WCAG 2.1 AA compliance)
- Performance and scalability
- Modern, well-maintained libraries (avoid deprecated packages)
- Comprehensive error handling
- Test coverage requirements

Be CRITICAL and think like a senior engineer reviewing a junior's requirements doc.`,
          },
          {
            role: 'user',
            content: metaPrompt,
          },
        ],
        response_format: { type: 'json_object' },
        temperature: 0.3, // Lower temperature for more consistent analysis
      });

      const responseTime = Date.now() - startTime;
      console.log(`✅ [MetaPromptEngine] Analysis complete in ${responseTime}ms`);

      const result = JSON.parse(response.choices[0].message.content || '{}');
      return this.validateAndStructure(result, userRequest);
    } catch (error) {
      console.error('❌ [MetaPromptEngine] Failed to expand prompt:', error);

      // Fallback: return enhanced prompt with minimal requirements
      return this.createFallbackPrompt(userRequest);
    }
  }

  /**
   * Build the meta-prompt that asks GPT to analyze the user's request
   */
  private buildMetaPrompt(userRequest: string, context?: string): string {
    return `
A user has requested the following:

"${userRequest}"

${context ? `\nAdditional context:\n${context}` : ''}

Your task is to expand this into a detailed, production-ready specification. Analyze the request and provide:

1. **Security Requirements**: What security measures are needed? Consider:
   - Authentication/authorization
   - Input validation and sanitization
   - Protection against XSS, CSRF, SQL injection, etc.
   - Secure storage (hashing, encryption)
   - Rate limiting
   - HTTPS enforcement

2. **Edge Cases**: What error states and edge cases must be handled?
   - Empty/null inputs
   - Invalid data formats
   - Network failures
   - Loading states
   - Race conditions
   - Boundary conditions

3. **Accessibility**: What accessibility features are required?
   - Semantic HTML
   - ARIA labels and roles
   - Keyboard navigation
   - Screen reader support
   - Color contrast
   - Focus management

4. **Performance**: What performance considerations exist?
   - Optimization opportunities
   - Caching strategies
   - Lazy loading
   - Code splitting
   - Database query optimization
   - API response time

5. **Suggested Libraries**: What modern, well-maintained libraries should be used?
   - Prefer popular, actively maintained packages
   - Avoid deprecated or unmaintained libraries
   - Consider bundle size
   - TypeScript support

6. **Error Handling**: How should errors be handled?
   - User-friendly error messages
   - Logging strategy (without exposing sensitive data)
   - Retry logic
   - Graceful degradation
   - Fallback UI

7. **Testing**: What should be tested?
   - Unit tests
   - Integration tests
   - E2E tests
   - Edge case coverage
   - Mock strategies

8. **Critical Questions**: What questions should be asked to clarify requirements?
   - Ambiguities in the request
   - Missing information
   - Potential architectural decisions

Respond in the following JSON format:
{
  "expandedRequirements": {
    "security": ["requirement 1", "requirement 2", ...],
    "edgeCases": ["case 1", "case 2", ...],
    "accessibility": ["requirement 1", "requirement 2", ...],
    "performance": ["consideration 1", "consideration 2", ...],
    "suggestedLibraries": ["library1 - purpose", "library2 - purpose", ...],
    "errorHandling": ["strategy 1", "strategy 2", ...],
    "testing": ["test 1", "test 2", ...]
  },
  "criticalQuestions": [
    {
      "question": "Question text",
      "rationale": "Why this matters",
      "impact": "HIGH" | "MEDIUM" | "LOW"
    }
  ],
  "enhancedPrompt": "A detailed, comprehensive prompt that incorporates all of the above into a clear specification that AI code generators can follow. This should be 3-5 paragraphs and include specific technical requirements.",
  "estimatedComplexity": "TRIVIAL" | "SIMPLE" | "MODERATE" | "COMPLEX" | "VERY_COMPLEX",
  "recommendedApproach": "Brief description of the recommended technical approach",
  "warnings": ["Warning 1 about potential issues", "Warning 2", ...]
}

Be thorough and think critically. Production code depends on this analysis.
`.trim();
  }

  /**
   * Validate and structure the response from GPT
   */
  private validateAndStructure(raw: any, originalRequest: string): EnhancedPrompt {
    return {
      originalRequest,
      expandedRequirements: {
        security: raw.expandedRequirements?.security || [],
        edgeCases: raw.expandedRequirements?.edgeCases || [],
        accessibility: raw.expandedRequirements?.accessibility || [],
        performance: raw.expandedRequirements?.performance || [],
        suggestedLibraries: raw.expandedRequirements?.suggestedLibraries || [],
        errorHandling: raw.expandedRequirements?.errorHandling || [],
        testing: raw.expandedRequirements?.testing || [],
      },
      criticalQuestions: raw.criticalQuestions || [],
      enhancedPrompt: raw.enhancedPrompt || this.createSimpleEnhancedPrompt(originalRequest),
      estimatedComplexity: raw.estimatedComplexity || 'MODERATE',
      recommendedApproach: raw.recommendedApproach || 'Standard implementation',
      warnings: raw.warnings || [],
    };
  }

  /**
   * Create a fallback prompt if meta-prompting fails
   */
  private createFallbackPrompt(userRequest: string): EnhancedPrompt {
    return {
      originalRequest: userRequest,
      expandedRequirements: {
        security: ['Implement input validation', 'Use secure authentication'],
        edgeCases: ['Handle null/empty inputs', 'Handle network errors'],
        accessibility: ['Use semantic HTML', 'Add ARIA labels'],
        performance: ['Optimize for performance'],
        suggestedLibraries: [],
        errorHandling: ['Display user-friendly errors', 'Log errors for debugging'],
        testing: ['Write unit tests', 'Test edge cases'],
      },
      criticalQuestions: [],
      enhancedPrompt: this.createSimpleEnhancedPrompt(userRequest),
      estimatedComplexity: 'MODERATE',
      recommendedApproach: 'Standard implementation with best practices',
      warnings: ['Meta-prompt analysis failed - using basic requirements'],
    };
  }

  /**
   * Create a simple enhanced prompt from the original request
   */
  private createSimpleEnhancedPrompt(userRequest: string): string {
    return `${userRequest}

Requirements:
- Implement with production-ready code
- Include proper error handling
- Ensure accessibility compliance
- Add input validation
- Use modern, well-maintained libraries
- Write clean, well-commented TypeScript code
- Include test coverage`;
  }

  /**
   * Determine if a request is simple enough to skip meta-prompting
   */
  shouldSkipMetaPrompt(userRequest: string): boolean {
    const trivialPatterns = [
      /^create a button$/i,
      /^make a (div|span|p|h\d)$/i,
      /^add (padding|margin|color|background)$/i,
      /^change (text|color|size)$/i,
    ];

    return trivialPatterns.some((pattern) => pattern.test(userRequest.trim()));
  }
}

export const metaPromptEngine = new MetaPromptEngine();

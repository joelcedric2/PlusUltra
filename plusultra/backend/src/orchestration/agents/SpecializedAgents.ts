import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BaseAgent, AgentTask, AgentResult } from './BaseAgents';
import { SystemMessage, HumanMessage } from '@langchain/core/messages';

/**
 * Configuration for specialized agents
 */
export interface AgentConfig {
  maxRetries: number;
  timeoutMs: number;
  enableMetrics: boolean;
  enableCaching: boolean;
  cacheTTL: number; // in seconds
  rateLimitPerMinute: number;
  enableValidation: boolean;
  maxInputLength: number;
}

/**
 * Performance metrics for agent execution
 */
export interface AgentMetrics {
  executionTimeMs: number;
  tokensUsed: number;
  modelName: string;
  success: boolean;
  errorType?: string;
  retryCount: number;
}

/**
 * UX Reviewer Agent - Production-grade accessibility and UX evaluation
 */
export class UXReviewerAgent extends BaseAgent {
  private config: AgentConfig;
  private metrics: Map<string, AgentMetrics[]> = new Map();
  private requestCount = 0;
  private lastRequestTime = 0;

  constructor(model: BaseChatModel, config?: Partial<AgentConfig>) {
    super(
      model,
      'UXReviewerAgent',
      'Expert UX reviewer focusing on accessibility, usability, and user experience design',
      ['ux_review', 'accessibility', 'usability', 'user_experience', 'wcag', 'ui_design']
    );

    this.config = {
      maxRetries: 3,
      timeoutMs: 30000,
      enableMetrics: true,
      enableCaching: false,
      cacheTTL: 300,
      rateLimitPerMinute: 60,
      enableValidation: true,
      maxInputLength: 10000,
      ...config,
    };
  }

  /**
   * Validate input before processing
   */
  private validateInput(task: AgentTask): void {
    if (!task.description || task.description.trim().length === 0) {
      throw new Error('Task description is required');
    }

    if (this.config.enableValidation && task.description.length > this.config.maxInputLength) {
      throw new Error(`Input too long. Maximum length: ${this.config.maxInputLength} characters`);
    }

    // Rate limiting check
    const now = Date.now();
    if (now - this.lastRequestTime < 60000 / this.config.rateLimitPerMinute) {
      throw new Error('Rate limit exceeded. Please wait before making another request');
    }
    this.lastRequestTime = now;
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    const startTime = Date.now();
    let retryCount = 0;

    // Input validation
    try {
      this.validateInput(task);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Input validation failed',
        suggestions: ['Check input requirements', 'Reduce input length', 'Wait before retrying'],
      };
    }

    while (retryCount <= this.config.maxRetries) {
      try {
        const prompt = `
You are a senior UX designer and accessibility expert. Review this code/interface for:

1. **Accessibility (WCAG 2.1 AA compliance)**:
   - Screen reader compatibility
   - Keyboard navigation
   - Color contrast ratios
   - Focus management
   - Alternative text for images

2. **Usability & UX**:
   - User flow clarity
   - Error handling UX
   - Loading states
   - Responsive design
   - Touch targets (mobile)

3. **User Experience**:
   - Cognitive load
   - Information hierarchy
   - Visual feedback
   - Error prevention

Code/Context: ${task.description}

Provide:
- **Accessibility score** (1-10)
- **Critical issues** that must be fixed
- **Improvements** for better UX
- **Best practices** implemented well
- **Specific code suggestions** with examples

Format your response as structured recommendations.
`;

        // Set up timeout
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error('Request timeout')), this.config.timeoutMs);
        });

        const responsePromise = this.model.invoke([
          new SystemMessage('You are a senior UX designer with expertise in accessibility, mobile design, and user experience research.'),
          new HumanMessage(prompt)
        ]);

        const response = await Promise.race([responsePromise, timeoutPromise]);

        const executionTime = Date.now() - startTime;

        // Record metrics if enabled
        if (this.config.enableMetrics) {
          this.recordMetrics(task.type, {
            executionTimeMs: executionTime,
            tokensUsed: (response as any).usage_metadata?.total_tokens || 0,
            modelName: this.model.constructor?.name || 'Unknown',
            success: true,
            retryCount,
          });
        }

        return {
          success: true,
          output: response.content as string,
          metadata: {
            generatedAt: new Date().toISOString(),
            model: this.model.constructor?.name || 'Unknown',
            reviewType: 'ux_accessibility',
            tokensUsed: (response as any).usage_metadata?.total_tokens || 0,
            executionTimeMs: executionTime,
            retryCount,
          }
        };

      } catch (error) {
        retryCount++;

        if (retryCount > this.config.maxRetries) {
          const executionTime = Date.now() - startTime;

          // Record failed metrics if enabled
          if (this.config.enableMetrics) {
            this.recordMetrics(task.type, {
              executionTimeMs: executionTime,
              tokensUsed: 0,
              modelName: this.model.constructor?.name || 'Unknown',
              success: false,
              errorType: error instanceof Error ? error.constructor.name : 'Unknown',
              retryCount,
            });
          }

          return {
            success: false,
            error: error instanceof Error ? error.message : 'UX review failed',
            suggestions: [
              'Provide more UI code',
              'Include design specifications',
              'Share user personas',
              'Check network connectivity',
              'Verify model availability'
            ],
            metadata: {
              executionTimeMs: executionTime,
              retryCount,
              errorType: error instanceof Error ? error.constructor.name : 'Unknown',
            }
          };
        }

        // Wait before retry
        await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
      }
    }

    // This should never be reached, but TypeScript requires it
    return {
      success: false,
      error: 'Unexpected execution path',
      suggestions: ['Contact support if this persists'],
    };
  }

  /**
   * Get performance metrics for this agent
   */
  getMetrics(taskType?: string): AgentMetrics[] {
    if (taskType) {
      return this.metrics.get(taskType) || [];
    }

    const allMetrics: AgentMetrics[] = [];
    for (const metrics of Array.from(this.metrics.values())) {
      allMetrics.push(...metrics);
    }
    return allMetrics;
  }

  /**
   * Get agent statistics
   */
  getStats(): {
    totalRequests: number;
    successRate: number;
    avgExecutionTime: number;
    avgTokensUsed: number;
  } {
    const allMetrics = this.getMetrics();
    const successfulMetrics = allMetrics.filter(m => m.success);

    return {
      totalRequests: allMetrics.length,
      successRate: allMetrics.length > 0 ? successfulMetrics.length / allMetrics.length : 0,
      avgExecutionTime: allMetrics.length > 0
        ? allMetrics.reduce((sum, m) => sum + m.executionTimeMs, 0) / allMetrics.length
        : 0,
      avgTokensUsed: successfulMetrics.length > 0
        ? successfulMetrics.reduce((sum, m) => sum + m.tokensUsed, 0) / successfulMetrics.length
        : 0,
    };
  }

  /**
   * Record performance metrics
   */
  private recordMetrics(taskType: string, metrics: AgentMetrics): void {
    if (!this.metrics.has(taskType)) {
      this.metrics.set(taskType, []);
    }

    const taskMetrics = this.metrics.get(taskType)!;
    taskMetrics.push(metrics);

    // Keep only last 100 metrics per task type to prevent memory leaks
    if (taskMetrics.length > 100) {
      taskMetrics.shift();
    }
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    this.metrics.clear();
  }
}

/**
 * Compliance Agent - Multi-framework compliance checking
 */
export class ComplianceAgent extends BaseAgent {
  constructor(model: BaseChatModel) {
    super(
      model,
      'ComplianceAgent',
      'Legal and regulatory compliance expert for data privacy, security, and industry standards',
      ['gdpr', 'hipaa', 'pci', 'sox', 'data_privacy', 'security_compliance', 'audit_trails']
    );
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    try {
      const prompt = `
You are a compliance officer and legal expert. Review this code for:

1. **Data Privacy (GDPR/CCPA)**:
   - Personal data handling
   - Consent mechanisms
   - Data retention policies
   - Right to erasure implementation

2. **Security Compliance**:
   - Authentication/authorization
   - Data encryption at rest/transit
   - Audit logging
   - Access controls

3. **Industry Standards**:
   - HIPAA (healthcare data)
   - PCI DSS (payment data)
   - SOX (financial reporting)

4. **Export Controls & Sanctions**:
   - Restricted technology handling
   - Geographic data restrictions

Code/Context: ${task.description}

Provide:
- **Compliance risk level** (low/medium/high/critical)
- **Specific violations** found
- **Required remediation** steps
- **Documentation** requirements
- **Legal disclaimers** needed

Format as a compliance report with actionable recommendations.
`;

      const response = await this.model.invoke([
        new SystemMessage('You are a certified compliance officer with expertise in international data privacy laws, security standards, and regulatory frameworks.'),
        new HumanMessage(prompt)
      ]);

      return {
        success: true,
        output: response.content as string,
        metadata: {
          generatedAt: new Date().toISOString(),
          model: this.model.constructor?.name || 'Unknown',
          complianceFrameworks: ['GDPR', 'CCPA', 'HIPAA', 'PCI', 'SOX'],
          tokensUsed: (response as any).usage_metadata?.total_tokens || 0
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Compliance review failed',
        suggestions: ['Specify target regulations', 'Include data flow diagrams', 'Provide security requirements']
      };
    }
  }
}

/**
 * Safety Agent - Content safety and hallucination detection
 */
export class SafetyAgent extends BaseAgent {
  constructor(model: BaseChatModel) {
    super(
      model,
      'SafetyAgent',
      'Content safety expert detecting harmful, biased, or inappropriate content',
      ['content_safety', 'bias_detection', 'toxicity_analysis', 'hallucination_check', 'ethical_ai']
    );
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    try {
      const prompt = `
You are a content safety expert and ethicist. Analyze this content for:

1. **Harmful Content**:
   - Hate speech or discriminatory language
   - Violent or dangerous instructions
   - Misinformation or conspiracy theories
   - Self-harm or suicide content

2. **Bias & Fairness**:
   - Gender, racial, or cultural bias
   - Political or ideological bias
   - Stereotypical representations
   - Unfair treatment of groups

3. **Privacy Violations**:
   - Personal information exposure
   - Stalking or harassment enabling
   - Unauthorized data collection
   - Consent violations

4. **Hallucination Detection**:
   - Factually incorrect information
   - Made-up technical details
   - Non-existent APIs or functions
   - Impossible requirements

Content to review: ${task.description}

Provide:
- **Safety score** (1-10, where 10 is completely safe)
- **Risk categories** identified
- **Specific issues** found with examples
- **Severity levels** for each issue
- **Mitigation recommendations**

Format as a safety assessment report.
`;

      const response = await this.model.invoke([
        new SystemMessage('You are a content safety specialist trained in detecting harmful, biased, and inappropriate content across all languages and contexts.'),
        new HumanMessage(prompt)
      ]);

      return {
        success: true,
        output: response.content as string,
        metadata: {
          generatedAt: new Date().toISOString(),
          model: this.model.constructor?.name || 'Unknown',
          safetyChecks: ['harmful_content', 'bias', 'privacy', 'hallucination'],
          tokensUsed: (response as any).usage_metadata?.total_tokens || 0
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Safety review failed',
        suggestions: ['Provide full content context', 'Include user intent', 'Specify target audience']
      };
    }
  }
}

/**
 * Patch Verifier Agent - Automated testing and validation
 */
export class PatchVerifierAgent extends BaseAgent {
  constructor(model: BaseChatModel) {
    super(
      model,
      'PatchVerifierAgent',
      'Automated testing and validation expert for code patches',
      ['patch_verification', 'automated_testing', 'static_analysis', 'performance_testing', 'security_scanning']
    );
  }

  async execute(task: AgentTask): Promise<AgentResult> {
    try {
      const prompt = `
You are a senior QA engineer and testing expert. Verify this code patch for:

1. **Functional Testing**:
   - Unit test coverage
   - Integration test compatibility
   - Edge case handling
   - Error condition testing

2. **Static Analysis**:
   - Code quality metrics
   - Security vulnerabilities
   - Performance implications
   - Maintainability issues

3. **Performance Testing**:
   - Load time impact
   - Memory usage changes
   - Network efficiency
   - Battery impact (mobile)

4. **Compatibility**:
   - Browser compatibility
   - Platform compatibility
   - Dependency conflicts
   - API version compatibility

Patch to verify: ${task.description}

Provide:
- **Verification status** (pass/fail/warnings)
- **Test results** summary
- **Critical issues** requiring fixes
- **Performance impact** assessment
- **Additional tests** recommended
- **Deployment readiness** score

Format as a comprehensive verification report.
`;

      const response = await this.model.invoke([
        new SystemMessage('You are a senior QA automation engineer with expertise in comprehensive testing strategies, performance analysis, and quality assurance.'),
        new HumanMessage(prompt)
      ]);

      return {
        success: true,
        output: response.content as string,
        metadata: {
          generatedAt: new Date().toISOString(),
          model: this.model.constructor?.name || 'Unknown',
          verificationTypes: ['functional', 'static_analysis', 'performance', 'compatibility'],
          tokensUsed: (response as any).usage_metadata?.total_tokens || 0
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Patch verification failed',
        suggestions: ['Provide test results', 'Include performance metrics', 'Share dependency information']
      };
    }
  }
}

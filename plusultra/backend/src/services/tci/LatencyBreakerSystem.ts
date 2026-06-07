import { TruthConsistencyInterface, TCIModelOutput } from './TruthConsistencyInterface';

/**
 * Latency Breaker System - Prevents slow models from freezing the pipeline
 * Implements watchdog timers and partial consensus mechanisms
 */
export class LatencyBreakerSystem {
  private tci: TruthConsistencyInterface;
  private watchdogTimers = new Map<string, NodeJS.Timeout>();
  private maxLatencyMs = 30000; // 30 seconds max per model
  private partialConsensusThreshold = 0.6; // 60% of models needed for partial consensus

  constructor(tci: TruthConsistencyInterface) {
    this.tci = tci;
  }

  /**
   * Start watchdog timer for a model execution
   */
  startWatchdog(model: string, requestId: string): void {
    const timer = setTimeout(() => {
      this.handleModelTimeout(model, requestId);
    }, this.maxLatencyMs);

    this.watchdogTimers.set(`${model}-${requestId}`, timer);
  }

  /**
   * Stop watchdog timer when model completes
   */
  stopWatchdog(model: string, requestId: string): void {
    const timerKey = `${model}-${requestId}`;
    const timer = this.watchdogTimers.get(timerKey);

    if (timer) {
      clearTimeout(timer);
      this.watchdogTimers.delete(timerKey);
    }
  }

  /**
   * Handle model timeout - trigger partial consensus
   */
  private async handleModelTimeout(model: string, requestId: string): Promise<void> {
    console.warn(`⏰ Model ${model} timed out after ${this.maxLatencyMs}ms (request: ${requestId})`);

    // Log timeout event
    this.logTimeoutEvent(model, requestId);

    // Trigger the partial consensus mechanism
    await this.initiatePartialConsensus(model, requestId);
  }

  /**
   * Initiate partial consensus when a model times out
   */
  private async initiatePartialConsensus(timedOutModel: string, requestId: string): Promise<void> {
    console.log(`🔄 Initiating partial consensus after ${timedOutModel} timeout`);

    // 1. Get available outputs from other models via the TCI
    const availableOutputs = await this.tci.getAvailableOutputs(requestId);
    console.log(`📊 Found ${availableOutputs.length} available outputs for request ${requestId}`);

    // 2. Check if we have enough outputs to form a viable consensus
    if (!this.canUsePartialConsensus(availableOutputs)) {
      console.error(`❌ Not enough outputs to form partial consensus for request ${requestId}. Triggering failover.`);
      await this.triggerFailover(requestId, timedOutModel, 'INSUFFICIENT_PARTIAL_OUTPUTS');
      return;
    }

    // 3. Run TCI validation on partial results
    const taskContext = this.extractTaskContext(availableOutputs);
    const validationResult = await this.tci.validateMultiModelOutputs(
      availableOutputs,
      taskContext,
      'partial-consensus'
    );

    console.log(`🔍 TCI validation result: confidence=${validationResult.confidence.toFixed(3)}, valid=${validationResult.isValid}`);

    // 4. Calculate consensus among available outputs
    const consensusResult = await this.calculateEnhancedPartialConsensus(
      availableOutputs,
      [timedOutModel],
      validationResult
    );

    // 5. If consensus threshold met, proceed with partial results
    if (consensusResult.isViable && consensusResult.consensusScore >= this.partialConsensusThreshold) {
      console.log(`✅ Partial consensus is viable (score: ${consensusResult.consensusScore.toFixed(2)}). Proceeding with partial result.`);
      await this.proceedWithPartialResults(requestId, consensusResult, availableOutputs);
    } else {
      // 6. Otherwise, retry with different models
      console.warn(`⚠️ Partial consensus not viable (score: ${consensusResult.consensusScore.toFixed(2)}). Retrying with different models.`);
      await this.retryWithDifferentModels(requestId, timedOutModel, consensusResult);
    }
  }

  /**
   * Log timeout event for analysis
   */
  private logTimeoutEvent(model: string, requestId: string): void {
    const event = {
      timestamp: new Date().toISOString(),
      model,
      requestId,
      type: 'MODEL_TIMEOUT',
      latency: this.maxLatencyMs,
      action: 'PARTIAL_CONSENSUS_INITIATED',
      message: `Model ${model} exceeded latency limit (${this.maxLatencyMs}ms)`
    };

    console.error('🚨 LATENCY TIMEOUT:', event);
  }

  /**
   * Check if partial consensus is possible with current outputs
   */
  canUsePartialConsensus(outputs: TCIModelOutput[]): boolean {
    if (outputs.length < 2) return false;

    const availableModels = outputs.length;
    const requiredForConsensus = Math.ceil(availableModels * this.partialConsensusThreshold);

    return availableModels >= requiredForConsensus;
  }

  /**
   * Calculate partial consensus score from available outputs
   */
  calculatePartialConsensus(outputs: TCIModelOutput[], missingModels: string[]): {
    consensusScore: number;
    isViable: boolean;
    missingModels: string[];
  } {
    if (outputs.length === 0) {
      return { consensusScore: 0, isViable: false, missingModels };
    }

    // Calculate average confidence of available outputs
    const avgConfidence = outputs.reduce((sum, output) => sum + output.confidence, 0) / outputs.length;

    // Calculate consistency among available outputs
    // This would use the TCI consistency validation
    const consistencyScore = this.calculateOutputConsistency(outputs);

    const overallScore = (avgConfidence + consistencyScore) / 2;

    return {
      consensusScore: overallScore,
      isViable: overallScore >= 0.6, // Minimum threshold for viability
      missingModels
    };
  }

  /**
   * Calculate consistency among available outputs
   */
  private calculateOutputConsistency(outputs: TCIModelOutput[]): number {
    if (outputs.length < 2) return 1.0;

    // Simplified consistency calculation
    // In practice, this would use the TCI's embedding-based consistency check
    const confidences = outputs.map(o => o.confidence);
    const maxConf = Math.max(...confidences);
    const minConf = Math.min(...confidences);

    // Lower variance = higher consistency
    const variance = maxConf - minConf;
    return Math.max(0, 1 - variance);
  }

  /**
   * Trigger failover when partial consensus is not possible
   */
  private async triggerFailover(requestId: string, timedOutModel: string, reason: string): Promise<void> {
    console.error(`🚨 Triggering failover for request ${requestId}: ${reason}`);

    // Log the failover event
    this.logFailoverEvent(requestId, timedOutModel, reason);

    // Clean up any stored outputs for this request
    this.tci.clearRequestOutputs(requestId);

    // In a real implementation, this would trigger alternative processing paths
    // For now, we just log the failure
  }

  /**
   * Extract task context from available outputs
   */
  private extractTaskContext(outputs: TCIModelOutput[]): string {
    if (outputs.length === 0) return '';

    // Extract context from the first output's metadata
    // In a real implementation, this would aggregate context from all outputs
    const firstOutput = outputs[0];
    return firstOutput.metadata.contextHash || '';
  }

  /**
   * Calculate enhanced partial consensus with TCI validation
   */
  private async calculateEnhancedPartialConsensus(
    outputs: TCIModelOutput[],
    missingModels: string[],
    validationResult: any
  ): Promise<{
    consensusScore: number;
    isViable: boolean;
    missingModels: string[];
  }> {
    // Use the existing consensus calculation but enhance it with TCI validation
    const basicConsensus = this.calculatePartialConsensus(outputs, missingModels);

    // Incorporate TCI validation confidence
    const enhancedScore = (basicConsensus.consensusScore + validationResult.confidence) / 2;

    return {
      consensusScore: enhancedScore,
      isViable: enhancedScore >= this.partialConsensusThreshold,
      missingModels
    };
  }

  /**
   * Proceed with partial results when consensus is viable
   */
  private async proceedWithPartialResults(
    requestId: string,
    consensusResult: any,
    availableOutputs: TCIModelOutput[]
  ): Promise<void> {
    console.log(`🎯 Proceeding with partial results for request ${requestId}`);

    try {
      // Create a partial aggregation result
      const partialResult = await this.tci.proceedWithPartialConsensus(requestId, consensusResult);

      console.log(`✅ Successfully processed partial results: ${partialResult.finalOutput.substring(0, 100)}...`);

      // Log successful partial consensus
      this.logPartialConsensusSuccess(requestId, consensusResult, availableOutputs);

    } catch (error: any) {
      console.error(`❌ Failed to process partial results: ${error.message}`);
      await this.triggerFailover(requestId, 'unknown', 'PARTIAL_PROCESSING_FAILED');
    }
  }

  /**
   * Retry with different models when partial consensus fails
   */
  private async retryWithDifferentModels(
    requestId: string,
    timedOutModel: string,
    consensusResult: any
  ): Promise<void> {
    console.log(`🔄 Retrying request ${requestId} with different models`);

    // Get available reliable models from TCI
    const reliabilityScores = this.tci.getReliabilityScores();
    const availableModels = Object.keys(reliabilityScores)
      .filter(model => !this.tci.isModelQuarantined(model) && model !== timedOutModel)
      .sort((a, b) => reliabilityScores[b] - reliabilityScores[a])
      .slice(0, 3); // Try up to 3 alternative models

    if (availableModels.length === 0) {
      console.error(`❌ No alternative models available for retry`);
      await this.triggerFailover(requestId, timedOutModel, 'NO_ALTERNATIVE_MODELS');
      return;
    }

    console.log(`📋 Retrying with models: ${availableModels.join(', ')}`);

    // In a real implementation, this would trigger a retry mechanism
    // For now, we'll log the retry attempt and mark as failed
    this.logRetryAttempt(requestId, timedOutModel, availableModels, consensusResult);

    // Since we don't have a retry mechanism in place, mark as failed
    await this.triggerFailover(requestId, timedOutModel, 'RETRY_NOT_IMPLEMENTED');
  }

  /**
   * Log failover event for analysis
   */
  private logFailoverEvent(requestId: string, timedOutModel: string, reason: string): void {
    const event = {
      timestamp: new Date().toISOString(),
      requestId,
      timedOutModel,
      type: 'FAILOVER_TRIGGERED',
      reason,
      action: 'SYSTEM_FAILOVER',
      message: `Request ${requestId} failed: ${reason}`
    };

    console.error('🚨 SYSTEM FAILOVER:', event);
  }

  /**
   * Log successful partial consensus
   */
  private logPartialConsensusSuccess(
    requestId: string,
    consensusResult: any,
    outputs: TCIModelOutput[]
  ): void {
    const event = {
      timestamp: new Date().toISOString(),
      requestId,
      type: 'PARTIAL_CONSENSUS_SUCCESS',
      consensusScore: consensusResult.consensusScore,
      outputCount: outputs.length,
      models: outputs.map(o => o.model),
      action: 'PARTIAL_RESULTS_PROCESSED',
      message: `Partial consensus achieved with score ${consensusResult.consensusScore.toFixed(2)}`
    };

    console.log('✅ PARTIAL CONSENSUS SUCCESS:', event);
  }

  /**
   * Log retry attempt for analysis
   */
  private logRetryAttempt(
    requestId: string,
    timedOutModel: string,
    alternativeModels: string[],
    consensusResult: any
  ): void {
    const event = {
      timestamp: new Date().toISOString(),
      requestId,
      timedOutModel,
      alternativeModels,
      type: 'RETRY_ATTEMPT',
      originalConsensusScore: consensusResult.consensusScore,
      action: 'MODEL_RETRY_INITIATED',
      message: `Retrying request ${requestId} with ${alternativeModels.length} alternative models`
    };

    console.log('🔄 RETRY ATTEMPT:', event);
  }
}

/**
 * Schema Validation Layer - Comprehensive validation for structured outputs
 * Ensures JSON schema compliance, TypeScript compilation, and semantic safety
 */
export class SchemaValidationLayer {
  private tci: TruthConsistencyInterface;

  constructor(tci: TruthConsistencyInterface) {
    this.tci = tci;
  }

  /**
   * Validate JSON schema compliance
   */
  validateJSONSchema(output: string, schema: any): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    try {
      const parsed = JSON.parse(output);

      // Basic structure validation
      const errors: string[] = [];
      const warnings: string[] = [];

      // Check required fields
      if (schema.required) {
        for (const field of schema.required) {
          if (!(field in parsed)) {
            errors.push(`Missing required field: ${field}`);
          }
        }
      }

      // Validate field types
      if (schema.properties) {
        for (const [field, fieldSchema] of Object.entries(schema.properties)) {
          if (field in parsed) {
            const validation = this.validateFieldType(parsed[field], fieldSchema);
            if (!validation.isValid) {
              errors.push(...validation.errors.map(e => `${field}: ${e}`));
            }
            if (validation.warnings.length > 0) {
              warnings.push(...validation.warnings.map(w => `${field}: ${w}`));
            }
          }
        }
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error: any) {
      return {
        isValid: false,
        errors: [`JSON parsing failed: ${error.message}`],
        warnings: []
      };
    }
  }

  /**
   * Validate TypeScript compilation (basic syntax check)
   */
  validateTypeScriptSyntax(code: string): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Basic syntax checks (in a real implementation, would use TypeScript compiler API)
      if (!code.trim()) {
        errors.push('Empty code output');
      }

      // Check for balanced brackets
      const bracketBalance = this.checkBracketBalance(code);
      if (!bracketBalance.isBalanced) {
        errors.push(`Unbalanced brackets: ${bracketBalance.issues.join(', ')}`);
      }

      // Check for basic TypeScript patterns
      if (code.includes('function') && !code.includes('{')) {
        warnings.push('Function declaration may be incomplete');
      }

      // Check for imports without corresponding exports/declarations
      const importLines = code.split('\n').filter(line => line.trim().startsWith('import'));
      if (importLines.length > 0 && !code.includes('export')) {
        warnings.push('Imports detected but no exports found');
      }

      return {
        isValid: errors.length === 0,
        errors,
        warnings
      };
    } catch (error: any) {
      return {
        isValid: false,
        errors: [`TypeScript validation error: ${error.message}`],
        warnings: []
      };
    }
  }

  /**
   * Validate field type against schema
   */
  private validateFieldType(value: any, schema: any): {
    isValid: boolean;
    errors: string[];
    warnings: string[];
  } {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Type validation
    if (schema.type) {
      const expectedType = schema.type;
      const actualType = typeof value;

      if (expectedType === 'string' && actualType !== 'string') {
        errors.push(`Expected string, got ${actualType}`);
      } else if (expectedType === 'number' && actualType !== 'number') {
        errors.push(`Expected number, got ${actualType}`);
      } else if (expectedType === 'boolean' && actualType !== 'boolean') {
        errors.push(`Expected boolean, got ${actualType}`);
      } else if (expectedType === 'array' && !Array.isArray(value)) {
        errors.push(`Expected array, got ${actualType}`);
      } else if (expectedType === 'object' && (value === null || actualType !== 'object')) {
        errors.push(`Expected object, got ${actualType}`);
      }
    }

    // Format validation for strings
    if (schema.format && typeof value === 'string') {
      const formatErrors = this.validateStringFormat(value, schema.format);
      errors.push(...formatErrors);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings
    };
  }

  /**
   * Validate string format (email, uri, etc.)
   */
  private validateStringFormat(value: string, format: string): string[] {
    const errors: string[] = [];

    switch (format) {
      case 'email':
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
          errors.push('Invalid email format');
        }
        break;
      case 'uri':
        try {
          new URL(value);
        } catch {
          errors.push('Invalid URI format');
        }
        break;
      case 'uuid':
        if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
          errors.push('Invalid UUID format');
        }
        break;
    }

    return errors;
  }

  /**
   * Check bracket balance in code
   */
  private checkBracketBalance(code: string): {
    isBalanced: boolean;
    issues: string[];
  } {
    const brackets = {
      '(': ')',
      '[': ']',
      '{': '}'
    };

    const stack: string[] = [];
    const issues: string[] = [];

    for (let i = 0; i < code.length; i++) {
      const char = code[i];

      if (brackets[char as keyof typeof brackets]) {
        stack.push(char);
      } else if (Object.values(brackets).includes(char)) {
        const expected = stack.pop();
        const expectedClosing = expected ? brackets[expected as keyof typeof brackets] : null;

        if (expectedClosing !== char) {
          issues.push(`Mismatched bracket at position ${i}: expected ${expectedClosing}, got ${char}`);
        }
      }
    }

    if (stack.length > 0) {
      issues.push(`Unclosed brackets: ${stack.join(', ')}`);
    }

    return {
      isBalanced: issues.length === 0,
      issues
    };
  }

  /**
   * Comprehensive validation combining JSON schema, TypeScript, and semantic checks
   */
  async validateCompleteOutput(
    output: string,
    schema: any,
    isTypeScript: boolean = false
  ): Promise<{
    isValid: boolean;
    errors: string[];
    warnings: string[];
    score: number; // 0-1 validation score
  }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    let score = 1.0;

    // JSON schema validation
    if (schema) {
      const jsonValidation = this.validateJSONSchema(output, schema);
      errors.push(...jsonValidation.errors);
      warnings.push(...jsonValidation.warnings);
      if (!jsonValidation.isValid) score *= 0.5;
    }

    // TypeScript syntax validation
    if (isTypeScript) {
      const tsValidation = this.validateTypeScriptSyntax(output);
      errors.push(...tsValidation.errors);
      warnings.push(...tsValidation.warnings);
      if (!tsValidation.isValid) score *= 0.7;
    }

    // Semantic safety checks (basic linting)
    const semanticWarnings = this.performSemanticChecks(output);
    warnings.push(...semanticWarnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      score: Math.max(0, score)
    };
  }

  /**
   * Perform basic semantic safety checks
   */
  private performSemanticChecks(output: string): string[] {
    const warnings: string[] = [];

    // Check for potentially unsafe patterns
    if (output.includes('eval(') || output.includes('Function(')) {
      warnings.push('Potentially unsafe dynamic code execution detected');
    }

    if (output.includes('process.env') && !output.includes('NEXT_PUBLIC_')) {
      warnings.push('Accessing non-public environment variables');
    }

    if ((output.match(/console\.(log|error|warn)/g) ?? []).length > 5) {
      warnings.push('Excessive console statements detected');
    }

    return warnings;
  }
}

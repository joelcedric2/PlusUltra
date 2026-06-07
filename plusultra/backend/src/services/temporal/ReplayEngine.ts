import TemporalGraphDB, { TemporalChange } from './TemporalGraphDB';

export interface ReplayRequest {
  targetTime: Date;
  filePaths?: string[];
  changeTypes?: string[];
  maxChanges?: number;
  includeReasoning?: boolean;
}

export interface ReplayStep {
  timestamp: Date;
  change: TemporalChange;
  state: {
    fileContents: Record<string, string>;
    reasoning: string;
    alternatives: string[];
  };
  decision: {
    chosen: string;
    rejected: string[];
    confidence: number;
  };
}

export interface ReplayResult {
  steps: ReplayStep[];
  finalState: Record<string, string>;
  insights: {
    keyDecisions: string[];
    patterns: string[];
    evolution: string;
  };
}

export class ReplayEngine {
  constructor(private readonly temporalDB: TemporalGraphDB) {}

  /**
   * Replay the development history from a specific point in time
   */
  async replayFromTime(request: ReplayRequest): Promise<ReplayResult> {
    const changes = await this.temporalDB.queryChanges({
      timeRange: {
        start: new Date(0), // Beginning of time
        end: request.targetTime
      },
      filePaths: request.filePaths,
      changeTypes: request.changeTypes,
      limit: request.maxChanges || 1000,
      includeSnapshots: true
    });

    // Sort changes chronologically
    changes.sort((a: TemporalChange, b: TemporalChange) => a.timestamp.getTime() - b.timestamp.getTime());

    const steps: ReplayStep[] = [];
    const fileContents: Record<string, string> = {};

    for (const change of changes) {
      // Apply the change to our simulated file state
      const step = await this.createReplayStep(change, fileContents);
      steps.push(step);

      // Update file contents
      if (change.codeSnapshot.after) {
        fileContents[change.filePath] = change.codeSnapshot.after;
      }
    }

    // Generate insights from the replay
    const insights = this.generateReplayInsights(steps);

    return {
      steps,
      finalState: fileContents,
      insights
    };
  }

  /**
   * Replay a specific change and its alternatives
   */
  async replayChangeAlternatives(changeId: string): Promise<{
    original: ReplayStep;
    alternatives: Array<{
      description: string;
      simulatedChange: TemporalChange;
      predictedImpact: Record<string, any>;
    }>;
  }> {
    const change = await this.getChange(changeId);
    if (!change) {
      throw new Error(`Change ${changeId} not found`);
    }

    const originalStep = await this.createReplayStep(change, {});

    // Generate alternative scenarios
    const alternatives = await this.generateAlternativeScenarios(change);

    return {
      original: originalStep,
      alternatives
    };
  }

  /**
   * Simulate what would happen if we reverted specific changes
   */
  async simulateRevert(
    changeIds: string[],
    targetTime?: Date
  ): Promise<{
    originalState: Record<string, string>;
    revertedState: Record<string, string>;
    differences: Array<{
      file: string;
      changes: string[];
    }>;
    predictedImpact: {
      performance: string;
      maintainability: string;
      features: string[];
    };
  }> {
    // Get the state at target time (or current if not specified)
    const targetTimeToUse = targetTime || new Date();

    const currentReplay = await this.replayFromTime({
      targetTime: targetTimeToUse,
      maxChanges: 1000
    });

    // Get the state before the changes to revert
    const revertTime = new Date(Math.min(...changeIds.map(id => {
      const change = currentReplay.steps.find(s => s.change.id === id);
      return change?.timestamp.getTime() || Date.now();
    })));

    const beforeRevertReplay = await this.replayFromTime({
      targetTime: revertTime,
      maxChanges: 1000
    });

    // Analyze differences
    const differences = this.analyzeDifferences(
      beforeRevertReplay.finalState,
      currentReplay.finalState
    );

    const predictedImpact = this.predictRevertImpact(changeIds, currentReplay.steps);

    return {
      originalState: currentReplay.finalState,
      revertedState: beforeRevertReplay.finalState,
      differences,
      predictedImpact
    };
  }

  /**
   * Explain why a particular code structure exists
   */
  async explainCodeEvolution(
    filePath: string,
    lineRange?: { start: number; end: number }
  ): Promise<{
    evolution: string;
    keyDecisions: string[];
    currentRationale: string;
    alternatives: string[];
  }> {
    const fileEvolution = await this.temporalDB.getFileEvolution(filePath);

    if (fileEvolution.length === 0) {
      return {
        evolution: "No historical data available for this file.",
        keyDecisions: [],
        currentRationale: "File was recently created.",
        alternatives: []
      };
    }

    // Find changes relevant to the line range
    const relevantChanges = this.filterRelevantChanges(fileEvolution, lineRange);

    const evolution = this.buildEvolutionNarrative(relevantChanges);
    const keyDecisions = this.extractKeyDecisions(relevantChanges);
    const currentRationale = this.buildCurrentRationale(relevantChanges);
    const alternatives = this.extractAlternatives(relevantChanges);

    return {
      evolution,
      keyDecisions,
      currentRationale,
      alternatives
    };
  }

  // Private helper methods

  private async createReplayStep(change: TemporalChange, currentFiles: Record<string, string>): Promise<ReplayStep> {
    // Apply the change to get the new state
    let newContent = currentFiles[change.filePath] || '';

    if (change.codeSnapshot.diff) {
      newContent = this.applyDiff(newContent, change.codeSnapshot.diff);
    } else if (change.codeSnapshot.after) {
      newContent = change.codeSnapshot.after;
    }

    return {
      timestamp: change.timestamp,
      change,
      state: {
        fileContents: { ...currentFiles, [change.filePath]: newContent },
        reasoning: change.reasoning.solution,
        alternatives: change.reasoning.alternatives
      },
      decision: {
        chosen: change.reasoning.solution,
        rejected: change.reasoning.alternatives,
        confidence: change.reasoning.confidence
      }
    };
  }

  private applyDiff(originalContent: string, diff: string): string {
    // Simple diff application (in production, use a proper diff library)
    const lines = originalContent.split('\n');
    const diffLines = diff.split('\n');

    let result = '';
    let originalIndex = 0;

    for (const diffLine of diffLines) {
      if (diffLine.startsWith('+')) {
        result += diffLine.substring(1) + '\n';
      } else if (diffLine.startsWith('-')) {
        // Skip the removed line
        originalIndex++;
      } else if (diffLine.trim() === '') {
        // Context line or empty line
        if (originalIndex < lines.length) {
          result += lines[originalIndex] + '\n';
          originalIndex++;
        }
      }
    }

    // Add remaining original lines
    while (originalIndex < lines.length) {
      result += lines[originalIndex] + '\n';
      originalIndex++;
    }

    return result.trim();
  }

  private async generateAlternativeScenarios(change: TemporalChange): Promise<Array<{
    description: string;
    simulatedChange: TemporalChange;
    predictedImpact: Record<string, any>;
  }>> {
    // Generate alternative approaches to the same problem
    const alternatives: Array<{
      description: string;
      simulatedChange: TemporalChange;
      predictedImpact: Record<string, any>;
    }> = [];

    // Alternative 1: Different implementation approach
    alternatives.push({
      description: `Alternative implementation approach for ${change.intent}`,
      simulatedChange: {
        ...change,
        id: `alt_${change.id}_1`,
        reasoning: {
          ...change.reasoning,
          solution: `Alternative solution: ${change.reasoning.solution}`,
          alternatives: change.reasoning.alternatives
        }
      },
      predictedImpact: {
        runtimeDelta: (change.impact.runtimeDelta || 0) * 0.8,
        maintainability: 'slightly improved'
      }
    });

    // Alternative 2: Different architectural choice
    alternatives.push({
      description: `Different architectural approach for ${change.intent}`,
      simulatedChange: {
        ...change,
        id: `alt_${change.id}_2`,
        filePath: change.filePath.replace(/\.tsx?$/, '.alt.tsx'),
        reasoning: {
          ...change.reasoning,
          solution: `Architectural alternative: ${change.reasoning.solution}`,
          alternatives: change.reasoning.alternatives
        }
      },
      predictedImpact: {
        complexity: 'increased',
        features: 'enhanced'
      }
    });

    return alternatives;
  }

  private analyzeDifferences(before: Record<string, string>, after: Record<string, string>): Array<{
    file: string;
    changes: string[];
  }> {
    const differences: Array<{ file: string; changes: string[] }> = [];

    for (const [file, afterContent] of Object.entries(after)) {
      const beforeContent = before[file];

      if (beforeContent !== afterContent) {
        const changes = [];

        if (!beforeContent) {
          changes.push('File created');
        } else if (!afterContent) {
          changes.push('File deleted');
        } else {
          changes.push('File modified');
        }

        differences.push({ file, changes });
      }
    }

    return differences;
  }

  private predictRevertImpact(changeIds: string[], steps: ReplayStep[]): {
    performance: string;
    maintainability: string;
    features: string[];
  } {
    const revertedChanges = steps
      .filter(step => changeIds.includes(step.change.id))
      .map(step => step.change);

    let performance = 'neutral';
    let maintainability = 'neutral';
    const features: string[] = [];

    for (const change of revertedChanges) {
      if (change.impact.runtimeDelta && change.impact.runtimeDelta > 0) {
        performance = 'improved';
      }

      if (change.intent.toLowerCase().includes('refactor')) {
        maintainability = 'decreased';
      }

      // Extract features from intent
      if (change.intent.toLowerCase().includes('feature')) {
        features.push(change.intent);
      }
    }

    return { performance, maintainability, features };
  }

  private filterRelevantChanges(changes: TemporalChange[], lineRange?: { start: number; end: number }): TemporalChange[] {
    if (!lineRange) {
      return changes;
    }

    // Simple heuristic: changes that modified lines in the range
    return changes.filter(change => {
      // This is a simplified implementation
      // In practice, you'd analyze the diff to see if it affected the line range
      return change.impact.linesChanged > 0;
    });
  }

  private buildEvolutionNarrative(changes: TemporalChange[]): string {
    if (changes.length === 0) {
      return "No changes found in the specified range.";
    }

    let narrative = `This code evolved through ${changes.length} key changes:\n\n`;

    for (let i = 0; i < changes.length; i++) {
      const change = changes[i];
      narrative += `${i + 1}. **${change.changeType}** (${change.timestamp.toISOString().split('T')[0]}): ${change.intent}\n`;
      narrative += `   - Agents: ${change.agents.join(', ')}\n`;
      narrative += `   - Impact: ${change.impact.linesChanged} lines changed\n`;
    }

    return narrative;
  }

  private extractKeyDecisions(changes: TemporalChange[]): string[] {
    return changes
      .filter(change => change.reasoning.confidence > 0.7)
      .map(change => `${change.intent} (${change.timestamp.toISOString().split('T')[0]})`);
  }

  private buildCurrentRationale(changes: TemporalChange[]): string {
    if (changes.length === 0) {
      return "No rationale available.";
    }

    const latestChange = changes[changes.length - 1];
    return `Current structure exists because: ${latestChange.intent}. ${latestChange.reasoning.solution}`;
  }

  private extractAlternatives(changes: TemporalChange[]): string[] {
    const alternatives: string[] = [];

    for (const change of changes) {
      alternatives.push(...change.reasoning.alternatives);
    }

    return [...new Set(alternatives)]; // Remove duplicates
  }

  private async getChange(changeId: string): Promise<TemporalChange | null> {
    const changes = await this.temporalDB.queryChanges({
      limit: 1,
      // Note: This would need a way to query by ID in the actual implementation
    });

    return changes.find(c => c.id === changeId) || null;
  }

  private generateReplayInsights(steps: ReplayStep[]): {
    keyDecisions: string[];
    patterns: string[];
    evolution: string;
  } {
    const keyDecisions = steps
      .filter(step => step.change.reasoning.confidence > 0.8)
      .map(step => `${step.change.intent} (${step.timestamp.toISOString().split('T')[0]})`);

    const patterns = this.identifyPatterns(steps);

    const evolution = this.summarizeEvolution(steps);

    return {
      keyDecisions,
      patterns,
      evolution
    };
  }

  private identifyPatterns(steps: ReplayStep[]): string[] {
    const patterns: string[] = [];

    // Look for recurring change types
    const changeTypes = steps.map(s => s.change.changeType);
    const typeCounts: Record<string, number> = {};

    for (const type of changeTypes) {
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    }

    for (const [type, count] of Object.entries(typeCounts)) {
      if (count > 3) {
        patterns.push(`Frequent ${type} operations (${count} times)`);
      }
    }

    // Look for performance-focused changes
    const performanceChanges = steps.filter(s =>
      s.change.intent.toLowerCase().includes('performance') ||
      s.change.intent.toLowerCase().includes('speed')
    );

    if (performanceChanges.length > 0) {
      patterns.push(`Performance optimization focus (${performanceChanges.length} changes)`);
    }

    return patterns;
  }

  private summarizeEvolution(steps: ReplayStep[]): string {
    if (steps.length === 0) {
      return "No evolution data available.";
    }

    const startTime = steps[0].timestamp;
    const endTime = steps[steps.length - 1].timestamp;
    const duration = Math.ceil((endTime.getTime() - startTime.getTime()) / (1000 * 60 * 60 * 24));

    return `Code evolved over ${duration} days through ${steps.length} tracked changes, representing a comprehensive development journey.`;
  }
}

export default ReplayEngine;

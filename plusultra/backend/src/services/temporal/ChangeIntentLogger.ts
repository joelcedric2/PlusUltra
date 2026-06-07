import { v4 as uuidv4 } from 'uuid';
import TemporalGraphDB, { TemporalChange } from './TemporalGraphDB';

export interface ChangeContext {
  userId: string;
  workspaceId?: string;
  sessionId: string;
  prompt?: string;
  agents: string[];
  workflowType: string;
}

export interface CodeChangeEvent {
  filePath: string;
  changeType: 'create' | 'modify' | 'delete' | 'refactor' | 'fix';
  oldContent?: string;
  newContent: string;
  context: ChangeContext;
  metadata?: Record<string, any>;
}

export class ChangeIntentLogger {
  constructor(private readonly temporalDB: TemporalGraphDB) {}

  /**
   * Log a code change with full context and intent
   */
  async logCodeChange(event: CodeChangeEvent): Promise<string> {
    const changeId = uuidv4();

    // Generate diff for tracking
    const diff = await this.generateDiff(event.oldContent, event.newContent);

    // Analyze intent from context and changes
    const intent = await this.analyzeIntent(event);

    // Calculate impact metrics
    const impact = await this.calculateImpact(event);

    // Build causal chain (what led to this change)
    const causalChain = await this.buildCausalChain(event);

    // Extract reasoning from the change context
    const reasoning = await this.extractReasoning(event);

    const change: TemporalChange = {
      id: changeId,
      filePath: event.filePath,
      timestamp: new Date(),
      changeType: event.changeType,
      intent,
      agents: event.context.agents,
      impact,
      causalChain,
      reasoning,
      codeSnapshot: {
        before: event.oldContent || '',
        after: event.newContent,
        diff
      },
      metadata: {
        userId: event.context.userId,
        workspaceId: event.context.workspaceId,
        sessionId: event.context.sessionId,
        workflowType: event.context.workflowType,
        prompt: event.context.prompt,
        ...event.metadata
      }
    };

    // Store in temporal graph
    await this.temporalDB.storeChange(change);

    return changeId;
  }

  /**
   * Log multiple related changes as a batch
   */
  async logChangeBatch(changes: CodeChangeEvent[], batchIntent?: string): Promise<string[]> {
    const changeIds: string[] = [];

    for (const change of changes) {
      const changeId = await this.logCodeChange(change);
      changeIds.push(changeId);
    }

    // If batch intent provided, update all changes with this broader context
    if (batchIntent && changeIds.length > 0) {
      await this.updateBatchIntent(changeIds, batchIntent);
    }

    return changeIds;
  }

  /**
   * Update the intent of existing changes (for learning and refinement)
   */
  async updateChangeIntent(changeId: string, newIntent: string, confidence?: number): Promise<void> {
    // This would update the intent in the temporal graph
    // Implementation depends on your storage layer
    console.log(`Updating intent for change ${changeId}: ${newIntent} (confidence: ${confidence})`);
  }

  /**
   * Get change history for a file or session
   */
  async getChangeHistory(
    filePath?: string,
    sessionId?: string,
    limit: number = 100
  ): Promise<TemporalChange[]> {
    return this.temporalDB.queryChanges({
      filePaths: filePath ? [filePath] : undefined,
      limit,
      includeSnapshots: true
    });
  }

  /**
   * Hook into AI generation events
   */
  async onAIGeneration(
    agent: string,
    prompt: string,
    response: string,
    context: ChangeContext
  ): Promise<void> {
    // Log the AI reasoning and generation
    const generationEvent: CodeChangeEvent = {
      filePath: context.sessionId, // Use session as file for AI-only events
      changeType: 'modify',
      newContent: response,
      context: {
        ...context,
        agents: [agent]
      },
      metadata: {
        generationType: 'ai_response',
        prompt,
        agent,
        tokenCount: this.estimateTokenCount(response)
      }
    };

    await this.logCodeChange(generationEvent);
  }

  /**
   * Hook into user edit events
   */
  async onUserEdit(
    filePath: string,
    oldContent: string,
    newContent: string,
    context: ChangeContext
  ): Promise<void> {
    const editEvent: CodeChangeEvent = {
      filePath,
      changeType: this.determineChangeType(oldContent, newContent),
      oldContent,
      newContent,
      context,
      metadata: {
        editType: 'user_edit',
        userId: context.userId
      }
    };

    await this.logCodeChange(editEvent);
  }

  // Private helper methods

  private async generateDiff(oldContent?: string, newContent?: string): Promise<string> {
    if (!oldContent || !newContent) return '';

    // Simple diff implementation (in production, use a proper diff library)
    const oldLines = oldContent.split('\n');
    const newLines = newContent.split('\n');

    let diff = '';
    const maxLines = Math.max(oldLines.length, newLines.length);

    for (let i = 0; i < maxLines; i++) {
      const oldLine = oldLines[i] || '';
      const newLine = newLines[i] || '';

      if (oldLine !== newLine) {
        if (oldLine && newLine) {
          diff += `-${oldLine}\n+${newLine}\n`;
        } else if (oldLine) {
          diff += `-${oldLine}\n`;
        } else {
          diff += `+${newLine}\n`;
        }
      }
    }

    return diff;
  }

  private async analyzeIntent(event: CodeChangeEvent): Promise<string> {
    // Analyze the change to determine intent
    const context = event.context;
    const content = event.newContent;

    // Simple heuristics for intent detection
    if (context.prompt?.toLowerCase().includes('fix') || context.prompt?.toLowerCase().includes('bug')) {
      return 'Fix a bug or error';
    }

    if (context.prompt?.toLowerCase().includes('performance') || context.prompt?.toLowerCase().includes('speed')) {
      return 'Improve performance';
    }

    if (context.prompt?.toLowerCase().includes('ui') || context.prompt?.toLowerCase().includes('design')) {
      return 'Improve user interface';
    }

    if (context.prompt?.toLowerCase().includes('feature') || context.prompt?.toLowerCase().includes('add')) {
      return 'Add new functionality';
    }

    if (event.changeType === 'refactor') {
      return 'Refactor code structure';
    }

    // Default intent based on workflow type
    const workflowIntents: Record<string, string> = {
      'code_generation': 'Generate new code',
      'debugging': 'Fix issues and errors',
      'optimization': 'Improve performance',
      'ui_enhancement': 'Enhance user interface',
      'feature_development': 'Develop new features'
    };

    return workflowIntents[event.context.workflowType] || 'Code modification';
  }

  private async calculateImpact(event: CodeChangeEvent): Promise<TemporalChange['impact']> {
    const oldLines = (event.oldContent || '').split('\n').length;
    const newLines = event.newContent.split('\n').length;
    const linesChanged = Math.abs(newLines - oldLines);

    // Simple impact calculation (in production, use more sophisticated analysis)
    return {
      linesChanged,
      runtimeDelta: undefined, // Would need runtime profiling
      testPassRate: undefined, // Would need test execution
      userExperience: this.assessUXImpact(event)
    };
  }

  private assessUXImpact(event: CodeChangeEvent): string {
    // Simple UX impact assessment
    if (event.filePath.includes('ui') || event.filePath.includes('component')) {
      if (event.newContent.length > (event.oldContent?.length ?? 0)) {
        return 'Likely improved user experience';
      }
      return 'May affect user experience';
    }
    return 'No direct UX impact';
  }

  private async buildCausalChain(event: CodeChangeEvent): Promise<string[]> {
    // Find recent changes in the same session that might have caused this one
    const recentChanges = await this.temporalDB.queryChanges({
      filePaths: [event.filePath],
      limit: 10
    });

    // Filter to changes in the same session and before this one
    const sessionChanges = recentChanges.filter(change =>
      change.metadata.sessionId === event.context.sessionId &&
      change.timestamp < new Date() // Before current change
    );

    return sessionChanges.map(c => c.id);
  }

  private async extractReasoning(event: CodeChangeEvent): Promise<TemporalChange['reasoning']> {
    return {
      problem: event.context.prompt || 'No explicit problem stated',
      solution: `Applied ${event.changeType} to ${event.filePath}`,
      alternatives: [], // Would be populated by AI reasoning
      confidence: 0.8 // Default confidence
    };
  }

  private determineChangeType(oldContent?: string, newContent?: string): TemporalChange['changeType'] {
    if (!oldContent || oldContent.trim() === '') {
      return 'create';
    }

    if (!newContent || newContent.trim() === '') {
      return 'delete';
    }

    const oldLines = oldContent.split('\n').length;
    const newLines = newContent.split('\n').length;

    if (Math.abs(newLines - oldLines) / oldLines > 0.3) {
      return 'refactor';
    }

    // Check if this looks like a bug fix (simplified)
    if (newContent.includes('try') && newContent.includes('catch') && !oldContent.includes('try')) {
      return 'fix';
    }

    return 'modify';
  }

  private estimateTokenCount(content: string): number {
    // Rough token estimation (words / 4)
    return Math.ceil(content.split(/\s+/).length / 4);
  }

  private async updateBatchIntent(changeIds: string[], batchIntent: string): Promise<void> {
    // Update all changes in the batch with the broader intent
    for (const changeId of changeIds) {
      // Implementation would update the temporal graph
      console.log(`Updating batch intent for ${changeId}: ${batchIntent}`);
    }
  }
}

export default ChangeIntentLogger;

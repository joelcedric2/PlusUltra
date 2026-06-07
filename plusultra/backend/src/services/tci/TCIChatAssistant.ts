import Anthropic from '@anthropic-ai/sdk';

/**
 * TCI Chat Assistant - Conversational Intelligence
 *
 * Makes TCI's organizational memory accessible through natural conversation.
 * The UI stays clean (Google Docs-style), while intelligence lives in the chat pane.
 *
 * Philosophy: "TCI should be like oxygen - essential, always present, completely invisible
 * until you specifically need it."
 *
 * Users interact via natural language:
 * - "Why did this change 2 days ago?"
 * - "Who usually works on auth code?"
 * - "What's the impact if I change this payment method?"
 *
 * TCI understands context (selected code, current file, team activity) and provides
 * intelligent, conversational responses.
 */

export interface ChatContext {
  userId: string;
  userName: string;
  projectId: string;
  currentFile?: string;
  selectedCode?: {
    file: string;
    startLine: number;
    endLine: number;
    code: string;
  };
  cursorPosition?: {
    file: string;
    line: number;
    column: number;
  };
  recentActivity?: {
    filesViewed: string[];
    filesEdited: string[];
    collaborators: string[];
  };
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  context?: ChatContext;
}

export interface TCIQueryResult {
  type: 'history' | 'impact' | 'expertise' | 'conflict' | 'general';
  answer: string;
  data?: any;
  suggestions?: string[];
  relatedChanges?: any[];
}

export interface ProactiveAlert {
  id: string;
  type: 'conflict' | 'suggestion' | 'warning' | 'insight';
  severity: 'low' | 'medium' | 'high';
  message: string;
  details?: string;
  actionable: boolean;
  actions?: string[];
  timestamp: Date;
}

/**
 * TCI Chat Assistant Service
 *
 * Provides conversational access to TCI's organizational memory
 */
export class TCIChatAssistant {
  private anthropic: Anthropic;
  private conversationHistory: Map<string, ChatMessage[]> = new Map();

  constructor(anthropicApiKey?: string) {
    this.anthropic = new Anthropic({
      apiKey: anthropicApiKey || process.env.ANTHROPIC_API_KEY,
    });
  }

  /**
   * Process a natural language query about the codebase
   *
   * Examples:
   * - "Why did this change 2 days ago?"
   * - "Who usually works on auth code?"
   * - "What's the impact if I change this payment method?"
   * - "Show me the history of this function"
   */
  async processQuery(
    query: string,
    context: ChatContext,
    conversationId: string
  ): Promise<{
    response: string;
    queryResult: TCIQueryResult;
    context: ChatContext;
  }> {
    // Get conversation history
    const history = this.conversationHistory.get(conversationId) || [];

    // Determine query intent
    const intent = this.detectQueryIntent(query, context);

    // Build context-aware prompt
    const prompt = this.buildContextAwarePrompt(query, context, intent, history);

    // Query Claude for intelligent response
    const response = await this.anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 2048,
      temperature: 0.3, // Factual responses
      system: this.getTCIAssistantSystemPrompt(),
      messages: [
        ...this.formatHistoryForClaude(history),
        { role: 'user', content: prompt },
      ],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    const assistantResponse = content.text;

    // Extract structured data from response
    const queryResult = await this.extractQueryResult(assistantResponse, intent, context);

    // Update conversation history
    history.push({
      role: 'user',
      content: query,
      timestamp: new Date(),
      context,
    });
    history.push({
      role: 'assistant',
      content: assistantResponse,
      timestamp: new Date(),
    });
    this.conversationHistory.set(conversationId, history);

    return {
      response: assistantResponse,
      queryResult,
      context,
    };
  }

  /**
   * Generate proactive alerts based on current context
   *
   * Examples:
   * - "Detected potential conflict with Joel's active changes"
   * - "This function has high cyclomatic complexity (23). Consider refactoring"
   * - "Sarah edited this file 10 minutes ago. Want to see her changes?"
   */
  async generateProactiveAlerts(context: ChatContext): Promise<ProactiveAlert[]> {
    const alerts: ProactiveAlert[] = [];

    // Check for potential conflicts
    if (context.selectedCode && context.recentActivity?.collaborators) {
      const conflictAlert = await this.checkForCollaboratorConflicts(context);
      if (conflictAlert) alerts.push(conflictAlert);
    }

    // Check for code quality issues
    if (context.selectedCode) {
      const qualityAlert = await this.checkCodeQuality(context);
      if (qualityAlert) alerts.push(qualityAlert);
    }

    // Check for recent related changes
    if (context.currentFile) {
      const recentChangeAlert = await this.checkRecentRelatedChanges(context);
      if (recentChangeAlert) alerts.push(recentChangeAlert);
    }

    return alerts;
  }

  /**
   * Detect query intent from natural language
   */
  private detectQueryIntent(
    query: string,
    context: ChatContext
  ): 'history' | 'impact' | 'expertise' | 'conflict' | 'general' {
    const lowerQuery = query.toLowerCase();

    // History queries
    if (
      lowerQuery.includes('why') ||
      lowerQuery.includes('when') ||
      lowerQuery.includes('changed') ||
      lowerQuery.includes('history') ||
      lowerQuery.includes('modified')
    ) {
      return 'history';
    }

    // Impact/prediction queries
    if (
      lowerQuery.includes('impact') ||
      lowerQuery.includes('affect') ||
      lowerQuery.includes('what if') ||
      lowerQuery.includes('happens if')
    ) {
      return 'impact';
    }

    // Expertise queries
    if (
      lowerQuery.includes('who') ||
      lowerQuery.includes('expert') ||
      lowerQuery.includes('knows about') ||
      lowerQuery.includes('worked on')
    ) {
      return 'expertise';
    }

    // Conflict queries
    if (
      lowerQuery.includes('conflict') ||
      lowerQuery.includes('merge') ||
      lowerQuery.includes('overlap')
    ) {
      return 'conflict';
    }

    return 'general';
  }

  /**
   * Build context-aware prompt for Claude
   */
  private buildContextAwarePrompt(
    query: string,
    context: ChatContext,
    intent: string,
    history: ChatMessage[]
  ): string {
    let prompt = `User query: "${query}"\n\n`;

    // Add context information
    prompt += `Context:\n`;
    prompt += `- User: ${context.userName} (ID: ${context.userId})\n`;
    prompt += `- Project: ${context.projectId}\n`;

    if (context.currentFile) {
      prompt += `- Current file: ${context.currentFile}\n`;
    }

    if (context.selectedCode) {
      prompt += `- Selected code in ${context.selectedCode.file} (lines ${context.selectedCode.startLine}-${context.selectedCode.endLine}):\n`;
      prompt += '```\n' + context.selectedCode.code + '\n```\n';
    }

    if (context.cursorPosition) {
      prompt += `- Cursor at ${context.cursorPosition.file}:${context.cursorPosition.line}:${context.cursorPosition.column}\n`;
    }

    if (context.recentActivity) {
      prompt += `- Recent activity:\n`;
      if (context.recentActivity.filesViewed.length > 0) {
        prompt += `  - Viewed: ${context.recentActivity.filesViewed.join(', ')}\n`;
      }
      if (context.recentActivity.filesEdited.length > 0) {
        prompt += `  - Edited: ${context.recentActivity.filesEdited.join(', ')}\n`;
      }
      if (context.recentActivity.collaborators.length > 0) {
        prompt += `  - Active collaborators: ${context.recentActivity.collaborators.join(', ')}\n`;
      }
    }

    prompt += `\nQuery intent: ${intent}\n`;

    // Add instructions based on intent
    prompt += `\nInstructions:\n`;
    switch (intent) {
      case 'history':
        prompt += `- Explain the history of changes to the selected code or current file\n`;
        prompt += `- Include who made changes, when, and why\n`;
        prompt += `- Mention impact of changes if relevant\n`;
        break;
      case 'impact':
        prompt += `- Predict the impact of potential changes\n`;
        prompt += `- Use TCI historical data to estimate success probability\n`;
        prompt += `- Warn about potential side effects or conflicts\n`;
        break;
      case 'expertise':
        prompt += `- Identify team members with expertise in this area\n`;
        prompt += `- Show commit percentages and recent activity\n`;
        prompt += `- Suggest who to ask for help\n`;
        break;
      case 'conflict':
        prompt += `- Detect potential merge conflicts or overlapping work\n`;
        prompt += `- Suggest resolution strategies\n`;
        prompt += `- Identify which collaborator to coordinate with\n`;
        break;
      default:
        prompt += `- Provide helpful, context-aware response\n`;
        prompt += `- Use TCI organizational memory when relevant\n`;
    }

    prompt += `\nNote: When user says "this" or "here", they're referring to the selected code or current file context above.\n`;

    return prompt;
  }

  /**
   * System prompt for TCI Assistant
   */
  private getTCIAssistantSystemPrompt(): string {
    return `You are the TCI (Temporal Code Intelligence) Chat Assistant for PlusUltra.

Your role is to make organizational memory accessible through natural conversation.

Key principles:
1. **Context-aware**: Understand "this", "here", "that" refer to selected code or current file
2. **Conversational**: Respond naturally, as if chatting with a teammate
3. **Actionable**: Provide specific insights, not vague observations
4. **Progressive disclosure**: Start concise, offer "Tell me more" for details
5. **Team-focused**: Highlight who did what, when, and why

Response format:
- Start with a direct answer to the question
- Include specific data (names, dates, percentages) when available
- Use emojis sparingly (📅 for dates, 👤 for people, ⚠️ for warnings)
- End with a suggestion or follow-up question if relevant

Example responses:

User: "Why did this change 2 days ago?"
Response: "Joel fixed a floating point precision bug in cart totals on Oct 24. This resolved 3 user reports about incorrect checkout amounts. The fix improved checkout accuracy by 12%.

Want me to show you the specific changes?"

User: "Who usually works on auth code?"
Response: "Based on TCI data:
• Joel: 65% of auth commits (last active 2 days ago)
• Sarah: 25% of auth commits (last active 1 week ago)
• Mike: 10% of auth commits

Joel last updated JWT logic on Oct 24. He's your best resource for auth questions."

User: "What's the impact if I change this payment method?"
Response: "⚠️ TCI predicts 92% success based on 23 similar changes in the last 6 months.

Warning: May affect Sarah's subscription service (SubscriptionManager.ts). She's actively working in that file right now.

Suggest: Coordinate with Sarah before merging to avoid conflicts."

Remember: You're the invisible brain making the team smarter. Stay helpful, stay humble, stay out of the way until needed.`;
  }

  /**
   * Format conversation history for Claude
   */
  private formatHistoryForClaude(history: ChatMessage[]): Array<{ role: 'user' | 'assistant'; content: string }> {
    // Only include last 5 messages to keep context manageable
    const recentHistory = history.slice(-5);

    return recentHistory.map((msg) => ({
      role: msg.role,
      content: msg.content,
    }));
  }

  /**
   * Extract structured query result from Claude's response
   */
  private async extractQueryResult(
    response: string,
    intent: string,
    context: ChatContext
  ): Promise<TCIQueryResult> {
    // In production, this would parse Claude's response for structured data
    // For now, return a basic structure

    return {
      type: intent as any,
      answer: response,
      data: {
        // Would contain parsed data from TCI
      },
      suggestions: this.extractSuggestions(response),
      relatedChanges: [],
    };
  }

  /**
   * Extract suggestions from response
   */
  private extractSuggestions(response: string): string[] {
    const suggestions: string[] = [];

    // Look for common suggestion patterns
    if (response.includes('Want me to')) {
      const match = response.match(/Want me to ([^?]+)\?/);
      if (match) suggestions.push(match[1]);
    }

    if (response.includes('Tell me more')) {
      suggestions.push('Tell me more');
    }

    if (response.includes('Show')) {
      const match = response.match(/Show ([^?\.]+)/);
      if (match) suggestions.push(`Show ${match[1]}`);
    }

    return suggestions;
  }

  /**
   * Check for potential conflicts with other collaborators
   */
  private async checkForCollaboratorConflicts(context: ChatContext): Promise<ProactiveAlert | null> {
    // In production, this would query TCI for overlapping work
    // For now, return null (no conflict detected)

    // Example:
    // if (someoneElseEditingSameLines) {
    //   return {
    //     id: `conflict_${Date.now()}`,
    //     type: 'conflict',
    //     severity: 'high',
    //     message: `Joel is editing the same code section in ${file}`,
    //     details: 'You both modified lines 45-67 in the last 5 minutes',
    //     actionable: true,
    //     actions: ['View Joel\'s changes', 'Coordinate in chat', 'Wait for Joel to finish'],
    //     timestamp: new Date()
    //   };
    // }

    return null;
  }

  /**
   * Check code quality of selected code
   */
  private async checkCodeQuality(context: ChatContext): Promise<ProactiveAlert | null> {
    // In production, this would analyze code complexity, patterns, etc.
    // For now, return null

    // Example:
    // if (cyclomaticComplexity > 20) {
    //   return {
    //     id: `quality_${Date.now()}`,
    //     type: 'suggestion',
    //     severity: 'medium',
    //     message: 'This function has high cyclomatic complexity (23)',
    //     details: 'Consider breaking it into smaller functions for better maintainability',
    //     actionable: true,
    //     actions: ['Show refactoring suggestions', 'Ignore for now'],
    //     timestamp: new Date()
    //   };
    // }

    return null;
  }

  /**
   * Check for recent related changes
   */
  private async checkRecentRelatedChanges(context: ChatContext): Promise<ProactiveAlert | null> {
    // In production, this would query TCI for recent changes
    // For now, return null

    // Example:
    // if (recentChangesByOthers) {
    //   return {
    //     id: `change_${Date.now()}`,
    //     type: 'insight',
    //     severity: 'low',
    //     message: 'Sarah edited this file 10 minutes ago',
    //     details: 'She refactored the error handling logic in lines 34-56',
    //     actionable: true,
    //     actions: ['View Sarah\'s changes', 'Ask Sarah about changes'],
    //     timestamp: new Date()
    //   };
    // }

    return null;
  }

  /**
   * Clear conversation history
   */
  clearConversation(conversationId: string): void {
    this.conversationHistory.delete(conversationId);
  }

  /**
   * Get conversation history
   */
  getConversationHistory(conversationId: string): ChatMessage[] {
    return this.conversationHistory.get(conversationId) || [];
  }

  /**
   * Get active conversations count
   */
  getActiveConversationsCount(): number {
    return this.conversationHistory.size;
  }
}

export default TCIChatAssistant;

import { EventEmitter } from 'events';
import TCIChatAssistant from '../tci/TCIChatAssistant';
import { TCIOrchestrator } from '../tci/TCIOrchestrator';
import { TruthConsistencyInterface, TCIModelOutput } from '../tci/TruthConsistencyInterface';
import GoogleDocsStyleCollaboration from './GoogleDocsStyleCollaboration';

/**
 * Collective Intelligence Orchestrator
 *
 * Enables AI-Era Collaboration: Multiple team members thinking together,
 * orchestrating AI agents to create cohesive solutions.
 *
 * Evolution:
 * - Traditional: Multiple people typing code
 * - AI-Era: Multiple people prompting AI together
 *
 * Philosophy: "We don't code together anymore. We think together."
 *
 * Use Case:
 * 👤 Product Manager: "Add Stripe subscriptions with 3 plans"
 * 👤 Designer: "Make the pricing page match our brand colors"
 * 👤 Developer: "Ensure webhook handles failed payments"
 * 👤 Founder: "Add annual billing with 20% discount"
 *
 * AI: *generates complete Stripe integration with ALL requirements*
 *
 * Without this orchestrator: 4 separate AI conversations, conflicting outputs
 * With this orchestrator: Unified intelligence session, cohesive solution
 */

export interface Stakeholder {
  id: string;
  name: string;
  email: string;
  role: 'product_manager' | 'designer' | 'developer' | 'founder' | 'compliance' | 'security' | 'other';
  avatar?: string;
  color: {
    name: string;
    hex: string;
    rgba: string;
  };
}

export interface CollaborativePrompt {
  id: string;
  stakeholderId: string;
  stakeholderName: string;
  stakeholderRole: string;
  content: string;
  timestamp: Date;
  priority: 'low' | 'medium' | 'high' | 'critical';
  constraints?: string[];
  examples?: string[];
}

export interface MergedRequirements {
  productRequirements: string[];
  designRequirements: string[];
  technicalRequirements: string[];
  complianceRequirements: string[];
  businessRequirements: string[];
  allPrompts: CollaborativePrompt[];
  mergedPrompt: string;
  conflictingRequirements?: string[];
  resolvedConflicts?: string[];
}

export interface AIGenerationSession {
  sessionId: string;
  projectId: string;
  stakeholders: Map<string, Stakeholder>;
  prompts: CollaborativePrompt[];
  mergedRequirements: MergedRequirements | null;
  aiOutputs: Map<string, AIOutput>; // model -> output
  consensusResult: any | null;
  refinementCycle: number;
  status: 'collecting_input' | 'generating' | 'reviewing' | 'refining' | 'completed';
  createdAt: Date;
  lastActivity: Date;
}

export interface AIOutput {
  model: string;
  output: string;
  confidence: number;
  processingTime: number;
  stakeholderFeedback: Map<string, StakeholderFeedback>;
  refinementCount: number;
}

export interface StakeholderFeedback {
  stakeholderId: string;
  stakeholderName: string;
  rating: 'approve' | 'needs_work' | 'reject';
  comment?: string;
  specificIssues?: string[];
  timestamp: Date;
}

export interface RefinementRequest {
  stakeholderId: string;
  stakeholderName: string;
  issues: string[];
  suggestedFixes: string[];
  priority: 'low' | 'medium' | 'high';
  timestamp: Date;
}

/**
 * Collective Intelligence Orchestrator
 *
 * Coordinates multiple stakeholders guiding AI agents together
 */
export class CollectiveIntelligenceOrchestrator extends EventEmitter {
  private sessions: Map<string, AIGenerationSession> = new Map();
  private tciChat: TCIChatAssistant;
  private tciOrchestrator: TCIOrchestrator | null = null;
  private collaboration: GoogleDocsStyleCollaboration;

  constructor(
    tciChat: TCIChatAssistant,
    collaboration: GoogleDocsStyleCollaboration,
    tciOrchestrator?: TCIOrchestrator
  ) {
    super();
    this.tciChat = tciChat;
    this.collaboration = collaboration;
    this.tciOrchestrator = tciOrchestrator || null;
  }

  /**
   * Create a new collective intelligence session
   */
  createSession(
    sessionId: string,
    projectId: string,
    initialStakeholder: Stakeholder
  ): AIGenerationSession {
    const session: AIGenerationSession = {
      sessionId,
      projectId,
      stakeholders: new Map([[initialStakeholder.id, initialStakeholder]]),
      prompts: [],
      mergedRequirements: null,
      aiOutputs: new Map(),
      consensusResult: null,
      refinementCycle: 0,
      status: 'collecting_input',
      createdAt: new Date(),
      lastActivity: new Date(),
    };

    this.sessions.set(sessionId, session);

    this.emit('session_created', { sessionId, projectId, stakeholder: initialStakeholder });

    return session;
  }

  /**
   * Add stakeholder to session
   */
  addStakeholder(sessionId: string, stakeholder: Stakeholder): void {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    session.stakeholders.set(stakeholder.id, stakeholder);
    session.lastActivity = new Date();

    this.emit('stakeholder_joined', { sessionId, stakeholder });
  }

  /**
   * Submit a prompt from a stakeholder
   *
   * Examples:
   * - Product Manager: "Add Stripe subscriptions with 3 plans"
   * - Designer: "Make the pricing page match our brand colors"
   * - Developer: "Ensure webhook handles failed payments"
   */
  async submitPrompt(
    sessionId: string,
    stakeholderId: string,
    content: string,
    priority: 'low' | 'medium' | 'high' | 'critical' = 'medium',
    constraints?: string[],
    examples?: string[]
  ): Promise<CollaborativePrompt> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    const stakeholder = session.stakeholders.get(stakeholderId);
    if (!stakeholder) throw new Error('Stakeholder not found in session');

    const prompt: CollaborativePrompt = {
      id: `prompt_${Date.now()}_${stakeholderId}`,
      stakeholderId,
      stakeholderName: stakeholder.name,
      stakeholderRole: stakeholder.role,
      content,
      timestamp: new Date(),
      priority,
      constraints,
      examples,
    };

    session.prompts.push(prompt);
    session.lastActivity = new Date();

    this.emit('prompt_submitted', { sessionId, prompt, stakeholder });

    return prompt;
  }

  /**
   * Merge all stakeholder requirements into unified prompt
   *
   * Takes input from:
   * - Product managers (features, user stories)
   * - Designers (UI/UX, brand guidelines)
   * - Developers (technical constraints, architecture)
   * - Compliance officers (legal, security requirements)
   * - Founders (business goals, priorities)
   *
   * Produces: Single coherent prompt for AI agents
   */
  async mergeRequirements(sessionId: string): Promise<MergedRequirements> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    // Categorize prompts by role
    const productRequirements: string[] = [];
    const designRequirements: string[] = [];
    const technicalRequirements: string[] = [];
    const complianceRequirements: string[] = [];
    const businessRequirements: string[] = [];

    session.prompts.forEach((prompt) => {
      const requirement = `${prompt.stakeholderName} (${prompt.stakeholderRole}): ${prompt.content}`;

      switch (prompt.stakeholderRole) {
        case 'product_manager':
          productRequirements.push(requirement);
          break;
        case 'designer':
          designRequirements.push(requirement);
          break;
        case 'developer':
          technicalRequirements.push(requirement);
          break;
        case 'compliance':
        case 'security':
          complianceRequirements.push(requirement);
          break;
        case 'founder':
          businessRequirements.push(requirement);
          break;
        default:
          productRequirements.push(requirement);
      }
    });

    // Build merged prompt
    let mergedPrompt = '# Collective Intelligence Session\n\n';
    mergedPrompt += `Project: ${session.projectId}\n`;
    mergedPrompt += `Stakeholders: ${Array.from(session.stakeholders.values()).map(s => s.name).join(', ')}\n`;
    mergedPrompt += `Total Requirements: ${session.prompts.length}\n\n`;

    if (businessRequirements.length > 0) {
      mergedPrompt += '## Business Requirements (Highest Priority)\n';
      businessRequirements.forEach((req) => (mergedPrompt += `- ${req}\n`));
      mergedPrompt += '\n';
    }

    if (productRequirements.length > 0) {
      mergedPrompt += '## Product Requirements\n';
      productRequirements.forEach((req) => (mergedPrompt += `- ${req}\n`));
      mergedPrompt += '\n';
    }

    if (designRequirements.length > 0) {
      mergedPrompt += '## Design Requirements\n';
      designRequirements.forEach((req) => (mergedPrompt += `- ${req}\n`));
      mergedPrompt += '\n';
    }

    if (technicalRequirements.length > 0) {
      mergedPrompt += '## Technical Requirements\n';
      technicalRequirements.forEach((req) => (mergedPrompt += `- ${req}\n`));
      mergedPrompt += '\n';
    }

    if (complianceRequirements.length > 0) {
      mergedPrompt += '## Compliance & Security Requirements (MUST SATISFY)\n';
      complianceRequirements.forEach((req) => (mergedPrompt += `- ${req}\n`));
      mergedPrompt += '\n';
    }

    // Detect conflicting requirements
    const conflictingRequirements = await this.detectConflicts(session.prompts);

    mergedPrompt += '## Instructions for AI Agents\n';
    mergedPrompt += '- Satisfy ALL requirements above\n';
    mergedPrompt += '- Prioritize: Compliance > Business > Product > Design > Technical\n';
    mergedPrompt += '- Generate cohesive solution that balances all stakeholder needs\n';
    mergedPrompt += '- Flag any requirements that cannot be simultaneously satisfied\n';

    if (conflictingRequirements.length > 0) {
      mergedPrompt += '\n## Detected Conflicts (Require Resolution)\n';
      conflictingRequirements.forEach((conflict) => (mergedPrompt += `- ${conflict}\n`));
    }

    const mergedRequirements: MergedRequirements = {
      productRequirements,
      designRequirements,
      technicalRequirements,
      complianceRequirements,
      businessRequirements,
      allPrompts: session.prompts,
      mergedPrompt,
      conflictingRequirements,
      resolvedConflicts: [],
    };

    session.mergedRequirements = mergedRequirements;
    session.lastActivity = new Date();

    this.emit('requirements_merged', { sessionId, mergedRequirements });

    return mergedRequirements;
  }

  /**
   * Generate AI solution with multiple models (GPT-5, Claude, Grok)
   */
  async generateSolution(sessionId: string): Promise<Map<string, AIOutput>> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    if (!session.mergedRequirements) {
      throw new Error('Requirements must be merged before generation');
    }

    session.status = 'generating';
    session.lastActivity = new Date();

    this.emit('generation_started', { sessionId });

    // In production, this would call actual AI models
    // For now, simulate with placeholder outputs
    const models = ['gpt-5', 'claude-3.5-sonnet', 'grok-2'];

    const outputs = new Map<string, AIOutput>();

    for (const model of models) {
      const output: AIOutput = {
        model,
        output: `[${model.toUpperCase()}] Generated solution based on:\n${session.mergedRequirements.mergedPrompt.substring(0, 200)}...`,
        confidence: 0.85 + Math.random() * 0.1,
        processingTime: 2000 + Math.random() * 3000,
        stakeholderFeedback: new Map(),
        refinementCount: 0,
      };

      outputs.set(model, output);
      session.aiOutputs.set(model, output);
    }

    session.status = 'reviewing';
    session.lastActivity = new Date();

    this.emit('generation_completed', { sessionId, outputs });

    return outputs;
  }

  /**
   * Stakeholder reviews AI output and provides feedback
   *
   * Example:
   * 👤 Sarah (Designer): "The pricing table looks wrong on mobile"
   * 👤 Joel (Developer): "I see the issue - the breakpoints are off"
   */
  async submitFeedback(
    sessionId: string,
    stakeholderId: string,
    model: string,
    rating: 'approve' | 'needs_work' | 'reject',
    comment?: string,
    specificIssues?: string[]
  ): Promise<StakeholderFeedback> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    const stakeholder = session.stakeholders.get(stakeholderId);
    if (!stakeholder) throw new Error('Stakeholder not found');

    const aiOutput = session.aiOutputs.get(model);
    if (!aiOutput) throw new Error('AI output not found for model');

    const feedback: StakeholderFeedback = {
      stakeholderId,
      stakeholderName: stakeholder.name,
      rating,
      comment,
      specificIssues,
      timestamp: new Date(),
    };

    aiOutput.stakeholderFeedback.set(stakeholderId, feedback);
    session.lastActivity = new Date();

    this.emit('feedback_submitted', { sessionId, model, feedback, stakeholder });

    // Check if all stakeholders have provided feedback
    const allFeedbackReceived = Array.from(session.stakeholders.keys()).every((id) =>
      aiOutput.stakeholderFeedback.has(id)
    );

    if (allFeedbackReceived) {
      this.emit('all_feedback_received', { sessionId, model });
      await this.evaluateConsensus(sessionId);
    }

    return feedback;
  }

  /**
   * Refine AI output based on stakeholder feedback
   *
   * Example flow:
   * 1. Designer: "Pricing table broken on mobile"
   * 2. Developer: "Breakpoints are off"
   * 3. AI: *refines with fixed responsive design*
   */
  async refineOutput(
    sessionId: string,
    model: string,
    refinementRequests: RefinementRequest[]
  ): Promise<AIOutput> {
    const session = this.sessions.get(sessionId);
    if (!session) throw new Error('Session not found');

    const aiOutput = session.aiOutputs.get(model);
    if (!aiOutput) throw new Error('AI output not found for model');

    session.status = 'refining';
    session.refinementCycle++;
    session.lastActivity = new Date();

    this.emit('refinement_started', { sessionId, model, refinementRequests });

    // Build refinement prompt
    let refinementPrompt = '# Refinement Request\n\n';
    refinementPrompt += `Original output:\n${aiOutput.output.substring(0, 500)}...\n\n`;
    refinementPrompt += `Stakeholder feedback:\n`;

    refinementRequests.forEach((req) => {
      refinementPrompt += `\n${req.stakeholderName} (${req.priority} priority):\n`;
      req.issues.forEach((issue) => (refinementPrompt += `- Issue: ${issue}\n`));
      req.suggestedFixes.forEach((fix) => (refinementPrompt += `- Suggested fix: ${fix}\n`));
    });

    refinementPrompt += '\nPlease refine the output to address ALL feedback above.\n';

    // In production, this would call the actual AI model for refinement
    const refinedOutput: AIOutput = {
      model,
      output: `[${model.toUpperCase()} REFINED v${session.refinementCycle}]\n${refinementPrompt.substring(0, 300)}...\n[Refinements applied based on stakeholder feedback]`,
      confidence: aiOutput.confidence + 0.05,
      processingTime: 1500 + Math.random() * 2000,
      stakeholderFeedback: new Map(),
      refinementCount: aiOutput.refinementCount + 1,
    };

    session.aiOutputs.set(model, refinedOutput);
    session.status = 'reviewing';
    session.lastActivity = new Date();

    this.emit('refinement_completed', { sessionId, model, refinedOutput });

    return refinedOutput;
  }

  /**
   * Evaluate consensus among stakeholders
   */
  private async evaluateConsensus(sessionId: string): Promise<void> {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    const consensusResults: any[] = [];

    session.aiOutputs.forEach((output, model) => {
      const feedbacks = Array.from(output.stakeholderFeedback.values());
      const approvals = feedbacks.filter((f) => f.rating === 'approve').length;
      const total = feedbacks.length;
      const approvalRate = total > 0 ? approvals / total : 0;

      consensusResults.push({
        model,
        approvalRate,
        approvals,
        total,
        needsWork: feedbacks.filter((f) => f.rating === 'needs_work').length,
        rejections: feedbacks.filter((f) => f.rating === 'reject').length,
      });
    });

    // Find best model
    const bestResult = consensusResults.reduce((best, current) =>
      current.approvalRate > best.approvalRate ? current : best
    );

    if (bestResult.approvalRate >= 0.8) {
      // 80% approval threshold
      session.status = 'completed';
      session.consensusResult = bestResult;

      this.emit('consensus_reached', { sessionId, bestResult });
    } else {
      this.emit('consensus_not_reached', { sessionId, consensusResults });
    }
  }

  /**
   * Detect conflicting requirements
   */
  private async detectConflicts(prompts: CollaborativePrompt[]): Promise<string[]> {
    const conflicts: string[] = [];

    // Simple conflict detection (in production, would use AI)
    const keywords = {
      speed: ['fast', 'quick', 'performance', 'speed'],
      complexity: ['simple', 'minimal', 'complex', 'feature-rich'],
      cost: ['cheap', 'expensive', 'budget', 'premium'],
    };

    // Check for speed vs features conflict
    const speedRequests = prompts.filter((p) => keywords.speed.some((kw) => p.content.toLowerCase().includes(kw)));
    const complexRequests = prompts.filter((p) =>
      ['feature-rich', 'complex', 'comprehensive'].some((kw) => p.content.toLowerCase().includes(kw))
    );

    if (speedRequests.length > 0 && complexRequests.length > 0) {
      conflicts.push(
        `Performance vs Features: ${speedRequests[0].stakeholderName} wants high performance, but ${complexRequests[0].stakeholderName} wants feature-rich solution`
      );
    }

    return conflicts;
  }

  /**
   * Get session state
   */
  getSession(sessionId: string): AIGenerationSession | null {
    return this.sessions.get(sessionId) || null;
  }

  /**
   * Get all active sessions
   */
  getActiveSessions(): AIGenerationSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.status !== 'completed');
  }

  /**
   * End session
   */
  endSession(sessionId: string): void {
    const session = this.sessions.get(sessionId);
    if (!session) return;

    session.status = 'completed';
    session.lastActivity = new Date();

    this.emit('session_ended', { sessionId });
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalSessions: number;
    activeSessions: number;
    completedSessions: number;
    totalStakeholders: number;
    totalPrompts: number;
    averageRefinementCycles: number;
  } {
    const sessions = Array.from(this.sessions.values());
    const activeSessions = sessions.filter((s) => s.status !== 'completed');
    const completedSessions = sessions.filter((s) => s.status === 'completed');

    return {
      totalSessions: sessions.length,
      activeSessions: activeSessions.length,
      completedSessions: completedSessions.length,
      totalStakeholders: sessions.reduce((sum, s) => sum + s.stakeholders.size, 0),
      totalPrompts: sessions.reduce((sum, s) => sum + s.prompts.length, 0),
      averageRefinementCycles:
        sessions.reduce((sum, s) => sum + s.refinementCycle, 0) / Math.max(sessions.length, 1),
    };
  }
}

export default CollectiveIntelligenceOrchestrator;

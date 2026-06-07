/**
 * Architectural Plan Service - Pre-Execution Planning for TCI
 *
 * This service generates architectural plans BEFORE any code is written.
 * The AI council votes on plans before implementation begins.
 *
 * Flow:
 * 1. Intent received from IntentPredictionService
 * 2. Claude designs the primary architecture
 * 3. Alternative approaches are generated (2-3 options)
 * 4. Risk assessment is performed
 * 5. AI Council (Claude, GPT, Gemini, Grok) votes on best approach
 * 6. Winning plan is approved and stored for implementation
 *
 * Integration Points:
 * - Anthropic (Claude) for primary architecture design
 * - OpenAI (GPT-5) for alternative perspectives
 * - Google AI (Gemini) for synthesis and evaluation
 * - xAI (Grok) for logical verification
 * - PostgreSQL (Prisma) for plan storage
 * - Pinecone for similarity search of past plans
 */

import Anthropic from '@anthropic-ai/sdk';
import OpenAI from 'openai';
import { GoogleGenerativeAI } from '@google/generative-ai';
import axios from 'axios';
import { prisma } from '../../lib/prisma';
import { pineconeService } from '../vector/PineconeService';
import type { Prisma } from '@prisma/client';

// ============================================================
// Type Definitions
// ============================================================

export interface ArchitecturalPlan {
  id: string;
  projectId: string;
  userId: string;
  createdAt: Date;

  // What we're trying to build (from IntentPredictionService)
  intent: string;

  // The proposed architecture
  architecture: {
    components: Component[];
    dataFlow: DataFlow[];
    dependencies: Dependency[];
    patterns: string[]; // Design patterns used
  };

  // Alternative approaches considered
  alternatives: AlternativePlan[];

  // Risk assessment from TCI analysis
  riskAssessment: RiskAssessment;

  // AI Council voting results
  councilVote: CouncilVote;

  // Status
  status: 'proposed' | 'voting' | 'approved' | 'rejected' | 'implemented';
}

export interface Component {
  name: string;
  type: 'service' | 'controller' | 'model' | 'util' | 'middleware';
  responsibility: string;
  dependencies: string[];
  filePath: string; // Where it will be created
}

export interface DataFlow {
  from: string;
  to: string;
  dataType: string;
  description: string;
}

export interface Dependency {
  name: string;
  version: string;
  purpose: string;
  isRequired: boolean;
}

export interface AlternativePlan {
  id: string;
  summary: string;
  pros: string[];
  cons: string[];
  estimatedComplexity: 'low' | 'medium' | 'high';
}

export interface RiskAssessment {
  overallRisk: number; // 0-10
  securityRisks: string[];
  scalabilityRisks: string[];
  maintainabilityRisks: string[];
}

export interface CouncilVote {
  votes: ModelVote[];
  consensus: number; // 0-1 agreement level
  winner: string; // Plan ID that won
  reasoning: string; // Why this plan was chosen
  votedAt: Date;
}

export interface ModelVote {
  model: 'claude' | 'gpt' | 'gemini' | 'grok';
  planId: string; // Which plan they voted for
  confidence: number;
  reasoning: string;
}

interface ProjectContext {
  name: string;
  description?: string;
  framework?: string;
  language?: string;
  existingComponents?: string[];
  constraints?: string[];
}

// ============================================================
// Architectural Plan Service
// ============================================================

export class ArchitecturalPlanService {
  private anthropic: Anthropic;
  private openai: OpenAI;
  private gemini: GoogleGenerativeAI;
  private grokApiKey: string;

  // In-memory plan storage (would be supplemented by database)
  private plans: Map<string, ArchitecturalPlan> = new Map();

  constructor() {
    this.anthropic = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || '',
    });

    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY || '',
    });

    this.gemini = new GoogleGenerativeAI(
      process.env.GOOGLE_API_KEY || ''
    );

    this.grokApiKey = process.env.GROK_API_KEY || process.env.XAI_API_KEY || '';
  }

  /**
   * Generate an architectural plan for the given intent
   * Main entry point for plan generation
   */
  async generatePlan(
    intent: string,
    projectContext: ProjectContext,
    userId: string
  ): Promise<ArchitecturalPlan> {
    console.log('[ArchitecturalPlanService] Generating plan for intent:', intent);
    const startTime = Date.now();

    try {
      // Step 1: Generate main architecture using Claude
      const mainArchitecture = await this.designArchitecture(intent, projectContext);

      // Step 2: Generate alternative approaches
      const alternatives = await this.generateAlternatives(intent, projectContext, mainArchitecture);

      // Step 3: Assess risks
      const riskAssessment = await this.assessRiskInternal(mainArchitecture, projectContext);

      // Create the plan
      const planId = this.generatePlanId();
      const plan: ArchitecturalPlan = {
        id: planId,
        projectId: projectContext.name,
        userId,
        createdAt: new Date(),
        intent,
        architecture: mainArchitecture,
        alternatives,
        riskAssessment,
        councilVote: {
          votes: [],
          consensus: 0,
          winner: '',
          reasoning: '',
          votedAt: new Date(),
        },
        status: 'proposed',
      };

      // Store in memory and database
      this.plans.set(planId, plan);
      await this.storePlanInDatabase(plan);

      // Store embeddings for similarity search
      await this.storePlanEmbedding(plan);

      const elapsed = Date.now() - startTime;
      console.log(`[ArchitecturalPlanService] Plan generated in ${elapsed}ms`);

      return plan;
    } catch (error: any) {
      console.error('[ArchitecturalPlanService] Plan generation failed:', error.message);
      throw new Error(`Failed to generate architectural plan: ${error.message}`);
    }
  }

  /**
   * Design the main architecture using Claude
   */
  private async designArchitecture(
    intent: string,
    projectContext: ProjectContext
  ): Promise<ArchitecturalPlan['architecture']> {
    const prompt = this.buildArchitecturePrompt(intent, projectContext);

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-5-20250929',
      max_tokens: 4096,
      messages: [{ role: 'user', content: prompt }],
    });

    const content = response.content[0];
    if (content.type !== 'text') {
      throw new Error('Unexpected response type from Claude');
    }

    return this.parseArchitectureResponse(content.text);
  }

  /**
   * Build the architecture design prompt
   */
  private buildArchitecturePrompt(intent: string, projectContext: ProjectContext): string {
    return `You are a senior software architect designing a system architecture. Your task is to create a comprehensive, production-ready architectural plan.

PROJECT CONTEXT:
- Name: ${projectContext.name}
- Description: ${projectContext.description || 'Not provided'}
- Framework: ${projectContext.framework || 'To be determined'}
- Language: ${projectContext.language || 'TypeScript'}
- Existing Components: ${projectContext.existingComponents?.join(', ') || 'None'}
- Constraints: ${projectContext.constraints?.join(', ') || 'None'}

USER INTENT:
${intent}

Please design an architecture that includes:

1. COMPONENTS: List all components needed with their responsibilities
2. DATA FLOW: How data moves between components
3. DEPENDENCIES: External libraries and packages needed
4. DESIGN PATTERNS: Which patterns to use and why

Respond in this exact JSON format:
{
  "components": [
    {
      "name": "ComponentName",
      "type": "service|controller|model|util|middleware",
      "responsibility": "What this component does",
      "dependencies": ["OtherComponent1", "OtherComponent2"],
      "filePath": "src/services/ComponentName.ts"
    }
  ],
  "dataFlow": [
    {
      "from": "ComponentA",
      "to": "ComponentB",
      "dataType": "UserRequest",
      "description": "Passes validated user input"
    }
  ],
  "dependencies": [
    {
      "name": "package-name",
      "version": "^1.0.0",
      "purpose": "Why this package is needed",
      "isRequired": true
    }
  ],
  "patterns": ["Repository Pattern", "Dependency Injection", "etc"]
}

Be thorough and consider:
- Separation of concerns
- Testability
- Error handling
- Security
- Scalability`;
  }

  /**
   * Parse Claude's architecture response
   */
  private parseArchitectureResponse(response: string): ArchitecturalPlan['architecture'] {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        components: parsed.components || [],
        dataFlow: parsed.dataFlow || [],
        dependencies: parsed.dependencies || [],
        patterns: parsed.patterns || [],
      };
    } catch (error: any) {
      console.error('[ArchitecturalPlanService] Failed to parse architecture response:', error);

      // Return default architecture on parse failure
      return {
        components: [],
        dataFlow: [],
        dependencies: [],
        patterns: [],
      };
    }
  }

  /**
   * Generate alternative architectural approaches
   */
  async generateAlternatives(
    intent: string,
    projectContext: ProjectContext,
    mainArchitecture: ArchitecturalPlan['architecture']
  ): Promise<AlternativePlan[]> {
    console.log('[ArchitecturalPlanService] Generating alternative approaches');

    const prompt = this.buildAlternativesPrompt(intent, projectContext, mainArchitecture);

    try {
      // Use GPT-5 for alternative perspectives
      const response = await this.openai.chat.completions.create({
        model: 'gpt-5',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 3000,
      });

      const content = response.choices[0]?.message?.content || '';
      return this.parseAlternativesResponse(content);
    } catch (error: any) {
      console.error('[ArchitecturalPlanService] Failed to generate alternatives:', error.message);

      // Return default alternatives on failure
      return [
        {
          id: this.generateAlternativeId(),
          summary: 'Simplified Monolithic Approach',
          pros: ['Faster initial development', 'Simpler deployment'],
          cons: ['Less scalable', 'Tighter coupling'],
          estimatedComplexity: 'low',
        },
        {
          id: this.generateAlternativeId(),
          summary: 'Microservices Architecture',
          pros: ['Highly scalable', 'Independent deployment'],
          cons: ['More complex', 'Requires orchestration'],
          estimatedComplexity: 'high',
        },
      ];
    }
  }

  /**
   * Build the alternatives generation prompt
   */
  private buildAlternativesPrompt(
    intent: string,
    projectContext: ProjectContext,
    mainArchitecture: ArchitecturalPlan['architecture']
  ): string {
    return `You are a senior software architect. Given the following main architecture proposal, suggest 2-3 alternative approaches with different trade-offs.

USER INTENT:
${intent}

PROJECT CONTEXT:
- Framework: ${projectContext.framework || 'Not specified'}
- Language: ${projectContext.language || 'TypeScript'}

MAIN ARCHITECTURE PROPOSAL:
- Components: ${mainArchitecture.components.map(c => c.name).join(', ')}
- Patterns: ${mainArchitecture.patterns.join(', ')}

Generate alternative approaches that offer different trade-offs (e.g., simpler vs more scalable, faster to implement vs more maintainable).

Respond in this exact JSON format:
{
  "alternatives": [
    {
      "id": "alt-1",
      "summary": "Brief description of this approach",
      "pros": ["Advantage 1", "Advantage 2"],
      "cons": ["Disadvantage 1", "Disadvantage 2"],
      "estimatedComplexity": "low|medium|high"
    }
  ]
}`;
  }

  /**
   * Parse alternatives response
   */
  private parseAlternativesResponse(response: string): AlternativePlan[] {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);
      return (parsed.alternatives || []).map((alt: any, index: number) => ({
        id: alt.id || this.generateAlternativeId(),
        summary: alt.summary || `Alternative ${index + 1}`,
        pros: alt.pros || [],
        cons: alt.cons || [],
        estimatedComplexity: alt.estimatedComplexity || 'medium',
      }));
    } catch (error) {
      console.error('[ArchitecturalPlanService] Failed to parse alternatives:', error);
      return [];
    }
  }

  /**
   * Submit a plan for AI council voting
   */
  async submitForVoting(planId: string): Promise<CouncilVote> {
    console.log(`[ArchitecturalPlanService] Submitting plan ${planId} for council voting`);

    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    // Update status
    plan.status = 'voting';

    // Collect votes from all AI council members in parallel
    const [claudeVote, gptVote, geminiVote, grokVote] = await Promise.all([
      this.getClaudeVote(plan),
      this.getGPTVote(plan),
      this.getGeminiVote(plan),
      this.getGrokVote(plan),
    ]);

    const votes: ModelVote[] = [claudeVote, gptVote, geminiVote, grokVote];

    // Calculate consensus and determine winner
    const { consensus, winner, reasoning } = this.calculateConsensus(votes, plan);

    const councilVote: CouncilVote = {
      votes,
      consensus,
      winner,
      reasoning,
      votedAt: new Date(),
    };

    // Update plan with voting results
    plan.councilVote = councilVote;
    plan.status = consensus >= 0.6 ? 'approved' : 'rejected';

    // Update in database
    await this.updatePlanInDatabase(plan);

    console.log(`[ArchitecturalPlanService] Council vote complete. Consensus: ${(consensus * 100).toFixed(1)}%, Winner: ${winner}`);

    return councilVote;
  }

  /**
   * Get Claude's vote on the plan
   */
  private async getClaudeVote(plan: ArchitecturalPlan): Promise<ModelVote> {
    const prompt = this.buildVotingPrompt(plan, 'claude');

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 1500,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      return this.parseVoteResponse(content.text, 'claude', plan);
    } catch (error: any) {
      console.error('[ArchitecturalPlanService] Claude vote failed:', error.message);
      return {
        model: 'claude',
        planId: plan.id,
        confidence: 0.5,
        reasoning: 'Vote failed - defaulting to neutral',
      };
    }
  }

  /**
   * Get GPT's vote on the plan
   */
  private async getGPTVote(plan: ArchitecturalPlan): Promise<ModelVote> {
    const prompt = this.buildVotingPrompt(plan, 'gpt');

    try {
      const response = await this.openai.chat.completions.create({
        model: 'gpt-5',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 1500,
      });

      const content = response.choices[0]?.message?.content || '';
      return this.parseVoteResponse(content, 'gpt', plan);
    } catch (error: any) {
      console.error('[ArchitecturalPlanService] GPT vote failed:', error.message);
      return {
        model: 'gpt',
        planId: plan.id,
        confidence: 0.5,
        reasoning: 'Vote failed - defaulting to neutral',
      };
    }
  }

  /**
   * Get Gemini's vote on the plan
   */
  private async getGeminiVote(plan: ArchitecturalPlan): Promise<ModelVote> {
    const prompt = this.buildVotingPrompt(plan, 'gemini');

    try {
      const model = this.gemini.getGenerativeModel({ model: 'gemini-2.5-pro' });
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: 1500,
          temperature: 0.3,
        },
      });

      const content = result.response.text();
      return this.parseVoteResponse(content, 'gemini', plan);
    } catch (error: any) {
      console.error('[ArchitecturalPlanService] Gemini vote failed:', error.message);
      return {
        model: 'gemini',
        planId: plan.id,
        confidence: 0.5,
        reasoning: 'Vote failed - defaulting to neutral',
      };
    }
  }

  /**
   * Get Grok's vote on the plan
   */
  private async getGrokVote(plan: ArchitecturalPlan): Promise<ModelVote> {
    const prompt = this.buildVotingPrompt(plan, 'grok');

    try {
      const response = await axios.post(
        'https://api.x.ai/v1/chat/completions',
        {
          model: 'grok-2',
          messages: [
            {
              role: 'system',
              content: 'You are Grok, evaluating architectural plans with logical rigor.',
            },
            {
              role: 'user',
              content: prompt,
            },
          ],
          max_tokens: 1500,
          temperature: 0.3,
        },
        {
          headers: {
            'Authorization': `Bearer ${this.grokApiKey}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const content = response.data.choices[0]?.message?.content || '';
      return this.parseVoteResponse(content, 'grok', plan);
    } catch (error: any) {
      console.error('[ArchitecturalPlanService] Grok vote failed:', error.message);
      return {
        model: 'grok',
        planId: plan.id,
        confidence: 0.5,
        reasoning: 'Vote failed - defaulting to neutral',
      };
    }
  }

  /**
   * Build the voting prompt for council members
   */
  private buildVotingPrompt(plan: ArchitecturalPlan, model: string): string {
    const alternativesList = plan.alternatives.map((alt, i) =>
      `Alternative ${i + 1} (${alt.id}): ${alt.summary}\n  Pros: ${alt.pros.join(', ')}\n  Cons: ${alt.cons.join(', ')}\n  Complexity: ${alt.estimatedComplexity}`
    ).join('\n\n');

    return `You are evaluating architectural plans as part of an AI council. Your vote determines whether this plan should be implemented.

INTENT:
${plan.intent}

MAIN PLAN (${plan.id}):
- Components: ${plan.architecture.components.map(c => `${c.name} (${c.type})`).join(', ')}
- Patterns: ${plan.architecture.patterns.join(', ')}
- Risk Score: ${plan.riskAssessment.overallRisk}/10

ALTERNATIVE PLANS:
${alternativesList}

RISK ASSESSMENT:
- Overall Risk: ${plan.riskAssessment.overallRisk}/10
- Security Risks: ${plan.riskAssessment.securityRisks.join(', ') || 'None identified'}
- Scalability Risks: ${plan.riskAssessment.scalabilityRisks.join(', ') || 'None identified'}
- Maintainability Risks: ${plan.riskAssessment.maintainabilityRisks.join(', ') || 'None identified'}

As ${model.toUpperCase()}, evaluate these plans and vote for the best one.

Respond in this exact JSON format:
{
  "votedPlanId": "plan-id or alt-X",
  "confidence": 0.0-1.0,
  "reasoning": "Why you voted for this plan"
}

Consider:
- Does the architecture match the intent?
- Are the patterns appropriate?
- Is the risk level acceptable?
- Is there a better alternative?`;
  }

  /**
   * Parse a vote response from an AI model
   */
  private parseVoteResponse(response: string, model: 'claude' | 'gpt' | 'gemini' | 'grok', plan: ArchitecturalPlan): ModelVote {
    try {
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in vote response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      // Validate voted plan ID
      let votedPlanId = parsed.votedPlanId || plan.id;
      const validPlanIds = [plan.id, ...plan.alternatives.map(a => a.id)];
      if (!validPlanIds.includes(votedPlanId)) {
        votedPlanId = plan.id; // Default to main plan if invalid
      }

      return {
        model,
        planId: votedPlanId,
        confidence: Math.min(1, Math.max(0, parsed.confidence || 0.7)),
        reasoning: parsed.reasoning || 'No reasoning provided',
      };
    } catch (error) {
      console.error(`[ArchitecturalPlanService] Failed to parse ${model} vote:`, error);
      return {
        model,
        planId: plan.id,
        confidence: 0.6,
        reasoning: 'Vote parsing failed - defaulting to main plan',
      };
    }
  }

  /**
   * Calculate consensus from votes
   */
  private calculateConsensus(
    votes: ModelVote[],
    plan: ArchitecturalPlan
  ): { consensus: number; winner: string; reasoning: string } {
    // Count votes per plan
    const voteCounts: Record<string, number> = {};
    const voteConfidences: Record<string, number[]> = {};

    for (const vote of votes) {
      voteCounts[vote.planId] = (voteCounts[vote.planId] || 0) + 1;
      if (!voteConfidences[vote.planId]) {
        voteConfidences[vote.planId] = [];
      }
      voteConfidences[vote.planId].push(vote.confidence);
    }

    // Find the plan with most votes
    let winner = plan.id;
    let maxVotes = 0;

    for (const [planId, count] of Object.entries(voteCounts)) {
      if (count > maxVotes) {
        maxVotes = count;
        winner = planId;
      }
    }

    // Calculate consensus (percentage of votes for winner)
    const consensus = maxVotes / votes.length;

    // Calculate average confidence of winning votes
    const winnerConfidences = voteConfidences[winner] || [];
    const avgConfidence = winnerConfidences.length > 0
      ? winnerConfidences.reduce((a, b) => a + b, 0) / winnerConfidences.length
      : 0.5;

    // Generate reasoning based on votes
    const winnerVotes = votes.filter(v => v.planId === winner);
    const reasonings = winnerVotes.map(v => `${v.model.toUpperCase()}: ${v.reasoning}`);

    const reasoning = `Consensus: ${(consensus * 100).toFixed(0)}% (${maxVotes}/${votes.length} votes). ` +
      `Average confidence: ${(avgConfidence * 100).toFixed(0)}%. ` +
      `Reasoning: ${reasonings.join(' | ')}`;

    return { consensus, winner, reasoning };
  }

  /**
   * Assess risks for a plan
   */
  async assessRisk(planId: string): Promise<RiskAssessment> {
    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    return this.assessRiskInternal(plan.architecture, { name: plan.projectId });
  }

  /**
   * Internal risk assessment implementation
   */
  private async assessRiskInternal(
    architecture: ArchitecturalPlan['architecture'],
    projectContext: ProjectContext
  ): Promise<RiskAssessment> {
    console.log('[ArchitecturalPlanService] Assessing risks');

    const prompt = `You are a security and architecture expert. Assess the risks of this proposed architecture.

ARCHITECTURE:
- Components: ${architecture.components.map(c => `${c.name} (${c.type}): ${c.responsibility}`).join('\n')}
- Dependencies: ${architecture.dependencies.map(d => `${d.name}@${d.version}: ${d.purpose}`).join('\n')}
- Patterns: ${architecture.patterns.join(', ')}

PROJECT: ${projectContext.name}

Identify risks in these categories:
1. Security Risks (authentication, authorization, data protection, injection vulnerabilities)
2. Scalability Risks (bottlenecks, single points of failure, resource constraints)
3. Maintainability Risks (code complexity, tight coupling, documentation needs)

Respond in this exact JSON format:
{
  "overallRisk": 0-10,
  "securityRisks": ["Risk 1", "Risk 2"],
  "scalabilityRisks": ["Risk 1", "Risk 2"],
  "maintainabilityRisks": ["Risk 1", "Risk 2"]
}`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      });

      const content = response.content[0];
      if (content.type !== 'text') {
        throw new Error('Unexpected response type');
      }

      const jsonMatch = content.text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new Error('No JSON found in response');
      }

      const parsed = JSON.parse(jsonMatch[0]);

      return {
        overallRisk: Math.min(10, Math.max(0, parsed.overallRisk || 5)),
        securityRisks: parsed.securityRisks || [],
        scalabilityRisks: parsed.scalabilityRisks || [],
        maintainabilityRisks: parsed.maintainabilityRisks || [],
      };
    } catch (error: any) {
      console.error('[ArchitecturalPlanService] Risk assessment failed:', error.message);

      // Return moderate risk assessment on failure
      return {
        overallRisk: 5,
        securityRisks: ['Risk assessment failed - manual review recommended'],
        scalabilityRisks: [],
        maintainabilityRisks: [],
      };
    }
  }

  /**
   * Approve a plan after council consensus
   */
  async approvePlan(planId: string): Promise<void> {
    console.log(`[ArchitecturalPlanService] Approving plan: ${planId}`);

    const plan = this.plans.get(planId);
    if (!plan) {
      throw new Error(`Plan not found: ${planId}`);
    }

    if (plan.councilVote.consensus < 0.5) {
      throw new Error(`Cannot approve plan with low consensus: ${(plan.councilVote.consensus * 100).toFixed(0)}%`);
    }

    plan.status = 'approved';

    // Update in database
    await this.updatePlanInDatabase(plan);

    // Store in knowledge base for future reference
    await this.storeInKnowledgeBase(plan);

    console.log(`[ArchitecturalPlanService] Plan ${planId} approved and stored in knowledge base`);
  }

  /**
   * Get plan history for a project
   */
  async getPlanHistory(projectId: string): Promise<ArchitecturalPlan[]> {
    console.log(`[ArchitecturalPlanService] Fetching plan history for project: ${projectId}`);

    try {
      // Query from database
      const dbPlans = await prisma.codeGeneration.findMany({
        where: {
          projectId,
          metadata: {
            path: ['type'],
            equals: 'architectural_plan',
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 20,
      });

      // Parse metadata back into ArchitecturalPlan format
      return dbPlans.map(dbPlan => {
        const metadata = dbPlan.metadata as any;
        return metadata.plan as ArchitecturalPlan;
      });
    } catch (error: any) {
      console.error('[ArchitecturalPlanService] Failed to fetch plan history:', error.message);

      // Return from memory as fallback
      return Array.from(this.plans.values())
        .filter(p => p.projectId === projectId)
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    }
  }

  /**
   * Get a plan by ID
   */
  async getPlan(planId: string): Promise<ArchitecturalPlan | null> {
    // Check memory first
    const memoryPlan = this.plans.get(planId);
    if (memoryPlan) {
      return memoryPlan;
    }

    // Query from database
    try {
      const dbPlan = await prisma.codeGeneration.findFirst({
        where: {
          metadata: {
            path: ['plan', 'id'],
            equals: planId,
          },
        },
      });

      if (dbPlan && dbPlan.metadata) {
        const metadata = dbPlan.metadata as any;
        return metadata.plan as ArchitecturalPlan;
      }
    } catch (error: any) {
      console.error('[ArchitecturalPlanService] Failed to fetch plan:', error.message);
    }

    return null;
  }

  /**
   * Find similar plans using Pinecone
   */
  async findSimilarPlans(intent: string, topK: number = 5): Promise<ArchitecturalPlan[]> {
    console.log('[ArchitecturalPlanService] Finding similar plans');

    try {
      // Generate embedding for the intent
      const embedding = await pineconeService.generateCodeEmbedding(intent);

      // Find similar patterns (plans are stored as patterns)
      const similarPatterns = await pineconeService.findSimilarPatterns(embedding, topK, 0.7);

      // Fetch full plans for matching patterns
      const plans: ArchitecturalPlan[] = [];
      for (const pattern of similarPatterns) {
        const plan = await this.getPlan(pattern.patternId);
        if (plan) {
          plans.push(plan);
        }
      }

      return plans;
    } catch (error: any) {
      console.error('[ArchitecturalPlanService] Failed to find similar plans:', error.message);
      return [];
    }
  }

  /**
   * Store plan in PostgreSQL database
   */
  private async storePlanInDatabase(plan: ArchitecturalPlan): Promise<void> {
    try {
      await prisma.codeGeneration.create({
        data: {
          userId: plan.userId,
          projectId: plan.projectId,
          prompt: plan.intent,
          generatedCode: JSON.stringify(plan.architecture),
          language: 'typescript',
          framework: 'architectural-plan',
          model: 'claude-council',
          tokensUsed: 0,
          metadata: {
            type: 'architectural_plan',
            plan: this.serializePlan(plan),
          } as Prisma.InputJsonValue,
        },
      });

      console.log(`[ArchitecturalPlanService] Plan stored in database: ${plan.id}`);
    } catch (error: any) {
      console.error('[ArchitecturalPlanService] Failed to store plan in database:', error.message);
    }
  }

  /**
   * Update plan in database
   */
  private async updatePlanInDatabase(plan: ArchitecturalPlan): Promise<void> {
    try {
      await prisma.codeGeneration.updateMany({
        where: {
          metadata: {
            path: ['plan', 'id'],
            equals: plan.id,
          },
        },
        data: {
          metadata: {
            type: 'architectural_plan',
            plan: this.serializePlan(plan),
          } as Prisma.InputJsonValue,
        },
      });

      console.log(`[ArchitecturalPlanService] Plan updated in database: ${plan.id}`);
    } catch (error: any) {
      console.error('[ArchitecturalPlanService] Failed to update plan in database:', error.message);
    }
  }

  /**
   * Store plan embedding in Pinecone for similarity search
   */
  private async storePlanEmbedding(plan: ArchitecturalPlan): Promise<void> {
    try {
      // Generate embedding for the plan's intent + architecture summary
      const content = `${plan.intent}\n${plan.architecture.components.map(c => c.name).join(', ')}\n${plan.architecture.patterns.join(', ')}`;
      const embedding = await pineconeService.generateCodeEmbedding(content);

      await pineconeService.storePatternEmbedding({
        patternId: plan.id,
        embedding,
        metadata: {
          name: plan.intent.substring(0, 100),
          category: 'architectural-plan',
          severity: plan.riskAssessment.overallRisk > 7 ? 'HIGH' : plan.riskAssessment.overallRisk > 4 ? 'MEDIUM' : 'LOW',
          accuracy: plan.councilVote.consensus,
          occurrenceCount: 1,
        },
      });

      console.log(`[ArchitecturalPlanService] Plan embedding stored: ${plan.id}`);
    } catch (error: any) {
      console.error('[ArchitecturalPlanService] Failed to store plan embedding:', error.message);
    }
  }

  /**
   * Store approved plan in knowledge base for future reference
   */
  private async storeInKnowledgeBase(plan: ArchitecturalPlan): Promise<void> {
    try {
      // Create a TCI pattern from the approved plan
      await prisma.tCIPattern.create({
        data: {
          name: `Approved Plan: ${plan.intent.substring(0, 50)}`,
          description: `Architectural plan for: ${plan.intent}`,
          category: 'best-practice',
          severity: 'LOW',
          codeSignature: JSON.stringify(plan.architecture),
          visualSignature: {
            patterns: plan.architecture.patterns,
            componentCount: plan.architecture.components.length,
          },
          occurrenceCount: 1,
          detectionCount: 1,
          missedCount: 0,
          accuracy: plan.councilVote.consensus,
        },
      });

      console.log(`[ArchitecturalPlanService] Plan stored in knowledge base: ${plan.id}`);
    } catch (error: any) {
      console.error('[ArchitecturalPlanService] Failed to store in knowledge base:', error.message);
    }
  }

  /**
   * Generate a unique plan ID
   */
  private generatePlanId(): string {
    return `plan-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Generate a unique alternative ID
   */
  private generateAlternativeId(): string {
    return `alt-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  /**
   * Serialize plan for JSON storage in database
   * Converts Date objects to ISO strings for proper JSON serialization
   */
  private serializePlan(plan: ArchitecturalPlan): object {
    return {
      id: plan.id,
      projectId: plan.projectId,
      userId: plan.userId,
      createdAt: plan.createdAt.toISOString(),
      intent: plan.intent,
      architecture: plan.architecture,
      alternatives: plan.alternatives,
      riskAssessment: plan.riskAssessment,
      councilVote: {
        votes: plan.councilVote.votes,
        consensus: plan.councilVote.consensus,
        winner: plan.councilVote.winner,
        reasoning: plan.councilVote.reasoning,
        votedAt: plan.councilVote.votedAt.toISOString(),
      },
      status: plan.status,
    };
  }

  /**
   * Deserialize plan from JSON storage
   * Converts ISO strings back to Date objects
   */
  private deserializePlan(data: any): ArchitecturalPlan {
    return {
      id: data.id as string,
      projectId: data.projectId as string,
      userId: data.userId as string,
      createdAt: new Date(data.createdAt as string),
      intent: data.intent as string,
      architecture: data.architecture as ArchitecturalPlan['architecture'],
      alternatives: data.alternatives as AlternativePlan[],
      riskAssessment: data.riskAssessment as RiskAssessment,
      councilVote: {
        ...(data.councilVote as Omit<CouncilVote, 'votedAt'>),
        votedAt: new Date((data.councilVote as any).votedAt),
      },
      status: data.status as ArchitecturalPlan['status'],
    };
  }
}

// Export singleton instance
export const architecturalPlanService = new ArchitecturalPlanService();

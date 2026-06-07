/**
 * AI Agents Registry - Non-Voting Task Agents
 *
 * Central registry for all specialized AI agents that execute tasks
 * without participating in TCI's multi-model validation consensus.
 *
 * Task Agents vs Voting Models:
 * - Task Agents: Execute specific tasks (image generation, video creation, etc.)
 * - Voting Models: Participate in TCI consensus (GPT-5, Claude, Gemini, Grok, DeepSeek)
 *
 * Architecture:
 * - TCI handles code validation through multi-model voting
 * - Task agents are called directly for specific creative/generative tasks
 * - Task agents can be orchestrated by TCI but don't vote on code quality
 */

import { NanoBananaAgent, nanoBananaAgent } from './NanoBananaAgent';
import { Kling26Agent, kling26Agent } from './Kling26Agent';

// ============================================================================
// Type Definitions
// ============================================================================

export type AgentCategory =
  | 'image-generation'
  | 'video-generation'
  | 'audio-generation'
  | 'code-generation'
  | 'text-generation'
  | 'translation'
  | 'analysis'
  | 'automation';

export interface AgentCapability {
  name: string;
  description: string;
  inputTypes: string[];
  outputTypes: string[];
}

export interface RegisteredAgent {
  id: string;
  name: string;
  version: string;
  category: AgentCategory;
  description: string;
  capabilities: AgentCapability[];
  available: boolean;
  priority: number; // Lower = higher priority for fallback
  quotaLimit?: number; // Monthly usage limit
  costPerRequest?: number; // Estimated cost
  avgLatency?: number; // Average response time in ms
  instance: TaskAgent;
}

export interface TaskAgent {
  available(): boolean;
  getMetadata(): AgentMetadata;
}

export interface AgentMetadata {
  id: string;
  name: string;
  type: 'task-agent';
  category: AgentCategory;
  capabilities: string[];
  votingEnabled: false;
  version: string;
}

export interface AgentExecutionResult {
  agentId: string;
  success: boolean;
  result?: any;
  error?: string;
  executionTime: number;
  fallbackUsed?: boolean;
}

export interface AgentSelectionCriteria {
  category: AgentCategory;
  capability?: string;
  preferredAgent?: string;
  requireAvailable?: boolean;
  maxLatency?: number;
  maxCost?: number;
}

// ============================================================================
// Agent Registry
// ============================================================================

export class AgentRegistry {
  private agents: Map<string, RegisteredAgent> = new Map();
  private categoryIndex: Map<AgentCategory, string[]> = new Map();
  private capabilityIndex: Map<string, string[]> = new Map();

  constructor() {
    this.initializeDefaultAgents();
  }

  /**
   * Register default agents
   */
  private initializeDefaultAgents(): void {
    // Register Nano Banana (Image Generation)
    this.registerAgent({
      id: 'nano-banana',
      name: 'Nano Banana',
      version: '2.6.0',
      category: 'image-generation',
      description: 'High-quality image generation for app icons, screenshots, UI assets, and marketing materials',
      capabilities: [
        {
          name: 'app-icons',
          description: 'Generate app icons for iOS, Android, and Web',
          inputTypes: ['text-prompt', 'style-options'],
          outputTypes: ['png', 'webp'],
        },
        {
          name: 'screenshots',
          description: 'Generate app store screenshots with device frames',
          inputTypes: ['text-prompt', 'device-type'],
          outputTypes: ['png'],
        },
        {
          name: 'feature-graphics',
          description: 'Generate promotional feature graphics',
          inputTypes: ['text-prompt', 'dimensions'],
          outputTypes: ['png', 'webp'],
        },
        {
          name: 'ui-assets',
          description: 'Generate UI elements, buttons, icons, patterns',
          inputTypes: ['text-prompt', 'asset-type'],
          outputTypes: ['png', 'webp', 'svg'],
        },
        {
          name: 'style-transfer',
          description: 'Apply artistic styles to images',
          inputTypes: ['image', 'style'],
          outputTypes: ['png', 'webp'],
        },
      ],
      available: nanoBananaAgent.available(),
      priority: 1,
      quotaLimit: 10000,
      costPerRequest: 0.02,
      avgLatency: 15000,
      instance: nanoBananaAgent,
    });

    // Register Kling 2.6 (Video Generation)
    this.registerAgent({
      id: 'kling-26',
      name: 'Kling 2.6',
      version: '2.6.0',
      category: 'video-generation',
      description: 'AI video generation for app previews, promos, tutorials, and marketing content',
      capabilities: [
        {
          name: 'text-to-video',
          description: 'Generate videos from text prompts',
          inputTypes: ['text-prompt', 'duration', 'style'],
          outputTypes: ['mp4', 'webm'],
        },
        {
          name: 'image-to-video',
          description: 'Animate static images into videos',
          inputTypes: ['image', 'text-prompt', 'motion'],
          outputTypes: ['mp4', 'webm'],
        },
        {
          name: 'app-previews',
          description: 'Generate app store preview videos',
          inputTypes: ['app-details', 'platform'],
          outputTypes: ['mp4'],
        },
        {
          name: 'promo-videos',
          description: 'Generate promotional marketing videos',
          inputTypes: ['text-prompt', 'branding'],
          outputTypes: ['mp4', 'webm'],
        },
        {
          name: 'tutorials',
          description: 'Generate tutorial and walkthrough videos',
          inputTypes: ['steps', 'voiceover'],
          outputTypes: ['mp4'],
        },
      ],
      available: kling26Agent.available(),
      priority: 1,
      quotaLimit: 1000,
      costPerRequest: 0.50,
      avgLatency: 120000,
      instance: kling26Agent,
    });

    // Build indexes
    this.rebuildIndexes();
  }

  /**
   * Register a new agent
   */
  registerAgent(agent: RegisteredAgent): void {
    this.agents.set(agent.id, agent);
    this.rebuildIndexes();
    console.log(`✅ Registered agent: ${agent.name} (${agent.id})`);
  }

  /**
   * Unregister an agent
   */
  unregisterAgent(agentId: string): boolean {
    const result = this.agents.delete(agentId);
    if (result) {
      this.rebuildIndexes();
      console.log(`❌ Unregistered agent: ${agentId}`);
    }
    return result;
  }

  /**
   * Rebuild category and capability indexes
   */
  private rebuildIndexes(): void {
    this.categoryIndex.clear();
    this.capabilityIndex.clear();

    for (const [id, agent] of this.agents) {
      // Index by category
      const categoryAgents = this.categoryIndex.get(agent.category) || [];
      categoryAgents.push(id);
      this.categoryIndex.set(agent.category, categoryAgents);

      // Index by capability
      for (const cap of agent.capabilities) {
        const capAgents = this.capabilityIndex.get(cap.name) || [];
        capAgents.push(id);
        this.capabilityIndex.set(cap.name, capAgents);
      }
    }
  }

  /**
   * Get an agent by ID
   */
  getAgent(agentId: string): RegisteredAgent | undefined {
    return this.agents.get(agentId);
  }

  /**
   * Get all agents
   */
  getAllAgents(): RegisteredAgent[] {
    return Array.from(this.agents.values());
  }

  /**
   * Get available agents only
   */
  getAvailableAgents(): RegisteredAgent[] {
    return this.getAllAgents().filter((a) => a.available);
  }

  /**
   * Get agents by category
   */
  getAgentsByCategory(category: AgentCategory): RegisteredAgent[] {
    const agentIds = this.categoryIndex.get(category) || [];
    return agentIds.map((id) => this.agents.get(id)!).filter(Boolean);
  }

  /**
   * Get agents by capability
   */
  getAgentsByCapability(capability: string): RegisteredAgent[] {
    const agentIds = this.capabilityIndex.get(capability) || [];
    return agentIds.map((id) => this.agents.get(id)!).filter(Boolean);
  }

  /**
   * Select best agent based on criteria
   */
  selectAgent(criteria: AgentSelectionCriteria): RegisteredAgent | null {
    let candidates: RegisteredAgent[];

    // Start with category filter
    candidates = this.getAgentsByCategory(criteria.category);

    // Filter by capability if specified
    if (criteria.capability) {
      const capabilityAgentIds = new Set(this.capabilityIndex.get(criteria.capability) || []);
      candidates = candidates.filter((a) => capabilityAgentIds.has(a.id));
    }

    // Filter by availability if required
    if (criteria.requireAvailable) {
      candidates = candidates.filter((a) => a.available);
    }

    // Filter by max latency
    if (criteria.maxLatency) {
      candidates = candidates.filter((a) => !a.avgLatency || a.avgLatency <= criteria.maxLatency!);
    }

    // Filter by max cost
    if (criteria.maxCost) {
      candidates = candidates.filter((a) => !a.costPerRequest || a.costPerRequest <= criteria.maxCost!);
    }

    // Prefer specified agent if available
    if (criteria.preferredAgent) {
      const preferred = candidates.find((a) => a.id === criteria.preferredAgent);
      if (preferred) return preferred;
    }

    // Sort by priority and return best
    candidates.sort((a, b) => a.priority - b.priority);
    return candidates[0] || null;
  }

  /**
   * Execute a task with automatic agent selection
   */
  async executeTask<T>(
    criteria: AgentSelectionCriteria,
    taskFn: (agent: RegisteredAgent) => Promise<T>,
    options?: {
      fallbackEnabled?: boolean;
      maxRetries?: number;
    }
  ): Promise<AgentExecutionResult & { data?: T }> {
    const startTime = Date.now();
    const fallbackEnabled = options?.fallbackEnabled ?? true;
    const maxRetries = options?.maxRetries ?? 2;

    // Get candidates sorted by priority
    let candidates = this.getAgentsByCategory(criteria.category)
      .filter((a) => a.available)
      .sort((a, b) => a.priority - b.priority);

    if (criteria.capability) {
      const capabilityAgentIds = new Set(this.capabilityIndex.get(criteria.capability) || []);
      candidates = candidates.filter((a) => capabilityAgentIds.has(a.id));
    }

    if (candidates.length === 0) {
      return {
        agentId: 'none',
        success: false,
        error: `No available agents for category: ${criteria.category}`,
        executionTime: Date.now() - startTime,
      };
    }

    // Try each candidate
    let lastError: string | undefined;
    let fallbackUsed = false;

    for (let i = 0; i < candidates.length; i++) {
      const agent = candidates[i];

      if (i > 0) {
        fallbackUsed = true;
        console.log(`⚠️ Falling back to agent: ${agent.name}`);
      }

      for (let retry = 0; retry <= maxRetries; retry++) {
        try {
          const result = await taskFn(agent);
          return {
            agentId: agent.id,
            success: true,
            result,
            data: result,
            executionTime: Date.now() - startTime,
            fallbackUsed,
          };
        } catch (error: any) {
          lastError = error.message;
          console.warn(`Agent ${agent.id} failed (attempt ${retry + 1}): ${error.message}`);

          if (retry < maxRetries) {
            await new Promise((r) => setTimeout(r, 1000 * (retry + 1))); // Exponential backoff
          }
        }
      }

      if (!fallbackEnabled) break;
    }

    return {
      agentId: candidates[0]?.id || 'unknown',
      success: false,
      error: lastError || 'All agents failed',
      executionTime: Date.now() - startTime,
      fallbackUsed,
    };
  }

  /**
   * Get registry statistics
   */
  getStatistics(): {
    totalAgents: number;
    availableAgents: number;
    byCategory: Record<string, number>;
    byCapability: Record<string, number>;
  } {
    const byCategory: Record<string, number> = {};
    const byCapability: Record<string, number> = {};

    for (const [category, agentIds] of this.categoryIndex) {
      byCategory[category] = agentIds.length;
    }

    for (const [capability, agentIds] of this.capabilityIndex) {
      byCapability[capability] = agentIds.length;
    }

    return {
      totalAgents: this.agents.size,
      availableAgents: this.getAvailableAgents().length,
      byCategory,
      byCapability,
    };
  }

  /**
   * Get agent health status
   */
  getHealthStatus(): {
    healthy: string[];
    unhealthy: string[];
    summary: string;
  } {
    const healthy: string[] = [];
    const unhealthy: string[] = [];

    for (const [id, agent] of this.agents) {
      if (agent.available) {
        healthy.push(id);
      } else {
        unhealthy.push(id);
      }
    }

    const summary =
      unhealthy.length === 0
        ? 'All agents healthy'
        : `${unhealthy.length}/${this.agents.size} agents unavailable`;

    return { healthy, unhealthy, summary };
  }

  /**
   * Refresh availability status for all agents
   */
  refreshAvailability(): void {
    for (const [id, agent] of this.agents) {
      const wasAvailable = agent.available;
      agent.available = agent.instance.available();

      if (wasAvailable !== agent.available) {
        console.log(
          `📡 Agent ${agent.name} availability changed: ${wasAvailable} → ${agent.available}`
        );
      }
    }
  }
}

// ============================================================================
// Export Singleton & Convenience Functions
// ============================================================================

export const agentRegistry = new AgentRegistry();

/**
 * Quick access to image generation
 */
export async function generateImage(
  prompt: string,
  options?: {
    width?: number;
    height?: number;
    style?: string;
    count?: number;
  }
) {
  return agentRegistry.executeTask(
    {
      category: 'image-generation',
      capability: 'app-icons',
      requireAvailable: true,
    },
    async (agent) => {
      const nanoBanana = agent.instance as NanoBananaAgent;
      return nanoBanana.generate({
        prompt,
        width: options?.width || 1024,
        height: options?.height || 1024,
        style: (options?.style as any) || 'flat-design',
        count: options?.count || 1,
      });
    }
  );
}

/**
 * Quick access to video generation
 */
export async function generateVideo(
  prompt: string,
  options?: {
    duration?: number;
    aspectRatio?: string;
    style?: string;
  }
) {
  return agentRegistry.executeTask(
    {
      category: 'video-generation',
      capability: 'text-to-video',
      requireAvailable: true,
    },
    async (agent) => {
      const kling = agent.instance as Kling26Agent;
      return kling.generateFromText({
        prompt,
        duration: (options?.duration as any) || 15,
        aspectRatio: (options?.aspectRatio as any) || '16:9',
        style: (options?.style as any) || 'cinematic',
      });
    }
  );
}

/**
 * List all available agents
 */
export function listAgents(): RegisteredAgent[] {
  return agentRegistry.getAllAgents();
}

/**
 * Check agent health
 */
export function checkAgentHealth() {
  return agentRegistry.getHealthStatus();
}

/**
 * AI Agents Module - Non-Voting Task Agents
 *
 * This module exports all specialized task agents that execute creative/generative
 * tasks without participating in TCI's multi-model validation consensus.
 *
 * Usage:
 * import { agentRegistry, nanoBananaAgent, kling26Agent } from '@/services/ai/agents';
 *
 * // Use the registry for automatic agent selection
 * const result = await agentRegistry.executeTask({ category: 'image-generation' }, ...);
 *
 * // Or use agents directly
 * const images = await nanoBananaAgent.generateAppIcon({ ... });
 * const video = await kling26Agent.generateAppPreview({ ... });
 */

// Agent Registry (central management)
export {
  AgentRegistry,
  agentRegistry,
  generateImage,
  generateVideo,
  listAgents,
  checkAgentHealth,
  type AgentCategory,
  type AgentCapability,
  type RegisteredAgent,
  type TaskAgent,
  type AgentMetadata,
  type AgentExecutionResult,
  type AgentSelectionCriteria,
} from './AgentRegistry';

// Nano Banana - Image Generation
export {
  NanoBananaAgent,
  nanoBananaAgent,
  type NanoBananaConfig,
  type NanoBananaModel,
  type ImageGenerationRequest,
  type ImageStyle,
  type AppIconRequest,
  type ScreenshotRequest,
  type FeatureGraphicRequest,
  type UIAssetRequest,
  type GeneratedImage,
  type GenerationResult,
} from './NanoBananaAgent';

// Kling 2.6 - Video Generation
export {
  Kling26Agent,
  kling26Agent,
  type Kling26Config,
  type VideoQuality,
  type AspectRatio,
  type VideoDuration,
  type TextToVideoRequest,
  type ImageToVideoRequest,
  type AppPreviewRequest,
  type PromoVideoRequest,
  type TutorialVideoRequest,
  type TutorialStep,
  type VideoStyle,
  type MotionIntensity,
  type CameraMovement,
  type GeneratedVideo,
  type VideoGenerationResult,
  type VideoJobStatus,
} from './Kling26Agent';

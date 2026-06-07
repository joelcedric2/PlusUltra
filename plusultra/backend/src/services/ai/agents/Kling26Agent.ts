/**
 * Kling 2.6 AI Agent - Video Generation Specialist
 *
 * A non-voting task agent specialized in generating high-quality videos
 * for app previews, promotional content, tutorials, and marketing materials.
 *
 * Capabilities:
 * - App preview videos
 * - Promotional trailers
 * - UI animation demos
 * - Tutorial walkthroughs
 * - Marketing videos
 * - Image-to-video conversion
 * - Text-to-video generation
 *
 * This is a task agent (non-voting) - it executes tasks rather than
 * participating in TCI's multi-model validation consensus.
 */

import axios, { AxiosInstance } from 'axios';

// ============================================================================
// Type Definitions
// ============================================================================

export interface Kling26Config {
  apiKey: string;
  baseUrl?: string;
  timeout?: number;
  maxRetries?: number;
}

export type VideoQuality = 'standard' | 'high' | 'ultra';
export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:3' | '3:4';
export type VideoDuration = 5 | 10 | 15 | 30 | 60; // seconds

export interface TextToVideoRequest {
  prompt: string;
  negativePrompt?: string;
  duration: VideoDuration;
  aspectRatio: AspectRatio;
  quality?: VideoQuality;
  fps?: 24 | 30 | 60;
  style?: VideoStyle;
  motion?: MotionIntensity;
  seed?: number;
  camera?: CameraMovement;
}

export interface ImageToVideoRequest {
  imageUrl?: string;
  imageBase64?: string;
  prompt: string;
  duration: VideoDuration;
  aspectRatio?: AspectRatio;
  quality?: VideoQuality;
  fps?: 24 | 30 | 60;
  motion?: MotionIntensity;
  camera?: CameraMovement;
  preserveImage?: boolean; // Keep the image as first frame
}

export interface AppPreviewRequest {
  appName: string;
  appDescription: string;
  platform: 'ios' | 'android' | 'web';
  features: string[];
  style: VideoStyle;
  duration: 15 | 30; // App Store allows 15-30s
  includeAudio?: boolean;
  aspectRatio?: AspectRatio;
}

export interface PromoVideoRequest {
  appName: string;
  tagline: string;
  keyMessages: string[];
  targetAudience?: string;
  style: VideoStyle;
  duration: VideoDuration;
  includeCallToAction?: boolean;
  callToActionText?: string;
}

export interface TutorialVideoRequest {
  appName: string;
  tutorialTitle: string;
  steps: TutorialStep[];
  style: VideoStyle;
  voiceoverText?: string;
  duration: VideoDuration;
}

export interface TutorialStep {
  stepNumber: number;
  description: string;
  screenDescription: string;
  duration?: number; // seconds for this step
}

export type VideoStyle =
  | 'cinematic'
  | 'animated'
  | 'motion-graphics'
  | 'documentary'
  | 'playful'
  | 'corporate'
  | 'minimalist'
  | 'tech-futuristic'
  | 'organic-natural'
  | 'retro-vintage';

export type MotionIntensity =
  | 'static'      // Minimal movement
  | 'subtle'      // Gentle motion
  | 'moderate'    // Standard motion
  | 'dynamic'     // Energetic motion
  | 'intense';    // High action

export type CameraMovement =
  | 'static'
  | 'pan-left'
  | 'pan-right'
  | 'tilt-up'
  | 'tilt-down'
  | 'zoom-in'
  | 'zoom-out'
  | 'orbit'
  | 'tracking'
  | 'crane'
  | 'dolly';

export interface GeneratedVideo {
  id: string;
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  duration: number;
  fps: number;
  format: 'mp4' | 'webm';
  fileSize: number;
  prompt: string;
  seed: number;
  generationTime: number;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  metadata: Record<string, any>;
}

export interface VideoGenerationResult {
  success: boolean;
  video?: GeneratedVideo;
  jobId?: string;
  estimatedTime?: number; // seconds until completion
  error?: string;
}

export interface VideoJobStatus {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number; // 0-100
  video?: GeneratedVideo;
  error?: string;
}

// ============================================================================
// Kling 2.6 Agent
// ============================================================================

export class Kling26Agent {
  private client: AxiosInstance;
  private config: Kling26Config;
  private isAvailable: boolean = false;

  constructor(config?: Partial<Kling26Config>) {
    this.config = {
      apiKey: config?.apiKey || process.env.KLING_API_KEY || '',
      baseUrl: config?.baseUrl || process.env.KLING_API_URL || 'https://api.kling.ai/v2.6',
      timeout: config?.timeout || 300000, // 5 minutes for video generation
      maxRetries: config?.maxRetries || 3,
    };

    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
        'X-Kling-Version': '2.6',
      },
    });

    this.isAvailable = !!this.config.apiKey;
  }

  /**
   * Check if the agent is available
   */
  available(): boolean {
    return this.isAvailable;
  }

  /**
   * Get agent metadata
   */
  getMetadata() {
    return {
      id: 'kling-26',
      name: 'Kling 2.6',
      type: 'task-agent',
      category: 'video-generation',
      capabilities: [
        'text-to-video',
        'image-to-video',
        'app-previews',
        'promo-videos',
        'tutorials',
        'marketing-content',
        'camera-control',
        'style-transfer',
      ],
      votingEnabled: false, // Non-voting task agent
      version: '2.6.0',
      maxDuration: 60, // seconds
      supportedFormats: ['mp4', 'webm'],
    };
  }

  // ==========================================================================
  // Text-to-Video Generation
  // ==========================================================================

  /**
   * Generate video from text prompt
   */
  async generateFromText(request: TextToVideoRequest): Promise<VideoGenerationResult> {
    if (!this.isAvailable) {
      return {
        success: false,
        error: 'Kling API key not configured',
      };
    }

    try {
      const response = await this.client.post('/generate/text-to-video', {
        prompt: this.enhancePrompt(request.prompt, request.style),
        negative_prompt: request.negativePrompt || this.getDefaultNegativePrompt(),
        duration: request.duration,
        aspect_ratio: request.aspectRatio,
        quality: request.quality || 'high',
        fps: request.fps || 30,
        motion_intensity: request.motion || 'moderate',
        seed: request.seed,
        camera_movement: request.camera || 'static',
      });

      return {
        success: true,
        jobId: response.data.job_id,
        estimatedTime: response.data.estimated_time,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  // ==========================================================================
  // Image-to-Video Generation
  // ==========================================================================

  /**
   * Generate video from a static image
   */
  async generateFromImage(request: ImageToVideoRequest): Promise<VideoGenerationResult> {
    if (!this.isAvailable) {
      return {
        success: false,
        error: 'Kling API key not configured',
      };
    }

    try {
      const response = await this.client.post('/generate/image-to-video', {
        image_url: request.imageUrl,
        image_base64: request.imageBase64,
        prompt: request.prompt,
        duration: request.duration,
        aspect_ratio: request.aspectRatio,
        quality: request.quality || 'high',
        fps: request.fps || 30,
        motion_intensity: request.motion || 'subtle',
        camera_movement: request.camera || 'zoom-in',
        preserve_first_frame: request.preserveImage ?? true,
      });

      return {
        success: true,
        jobId: response.data.job_id,
        estimatedTime: response.data.estimated_time,
      };
    } catch (error: any) {
      return {
        success: false,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  // ==========================================================================
  // App Preview Videos
  // ==========================================================================

  /**
   * Generate app preview video for app stores
   */
  async generateAppPreview(request: AppPreviewRequest): Promise<VideoGenerationResult> {
    const aspectRatio = this.getAppPreviewAspectRatio(request.platform, request.aspectRatio);
    const prompt = this.buildAppPreviewPrompt(request);

    return this.generateFromText({
      prompt,
      negativePrompt: 'low quality, blurry, glitchy, amateur, unprofessional',
      duration: request.duration,
      aspectRatio,
      quality: 'ultra',
      fps: 60,
      style: request.style,
      motion: 'moderate',
      camera: 'tracking',
    });
  }

  /**
   * Build specialized prompt for app previews
   */
  private buildAppPreviewPrompt(request: AppPreviewRequest): string {
    const parts = [
      `Professional app preview video for "${request.appName}"`,
      request.appDescription,
      'smooth UI transitions',
      'modern mobile app interface',
      'professional app store quality',
      `showcasing features: ${request.features.join(', ')}`,
    ];

    return parts.join(', ');
  }

  /**
   * Get aspect ratio for app preview based on platform
   */
  private getAppPreviewAspectRatio(platform: string, override?: AspectRatio): AspectRatio {
    if (override) return override;

    const defaults: Record<string, AspectRatio> = {
      ios: '9:16',     // iPhone portrait
      android: '9:16', // Phone portrait
      web: '16:9',     // Landscape for web
    };

    return defaults[platform] || '9:16';
  }

  // ==========================================================================
  // Promotional Videos
  // ==========================================================================

  /**
   * Generate promotional video
   */
  async generatePromoVideo(request: PromoVideoRequest): Promise<VideoGenerationResult> {
    const prompt = this.buildPromoPrompt(request);

    return this.generateFromText({
      prompt,
      negativePrompt: 'amateur, low budget, boring, static, unprofessional',
      duration: request.duration,
      aspectRatio: '16:9', // Standard promo format
      quality: 'ultra',
      fps: 30,
      style: request.style,
      motion: 'dynamic',
      camera: 'dolly',
    });
  }

  /**
   * Build promotional video prompt
   */
  private buildPromoPrompt(request: PromoVideoRequest): string {
    const parts = [
      `Promotional video for "${request.appName}"`,
      `tagline: "${request.tagline}"`,
      'cinematic quality',
      'engaging marketing content',
      `key messages: ${request.keyMessages.join(', ')}`,
    ];

    if (request.targetAudience) {
      parts.push(`targeting: ${request.targetAudience}`);
    }

    if (request.includeCallToAction && request.callToActionText) {
      parts.push(`call to action: "${request.callToActionText}"`);
    }

    return parts.join(', ');
  }

  // ==========================================================================
  // Tutorial Videos
  // ==========================================================================

  /**
   * Generate tutorial/walkthrough video
   */
  async generateTutorial(request: TutorialVideoRequest): Promise<VideoGenerationResult> {
    const prompt = this.buildTutorialPrompt(request);

    return this.generateFromText({
      prompt,
      negativePrompt: 'confusing, unclear, fast, amateur',
      duration: request.duration,
      aspectRatio: '16:9',
      quality: 'high',
      fps: 30,
      style: request.style,
      motion: 'subtle', // Tutorials need clear, steady visuals
      camera: 'static',
    });
  }

  /**
   * Build tutorial video prompt
   */
  private buildTutorialPrompt(request: TutorialVideoRequest): string {
    const stepDescriptions = request.steps
      .map((s) => `Step ${s.stepNumber}: ${s.description}`)
      .join(', ');

    return [
      `Tutorial video: "${request.tutorialTitle}"`,
      `for app "${request.appName}"`,
      'clear instructional content',
      'easy to follow steps',
      stepDescriptions,
    ].join(', ');
  }

  // ==========================================================================
  // Job Status & Retrieval
  // ==========================================================================

  /**
   * Check the status of a video generation job
   */
  async getJobStatus(jobId: string): Promise<VideoJobStatus> {
    if (!this.isAvailable) {
      return {
        jobId,
        status: 'failed',
        progress: 0,
        error: 'Kling API key not configured',
      };
    }

    try {
      const response = await this.client.get(`/jobs/${jobId}`);

      return {
        jobId,
        status: response.data.status,
        progress: response.data.progress || 0,
        video: response.data.video
          ? {
              id: response.data.video.id,
              url: response.data.video.url,
              thumbnailUrl: response.data.video.thumbnail_url,
              width: response.data.video.width,
              height: response.data.video.height,
              duration: response.data.video.duration,
              fps: response.data.video.fps,
              format: response.data.video.format,
              fileSize: response.data.video.file_size,
              prompt: response.data.video.prompt,
              seed: response.data.video.seed,
              generationTime: response.data.video.generation_time,
              status: 'completed',
              metadata: response.data.video.metadata || {},
            }
          : undefined,
        error: response.data.error,
      };
    } catch (error: any) {
      return {
        jobId,
        status: 'failed',
        progress: 0,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  /**
   * Wait for a job to complete (with polling)
   */
  async waitForCompletion(
    jobId: string,
    options?: {
      pollInterval?: number; // ms
      maxWaitTime?: number; // ms
      onProgress?: (progress: number) => void;
    }
  ): Promise<VideoJobStatus> {
    const pollInterval = options?.pollInterval || 5000;
    const maxWaitTime = options?.maxWaitTime || 300000; // 5 minutes
    const startTime = Date.now();

    while (Date.now() - startTime < maxWaitTime) {
      const status = await this.getJobStatus(jobId);

      if (options?.onProgress) {
        options.onProgress(status.progress);
      }

      if (status.status === 'completed' || status.status === 'failed') {
        return status;
      }

      await new Promise((resolve) => setTimeout(resolve, pollInterval));
    }

    return {
      jobId,
      status: 'failed',
      progress: 0,
      error: 'Timeout waiting for video generation',
    };
  }

  // ==========================================================================
  // Utility Methods
  // ==========================================================================

  /**
   * Enhance prompt with style keywords
   */
  private enhancePrompt(prompt: string, style?: VideoStyle): string {
    const styleEnhancements: Record<VideoStyle, string> = {
      cinematic: 'cinematic lighting, professional cinematography, movie quality',
      animated: '2D/3D animation, smooth motion, vibrant colors',
      'motion-graphics': 'motion graphics, kinetic typography, modern design',
      documentary: 'documentary style, authentic, real-world',
      playful: 'fun and playful, energetic, colorful',
      corporate: 'professional corporate video, clean, polished',
      minimalist: 'minimalist design, clean, simple, elegant',
      'tech-futuristic': 'futuristic tech aesthetic, sci-fi, neon, holographic',
      'organic-natural': 'organic movement, natural, flowing',
      'retro-vintage': 'retro vintage style, nostalgic, classic',
    };

    if (style && styleEnhancements[style]) {
      return `${prompt}, ${styleEnhancements[style]}`;
    }

    return prompt;
  }

  /**
   * Get default negative prompt
   */
  private getDefaultNegativePrompt(): string {
    return [
      'low quality',
      'blurry',
      'pixelated',
      'glitchy',
      'artifacts',
      'watermark',
      'text overlays',
      'amateur',
      'shaky camera',
      'poor lighting',
    ].join(', ');
  }

  /**
   * Get recommended settings for different use cases
   */
  getRecommendedSettings(useCase: 'app-preview' | 'promo' | 'tutorial' | 'social'): {
    duration: VideoDuration;
    aspectRatio: AspectRatio;
    quality: VideoQuality;
    fps: number;
    motion: MotionIntensity;
  } {
    const settings: Record<string, any> = {
      'app-preview': {
        duration: 30,
        aspectRatio: '9:16',
        quality: 'ultra',
        fps: 60,
        motion: 'moderate',
      },
      promo: {
        duration: 30,
        aspectRatio: '16:9',
        quality: 'ultra',
        fps: 30,
        motion: 'dynamic',
      },
      tutorial: {
        duration: 60,
        aspectRatio: '16:9',
        quality: 'high',
        fps: 30,
        motion: 'subtle',
      },
      social: {
        duration: 15,
        aspectRatio: '9:16',
        quality: 'high',
        fps: 30,
        motion: 'dynamic',
      },
    };

    return settings[useCase] || settings.promo;
  }

  /**
   * Get style recommendations
   */
  getStyleRecommendations(appCategory: string): VideoStyle[] {
    const recommendations: Record<string, VideoStyle[]> = {
      productivity: ['minimalist', 'corporate', 'motion-graphics'],
      gaming: ['animated', 'tech-futuristic', 'playful'],
      social: ['playful', 'animated', 'cinematic'],
      fitness: ['organic-natural', 'cinematic', 'motion-graphics'],
      education: ['motion-graphics', 'minimalist', 'animated'],
      finance: ['corporate', 'minimalist', 'motion-graphics'],
      entertainment: ['cinematic', 'playful', 'animated'],
      utility: ['minimalist', 'motion-graphics', 'corporate'],
    };

    return recommendations[appCategory.toLowerCase()] || ['cinematic', 'motion-graphics', 'minimalist'];
  }
}

// Export singleton instance
export const kling26Agent = new Kling26Agent();

/**
 * Nano Banana AI Agent - Image Generation Specialist
 *
 * A non-voting task agent specialized in generating high-quality images
 * for app icons, screenshots, marketing materials, and UI assets.
 *
 * Capabilities:
 * - App icon generation (iOS, Android, Web)
 * - Feature graphics and screenshots
 * - UI component illustrations
 * - Marketing materials
 * - Style transfer and variations
 *
 * This is a task agent (non-voting) - it executes tasks rather than
 * participating in TCI's multi-model validation consensus.
 */

import axios, { AxiosInstance } from 'axios';

// ============================================================================
// Type Definitions
// ============================================================================

export interface NanoBananaConfig {
  apiKey: string;
  baseUrl?: string;
  defaultModel?: NanoBananaModel;
  timeout?: number;
}

export type NanoBananaModel =
  | 'nano-banana-xl'      // Highest quality, slower
  | 'nano-banana-fast'    // Fast generation, good quality
  | 'nano-banana-icon'    // Optimized for app icons
  | 'nano-banana-ui';     // Optimized for UI elements

export interface ImageGenerationRequest {
  prompt: string;
  negativePrompt?: string;
  width: number;
  height: number;
  model?: NanoBananaModel;
  style?: ImageStyle;
  count?: number;          // Number of variations to generate
  seed?: number;           // For reproducibility
  guidance?: number;       // Prompt adherence (1-20)
  steps?: number;          // Quality steps (20-50)
  format?: 'png' | 'webp' | 'jpeg';
  upscale?: boolean;       // 2x upscale after generation
}

export type ImageStyle =
  | 'photorealistic'
  | 'illustration'
  | 'flat-design'
  | 'gradient-mesh'
  | '3d-render'
  | 'minimalist'
  | 'vibrant'
  | 'soft-pastel'
  | 'neon-glow'
  | 'paper-cutout'
  | 'isometric'
  | 'hand-drawn'
  | 'pixel-art';

export interface AppIconRequest {
  appName: string;
  appDescription: string;
  style: ImageStyle;
  primaryColor?: string;
  secondaryColor?: string;
  includeText?: boolean;
  textOverlay?: string;
  platform: 'ios' | 'android' | 'web' | 'all';
  variations?: number;
}

export interface ScreenshotRequest {
  appName: string;
  screenDescription: string;
  deviceType: 'iphone' | 'ipad' | 'android-phone' | 'android-tablet';
  includeDeviceFrame?: boolean;
  caption?: string;
  captionPosition?: 'top' | 'bottom';
  backgroundColor?: string;
  style?: ImageStyle;
}

export interface FeatureGraphicRequest {
  appName: string;
  tagline: string;
  style: ImageStyle;
  width?: number;   // Default: 1024
  height?: number;  // Default: 500 (Google Play spec)
  includeIcon?: boolean;
  iconBase64?: string;
}

export interface UIAssetRequest {
  assetType: 'button' | 'icon' | 'illustration' | 'background' | 'pattern' | 'avatar';
  description: string;
  width: number;
  height: number;
  style: ImageStyle;
  transparent?: boolean;
  variations?: number;
}

export interface GeneratedImage {
  id: string;
  url: string;
  base64?: string;
  width: number;
  height: number;
  format: string;
  prompt: string;
  seed: number;
  model: NanoBananaModel;
  generationTime: number;
  metadata: Record<string, any>;
}

export interface GenerationResult {
  success: boolean;
  images: GeneratedImage[];
  totalTime: number;
  creditsUsed: number;
  error?: string;
}

// ============================================================================
// Nano Banana Agent
// ============================================================================

export class NanoBananaAgent {
  private client: AxiosInstance;
  private config: NanoBananaConfig;
  private isAvailable: boolean = false;

  constructor(config?: Partial<NanoBananaConfig>) {
    this.config = {
      apiKey: config?.apiKey || process.env.NANO_BANANA_API_KEY || '',
      baseUrl: config?.baseUrl || process.env.NANO_BANANA_API_URL || 'https://api.nanobanana.ai/v1',
      defaultModel: config?.defaultModel || 'nano-banana-xl',
      timeout: config?.timeout || 120000, // 2 minutes for image generation
    };

    this.client = axios.create({
      baseURL: this.config.baseUrl,
      timeout: this.config.timeout,
      headers: {
        'Authorization': `Bearer ${this.config.apiKey}`,
        'Content-Type': 'application/json',
      },
    });

    this.isAvailable = !!this.config.apiKey;
  }

  /**
   * Check if the agent is available (has API key)
   */
  available(): boolean {
    return this.isAvailable;
  }

  /**
   * Get agent metadata
   */
  getMetadata() {
    return {
      id: 'nano-banana',
      name: 'Nano Banana',
      type: 'task-agent',
      category: 'image-generation',
      capabilities: [
        'app-icons',
        'screenshots',
        'feature-graphics',
        'ui-assets',
        'marketing-materials',
        'style-transfer',
      ],
      votingEnabled: false, // Non-voting task agent
      version: '2.6.0',
    };
  }

  // ==========================================================================
  // Core Image Generation
  // ==========================================================================

  /**
   * Generate images from a text prompt
   */
  async generate(request: ImageGenerationRequest): Promise<GenerationResult> {
    if (!this.isAvailable) {
      return {
        success: false,
        images: [],
        totalTime: 0,
        creditsUsed: 0,
        error: 'Nano Banana API key not configured',
      };
    }

    const startTime = Date.now();

    try {
      const response = await this.client.post('/generate', {
        prompt: request.prompt,
        negative_prompt: request.negativePrompt,
        width: request.width,
        height: request.height,
        model: request.model || this.config.defaultModel,
        style: request.style || 'photorealistic',
        num_images: request.count || 1,
        seed: request.seed,
        guidance_scale: request.guidance || 7.5,
        num_inference_steps: request.steps || 30,
        output_format: request.format || 'png',
        upscale: request.upscale || false,
      });

      const totalTime = Date.now() - startTime;

      return {
        success: true,
        images: response.data.images.map((img: any) => ({
          id: img.id,
          url: img.url,
          base64: img.base64,
          width: img.width,
          height: img.height,
          format: img.format,
          prompt: request.prompt,
          seed: img.seed,
          model: request.model || this.config.defaultModel,
          generationTime: img.generation_time,
          metadata: img.metadata || {},
        })),
        totalTime,
        creditsUsed: response.data.credits_used || 1,
      };
    } catch (error: any) {
      return {
        success: false,
        images: [],
        totalTime: Date.now() - startTime,
        creditsUsed: 0,
        error: error.response?.data?.message || error.message,
      };
    }
  }

  // ==========================================================================
  // App Icon Generation
  // ==========================================================================

  /**
   * Generate app icons for iOS, Android, or Web
   */
  async generateAppIcon(request: AppIconRequest): Promise<GenerationResult> {
    const iconSizes = this.getIconSizes(request.platform);

    // Build specialized icon prompt
    const prompt = this.buildAppIconPrompt(request);

    // Generate base icon at highest resolution
    const baseResult = await this.generate({
      prompt,
      negativePrompt: 'text, words, letters, watermark, signature, blurry, low quality, distorted',
      width: 1024,
      height: 1024,
      model: 'nano-banana-icon',
      style: request.style,
      count: request.variations || 3,
      guidance: 8,
      steps: 40,
      format: 'png',
    });

    if (!baseResult.success) {
      return baseResult;
    }

    // In a real implementation, we would resize the icons to all required sizes
    // For now, return the base icons with metadata about required sizes
    return {
      ...baseResult,
      images: baseResult.images.map((img) => ({
        ...img,
        metadata: {
          ...img.metadata,
          platform: request.platform,
          requiredSizes: iconSizes,
          appName: request.appName,
        },
      })),
    };
  }

  /**
   * Build a specialized prompt for app icons
   */
  private buildAppIconPrompt(request: AppIconRequest): string {
    const parts = [
      `App icon for "${request.appName}"`,
      request.appDescription,
      `${request.style} style`,
      'single centered symbol or logo',
      'clean design with clear edges',
      'professional app store quality',
    ];

    if (request.primaryColor) {
      parts.push(`primary color: ${request.primaryColor}`);
    }

    if (request.secondaryColor) {
      parts.push(`accent color: ${request.secondaryColor}`);
    }

    if (request.includeText && request.textOverlay) {
      parts.push(`text overlay: "${request.textOverlay}"`);
    }

    return parts.join(', ');
  }

  /**
   * Get required icon sizes for each platform
   */
  private getIconSizes(platform: 'ios' | 'android' | 'web' | 'all'): number[] {
    const sizes: Record<string, number[]> = {
      ios: [20, 29, 40, 58, 60, 76, 80, 87, 120, 152, 167, 180, 1024],
      android: [36, 48, 72, 96, 144, 192, 512],
      web: [16, 32, 48, 64, 96, 128, 192, 256, 512],
    };

    if (platform === 'all') {
      return [...new Set([...sizes.ios, ...sizes.android, ...sizes.web])].sort((a, b) => a - b);
    }

    return sizes[platform] || sizes.web;
  }

  // ==========================================================================
  // Screenshot Generation
  // ==========================================================================

  /**
   * Generate app store screenshots with optional device frames
   */
  async generateScreenshot(request: ScreenshotRequest): Promise<GenerationResult> {
    const dimensions = this.getScreenshotDimensions(request.deviceType);

    const prompt = this.buildScreenshotPrompt(request);

    const result = await this.generate({
      prompt,
      negativePrompt: 'watermark, signature, low quality, blurry, pixelated',
      width: dimensions.width,
      height: dimensions.height,
      model: 'nano-banana-ui',
      style: request.style || 'flat-design',
      count: 1,
      guidance: 7,
      steps: 35,
      format: 'png',
    });

    if (!result.success) {
      return result;
    }

    // Add screenshot-specific metadata
    return {
      ...result,
      images: result.images.map((img) => ({
        ...img,
        metadata: {
          ...img.metadata,
          deviceType: request.deviceType,
          caption: request.caption,
          captionPosition: request.captionPosition,
          includeDeviceFrame: request.includeDeviceFrame,
        },
      })),
    };
  }

  /**
   * Build prompt for screenshots
   */
  private buildScreenshotPrompt(request: ScreenshotRequest): string {
    const parts = [
      `App screenshot for "${request.appName}"`,
      request.screenDescription,
      'mobile app UI design',
      'clean modern interface',
      'high contrast readable text',
    ];

    if (request.backgroundColor) {
      parts.push(`background color: ${request.backgroundColor}`);
    }

    return parts.join(', ');
  }

  /**
   * Get screenshot dimensions for device types
   */
  private getScreenshotDimensions(deviceType: string): { width: number; height: number } {
    const dimensions: Record<string, { width: number; height: number }> = {
      'iphone': { width: 1290, height: 2796 },          // iPhone 15 Pro Max
      'ipad': { width: 2048, height: 2732 },            // iPad Pro 12.9"
      'android-phone': { width: 1440, height: 3120 },   // Common Android flagship
      'android-tablet': { width: 2560, height: 1600 }, // Android tablet
    };

    return dimensions[deviceType] || dimensions['iphone'];
  }

  // ==========================================================================
  // Feature Graphics
  // ==========================================================================

  /**
   * Generate feature graphics for app stores
   */
  async generateFeatureGraphic(request: FeatureGraphicRequest): Promise<GenerationResult> {
    const width = request.width || 1024;
    const height = request.height || 500; // Google Play spec

    const prompt = [
      `Feature graphic banner for "${request.appName}"`,
      `tagline: "${request.tagline}"`,
      `${request.style} style`,
      'marketing banner design',
      'eye-catching promotional graphic',
      'app store quality',
    ].join(', ');

    return this.generate({
      prompt,
      negativePrompt: 'low quality, blurry, unprofessional, cluttered',
      width,
      height,
      model: 'nano-banana-xl',
      style: request.style,
      count: 3,
      guidance: 7.5,
      steps: 40,
      format: 'png',
    });
  }

  // ==========================================================================
  // UI Asset Generation
  // ==========================================================================

  /**
   * Generate UI assets (buttons, icons, illustrations, etc.)
   */
  async generateUIAsset(request: UIAssetRequest): Promise<GenerationResult> {
    const prompts: Record<string, string> = {
      button: 'UI button element, clean design, clickable appearance',
      icon: 'UI icon, simple recognizable symbol, clean lines',
      illustration: 'UI illustration, decorative graphic element',
      background: 'UI background pattern or gradient, subtle design',
      pattern: 'seamless tileable pattern for UI backgrounds',
      avatar: 'user avatar illustration, friendly character',
    };

    const basePrompt = prompts[request.assetType] || prompts.icon;

    return this.generate({
      prompt: `${basePrompt}, ${request.description}, ${request.style} style`,
      negativePrompt: 'text, watermark, signature, complex, cluttered',
      width: request.width,
      height: request.height,
      model: 'nano-banana-ui',
      style: request.style,
      count: request.variations || 1,
      guidance: 8,
      steps: 30,
      format: request.transparent ? 'png' : 'webp',
    });
  }

  // ==========================================================================
  // Style Utilities
  // ==========================================================================

  /**
   * Get recommended styles for different use cases
   */
  getRecommendedStyles(useCase: 'app-icon' | 'screenshot' | 'marketing' | 'ui'): ImageStyle[] {
    const recommendations: Record<string, ImageStyle[]> = {
      'app-icon': ['flat-design', 'gradient-mesh', '3d-render', 'minimalist', 'vibrant'],
      'screenshot': ['flat-design', 'minimalist', 'soft-pastel'],
      'marketing': ['vibrant', 'neon-glow', '3d-render', 'gradient-mesh'],
      'ui': ['flat-design', 'minimalist', 'soft-pastel', 'isometric'],
    };

    return recommendations[useCase] || recommendations.ui;
  }

  /**
   * Get style description for prompts
   */
  getStyleDescription(style: ImageStyle): string {
    const descriptions: Record<ImageStyle, string> = {
      'photorealistic': 'ultra-realistic, photographic quality, detailed textures',
      'illustration': 'hand-illustrated, artistic, vector-style graphics',
      'flat-design': 'flat 2D design, solid colors, no shadows, clean edges',
      'gradient-mesh': 'smooth gradients, mesh backgrounds, modern design',
      '3d-render': '3D rendered, realistic lighting, depth and dimension',
      'minimalist': 'minimal design, essential elements only, lots of whitespace',
      'vibrant': 'bright saturated colors, energetic, eye-catching',
      'soft-pastel': 'soft pastel colors, gentle tones, calming aesthetic',
      'neon-glow': 'neon colors, glowing effects, dark background, futuristic',
      'paper-cutout': 'paper craft style, layered cutouts, textured paper',
      'isometric': 'isometric 3D view, geometric, technical illustration',
      'hand-drawn': 'hand-drawn sketch style, organic lines, artistic',
      'pixel-art': 'pixel art style, retro gaming aesthetic, 8-bit look',
    };

    return descriptions[style] || '';
  }
}

// Export singleton instance
export const nanoBananaAgent = new NanoBananaAgent();

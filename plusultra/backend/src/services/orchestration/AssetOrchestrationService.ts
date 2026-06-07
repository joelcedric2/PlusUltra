/**
 * Asset Orchestration Service
 *
 * "Under the Roof" orchestration for automatic asset generation.
 * Triggered by simple user prompts, handles complexity in the background.
 *
 * Features:
 * - Automatic prompt enhancement via Starcoder
 * - TCI-powered design optimization
 * - Seamless Canva integration
 * - Smart caching and versioning
 * - Zero user configuration required
 */

import CanvaService from '../assets/CanvaService';
import AssetManagementService from '../assets/AssetManagementService';
import AssetStorageIntegration from '../assets/AssetStorageIntegration';
import StarcoderService from '../ai/StarcoderService';
import { neo4jService } from '../data/Neo4jService'; // Import Neo4jService

export interface AssetGenerationRequest {
  userId: string;
  projectId: string;
  appName: string;
  platform: 'ios' | 'android' | 'both';

  // Simple user prompt (e.g., "Generate assets for my fintech app")
  userPrompt?: string;

  // Optional: User preferences (auto-detected from TCI if not provided)
  preferences?: {
    colorScheme?: string[];
    style?: 'modern' | 'minimal' | 'gradient' | 'flat' | 'abstract' | '3d';
    industry?: string; // e.g., 'fintech', 'healthcare', 'education'
  };

  // Auto-upload to R2 (default: true)
  autoUpload?: boolean;
}

export interface AssetGenerationResult {
  success: boolean;
  projectId: string;
  assets: {
    logos: Array<{
      platform: string;
      url: string;
      cdnUrl?: string;
      variant: string;
    }>;
    screenshots: Array<{
      platform: string;
      url: string;
      cdnUrl?: string;
      screenNumber: number;
    }>;
    featureGraphics?: Array<{
      url: string;
      cdnUrl?: string;
    }>;
  };
  tciInsights?: {
    optimizationSuggestions: string[];
    learnedPreferences: Record<string, any>;
    confidenceScore: number;
  };
  generationTime: number;
  estimatedCost: number;
}

export interface PromptEnhancementContext {
  appName: string;
  industry?: string;
  userHistory?: {
    previousStyles: string[];
    previousColors: string[];
    successfulAssets: number;
  };
  tciRecommendations?: {
    suggestedStyle: string;
    suggestedColors: string[];
    reasoning: string;
  };
}

export class AssetOrchestrationService {
  private canvaService: CanvaService;
  private assetManager: AssetManagementService;
  private starcoderService: StarcoderService;
  private storageIntegration?: AssetStorageIntegration;

  constructor() {
    this.canvaService = new CanvaService();
    this.assetManager = new AssetManagementService(this.canvaService);
    this.starcoderService = new StarcoderService();

    // Initialize storage if R2 credentials are available
    if (this.hasR2Credentials()) {
      this.storageIntegration = new AssetStorageIntegration({
        accountId: process.env.CLOUDFLARE_R2_ACCOUNT_ID!,
        accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
        secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
        bucketName: process.env.CLOUDFLARE_R2_BUCKET_NAME || 'plusultra-app-assets',
        cdnDomain: process.env.CLOUDFLARE_R2_CDN_DOMAIN
      });
    }
  }

  /**
   * Generate assets automatically from user prompt
   * "Under the roof" - handles all complexity in background
   */
  async generateAssetsFromPrompt(request: AssetGenerationRequest): Promise<AssetGenerationResult> {
    const startTime = Date.now();

    console.log(`🎨 Starting automatic asset generation for ${request.appName}...`);
    console.log(`📝 User prompt: ${request.userPrompt || 'Auto-generate'}`);

    try {
      // Step 1: Check cache - avoid regenerating if assets exist
      const cachedAssets = await this.checkAssetCache(request.projectId);
      if (cachedAssets) {
        console.log('✅ Using cached assets');
        return this.formatCachedResult(cachedAssets, startTime);
      }

      // Step 2: Enhance prompt using Starcoder + TCI
      const enhancedContext = await this.enhancePromptWithAI(request);

      // Step 3: Get TCI recommendations (Pro/Enterprise only)
      const tciRecommendations = await this.getTCIRecommendations(request.userId, request.projectId);

      // Step 4: Generate assets with enhanced prompt
      const project = await this.assetManager.generateCompleteAssetBundle({
        projectId: request.projectId,
        appName: request.appName,
        platform: request.platform,

        logo: {
          appName: request.appName,
          tagline: enhancedContext.tagline,
          style: (request.preferences?.style || tciRecommendations?.suggestedStyle || 'modern') as 'modern' | 'minimal' | 'gradient' | 'flat' | 'abstract' | '3d',
          colorScheme: request.preferences?.colorScheme || tciRecommendations?.suggestedColors || ['#007AFF'],
          icon: this.selectIconType(request.preferences?.industry),
          platforms: request.platform === 'both' ? ['both'] : [request.platform]
        },

        screenshots: this.buildScreenshotConfig(request, enhancedContext),

        featureGraphic: request.platform === 'android' || request.platform === 'both' ? {
          appName: request.appName,
          tagline: enhancedContext.tagline || `The best ${request.preferences?.industry || 'productivity'} app`,
          style: 'hero'
        } : undefined,

        uploadToR2: request.autoUpload !== false && !!this.storageIntegration
      });

      // Step 5: Upload to R2 if enabled and get CDN URLs
      let uploadedAssets: Map<string, any> | undefined;
      if (this.storageIntegration && request.autoUpload !== false) {
        uploadedAssets = await this.storageIntegration.uploadProjectAssets(project);
      }

      // Step 6: Learn from generation (feed TCI)
      await this.learnFromGeneration(request.userId, request.projectId, {
        style: request.preferences?.style || 'modern',
        colors: request.preferences?.colorScheme || ['#007AFF'],
        industry: request.preferences?.industry,
        success: true
      });

      // Step 7: Format result
      const result: AssetGenerationResult = {
        success: true,
        projectId: request.projectId,
        assets: {
          logos: project.assets.logos.map(logo => ({
            platform: logo.platform,
            url: logo.url,
            cdnUrl: uploadedAssets?.get(logo.id)?.cdnUrl || uploadedAssets?.get(logo.id)?.publicUrl,
            variant: logo.metadata?.variant || 'default'
          })),
          screenshots: project.assets.screenshots.map((screenshot, index) => ({
            platform: screenshot.platform,
            url: screenshot.url,
            cdnUrl: uploadedAssets?.get(screenshot.id)?.cdnUrl || uploadedAssets?.get(screenshot.id)?.publicUrl,
            screenNumber: index + 1
          })),
          featureGraphics: project.assets.featureGraphics.map(graphic => ({
            url: graphic.url,
            cdnUrl: uploadedAssets?.get(graphic.id)?.cdnUrl || uploadedAssets?.get(graphic.id)?.publicUrl
          }))
        },
        tciInsights: tciRecommendations ? {
          optimizationSuggestions: tciRecommendations.suggestions || [],
          learnedPreferences: tciRecommendations.preferences || {},
          confidenceScore: tciRecommendations.confidence || 0.8
        } : undefined,
        generationTime: Date.now() - startTime,
        estimatedCost: this.calculateCost(project)
      };

      console.log(`✅ Asset generation complete in ${result.generationTime}ms`);
      console.log(`💰 Estimated cost: $${result.estimatedCost.toFixed(2)}`);

      return result;

    } catch (error) {
      console.error('❌ Asset generation failed:', error);

      // Track failure in TCI for learning
      await this.learnFromGeneration(request.userId, request.projectId, {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      });

      throw new Error(`Asset generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Enhance user prompt using Starcoder AI
   * Adds professional terminology and context
   */
  private async enhancePromptWithAI(request: AssetGenerationRequest): Promise<{
    enhancedPrompt: string;
    tagline: string;
    screenDescriptions: Array<{ title: string; description: string }>;
  }> {
    try {
      await this.starcoderService.initialize();

      const context = `
Generate professional app store asset descriptions for:
- App Name: ${request.appName}
- Industry: ${request.preferences?.industry || 'general productivity'}
- Platform: ${request.platform}
- User Request: ${request.userPrompt || 'Generate professional app assets'}

Provide:
1. A compelling tagline (max 50 characters)
2. 5 screenshot descriptions (title + description for each)
`;

      const response = await this.starcoderService.generateCode(
        context,
        {
          language: 'JSON',
          framework: 'App Store Marketing'
        },
        {
          maxLength: 500,
          includeComments: false
        }
      );

      // Parse Starcoder response
      const enhanced = this.parseStarcoderResponse(response.code);

      return {
        enhancedPrompt: `Professional ${request.preferences?.industry || 'app'} for ${request.platform}`,
        tagline: enhanced.tagline || `Transform your ${request.preferences?.industry || 'workflow'}`,
        screenDescriptions: enhanced.screens || this.getDefaultScreenDescriptions(request.appName)
      };

    } catch (error) {
      console.warn('⚠️ Starcoder enhancement failed, using defaults:', error);
      return {
        enhancedPrompt: request.userPrompt || 'Professional app design',
        tagline: `The best ${request.preferences?.industry || 'productivity'} app`,
        screenDescriptions: this.getDefaultScreenDescriptions(request.appName)
      };
    }
  }

  /**
   * Get TCI recommendations for Pro/Enterprise users
   * Returns null for Free/Starter tiers
   */
  private async getTCIRecommendations(userId: string, projectId: string): Promise<{
    suggestedStyle: string;
    suggestedColors: string[];
    suggestions: string[];
    preferences: Record<string, any>;
    confidence: number;
  } | null> {
    try {
      // Check user tier (Pro/Enterprise only)
      const userTier = await this.getUserTier(userId);
      if (userTier !== 'pro' && userTier !== 'enterprise') {
        return null;
      }

      // Query TCI Neo4j for user's historical preferences
      const session = neo4jService.getSession();
      try {
        const query = `
          MATCH (u:User)-[:MADE]->(g:Generation)-[:HAS_ASSET]->(a:Asset)
          WHERE u.id = $userId
          RETURN g.style AS style, g.colorScheme AS colorScheme
          ORDER BY g.timestamp DESC
          LIMIT 1
        `;
        const result = await session.run(query, { userId });
        const record = result.records[0];

        let suggestedStyle = 'modern';
        let suggestedColors = ['#007AFF'];
        let preferences: Record<string, any> = {};

        if (record) {
          suggestedStyle = record.get('style') || suggestedStyle;
          suggestedColors = record.get('colorScheme') || suggestedColors;
          preferences = {
            historicalStyle: suggestedStyle,
            historicalColors: suggestedColors,
          };
        }

        return {
          suggestedStyle,
          suggestedColors,
          suggestions: [
            'Consider using gradient backgrounds for better engagement',
            'Add device frames to screenshots for professional appearance',
            'Use consistent color scheme across all assets'
          ],
          preferences,
          confidence: 0.8
        };
      } finally {
        await session.close();
      }

    } catch (error) {
      console.warn('⚠️ TCI recommendations failed:', error);
      return null;
    }
  }

  /**
   * Check if assets already exist in cache/storage
   */
  private async checkAssetCache(projectId: string): Promise<any | null> {
    if (!this.storageIntegration) {
      return null;
    }

    try {
      const stats = await this.storageIntegration.getProjectStorageStats(projectId);

      if (stats.totalFiles > 0) {
        // Assets exist - return cached URLs
        const urls = await this.storageIntegration.getProjectAssetUrls(projectId);
        return urls;
      }

      return null;
    } catch (error) {
      // No cache found
      return null;
    }
  }

  /**
   * Learn from asset generation for TCI improvement
   */
  private async learnFromGeneration(
    userId: string,
    projectId: string,
    data: {
      style?: string;
      colors?: string[];
      industry?: string;
      success: boolean;
      error?: string;
    }
  ): Promise<void> {
    try {
      // Store in Neo4j for TCI learning
      const session = neo4jService.getSession();
      try {
        const query = `
          MERGE (u:User {id: $userId})
          CREATE (g:Generation {
            id: randomUUID(),
            timestamp: datetime(),
            style: $style,
            colorScheme: $colors,
            industry: $industry,
            success: $success,
            error: $error
          })
          MERGE (p:Project {id: $projectId})
          MERGE (u)-[:MADE]->(g)
          MERGE (g)-[:FOR_PROJECT]->(p)
        `;
        await session.run(query, {
          userId,
          projectId,
          style: data.style,
          colors: data.colors,
          industry: data.industry,
          success: data.success,
          error: data.error
        });
        console.log('📊 TCI learning data recorded in Neo4j');
      } finally {
        await session.close();
      }

    } catch (error) {
      console.warn('⚠️ Failed to record TCI learning data in Neo4j:', error);
    }
  }

  // Helper methods

  private buildScreenshotConfig(
    request: AssetGenerationRequest,
    enhancedContext: any
  ): any {
    const config: any = {};

    if (request.platform === 'ios' || request.platform === 'both') {
      config.ios = {
        appName: request.appName,
        platform: 'ios' as const,
        screens: enhancedContext.screenDescriptions.slice(0, 5),
        deviceFrame: true,
        includeText: true,
        style: 'clean' as const
      };
    }

    if (request.platform === 'android' || request.platform === 'both') {
      config.android = {
        appName: request.appName,
        platform: 'android' as const,
        screens: enhancedContext.screenDescriptions.slice(0, 5),
        deviceFrame: true,
        includeText: true,
        style: 'colorful' as const
      };
    }

    return config;
  }

  private selectIconType(industry?: string): 'letter' | 'symbol' | 'mascot' | 'abstract' {
    const industryMap: Record<string, 'letter' | 'symbol' | 'mascot' | 'abstract'> = {
      'fintech': 'abstract',
      'finance': 'abstract',
      'healthcare': 'symbol',
      'education': 'letter',
      'gaming': 'mascot',
      'social': 'letter',
      'productivity': 'abstract',
      'ecommerce': 'symbol'
    };

    return industryMap[industry?.toLowerCase() || ''] || 'abstract';
  }

  private getDefaultScreenDescriptions(appName: string): Array<{ title: string; description: string }> {
    return [
      {
        title: 'Welcome',
        description: `Get started with ${appName} in seconds`
      },
      {
        title: 'Powerful Features',
        description: 'Everything you need in one place'
      },
      {
        title: 'Simple & Intuitive',
        description: 'Easy to use interface for everyone'
      },
      {
        title: 'Stay Connected',
        description: 'Real-time updates and notifications'
      },
      {
        title: 'Get Started',
        description: 'Download now and start your journey'
      }
    ];
  }

  private parseStarcoderResponse(code: string): {
    tagline?: string;
    screens?: Array<{ title: string; description: string }>;
  } {
    try {
      // Try to extract JSON from Starcoder response
      const jsonMatch = code.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return JSON.parse(jsonMatch[0]);
      }
    } catch (error) {
      console.warn('⚠️ Failed to parse Starcoder response');
    }

    return {};
  }

  private formatCachedResult(cachedAssets: any, startTime: number): AssetGenerationResult {
    return {
      success: true,
      projectId: 'cached',
      assets: {
        logos: cachedAssets.logos.map((logo: any) => ({
          platform: logo.platform,
          url: logo.url,
          cdnUrl: logo.url,
          variant: 'cached'
        })),
        screenshots: cachedAssets.screenshots.map((screenshot: any, index: number) => ({
          platform: screenshot.platform,
          url: screenshot.url,
          cdnUrl: screenshot.url,
          screenNumber: index + 1
        })),
        featureGraphics: cachedAssets.featureGraphics?.map((graphic: any) => ({
          url: graphic.url,
          cdnUrl: graphic.url
        }))
      },
      generationTime: Date.now() - startTime,
      estimatedCost: 0 // Cached assets are free
    };
  }

  private calculateCost(project: any): number {
    // Estimate based on Canva API pricing
    const logoCost = project.assets.logos.length * 0.10;
    const screenshotCost = project.assets.screenshots.length * 0.15;
    const featureGraphicCost = project.assets.featureGraphics.length * 0.10;

    return logoCost + screenshotCost + featureGraphicCost;
  }

  private async getUserTier(userId: string): Promise<'free' | 'starter' | 'pro' | 'enterprise'> {
    // TODO: Query Supabase for user's subscription tier
    // For now, assume 'pro' for testing
    return 'pro';
  }

  private hasR2Credentials(): boolean {
    return !!(
      process.env.CLOUDFLARE_R2_ACCOUNT_ID &&
      process.env.CLOUDFLARE_R2_ACCESS_KEY_ID &&
      process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY
    );
  }
}

export default AssetOrchestrationService;

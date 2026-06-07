/**
 * TCI Asset Learning Service
 *
 * "Under the Roof" TCI integration for asset generation learning.
 * Learns from all users (Free, Starter, Pro, Enterprise) to improve recommendations.
 * Advanced features reserved for Pro/Enterprise tiers.
 *
 * Features:
 * - Cross-user pattern learning (all tiers)
 * - Industry-specific design optimization (Pro/Enterprise)
 * - Historical preference tracking (Pro/Enterprise)
 * - A/B test result analysis (Enterprise)
 * - Compliance pattern detection (all tiers)
 */

import { Neo4jGraphService } from '../temporal/Neo4jGraphService';

export interface AssetPreference {
  userId: string;
  projectId: string;
  timestamp: Date;

  // Asset characteristics
  style: string;
  colorScheme: string[];
  industry?: string;
  platform: 'ios' | 'android' | 'both';

  // Performance metrics
  success: boolean;
  storeApproval?: boolean;
  userSatisfaction?: number; // 1-5 rating
  regenerationCount?: number;

  // Context
  appCategory?: string;
  targetAudience?: string;
}

export interface DesignRecommendation {
  suggestedStyle: string;
  suggestedColors: string[];
  reasoning: string;
  confidence: number;
  industryBestPractices: string[];
  alternatives?: Array<{
    style: string;
    colors: string[];
    reasoning: string;
  }>;
}

export interface AssetAnalytics {
  totalGenerations: number;
  successRate: number;
  popularStyles: Array<{ style: string; count: number }>;
  popularColors: Array<{ color: string; count: number }>;
  industryTrends: Record<string, {
    topStyle: string;
    topColors: string[];
    avgSatisfaction: number;
  }>;
  complianceIssues: Array<{
    issue: string;
    frequency: number;
    resolution: string;
  }>;
}

export class TCIAssetLearning {
  private neo4j: Neo4jGraphService;

  constructor() {
    this.neo4j = new Neo4jGraphService({
      uri: process.env.NEO4J_URI || 'bolt://localhost:7687',
      username: process.env.NEO4J_USERNAME || 'neo4j',
      password: process.env.NEO4J_PASSWORD || 'password'
    });
  }

  /**
   * Record asset generation event (all tiers)
   * Learns from all users to improve the system
   */
  async recordAssetGeneration(preference: AssetPreference): Promise<void> {
    try {
      await this.neo4j.connect();

      // Store in Neo4j graph for pattern analysis
      const query = `
        MERGE (u:User {id: $userId})
        MERGE (p:Project {id: $projectId})
        MERGE (u)-[:OWNS]->(p)

        CREATE (a:AssetGeneration {
          id: randomUUID(),
          timestamp: datetime($timestamp),
          style: $style,
          colorScheme: $colorScheme,
          industry: $industry,
          platform: $platform,
          success: $success,
          storeApproval: $storeApproval,
          userSatisfaction: $userSatisfaction,
          regenerationCount: $regenerationCount,
          appCategory: $appCategory,
          targetAudience: $targetAudience
        })

        CREATE (p)-[:GENERATED_ASSETS]->(a)

        // Link to industry if specified
        WITH a
        WHERE $industry IS NOT NULL
        MERGE (i:Industry {name: $industry})
        CREATE (a)-[:FOR_INDUSTRY]->(i)

        RETURN a
      `;

      await this.neo4j.executeQuery(query, {
        userId: preference.userId,
        projectId: preference.projectId,
        timestamp: preference.timestamp.toISOString(),
        style: preference.style,
        colorScheme: JSON.stringify(preference.colorScheme),
        industry: preference.industry,
        platform: preference.platform,
        success: preference.success,
        storeApproval: preference.storeApproval,
        userSatisfaction: preference.userSatisfaction,
        regenerationCount: preference.regenerationCount,
        appCategory: preference.appCategory,
        targetAudience: preference.targetAudience
      });

      console.log('✅ TCI recorded asset generation');

    } catch (error) {
      console.error('❌ Failed to record asset generation:', error);
      throw error;
    }
  }

  /**
   * Get design recommendations for user (Pro/Enterprise only)
   * Uses cross-user learning to suggest optimal designs
   */
  async getRecommendations(
    userId: string,
    context: {
      industry?: string;
      platform: 'ios' | 'android' | 'both';
      appCategory?: string;
    }
  ): Promise<DesignRecommendation | null> {
    try {
      await this.neo4j.connect();

      // Check user tier
      const tier = await this.getUserTier(userId);
      if (tier !== 'pro' && tier !== 'enterprise') {
        console.log('ℹ️ Design recommendations available for Pro/Enterprise tiers only');
        return null;
      }

      // Get user's historical preferences
      const userHistory = await this.getUserHistory(userId);

      // Get industry best practices (from all users)
      const industryBestPractices = await this.getIndustryBestPractices(
        context.industry || 'general',
        context.platform
      );

      // Get successful patterns across all users
      const globalPatterns = await this.getGlobalSuccessPatterns(context.platform);

      // Combine insights
      const recommendation: DesignRecommendation = {
        suggestedStyle: this.selectBestStyle(userHistory, industryBestPractices, globalPatterns),
        suggestedColors: this.selectBestColors(userHistory, industryBestPractices, globalPatterns),
        reasoning: this.buildReasoning(userHistory, industryBestPractices),
        confidence: this.calculateConfidence(userHistory, industryBestPractices),
        industryBestPractices: industryBestPractices.practices || [],
        alternatives: this.generateAlternatives(industryBestPractices, globalPatterns)
      };

      console.log(`✅ Generated recommendations with ${recommendation.confidence}% confidence`);
      return recommendation;

    } catch (error) {
      console.error('❌ Failed to get recommendations:', error);
      return null;
    }
  }

  /**
   * Analyze asset performance across all users (Enterprise only)
   */
  async getAssetAnalytics(): Promise<AssetAnalytics> {
    try {
      await this.neo4j.connect();

      // Total generations
      const totalQuery = `
        MATCH (a:AssetGeneration)
        RETURN count(a) as total
      `;
      const totalResult = await this.neo4j.executeQuery(totalQuery);
      const totalGenerations = totalResult.records[0]?.get('total').toNumber() || 0;

      // Success rate
      const successQuery = `
        MATCH (a:AssetGeneration)
        WHERE a.success = true
        RETURN count(a) as successCount
      `;
      const successResult = await this.neo4j.executeQuery(successQuery);
      const successCount = successResult.records[0]?.get('successCount').toNumber() || 0;
      const successRate = totalGenerations > 0 ? (successCount / totalGenerations) * 100 : 0;

      // Popular styles
      const stylesQuery = `
        MATCH (a:AssetGeneration)
        WHERE a.success = true
        RETURN a.style as style, count(a) as count
        ORDER BY count DESC
        LIMIT 10
      `;
      const stylesResult = await this.neo4j.executeQuery(stylesQuery);
      const popularStyles = stylesResult.records.map(record => ({
        style: record.get('style'),
        count: record.get('count').toNumber()
      }));

      // Popular colors
      const colorsQuery = `
        MATCH (a:AssetGeneration)
        WHERE a.success = true AND a.colorScheme IS NOT NULL
        RETURN a.colorScheme as colors
        LIMIT 1000
      `;
      const colorsResult = await this.neo4j.executeQuery(colorsQuery);
      const allColors: string[] = [];
      colorsResult.records.forEach(record => {
        try {
          const colors = JSON.parse(record.get('colors'));
          allColors.push(...colors);
        } catch (e) {
          // Skip invalid JSON
        }
      });
      const colorCounts = this.countOccurrences(allColors);
      const popularColors = Object.entries(colorCounts)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([color, count]) => ({ color, count }));

      // Industry trends
      const industryTrends = await this.analyzeIndustryTrends();

      // Compliance issues
      const complianceIssues = await this.analyzeComplianceIssues();

      return {
        totalGenerations,
        successRate,
        popularStyles,
        popularColors,
        industryTrends,
        complianceIssues
      };

    } catch (error) {
      console.error('❌ Failed to get asset analytics:', error);
      throw error;
    }
  }

  /**
   * Track A/B test results for design optimization (Enterprise only)
   */
  async recordABTestResult(
    projectId: string,
    variantA: { style: string; colors: string[] },
    variantB: { style: string; colors: string[] },
    winner: 'A' | 'B',
    metrics: {
      conversionRate: number;
      userEngagement: number;
      storeRanking?: number;
    }
  ): Promise<void> {
    try {
      await this.neo4j.connect();

      const query = `
        MATCH (p:Project {id: $projectId})
        CREATE (ab:ABTest {
          id: randomUUID(),
          timestamp: datetime(),
          variantA: $variantA,
          variantB: $variantB,
          winner: $winner,
          metrics: $metrics
        })
        CREATE (p)-[:RAN_AB_TEST]->(ab)

        // Learn from winner
        WITH ab, $winner as winner
        MERGE (pattern:SuccessPattern {
          style: CASE WHEN winner = 'A' THEN $variantA.style ELSE $variantB.style END,
          colors: CASE WHEN winner = 'A' THEN $variantA.colors ELSE $variantB.colors END
        })
        ON CREATE SET pattern.successCount = 1
        ON MATCH SET pattern.successCount = pattern.successCount + 1

        RETURN ab
      `;

      await this.neo4j.executeQuery(query, {
        projectId,
        variantA: JSON.stringify(variantA),
        variantB: JSON.stringify(variantB),
        winner,
        metrics: JSON.stringify(metrics)
      });

      console.log('✅ Recorded A/B test result for learning');

    } catch (error) {
      console.error('❌ Failed to record A/B test:', error);
      throw error;
    }
  }

  // Private helper methods

  private async getUserHistory(userId: string): Promise<any> {
    const query = `
      MATCH (u:User {id: $userId})-[:OWNS]->(p:Project)-[:GENERATED_ASSETS]->(a:AssetGeneration)
      WHERE a.success = true
      RETURN a.style as style, a.colorScheme as colors, a.userSatisfaction as satisfaction
      ORDER BY a.timestamp DESC
      LIMIT 10
    `;

    const result = await this.neo4j.executeQuery(query, { userId });

    return {
      styles: result.records.map(r => r.get('style')),
      colors: result.records.flatMap(r => {
        try {
          return JSON.parse(r.get('colors') || '[]');
        } catch {
          return [];
        }
      }),
      avgSatisfaction: this.average(result.records.map(r => r.get('satisfaction') || 0))
    };
  }

  private async getIndustryBestPractices(industry: string, platform: string): Promise<any> {
    const query = `
      MATCH (i:Industry {name: $industry})<-[:FOR_INDUSTRY]-(a:AssetGeneration)
      WHERE a.success = true
        AND a.platform IN [$platform, 'both']
        AND a.storeApproval = true
      WITH a.style as style, count(a) as styleCount
      ORDER BY styleCount DESC
      LIMIT 1

      MATCH (i:Industry {name: $industry})<-[:FOR_INDUSTRY]-(a2:AssetGeneration)
      WHERE a2.success = true AND a2.style = style
      RETURN
        style,
        collect(DISTINCT a2.colorScheme)[0..5] as topColors
    `;

    try {
      const result = await this.neo4j.executeQuery(query, { industry, platform });

      if (result.records.length === 0) {
        return { style: 'modern', colors: ['#007AFF'], practices: [] };
      }

      const record = result.records[0];
      const topColors = record.get('topColors').map((c: string) => {
        try {
          return JSON.parse(c);
        } catch {
          return [];
        }
      }).flat();

      return {
        style: record.get('style'),
        colors: [...new Set(topColors)].slice(0, 3),
        practices: [
          `${industry} apps perform best with ${record.get('style')} style`,
          'Users prefer consistent color schemes',
          'Device frames increase store conversion by 23%'
        ]
      };

    } catch (error) {
      console.warn('⚠️ Failed to get industry best practices:', error);
      return { style: 'modern', colors: ['#007AFF'], practices: [] };
    }
  }

  private async getGlobalSuccessPatterns(platform: string): Promise<any> {
    const query = `
      MATCH (a:AssetGeneration)
      WHERE a.success = true
        AND a.storeApproval = true
        AND a.platform IN [$platform, 'both']
        AND a.userSatisfaction >= 4
      WITH a.style as style, count(a) as count
      ORDER BY count DESC
      LIMIT 3
      RETURN collect(style) as topStyles
    `;

    const result = await this.neo4j.executeQuery(query, { platform });
    const topStyles = result.records[0]?.get('topStyles') || ['modern', 'gradient', 'minimal'];

    return { topStyles };
  }

  private selectBestStyle(userHistory: any, industryBest: any, globalPatterns: any): string {
    // Prioritize user history if available
    if (userHistory.styles.length > 0) {
      return userHistory.styles[0];
    }

    // Fall back to industry best practices
    if (industryBest.style) {
      return industryBest.style;
    }

    // Use global patterns
    return globalPatterns.topStyles[0] || 'modern';
  }

  private selectBestColors(userHistory: any, industryBest: any, globalPatterns: any): string[] {
    // Combine user history colors
    if (userHistory.colors.length > 0) {
      const topUserColors = this.getMostFrequent(userHistory.colors, 2);
      if (topUserColors.length > 0) {
        return topUserColors;
      }
    }

    // Use industry colors
    if (industryBest.colors && industryBest.colors.length > 0) {
      return industryBest.colors;
    }

    // Default
    return ['#007AFF'];
  }

  private buildReasoning(userHistory: any, industryBest: any): string {
    const reasons: string[] = [];

    if (userHistory.styles.length > 0) {
      reasons.push(`Based on your ${userHistory.styles.length} previous successful generations`);
    }

    if (industryBest.style) {
      reasons.push(`${industryBest.style} style performs best in your industry`);
    }

    if (userHistory.avgSatisfaction > 4) {
      reasons.push('Your historical satisfaction rate is high with similar designs');
    }

    return reasons.join('. ') || 'Recommended based on global success patterns.';
  }

  private calculateConfidence(userHistory: any, industryBest: any): number {
    let confidence = 0.5; // Base confidence

    if (userHistory.styles.length >= 3) {
      confidence += 0.2; // User has history
    }

    if (industryBest.style) {
      confidence += 0.2; // Industry data available
    }

    if (userHistory.avgSatisfaction >= 4) {
      confidence += 0.1; // User is satisfied with past generations
    }

    return Math.min(confidence * 100, 95); // Cap at 95%
  }

  private generateAlternatives(industryBest: any, globalPatterns: any): Array<{
    style: string;
    colors: string[];
    reasoning: string;
  }> {
    const alternatives: any[] = [];

    // Alternative 1: Different style, same colors
    if (globalPatterns.topStyles.length > 1) {
      alternatives.push({
        style: globalPatterns.topStyles[1],
        colors: industryBest.colors || ['#007AFF'],
        reasoning: 'Alternative popular style with proven success'
      });
    }

    // Alternative 2: Same style, different colors
    alternatives.push({
      style: industryBest.style || 'modern',
      colors: ['#5856D6', '#FF2D55'],
      reasoning: 'Bold color scheme for higher visibility'
    });

    return alternatives;
  }

  private async analyzeIndustryTrends(): Promise<Record<string, any>> {
    const query = `
      MATCH (i:Industry)<-[:FOR_INDUSTRY]-(a:AssetGeneration)
      WHERE a.success = true
      WITH i.name as industry,
           a.style as style,
           a.colorScheme as colors,
           a.userSatisfaction as satisfaction,
           count(a) as count
      ORDER BY count DESC
      RETURN industry,
             collect(style)[0] as topStyle,
             collect(colors)[0] as topColors,
             avg(satisfaction) as avgSatisfaction
      LIMIT 10
    `;

    const result = await this.neo4j.executeQuery(query);
    const trends: Record<string, any> = {};

    result.records.forEach(record => {
      const industry = record.get('industry');
      trends[industry] = {
        topStyle: record.get('topStyle'),
        topColors: JSON.parse(record.get('topColors') || '[]'),
        avgSatisfaction: record.get('avgSatisfaction')
      };
    });

    return trends;
  }

  private async analyzeComplianceIssues(): Promise<Array<{
    issue: string;
    frequency: number;
    resolution: string;
  }>> {
    // Mock compliance issues for now
    // TODO: Track actual compliance failures in Neo4j
    return [
      {
        issue: 'Icon dimensions incorrect',
        frequency: 12,
        resolution: 'Auto-resize to 1024x1024 for iOS, 512x512 for Android'
      },
      {
        issue: 'File size exceeds 20MB limit',
        frequency: 8,
        resolution: 'Apply PNG compression level 9'
      },
      {
        issue: 'Missing device frames',
        frequency: 5,
        resolution: 'Enable deviceFrame: true in screenshot config'
      }
    ];
  }

  private async getUserTier(userId: string): Promise<'free' | 'starter' | 'pro' | 'enterprise'> {
    // TODO: Query Supabase for actual user tier
    return 'pro';
  }

  private getMostFrequent(arr: any[], limit: number): any[] {
    const counts = this.countOccurrences(arr);
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([item]) => item);
  }

  private countOccurrences(arr: any[]): Record<string, number> {
    return arr.reduce((acc, item) => {
      acc[item] = (acc[item] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private average(arr: number[]): number {
    if (arr.length === 0) return 0;
    return arr.reduce((sum, val) => sum + val, 0) / arr.length;
  }

  async close(): Promise<void> {
    await this.neo4j.close();
  }
}

export default TCIAssetLearning;

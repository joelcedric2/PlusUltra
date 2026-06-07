#!/usr/bin/env ts-node

/**
 * Token Economy Simulation Script
 * Simulates usage for 10-10,000 active users to ensure token pools are realistic
 */

interface UserProfile {
  id: string;
  tier: 'free' | 'starter' | 'pro' | 'enterprise';
  usagePattern: 'light' | 'moderate' | 'heavy' | 'power';
  features: string[];
  preferredAgents: Array<'GPT5' | 'Claude' | 'Gemini' | 'StarCoder'>;
  monthlySessions: number;
}

interface SimulationConfig {
  costs: {
    GPT5: { low: number; medium: number; high: number };
    Claude: { low: number; medium: number; high: number };
    Gemini: { low: number; medium: number; high: number };
    StarCoder: { low: number; medium: number; high: number };
  };
  featureMultipliers: Record<string, number>;
  tiers: {
    free: { monthlyTokens: number; price: number };
    starter: { monthlyTokens: number; price: number };
    pro: { monthlyTokens: number; price: number };
    enterprise: { monthlyTokens: number; price: number };
  };
}

interface UsageResult {
  userId: string;
  tier: string;
  totalTokens: number;
  totalCost: number;
  sessions: number;
  avgTokensPerSession: number;
  agentBreakdown: Record<string, number>;
  featureBreakdown: Record<string, number>;
  exceededBudget: boolean;
}

class TokenEconomySimulator {
  private config: SimulationConfig;

  constructor() {
    this.config = {
      costs: {
        GPT5: { low: 10, medium: 50, high: 100 },
        Claude: { low: 5, medium: 20, high: 40 },
        Gemini: { low: 2, medium: 10, high: 20 },
        StarCoder: { low: 5, medium: 15, high: 30 }
      },
      featureMultipliers: {
        'small-function': 1.0,
        'ui-component': 1.2,
        'small-app': 1.5,
        'medium-app': 2.0,
        'complex-app': 3.0,
        'collaboration': 1.1,
        'export': 1.2,
        'compliance': 1.3,
        'debugging': 1.4,
        'testing': 1.3
      },
      tiers: {
        free: { monthlyTokens: 50000, price: 0 },
        starter: { monthlyTokens: 250000, price: 25 },
        pro: { monthlyTokens: 1000000, price: 100 },
        enterprise: { monthlyTokens: 10000000, price: 1000 }
      }
    };
  }

  // Generate realistic user profiles
  generateUserProfiles(userCount: number): UserProfile[] {
    const users: UserProfile[] = [];
    const tierDistribution = { free: 0.7, starter: 0.2, pro: 0.08, enterprise: 0.02 };
    const usageDistribution = { light: 0.5, moderate: 0.3, heavy: 0.15, power: 0.05 };

    for (let i = 0; i < userCount; i++) {
      // Determine tier based on distribution
      let tier: keyof typeof tierDistribution = 'free';
      const tierRand = Math.random();
      if (tierRand < tierDistribution.free) tier = 'free';
      else if (tierRand < tierDistribution.free + tierDistribution.starter) tier = 'starter';
      else if (tierRand < tierDistribution.free + tierDistribution.starter + tierDistribution.pro) tier = 'pro';
      else tier = 'enterprise';

      // Determine usage pattern
      let usagePattern: keyof typeof usageDistribution = 'light';
      const usageRand = Math.random();
      if (usageRand < usageDistribution.light) usagePattern = 'light';
      else if (usageRand < usageDistribution.light + usageDistribution.moderate) usagePattern = 'moderate';
      else if (usageRand < usageDistribution.light + usageDistribution.moderate + usageDistribution.heavy) usagePattern = 'heavy';
      else usagePattern = 'power';

      // Generate features and agents based on tier and usage pattern
      const features = this.generateFeatures(tier, usagePattern);
      const preferredAgents = this.generatePreferredAgents(tier, usagePattern);

      // Calculate monthly sessions based on usage pattern
      let monthlySessions = 0;
      switch (usagePattern) {
        case 'light': monthlySessions = Math.floor(Math.random() * 20) + 5; break;
        case 'moderate': monthlySessions = Math.floor(Math.random() * 50) + 20; break;
        case 'heavy': monthlySessions = Math.floor(Math.random() * 100) + 50; break;
        case 'power': monthlySessions = Math.floor(Math.random() * 200) + 100; break;
      }

      users.push({
        id: `user_${i + 1}`,
        tier,
        usagePattern,
        features,
        preferredAgents,
        monthlySessions
      });
    }

    return users;
  }

  private generateFeatures(tier: string, usagePattern: string): string[] {
    const baseFeatures = ['small-function'];
    const featureOptions = [
      'ui-component', 'small-app', 'medium-app', 'complex-app',
      'collaboration', 'export', 'compliance', 'debugging', 'testing'
    ];

    // Higher tiers get more advanced features
    let featureCount = 2;
    if (tier === 'starter') featureCount = 3;
    if (tier === 'pro') featureCount = 5;
    if (tier === 'enterprise') featureCount = 7;

    // Power users use more features
    if (usagePattern === 'power') featureCount += 2;
    if (usagePattern === 'heavy') featureCount += 1;

    const selectedFeatures = [...baseFeatures];
    const availableFeatures = [...featureOptions];

    for (let i = 0; i < featureCount - 1 && availableFeatures.length > 0; i++) {
      const randomIndex = Math.floor(Math.random() * availableFeatures.length);
      selectedFeatures.push(availableFeatures.splice(randomIndex, 1)[0]);
    }

    return selectedFeatures;
  }

  private generatePreferredAgents(tier: string, usagePattern: string): Array<'GPT5' | 'Claude' | 'Gemini' | 'StarCoder'> {
    const agents: Array<'GPT5' | 'Claude' | 'Gemini' | 'StarCoder'> = [];

    // Base agents - everyone uses these
    if (Math.random() > 0.3) agents.push('Claude'); // Most popular
    if (Math.random() > 0.5) agents.push('Gemini'); // Good balance

    // Higher tiers use more advanced agents
    if (tier === 'pro' || tier === 'enterprise') {
      if (Math.random() > 0.4) agents.push('GPT5');
    }

    // Power users use StarCoder for code
    if (usagePattern === 'power' || usagePattern === 'heavy') {
      if (Math.random() > 0.3) agents.push('StarCoder');
    }

    // Ensure at least one agent
    if (agents.length === 0) {
      agents.push(Math.random() > 0.5 ? 'Claude' : 'Gemini');
    }

    return agents;
  }

  // Simulate token usage for a single user
  simulateUserUsage(user: UserProfile): UsageResult {
    let totalTokens = 0;
    let totalCost = 0;
    const agentBreakdown: Record<string, number> = {};
    const featureBreakdown: Record<string, number> = {};

    for (let session = 0; session < user.monthlySessions; session++) {
      // Select random feature and agent for this session
      const feature = user.features[Math.floor(Math.random() * user.features.length)];
      const agent = user.preferredAgents[Math.floor(Math.random() * user.preferredAgents.length)];

      // Determine complexity based on feature and usage pattern
      let complexity: 'low' | 'medium' | 'high' = 'low';
      const complexityRand = Math.random();

      if (feature.includes('complex') || user.usagePattern === 'power') {
        complexity = complexityRand > 0.3 ? 'high' : 'medium';
      } else if (feature.includes('medium') || user.usagePattern === 'heavy') {
        complexity = complexityRand > 0.6 ? 'medium' : 'low';
      } else {
        complexity = complexityRand > 0.8 ? 'medium' : 'low';
      }

      // Calculate base token cost
      const baseTokens = this.config.costs[agent][complexity];

      // Apply feature multiplier
      const featureMultiplier = this.config.featureMultipliers[feature] || 1.0;
      const sessionTokens = Math.round(baseTokens * featureMultiplier);

      // Add orchestration overhead (7.5%)
      const finalTokens = Math.round(sessionTokens * 1.075);

      totalTokens += finalTokens;

      // Track breakdowns
      agentBreakdown[agent] = (agentBreakdown[agent] || 0) + finalTokens;
      featureBreakdown[feature] = (featureBreakdown[feature] || 0) + finalTokens;

      // Calculate cost ($0.002 per token)
      const sessionCost = finalTokens * 0.002;
      totalCost += sessionCost;
    }

    const tierLimit = this.config.tiers[user.tier].monthlyTokens;
    const exceededBudget = totalTokens > tierLimit;

    return {
      userId: user.id,
      tier: user.tier,
      totalTokens,
      totalCost,
      sessions: user.monthlySessions,
      avgTokensPerSession: Math.round(totalTokens / user.monthlySessions),
      agentBreakdown,
      featureBreakdown,
      exceededBudget
    };
  }

  // Run simulation for multiple users
  runSimulation(userCounts: number[]): { [key: number]: UsageResult[] } {
    const results: { [key: number]: UsageResult[] } = {};

    for (const userCount of userCounts) {
      console.log(`\n🚀 Simulating ${userCount} users...`);

      const users = this.generateUserProfiles(userCount);
      const usageResults: UsageResult[] = [];

      for (const user of users) {
        const result = this.simulateUserUsage(user);
        usageResults.push(result);

        if (usageResults.length % Math.max(1, Math.floor(userCount / 10)) === 0) {
          process.stdout.write('.');
        }
      }

      results[userCount] = usageResults;
      console.log(` Done!`);
    }

    return results;
  }

  // Analyze simulation results
  analyzeResults(results: { [key: number]: UsageResult[] }): void {
    console.log('\n📊 SIMULATION RESULTS ANALYSIS');
    console.log('=' .repeat(50));

    for (const [userCount, userResults] of Object.entries(results)) {
      const count = parseInt(userCount);
      console.log(`\n👥 ${count.toLocaleString()} Users:`);

      // Tier distribution
      const tierCounts = userResults.reduce((acc, result) => {
        acc[result.tier] = (acc[result.tier] || 0) + 1;
        return acc;
      }, {} as Record<string, number>);

      console.log('  Tier Distribution:');
      Object.entries(tierCounts).forEach(([tier, count]) => {
        const percentage = ((count / userResults.length) * 100).toFixed(1);
        console.log(`    ${tier}: ${count} users (${percentage}%)`);
      });

      // Token usage statistics
      const totalTokens = userResults.reduce((sum, result) => sum + result.totalTokens, 0);
      const avgTokensPerUser = Math.round(totalTokens / userResults.length);
      const totalCost = userResults.reduce((sum, result) => sum + result.totalCost, 0);

      console.log(`  Total Token Usage: ${totalTokens.toLocaleString()} tokens`);
      console.log(`  Average per User: ${avgTokensPerUser.toLocaleString()} tokens`);
      console.log(`  Total Cost: $${totalCost.toFixed(2)}`);

      // Budget exceedance analysis
      const exceededCount = userResults.filter(result => result.exceededBudget).length;
      const exceedanceRate = ((exceededCount / userResults.length) * 100).toFixed(1);
      console.log(`  Users Exceeding Budget: ${exceededCount} (${exceedanceRate}%)`);

      // Agent usage breakdown
      const agentTotals = userResults.reduce((acc, result) => {
        Object.entries(result.agentBreakdown).forEach(([agent, tokens]) => {
          acc[agent] = (acc[agent] || 0) + tokens;
        });
        return acc;
      }, {} as Record<string, number>);

      console.log('  Agent Usage Breakdown:');
      Object.entries(agentTotals)
        .sort(([,a], [,b]) => b - a)
        .forEach(([agent, tokens]) => {
          const percentage = ((tokens / totalTokens) * 100).toFixed(1);
          console.log(`    ${agent}: ${tokens.toLocaleString()} tokens (${percentage}%)`);
        });

      // Top features
      const featureTotals = userResults.reduce((acc, result) => {
        Object.entries(result.featureBreakdown).forEach(([feature, tokens]) => {
          acc[feature] = (acc[feature] || 0) + tokens;
        });
        return acc;
      }, {} as Record<string, number>);

      console.log('  Top Features:');
      Object.entries(featureTotals)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 5)
        .forEach(([feature, tokens]) => {
          const percentage = ((tokens / totalTokens) * 100).toFixed(1);
          console.log(`    ${feature}: ${tokens.toLocaleString()} tokens (${percentage}%)`);
        });

      // Sustainability analysis
      const totalRevenue = userResults.reduce((sum, result) => {
        return sum + this.config.tiers[result.tier as keyof typeof this.config.tiers].price;
      }, 0);

      const costPerUser = totalCost / userResults.length;
      const revenuePerUser = totalRevenue / userResults.length;
      const margin = ((revenuePerUser - costPerUser) / revenuePerUser * 100);

      console.log('  💰 Economics:');
      console.log(`    Revenue per User: $${revenuePerUser.toFixed(2)}`);
      console.log(`    Cost per User: $${costPerUser.toFixed(2)}`);
      console.log(`    Margin: ${margin.toFixed(1)}%`);

      if (margin < 20) {
        console.log('    ⚠️  WARNING: Low margins detected!');
      } else if (margin > 50) {
        console.log('    ✅ Excellent margins!');
      }
    }
  }

  // Generate recommendations based on simulation
  generateRecommendations(results: { [key: number]: UsageResult[] }): void {
    console.log('\n🎯 RECOMMENDATIONS');
    console.log('=' .repeat(50));

    const largestSimulation = Math.max(...Object.keys(results).map(Number));
    const userResults = results[largestSimulation];

    // Analyze token pool adequacy
    const tierAnalysis = ['free', 'starter', 'pro', 'enterprise'].map(tier => {
      const tierUsers = userResults.filter(result => result.tier === tier);
      if (tierUsers.length === 0) return null;

      const avgTokens = tierUsers.reduce((sum, result) => sum + result.totalTokens, 0) / tierUsers.length;
      const maxTokens = Math.max(...tierUsers.map(result => result.totalTokens));
      const tierLimit = this.config.tiers[tier as keyof typeof this.config.tiers].monthlyTokens;
      const utilizationRate = (avgTokens / tierLimit) * 100;

      return { tier, avgTokens, maxTokens, utilizationRate, adequacy: utilizationRate < 80 };
    }).filter(Boolean);

    console.log('\n📋 Token Pool Adequacy:');
    tierAnalysis.forEach(analysis => {
      if (analysis) {
        const status = analysis.adequacy ? '✅ Adequate' : '⚠️  Needs adjustment';
        console.log(`  ${analysis.tier}: ${analysis.utilizationRate.toFixed(1)}% utilization ${status}`);
      }
    });

    // Cost optimization recommendations
    const agentCosts = Object.entries(this.config.costs);
    const highCostAgents = agentCosts.filter(([, costs]) => costs.high > 50);

    if (highCostAgents.length > 0) {
      console.log('\n💡 Cost Optimization Suggestions:');
      highCostAgents.forEach(([agent, costs]) => {
        console.log(`  ${agent}: Consider reducing high-complexity cost from ${costs.high} to ${Math.round(costs.high * 0.8)} tokens`);
      });
    }

    // Revenue optimization
    const lowMarginTiers = tierAnalysis.filter(analysis => {
      if (!analysis) return false;
      const tierRevenue = this.config.tiers[analysis.tier as keyof typeof this.config.tiers].price;
      const tierCost = analysis.avgTokens * 0.002;
      const margin = ((tierRevenue - tierCost) / tierRevenue) * 100;
      return margin < 30;
    });

    if (lowMarginTiers.length > 0) {
      console.log('\n💰 Revenue Optimization:');
      lowMarginTiers.forEach(analysis => {
        if (analysis) {
          console.log(`  ${analysis.tier}: Consider price increase or token pool reduction`);
        }
      });
    }
  }
}

// Main simulation execution
async function main() {
  console.log('🎰 TOKEN ECONOMY SIMULATION');
  console.log('=' .repeat(60));
  console.log('Simulating realistic usage patterns for token-based AI platform');
  console.log('Analyzing sustainability across 10-10,000 users');

  const simulator = new TokenEconomySimulator();

  // Test different user scales
  const userCounts = [10, 50, 100, 500, 1000, 5000, 10000];

  console.log(`\n🔬 Running simulations for: ${userCounts.map(count => count.toLocaleString()).join(', ')} users`);

  const results = simulator.runSimulation(userCounts);

  // Analyze results
  simulator.analyzeResults(results);

  // Generate recommendations
  simulator.generateRecommendations(results);

  console.log('\n✨ Simulation complete!');
  console.log('Check recommendations above for token economy optimizations.');
}

// Run simulation if this file is executed directly
if (require.main === module) {
  main().catch(console.error);
}

export type { TokenEconomySimulator, UserProfile, UsageResult, SimulationConfig };

/**
 * TCI Access Control Middleware
 *
 * Enforces tier-based access to TCI analysis features:
 * - Free: Quick analysis only, 10/day limit
 * - Starter: Quick analysis unlimited, 100/day limit
 * - Pro: Full analysis unlimited
 * - Enterprise: Full analysis unlimited + priority processing
 *
 * Also tracks usage for billing and analytics.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { UserTier } from '../lib/auth';

const prisma = new PrismaClient();

export interface UserTierLimits {
  tier: UserTier;
  allowFullAnalysis: boolean;
  allowQuickAnalysis: boolean;
  dailyQuickLimit: number;
  dailyFullLimit: number;
  priorityProcessing: boolean;
}

// Tier limits configuration
const TIER_LIMITS: Record<UserTier, UserTierLimits> = {
  free: {
    tier: 'free',
    allowFullAnalysis: false,
    allowQuickAnalysis: true,
    dailyQuickLimit: 10,
    dailyFullLimit: 0,
    priorityProcessing: false,
  },
  starter: {
    tier: 'starter',
    allowFullAnalysis: false,
    allowQuickAnalysis: true,
    dailyQuickLimit: 100,
    dailyFullLimit: 0,
    priorityProcessing: false,
  },
  pro: {
    tier: 'pro',
    allowFullAnalysis: true,
    allowQuickAnalysis: true,
    dailyQuickLimit: Infinity,
    dailyFullLimit: Infinity,
    priorityProcessing: false,
  },
  enterprise: {
    tier: 'enterprise',
    allowFullAnalysis: true,
    allowQuickAnalysis: true,
    dailyQuickLimit: Infinity,
    dailyFullLimit: Infinity,
    priorityProcessing: true,
  },
};

/**
 * Check user's daily usage
 */
async function checkDailyUsage(
  userId: string,
  userTier: UserTier,
  analysisType: 'quick' | 'full'
): Promise<{ count: number; isWithinLimit: boolean; limit: number }> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const count = await prisma.tCIAnalysis.count({
    where: {
      userId,
      analysisType,
      createdAt: {
        gte: today,
      },
    },
  });

  const limits = TIER_LIMITS[userTier];
  const limit = analysisType === 'quick' ? limits.dailyQuickLimit : limits.dailyFullLimit;

  return {
    count,
    isWithinLimit: count < limit,
    limit,
  };
}

/**
 * Middleware to check TCI access for full analysis
 */
export async function requireFullAnalysisAccess(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.user) {
    return reply.code(401).send({ error: 'Unauthorized', message: 'Authentication required' });
  }

  const { id: userId, tier: userTier } = request.user;
  const limits = TIER_LIMITS[userTier];

  // Check if tier allows full analysis
  if (!limits.allowFullAnalysis) {
    reply.code(403).send({
      error: 'Full analysis not available on your plan',
      currentTier: userTier,
      upgradeUrl: '/billing/upgrade',
      message: `Full 6-layer analysis requires Pro or Enterprise tier. You are currently on ${userTier}.`,
      recommendation: 'Upgrade to Pro for unlimited full analysis with 93-95% accuracy and automatic fix implementation.',
      quickAnalysisAvailable: limits.allowQuickAnalysis,
    });
    return;
  }

  // Check daily limit
  const usage = await checkDailyUsage(userId, userTier, 'full');
  if (!usage.isWithinLimit) {
    reply.code(429).send({
      error: 'Daily limit exceeded',
      currentTier: userTier,
      dailyLimit: usage.limit,
      usedToday: usage.count,
      upgradeUrl: '/billing/upgrade',
      message: `You've reached your daily limit of ${usage.limit} full analyses. Upgrade to Pro for unlimited access.`,
    });
    return;
  }

  // Add tier info to request for downstream use
  (request as any).priorityProcessing = limits.priorityProcessing;
}

/**
 * Middleware to check TCI access for quick analysis
 */
export async function requireQuickAnalysisAccess(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  if (!request.user) {
    return reply.code(401).send({ error: 'Unauthorized', message: 'Authentication required' });
  }

  const { id: userId, tier: userTier } = request.user;
  const limits = TIER_LIMITS[userTier];

  // Check if tier allows quick analysis
  if (!limits.allowQuickAnalysis) {
    reply.code(403).send({
      error: 'Quick analysis not available on your plan',
      currentTier: userTier,
      upgradeUrl: '/billing/upgrade',
      message: `Quick analysis is not available on ${userTier} tier.`,
    });
    return;
  }

  // Check daily limit
  const usage = await checkDailyUsage(userId, userTier, 'quick');
  if (!usage.isWithinLimit) {
    reply.code(429).send({
      error: 'Daily limit exceeded',
      currentTier: userTier,
      dailyLimit: usage.limit,
      usedToday: usage.count,
      upgradeUrl: '/billing/upgrade',
      message: `You've reached your daily limit of ${usage.limit} quick analyses. Upgrade to Starter or Pro for more.`,
      upgradeOptions: {
        starter: {
          tier: 'starter',
          dailyLimit: TIER_LIMITS.starter.dailyQuickLimit,
          price: '$9/month',
        },
        pro: {
          tier: 'pro',
          dailyLimit: 'Unlimited',
          price: '$29/month',
          features: ['Full 6-layer analysis', 'Automatic fix implementation', 'Priority support'],
        },
      },
    });
    return;
  }
  
  (request as any).priorityProcessing = limits.priorityProcessing;
}

/**
 * Get usage statistics for a user
 */
export async function getUserUsageStats(userId: string, userTier: UserTier): Promise<{
  tier: UserTier;
  today: {
    quickAnalyses: number;
    fullAnalyses: number;
    quickLimit: number;
    fullLimit: number;
  };
  thisMonth: {
    quickAnalyses: number;
    fullAnalyses: number;
    totalCost: number;
  };
  allTime: {
    totalAnalyses: number;
    totalCost: number;
  };
}> {
  const limits = TIER_LIMITS[userTier];

  // Today's usage
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const todayQuick = await prisma.tCIAnalysis.count({
    where: {
      userId,
      analysisType: 'quick',
      createdAt: { gte: today },
    },
  });

  const todayFull = await prisma.tCIAnalysis.count({
    where: {
      userId,
      analysisType: 'full',
      createdAt: { gte: today },
    },
  });

  // This month's usage
  const monthStart = new Date();
  monthStart.setDate(1);
  monthStart.setHours(0, 0, 0, 0);

  const monthStats = await prisma.tCIAnalysis.aggregate({
    where: {
      userId,
      createdAt: { gte: monthStart },
    },
    _count: { id: true },
    _sum: { costUSD: true },
  });

  const monthQuick = await prisma.tCIAnalysis.count({
    where: {
      userId,
      analysisType: 'quick',
      createdAt: { gte: monthStart },
    },
  });

  const monthFull = await prisma.tCIAnalysis.count({
    where: {
      userId,
      analysisType: 'full',
      createdAt: { gte: monthStart },
    },
  });

  // All-time usage
  const allTimeStats = await prisma.tCIAnalysis.aggregate({
    where: {
      userId,
    },
    _count: { id: true },
    _sum: { costUSD: true },
  });

  return {
    tier: userTier,
    today: {
      quickAnalyses: todayQuick,
      fullAnalyses: todayFull,
      quickLimit: limits.dailyQuickLimit,
      fullLimit: limits.dailyFullLimit,
    },
    thisMonth: {
      quickAnalyses: monthQuick,
      fullAnalyses: monthFull,
      totalCost: monthStats._sum.costUSD || 0,
    },
    allTime: {
      totalAnalyses: allTimeStats._count.id,
      totalCost: allTimeStats._sum.costUSD || 0,
    },
  };
}

/**
 * Helper to check if user can access a specific analysis type
 */
export function canAccessAnalysisType(tier: UserTier, analysisType: 'quick' | 'full'): boolean {
  const limits = TIER_LIMITS[tier];
  return analysisType === 'quick' ? limits.allowQuickAnalysis : limits.allowFullAnalysis;
}

/**
 * Get tier limits for a specific tier
 */
export function getTierLimits(tier: UserTier): UserTierLimits {
  return TIER_LIMITS[tier];
}

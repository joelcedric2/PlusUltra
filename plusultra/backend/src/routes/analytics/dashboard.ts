/// <reference path="../../types/fastify.d.ts" />
/**
 * Analytics Dashboard Routes
 *
 * API routes for analytics dashboard, traffic breakdown,
 * page-level analytics, and real-time visitor data.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AnalyticsTrackingService } from '../../services/analytics/AnalyticsTrackingService';
import { Redis } from 'ioredis';

// ============================================================================
// Request Schemas
// ============================================================================

const DateRangeSchema = z.object({
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  period: z.enum(['today', '7d', '30d', '90d', '12m', 'custom']).optional().default('30d'),
});

const ProjectIdParamSchema = z.object({
  projectId: z.string().min(1),
});

const PaginationSchema = z.object({
  page: z.coerce.number().int().positive().optional().default(1),
  limit: z.coerce.number().int().positive().max(100).optional().default(20),
});

const FilterSchema = z.object({
  country: z.string().optional(),
  device: z.enum(['desktop', 'mobile', 'tablet']).optional(),
  browser: z.string().optional(),
  source: z.string().optional(),
  medium: z.string().optional(),
  campaign: z.string().optional(),
});

// ============================================================================
// Route Handler
// ============================================================================

export async function analyticsDashboardRoutes(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const redis: Redis = fastify.redis as unknown as Redis;

  // Initialize tracking service
  const trackingService = new AnalyticsTrackingService(redis, prisma);

  // ============================================================================
  // Get Dashboard Data
  // GET /api/v1/analytics/dashboard/:projectId
  // ============================================================================

  fastify.get('/api/v1/analytics/dashboard/:projectId', {
    schema: {
      description: 'Get complete analytics dashboard data for a project',
      tags: ['Analytics Dashboard'],
      params: ProjectIdParamSchema,
      querystring: DateRangeSchema.merge(FilterSchema),
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { projectId } = ProjectIdParamSchema.parse(request.params);
      const query = DateRangeSchema.merge(FilterSchema).parse(request.query);
      const { startDate, endDate } = getDateRange(query.period, query.startDate, query.endDate);

      const metrics = await trackingService.getDashboardMetrics(
        projectId,
        startDate,
        endDate
      );

      // Calculate comparison with previous period
      const periodDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const previousStartDate = new Date(startDate.getTime() - periodDays * 24 * 60 * 60 * 1000);
      const previousEndDate = new Date(startDate.getTime() - 1);

      const previousMetrics = await trackingService.getDashboardMetrics(
        projectId,
        previousStartDate,
        previousEndDate
      );

      // Calculate percentage changes
      const changes = calculateChanges(metrics.overview, previousMetrics.overview);

      return reply.send({
        success: true,
        data: {
          ...metrics,
          comparison: {
            period: query.period,
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
            previousStartDate: previousStartDate.toISOString(),
            previousEndDate: previousEndDate.toISOString(),
            changes,
          },
        },
      });
    } catch (error) {
      console.error('Dashboard error:', error);
      return reply.status(500).send({ error: 'Failed to get dashboard data' });
    }
  });

  // ============================================================================
  // Get Traffic Source Breakdown
  // GET /api/v1/analytics/traffic/:projectId
  // ============================================================================

  fastify.get('/api/v1/analytics/traffic/:projectId', {
    schema: {
      description: 'Get traffic source breakdown for a project',
      tags: ['Analytics Dashboard'],
      params: ProjectIdParamSchema,
      querystring: DateRangeSchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { projectId } = ProjectIdParamSchema.parse(request.params);
      const query = DateRangeSchema.parse(request.query);
      const { startDate, endDate } = getDateRange(query.period, query.startDate, query.endDate);

      const traffic = await trackingService.getTrafficBreakdown(
        projectId,
        startDate,
        endDate
      );

      // Get traffic trends over time
      const trends = await getTrafficTrends(prisma, projectId, startDate, endDate);

      return reply.send({
        success: true,
        data: {
          ...traffic,
          trends,
          period: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          },
        },
      });
    } catch (error) {
      console.error('Traffic breakdown error:', error);
      return reply.status(500).send({ error: 'Failed to get traffic data' });
    }
  });

  // ============================================================================
  // Get Page-Level Analytics
  // GET /api/v1/analytics/pages/:projectId
  // ============================================================================

  fastify.get('/api/v1/analytics/pages/:projectId', {
    schema: {
      description: 'Get page-level analytics for a project',
      tags: ['Analytics Dashboard'],
      params: ProjectIdParamSchema,
      querystring: DateRangeSchema.merge(PaginationSchema).merge(z.object({
        sortBy: z.enum(['views', 'uniqueViews', 'avgTime', 'bounceRate']).optional().default('views'),
        sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
        path: z.string().optional(), // Filter by URL path prefix
      })),
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { projectId } = ProjectIdParamSchema.parse(request.params);
      const query = DateRangeSchema.merge(PaginationSchema).merge(z.object({
        sortBy: z.enum(['views', 'uniqueViews', 'avgTime', 'bounceRate']).optional().default('views'),
        sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
        path: z.string().optional(),
      })).parse(request.query);
      const { startDate, endDate } = getDateRange(query.period, query.startDate, query.endDate);

      const pages = await trackingService.getPageAnalytics(
        projectId,
        startDate,
        endDate
      );

      // Apply pagination and sorting
      let sortedPages = [...pages.topPages];

      // Filter by path if provided
      if (query.path) {
        sortedPages = sortedPages.filter(p => p.url.startsWith(query.path!));
      }

      // Sort
      sortedPages.sort((a, b) => {
        const aVal = a[query.sortBy as keyof typeof a] as number;
        const bVal = b[query.sortBy as keyof typeof b] as number;
        return query.sortOrder === 'desc' ? bVal - aVal : aVal - bVal;
      });

      // Paginate
      const start = (query.page - 1) * query.limit;
      const paginatedPages = sortedPages.slice(start, start + query.limit);

      return reply.send({
        success: true,
        data: {
          pages: paginatedPages,
          entryPages: pages.entryPages,
          exitPages: pages.exitPages,
          pagination: {
            page: query.page,
            limit: query.limit,
            total: sortedPages.length,
            totalPages: Math.ceil(sortedPages.length / query.limit),
          },
          period: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          },
        },
      });
    } catch (error) {
      console.error('Page analytics error:', error);
      return reply.status(500).send({ error: 'Failed to get page analytics' });
    }
  });

  // ============================================================================
  // Get Real-Time Visitor Data
  // GET /api/v1/analytics/realtime/:projectId
  // ============================================================================

  fastify.get('/api/v1/analytics/realtime/:projectId', {
    schema: {
      description: 'Get real-time visitor data for a project',
      tags: ['Analytics Dashboard'],
      params: ProjectIdParamSchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { projectId } = ProjectIdParamSchema.parse(request.params);

      const realtimeData = await trackingService.getRealtimeData(projectId);

      return reply.send({
        success: true,
        data: realtimeData,
        timestamp: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Realtime data error:', error);
      return reply.status(500).send({ error: 'Failed to get realtime data' });
    }
  });

  // ============================================================================
  // Get Device & Technology Breakdown
  // GET /api/v1/analytics/devices/:projectId
  // ============================================================================

  fastify.get('/api/v1/analytics/devices/:projectId', {
    schema: {
      description: 'Get device and technology breakdown for a project',
      tags: ['Analytics Dashboard'],
      params: ProjectIdParamSchema,
      querystring: DateRangeSchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { projectId } = ProjectIdParamSchema.parse(request.params);
      const query = DateRangeSchema.parse(request.query);
      const { startDate, endDate } = getDateRange(query.period, query.startDate, query.endDate);

      const metrics = await trackingService.getDashboardMetrics(
        projectId,
        startDate,
        endDate
      );

      return reply.send({
        success: true,
        data: {
          devices: metrics.devices,
          period: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          },
        },
      });
    } catch (error) {
      console.error('Device breakdown error:', error);
      return reply.status(500).send({ error: 'Failed to get device data' });
    }
  });

  // ============================================================================
  // Get Geographic Data
  // GET /api/v1/analytics/geography/:projectId
  // ============================================================================

  fastify.get('/api/v1/analytics/geography/:projectId', {
    schema: {
      description: 'Get geographic visitor data for a project',
      tags: ['Analytics Dashboard'],
      params: ProjectIdParamSchema,
      querystring: DateRangeSchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { projectId } = ProjectIdParamSchema.parse(request.params);
      const query = DateRangeSchema.parse(request.query);
      const { startDate, endDate } = getDateRange(query.period, query.startDate, query.endDate);

      const metrics = await trackingService.getDashboardMetrics(
        projectId,
        startDate,
        endDate
      );

      return reply.send({
        success: true,
        data: {
          geography: metrics.geography,
          period: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          },
        },
      });
    } catch (error) {
      console.error('Geography breakdown error:', error);
      return reply.status(500).send({ error: 'Failed to get geography data' });
    }
  });

  // ============================================================================
  // Get User Flow / Journey Data
  // GET /api/v1/analytics/flow/:projectId
  // ============================================================================

  fastify.get('/api/v1/analytics/flow/:projectId', {
    schema: {
      description: 'Get user flow and journey data for a project',
      tags: ['Analytics Dashboard'],
      params: ProjectIdParamSchema,
      querystring: DateRangeSchema.merge(z.object({
        startPage: z.string().optional(),
        depth: z.coerce.number().int().min(1).max(10).optional().default(5),
      })),
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { projectId } = ProjectIdParamSchema.parse(request.params);
      const query = DateRangeSchema.merge(z.object({
        startPage: z.string().optional(),
        depth: z.coerce.number().int().min(1).max(10).optional().default(5),
      })).parse(request.query);
      const { startDate, endDate } = getDateRange(query.period, query.startDate, query.endDate);

      // Get user flow data from database
      const flowData = await getUserFlowData(
        prisma,
        projectId,
        startDate,
        endDate,
        query.startPage,
        query.depth
      );

      return reply.send({
        success: true,
        data: flowData,
        period: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      });
    } catch (error) {
      console.error('User flow error:', error);
      return reply.status(500).send({ error: 'Failed to get user flow data' });
    }
  });

  // ============================================================================
  // Get Engagement Metrics
  // GET /api/v1/analytics/engagement/:projectId
  // ============================================================================

  fastify.get('/api/v1/analytics/engagement/:projectId', {
    schema: {
      description: 'Get engagement metrics for a project',
      tags: ['Analytics Dashboard'],
      params: ProjectIdParamSchema,
      querystring: DateRangeSchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { projectId } = ProjectIdParamSchema.parse(request.params);
      const query = DateRangeSchema.parse(request.query);
      const { startDate, endDate } = getDateRange(query.period, query.startDate, query.endDate);

      const metrics = await trackingService.getDashboardMetrics(
        projectId,
        startDate,
        endDate
      );

      // Get engagement trends over time
      const engagementTrends = await getEngagementTrends(prisma, projectId, startDate, endDate);

      return reply.send({
        success: true,
        data: {
          engagement: metrics.engagement,
          overview: {
            bounceRate: metrics.overview.bounceRate,
            avgSessionDuration: metrics.overview.avgSessionDuration,
            pagesPerSession: metrics.overview.pagesPerSession,
            engagementRate: metrics.overview.engagementRate,
          },
          trends: engagementTrends,
          period: {
            startDate: startDate.toISOString(),
            endDate: endDate.toISOString(),
          },
        },
      });
    } catch (error) {
      console.error('Engagement metrics error:', error);
      return reply.status(500).send({ error: 'Failed to get engagement data' });
    }
  });

  // ============================================================================
  // Get Campaign Performance
  // GET /api/v1/analytics/campaigns/:projectId
  // ============================================================================

  fastify.get('/api/v1/analytics/campaigns/:projectId', {
    schema: {
      description: 'Get campaign performance data for a project',
      tags: ['Analytics Dashboard'],
      params: ProjectIdParamSchema,
      querystring: DateRangeSchema.merge(PaginationSchema),
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { projectId } = ProjectIdParamSchema.parse(request.params);
      const query = DateRangeSchema.merge(PaginationSchema).parse(request.query);
      const { startDate, endDate } = getDateRange(query.period, query.startDate, query.endDate);

      const campaigns = await getCampaignPerformance(
        prisma,
        projectId,
        startDate,
        endDate,
        query.page,
        query.limit
      );

      return reply.send({
        success: true,
        data: campaigns,
        period: {
          startDate: startDate.toISOString(),
          endDate: endDate.toISOString(),
        },
      });
    } catch (error) {
      console.error('Campaign performance error:', error);
      return reply.status(500).send({ error: 'Failed to get campaign data' });
    }
  });

  // ============================================================================
  // Export Analytics Data
  // GET /api/v1/analytics/export/:projectId
  // ============================================================================

  fastify.get('/api/v1/analytics/export/:projectId', {
    schema: {
      description: 'Export analytics data as CSV or JSON',
      tags: ['Analytics Dashboard'],
      params: ProjectIdParamSchema,
      querystring: DateRangeSchema.merge(z.object({
        format: z.enum(['csv', 'json']).optional().default('json'),
        type: z.enum(['sessions', 'pageviews', 'events']).optional().default('sessions'),
      })),
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { projectId } = ProjectIdParamSchema.parse(request.params);
      const query = DateRangeSchema.merge(z.object({
        format: z.enum(['csv', 'json']).optional().default('json'),
        type: z.enum(['sessions', 'pageviews', 'events']).optional().default('sessions'),
      })).parse(request.query);
      const { startDate, endDate } = getDateRange(query.period, query.startDate, query.endDate);

      const data = await exportAnalyticsData(
        prisma,
        projectId,
        startDate,
        endDate,
        query.type
      );

      if (query.format === 'csv') {
        const csv = convertToCSV(data);
        return reply
          .header('Content-Type', 'text/csv')
          .header('Content-Disposition', `attachment; filename=analytics-${query.type}-${projectId}.csv`)
          .send(csv);
      }

      return reply.send({
        success: true,
        data,
        exportedAt: new Date().toISOString(),
      });
    } catch (error) {
      console.error('Export error:', error);
      return reply.status(500).send({ error: 'Failed to export data' });
    }
  });

  // ============================================================================
  // Get Analytics Summary (for widgets/cards)
  // GET /api/v1/analytics/summary/:projectId
  // ============================================================================

  fastify.get('/api/v1/analytics/summary/:projectId', {
    schema: {
      description: 'Get analytics summary for dashboard widgets',
      tags: ['Analytics Dashboard'],
      params: ProjectIdParamSchema,
      querystring: DateRangeSchema,
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { projectId } = ProjectIdParamSchema.parse(request.params);
      const query = DateRangeSchema.parse(request.query);
      const { startDate, endDate } = getDateRange(query.period, query.startDate, query.endDate);

      const [metrics, realtimeData] = await Promise.all([
        trackingService.getDashboardMetrics(projectId, startDate, endDate),
        trackingService.getRealtimeData(projectId),
      ]);

      // Calculate comparison with previous period
      const periodDays = Math.ceil((endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24));
      const previousStartDate = new Date(startDate.getTime() - periodDays * 24 * 60 * 60 * 1000);
      const previousEndDate = new Date(startDate.getTime() - 1);

      const previousMetrics = await trackingService.getDashboardMetrics(
        projectId,
        previousStartDate,
        previousEndDate
      );

      const changes = calculateChanges(metrics.overview, previousMetrics.overview);

      return reply.send({
        success: true,
        data: {
          current: metrics.overview,
          changes,
          realtime: {
            activeVisitors: realtimeData.activeVisitors,
            visitorsLast30Min: realtimeData.visitorsLast30Min,
          },
          topTrafficSource: metrics.traffic.sources[0] || null,
          topPage: metrics.pages.topPages[0] || null,
          topCountry: metrics.geography.countries[0] || null,
        },
      });
    } catch (error) {
      console.error('Summary error:', error);
      return reply.status(500).send({ error: 'Failed to get summary data' });
    }
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

function getDateRange(
  period: string = '30d',
  startDateStr?: string,
  endDateStr?: string
): { startDate: Date; endDate: Date } {
  const endDate = endDateStr ? new Date(endDateStr + 'T23:59:59.999Z') : new Date();

  let startDate: Date;

  if (period === 'custom' && startDateStr) {
    startDate = new Date(startDateStr + 'T00:00:00.000Z');
  } else {
    switch (period) {
      case 'today':
        startDate = new Date();
        startDate.setHours(0, 0, 0, 0);
        break;
      case '7d':
        startDate = new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '90d':
        startDate = new Date(endDate.getTime() - 90 * 24 * 60 * 60 * 1000);
        break;
      case '12m':
        startDate = new Date(endDate.getTime() - 365 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
      default:
        startDate = new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000);
    }
  }

  return { startDate, endDate };
}

function calculateChanges(
  current: Record<string, number>,
  previous: Record<string, number>
): Record<string, { value: number; percentage: number; direction: 'up' | 'down' | 'neutral' }> {
  const changes: Record<string, { value: number; percentage: number; direction: 'up' | 'down' | 'neutral' }> = {};

  for (const key of Object.keys(current)) {
    const currentValue = current[key] || 0;
    const previousValue = previous[key] || 0;
    const diff = currentValue - previousValue;
    const percentage = previousValue > 0 ? ((diff / previousValue) * 100) : (currentValue > 0 ? 100 : 0);

    changes[key] = {
      value: diff,
      percentage: Math.round(percentage * 100) / 100,
      direction: diff > 0 ? 'up' : diff < 0 ? 'down' : 'neutral',
    };
  }

  return changes;
}

async function getTrafficTrends(
  prisma: any,
  projectId: string,
  startDate: Date,
  endDate: Date
): Promise<Array<{ date: string; direct: number; organic: number; referral: number; social: number; other: number }>> {
  try {
    const result = await prisma.$queryRaw`
      SELECT
        DATE(started_at) as date,
        SUM(CASE WHEN traffic_source = 'direct' THEN 1 ELSE 0 END) as direct,
        SUM(CASE WHEN traffic_medium = 'organic' THEN 1 ELSE 0 END) as organic,
        SUM(CASE WHEN traffic_medium = 'referral' THEN 1 ELSE 0 END) as referral,
        SUM(CASE WHEN traffic_medium = 'social' THEN 1 ELSE 0 END) as social,
        SUM(CASE WHEN traffic_source NOT IN ('direct') AND traffic_medium NOT IN ('organic', 'referral', 'social') THEN 1 ELSE 0 END) as other
      FROM analytics_sessions
      WHERE project_id = ${projectId}
        AND started_at >= ${startDate}
        AND started_at <= ${endDate}
      GROUP BY DATE(started_at)
      ORDER BY date ASC
    `;

    return (result as any[]).map(r => ({
      date: r.date.toISOString().split('T')[0],
      direct: Number(r.direct),
      organic: Number(r.organic),
      referral: Number(r.referral),
      social: Number(r.social),
      other: Number(r.other),
    }));
  } catch {
    return [];
  }
}

async function getEngagementTrends(
  prisma: any,
  projectId: string,
  startDate: Date,
  endDate: Date
): Promise<Array<{ date: string; bounceRate: number; avgDuration: number; pagesPerSession: number }>> {
  try {
    const result = await prisma.$queryRaw`
      SELECT
        DATE(started_at) as date,
        AVG(CASE WHEN is_bounce THEN 1 ELSE 0 END) * 100 as bounce_rate,
        AVG(duration) as avg_duration,
        AVG(page_views) as pages_per_session
      FROM analytics_sessions
      WHERE project_id = ${projectId}
        AND started_at >= ${startDate}
        AND started_at <= ${endDate}
      GROUP BY DATE(started_at)
      ORDER BY date ASC
    `;

    return (result as any[]).map(r => ({
      date: r.date.toISOString().split('T')[0],
      bounceRate: Math.round(Number(r.bounce_rate) * 100) / 100,
      avgDuration: Math.round(Number(r.avg_duration)),
      pagesPerSession: Math.round(Number(r.pages_per_session) * 100) / 100,
    }));
  } catch {
    return [];
  }
}

async function getUserFlowData(
  prisma: any,
  projectId: string,
  startDate: Date,
  endDate: Date,
  startPage?: string,
  depth: number = 5
): Promise<{
  nodes: Array<{ id: string; page: string; visitors: number }>;
  links: Array<{ source: string; target: string; value: number }>;
}> {
  try {
    // This is a simplified version - production would use more sophisticated flow analysis
    const result = await prisma.$queryRaw`
      SELECT
        entry_page,
        exit_page,
        COUNT(*) as flow_count
      FROM analytics_sessions
      WHERE project_id = ${projectId}
        AND started_at >= ${startDate}
        AND started_at <= ${endDate}
        ${startPage ? prisma.$queryRaw`AND entry_page = ${startPage}` : prisma.$queryRaw``}
      GROUP BY entry_page, exit_page
      ORDER BY flow_count DESC
      LIMIT 100
    `;

    const nodes = new Map<string, number>();
    const links: Array<{ source: string; target: string; value: number }> = [];

    for (const row of result as any[]) {
      if (row.entry_page) {
        nodes.set(row.entry_page, (nodes.get(row.entry_page) || 0) + Number(row.flow_count));
      }
      if (row.exit_page) {
        nodes.set(row.exit_page, (nodes.get(row.exit_page) || 0) + Number(row.flow_count));
      }
      if (row.entry_page && row.exit_page && row.entry_page !== row.exit_page) {
        links.push({
          source: row.entry_page,
          target: row.exit_page,
          value: Number(row.flow_count),
        });
      }
    }

    return {
      nodes: Array.from(nodes.entries()).map(([page, visitors]) => ({
        id: page,
        page,
        visitors,
      })),
      links,
    };
  } catch {
    return { nodes: [], links: [] };
  }
}

async function getCampaignPerformance(
  prisma: any,
  projectId: string,
  startDate: Date,
  endDate: Date,
  page: number,
  limit: number
): Promise<{
  campaigns: Array<{
    campaign: string;
    source: string;
    medium: string;
    sessions: number;
    visitors: number;
    bounceRate: number;
    avgDuration: number;
    conversions: number;
  }>;
  pagination: { page: number; limit: number; total: number };
}> {
  try {
    const offset = (page - 1) * limit;

    const [campaigns, countResult] = await Promise.all([
      prisma.$queryRaw`
        SELECT
          traffic_campaign as campaign,
          traffic_source as source,
          traffic_medium as medium,
          COUNT(*) as sessions,
          COUNT(DISTINCT visitor_id) as visitors,
          AVG(CASE WHEN is_bounce THEN 1 ELSE 0 END) * 100 as bounce_rate,
          AVG(duration) as avg_duration,
          COUNT(CASE WHEN is_engaged THEN 1 END) as conversions
        FROM analytics_sessions
        WHERE project_id = ${projectId}
          AND started_at >= ${startDate}
          AND started_at <= ${endDate}
          AND traffic_campaign IS NOT NULL
        GROUP BY traffic_campaign, traffic_source, traffic_medium
        ORDER BY sessions DESC
        LIMIT ${limit} OFFSET ${offset}
      `,
      prisma.$queryRaw`
        SELECT COUNT(DISTINCT traffic_campaign) as total
        FROM analytics_sessions
        WHERE project_id = ${projectId}
          AND started_at >= ${startDate}
          AND started_at <= ${endDate}
          AND traffic_campaign IS NOT NULL
      `,
    ]);

    return {
      campaigns: (campaigns as any[]).map(c => ({
        campaign: c.campaign || 'Unknown',
        source: c.source || 'Unknown',
        medium: c.medium || 'Unknown',
        sessions: Number(c.sessions),
        visitors: Number(c.visitors),
        bounceRate: Math.round(Number(c.bounce_rate) * 100) / 100,
        avgDuration: Math.round(Number(c.avg_duration)),
        conversions: Number(c.conversions),
      })),
      pagination: {
        page,
        limit,
        total: Number((countResult as any[])[0]?.total || 0),
      },
    };
  } catch {
    return { campaigns: [], pagination: { page, limit, total: 0 } };
  }
}

async function exportAnalyticsData(
  prisma: any,
  projectId: string,
  startDate: Date,
  endDate: Date,
  type: 'sessions' | 'pageviews' | 'events'
): Promise<any[]> {
  try {
    switch (type) {
      case 'sessions':
        return prisma.$queryRaw`
          SELECT
            session_id, visitor_id, started_at, ended_at, duration,
            page_views, events, is_bounce, is_engaged,
            entry_page, exit_page, traffic_source, traffic_medium,
            traffic_campaign, device_type, browser, os, country, city
          FROM analytics_sessions
          WHERE project_id = ${projectId}
            AND started_at >= ${startDate}
            AND started_at <= ${endDate}
          ORDER BY started_at DESC
          LIMIT 10000
        `;

      case 'pageviews':
        return prisma.$queryRaw`
          SELECT
            pageview_id, session_id, visitor_id, url, title,
            referrer, timestamp, view_time, scroll_depth
          FROM analytics_pageviews
          WHERE project_id = ${projectId}
            AND timestamp >= ${startDate}
            AND timestamp <= ${endDate}
          ORDER BY timestamp DESC
          LIMIT 10000
        `;

      case 'events':
        return prisma.$queryRaw`
          SELECT
            event_id, session_id, visitor_id, event_type, event_name,
            event_data, url, timestamp
          FROM analytics_events
          WHERE project_id = ${projectId}
            AND timestamp >= ${startDate}
            AND timestamp <= ${endDate}
          ORDER BY timestamp DESC
          LIMIT 10000
        `;

      default:
        return [];
    }
  } catch {
    return [];
  }
}

function convertToCSV(data: any[]): string {
  if (data.length === 0) return '';

  const headers = Object.keys(data[0]);
  const rows = data.map(row =>
    headers.map(header => {
      const value = row[header];
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') return JSON.stringify(value);
      const stringValue = String(value);
      // Escape quotes and wrap in quotes if contains comma, quote, or newline
      if (stringValue.includes(',') || stringValue.includes('"') || stringValue.includes('\n')) {
        return `"${stringValue.replace(/"/g, '""')}"`;
      }
      return stringValue;
    }).join(',')
  );

  return [headers.join(','), ...rows].join('\n');
}

export default analyticsDashboardRoutes;

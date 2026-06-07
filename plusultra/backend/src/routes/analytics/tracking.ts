/// <reference path="../../types/fastify.d.ts" />
/**
 * Analytics Tracking Routes
 *
 * API routes for tracking user activity on deployed apps/websites.
 * Handles events, page views, and session management.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { AnalyticsTrackingService } from '../../services/analytics/AnalyticsTrackingService';
import { Redis } from 'ioredis';

// ============================================================================
// Request Schemas
// ============================================================================

const TrackEventSchema = z.object({
  sessionId: z.string().min(1),
  eventType: z.enum(['pageview', 'click', 'scroll', 'form', 'custom', 'error', 'performance']),
  eventName: z.string().min(1),
  eventData: z.record(z.unknown()).optional().default({}),
  url: z.string().url(),
  timestamp: z.string().datetime().optional(),
});

const PageViewSchema = z.object({
  sessionId: z.string().min(1),
  url: z.string().url(),
  title: z.string().min(1),
  referrer: z.string().optional().default(''),
  timestamp: z.string().datetime().optional(),
});

const SessionStartSchema = z.object({
  projectId: z.string().min(1),
  visitorId: z.string().min(1),
  entryUrl: z.string().url(),
  referrer: z.string().optional().default(''),
  userAgent: z.string().min(1),
  screen: z.object({
    width: z.number().int().positive(),
    height: z.number().int().positive(),
    viewportWidth: z.number().int().positive(),
    viewportHeight: z.number().int().positive(),
    pixelRatio: z.number().positive().optional().default(1),
  }),
  utmParams: z.object({
    source: z.string().optional(),
    medium: z.string().optional(),
    campaign: z.string().optional(),
    content: z.string().optional(),
    term: z.string().optional(),
  }).optional(),
  gclid: z.string().optional(),
  fbclid: z.string().optional(),
  timestamp: z.string().datetime().optional(),
});

const SessionEndSchema = z.object({
  sessionId: z.string().min(1),
  timestamp: z.string().datetime().optional(),
});

const UpdateEngagementSchema = z.object({
  sessionId: z.string().min(1),
  url: z.string().url(),
  viewTime: z.number().int().nonnegative().optional(),
  scrollDepth: z.number().min(0).max(100).optional(),
  interactions: z.number().int().nonnegative().optional(),
  timestamp: z.string().datetime().optional(),
});

const TrackInteractionSchema = z.object({
  sessionId: z.string().min(1),
  pageViewId: z.string().min(1),
  type: z.enum([
    'click', 'form_start', 'form_field', 'form_submit', 'form_abandon',
    'scroll', 'scroll_depth', 'media_play', 'media_pause', 'media_complete',
    'copy', 'print', 'share', 'download', 'error', 'rage_click', 'dead_click', 'custom'
  ]),
  target: z.string().min(1),
  targetText: z.string().optional(),
  targetHref: z.string().optional(),
  positionX: z.number().optional(),
  positionY: z.number().optional(),
  metadata: z.record(z.unknown()).optional(),
  timestamp: z.string().datetime().optional(),
});

const TrackPerformanceSchema = z.object({
  pageViewId: z.string().min(1),
  loadTime: z.number().nonnegative(),
  domContentLoaded: z.number().nonnegative().optional().default(0),
  firstContentfulPaint: z.number().nonnegative().optional().default(0),
  largestContentfulPaint: z.number().nonnegative().optional().default(0),
  firstInputDelay: z.number().nonnegative().optional().default(0),
  cumulativeLayoutShift: z.number().nonnegative().optional().default(0),
  timeToInteractive: z.number().nonnegative().optional().default(0),
  dnsLookup: z.number().nonnegative().optional().default(0),
  tcpConnection: z.number().nonnegative().optional().default(0),
  serverResponse: z.number().nonnegative().optional().default(0),
  domParsing: z.number().nonnegative().optional().default(0),
  resourceLoading: z.number().nonnegative().optional().default(0),
});

const BatchEventsSchema = z.object({
  events: z.array(TrackEventSchema).min(1).max(100),
});

// ============================================================================
// Route Handler
// ============================================================================

export async function analyticsTrackingRoutes(fastify: FastifyInstance) {
  const prisma = fastify.prisma;
  const redis: Redis = fastify.redis as unknown as Redis;

  // Initialize tracking service
  const trackingService = new AnalyticsTrackingService(redis, prisma);

  // ============================================================================
  // CORS Preflight Handler (for cross-origin tracking)
  // ============================================================================

  fastify.options('/api/v1/analytics/*', async (_request, reply) => {
    reply
      .header('Access-Control-Allow-Origin', '*')
      .header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
      .header('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Project-Id, X-Visitor-Id')
      .header('Access-Control-Max-Age', '86400')
      .status(204)
      .send();
  });

  // ============================================================================
  // Track Event
  // POST /api/v1/analytics/track
  // ============================================================================

  fastify.post('/api/v1/analytics/track', {
    schema: {
      description: 'Track a custom event',
      tags: ['Analytics'],
      body: TrackEventSchema,
      response: {
        200: z.object({
          success: z.boolean(),
          eventId: z.string().optional(),
        }),
        400: z.object({ error: z.string() }),
        500: z.object({ error: z.string() }),
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = TrackEventSchema.parse(request.body);
      const ip = getClientIP(request);

      const event = await trackingService.trackEvent(
        body.sessionId,
        body.eventType,
        body.eventName,
        body.eventData,
        body.url
      );

      if (!event) {
        return reply.status(400).send({ error: 'Session not found' });
      }

      return reply.header('Access-Control-Allow-Origin', '*').send({
        success: true,
        eventId: event.eventId,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors[0].message });
      }
      console.error('Track event error:', error);
      return reply.status(500).send({ error: 'Failed to track event' });
    }
  });

  // ============================================================================
  // Track Page View
  // POST /api/v1/analytics/pageview
  // ============================================================================

  fastify.post('/api/v1/analytics/pageview', {
    schema: {
      description: 'Track a page view',
      tags: ['Analytics'],
      body: PageViewSchema,
      response: {
        200: z.object({
          success: z.boolean(),
          pageViewId: z.string().optional(),
        }),
        400: z.object({ error: z.string() }),
        500: z.object({ error: z.string() }),
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = PageViewSchema.parse(request.body);

      const pageView = await trackingService.trackPageView(
        body.sessionId,
        body.url,
        body.title,
        body.referrer
      );

      if (!pageView) {
        return reply.status(400).send({ error: 'Session not found' });
      }

      return reply.header('Access-Control-Allow-Origin', '*').send({
        success: true,
        pageViewId: pageView.pageViewId,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors[0].message });
      }
      console.error('Track pageview error:', error);
      return reply.status(500).send({ error: 'Failed to track page view' });
    }
  });

  // ============================================================================
  // Start Session
  // POST /api/v1/analytics/session/start
  // ============================================================================

  fastify.post('/api/v1/analytics/session/start', {
    schema: {
      description: 'Start a new analytics session',
      tags: ['Analytics'],
      body: SessionStartSchema,
      response: {
        200: z.object({
          success: z.boolean(),
          sessionId: z.string(),
          visitorId: z.string(),
          isNewVisitor: z.boolean(),
        }),
        400: z.object({ error: z.string() }),
        500: z.object({ error: z.string() }),
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = SessionStartSchema.parse(request.body);
      const ip = getClientIP(request);

      // Build UTM params object
      const utmParams: Record<string, string> = {};
      if (body.utmParams?.source) utmParams.utm_source = body.utmParams.source;
      if (body.utmParams?.medium) utmParams.utm_medium = body.utmParams.medium;
      if (body.utmParams?.campaign) utmParams.utm_campaign = body.utmParams.campaign;
      if (body.utmParams?.content) utmParams.utm_content = body.utmParams.content;
      if (body.utmParams?.term) utmParams.utm_term = body.utmParams.term;
      if (body.gclid) utmParams.gclid = body.gclid;
      if (body.fbclid) utmParams.fbclid = body.fbclid;

      const session = await trackingService.startSession(
        body.projectId,
        body.visitorId,
        body.entryUrl,
        body.referrer,
        body.userAgent,
        ip,
        {
          width: body.screen.width,
          height: body.screen.height,
          viewportWidth: body.screen.viewportWidth,
          viewportHeight: body.screen.viewportHeight,
          pixelRatio: body.screen.pixelRatio,
        },
        utmParams
      );

      // Check if this is a new visitor
      const visitorKey = `analytics:visitor:${body.projectId}:${body.visitorId}`;
      const visitorData = await redis.get(visitorKey);
      const isNewVisitor = !visitorData || JSON.parse(visitorData).totalSessions <= 1;

      return reply.header('Access-Control-Allow-Origin', '*').send({
        success: true,
        sessionId: session.sessionId,
        visitorId: session.visitorId,
        isNewVisitor,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors[0].message });
      }
      console.error('Session start error:', error);
      return reply.status(500).send({ error: 'Failed to start session' });
    }
  });

  // ============================================================================
  // End Session
  // POST /api/v1/analytics/session/end
  // ============================================================================

  fastify.post('/api/v1/analytics/session/end', {
    schema: {
      description: 'End an analytics session',
      tags: ['Analytics'],
      body: SessionEndSchema,
      response: {
        200: z.object({
          success: z.boolean(),
          duration: z.number(),
          pageViews: z.number(),
          isBounce: z.boolean(),
          isEngaged: z.boolean(),
        }),
        400: z.object({ error: z.string() }),
        500: z.object({ error: z.string() }),
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = SessionEndSchema.parse(request.body);

      const session = await trackingService.endSession(body.sessionId);

      if (!session) {
        return reply.status(400).send({ error: 'Session not found' });
      }

      return reply.header('Access-Control-Allow-Origin', '*').send({
        success: true,
        duration: session.duration,
        pageViews: session.pageViews,
        isBounce: session.isBounce,
        isEngaged: session.isEngaged,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors[0].message });
      }
      console.error('Session end error:', error);
      return reply.status(500).send({ error: 'Failed to end session' });
    }
  });

  // ============================================================================
  // Update Engagement
  // POST /api/v1/analytics/engagement
  // ============================================================================

  fastify.post('/api/v1/analytics/engagement', {
    schema: {
      description: 'Update page engagement metrics',
      tags: ['Analytics'],
      body: UpdateEngagementSchema,
      response: {
        200: z.object({
          success: z.boolean(),
          isEngaged: z.boolean().optional(),
        }),
        400: z.object({ error: z.string() }),
        500: z.object({ error: z.string() }),
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = UpdateEngagementSchema.parse(request.body);

      await trackingService.updatePageEngagement(body.sessionId, body.url, {
        viewTime: body.viewTime,
        scrollDepth: body.scrollDepth,
        interactions: body.interactions,
      });

      // Get updated session to check engagement
      const sessionData = await redis.get(`analytics:session:${body.sessionId}`);
      const isEngaged = sessionData ? JSON.parse(sessionData).isEngaged : false;

      return reply.header('Access-Control-Allow-Origin', '*').send({
        success: true,
        isEngaged,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors[0].message });
      }
      console.error('Update engagement error:', error);
      return reply.status(500).send({ error: 'Failed to update engagement' });
    }
  });

  // ============================================================================
  // Track Interaction
  // POST /api/v1/analytics/interaction
  // ============================================================================

  fastify.post('/api/v1/analytics/interaction', {
    schema: {
      description: 'Track a page interaction',
      tags: ['Analytics'],
      body: TrackInteractionSchema,
      response: {
        200: z.object({
          success: z.boolean(),
          interactionId: z.string().optional(),
        }),
        400: z.object({ error: z.string() }),
        500: z.object({ error: z.string() }),
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = TrackInteractionSchema.parse(request.body);

      const pageViewTracker = (trackingService as any).pageViewTracker;
      const interaction = await pageViewTracker.trackInteraction(body.pageViewId, {
        type: body.type,
        target: body.target,
        targetText: body.targetText,
        targetHref: body.targetHref,
        positionX: body.positionX,
        positionY: body.positionY,
        metadata: body.metadata,
        timestamp: body.timestamp ? new Date(body.timestamp) : new Date(),
      });

      return reply.header('Access-Control-Allow-Origin', '*').send({
        success: true,
        interactionId: interaction.interactionId,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors[0].message });
      }
      console.error('Track interaction error:', error);
      return reply.status(500).send({ error: 'Failed to track interaction' });
    }
  });

  // ============================================================================
  // Track Performance
  // POST /api/v1/analytics/performance
  // ============================================================================

  fastify.post('/api/v1/analytics/performance', {
    schema: {
      description: 'Track page performance metrics',
      tags: ['Analytics'],
      body: TrackPerformanceSchema,
      response: {
        200: z.object({ success: z.boolean() }),
        400: z.object({ error: z.string() }),
        500: z.object({ error: z.string() }),
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = TrackPerformanceSchema.parse(request.body);

      const pageViewTracker = (trackingService as any).pageViewTracker;
      await pageViewTracker.trackPerformance(body.pageViewId, {
        loadTime: body.loadTime,
        domContentLoaded: body.domContentLoaded,
        firstContentfulPaint: body.firstContentfulPaint,
        largestContentfulPaint: body.largestContentfulPaint,
        firstInputDelay: body.firstInputDelay,
        cumulativeLayoutShift: body.cumulativeLayoutShift,
        timeToInteractive: body.timeToInteractive,
        dnsLookup: body.dnsLookup,
        tcpConnection: body.tcpConnection,
        serverResponse: body.serverResponse,
        domParsing: body.domParsing,
        resourceLoading: body.resourceLoading,
      });

      return reply.header('Access-Control-Allow-Origin', '*').send({
        success: true,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors[0].message });
      }
      console.error('Track performance error:', error);
      return reply.status(500).send({ error: 'Failed to track performance' });
    }
  });

  // ============================================================================
  // Batch Events
  // POST /api/v1/analytics/batch
  // ============================================================================

  fastify.post('/api/v1/analytics/batch', {
    schema: {
      description: 'Track multiple events in a batch',
      tags: ['Analytics'],
      body: BatchEventsSchema,
      response: {
        200: z.object({
          success: z.boolean(),
          processed: z.number(),
          failed: z.number(),
        }),
        400: z.object({ error: z.string() }),
        500: z.object({ error: z.string() }),
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = BatchEventsSchema.parse(request.body);
      let processed = 0;
      let failed = 0;

      for (const eventData of body.events) {
        try {
          const event = await trackingService.trackEvent(
            eventData.sessionId,
            eventData.eventType,
            eventData.eventName,
            eventData.eventData,
            eventData.url
          );
          if (event) {
            processed++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
      }

      return reply.header('Access-Control-Allow-Origin', '*').send({
        success: true,
        processed,
        failed,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors[0].message });
      }
      console.error('Batch events error:', error);
      return reply.status(500).send({ error: 'Failed to process batch events' });
    }
  });

  // ============================================================================
  // Heartbeat (keep session alive)
  // POST /api/v1/analytics/heartbeat
  // ============================================================================

  fastify.post('/api/v1/analytics/heartbeat', {
    schema: {
      description: 'Keep session alive with a heartbeat',
      tags: ['Analytics'],
      body: z.object({
        sessionId: z.string().min(1),
      }),
      response: {
        200: z.object({
          success: z.boolean(),
          duration: z.number(),
        }),
        400: z.object({ error: z.string() }),
        500: z.object({ error: z.string() }),
      },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { sessionId } = z.object({ sessionId: z.string() }).parse(request.body);

      const session = await trackingService.updateSession(sessionId);

      if (!session) {
        return reply.status(400).send({ error: 'Session not found' });
      }

      return reply.header('Access-Control-Allow-Origin', '*').send({
        success: true,
        duration: session.duration,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return reply.status(400).send({ error: error.errors[0].message });
      }
      console.error('Heartbeat error:', error);
      return reply.status(500).send({ error: 'Failed to process heartbeat' });
    }
  });

  // ============================================================================
  // Pixel Tracking (1x1 transparent GIF)
  // GET /api/v1/analytics/pixel
  // ============================================================================

  fastify.get('/api/v1/analytics/pixel', {
    schema: {
      description: 'Tracking pixel for email and no-JS environments',
      tags: ['Analytics'],
      querystring: z.object({
        p: z.string(), // projectId
        v: z.string().optional(), // visitorId
        e: z.string().optional(), // event name
        u: z.string().optional(), // url
      }),
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = (request.query as { p: string; v?: string; e?: string; u?: string });
      const projectId = query.p;
      const visitorId = query.v || `anon_${Date.now()}`;
      const eventName = query.e || 'pixel_view';
      const url = query.u || request.headers.referer || '';

      // Create a minimal session if needed
      const ip = getClientIP(request);
      const userAgent = request.headers['user-agent'] || '';

      // Track as a lightweight event
      await redis.lpush(
        `analytics:pixel:${projectId}`,
        JSON.stringify({
          visitorId,
          eventName,
          url,
          ip,
          userAgent,
          timestamp: new Date().toISOString(),
        })
      );
      await redis.ltrim(`analytics:pixel:${projectId}`, 0, 9999);

      // Return 1x1 transparent GIF
      const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');

      return reply
        .header('Content-Type', 'image/gif')
        .header('Cache-Control', 'no-store, no-cache, must-revalidate')
        .header('Access-Control-Allow-Origin', '*')
        .send(gif);
    } catch (error) {
      console.error('Pixel tracking error:', error);
      // Still return the pixel even on error
      const gif = Buffer.from('R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7', 'base64');
      return reply.header('Content-Type', 'image/gif').send(gif);
    }
  });
}

// ============================================================================
// Helper Functions
// ============================================================================

function getClientIP(request: FastifyRequest): string {
  // Check common headers for proxied requests
  const forwardedFor = request.headers['x-forwarded-for'];
  if (forwardedFor) {
    const ips = (Array.isArray(forwardedFor) ? forwardedFor[0] : forwardedFor).split(',');
    return ips[0].trim();
  }

  const realIP = request.headers['x-real-ip'];
  if (realIP) {
    return Array.isArray(realIP) ? realIP[0] : realIP;
  }

  const cfConnectingIP = request.headers['cf-connecting-ip'];
  if (cfConnectingIP) {
    return Array.isArray(cfConnectingIP) ? cfConnectingIP[0] : cfConnectingIP;
  }

  return request.ip || '0.0.0.0';
}

export default analyticsTrackingRoutes;

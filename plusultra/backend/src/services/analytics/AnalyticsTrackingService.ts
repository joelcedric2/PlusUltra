/**
 * Analytics Tracking Service
 *
 * Comprehensive user activity tracking for deployed apps/websites.
 * Handles traffic sources, page views, sessions, device info, and user journeys.
 */

import { Redis } from 'ioredis';
import { PrismaClient } from '@prisma/client';
import { TrafficSourceTracker, TrafficSource, UTMParameters } from './TrafficSourceTracker';
import { PageViewTracker, PageViewEvent, EngagementMetrics } from './PageViewTracker';

// ============================================================================
// Type Definitions
// ============================================================================

export interface DeviceInfo {
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  deviceType: 'desktop' | 'tablet' | 'mobile' | 'bot' | 'unknown';
  screenWidth: number;
  screenHeight: number;
  viewportWidth: number;
  viewportHeight: number;
  pixelRatio: number;
  touchEnabled: boolean;
  language: string;
  timezone: string;
}

export interface GeoLocation {
  country: string;
  countryCode: string;
  region: string;
  regionCode: string;
  city: string;
  postalCode: string;
  latitude: number;
  longitude: number;
  timezone: string;
  isp: string;
  isVpn: boolean;
  isProxy: boolean;
}

export interface SessionData {
  sessionId: string;
  visitorId: string;
  projectId: string;
  startedAt: Date;
  lastActivityAt: Date;
  endedAt?: Date;
  duration: number; // seconds
  pageViews: number;
  events: number;
  isBounce: boolean;
  isEngaged: boolean;
  entryPage: string;
  exitPage?: string;
  trafficSource: TrafficSource;
  utmParams: UTMParameters;
  device: DeviceInfo;
  geo: GeoLocation;
  userJourney: PageVisit[];
}

export interface PageVisit {
  url: string;
  title: string;
  timestamp: Date;
  viewTime: number; // seconds
  scrollDepth: number; // percentage 0-100
  interactions: number;
}

export interface TrackingEvent {
  eventId: string;
  projectId: string;
  sessionId: string;
  visitorId: string;
  eventType: 'pageview' | 'click' | 'scroll' | 'form' | 'custom' | 'error' | 'performance';
  eventName: string;
  eventData: Record<string, unknown>;
  timestamp: Date;
  url: string;
  device: DeviceInfo;
  geo: GeoLocation;
}

export interface DashboardMetrics {
  overview: {
    totalVisitors: number;
    uniqueVisitors: number;
    totalPageViews: number;
    avgSessionDuration: number;
    bounceRate: number;
    engagementRate: number;
    pagesPerSession: number;
  };
  traffic: {
    sources: Array<{ source: string; visitors: number; percentage: number }>;
    channels: Array<{ channel: string; visitors: number; percentage: number }>;
    topReferrers: Array<{ referrer: string; visitors: number }>;
    campaigns: Array<{ campaign: string; visitors: number; conversions: number }>;
  };
  pages: {
    topPages: Array<{ url: string; title: string; views: number; uniqueViews: number; avgTime: number }>;
    entryPages: Array<{ url: string; entries: number; bounceRate: number }>;
    exitPages: Array<{ url: string; exits: number; exitRate: number }>;
  };
  engagement: {
    avgScrollDepth: number;
    avgTimeOnPage: number;
    interactionRate: number;
    returningVisitorRate: number;
  };
  devices: {
    browsers: Array<{ browser: string; visitors: number; percentage: number }>;
    operatingSystems: Array<{ os: string; visitors: number; percentage: number }>;
    deviceTypes: Array<{ type: string; visitors: number; percentage: number }>;
    screenSizes: Array<{ size: string; visitors: number; percentage: number }>;
  };
  geography: {
    countries: Array<{ country: string; countryCode: string; visitors: number; percentage: number }>;
    regions: Array<{ region: string; country: string; visitors: number }>;
    cities: Array<{ city: string; region: string; country: string; visitors: number }>;
  };
  realtime: {
    activeVisitors: number;
    activePages: Array<{ url: string; visitors: number }>;
    recentEvents: TrackingEvent[];
  };
}

export interface RealtimeData {
  activeVisitors: number;
  visitorsLast30Min: number;
  pageViewsPerMinute: number[];
  activePages: Array<{
    url: string;
    title: string;
    visitors: number;
    avgTimeOnPage: number;
  }>;
  activeCountries: Array<{
    country: string;
    countryCode: string;
    visitors: number;
  }>;
  activeSessions: Array<{
    sessionId: string;
    visitorId: string;
    currentPage: string;
    device: string;
    country: string;
    duration: number;
    pageViews: number;
  }>;
  recentEvents: Array<{
    eventType: string;
    eventName: string;
    url: string;
    timestamp: Date;
  }>;
}

// ============================================================================
// Analytics Tracking Service
// ============================================================================

export class AnalyticsTrackingService {
  private redis: Redis;
  private prisma: PrismaClient;
  private trafficTracker: TrafficSourceTracker;
  private pageViewTracker: PageViewTracker;

  // Redis key prefixes
  private readonly KEYS = {
    SESSION: 'analytics:session:',
    VISITOR: 'analytics:visitor:',
    REALTIME: 'analytics:realtime:',
    PAGEVIEW: 'analytics:pageview:',
    EVENT: 'analytics:event:',
    ACTIVE_VISITORS: 'analytics:active:',
    PAGE_STATS: 'analytics:page_stats:',
  };

  // Configuration
  private readonly SESSION_TIMEOUT = 30 * 60; // 30 minutes
  private readonly REALTIME_WINDOW = 5 * 60; // 5 minutes
  private readonly ENGAGEMENT_THRESHOLD = 10; // seconds

  constructor(redis: Redis, prisma: PrismaClient) {
    this.redis = redis;
    this.prisma = prisma;
    this.trafficTracker = new TrafficSourceTracker();
    this.pageViewTracker = new PageViewTracker(redis);
  }

  // ============================================================================
  // Session Management
  // ============================================================================

  /**
   * Start a new analytics session
   */
  async startSession(
    projectId: string,
    visitorId: string,
    entryUrl: string,
    referrer: string,
    userAgent: string,
    ipAddress: string,
    screenInfo: { width: number; height: number; viewportWidth: number; viewportHeight: number; pixelRatio: number },
    additionalParams: Record<string, string> = {}
  ): Promise<SessionData> {
    const sessionId = this.generateId('sess');
    const now = new Date();

    // Parse traffic source and UTM parameters
    const trafficSource = this.trafficTracker.categorizeSource(referrer, additionalParams);
    const utmParams = this.trafficTracker.extractUTMParams(additionalParams);

    // Parse device info
    const device = this.parseUserAgent(userAgent, screenInfo);

    // Get geo location from IP
    const geo = await this.getGeoLocation(ipAddress);

    const session: SessionData = {
      sessionId,
      visitorId,
      projectId,
      startedAt: now,
      lastActivityAt: now,
      duration: 0,
      pageViews: 0,
      events: 0,
      isBounce: true,
      isEngaged: false,
      entryPage: entryUrl,
      trafficSource,
      utmParams,
      device,
      geo,
      userJourney: [],
    };

    // Store session in Redis
    await this.redis.setex(
      `${this.KEYS.SESSION}${sessionId}`,
      this.SESSION_TIMEOUT,
      JSON.stringify(session)
    );

    // Track visitor
    await this.trackVisitor(projectId, visitorId, sessionId);

    // Update realtime counters
    await this.updateRealtimeCounters(projectId, 'session_start');

    // Persist to database
    await this.persistSessionStart(session);

    return session;
  }

  /**
   * Update session activity
   */
  async updateSession(sessionId: string): Promise<SessionData | null> {
    const sessionKey = `${this.KEYS.SESSION}${sessionId}`;
    const sessionData = await this.redis.get(sessionKey);

    if (!sessionData) {
      return null;
    }

    const session: SessionData = JSON.parse(sessionData);
    const now = new Date();

    session.lastActivityAt = now;
    session.duration = Math.floor((now.getTime() - new Date(session.startedAt).getTime()) / 1000);

    // Check engagement
    if (session.duration >= this.ENGAGEMENT_THRESHOLD) {
      session.isEngaged = true;
    }

    // Update bounce status
    if (session.pageViews > 1 || session.events > 0 || session.isEngaged) {
      session.isBounce = false;
    }

    await this.redis.setex(sessionKey, this.SESSION_TIMEOUT, JSON.stringify(session));

    return session;
  }

  /**
   * End a session
   */
  async endSession(sessionId: string): Promise<SessionData | null> {
    const session = await this.updateSession(sessionId);

    if (!session) {
      return null;
    }

    session.endedAt = new Date();
    session.exitPage = session.userJourney[session.userJourney.length - 1]?.url || session.entryPage;

    // Persist final session data
    await this.persistSessionEnd(session);

    // Update realtime counters
    await this.updateRealtimeCounters(session.projectId, 'session_end');

    // Remove from Redis
    await this.redis.del(`${this.KEYS.SESSION}${sessionId}`);

    return session;
  }

  // ============================================================================
  // Page View Tracking
  // ============================================================================

  /**
   * Track a page view event
   */
  async trackPageView(
    sessionId: string,
    url: string,
    title: string,
    referrer: string
  ): Promise<PageViewEvent | null> {
    const session = await this.getSession(sessionId);

    if (!session) {
      return null;
    }

    const pageView = await this.pageViewTracker.trackPageView(
      session.projectId,
      sessionId,
      session.visitorId,
      url,
      title,
      referrer,
      session.device,
      session.geo
    );

    // Update session
    session.pageViews++;
    session.lastActivityAt = new Date();
    session.userJourney.push({
      url,
      title,
      timestamp: new Date(),
      viewTime: 0,
      scrollDepth: 0,
      interactions: 0,
    });

    if (session.pageViews > 1) {
      session.isBounce = false;
    }

    await this.redis.setex(
      `${this.KEYS.SESSION}${sessionId}`,
      this.SESSION_TIMEOUT,
      JSON.stringify(session)
    );

    // Update realtime page counters
    await this.updateRealtimeCounters(session.projectId, 'pageview', { url });

    // Persist page view
    await this.persistPageView(pageView);

    return pageView;
  }

  /**
   * Update page engagement metrics
   */
  async updatePageEngagement(
    sessionId: string,
    url: string,
    metrics: Partial<EngagementMetrics>
  ): Promise<void> {
    const session = await this.getSession(sessionId);

    if (!session) {
      return;
    }

    await this.pageViewTracker.updateEngagement(sessionId, url, metrics);

    // Update journey entry
    const journeyEntry = session.userJourney.find(p => p.url === url);
    if (journeyEntry) {
      if (metrics.viewTime !== undefined) {
        journeyEntry.viewTime = metrics.viewTime;
      }
      if (metrics.scrollDepth !== undefined) {
        journeyEntry.scrollDepth = metrics.scrollDepth;
      }
      if (metrics.interactions !== undefined) {
        journeyEntry.interactions = metrics.interactions;
      }

      // Check engagement
      if (journeyEntry.viewTime >= this.ENGAGEMENT_THRESHOLD) {
        session.isEngaged = true;
        session.isBounce = false;
      }

      await this.redis.setex(
        `${this.KEYS.SESSION}${sessionId}`,
        this.SESSION_TIMEOUT,
        JSON.stringify(session)
      );
    }
  }

  // ============================================================================
  // Event Tracking
  // ============================================================================

  /**
   * Track a custom event
   */
  async trackEvent(
    sessionId: string,
    eventType: TrackingEvent['eventType'],
    eventName: string,
    eventData: Record<string, unknown>,
    url: string
  ): Promise<TrackingEvent | null> {
    const session = await this.getSession(sessionId);

    if (!session) {
      return null;
    }

    const event: TrackingEvent = {
      eventId: this.generateId('evt'),
      projectId: session.projectId,
      sessionId,
      visitorId: session.visitorId,
      eventType,
      eventName,
      eventData,
      timestamp: new Date(),
      url,
      device: session.device,
      geo: session.geo,
    };

    // Update session
    session.events++;
    session.lastActivityAt = new Date();
    session.isBounce = false;

    await this.redis.setex(
      `${this.KEYS.SESSION}${sessionId}`,
      this.SESSION_TIMEOUT,
      JSON.stringify(session)
    );

    // Store event in Redis for realtime
    await this.redis.lpush(
      `${this.KEYS.EVENT}${session.projectId}`,
      JSON.stringify(event)
    );
    await this.redis.ltrim(`${this.KEYS.EVENT}${session.projectId}`, 0, 999);

    // Persist event
    await this.persistEvent(event);

    return event;
  }

  // ============================================================================
  // Dashboard & Analytics
  // ============================================================================

  /**
   * Get dashboard metrics for a project
   */
  async getDashboardMetrics(
    projectId: string,
    startDate: Date,
    endDate: Date
  ): Promise<DashboardMetrics> {
    const [
      overview,
      traffic,
      pages,
      engagement,
      devices,
      geography,
      realtime,
    ] = await Promise.all([
      this.getOverviewMetrics(projectId, startDate, endDate),
      this.getTrafficMetrics(projectId, startDate, endDate),
      this.getPageMetrics(projectId, startDate, endDate),
      this.getEngagementMetrics(projectId, startDate, endDate),
      this.getDeviceMetrics(projectId, startDate, endDate),
      this.getGeographyMetrics(projectId, startDate, endDate),
      this.getRealtimeMetrics(projectId),
    ]);

    return {
      overview,
      traffic,
      pages,
      engagement,
      devices,
      geography,
      realtime,
    };
  }

  /**
   * Get traffic source breakdown
   */
  async getTrafficBreakdown(
    projectId: string,
    startDate: Date,
    endDate: Date
  ): Promise<DashboardMetrics['traffic']> {
    return this.getTrafficMetrics(projectId, startDate, endDate);
  }

  /**
   * Get page-level analytics
   */
  async getPageAnalytics(
    projectId: string,
    startDate: Date,
    endDate: Date
  ): Promise<DashboardMetrics['pages']> {
    return this.getPageMetrics(projectId, startDate, endDate);
  }

  /**
   * Get real-time visitor data
   */
  async getRealtimeData(projectId: string): Promise<RealtimeData> {
    // Get active sessions
    const activeSessionKeys = await this.redis.keys(`${this.KEYS.SESSION}*`);
    const activeSessions: SessionData[] = [];

    for (const key of activeSessionKeys) {
      const data = await this.redis.get(key);
      if (data) {
        const session: SessionData = JSON.parse(data);
        if (session.projectId === projectId) {
          const lastActivity = new Date(session.lastActivityAt).getTime();
          const now = Date.now();
          if (now - lastActivity < this.REALTIME_WINDOW * 1000) {
            activeSessions.push(session);
          }
        }
      }
    }

    // Calculate page views per minute (last 30 minutes)
    const pageViewsPerMinute: number[] = [];
    for (let i = 29; i >= 0; i--) {
      const minute = new Date(Date.now() - i * 60 * 1000);
      const key = `${this.KEYS.REALTIME}${projectId}:pv:${minute.toISOString().slice(0, 16)}`;
      const count = await this.redis.get(key);
      pageViewsPerMinute.push(parseInt(count || '0', 10));
    }

    // Aggregate active pages
    const pageMap = new Map<string, { url: string; title: string; visitors: number; totalTime: number }>();
    for (const session of activeSessions) {
      const lastPage = session.userJourney[session.userJourney.length - 1];
      if (lastPage) {
        const existing = pageMap.get(lastPage.url) || {
          url: lastPage.url,
          title: lastPage.title,
          visitors: 0,
          totalTime: 0,
        };
        existing.visitors++;
        existing.totalTime += lastPage.viewTime;
        pageMap.set(lastPage.url, existing);
      }
    }

    const activePages = Array.from(pageMap.values())
      .map(p => ({
        url: p.url,
        title: p.title,
        visitors: p.visitors,
        avgTimeOnPage: p.visitors > 0 ? p.totalTime / p.visitors : 0,
      }))
      .sort((a, b) => b.visitors - a.visitors)
      .slice(0, 10);

    // Aggregate active countries
    const countryMap = new Map<string, { country: string; countryCode: string; visitors: number }>();
    for (const session of activeSessions) {
      const key = session.geo.countryCode;
      const existing = countryMap.get(key) || {
        country: session.geo.country,
        countryCode: session.geo.countryCode,
        visitors: 0,
      };
      existing.visitors++;
      countryMap.set(key, existing);
    }

    const activeCountries = Array.from(countryMap.values())
      .sort((a, b) => b.visitors - a.visitors)
      .slice(0, 10);

    // Get recent events
    const recentEventsRaw = await this.redis.lrange(`${this.KEYS.EVENT}${projectId}`, 0, 19);
    const recentEvents = recentEventsRaw.map(e => {
      const event: TrackingEvent = JSON.parse(e);
      return {
        eventType: event.eventType,
        eventName: event.eventName,
        url: event.url,
        timestamp: event.timestamp,
      };
    });

    return {
      activeVisitors: activeSessions.length,
      visitorsLast30Min: activeSessions.filter(s => {
        const startedAt = new Date(s.startedAt).getTime();
        return Date.now() - startedAt < 30 * 60 * 1000;
      }).length,
      pageViewsPerMinute,
      activePages,
      activeCountries,
      activeSessions: activeSessions.map(s => ({
        sessionId: s.sessionId,
        visitorId: s.visitorId,
        currentPage: s.userJourney[s.userJourney.length - 1]?.url || s.entryPage,
        device: `${s.device.browser} on ${s.device.os}`,
        country: s.geo.country,
        duration: s.duration,
        pageViews: s.pageViews,
      })).slice(0, 50),
      recentEvents,
    };
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private async getSession(sessionId: string): Promise<SessionData | null> {
    const data = await this.redis.get(`${this.KEYS.SESSION}${sessionId}`);
    return data ? JSON.parse(data) : null;
  }

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
  }

  private parseUserAgent(
    userAgent: string,
    screenInfo: { width: number; height: number; viewportWidth: number; viewportHeight: number; pixelRatio: number }
  ): DeviceInfo {
    // Parse browser
    let browser = 'Unknown';
    let browserVersion = '';

    if (userAgent.includes('Chrome') && !userAgent.includes('Edg')) {
      browser = 'Chrome';
      browserVersion = userAgent.match(/Chrome\/(\d+)/)?.[1] || '';
    } else if (userAgent.includes('Safari') && !userAgent.includes('Chrome')) {
      browser = 'Safari';
      browserVersion = userAgent.match(/Version\/(\d+)/)?.[1] || '';
    } else if (userAgent.includes('Firefox')) {
      browser = 'Firefox';
      browserVersion = userAgent.match(/Firefox\/(\d+)/)?.[1] || '';
    } else if (userAgent.includes('Edg')) {
      browser = 'Edge';
      browserVersion = userAgent.match(/Edg\/(\d+)/)?.[1] || '';
    } else if (userAgent.includes('MSIE') || userAgent.includes('Trident')) {
      browser = 'Internet Explorer';
      browserVersion = userAgent.match(/(?:MSIE |rv:)(\d+)/)?.[1] || '';
    }

    // Parse OS
    let os = 'Unknown';
    let osVersion = '';

    if (userAgent.includes('Windows NT')) {
      os = 'Windows';
      const ntVersion = userAgent.match(/Windows NT (\d+\.\d+)/)?.[1];
      const versionMap: Record<string, string> = {
        '10.0': '10/11',
        '6.3': '8.1',
        '6.2': '8',
        '6.1': '7',
      };
      osVersion = ntVersion ? (versionMap[ntVersion] || ntVersion) : '';
    } else if (userAgent.includes('Mac OS X')) {
      os = 'macOS';
      osVersion = userAgent.match(/Mac OS X (\d+[._]\d+)/)?.[1]?.replace('_', '.') || '';
    } else if (userAgent.includes('Linux')) {
      os = 'Linux';
    } else if (userAgent.includes('Android')) {
      os = 'Android';
      osVersion = userAgent.match(/Android (\d+)/)?.[1] || '';
    } else if (userAgent.includes('iOS') || userAgent.includes('iPhone') || userAgent.includes('iPad')) {
      os = 'iOS';
      osVersion = userAgent.match(/OS (\d+)/)?.[1] || '';
    }

    // Determine device type
    let deviceType: DeviceInfo['deviceType'] = 'desktop';

    if (userAgent.includes('bot') || userAgent.includes('spider') || userAgent.includes('crawl')) {
      deviceType = 'bot';
    } else if (userAgent.includes('Mobile') || userAgent.includes('Android') && !userAgent.includes('Tablet')) {
      deviceType = 'mobile';
    } else if (userAgent.includes('Tablet') || userAgent.includes('iPad')) {
      deviceType = 'tablet';
    }

    // Parse language and timezone from user agent or defaults
    const language = 'en-US'; // Would come from Accept-Language header
    const timezone = 'UTC'; // Would come from client

    return {
      browser,
      browserVersion,
      os,
      osVersion,
      deviceType,
      screenWidth: screenInfo.width,
      screenHeight: screenInfo.height,
      viewportWidth: screenInfo.viewportWidth,
      viewportHeight: screenInfo.viewportHeight,
      pixelRatio: screenInfo.pixelRatio,
      touchEnabled: deviceType === 'mobile' || deviceType === 'tablet',
      language,
      timezone,
    };
  }

  private async getGeoLocation(ipAddress: string): Promise<GeoLocation> {
    // In production, use a geo-IP service like MaxMind, IP2Location, etc.
    // For now, return a placeholder
    try {
      // Check cache first
      const cacheKey = `geo:${ipAddress}`;
      const cached = await this.redis.get(cacheKey);
      if (cached) {
        return JSON.parse(cached);
      }

      // Placeholder - in production, call a geo-IP API
      const geo: GeoLocation = {
        country: 'United States',
        countryCode: 'US',
        region: 'California',
        regionCode: 'CA',
        city: 'San Francisco',
        postalCode: '94102',
        latitude: 37.7749,
        longitude: -122.4194,
        timezone: 'America/Los_Angeles',
        isp: 'Unknown',
        isVpn: false,
        isProxy: false,
      };

      // Cache for 24 hours
      await this.redis.setex(cacheKey, 86400, JSON.stringify(geo));

      return geo;
    } catch {
      return {
        country: 'Unknown',
        countryCode: 'XX',
        region: 'Unknown',
        regionCode: '',
        city: 'Unknown',
        postalCode: '',
        latitude: 0,
        longitude: 0,
        timezone: 'UTC',
        isp: 'Unknown',
        isVpn: false,
        isProxy: false,
      };
    }
  }

  private async trackVisitor(projectId: string, visitorId: string, sessionId: string): Promise<void> {
    const visitorKey = `${this.KEYS.VISITOR}${projectId}:${visitorId}`;
    const existingData = await this.redis.get(visitorKey);

    if (existingData) {
      const visitor = JSON.parse(existingData);
      visitor.sessions.push(sessionId);
      visitor.lastSeen = new Date().toISOString();
      visitor.totalSessions++;
      await this.redis.set(visitorKey, JSON.stringify(visitor));
    } else {
      const visitor = {
        visitorId,
        projectId,
        firstSeen: new Date().toISOString(),
        lastSeen: new Date().toISOString(),
        totalSessions: 1,
        sessions: [sessionId],
      };
      await this.redis.set(visitorKey, JSON.stringify(visitor));
    }
  }

  private async updateRealtimeCounters(
    projectId: string,
    eventType: string,
    data?: Record<string, string>
  ): Promise<void> {
    const minute = new Date().toISOString().slice(0, 16);
    const hour = new Date().toISOString().slice(0, 13);

    // Increment minute counter
    const minuteKey = `${this.KEYS.REALTIME}${projectId}:${eventType}:${minute}`;
    await this.redis.incr(minuteKey);
    await this.redis.expire(minuteKey, 3600); // Expire after 1 hour

    // Increment hour counter
    const hourKey = `${this.KEYS.REALTIME}${projectId}:${eventType}:${hour}`;
    await this.redis.incr(hourKey);
    await this.redis.expire(hourKey, 86400); // Expire after 24 hours

    // Track page-specific counters
    if (eventType === 'pageview' && data?.url) {
      const pageKey = `${this.KEYS.PAGE_STATS}${projectId}:${minute}`;
      await this.redis.hincrby(pageKey, data.url, 1);
      await this.redis.expire(pageKey, 3600);
    }

    // Update active visitors set
    if (eventType === 'session_start') {
      await this.redis.sadd(`${this.KEYS.ACTIVE_VISITORS}${projectId}`, Date.now().toString());
      await this.redis.expire(`${this.KEYS.ACTIVE_VISITORS}${projectId}`, this.REALTIME_WINDOW);
    }
  }

  // ============================================================================
  // Database Persistence Methods
  // ============================================================================

  private async persistSessionStart(session: SessionData): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO analytics_sessions (
          session_id, visitor_id, project_id, started_at, entry_page,
          traffic_source, traffic_medium, traffic_campaign, traffic_content, traffic_term,
          device_type, browser, browser_version, os, os_version,
          screen_width, screen_height, country, country_code, region, city
        ) VALUES (
          ${session.sessionId}, ${session.visitorId}, ${session.projectId},
          ${session.startedAt}, ${session.entryPage},
          ${session.trafficSource.source}, ${session.trafficSource.medium},
          ${session.utmParams.campaign || null}, ${session.utmParams.content || null},
          ${session.utmParams.term || null},
          ${session.device.deviceType}, ${session.device.browser}, ${session.device.browserVersion},
          ${session.device.os}, ${session.device.osVersion},
          ${session.device.screenWidth}, ${session.device.screenHeight},
          ${session.geo.country}, ${session.geo.countryCode}, ${session.geo.region}, ${session.geo.city}
        )
        ON CONFLICT (session_id) DO NOTHING
      `;
    } catch (error) {
      console.error('Failed to persist session start:', error);
    }
  }

  private async persistSessionEnd(session: SessionData): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        UPDATE analytics_sessions
        SET ended_at = ${session.endedAt},
            duration = ${session.duration},
            page_views = ${session.pageViews},
            events = ${session.events},
            is_bounce = ${session.isBounce},
            is_engaged = ${session.isEngaged},
            exit_page = ${session.exitPage}
        WHERE session_id = ${session.sessionId}
      `;
    } catch (error) {
      console.error('Failed to persist session end:', error);
    }
  }

  private async persistPageView(pageView: PageViewEvent): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO analytics_pageviews (
          pageview_id, session_id, visitor_id, project_id,
          url, title, referrer, timestamp
        ) VALUES (
          ${pageView.pageViewId}, ${pageView.sessionId}, ${pageView.visitorId},
          ${pageView.projectId}, ${pageView.url}, ${pageView.title},
          ${pageView.referrer}, ${pageView.timestamp}
        )
        ON CONFLICT (pageview_id) DO NOTHING
      `;
    } catch (error) {
      console.error('Failed to persist page view:', error);
    }
  }

  private async persistEvent(event: TrackingEvent): Promise<void> {
    try {
      await this.prisma.$executeRaw`
        INSERT INTO analytics_events (
          event_id, session_id, visitor_id, project_id,
          event_type, event_name, event_data, url, timestamp
        ) VALUES (
          ${event.eventId}, ${event.sessionId}, ${event.visitorId},
          ${event.projectId}, ${event.eventType}, ${event.eventName},
          ${JSON.stringify(event.eventData)}::jsonb, ${event.url}, ${event.timestamp}
        )
        ON CONFLICT (event_id) DO NOTHING
      `;
    } catch (error) {
      console.error('Failed to persist event:', error);
    }
  }

  // ============================================================================
  // Metrics Calculation Methods
  // ============================================================================

  private async getOverviewMetrics(
    projectId: string,
    startDate: Date,
    endDate: Date
  ): Promise<DashboardMetrics['overview']> {
    const result = await this.prisma.$queryRaw<Array<{
      total_visitors: bigint;
      unique_visitors: bigint;
      total_pageviews: bigint;
      avg_duration: number;
      bounce_rate: number;
      engagement_rate: number;
      pages_per_session: number;
    }>>`
      SELECT
        COUNT(*) as total_visitors,
        COUNT(DISTINCT visitor_id) as unique_visitors,
        COALESCE(SUM(page_views), 0) as total_pageviews,
        COALESCE(AVG(duration), 0) as avg_duration,
        COALESCE(AVG(CASE WHEN is_bounce THEN 1 ELSE 0 END) * 100, 0) as bounce_rate,
        COALESCE(AVG(CASE WHEN is_engaged THEN 1 ELSE 0 END) * 100, 0) as engagement_rate,
        COALESCE(AVG(page_views), 0) as pages_per_session
      FROM analytics_sessions
      WHERE project_id = ${projectId}
        AND started_at >= ${startDate}
        AND started_at <= ${endDate}
    `;

    const row = result[0] || {
      total_visitors: BigInt(0),
      unique_visitors: BigInt(0),
      total_pageviews: BigInt(0),
      avg_duration: 0,
      bounce_rate: 0,
      engagement_rate: 0,
      pages_per_session: 0,
    };

    return {
      totalVisitors: Number(row.total_visitors),
      uniqueVisitors: Number(row.unique_visitors),
      totalPageViews: Number(row.total_pageviews),
      avgSessionDuration: Math.round(Number(row.avg_duration)),
      bounceRate: Math.round(Number(row.bounce_rate) * 100) / 100,
      engagementRate: Math.round(Number(row.engagement_rate) * 100) / 100,
      pagesPerSession: Math.round(Number(row.pages_per_session) * 100) / 100,
    };
  }

  private async getTrafficMetrics(
    projectId: string,
    startDate: Date,
    endDate: Date
  ): Promise<DashboardMetrics['traffic']> {
    const [sourcesResult, referrersResult, campaignsResult] = await Promise.all([
      this.prisma.$queryRaw<Array<{ source: string; visitors: bigint }>>`
        SELECT traffic_source as source, COUNT(DISTINCT visitor_id) as visitors
        FROM analytics_sessions
        WHERE project_id = ${projectId}
          AND started_at >= ${startDate}
          AND started_at <= ${endDate}
        GROUP BY traffic_source
        ORDER BY visitors DESC
        LIMIT 10
      `,
      this.prisma.$queryRaw<Array<{ referrer: string; visitors: bigint }>>`
        SELECT
          COALESCE(NULLIF(traffic_source, 'direct'), 'Direct') as referrer,
          COUNT(DISTINCT visitor_id) as visitors
        FROM analytics_sessions
        WHERE project_id = ${projectId}
          AND started_at >= ${startDate}
          AND started_at <= ${endDate}
        GROUP BY traffic_source
        ORDER BY visitors DESC
        LIMIT 10
      `,
      this.prisma.$queryRaw<Array<{ campaign: string; visitors: bigint; conversions: bigint }>>`
        SELECT
          traffic_campaign as campaign,
          COUNT(DISTINCT visitor_id) as visitors,
          COUNT(DISTINCT CASE WHEN is_engaged THEN visitor_id END) as conversions
        FROM analytics_sessions
        WHERE project_id = ${projectId}
          AND started_at >= ${startDate}
          AND started_at <= ${endDate}
          AND traffic_campaign IS NOT NULL
        GROUP BY traffic_campaign
        ORDER BY visitors DESC
        LIMIT 10
      `,
    ]);

    const totalVisitors = sourcesResult.reduce((sum, r) => sum + Number(r.visitors), 0);

    const sources = sourcesResult.map(r => ({
      source: r.source || 'Unknown',
      visitors: Number(r.visitors),
      percentage: totalVisitors > 0 ? Math.round((Number(r.visitors) / totalVisitors) * 10000) / 100 : 0,
    }));

    const channels = this.aggregateByChannel(sourcesResult, totalVisitors);

    const topReferrers = referrersResult.map(r => ({
      referrer: r.referrer || 'Direct',
      visitors: Number(r.visitors),
    }));

    const campaigns = campaignsResult.map(r => ({
      campaign: r.campaign || 'Unknown',
      visitors: Number(r.visitors),
      conversions: Number(r.conversions),
    }));

    return { sources, channels, topReferrers, campaigns };
  }

  private aggregateByChannel(
    sources: Array<{ source: string; visitors: bigint }>,
    total: number
  ): Array<{ channel: string; visitors: number; percentage: number }> {
    const channelMap = new Map<string, number>();

    for (const source of sources) {
      const channel = this.trafficTracker.mapSourceToChannel(source.source);
      const current = channelMap.get(channel) || 0;
      channelMap.set(channel, current + Number(source.visitors));
    }

    return Array.from(channelMap.entries())
      .map(([channel, visitors]) => ({
        channel,
        visitors,
        percentage: total > 0 ? Math.round((visitors / total) * 10000) / 100 : 0,
      }))
      .sort((a, b) => b.visitors - a.visitors);
  }

  private async getPageMetrics(
    projectId: string,
    startDate: Date,
    endDate: Date
  ): Promise<DashboardMetrics['pages']> {
    const [topPagesResult, entryPagesResult, exitPagesResult] = await Promise.all([
      this.prisma.$queryRaw<Array<{
        url: string;
        title: string;
        views: bigint;
        unique_views: bigint;
        avg_time: number;
      }>>`
        SELECT
          url,
          MAX(title) as title,
          COUNT(*) as views,
          COUNT(DISTINCT visitor_id) as unique_views,
          COALESCE(AVG(view_time), 0) as avg_time
        FROM analytics_pageviews
        WHERE project_id = ${projectId}
          AND timestamp >= ${startDate}
          AND timestamp <= ${endDate}
        GROUP BY url
        ORDER BY views DESC
        LIMIT 20
      `,
      this.prisma.$queryRaw<Array<{
        url: string;
        entries: bigint;
        bounce_rate: number;
      }>>`
        SELECT
          entry_page as url,
          COUNT(*) as entries,
          COALESCE(AVG(CASE WHEN is_bounce THEN 1 ELSE 0 END) * 100, 0) as bounce_rate
        FROM analytics_sessions
        WHERE project_id = ${projectId}
          AND started_at >= ${startDate}
          AND started_at <= ${endDate}
        GROUP BY entry_page
        ORDER BY entries DESC
        LIMIT 10
      `,
      this.prisma.$queryRaw<Array<{
        url: string;
        exits: bigint;
        exit_rate: number;
      }>>`
        SELECT
          exit_page as url,
          COUNT(*) as exits,
          COALESCE(
            COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM analytics_sessions WHERE project_id = ${projectId}), 0),
            0
          ) as exit_rate
        FROM analytics_sessions
        WHERE project_id = ${projectId}
          AND started_at >= ${startDate}
          AND started_at <= ${endDate}
          AND exit_page IS NOT NULL
        GROUP BY exit_page
        ORDER BY exits DESC
        LIMIT 10
      `,
    ]);

    return {
      topPages: topPagesResult.map(r => ({
        url: r.url,
        title: r.title || r.url,
        views: Number(r.views),
        uniqueViews: Number(r.unique_views),
        avgTime: Math.round(Number(r.avg_time)),
      })),
      entryPages: entryPagesResult.map(r => ({
        url: r.url,
        entries: Number(r.entries),
        bounceRate: Math.round(Number(r.bounce_rate) * 100) / 100,
      })),
      exitPages: exitPagesResult.map(r => ({
        url: r.url,
        exits: Number(r.exits),
        exitRate: Math.round(Number(r.exit_rate) * 100) / 100,
      })),
    };
  }

  private async getEngagementMetrics(
    projectId: string,
    startDate: Date,
    endDate: Date
  ): Promise<DashboardMetrics['engagement']> {
    const result = await this.prisma.$queryRaw<Array<{
      avg_scroll_depth: number;
      avg_time_on_page: number;
      interaction_rate: number;
      returning_rate: number;
    }>>`
      WITH visitor_counts AS (
        SELECT
          visitor_id,
          COUNT(*) as session_count
        FROM analytics_sessions
        WHERE project_id = ${projectId}
          AND started_at >= ${startDate}
          AND started_at <= ${endDate}
        GROUP BY visitor_id
      )
      SELECT
        COALESCE(AVG(pv.scroll_depth), 0) as avg_scroll_depth,
        COALESCE(AVG(pv.view_time), 0) as avg_time_on_page,
        COALESCE(
          SUM(CASE WHEN s.events > 0 THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0),
          0
        ) as interaction_rate,
        COALESCE(
          (SELECT COUNT(*) FROM visitor_counts WHERE session_count > 1) * 100.0 /
          NULLIF((SELECT COUNT(*) FROM visitor_counts), 0),
          0
        ) as returning_rate
      FROM analytics_sessions s
      LEFT JOIN analytics_pageviews pv ON s.session_id = pv.session_id
      WHERE s.project_id = ${projectId}
        AND s.started_at >= ${startDate}
        AND s.started_at <= ${endDate}
    `;

    const row = result[0] || {
      avg_scroll_depth: 0,
      avg_time_on_page: 0,
      interaction_rate: 0,
      returning_rate: 0,
    };

    return {
      avgScrollDepth: Math.round(Number(row.avg_scroll_depth)),
      avgTimeOnPage: Math.round(Number(row.avg_time_on_page)),
      interactionRate: Math.round(Number(row.interaction_rate) * 100) / 100,
      returningVisitorRate: Math.round(Number(row.returning_rate) * 100) / 100,
    };
  }

  private async getDeviceMetrics(
    projectId: string,
    startDate: Date,
    endDate: Date
  ): Promise<DashboardMetrics['devices']> {
    const [browsersResult, osResult, deviceTypesResult, screenSizesResult] = await Promise.all([
      this.prisma.$queryRaw<Array<{ browser: string; visitors: bigint }>>`
        SELECT browser, COUNT(DISTINCT visitor_id) as visitors
        FROM analytics_sessions
        WHERE project_id = ${projectId}
          AND started_at >= ${startDate}
          AND started_at <= ${endDate}
        GROUP BY browser
        ORDER BY visitors DESC
        LIMIT 10
      `,
      this.prisma.$queryRaw<Array<{ os: string; visitors: bigint }>>`
        SELECT os, COUNT(DISTINCT visitor_id) as visitors
        FROM analytics_sessions
        WHERE project_id = ${projectId}
          AND started_at >= ${startDate}
          AND started_at <= ${endDate}
        GROUP BY os
        ORDER BY visitors DESC
        LIMIT 10
      `,
      this.prisma.$queryRaw<Array<{ device_type: string; visitors: bigint }>>`
        SELECT device_type, COUNT(DISTINCT visitor_id) as visitors
        FROM analytics_sessions
        WHERE project_id = ${projectId}
          AND started_at >= ${startDate}
          AND started_at <= ${endDate}
        GROUP BY device_type
        ORDER BY visitors DESC
      `,
      this.prisma.$queryRaw<Array<{ size: string; visitors: bigint }>>`
        SELECT
          CONCAT(screen_width, 'x', screen_height) as size,
          COUNT(DISTINCT visitor_id) as visitors
        FROM analytics_sessions
        WHERE project_id = ${projectId}
          AND started_at >= ${startDate}
          AND started_at <= ${endDate}
        GROUP BY screen_width, screen_height
        ORDER BY visitors DESC
        LIMIT 10
      `,
    ]);

    const totalBrowsers = browsersResult.reduce((sum, r) => sum + Number(r.visitors), 0);
    const totalOS = osResult.reduce((sum, r) => sum + Number(r.visitors), 0);
    const totalDevices = deviceTypesResult.reduce((sum, r) => sum + Number(r.visitors), 0);
    const totalScreens = screenSizesResult.reduce((sum, r) => sum + Number(r.visitors), 0);

    return {
      browsers: browsersResult.map(r => ({
        browser: r.browser || 'Unknown',
        visitors: Number(r.visitors),
        percentage: totalBrowsers > 0 ? Math.round((Number(r.visitors) / totalBrowsers) * 10000) / 100 : 0,
      })),
      operatingSystems: osResult.map(r => ({
        os: r.os || 'Unknown',
        visitors: Number(r.visitors),
        percentage: totalOS > 0 ? Math.round((Number(r.visitors) / totalOS) * 10000) / 100 : 0,
      })),
      deviceTypes: deviceTypesResult.map(r => ({
        type: r.device_type || 'Unknown',
        visitors: Number(r.visitors),
        percentage: totalDevices > 0 ? Math.round((Number(r.visitors) / totalDevices) * 10000) / 100 : 0,
      })),
      screenSizes: screenSizesResult.map(r => ({
        size: r.size || 'Unknown',
        visitors: Number(r.visitors),
        percentage: totalScreens > 0 ? Math.round((Number(r.visitors) / totalScreens) * 10000) / 100 : 0,
      })),
    };
  }

  private async getGeographyMetrics(
    projectId: string,
    startDate: Date,
    endDate: Date
  ): Promise<DashboardMetrics['geography']> {
    const [countriesResult, regionsResult, citiesResult] = await Promise.all([
      this.prisma.$queryRaw<Array<{ country: string; country_code: string; visitors: bigint }>>`
        SELECT country, country_code, COUNT(DISTINCT visitor_id) as visitors
        FROM analytics_sessions
        WHERE project_id = ${projectId}
          AND started_at >= ${startDate}
          AND started_at <= ${endDate}
        GROUP BY country, country_code
        ORDER BY visitors DESC
        LIMIT 20
      `,
      this.prisma.$queryRaw<Array<{ region: string; country: string; visitors: bigint }>>`
        SELECT region, country, COUNT(DISTINCT visitor_id) as visitors
        FROM analytics_sessions
        WHERE project_id = ${projectId}
          AND started_at >= ${startDate}
          AND started_at <= ${endDate}
        GROUP BY region, country
        ORDER BY visitors DESC
        LIMIT 20
      `,
      this.prisma.$queryRaw<Array<{ city: string; region: string; country: string; visitors: bigint }>>`
        SELECT city, region, country, COUNT(DISTINCT visitor_id) as visitors
        FROM analytics_sessions
        WHERE project_id = ${projectId}
          AND started_at >= ${startDate}
          AND started_at <= ${endDate}
        GROUP BY city, region, country
        ORDER BY visitors DESC
        LIMIT 20
      `,
    ]);

    const totalCountries = countriesResult.reduce((sum, r) => sum + Number(r.visitors), 0);

    return {
      countries: countriesResult.map(r => ({
        country: r.country || 'Unknown',
        countryCode: r.country_code || 'XX',
        visitors: Number(r.visitors),
        percentage: totalCountries > 0 ? Math.round((Number(r.visitors) / totalCountries) * 10000) / 100 : 0,
      })),
      regions: regionsResult.map(r => ({
        region: r.region || 'Unknown',
        country: r.country || 'Unknown',
        visitors: Number(r.visitors),
      })),
      cities: citiesResult.map(r => ({
        city: r.city || 'Unknown',
        region: r.region || 'Unknown',
        country: r.country || 'Unknown',
        visitors: Number(r.visitors),
      })),
    };
  }

  private async getRealtimeMetrics(
    projectId: string
  ): Promise<DashboardMetrics['realtime']> {
    const realtimeData = await this.getRealtimeData(projectId);

    return {
      activeVisitors: realtimeData.activeVisitors,
      activePages: realtimeData.activePages.map(p => ({
        url: p.url,
        visitors: p.visitors,
      })),
      recentEvents: realtimeData.recentEvents.map(e => ({
        eventId: this.generateId('evt'),
        projectId,
        sessionId: '',
        visitorId: '',
        eventType: e.eventType as TrackingEvent['eventType'],
        eventName: e.eventName,
        eventData: {},
        timestamp: e.timestamp,
        url: e.url,
        device: {} as DeviceInfo,
        geo: {} as GeoLocation,
      })),
    };
  }
}

export default AnalyticsTrackingService;

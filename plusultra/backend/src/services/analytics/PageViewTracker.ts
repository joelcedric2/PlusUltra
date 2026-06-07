/**
 * Page View Tracker
 *
 * Tracks page load events, calculates accurate view time (handles tab switches),
 * tracks scroll depth, records interaction events, and supports custom events.
 */

import { Redis } from 'ioredis';
import { DeviceInfo, GeoLocation } from './AnalyticsTrackingService';

// ============================================================================
// Type Definitions
// ============================================================================

export interface PageViewEvent {
  pageViewId: string;
  projectId: string;
  sessionId: string;
  visitorId: string;
  url: string;
  title: string;
  referrer: string;
  timestamp: Date;
  device: DeviceInfo;
  geo: GeoLocation;
}

export interface EngagementMetrics {
  viewTime: number; // Total seconds spent on page
  activeTime: number; // Time page was in foreground
  scrollDepth: number; // Max scroll depth percentage (0-100)
  scrollEvents: number; // Number of scroll events
  interactions: number; // Total interaction count
  clicks: number;
  formInteractions: number;
  mediaPlays: number;
  copyEvents: number;
  isEngaged: boolean; // Met engagement threshold
  reachedBottom: boolean; // Scrolled to bottom
}

export interface PageInteraction {
  interactionId: string;
  pageViewId: string;
  type: InteractionType;
  target: string; // CSS selector or element identifier
  targetText?: string;
  targetHref?: string;
  timestamp: Date;
  positionX?: number;
  positionY?: number;
  metadata?: Record<string, unknown>;
}

export type InteractionType =
  | 'click'
  | 'form_start'
  | 'form_field'
  | 'form_submit'
  | 'form_abandon'
  | 'scroll'
  | 'scroll_depth'
  | 'media_play'
  | 'media_pause'
  | 'media_complete'
  | 'copy'
  | 'print'
  | 'share'
  | 'download'
  | 'error'
  | 'rage_click'
  | 'dead_click'
  | 'custom';

export interface ScrollData {
  depth: number; // Current scroll percentage (0-100)
  maxDepth: number; // Maximum scroll depth reached
  direction: 'up' | 'down';
  velocity: number; // Pixels per second
  timestamp: Date;
}

export interface VisibilityChange {
  state: 'visible' | 'hidden';
  timestamp: Date;
  duration?: number; // Time in previous state
}

export interface PagePerformance {
  pageViewId: string;
  loadTime: number; // Total page load time (ms)
  domContentLoaded: number;
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  firstInputDelay: number;
  cumulativeLayoutShift: number;
  timeToInteractive: number;
  dnsLookup: number;
  tcpConnection: number;
  serverResponse: number;
  domParsing: number;
  resourceLoading: number;
}

export interface CustomEvent {
  eventId: string;
  pageViewId: string;
  sessionId: string;
  projectId: string;
  eventName: string;
  eventCategory: string;
  eventLabel?: string;
  eventValue?: number;
  properties: Record<string, unknown>;
  timestamp: Date;
}

export interface RealTimePageData {
  url: string;
  title: string;
  activeVisitors: number;
  avgTimeOnPage: number;
  avgScrollDepth: number;
  recentInteractions: PageInteraction[];
}

// ============================================================================
// Page View Tracker
// ============================================================================

export class PageViewTracker {
  private redis: Redis;

  // Redis key prefixes
  private readonly KEYS = {
    PAGE_VIEW: 'pv:',
    ENGAGEMENT: 'engagement:',
    INTERACTIONS: 'interactions:',
    SCROLL: 'scroll:',
    VISIBILITY: 'visibility:',
    PERFORMANCE: 'performance:',
    REALTIME_PAGES: 'realtime:pages:',
  };

  // Configuration
  private readonly ENGAGEMENT_TIME_THRESHOLD = 10; // seconds to be considered engaged
  private readonly SCROLL_DEPTH_THRESHOLD = 75; // percentage to be considered engaged
  private readonly PAGE_VIEW_TTL = 3600; // 1 hour TTL for page view data
  private readonly SCROLL_MILESTONE_DEPTHS = [25, 50, 75, 90, 100];

  constructor(redis: Redis) {
    this.redis = redis;
  }

  // ============================================================================
  // Page View Tracking
  // ============================================================================

  /**
   * Track a new page view
   */
  async trackPageView(
    projectId: string,
    sessionId: string,
    visitorId: string,
    url: string,
    title: string,
    referrer: string,
    device: DeviceInfo,
    geo: GeoLocation
  ): Promise<PageViewEvent> {
    const pageViewId = this.generateId('pv');
    const now = new Date();

    const pageView: PageViewEvent = {
      pageViewId,
      projectId,
      sessionId,
      visitorId,
      url,
      title,
      referrer,
      timestamp: now,
      device,
      geo,
    };

    // Initialize engagement metrics
    const engagement: EngagementMetrics = {
      viewTime: 0,
      activeTime: 0,
      scrollDepth: 0,
      scrollEvents: 0,
      interactions: 0,
      clicks: 0,
      formInteractions: 0,
      mediaPlays: 0,
      copyEvents: 0,
      isEngaged: false,
      reachedBottom: false,
    };

    // Store page view and initial engagement in Redis
    await Promise.all([
      this.redis.setex(
        `${this.KEYS.PAGE_VIEW}${pageViewId}`,
        this.PAGE_VIEW_TTL,
        JSON.stringify(pageView)
      ),
      this.redis.setex(
        `${this.KEYS.ENGAGEMENT}${pageViewId}`,
        this.PAGE_VIEW_TTL,
        JSON.stringify(engagement)
      ),
      this.updateRealtimePageTracking(projectId, url, title, 'enter'),
    ]);

    return pageView;
  }

  /**
   * Get page view data
   */
  async getPageView(pageViewId: string): Promise<PageViewEvent | null> {
    const data = await this.redis.get(`${this.KEYS.PAGE_VIEW}${pageViewId}`);
    return data ? JSON.parse(data) : null;
  }

  // ============================================================================
  // Engagement Tracking
  // ============================================================================

  /**
   * Update engagement metrics for a page view
   */
  async updateEngagement(
    sessionId: string,
    url: string,
    metrics: Partial<EngagementMetrics>
  ): Promise<EngagementMetrics | null> {
    // Find the page view ID from session and URL
    const pageViewId = await this.findPageViewId(sessionId, url);
    if (!pageViewId) return null;

    const engagementKey = `${this.KEYS.ENGAGEMENT}${pageViewId}`;
    const data = await this.redis.get(engagementKey);

    if (!data) return null;

    const engagement: EngagementMetrics = JSON.parse(data);

    // Update metrics
    if (metrics.viewTime !== undefined) {
      engagement.viewTime = metrics.viewTime;
    }
    if (metrics.activeTime !== undefined) {
      engagement.activeTime = metrics.activeTime;
    }
    if (metrics.scrollDepth !== undefined) {
      engagement.scrollDepth = Math.max(engagement.scrollDepth, metrics.scrollDepth);
      if (metrics.scrollDepth >= 95) {
        engagement.reachedBottom = true;
      }
    }
    if (metrics.scrollEvents !== undefined) {
      engagement.scrollEvents = metrics.scrollEvents;
    }
    if (metrics.interactions !== undefined) {
      engagement.interactions = metrics.interactions;
    }
    if (metrics.clicks !== undefined) {
      engagement.clicks = metrics.clicks;
    }
    if (metrics.formInteractions !== undefined) {
      engagement.formInteractions = metrics.formInteractions;
    }
    if (metrics.mediaPlays !== undefined) {
      engagement.mediaPlays = metrics.mediaPlays;
    }
    if (metrics.copyEvents !== undefined) {
      engagement.copyEvents = metrics.copyEvents;
    }

    // Check engagement threshold
    engagement.isEngaged = this.checkEngagement(engagement);

    await this.redis.setex(engagementKey, this.PAGE_VIEW_TTL, JSON.stringify(engagement));

    return engagement;
  }

  /**
   * Get engagement metrics for a page view
   */
  async getEngagement(pageViewId: string): Promise<EngagementMetrics | null> {
    const data = await this.redis.get(`${this.KEYS.ENGAGEMENT}${pageViewId}`);
    return data ? JSON.parse(data) : null;
  }

  /**
   * Calculate time spent on page with visibility handling
   */
  async trackViewTime(
    pageViewId: string,
    startTime: Date,
    currentTime: Date,
    wasVisible: boolean
  ): Promise<void> {
    const engagement = await this.getEngagement(pageViewId);
    if (!engagement) return;

    const elapsed = Math.floor((currentTime.getTime() - startTime.getTime()) / 1000);

    engagement.viewTime = elapsed;
    if (wasVisible) {
      engagement.activeTime = elapsed;
    }

    await this.redis.setex(
      `${this.KEYS.ENGAGEMENT}${pageViewId}`,
      this.PAGE_VIEW_TTL,
      JSON.stringify(engagement)
    );
  }

  // ============================================================================
  // Scroll Tracking
  // ============================================================================

  /**
   * Track scroll event
   */
  async trackScroll(
    pageViewId: string,
    scrollData: ScrollData
  ): Promise<void> {
    const scrollKey = `${this.KEYS.SCROLL}${pageViewId}`;

    // Store scroll event
    await this.redis.lpush(scrollKey, JSON.stringify(scrollData));
    await this.redis.ltrim(scrollKey, 0, 99); // Keep last 100 scroll events
    await this.redis.expire(scrollKey, this.PAGE_VIEW_TTL);

    // Update engagement metrics with max scroll depth
    const engagement = await this.getEngagement(pageViewId);
    if (engagement) {
      engagement.scrollDepth = Math.max(engagement.scrollDepth, scrollData.maxDepth);
      engagement.scrollEvents++;
      if (scrollData.maxDepth >= 95) {
        engagement.reachedBottom = true;
      }

      await this.redis.setex(
        `${this.KEYS.ENGAGEMENT}${pageViewId}`,
        this.PAGE_VIEW_TTL,
        JSON.stringify(engagement)
      );
    }
  }

  /**
   * Track scroll depth milestones
   */
  async trackScrollMilestone(
    pageViewId: string,
    depth: number
  ): Promise<number[]> {
    const milestoneKey = `${this.KEYS.SCROLL}${pageViewId}:milestones`;
    const reachedMilestones: number[] = [];

    // Check which milestones have been reached
    const storedMilestones = await this.redis.get(milestoneKey);
    const previousMilestones: Set<number> = new Set(
      storedMilestones ? JSON.parse(storedMilestones) : []
    );

    for (const milestone of this.SCROLL_MILESTONE_DEPTHS) {
      if (depth >= milestone && !previousMilestones.has(milestone)) {
        reachedMilestones.push(milestone);
        previousMilestones.add(milestone);
      }
    }

    if (reachedMilestones.length > 0) {
      await this.redis.setex(
        milestoneKey,
        this.PAGE_VIEW_TTL,
        JSON.stringify(Array.from(previousMilestones))
      );
    }

    return reachedMilestones;
  }

  /**
   * Get scroll analytics for a page view
   */
  async getScrollAnalytics(pageViewId: string): Promise<{
    maxDepth: number;
    avgDepth: number;
    scrollCount: number;
    milestonesReached: number[];
  }> {
    const scrollKey = `${this.KEYS.SCROLL}${pageViewId}`;
    const milestoneKey = `${this.KEYS.SCROLL}${pageViewId}:milestones`;

    const [scrollData, milestoneData] = await Promise.all([
      this.redis.lrange(scrollKey, 0, -1),
      this.redis.get(milestoneKey),
    ]);

    const scrollEvents: ScrollData[] = scrollData.map(d => JSON.parse(d));
    const milestones: number[] = milestoneData ? JSON.parse(milestoneData) : [];

    const depths = scrollEvents.map(s => s.depth);
    const maxDepth = depths.length > 0 ? Math.max(...depths) : 0;
    const avgDepth = depths.length > 0
      ? depths.reduce((a, b) => a + b, 0) / depths.length
      : 0;

    return {
      maxDepth,
      avgDepth: Math.round(avgDepth),
      scrollCount: scrollEvents.length,
      milestonesReached: milestones,
    };
  }

  // ============================================================================
  // Interaction Tracking
  // ============================================================================

  /**
   * Track a page interaction
   */
  async trackInteraction(
    pageViewId: string,
    interaction: Omit<PageInteraction, 'interactionId' | 'pageViewId'>
  ): Promise<PageInteraction> {
    const fullInteraction: PageInteraction = {
      interactionId: this.generateId('int'),
      pageViewId,
      ...interaction,
    };

    // Store interaction
    const interactionKey = `${this.KEYS.INTERACTIONS}${pageViewId}`;
    await this.redis.lpush(interactionKey, JSON.stringify(fullInteraction));
    await this.redis.ltrim(interactionKey, 0, 499); // Keep last 500 interactions
    await this.redis.expire(interactionKey, this.PAGE_VIEW_TTL);

    // Update engagement metrics
    const engagement = await this.getEngagement(pageViewId);
    if (engagement) {
      engagement.interactions++;

      switch (interaction.type) {
        case 'click':
        case 'rage_click':
        case 'dead_click':
          engagement.clicks++;
          break;
        case 'form_start':
        case 'form_field':
        case 'form_submit':
        case 'form_abandon':
          engagement.formInteractions++;
          break;
        case 'media_play':
          engagement.mediaPlays++;
          break;
        case 'copy':
          engagement.copyEvents++;
          break;
      }

      await this.redis.setex(
        `${this.KEYS.ENGAGEMENT}${pageViewId}`,
        this.PAGE_VIEW_TTL,
        JSON.stringify(engagement)
      );
    }

    return fullInteraction;
  }

  /**
   * Track click event
   */
  async trackClick(
    pageViewId: string,
    target: string,
    targetText?: string,
    targetHref?: string,
    position?: { x: number; y: number }
  ): Promise<PageInteraction> {
    return this.trackInteraction(pageViewId, {
      type: 'click',
      target,
      targetText,
      targetHref,
      timestamp: new Date(),
      positionX: position?.x,
      positionY: position?.y,
    });
  }

  /**
   * Track rage click (multiple rapid clicks in same area)
   */
  async trackRageClick(
    pageViewId: string,
    target: string,
    clickCount: number,
    position?: { x: number; y: number }
  ): Promise<PageInteraction> {
    return this.trackInteraction(pageViewId, {
      type: 'rage_click',
      target,
      timestamp: new Date(),
      positionX: position?.x,
      positionY: position?.y,
      metadata: { clickCount },
    });
  }

  /**
   * Track dead click (click on non-interactive element)
   */
  async trackDeadClick(
    pageViewId: string,
    target: string,
    position?: { x: number; y: number }
  ): Promise<PageInteraction> {
    return this.trackInteraction(pageViewId, {
      type: 'dead_click',
      target,
      timestamp: new Date(),
      positionX: position?.x,
      positionY: position?.y,
    });
  }

  /**
   * Track form interaction
   */
  async trackFormInteraction(
    pageViewId: string,
    type: 'form_start' | 'form_field' | 'form_submit' | 'form_abandon',
    formId: string,
    fieldName?: string,
    metadata?: Record<string, unknown>
  ): Promise<PageInteraction> {
    return this.trackInteraction(pageViewId, {
      type,
      target: formId,
      timestamp: new Date(),
      metadata: {
        fieldName,
        ...metadata,
      },
    });
  }

  /**
   * Track media interaction
   */
  async trackMediaInteraction(
    pageViewId: string,
    type: 'media_play' | 'media_pause' | 'media_complete',
    mediaId: string,
    currentTime?: number,
    duration?: number
  ): Promise<PageInteraction> {
    return this.trackInteraction(pageViewId, {
      type,
      target: mediaId,
      timestamp: new Date(),
      metadata: {
        currentTime,
        duration,
        percentComplete: duration && currentTime ? (currentTime / duration) * 100 : undefined,
      },
    });
  }

  /**
   * Get all interactions for a page view
   */
  async getInteractions(pageViewId: string): Promise<PageInteraction[]> {
    const data = await this.redis.lrange(
      `${this.KEYS.INTERACTIONS}${pageViewId}`,
      0,
      -1
    );
    return data.map(d => JSON.parse(d));
  }

  // ============================================================================
  // Visibility Tracking
  // ============================================================================

  /**
   * Track visibility change (tab switch, minimize, etc.)
   */
  async trackVisibilityChange(
    pageViewId: string,
    state: 'visible' | 'hidden'
  ): Promise<void> {
    const visibilityKey = `${this.KEYS.VISIBILITY}${pageViewId}`;
    const now = new Date();

    // Get previous visibility state
    const previousData = await this.redis.lindex(visibilityKey, 0);
    let duration: number | undefined;

    if (previousData) {
      const previous: VisibilityChange = JSON.parse(previousData);
      duration = Math.floor(
        (now.getTime() - new Date(previous.timestamp).getTime()) / 1000
      );
    }

    const change: VisibilityChange = {
      state,
      timestamp: now,
      duration,
    };

    await this.redis.lpush(visibilityKey, JSON.stringify(change));
    await this.redis.ltrim(visibilityKey, 0, 99);
    await this.redis.expire(visibilityKey, this.PAGE_VIEW_TTL);

    // Update active time in engagement if becoming hidden
    if (state === 'hidden' && duration !== undefined) {
      const engagement = await this.getEngagement(pageViewId);
      if (engagement) {
        engagement.activeTime += duration;
        await this.redis.setex(
          `${this.KEYS.ENGAGEMENT}${pageViewId}`,
          this.PAGE_VIEW_TTL,
          JSON.stringify(engagement)
        );
      }
    }
  }

  /**
   * Get visibility history for a page view
   */
  async getVisibilityHistory(pageViewId: string): Promise<VisibilityChange[]> {
    const data = await this.redis.lrange(
      `${this.KEYS.VISIBILITY}${pageViewId}`,
      0,
      -1
    );
    return data.map(d => JSON.parse(d));
  }

  /**
   * Calculate total active time from visibility history
   */
  async calculateActiveTime(pageViewId: string): Promise<number> {
    const history = await this.getVisibilityHistory(pageViewId);
    let activeTime = 0;

    for (const change of history) {
      if (change.state === 'hidden' && change.duration) {
        activeTime += change.duration;
      }
    }

    // Add current visible time if page is currently visible
    if (history.length > 0 && history[0].state === 'visible') {
      const elapsed = Math.floor(
        (Date.now() - new Date(history[0].timestamp).getTime()) / 1000
      );
      activeTime += elapsed;
    }

    return activeTime;
  }

  // ============================================================================
  // Performance Tracking
  // ============================================================================

  /**
   * Track page performance metrics
   */
  async trackPerformance(
    pageViewId: string,
    performance: Omit<PagePerformance, 'pageViewId'>
  ): Promise<void> {
    const fullPerformance: PagePerformance = {
      pageViewId,
      ...performance,
    };

    await this.redis.setex(
      `${this.KEYS.PERFORMANCE}${pageViewId}`,
      this.PAGE_VIEW_TTL,
      JSON.stringify(fullPerformance)
    );
  }

  /**
   * Get performance metrics for a page view
   */
  async getPerformance(pageViewId: string): Promise<PagePerformance | null> {
    const data = await this.redis.get(`${this.KEYS.PERFORMANCE}${pageViewId}`);
    return data ? JSON.parse(data) : null;
  }

  // ============================================================================
  // Custom Events
  // ============================================================================

  /**
   * Track a custom event
   */
  async trackCustomEvent(
    pageViewId: string,
    sessionId: string,
    projectId: string,
    eventName: string,
    eventCategory: string,
    properties: Record<string, unknown> = {},
    eventLabel?: string,
    eventValue?: number
  ): Promise<CustomEvent> {
    const event: CustomEvent = {
      eventId: this.generateId('ce'),
      pageViewId,
      sessionId,
      projectId,
      eventName,
      eventCategory,
      eventLabel,
      eventValue,
      properties,
      timestamp: new Date(),
    };

    // Store as an interaction as well
    await this.trackInteraction(pageViewId, {
      type: 'custom',
      target: `${eventCategory}:${eventName}`,
      timestamp: new Date(),
      metadata: {
        eventLabel,
        eventValue,
        ...properties,
      },
    });

    return event;
  }

  // ============================================================================
  // Real-time Page Tracking
  // ============================================================================

  /**
   * Update real-time page tracking
   */
  private async updateRealtimePageTracking(
    projectId: string,
    url: string,
    title: string,
    action: 'enter' | 'exit'
  ): Promise<void> {
    const realtimeKey = `${this.KEYS.REALTIME_PAGES}${projectId}`;
    const pageData = JSON.stringify({ url, title, timestamp: Date.now() });

    if (action === 'enter') {
      await this.redis.hincrby(realtimeKey, url, 1);
      await this.redis.expire(realtimeKey, 300); // 5 minute TTL
    } else {
      await this.redis.hincrby(realtimeKey, url, -1);
      // Remove if count reaches 0
      const count = await this.redis.hget(realtimeKey, url);
      if (count && parseInt(count, 10) <= 0) {
        await this.redis.hdel(realtimeKey, url);
      }
    }
  }

  /**
   * Get real-time page data
   */
  async getRealtimePageData(projectId: string): Promise<RealTimePageData[]> {
    const realtimeKey = `${this.KEYS.REALTIME_PAGES}${projectId}`;
    const pageData = await this.redis.hgetall(realtimeKey);

    return Object.entries(pageData)
      .map(([url, count]) => ({
        url,
        title: '', // Would need to store titles separately
        activeVisitors: parseInt(count, 10),
        avgTimeOnPage: 0, // Would need additional calculation
        avgScrollDepth: 0, // Would need additional calculation
        recentInteractions: [],
      }))
      .filter(p => p.activeVisitors > 0)
      .sort((a, b) => b.activeVisitors - a.activeVisitors);
  }

  /**
   * Track page exit
   */
  async trackPageExit(
    pageViewId: string,
    projectId: string,
    url: string,
    title: string
  ): Promise<void> {
    await this.updateRealtimePageTracking(projectId, url, title, 'exit');
  }

  // ============================================================================
  // Private Helper Methods
  // ============================================================================

  private generateId(prefix: string): string {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
  }

  private checkEngagement(engagement: EngagementMetrics): boolean {
    // Considered engaged if any of these conditions are met
    return (
      engagement.viewTime >= this.ENGAGEMENT_TIME_THRESHOLD ||
      engagement.scrollDepth >= this.SCROLL_DEPTH_THRESHOLD ||
      engagement.interactions >= 2 ||
      engagement.formInteractions >= 1 ||
      engagement.mediaPlays >= 1
    );
  }

  private async findPageViewId(sessionId: string, url: string): Promise<string | null> {
    // This would typically query a session store or index
    // For now, we'll scan Redis keys (not ideal for production with many keys)
    const pattern = `${this.KEYS.PAGE_VIEW}pv_*`;
    const keys = await this.redis.keys(pattern);

    for (const key of keys.slice(0, 100)) { // Limit to avoid performance issues
      const data = await this.redis.get(key);
      if (data) {
        const pageView: PageViewEvent = JSON.parse(data);
        if (pageView.sessionId === sessionId && pageView.url === url) {
          return pageView.pageViewId;
        }
      }
    }

    return null;
  }
}

export default PageViewTracker;

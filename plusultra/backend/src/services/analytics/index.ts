/**
 * Analytics Services Index
 *
 * Export all analytics-related services and types.
 */

// Main tracking service
export { AnalyticsTrackingService } from './AnalyticsTrackingService';
export type {
  DeviceInfo,
  GeoLocation,
  SessionData,
  PageVisit,
  TrackingEvent,
  DashboardMetrics,
  RealtimeData,
} from './AnalyticsTrackingService';

// Traffic source tracking
export { TrafficSourceTracker } from './TrafficSourceTracker';
export type {
  UTMParameters,
  TrafficSource,
  TrafficChannel,
  SearchEngineConfig,
  SocialNetworkConfig,
  ChannelGrouping,
  ChannelRule,
} from './TrafficSourceTracker';

// Page view tracking
export { PageViewTracker } from './PageViewTracker';
export type {
  PageViewEvent,
  EngagementMetrics,
  PageInteraction,
  InteractionType,
  ScrollData,
  VisibilityChange,
  PagePerformance,
  CustomEvent,
  RealTimePageData,
} from './PageViewTracker';

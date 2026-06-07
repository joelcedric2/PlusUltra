-- Analytics Tables Migration
-- Run this migration to create the necessary tables for the analytics tracking system

-- ============================================================================
-- Sessions Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS analytics_sessions (
    session_id VARCHAR(64) PRIMARY KEY,
    visitor_id VARCHAR(64) NOT NULL,
    project_id VARCHAR(64) NOT NULL,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    ended_at TIMESTAMP WITH TIME ZONE,
    duration INTEGER DEFAULT 0, -- seconds
    page_views INTEGER DEFAULT 0,
    events INTEGER DEFAULT 0,
    is_bounce BOOLEAN DEFAULT TRUE,
    is_engaged BOOLEAN DEFAULT FALSE,
    entry_page TEXT NOT NULL,
    exit_page TEXT,

    -- Traffic source information
    traffic_source VARCHAR(255),
    traffic_medium VARCHAR(100),
    traffic_campaign VARCHAR(255),
    traffic_content VARCHAR(255),
    traffic_term VARCHAR(255),

    -- Device information
    device_type VARCHAR(20), -- desktop, mobile, tablet, bot
    browser VARCHAR(100),
    browser_version VARCHAR(50),
    os VARCHAR(100),
    os_version VARCHAR(50),
    screen_width INTEGER,
    screen_height INTEGER,

    -- Geographic information
    country VARCHAR(100),
    country_code CHAR(2),
    region VARCHAR(100),
    city VARCHAR(100),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for sessions
CREATE INDEX IF NOT EXISTS idx_sessions_project_started
    ON analytics_sessions(project_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_visitor
    ON analytics_sessions(visitor_id);
CREATE INDEX IF NOT EXISTS idx_sessions_traffic_source
    ON analytics_sessions(project_id, traffic_source);
CREATE INDEX IF NOT EXISTS idx_sessions_country
    ON analytics_sessions(project_id, country_code);
CREATE INDEX IF NOT EXISTS idx_sessions_device
    ON analytics_sessions(project_id, device_type);
CREATE INDEX IF NOT EXISTS idx_sessions_is_bounce
    ON analytics_sessions(project_id, is_bounce);

-- ============================================================================
-- Page Views Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS analytics_pageviews (
    pageview_id VARCHAR(64) PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL REFERENCES analytics_sessions(session_id),
    visitor_id VARCHAR(64) NOT NULL,
    project_id VARCHAR(64) NOT NULL,
    url TEXT NOT NULL,
    title TEXT,
    referrer TEXT,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    view_time INTEGER DEFAULT 0, -- seconds spent on page
    scroll_depth INTEGER DEFAULT 0, -- 0-100 percentage

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for pageviews
CREATE INDEX IF NOT EXISTS idx_pageviews_project_timestamp
    ON analytics_pageviews(project_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_pageviews_session
    ON analytics_pageviews(session_id);
CREATE INDEX IF NOT EXISTS idx_pageviews_url
    ON analytics_pageviews(project_id, url);
CREATE INDEX IF NOT EXISTS idx_pageviews_visitor
    ON analytics_pageviews(visitor_id);

-- ============================================================================
-- Events Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS analytics_events (
    event_id VARCHAR(64) PRIMARY KEY,
    session_id VARCHAR(64) NOT NULL REFERENCES analytics_sessions(session_id),
    visitor_id VARCHAR(64) NOT NULL,
    project_id VARCHAR(64) NOT NULL,
    event_type VARCHAR(50) NOT NULL, -- pageview, click, scroll, form, custom, error, performance
    event_name VARCHAR(255) NOT NULL,
    event_data JSONB DEFAULT '{}',
    url TEXT,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for events
CREATE INDEX IF NOT EXISTS idx_events_project_timestamp
    ON analytics_events(project_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_events_session
    ON analytics_events(session_id);
CREATE INDEX IF NOT EXISTS idx_events_type
    ON analytics_events(project_id, event_type);
CREATE INDEX IF NOT EXISTS idx_events_name
    ON analytics_events(project_id, event_name);

-- ============================================================================
-- Visitors Table (for tracking returning visitors)
-- ============================================================================

CREATE TABLE IF NOT EXISTS analytics_visitors (
    visitor_id VARCHAR(64) NOT NULL,
    project_id VARCHAR(64) NOT NULL,
    first_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    last_seen_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
    total_sessions INTEGER DEFAULT 1,
    total_pageviews INTEGER DEFAULT 0,
    total_events INTEGER DEFAULT 0,

    -- First session attribution
    first_traffic_source VARCHAR(255),
    first_traffic_medium VARCHAR(100),
    first_traffic_campaign VARCHAR(255),
    first_entry_page TEXT,

    -- Device and geo at first visit
    first_device_type VARCHAR(20),
    first_browser VARCHAR(100),
    first_country VARCHAR(100),
    first_country_code CHAR(2),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    PRIMARY KEY (visitor_id, project_id)
);

-- Indexes for visitors
CREATE INDEX IF NOT EXISTS idx_visitors_project_last_seen
    ON analytics_visitors(project_id, last_seen_at DESC);
CREATE INDEX IF NOT EXISTS idx_visitors_first_source
    ON analytics_visitors(project_id, first_traffic_source);

-- ============================================================================
-- Page Performance Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS analytics_page_performance (
    id SERIAL PRIMARY KEY,
    pageview_id VARCHAR(64) REFERENCES analytics_pageviews(pageview_id),
    project_id VARCHAR(64) NOT NULL,
    url TEXT NOT NULL,
    load_time INTEGER, -- milliseconds
    dom_content_loaded INTEGER,
    first_contentful_paint INTEGER,
    largest_contentful_paint INTEGER,
    first_input_delay INTEGER,
    cumulative_layout_shift FLOAT,
    time_to_interactive INTEGER,
    dns_lookup INTEGER,
    tcp_connection INTEGER,
    server_response INTEGER,
    dom_parsing INTEGER,
    resource_loading INTEGER,
    timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_performance_project_timestamp
    ON analytics_page_performance(project_id, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_performance_url
    ON analytics_page_performance(project_id, url);
CREATE INDEX IF NOT EXISTS idx_performance_load_time
    ON analytics_page_performance(project_id, load_time);

-- ============================================================================
-- Daily Aggregates Table (for faster dashboard queries)
-- ============================================================================

CREATE TABLE IF NOT EXISTS analytics_daily_aggregates (
    id SERIAL PRIMARY KEY,
    project_id VARCHAR(64) NOT NULL,
    date DATE NOT NULL,

    -- Session metrics
    total_sessions INTEGER DEFAULT 0,
    unique_visitors INTEGER DEFAULT 0,
    new_visitors INTEGER DEFAULT 0,
    returning_visitors INTEGER DEFAULT 0,

    -- Engagement metrics
    total_pageviews INTEGER DEFAULT 0,
    avg_session_duration FLOAT DEFAULT 0,
    avg_pages_per_session FLOAT DEFAULT 0,
    bounce_rate FLOAT DEFAULT 0,
    engagement_rate FLOAT DEFAULT 0,

    -- Traffic source breakdown
    direct_sessions INTEGER DEFAULT 0,
    organic_sessions INTEGER DEFAULT 0,
    referral_sessions INTEGER DEFAULT 0,
    social_sessions INTEGER DEFAULT 0,
    email_sessions INTEGER DEFAULT 0,
    paid_sessions INTEGER DEFAULT 0,

    -- Device breakdown
    desktop_sessions INTEGER DEFAULT 0,
    mobile_sessions INTEGER DEFAULT 0,
    tablet_sessions INTEGER DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(project_id, date)
);

-- Indexes for aggregates
CREATE INDEX IF NOT EXISTS idx_aggregates_project_date
    ON analytics_daily_aggregates(project_id, date DESC);

-- ============================================================================
-- Campaign Performance Table
-- ============================================================================

CREATE TABLE IF NOT EXISTS analytics_campaign_metrics (
    id SERIAL PRIMARY KEY,
    project_id VARCHAR(64) NOT NULL,
    date DATE NOT NULL,
    campaign VARCHAR(255) NOT NULL,
    source VARCHAR(255),
    medium VARCHAR(100),

    sessions INTEGER DEFAULT 0,
    unique_visitors INTEGER DEFAULT 0,
    pageviews INTEGER DEFAULT 0,
    avg_session_duration FLOAT DEFAULT 0,
    bounce_rate FLOAT DEFAULT 0,
    conversions INTEGER DEFAULT 0,

    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

    UNIQUE(project_id, date, campaign, source, medium)
);

-- Indexes for campaigns
CREATE INDEX IF NOT EXISTS idx_campaigns_project_date
    ON analytics_campaign_metrics(project_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_campaigns_campaign
    ON analytics_campaign_metrics(campaign);

-- ============================================================================
-- Trigger Functions
-- ============================================================================

-- Function to update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply triggers
DROP TRIGGER IF EXISTS update_sessions_updated_at ON analytics_sessions;
CREATE TRIGGER update_sessions_updated_at
    BEFORE UPDATE ON analytics_sessions
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_visitors_updated_at ON analytics_visitors;
CREATE TRIGGER update_visitors_updated_at
    BEFORE UPDATE ON analytics_visitors
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_aggregates_updated_at ON analytics_daily_aggregates;
CREATE TRIGGER update_aggregates_updated_at
    BEFORE UPDATE ON analytics_daily_aggregates
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_campaigns_updated_at ON analytics_campaign_metrics;
CREATE TRIGGER update_campaigns_updated_at
    BEFORE UPDATE ON analytics_campaign_metrics
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Views for Common Queries
-- ============================================================================

-- Active visitors in the last 5 minutes (for realtime)
CREATE OR REPLACE VIEW v_active_sessions AS
SELECT
    s.*,
    EXTRACT(EPOCH FROM (NOW() - s.started_at))::INTEGER as active_seconds
FROM analytics_sessions s
WHERE s.ended_at IS NULL
    AND s.started_at > NOW() - INTERVAL '30 minutes';

-- Daily overview metrics
CREATE OR REPLACE VIEW v_daily_metrics AS
SELECT
    project_id,
    DATE(started_at) as date,
    COUNT(*) as sessions,
    COUNT(DISTINCT visitor_id) as unique_visitors,
    SUM(page_views) as total_pageviews,
    AVG(duration)::INTEGER as avg_duration,
    AVG(CASE WHEN is_bounce THEN 1 ELSE 0 END)::FLOAT * 100 as bounce_rate,
    AVG(CASE WHEN is_engaged THEN 1 ELSE 0 END)::FLOAT * 100 as engagement_rate,
    AVG(page_views)::FLOAT as pages_per_session
FROM analytics_sessions
GROUP BY project_id, DATE(started_at);

-- Traffic source summary
CREATE OR REPLACE VIEW v_traffic_sources AS
SELECT
    project_id,
    DATE(started_at) as date,
    traffic_source,
    traffic_medium,
    COUNT(*) as sessions,
    COUNT(DISTINCT visitor_id) as unique_visitors,
    AVG(duration)::INTEGER as avg_duration,
    AVG(CASE WHEN is_bounce THEN 1 ELSE 0 END)::FLOAT * 100 as bounce_rate
FROM analytics_sessions
GROUP BY project_id, DATE(started_at), traffic_source, traffic_medium;

-- Top pages summary
CREATE OR REPLACE VIEW v_top_pages AS
SELECT
    project_id,
    url,
    MAX(title) as title,
    COUNT(*) as views,
    COUNT(DISTINCT visitor_id) as unique_views,
    AVG(view_time)::INTEGER as avg_time
FROM analytics_pageviews
GROUP BY project_id, url;

-- ============================================================================
-- Scheduled Aggregation Function
-- ============================================================================

-- Function to aggregate daily metrics (run via cron job)
CREATE OR REPLACE FUNCTION aggregate_daily_analytics(target_date DATE DEFAULT CURRENT_DATE - INTERVAL '1 day')
RETURNS VOID AS $$
BEGIN
    INSERT INTO analytics_daily_aggregates (
        project_id, date,
        total_sessions, unique_visitors, new_visitors, returning_visitors,
        total_pageviews, avg_session_duration, avg_pages_per_session, bounce_rate, engagement_rate,
        direct_sessions, organic_sessions, referral_sessions, social_sessions, email_sessions, paid_sessions,
        desktop_sessions, mobile_sessions, tablet_sessions
    )
    SELECT
        s.project_id,
        target_date,
        COUNT(*),
        COUNT(DISTINCT s.visitor_id),
        COUNT(DISTINCT CASE WHEN v.total_sessions = 1 THEN s.visitor_id END),
        COUNT(DISTINCT CASE WHEN v.total_sessions > 1 THEN s.visitor_id END),
        SUM(s.page_views),
        AVG(s.duration),
        AVG(s.page_views),
        AVG(CASE WHEN s.is_bounce THEN 1 ELSE 0 END) * 100,
        AVG(CASE WHEN s.is_engaged THEN 1 ELSE 0 END) * 100,
        SUM(CASE WHEN s.traffic_source = 'direct' THEN 1 ELSE 0 END),
        SUM(CASE WHEN s.traffic_medium = 'organic' THEN 1 ELSE 0 END),
        SUM(CASE WHEN s.traffic_medium = 'referral' THEN 1 ELSE 0 END),
        SUM(CASE WHEN s.traffic_medium = 'social' THEN 1 ELSE 0 END),
        SUM(CASE WHEN s.traffic_medium = 'email' THEN 1 ELSE 0 END),
        SUM(CASE WHEN s.traffic_medium IN ('cpc', 'ppc', 'paid') THEN 1 ELSE 0 END),
        SUM(CASE WHEN s.device_type = 'desktop' THEN 1 ELSE 0 END),
        SUM(CASE WHEN s.device_type = 'mobile' THEN 1 ELSE 0 END),
        SUM(CASE WHEN s.device_type = 'tablet' THEN 1 ELSE 0 END)
    FROM analytics_sessions s
    LEFT JOIN analytics_visitors v ON s.visitor_id = v.visitor_id AND s.project_id = v.project_id
    WHERE DATE(s.started_at) = target_date
    GROUP BY s.project_id
    ON CONFLICT (project_id, date) DO UPDATE SET
        total_sessions = EXCLUDED.total_sessions,
        unique_visitors = EXCLUDED.unique_visitors,
        new_visitors = EXCLUDED.new_visitors,
        returning_visitors = EXCLUDED.returning_visitors,
        total_pageviews = EXCLUDED.total_pageviews,
        avg_session_duration = EXCLUDED.avg_session_duration,
        avg_pages_per_session = EXCLUDED.avg_pages_per_session,
        bounce_rate = EXCLUDED.bounce_rate,
        engagement_rate = EXCLUDED.engagement_rate,
        direct_sessions = EXCLUDED.direct_sessions,
        organic_sessions = EXCLUDED.organic_sessions,
        referral_sessions = EXCLUDED.referral_sessions,
        social_sessions = EXCLUDED.social_sessions,
        email_sessions = EXCLUDED.email_sessions,
        paid_sessions = EXCLUDED.paid_sessions,
        desktop_sessions = EXCLUDED.desktop_sessions,
        mobile_sessions = EXCLUDED.mobile_sessions,
        tablet_sessions = EXCLUDED.tablet_sessions,
        updated_at = NOW();
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE analytics_sessions IS 'Stores user session data for analytics tracking';
COMMENT ON TABLE analytics_pageviews IS 'Stores individual page view events';
COMMENT ON TABLE analytics_events IS 'Stores custom events (clicks, forms, errors, etc.)';
COMMENT ON TABLE analytics_visitors IS 'Stores unique visitor profiles for returning visitor tracking';
COMMENT ON TABLE analytics_page_performance IS 'Stores Web Vitals and performance metrics';
COMMENT ON TABLE analytics_daily_aggregates IS 'Pre-aggregated daily metrics for fast dashboard queries';
COMMENT ON TABLE analytics_campaign_metrics IS 'Aggregated campaign performance metrics';

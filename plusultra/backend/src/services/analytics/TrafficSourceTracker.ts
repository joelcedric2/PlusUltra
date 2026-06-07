/**
 * Traffic Source Tracker
 *
 * Parses and categorizes traffic sources, extracts UTM parameters,
 * identifies search engines, social media, and supports custom channel groupings.
 */

// ============================================================================
// Type Definitions
// ============================================================================

export interface UTMParameters {
  source: string | null;
  medium: string | null;
  campaign: string | null;
  content: string | null;
  term: string | null;
}

export interface TrafficSource {
  source: string;
  medium: string;
  channel: TrafficChannel;
  referrerDomain: string | null;
  referrerPath: string | null;
  searchEngine: string | null;
  searchKeyword: string | null;
  socialNetwork: string | null;
  isOrganic: boolean;
  isPaid: boolean;
}

export type TrafficChannel =
  | 'direct'
  | 'organic_search'
  | 'paid_search'
  | 'social'
  | 'referral'
  | 'email'
  | 'display'
  | 'affiliate'
  | 'video'
  | 'audio'
  | 'sms'
  | 'push'
  | 'other';

export interface SearchEngineConfig {
  name: string;
  domains: string[];
  queryParams: string[];
}

export interface SocialNetworkConfig {
  name: string;
  domains: string[];
}

export interface ChannelGrouping {
  name: string;
  rules: ChannelRule[];
}

export interface ChannelRule {
  type: 'source' | 'medium' | 'campaign' | 'referrer';
  operator: 'equals' | 'contains' | 'starts_with' | 'regex';
  value: string;
}

// ============================================================================
// Traffic Source Tracker
// ============================================================================

export class TrafficSourceTracker {
  // Known search engines
  private readonly searchEngines: SearchEngineConfig[] = [
    {
      name: 'Google',
      domains: ['google.com', 'google.co.uk', 'google.de', 'google.fr', 'google.es', 'google.it', 'google.ca', 'google.com.au', 'google.co.jp', 'google.com.br', 'google.co.in'],
      queryParams: ['q', 'query'],
    },
    {
      name: 'Bing',
      domains: ['bing.com', 'bing.co.uk'],
      queryParams: ['q'],
    },
    {
      name: 'Yahoo',
      domains: ['search.yahoo.com', 'yahoo.com'],
      queryParams: ['p', 'q'],
    },
    {
      name: 'DuckDuckGo',
      domains: ['duckduckgo.com'],
      queryParams: ['q'],
    },
    {
      name: 'Baidu',
      domains: ['baidu.com'],
      queryParams: ['wd', 'word'],
    },
    {
      name: 'Yandex',
      domains: ['yandex.com', 'yandex.ru'],
      queryParams: ['text'],
    },
    {
      name: 'Ecosia',
      domains: ['ecosia.org'],
      queryParams: ['q'],
    },
    {
      name: 'Brave',
      domains: ['search.brave.com'],
      queryParams: ['q'],
    },
    {
      name: 'AOL',
      domains: ['search.aol.com'],
      queryParams: ['q'],
    },
    {
      name: 'Ask',
      domains: ['ask.com'],
      queryParams: ['q'],
    },
  ];

  // Known social networks
  private readonly socialNetworks: SocialNetworkConfig[] = [
    { name: 'Facebook', domains: ['facebook.com', 'fb.com', 'fb.me', 'm.facebook.com', 'l.facebook.com', 'lm.facebook.com'] },
    { name: 'Twitter', domains: ['twitter.com', 't.co', 'x.com'] },
    { name: 'LinkedIn', domains: ['linkedin.com', 'lnkd.in'] },
    { name: 'Instagram', domains: ['instagram.com', 'l.instagram.com'] },
    { name: 'Pinterest', domains: ['pinterest.com', 'pin.it'] },
    { name: 'Reddit', domains: ['reddit.com', 'redd.it'] },
    { name: 'TikTok', domains: ['tiktok.com', 'vm.tiktok.com'] },
    { name: 'YouTube', domains: ['youtube.com', 'youtu.be'] },
    { name: 'Snapchat', domains: ['snapchat.com'] },
    { name: 'WhatsApp', domains: ['whatsapp.com', 'wa.me'] },
    { name: 'Telegram', domains: ['telegram.org', 't.me'] },
    { name: 'Discord', domains: ['discord.com', 'discord.gg'] },
    { name: 'Tumblr', domains: ['tumblr.com'] },
    { name: 'Quora', domains: ['quora.com'] },
    { name: 'Medium', domains: ['medium.com'] },
    { name: 'Slack', domains: ['slack.com'] },
    { name: 'Threads', domains: ['threads.net'] },
    { name: 'Mastodon', domains: ['mastodon.social', 'mastodon.online'] },
    { name: 'Bluesky', domains: ['bsky.app'] },
  ];

  // Email domain patterns
  private readonly emailPatterns = [
    /mail\.google\.com/i,
    /outlook\.(com|live\.com)/i,
    /mail\.yahoo\.com/i,
    /webmail\./i,
    /mail\./i,
    /email\./i,
    /^e\./i,
  ];

  // Paid campaign indicators
  private readonly paidIndicators = {
    mediums: ['cpc', 'ppc', 'paid', 'paidsocial', 'paidads', 'cpv', 'cpm', 'display', 'banner', 'retargeting', 'remarketing'],
    sources: ['google_ads', 'googleads', 'facebook_ads', 'facebookads', 'linkedin_ads', 'twitter_ads', 'bing_ads', 'adwords'],
    campaignPatterns: [/^(paid|ppc|cpc|sponsored|ad_)/i],
  };

  // Custom channel groupings
  private customChannelGroupings: ChannelGrouping[] = [];

  // ============================================================================
  // Public Methods
  // ============================================================================

  /**
   * Extract UTM parameters from URL query params
   */
  extractUTMParams(params: Record<string, string>): UTMParameters {
    return {
      source: params.utm_source || params.source || null,
      medium: params.utm_medium || params.medium || null,
      campaign: params.utm_campaign || params.campaign || null,
      content: params.utm_content || params.content || null,
      term: params.utm_term || params.term || null,
    };
  }

  /**
   * Categorize traffic source from referrer and parameters
   */
  categorizeSource(referrer: string, params: Record<string, string> = {}): TrafficSource {
    const utmParams = this.extractUTMParams(params);
    const referrerInfo = this.parseReferrer(referrer);

    // Check for UTM parameters first (highest priority)
    if (utmParams.source || utmParams.medium) {
      return this.categorizeFromUTM(utmParams, referrerInfo);
    }

    // Direct traffic (no referrer)
    if (!referrer || referrer === '' || referrer === 'direct') {
      return this.createDirectSource();
    }

    // Check if referrer is a search engine
    const searchResult = this.identifySearchEngine(referrerInfo.domain, referrer);
    if (searchResult) {
      return this.createSearchSource(searchResult, referrerInfo, this.isPaidSearch(params, referrer));
    }

    // Check if referrer is a social network
    const socialResult = this.identifySocialNetwork(referrerInfo.domain);
    if (socialResult) {
      return this.createSocialSource(socialResult, referrerInfo);
    }

    // Check if referrer is an email client
    if (this.isEmailReferrer(referrerInfo.domain)) {
      return this.createEmailSource(referrerInfo);
    }

    // Default to referral
    return this.createReferralSource(referrerInfo);
  }

  /**
   * Identify search engine and extract keyword
   */
  identifySearchEngine(domain: string, fullUrl: string): { name: string; keyword: string | null } | null {
    const normalizedDomain = this.normalizeDomain(domain);

    for (const engine of this.searchEngines) {
      for (const engineDomain of engine.domains) {
        if (normalizedDomain.includes(engineDomain) || normalizedDomain.endsWith('.' + engineDomain)) {
          const keyword = this.extractSearchKeyword(fullUrl, engine.queryParams);
          return { name: engine.name, keyword };
        }
      }
    }

    return null;
  }

  /**
   * Identify social network from domain
   */
  identifySocialNetwork(domain: string): { name: string } | null {
    const normalizedDomain = this.normalizeDomain(domain);

    for (const network of this.socialNetworks) {
      for (const networkDomain of network.domains) {
        if (normalizedDomain.includes(networkDomain) || normalizedDomain.endsWith('.' + networkDomain)) {
          return { name: network.name };
        }
      }
    }

    return null;
  }

  /**
   * Map source string to channel
   */
  mapSourceToChannel(source: string): TrafficChannel {
    if (!source) return 'direct';

    const lowerSource = source.toLowerCase();

    // Check search engines
    for (const engine of this.searchEngines) {
      if (lowerSource.includes(engine.name.toLowerCase())) {
        return 'organic_search';
      }
    }

    // Check social networks
    for (const network of this.socialNetworks) {
      if (lowerSource.includes(network.name.toLowerCase())) {
        return 'social';
      }
    }

    // Check common patterns
    if (lowerSource === 'direct' || lowerSource === '(direct)') return 'direct';
    if (lowerSource.includes('email') || lowerSource.includes('newsletter')) return 'email';
    if (lowerSource.includes('affiliate')) return 'affiliate';
    if (this.paidIndicators.sources.some(s => lowerSource.includes(s))) return 'paid_search';

    return 'referral';
  }

  /**
   * Add custom channel grouping
   */
  addChannelGrouping(grouping: ChannelGrouping): void {
    this.customChannelGroupings.push(grouping);
  }

  /**
   * Match traffic to custom channel grouping
   */
  matchCustomChannel(source: TrafficSource, utm: UTMParameters): string | null {
    for (const grouping of this.customChannelGroupings) {
      if (this.matchesChannelRules(source, utm, grouping.rules)) {
        return grouping.name;
      }
    }
    return null;
  }

  /**
   * Get all supported search engines
   */
  getSearchEngines(): SearchEngineConfig[] {
    return [...this.searchEngines];
  }

  /**
   * Get all supported social networks
   */
  getSocialNetworks(): SocialNetworkConfig[] {
    return [...this.socialNetworks];
  }

  /**
   * Add custom search engine
   */
  addSearchEngine(config: SearchEngineConfig): void {
    this.searchEngines.push(config);
  }

  /**
   * Add custom social network
   */
  addSocialNetwork(config: SocialNetworkConfig): void {
    this.socialNetworks.push(config);
  }

  // ============================================================================
  // Private Methods
  // ============================================================================

  private parseReferrer(referrer: string): { domain: string; path: string; fullUrl: string } {
    if (!referrer) {
      return { domain: '', path: '', fullUrl: '' };
    }

    try {
      const url = new URL(referrer.startsWith('http') ? referrer : `https://${referrer}`);
      return {
        domain: url.hostname,
        path: url.pathname,
        fullUrl: referrer,
      };
    } catch {
      // Try to extract domain from malformed URL
      const match = referrer.match(/^(?:https?:\/\/)?([^\/]+)/);
      return {
        domain: match ? match[1] : referrer,
        path: '',
        fullUrl: referrer,
      };
    }
  }

  private normalizeDomain(domain: string): string {
    return domain.toLowerCase().replace(/^www\./, '');
  }

  private extractSearchKeyword(url: string, queryParams: string[]): string | null {
    try {
      const urlObj = new URL(url.startsWith('http') ? url : `https://${url}`);
      for (const param of queryParams) {
        const value = urlObj.searchParams.get(param);
        if (value) {
          return decodeURIComponent(value);
        }
      }
    } catch {
      // Try regex extraction as fallback
      for (const param of queryParams) {
        const match = url.match(new RegExp(`[?&]${param}=([^&]+)`));
        if (match) {
          try {
            return decodeURIComponent(match[1]);
          } catch {
            return match[1];
          }
        }
      }
    }
    return null;
  }

  private isPaidSearch(params: Record<string, string>, referrer: string): boolean {
    // Check gclid (Google Ads)
    if (params.gclid) return true;

    // Check msclkid (Microsoft Ads)
    if (params.msclkid) return true;

    // Check fbclid with ad indicator
    if (params.fbclid && params.utm_source?.toLowerCase().includes('ad')) return true;

    // Check common paid parameters
    if (params.utm_medium && this.paidIndicators.mediums.includes(params.utm_medium.toLowerCase())) {
      return true;
    }

    // Check referrer for paid indicators
    if (referrer.includes('/aclk') || referrer.includes('/ads/') || referrer.includes('adurl')) {
      return true;
    }

    return false;
  }

  private isEmailReferrer(domain: string): boolean {
    return this.emailPatterns.some(pattern => pattern.test(domain));
  }

  private categorizeFromUTM(
    utm: UTMParameters,
    referrerInfo: { domain: string; path: string; fullUrl: string }
  ): TrafficSource {
    const source = utm.source || 'unknown';
    const medium = utm.medium || 'unknown';
    const lowerMedium = medium.toLowerCase();
    const lowerSource = source.toLowerCase();

    let channel: TrafficChannel = 'other';
    let isPaid = false;
    let isOrganic = false;
    let searchEngine: string | null = null;
    let socialNetwork: string | null = null;

    // Determine channel from medium
    if (lowerMedium === 'organic' || lowerMedium === 'organic_search') {
      channel = 'organic_search';
      isOrganic = true;
      searchEngine = this.findSearchEngineName(lowerSource);
    } else if (this.paidIndicators.mediums.includes(lowerMedium)) {
      isPaid = true;
      if (lowerMedium === 'cpc' || lowerMedium === 'ppc' || lowerMedium === 'paid') {
        channel = 'paid_search';
        searchEngine = this.findSearchEngineName(lowerSource);
      } else if (lowerMedium === 'display' || lowerMedium === 'banner') {
        channel = 'display';
      } else if (lowerMedium === 'paidsocial') {
        channel = 'social';
        socialNetwork = this.findSocialNetworkName(lowerSource);
      } else {
        channel = 'paid_search';
      }
    } else if (lowerMedium === 'social' || lowerMedium === 'social-media') {
      channel = 'social';
      socialNetwork = this.findSocialNetworkName(lowerSource);
    } else if (lowerMedium === 'email' || lowerMedium === 'newsletter') {
      channel = 'email';
    } else if (lowerMedium === 'referral') {
      channel = 'referral';
    } else if (lowerMedium === 'affiliate') {
      channel = 'affiliate';
    } else if (lowerMedium === 'video') {
      channel = 'video';
    } else if (lowerMedium === 'audio' || lowerMedium === 'podcast') {
      channel = 'audio';
    } else if (lowerMedium === 'sms' || lowerMedium === 'text') {
      channel = 'sms';
    } else if (lowerMedium === 'push' || lowerMedium === 'notification') {
      channel = 'push';
    }

    return {
      source,
      medium,
      channel,
      referrerDomain: referrerInfo.domain || null,
      referrerPath: referrerInfo.path || null,
      searchEngine,
      searchKeyword: utm.term,
      socialNetwork,
      isOrganic,
      isPaid,
    };
  }

  private createDirectSource(): TrafficSource {
    return {
      source: 'direct',
      medium: '(none)',
      channel: 'direct',
      referrerDomain: null,
      referrerPath: null,
      searchEngine: null,
      searchKeyword: null,
      socialNetwork: null,
      isOrganic: false,
      isPaid: false,
    };
  }

  private createSearchSource(
    searchResult: { name: string; keyword: string | null },
    referrerInfo: { domain: string; path: string; fullUrl: string },
    isPaid: boolean
  ): TrafficSource {
    return {
      source: searchResult.name.toLowerCase(),
      medium: isPaid ? 'cpc' : 'organic',
      channel: isPaid ? 'paid_search' : 'organic_search',
      referrerDomain: referrerInfo.domain,
      referrerPath: referrerInfo.path,
      searchEngine: searchResult.name,
      searchKeyword: searchResult.keyword,
      socialNetwork: null,
      isOrganic: !isPaid,
      isPaid,
    };
  }

  private createSocialSource(
    socialResult: { name: string },
    referrerInfo: { domain: string; path: string; fullUrl: string }
  ): TrafficSource {
    return {
      source: socialResult.name.toLowerCase(),
      medium: 'social',
      channel: 'social',
      referrerDomain: referrerInfo.domain,
      referrerPath: referrerInfo.path,
      searchEngine: null,
      searchKeyword: null,
      socialNetwork: socialResult.name,
      isOrganic: true,
      isPaid: false,
    };
  }

  private createEmailSource(
    referrerInfo: { domain: string; path: string; fullUrl: string }
  ): TrafficSource {
    return {
      source: 'email',
      medium: 'email',
      channel: 'email',
      referrerDomain: referrerInfo.domain,
      referrerPath: referrerInfo.path,
      searchEngine: null,
      searchKeyword: null,
      socialNetwork: null,
      isOrganic: false,
      isPaid: false,
    };
  }

  private createReferralSource(
    referrerInfo: { domain: string; path: string; fullUrl: string }
  ): TrafficSource {
    return {
      source: referrerInfo.domain || 'unknown',
      medium: 'referral',
      channel: 'referral',
      referrerDomain: referrerInfo.domain,
      referrerPath: referrerInfo.path,
      searchEngine: null,
      searchKeyword: null,
      socialNetwork: null,
      isOrganic: false,
      isPaid: false,
    };
  }

  private findSearchEngineName(source: string): string | null {
    for (const engine of this.searchEngines) {
      if (source.includes(engine.name.toLowerCase())) {
        return engine.name;
      }
    }
    return null;
  }

  private findSocialNetworkName(source: string): string | null {
    for (const network of this.socialNetworks) {
      if (source.includes(network.name.toLowerCase())) {
        return network.name;
      }
    }
    return null;
  }

  private matchesChannelRules(
    source: TrafficSource,
    utm: UTMParameters,
    rules: ChannelRule[]
  ): boolean {
    return rules.every(rule => {
      let fieldValue: string | null = null;

      switch (rule.type) {
        case 'source':
          fieldValue = utm.source || source.source;
          break;
        case 'medium':
          fieldValue = utm.medium || source.medium;
          break;
        case 'campaign':
          fieldValue = utm.campaign;
          break;
        case 'referrer':
          fieldValue = source.referrerDomain;
          break;
      }

      if (!fieldValue) return false;

      const lowerValue = fieldValue.toLowerCase();
      const ruleValue = rule.value.toLowerCase();

      switch (rule.operator) {
        case 'equals':
          return lowerValue === ruleValue;
        case 'contains':
          return lowerValue.includes(ruleValue);
        case 'starts_with':
          return lowerValue.startsWith(ruleValue);
        case 'regex':
          try {
            return new RegExp(rule.value, 'i').test(fieldValue);
          } catch {
            return false;
          }
      }
    });
  }
}

export default TrafficSourceTracker;

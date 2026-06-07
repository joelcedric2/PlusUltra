export interface UsagePoint {
  date: string;
  tokensUsed: number;
  requests: number;
  buildsTriggered: number;
}

export interface ProjectStat {
  status: 'active' | 'paused' | 'archived';
  count: number;
}

export interface PlanDistribution {
  tier: 'free' | 'starter' | 'pro' | 'enterprise';
  users: number;
}

export interface AnalyticsOverview {
  totalUsers: number;
  totalProjects: number;
  monthlyActiveUsers: number;
  monthlyTokenUsage: number;
}

const API_BASE = '/api/v1/analytics';

async function get<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`);
  if (!res.ok) throw new Error(`Analytics API error: ${res.status}`);
  return res.json();
}

export const analyticsService = {
  getOverview(): Promise<AnalyticsOverview> {
    return get<AnalyticsOverview>('/overview');
  },
  getUsageSeries(range: '7d' | '30d' | '90d' = '30d'): Promise<UsagePoint[]> {
    return get<UsagePoint[]>(`/usage?range=${range}`);
  },
  getProjectStats(): Promise<ProjectStat[]> {
    return get<ProjectStat[]>('/projects');
  },
  getPlanDistribution(): Promise<PlanDistribution[]> {
    return get<PlanDistribution[]>('/plans');
  },
};



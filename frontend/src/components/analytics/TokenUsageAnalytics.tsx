import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Progress } from '@/components/ui/progress';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import {
  Zap,
  TrendingUp,
  Clock,
  Activity,
  RefreshCw,
  Calendar,
  Brain,
  AlertCircle,
} from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useApi } from '@/hooks/use-api';

interface TokenUsage {
  userId: string;
  period: {
    start: string;
    end: string;
  };
  consumed: {
    plusultraTokens: number;
    breakdown: {
      gpt5Tokens: number;
      claudeTokens: number;
      geminiTokens: number;
      grokTokens: number;
      deepseekTokens: number;
    };
  };
  remaining: number;
  limit: number;
}

interface TokenTransaction {
  id: string;
  amount: number;
  type: 'consumption' | 'refund' | 'bonus' | 'purchase';
  source: 'gpt5' | 'claude' | 'gemini' | 'grok' | 'deepseek' | 'system';
  sourceTokens: number;
  description: string;
  timestamp: string;
}

const MODEL_COLORS = {
  claude: '#7C3AED',
  gpt5: '#10B981',
  gemini: '#3B82F6',
  grok: '#F59E0B',
  deepseek: '#EC4899',
};

const MODEL_LABELS = {
  claude: 'Claude 4.5 Sonnet',
  gpt5: 'GPT-5',
  gemini: 'Gemini 2.5 Pro',
  grok: 'Grok-2',
  deepseek: 'DeepSeek OCR',
};

export const TokenUsageAnalytics: React.FC = () => {
  const { user } = useAuth();
  const api = useApi();
  const [usage, setUsage] = useState<TokenUsage | null>(null);
  const [transactions, setTransactions] = useState<TokenTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState<'7d' | '30d' | '90d'>('30d');

  const fetchAnalytics = async () => {
    if (!user) return;

    setLoading(true);
    try {
      // Fetch current usage
      const usageRes = await api.get<{ success: true; data: { usage: TokenUsage } }>(
        '/api/v1/billing/usage'
      );
      setUsage(usageRes.data.usage);

      // Fetch transaction history
      const daysAgo = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
      const startDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
      const transactionsRes = await api.get<{ success: true; data: { transactions: TokenTransaction[] } }>(
        `/api/v1/billing/transactions?startDate=${startDate.toISOString()}&limit=100`
      );
      setTransactions(transactionsRes.data.transactions || []);
    } catch (error) {
      console.error('Failed to fetch token usage:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [user, timeRange]);

  if (loading || !usage) {
    return (
      <div className="flex items-center justify-center h-96">
        <RefreshCw className="w-8 h-8 animate-spin text-primary" />
      </div>
    );
  }

  // Calculate usage percentage
  const usagePercentage = usage.limit > 0 ? (usage.consumed.plusultraTokens / usage.limit) * 100 : 0;

  // Prepare model breakdown data for pie chart
  const modelBreakdown = [
    { name: MODEL_LABELS.claude, value: usage.consumed.breakdown.claudeTokens, color: MODEL_COLORS.claude },
    { name: MODEL_LABELS.gpt5, value: usage.consumed.breakdown.gpt5Tokens, color: MODEL_COLORS.gpt5 },
    { name: MODEL_LABELS.gemini, value: usage.consumed.breakdown.geminiTokens, color: MODEL_COLORS.gemini },
    { name: MODEL_LABELS.grok, value: usage.consumed.breakdown.grokTokens, color: MODEL_COLORS.grok },
    { name: MODEL_LABELS.deepseek, value: usage.consumed.breakdown.deepseekTokens, color: MODEL_COLORS.deepseek },
  ].filter((item) => item.value > 0);

  // Prepare daily usage data for line chart
  const dailyUsageMap = new Map<string, number>();
  transactions.forEach((tx) => {
    if (tx.type === 'consumption') {
      const date = new Date(tx.timestamp).toLocaleDateString();
      dailyUsageMap.set(date, (dailyUsageMap.get(date) || 0) + tx.amount);
    }
  });

  const dailyUsageData = Array.from(dailyUsageMap.entries())
    .map(([date, tokens]) => ({ date, tokens }))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  // Status badge
  const getUsageStatus = () => {
    if (usagePercentage >= 90) return { label: 'Critical', variant: 'destructive' as const };
    if (usagePercentage >= 75) return { label: 'Warning', variant: 'secondary' as const };
    return { label: 'Healthy', variant: 'default' as const };
  };

  const usageStatus = getUsageStatus();

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Token Usage Analytics</h1>
          <p className="text-muted-foreground mt-1">
            Track your token consumption and model usage
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={fetchAnalytics} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Tokens Used</CardTitle>
            <Zap className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{usage.consumed.plusultraTokens}</div>
            <p className="text-xs text-muted-foreground">
              of {usage.limit === -1 ? 'Unlimited' : usage.limit} this month
            </p>
            <Progress value={usagePercentage} className="mt-2" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Remaining</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {usage.remaining === -1 ? 'Unlimited' : usage.remaining}
            </div>
            <p className="text-xs text-muted-foreground">
              {usage.remaining !== -1 && `${(100 - usagePercentage).toFixed(1)}% available`}
            </p>
            <Badge variant={usageStatus.variant} className="mt-2">
              {usageStatus.label}
            </Badge>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Billing Period</CardTitle>
            <Calendar className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-sm font-medium">
              {new Date(usage.period.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
              {' - '}
              {new Date(usage.period.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Resets monthly
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Requests</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {transactions.filter((t) => t.type === 'consumption').length}
            </div>
            <p className="text-xs text-muted-foreground">
              AI requests this period
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Analytics Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="breakdown">Model Breakdown</TabsTrigger>
          <TabsTrigger value="history">Transaction History</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Daily Token Usage</CardTitle>
                  <CardDescription>Token consumption over time</CardDescription>
                </div>
                <div className="flex gap-2">
                  {(['7d', '30d', '90d'] as const).map((range) => (
                    <Button
                      key={range}
                      variant={timeRange === range ? 'default' : 'outline'}
                      size="sm"
                      onClick={() => setTimeRange(range)}
                    >
                      {range === '7d' ? '7 Days' : range === '30d' ? '30 Days' : '90 Days'}
                    </Button>
                  ))}
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dailyUsageData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="tokens"
                    stroke="#7C3AED"
                    strokeWidth={2}
                    name="Tokens Used"
                  />
                </LineChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Model Breakdown Tab */}
        <TabsContent value="breakdown" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Usage by Model</CardTitle>
                <CardDescription>Distribution of tokens across AI models</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={modelBreakdown}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={(entry) => `${entry.name}: ${((entry.value / usage.consumed.breakdown.claudeTokens + usage.consumed.breakdown.gpt5Tokens + usage.consumed.breakdown.geminiTokens + usage.consumed.breakdown.grokTokens + usage.consumed.breakdown.deepseekTokens) * 100).toFixed(0)}%`}
                      outerRadius={80}
                      dataKey="value"
                    >
                      {modelBreakdown.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Model Statistics</CardTitle>
                <CardDescription>Detailed breakdown by model</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3">
                {Object.entries(usage.consumed.breakdown).map(([model, tokens]) => {
                  if (tokens === 0) return null;
                  const modelKey = model.replace('Tokens', '') as keyof typeof MODEL_LABELS;
                  return (
                    <div key={model} className="flex items-center justify-between p-3 rounded-lg bg-muted">
                      <div className="flex items-center gap-2">
                        <Brain className="w-4 h-4" style={{ color: MODEL_COLORS[modelKey] }} />
                        <span className="text-sm font-medium">{MODEL_LABELS[modelKey]}</span>
                      </div>
                      <span className="text-sm font-semibold">{tokens.toLocaleString()} tokens</span>
                    </div>
                  );
                })}
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Transaction History Tab */}
        <TabsContent value="history" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Recent Transactions</CardTitle>
              <CardDescription>Your token usage history</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {transactions.slice(0, 20).map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-border"
                  >
                    <div className="flex items-center gap-3">
                      <div className={`w-2 h-2 rounded-full ${tx.type === 'consumption' ? 'bg-red-500' : 'bg-green-500'}`} />
                      <div>
                        <p className="text-sm font-medium">{tx.description}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {MODEL_LABELS[tx.source as keyof typeof MODEL_LABELS] || tx.source}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {new Date(tx.timestamp).toLocaleString()}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${tx.type === 'consumption' ? 'text-red-600' : 'text-green-600'}`}>
                        {tx.type === 'consumption' ? '-' : '+'}{tx.amount}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {tx.sourceTokens.toLocaleString()} API tokens
                      </p>
                    </div>
                  </div>
                ))}

                {transactions.length === 0 && (
                  <div className="text-center py-12">
                    <Clock className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">No transactions yet</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Start using AI features to see your token usage here
                    </p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Usage Alert */}
      {usagePercentage >= 75 && usage.limit !== -1 && (
        <Card className="border-amber-500/50 bg-amber-500/10">
          <CardHeader>
            <div className="flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-amber-600" />
              <CardTitle className="text-amber-600">High Token Usage</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              You've used {usagePercentage.toFixed(1)}% of your monthly token allocation. Consider upgrading your plan if you need more tokens.
            </p>
            <Button variant="outline" className="mt-3" size="sm">
              Upgrade Plan
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default TokenUsageAnalytics;

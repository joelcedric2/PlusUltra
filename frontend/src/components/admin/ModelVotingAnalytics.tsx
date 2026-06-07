/**
 * Model Voting Analytics Dashboard
 * Visualizes AI model performance metrics for cost optimization
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  LineChart,
  Line,
} from 'recharts';
import {
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle,
  DollarSign,
  Brain,
  Activity,
  RefreshCw,
} from 'lucide-react';
import { useApi } from '@/hooks/use-api';

interface ModelPerformanceMetrics {
  model: 'claude' | 'gpt5' | 'gemini' | 'grok' | 'deepseek';
  totalParticipations: number;
  totalWins: number;
  winRate: number;
  averageScore: number;
  byTaskType: Record<
    string,
    {
      participations: number;
      wins: number;
      winRate: number;
      averageScore: number;
    }
  >;
}

interface ConfidenceVoteLog {
  id: string;
  timestamp: string;
  taskType: 'code_generation' | 'app_design' | 'project_planning' | 'debugging' | 'optimization';
  confidence: {
    overall: number;
    consensus: number;
    quality: number;
    decision: 'ship' | 'review' | 'reject';
    reasoning: string;
    winner: string;
    modelScores: Array<{
      model: string;
      overall: number;
      quality: number;
      selfConfidence: number;
    }>;
  };
}

interface QuarantineStatus {
  model: string;
  status: 'active' | 'healthy';
  score?: number;
  reason?: string;
  quarantinedAt?: string;
  releaseAt?: string;
}

interface TelemetryAnalytics {
  dateRange: {
    start: string;
    end: string;
  };
  totalVotingSessions: number;
  modelPerformance: ModelPerformanceMetrics[];
  recommendations: {
    modelsToDrop: string[];
    modelsToKeep: string[];
    reasoning: string[];
  };
  costProjections: {
    currentMonthly: number;
    projectedWithOptimization: number;
    potentialSavings: number;
  };
}

interface UnderperformingModel {
  model: string;
  winRate: number;
  recommendDrop: boolean;
  reasoning: string;
}

const MODEL_COLORS: Record<string, string> = {
  claude: '#7C3AED', // Purple
  gpt5: '#10B981', // Green
  gemini: '#3B82F6', // Blue
  grok: '#F59E0B', // Amber
  deepseek: '#EC4899', // Pink
};

const MODEL_LABELS: Record<string, string> = {
  claude: 'Claude 4.5 Sonnet',
  gpt5: 'GPT-5',
  gemini: 'Gemini 2.5 Pro',
  grok: 'Grok-2',
  deepseek: 'DeepSeek OCR',
};

export const ModelVotingAnalytics: React.FC = () => {
  const api = useApi();
  const [analytics, setAnalytics] = useState<TelemetryAnalytics | null>(null);
  const [underperforming, setUnderperforming] = useState<UnderperformingModel[]>([]);
  const [confidenceLogs, setConfidenceLogs] = useState<ConfidenceVoteLog[]>([]);
  const [quarantineStatus, setQuarantineStatus] = useState<QuarantineStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState<'30d' | '90d' | '180d'>('90d');

  const fetchAnalytics = async () => {
    setLoading(true);
    try {
      const daysAgo = dateRange === '30d' ? 30 : dateRange === '90d' ? 90 : 180;
      const startDate = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000);
      const endDate = new Date();

      const [analyticsRes, underperformingRes, logsRes, quarantineRes] = await Promise.all([
        api.get<{ success: true; data: TelemetryAnalytics }>(
          `/api/v1/ai/telemetry/analytics?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
        ),
        api.get<{ success: true; data: { underperformingModels: UnderperformingModel[] } }>(
          '/api/v1/ai/telemetry/underperforming?minMonths=3&minWinRate=0.15'
        ),
        // Fetch confidence vote logs
        api.get<{ success: true; data: ConfidenceVoteLog[] }>(
          `/api/v1/ai/confidence/logs?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}&limit=50`
        ).catch(() => ({ data: [] })), // Fallback if endpoint doesn't exist yet
        // Fetch quarantine status
        api.get<{ success: true; data: { models: QuarantineStatus[] } }>(
          '/api/v1/ai/quarantine/summary'
        ).catch(() => ({ data: { models: [] } })), // Fallback if endpoint doesn't exist yet
      ]);

      setAnalytics(analyticsRes.data);
      setUnderperforming(underperformingRes.data.underperformingModels);
      setConfidenceLogs(logsRes.data);
      setQuarantineStatus(quarantineRes.data.models);
    } catch (error) {
      console.error('Failed to fetch analytics:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, [dateRange]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-8 h-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!analytics) {
    return (
      <Alert>
        <AlertTriangle className="h-4 w-4" />
        <AlertDescription>Failed to load analytics data</AlertDescription>
      </Alert>
    );
  }

  // Prepare chart data
  const winRateData = analytics.modelPerformance.map((m) => ({
    model: MODEL_LABELS[m.model],
    winRate: (m.winRate * 100).toFixed(1),
    wins: m.totalWins,
    participations: m.totalParticipations,
  }));

  const pieData = analytics.modelPerformance.map((m) => ({
    name: MODEL_LABELS[m.model],
    value: m.totalWins,
  }));

  // Task type breakdown data
  const taskTypes = ['code_generation', 'app_design', 'project_planning', 'debugging', 'optimization'];
  const taskTypeData = taskTypes.map((taskType) => {
    const data: any = { taskType: taskType.replace('_', ' ') };
    analytics.modelPerformance.forEach((m) => {
      const taskData = m.byTaskType[taskType];
      if (taskData) {
        data[MODEL_LABELS[m.model]] = (taskData.winRate * 100).toFixed(1);
      }
    });
    return data;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-3xl font-bold tracking-tight">Model Voting Analytics</h2>
          <p className="text-muted-foreground">
            Track AI model performance to optimize costs and identify winners
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Tabs value={dateRange} onValueChange={(v) => setDateRange(v as any)}>
            <TabsList>
              <TabsTrigger value="30d">30 Days</TabsTrigger>
              <TabsTrigger value="90d">90 Days</TabsTrigger>
              <TabsTrigger value="180d">180 Days</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button onClick={fetchAnalytics} variant="outline" size="sm">
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Underperforming Models Alert */}
      {underperforming.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <strong>Underperforming Models Detected:</strong> {underperforming.length} model(s) have
            win rates below 15% and may be candidates for removal.
          </AlertDescription>
        </Alert>
      )}

      {/* Cost Projections */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Current Monthly Cost</CardTitle>
            <DollarSign className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${analytics.costProjections.currentMonthly.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">All 4 models running</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Projected (Optimized)</CardTitle>
            <TrendingDown className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ${analytics.costProjections.projectedWithOptimization.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">After dropping underperformers</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Potential Savings</CardTitle>
            <TrendingUp className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-500">
              ${analytics.costProjections.potentialSavings.toFixed(2)}
            </div>
            <p className="text-xs text-muted-foreground">
              {((analytics.costProjections.potentialSavings / analytics.costProjections.currentMonthly) * 100).toFixed(1)}% reduction
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Main Analytics Tabs */}
      <Tabs defaultValue="overview" className="space-y-4">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="confidence-log">Confidence Log</TabsTrigger>
          <TabsTrigger value="quarantine">Quarantine Status</TabsTrigger>
          <TabsTrigger value="task-types">Task Types</TabsTrigger>
          <TabsTrigger value="recommendations">Recommendations</TabsTrigger>
          <TabsTrigger value="underperforming">Underperforming</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            {/* Win Rate Bar Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Win Rates by Model</CardTitle>
                <CardDescription>
                  {analytics.totalVotingSessions} total voting sessions analyzed
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={winRateData}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="model" />
                    <YAxis />
                    <Tooltip />
                    <Legend />
                    <Bar dataKey="winRate" fill="#7C3AED" name="Win Rate (%)" />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>

            {/* Win Distribution Pie Chart */}
            <Card>
              <CardHeader>
                <CardTitle>Win Distribution</CardTitle>
                <CardDescription>Total wins per model</CardDescription>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={300}>
                  <PieChart>
                    <Pie
                      data={pieData}
                      cx="50%"
                      cy="50%"
                      labelLine={false}
                      label={({ name, value }) => `${name}: ${value}`}
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {pieData.map((entry, index) => (
                        <Cell
                          key={`cell-${index}`}
                          fill={MODEL_COLORS[analytics.modelPerformance[index].model]}
                        />
                      ))}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Model Performance Cards */}
          <div className="grid gap-4 md:grid-cols-5">
            {analytics.modelPerformance.map((model) => (
              <Card key={model.model}>
                <CardHeader className="pb-2">
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Brain className="w-5 h-5" style={{ color: MODEL_COLORS[model.model] }} />
                    {MODEL_LABELS[model.model]}
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Win Rate</span>
                    <Badge
                      variant={model.winRate >= 0.25 ? 'default' : model.winRate >= 0.15 ? 'secondary' : 'destructive'}
                    >
                      {(model.winRate * 100).toFixed(1)}%
                    </Badge>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Total Wins</span>
                    <span className="text-sm font-medium">{model.totalWins}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Participations</span>
                    <span className="text-sm font-medium">{model.totalParticipations}</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span className="text-sm text-muted-foreground">Avg Score</span>
                    <span className="text-sm font-medium">{model.averageScore.toFixed(2)}</span>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Confidence Log Tab */}
        <TabsContent value="confidence-log" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>AI Confidence Vote Log</CardTitle>
              <CardDescription>
                Detailed confidence analysis for recent tasks (last 50 orchestrations)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {confidenceLogs.length > 0 ? (
                <div className="space-y-4">
                  {confidenceLogs.map((log) => (
                    <Card key={log.id} className="border-2">
                      <CardHeader>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <Badge variant="outline">{log.taskType.replace('_', ' ')}</Badge>
                            <Badge
                              variant={
                                log.confidence.decision === 'ship'
                                  ? 'default'
                                  : log.confidence.decision === 'review'
                                  ? 'secondary'
                                  : 'destructive'
                              }
                            >
                              {log.confidence.decision.toUpperCase()}
                            </Badge>
                          </div>
                          <span className="text-sm text-muted-foreground">
                            {new Date(log.timestamp).toLocaleString()}
                          </span>
                        </div>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        {/* Confidence Metrics */}
                        <div className="grid grid-cols-4 gap-4">
                          <div>
                            <p className="text-sm text-muted-foreground">Overall</p>
                            <p className="text-2xl font-bold">
                              {(log.confidence.overall * 100).toFixed(0)}%
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Consensus</p>
                            <p className="text-2xl font-bold">
                              {(log.confidence.consensus * 100).toFixed(0)}%
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Quality</p>
                            <p className="text-2xl font-bold">
                              {(log.confidence.quality * 100).toFixed(0)}%
                            </p>
                          </div>
                          <div>
                            <p className="text-sm text-muted-foreground">Winner</p>
                            <Badge style={{ backgroundColor: MODEL_COLORS[log.confidence.winner] }}>
                              {MODEL_LABELS[log.confidence.winner]}
                            </Badge>
                          </div>
                        </div>

                        {/* Model Scores */}
                        <div>
                          <p className="text-sm font-medium mb-2">Model Scores</p>
                          <div className="grid grid-cols-5 gap-2">
                            {log.confidence.modelScores.map((score) => (
                              <Card key={score.model} className="p-2">
                                <div className="text-xs text-muted-foreground mb-1">
                                  {MODEL_LABELS[score.model as keyof typeof MODEL_LABELS]}
                                </div>
                                <div className="space-y-1">
                                  <div className="flex justify-between text-xs">
                                    <span>Overall:</span>
                                    <span className="font-medium">{(score.overall * 100).toFixed(0)}%</span>
                                  </div>
                                  <div className="flex justify-between text-xs">
                                    <span>Quality:</span>
                                    <span className="font-medium">{(score.quality * 100).toFixed(0)}%</span>
                                  </div>
                                  <div className="flex justify-between text-xs">
                                    <span>Self:</span>
                                    <span className="font-medium">{(score.selfConfidence * 100).toFixed(0)}%</span>
                                  </div>
                                </div>
                              </Card>
                            ))}
                          </div>
                        </div>

                        {/* Reasoning */}
                        <Alert>
                          <Activity className="h-4 w-4" />
                          <AlertDescription>{log.confidence.reasoning}</AlertDescription>
                        </Alert>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              ) : (
                <div className="text-center py-12">
                  <Activity className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
                  <p className="text-muted-foreground">No confidence logs available yet</p>
                  <p className="text-sm text-muted-foreground mt-2">
                    Logs will appear as tasks are orchestrated through the Multi-AI system
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Quarantine Status Tab */}
        <TabsContent value="quarantine" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Model Quarantine Status</CardTitle>
              <CardDescription>
                Automatic quarantine of underperforming models (Tier 1 Dynamic Confidence System)
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Quarantine Info Alert */}
                <Alert>
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription>
                    Models are automatically quarantined if they: (1) Rank worst 3+ consecutive times, (2) Quality score {'<'} 0.5 in 5+ recent tasks, or (3) Self-confidence {'<'} 0.4. Auto-release after 24 hours.
                  </AlertDescription>
                </Alert>

                {/* Quarantine Status Cards */}
                <div className="grid gap-4 md:grid-cols-5">
                  {['claude', 'gpt5', 'gemini', 'grok', 'deepseek'].map((modelName) => {
                    const status = quarantineStatus.find((s) => s.model === modelName) || {
                      model: modelName,
                      status: 'healthy' as const,
                    };

                    return (
                      <Card
                        key={modelName}
                        className={
                          status.status === 'active'
                            ? 'border-destructive border-2'
                            : 'border-green-500/50 border-2'
                        }
                      >
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm flex items-center gap-2">
                            <Brain
                              className="w-4 h-4"
                              style={{ color: MODEL_COLORS[modelName] }}
                            />
                            {MODEL_LABELS[modelName as keyof typeof MODEL_LABELS]}
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-2">
                          <div className="flex items-center gap-2">
                            {status.status === 'active' ? (
                              <AlertTriangle className="w-4 h-4 text-destructive" />
                            ) : (
                              <CheckCircle className="w-4 h-4 text-green-500" />
                            )}
                            <Badge variant={status.status === 'active' ? 'destructive' : 'default'}>
                              {status.status === 'active' ? 'QUARANTINED' : 'Healthy'}
                            </Badge>
                          </div>
                          {status.status === 'active' && (
                            <>
                              {status.score !== undefined && (
                                <div className="text-sm">
                                  <span className="text-muted-foreground">Score:</span>{' '}
                                  <span className="font-medium">{status.score.toFixed(2)}</span>
                                </div>
                              )}
                              {status.reason && (
                                <p className="text-xs text-muted-foreground">{status.reason}</p>
                              )}
                              {status.releaseAt && (
                                <p className="text-xs text-muted-foreground">
                                  Release: {new Date(status.releaseAt).toLocaleString()}
                                </p>
                              )}
                            </>
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Task Types Tab */}
        <TabsContent value="task-types" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Win Rates by Task Type</CardTitle>
              <CardDescription>Model performance across different task categories</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <BarChart data={taskTypeData}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="taskType" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Bar dataKey={MODEL_LABELS.claude} fill={MODEL_COLORS.claude} />
                  <Bar dataKey={MODEL_LABELS.gpt5} fill={MODEL_COLORS.gpt5} />
                  <Bar dataKey={MODEL_LABELS.gemini} fill={MODEL_COLORS.gemini} />
                  <Bar dataKey={MODEL_LABELS.grok} fill={MODEL_COLORS.grok} />
                  <Bar dataKey={MODEL_LABELS.deepseek} fill={MODEL_COLORS.deepseek} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Task Type Breakdown Cards */}
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {taskTypes.map((taskType) => {
              const taskLabel = taskType.replace('_', ' ');
              const topModel = analytics.modelPerformance
                .map((m) => ({
                  model: m.model,
                  winRate: m.byTaskType[taskType]?.winRate || 0,
                }))
                .sort((a, b) => b.winRate - a.winRate)[0];

              return (
                <Card key={taskType}>
                  <CardHeader>
                    <CardTitle className="text-base capitalize">{taskLabel}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-sm font-medium">Top Performer</span>
                      <Badge style={{ backgroundColor: MODEL_COLORS[topModel.model] }}>
                        {MODEL_LABELS[topModel.model]}
                      </Badge>
                    </div>
                    <div className="text-2xl font-bold">
                      {(topModel.winRate * 100).toFixed(1)}%
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>

        {/* Recommendations Tab */}
        <TabsContent value="recommendations" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Optimization Recommendations</CardTitle>
              <CardDescription>Data-driven suggestions for cost optimization</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {analytics.recommendations.reasoning.length > 0 ? (
                analytics.recommendations.reasoning.map((reason, i) => (
                  <Alert key={i}>
                    <Activity className="h-4 w-4" />
                    <AlertDescription>{reason}</AlertDescription>
                  </Alert>
                ))
              ) : (
                <Alert>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <AlertDescription>
                    All models are performing adequately. Continue collecting data for better insights.
                  </AlertDescription>
                </Alert>
              )}

              {analytics.recommendations.modelsToDrop.length > 0 && (
                <Card className="border-destructive">
                  <CardHeader>
                    <CardTitle className="text-destructive flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5" />
                      Models to Consider Dropping
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {analytics.recommendations.modelsToDrop.map((model) => (
                        <Badge key={model} variant="destructive" className="mr-2">
                          {MODEL_LABELS[model as keyof typeof MODEL_LABELS]}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {analytics.recommendations.modelsToKeep.length > 0 && (
                <Card className="border-green-500">
                  <CardHeader>
                    <CardTitle className="text-green-500 flex items-center gap-2">
                      <CheckCircle className="w-5 h-5" />
                      Models to Keep
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {analytics.recommendations.modelsToKeep.map((model) => (
                        <Badge
                          key={model}
                          className="mr-2"
                          style={{ backgroundColor: MODEL_COLORS[model as keyof typeof MODEL_COLORS] }}
                        >
                          {MODEL_LABELS[model as keyof typeof MODEL_LABELS]}
                        </Badge>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Underperforming Tab */}
        <TabsContent value="underperforming" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Underperforming Models</CardTitle>
              <CardDescription>
                Models with win rates below 15% over 3+ months (min 50 participations)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {underperforming.length > 0 ? (
                <div className="space-y-4">
                  {underperforming.map((model) => (
                    <Alert key={model.model} variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertDescription>
                        <div className="flex items-center justify-between">
                          <div>
                            <strong>{MODEL_LABELS[model.model as keyof typeof MODEL_LABELS]}</strong>
                            <p className="text-sm mt-1">{model.reasoning}</p>
                          </div>
                          <Badge variant="destructive">{(model.winRate * 100).toFixed(1)}%</Badge>
                        </div>
                      </AlertDescription>
                    </Alert>
                  ))}
                </div>
              ) : (
                <Alert>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  <AlertDescription>
                    No underperforming models detected. All models meet the 15% win rate threshold.
                  </AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

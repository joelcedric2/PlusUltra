/**
 * Healing Status Panel
 *
 * Real-time panel showing active healing attempts, recent completions,
 * and system health indicators for the self-healing system.
 */

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { RefreshCw, CheckCircle, XCircle, Clock, AlertTriangle, Activity } from 'lucide-react';

interface HealingAttempt {
  id: string;
  errorType: string;
  errorMessage: string;
  environment: string;
  status: string;
  confidence: number;
  startedAt: string;
  duration: number | null;
  rolledBack: boolean;
}

interface SystemHealth {
  totalErrors: number;
  activeHealings: number;
  healedToday: number;
  failedToday: number;
  successRate: number;
  avgTimeToFix: number;
}

export function HealingStatusPanel() {
  const [activeAttempts, setActiveAttempts] = useState<HealingAttempt[]>([]);
  const [recentAttempts, setRecentAttempts] = useState<HealingAttempt[]>([]);
  const [systemHealth, setSystemHealth] = useState<SystemHealth | null>(null);
  const [loading, setLoading] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchData = async () => {
    try {
      // Fetch dashboard data
      const response = await fetch('/api/self-healing/dashboard?days=1');
      const data = await response.json();

      if (data.success) {
        setSystemHealth(data.data.overview);

        // Separate active vs completed attempts
        const active = data.data.recentAttempts.filter(
          (a: HealingAttempt) =>
            ['analyzing', 'testing', 'deploying'].includes(a.status)
        );
        const recent = data.data.recentAttempts.filter(
          (a: HealingAttempt) =>
            !['analyzing', 'testing', 'deploying'].includes(a.status)
        );

        setActiveAttempts(active);
        setRecentAttempts(recent.slice(0, 5)); // Show last 5 completed
      }
    } catch (error) {
      console.error('Failed to fetch healing status:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();

    // Auto-refresh every 5 seconds if enabled
    let interval: NodeJS.Timeout;
    if (autoRefresh) {
      interval = setInterval(fetchData, 5000);
    }

    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoRefresh]);

  const getStatusColor = (status: string): string => {
    switch (status) {
      case 'analyzing':
        return 'bg-blue-500';
      case 'testing':
        return 'bg-purple-500';
      case 'deploying':
        return 'bg-orange-500';
      case 'deployed':
        return 'bg-green-500';
      case 'failed':
        return 'bg-red-500';
      case 'pending':
        return 'bg-yellow-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'analyzing':
      case 'testing':
      case 'deploying':
        return <Activity className="h-4 w-4 animate-pulse" />;
      case 'deployed':
        return <CheckCircle className="h-4 w-4" />;
      case 'failed':
        return <XCircle className="h-4 w-4" />;
      case 'pending':
        return <Clock className="h-4 w-4" />;
      default:
        return <AlertTriangle className="h-4 w-4" />;
    }
  };

  const formatDuration = (ms: number | null): string => {
    if (!ms) return '—';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatTime = (dateString: string): string => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now.getTime() - date.getTime();

    if (diff < 60000) return 'just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return date.toLocaleString();
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Self-Healing Status</CardTitle>
          <CardDescription>Loading...</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* System Health Overview */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <div>
            <CardTitle>System Health</CardTitle>
            <CardDescription>Self-healing system overview</CardDescription>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchData()}
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            Refresh
          </Button>
        </CardHeader>
        <CardContent>
          {systemHealth && (
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
              <div>
                <div className="text-2xl font-bold">{systemHealth.activeHealings}</div>
                <div className="text-xs text-muted-foreground">Active</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-green-600">{systemHealth.healedToday}</div>
                <div className="text-xs text-muted-foreground">Healed Today</div>
              </div>
              <div>
                <div className="text-2xl font-bold text-red-600">{systemHealth.failedToday}</div>
                <div className="text-xs text-muted-foreground">Failed Today</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{(systemHealth.successRate * 100).toFixed(0)}%</div>
                <div className="text-xs text-muted-foreground">Success Rate</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{systemHealth.totalErrors}</div>
                <div className="text-xs text-muted-foreground">Total Errors</div>
              </div>
              <div>
                <div className="text-2xl font-bold">{formatDuration(systemHealth.avgTimeToFix)}</div>
                <div className="text-xs text-muted-foreground">Avg Time</div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Active Healing Attempts */}
      {activeAttempts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5 animate-pulse text-blue-500" />
              Active Healing Attempts ({activeAttempts.length})
            </CardTitle>
            <CardDescription>Currently processing errors</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {activeAttempts.map((attempt) => (
                <div
                  key={attempt.id}
                  className="border rounded-lg p-4 space-y-2"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {getStatusIcon(attempt.status)}
                      <span className="font-mono text-sm">
                        {attempt.errorType}
                      </span>
                      <Badge className={getStatusColor(attempt.status)}>
                        {attempt.status}
                      </Badge>
                      <Badge variant="outline">{attempt.environment}</Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {formatTime(attempt.startedAt)}
                    </span>
                  </div>

                  <div className="text-sm text-muted-foreground">
                    {attempt.errorMessage.substring(0, 100)}
                    {attempt.errorMessage.length > 100 && '...'}
                  </div>

                  {attempt.confidence > 0 && (
                    <div className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <span>Confidence</span>
                        <span className="font-medium">
                          {(attempt.confidence * 100).toFixed(0)}%
                        </span>
                      </div>
                      <Progress value={attempt.confidence * 100} className="h-2" />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Completions */}
      <Card>
        <CardHeader>
          <CardTitle>Recent Attempts</CardTitle>
          <CardDescription>Last 5 completed healing attempts</CardDescription>
        </CardHeader>
        <CardContent>
          {recentAttempts.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No recent attempts
            </div>
          ) : (
            <div className="space-y-2">
              {recentAttempts.map((attempt) => (
                <div
                  key={attempt.id}
                  className="flex items-center justify-between p-3 border rounded-lg hover:bg-accent/50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    {getStatusIcon(attempt.status)}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-sm truncate">
                          {attempt.errorType}
                        </span>
                        <Badge
                          variant="outline"
                          className={getStatusColor(attempt.status)}
                        >
                          {attempt.status}
                        </Badge>
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        {attempt.errorMessage}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 text-xs text-muted-foreground">
                    <span>{formatTime(attempt.startedAt)}</span>
                    {attempt.duration && (
                      <span className="font-mono">{formatDuration(attempt.duration)}</span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Auto-refresh toggle */}
      <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setAutoRefresh(!autoRefresh)}
        >
          {autoRefresh ? (
            <>
              <Activity className="h-3 w-3 mr-1 animate-pulse" />
              Auto-refreshing every 5s
            </>
          ) : (
            <>
              <RefreshCw className="h-3 w-3 mr-1" />
              Auto-refresh paused
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

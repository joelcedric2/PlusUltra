/**
 * Healing History View
 *
 * Detailed view of past healing attempts with filtering, sorting,
 * and detailed inspection of individual attempts.
 */

import React, { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Search, Filter, Eye, Download, CheckCircle, XCircle, AlertCircle, Clock } from 'lucide-react';

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

interface DetailedAttempt {
  attempt: {
    id: string;
    status: string;
    confidence: number;
    startedAt: string;
    completedAt: string | null;
    duration: number | null;
    rolledBack: boolean;
    rollbackReason: string | null;
  };
  error: {
    errorType: string;
    errorMessage: string;
    stackTrace: string;
    filePath: string | null;
    lineNumber: number | null;
    environment: string;
  };
  fix: {
    fixCode: string;
    fixDescription: string;
    confidence: number;
  };
  validation: {
    testsPassed: boolean;
    testsRun: number;
    testsFailed: number;
    validationLogs: string | null;
  };
  deployment: {
    deployed: boolean;
    strategy: string | null;
    healthCheckPassed: boolean;
    errorRateBefore: number | null;
    errorRateAfter: number | null;
    rollback: {
      rolledBack: boolean;
      reason: string | null;
    };
  };
  timeline: Array<{
    stage: string;
    timestamp: string;
    status: 'success' | 'failure' | 'in_progress';
    details: string;
  }>;
}

export function HealingHistoryView() {
  const [attempts, setAttempts] = useState<HealingAttempt[]>([]);
  const [filteredAttempts, setFilteredAttempts] = useState<HealingAttempt[]>([]);
  const [selectedAttempt, setSelectedAttempt] = useState<DetailedAttempt | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [loading, setLoading] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [environmentFilter, setEnvironmentFilter] = useState<string>('all');
  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

  const fetchAttempts = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams({
        limit: limit.toString(),
        offset: offset.toString(),
        ...(statusFilter !== 'all' && { status: statusFilter }),
        ...(environmentFilter !== 'all' && { environment: environmentFilter }),
      });

      const response = await fetch(`/api/self-healing/errors?${params}`);
      const data = await response.json();

      if (data.success) {
        // Flatten errors with their latest healing attempt
        const attemptsList: HealingAttempt[] = [];
        for (const error of data.errors) {
          if (error.healingAttempts && error.healingAttempts.length > 0) {
            const attempt = error.healingAttempts[0];
            attemptsList.push({
              id: attempt.id,
              errorType: error.errorType,
              errorMessage: error.errorMessage,
              environment: error.environment,
              status: attempt.status,
              confidence: attempt.confidence,
              startedAt: attempt.startedAt,
              duration: attempt.duration,
              rolledBack: attempt.rolledBack,
            });
          }
        }
        setAttempts(attemptsList);
        applyFilters(attemptsList);
      }
    } catch (error) {
      console.error('Failed to fetch healing history:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAttemptDetails = async (attemptId: string) => {
    try {
      const response = await fetch(`/api/self-healing/dashboard/attempts/${attemptId}`);
      const data = await response.json();

      if (data.success) {
        setSelectedAttempt(data.data);
        setShowDetails(true);
      }
    } catch (error) {
      console.error('Failed to fetch attempt details:', error);
    }
  };

  const applyFilters = (attemptsList: HealingAttempt[]) => {
    let filtered = [...attemptsList];

    // Search filter
    if (searchQuery) {
      filtered = filtered.filter(
        (a) =>
          a.errorType.toLowerCase().includes(searchQuery.toLowerCase()) ||
          a.errorMessage.toLowerCase().includes(searchQuery.toLowerCase())
      );
    }

    setFilteredAttempts(filtered);
  };

  useEffect(() => {
    fetchAttempts();
  }, [offset, statusFilter, environmentFilter]);

  useEffect(() => {
    applyFilters(attempts);
  }, [searchQuery]);

  const getStatusBadge = (status: string) => {
    const variants: Record<string, { color: string; icon: React.ReactNode }> = {
      deployed: {
        color: 'bg-green-500',
        icon: <CheckCircle className="h-3 w-3" />,
      },
      failed: {
        color: 'bg-red-500',
        icon: <XCircle className="h-3 w-3" />,
      },
      pending: {
        color: 'bg-yellow-500',
        icon: <Clock className="h-3 w-3" />,
      },
      rolled_back: {
        color: 'bg-orange-500',
        icon: <AlertCircle className="h-3 w-3" />,
      },
    };

    const variant = variants[status] || { color: 'bg-gray-500', icon: null };

    return (
      <Badge className={`${variant.color} flex items-center gap-1`}>
        {variant.icon}
        {status}
      </Badge>
    );
  };

  const formatDuration = (ms: number | null): string => {
    if (!ms) return '—';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatTime = (dateString: string): string => {
    return new Date(dateString).toLocaleString();
  };

  const exportHistory = async () => {
    try {
      const response = await fetch('/api/self-healing/dashboard/export?days=30');
      const data = await response.text();

      const blob = new Blob([data], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `healing-history-${new Date().toISOString()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Failed to export history:', error);
    }
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <Card>
        <CardHeader>
          <CardTitle>Healing History</CardTitle>
          <CardDescription>View and analyze past healing attempts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="md:col-span-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search by error type or message..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="deployed">Deployed</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="rolled_back">Rolled Back</SelectItem>
              </SelectContent>
            </Select>

            <Select value={environmentFilter} onValueChange={setEnvironmentFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Environment" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Environments</SelectItem>
                <SelectItem value="production">Production</SelectItem>
                <SelectItem value="staging">Staging</SelectItem>
                <SelectItem value="development">Development</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              {filteredAttempts.length} attempt{filteredAttempts.length !== 1 ? 's' : ''}
            </span>
            <Button variant="outline" size="sm" onClick={exportHistory}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Attempts List */}
      <Card>
        <CardContent className="p-0">
          {loading ? (
            <div className="p-8 text-center text-muted-foreground">Loading...</div>
          ) : filteredAttempts.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">No attempts found</div>
          ) : (
            <div className="divide-y">
              {filteredAttempts.map((attempt) => (
                <div
                  key={attempt.id}
                  className="p-4 hover:bg-accent/50 transition-colors cursor-pointer"
                  onClick={() => fetchAttemptDetails(attempt.id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono text-sm font-medium">
                          {attempt.errorType}
                        </span>
                        {getStatusBadge(attempt.status)}
                        <Badge variant="outline">{attempt.environment}</Badge>
                        {attempt.rolledBack && (
                          <Badge variant="destructive">Rolled Back</Badge>
                        )}
                      </div>

                      <p className="text-sm text-muted-foreground truncate">
                        {attempt.errorMessage}
                      </p>

                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <span>{formatTime(attempt.startedAt)}</span>
                        <span>Confidence: {(attempt.confidence * 100).toFixed(0)}%</span>
                        {attempt.duration && (
                          <span>Duration: {formatDuration(attempt.duration)}</span>
                        )}
                      </div>
                    </div>

                    <Button variant="ghost" size="sm">
                      <Eye className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {!loading && filteredAttempts.length >= limit && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOffset(Math.max(0, offset - limit))}
            disabled={offset === 0}
          >
            Previous
          </Button>
          <span className="text-sm text-muted-foreground">
            Showing {offset + 1}-{Math.min(offset + limit, filteredAttempts.length)}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setOffset(offset + limit)}
            disabled={filteredAttempts.length < limit}
          >
            Next
          </Button>
        </div>
      )}

      {/* Detailed View Dialog */}
      <Dialog open={showDetails} onOpenChange={setShowDetails}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Healing Attempt Details</DialogTitle>
            <DialogDescription>
              Complete information about the healing attempt
            </DialogDescription>
          </DialogHeader>

          {selectedAttempt && (
            <Tabs defaultValue="overview" className="w-full">
              <TabsList className="grid w-full grid-cols-5">
                <TabsTrigger value="overview">Overview</TabsTrigger>
                <TabsTrigger value="error">Error</TabsTrigger>
                <TabsTrigger value="fix">Fix</TabsTrigger>
                <TabsTrigger value="validation">Validation</TabsTrigger>
                <TabsTrigger value="deployment">Deployment</TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm font-medium">Status</div>
                    <div className="mt-1">{getStatusBadge(selectedAttempt.attempt.status)}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium">Confidence</div>
                    <div className="mt-1 text-sm">
                      {(selectedAttempt.attempt.confidence * 100).toFixed(0)}%
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium">Started At</div>
                    <div className="mt-1 text-sm">
                      {formatTime(selectedAttempt.attempt.startedAt)}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium">Duration</div>
                    <div className="mt-1 text-sm">
                      {formatDuration(selectedAttempt.attempt.duration)}
                    </div>
                  </div>
                </div>

                {/* Timeline */}
                <div>
                  <div className="text-sm font-medium mb-2">Timeline</div>
                  <div className="space-y-2">
                    {selectedAttempt.timeline.map((stage, idx) => (
                      <div key={idx} className="flex items-start gap-3">
                        <div className={`mt-1 ${
                          stage.status === 'success' ? 'text-green-500' :
                          stage.status === 'failure' ? 'text-red-500' :
                          'text-blue-500'
                        }`}>
                          {stage.status === 'success' ? <CheckCircle className="h-4 w-4" /> :
                           stage.status === 'failure' ? <XCircle className="h-4 w-4" /> :
                           <Clock className="h-4 w-4" />}
                        </div>
                        <div className="flex-1">
                          <div className="text-sm font-medium">{stage.stage}</div>
                          <div className="text-xs text-muted-foreground">
                            {stage.details}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {formatTime(stage.timestamp)}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="error" className="space-y-4">
                <div>
                  <div className="text-sm font-medium">Error Type</div>
                  <div className="mt-1 font-mono text-sm">{selectedAttempt.error.errorType}</div>
                </div>
                <div>
                  <div className="text-sm font-medium">Error Message</div>
                  <div className="mt-1 text-sm">{selectedAttempt.error.errorMessage}</div>
                </div>
                <div>
                  <div className="text-sm font-medium">Stack Trace</div>
                  <pre className="mt-1 p-3 bg-muted rounded text-xs overflow-x-auto">
                    {selectedAttempt.error.stackTrace}
                  </pre>
                </div>
                {selectedAttempt.error.filePath && (
                  <div>
                    <div className="text-sm font-medium">Location</div>
                    <div className="mt-1 font-mono text-sm">
                      {selectedAttempt.error.filePath}
                      {selectedAttempt.error.lineNumber && `:${selectedAttempt.error.lineNumber}`}
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="fix" className="space-y-4">
                <div>
                  <div className="text-sm font-medium">Fix Description</div>
                  <div className="mt-1 text-sm">{selectedAttempt.fix.fixDescription}</div>
                </div>
                <div>
                  <div className="text-sm font-medium">Fixed Code</div>
                  <pre className="mt-1 p-3 bg-muted rounded text-xs overflow-x-auto">
                    {selectedAttempt.fix.fixCode}
                  </pre>
                </div>
              </TabsContent>

              <TabsContent value="validation" className="space-y-4">
                <div className="grid grid-cols-3 gap-4">
                  <div>
                    <div className="text-sm font-medium">Tests Run</div>
                    <div className="mt-1 text-sm">{selectedAttempt.validation.testsRun}</div>
                  </div>
                  <div>
                    <div className="text-sm font-medium">Tests Passed</div>
                    <div className="mt-1 text-sm text-green-600">
                      {selectedAttempt.validation.testsRun - selectedAttempt.validation.testsFailed}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium">Tests Failed</div>
                    <div className="mt-1 text-sm text-red-600">
                      {selectedAttempt.validation.testsFailed}
                    </div>
                  </div>
                </div>
                {selectedAttempt.validation.validationLogs && (
                  <div>
                    <div className="text-sm font-medium">Validation Logs</div>
                    <pre className="mt-1 p-3 bg-muted rounded text-xs overflow-x-auto">
                      {selectedAttempt.validation.validationLogs}
                    </pre>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="deployment" className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-sm font-medium">Deployed</div>
                    <div className="mt-1">
                      {selectedAttempt.deployment.deployed ? (
                        <Badge className="bg-green-500">Yes</Badge>
                      ) : (
                        <Badge variant="outline">No</Badge>
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-sm font-medium">Strategy</div>
                    <div className="mt-1 text-sm">
                      {selectedAttempt.deployment.strategy || 'N/A'}
                    </div>
                  </div>
                </div>

                {selectedAttempt.deployment.errorRateBefore !== null && (
                  <div>
                    <div className="text-sm font-medium mb-2">Metrics</div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <div className="text-xs text-muted-foreground">Error Rate Before</div>
                        <div className="text-sm">
                          {(selectedAttempt.deployment.errorRateBefore! * 100).toFixed(2)}%
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Error Rate After</div>
                        <div className="text-sm">
                          {(selectedAttempt.deployment.errorRateAfter! * 100).toFixed(2)}%
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {selectedAttempt.deployment.rollback.rolledBack && (
                  <div className="p-3 bg-destructive/10 rounded border border-destructive/20">
                    <div className="text-sm font-medium text-destructive">Deployment Rolled Back</div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {selectedAttempt.deployment.rollback.reason}
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

/**
 * Submission Live Feed Component
 * Shows real-time progress of App Store/Play Store submission with AI iteration
 *
 * Critical UX: Users tolerate weeks if they see progress, not silence.
 */

import { useEffect, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  CheckCircle2,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle,
  Sparkles,
  RefreshCw,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface SubmissionAttempt {
  attemptNumber: number;
  timestamp: Date;
  status: 'pending' | 'submitted' | 'in_review' | 'rejected' | 'approved' | 'failed';
  store: 'app_store' | 'play_store';
  buildId: string;
  rejectionReasons?: Array<{
    category: string;
    message: string;
    severity: string;
  }>;
  fixesApplied?: Array<{
    action: string;
    aiModel: string;
    confidence: number;
  }>;
}

interface SubmissionSession {
  sessionId: string;
  appName: string;
  platform: 'ios' | 'android' | 'all';
  status: 'in_progress' | 'approved' | 'abandoned' | 'manual_review_needed';
  attempts: SubmissionAttempt[];
  currentStage: string;
  estimatedTimeRemaining?: number;
  totalIterations: number;
}

interface SubmissionLiveFeedProps {
  sessionId: string;
  onComplete?: () => void;
}

export const SubmissionLiveFeed: React.FC<SubmissionLiveFeedProps> = ({
  sessionId,
  onComplete,
}) => {
  const [session, setSession] = useState<SubmissionSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Poll for updates every 5 seconds
  useEffect(() => {
    const fetchStatus = async () => {
      try {
        const response = await fetch(`/api/v1/publishing/submission/${sessionId}`);
        const data = await response.json();

        if (data.success) {
          setSession(data.data);

          // Check if completed
          if (data.data.status === 'approved' && onComplete) {
            onComplete();
          }
        }
      } catch (error) {
        console.error('Failed to fetch submission status:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchStatus();
    const interval = setInterval(fetchStatus, 5000); // Poll every 5 seconds

    return () => clearInterval(interval);
  }, [sessionId, onComplete]);

  const formatTimeRemaining = (ms: number) => {
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const days = Math.floor(hours / 24);

    if (days > 0) return `~${days} day${days > 1 ? 's' : ''}`;
    if (hours > 0) return `~${hours} hour${hours > 1 ? 's' : ''}`;
    return '< 1 hour';
  };

  const getStatusIcon = (status: SubmissionAttempt['status']) => {
    switch (status) {
      case 'approved':
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case 'rejected':
        return <XCircle className="w-5 h-5 text-red-500" />;
      case 'in_review':
        return <Clock className="w-5 h-5 text-blue-500" />;
      case 'submitted':
        return <Loader2 className="w-5 h-5 text-accent animate-spin" />;
      default:
        return <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />;
    }
  };

  const getStatusBadge = (status: SubmissionSession['status']) => {
    const config = {
      in_progress: { label: 'In Progress', variant: 'default' as const },
      approved: { label: 'Approved', variant: 'default' as const },
      abandoned: { label: 'Abandoned', variant: 'destructive' as const },
      manual_review_needed: { label: 'Manual Review Needed', variant: 'destructive' as const },
    };

    const { label, variant } = config[status] || config.in_progress;

    return (
      <Badge variant={variant} className={cn(
        status === 'approved' && 'bg-green-500 text-white',
        status === 'in_progress' && 'bg-accent text-white'
      )}>
        {label}
      </Badge>
    );
  };

  if (isLoading || !session) {
    return (
      <Card className="glass-panel">
        <CardContent className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-accent" />
        </CardContent>
      </Card>
    );
  }

  const currentAttempt = session.attempts[session.attempts.length - 1];
  const progressPercentage = session.status === 'approved' ? 100 : (session.totalIterations / 10) * 100;

  return (
    <div className="space-y-6">
      {/* Header Status Card */}
      <Card className="glass-panel border-2 border-accent/20">
        <CardHeader>
          <div className="flex items-start justify-between">
            <div>
              <CardTitle className="text-2xl flex items-center gap-3">
                <Sparkles className="w-6 h-6 text-accent" />
                {session.appName}
              </CardTitle>
              <CardDescription className="text-base mt-2">
                Publishing to {session.platform === 'all' ? 'App Store & Play Store' : session.platform === 'ios' ? 'App Store' : 'Play Store'}
              </CardDescription>
            </div>
            {getStatusBadge(session.status)}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Current Stage */}
          <div className="p-4 bg-muted/30 rounded-lg">
            <div className="flex items-center gap-3 mb-2">
              <Loader2 className={cn(
                "w-4 h-4",
                session.status === 'in_progress' ? 'animate-spin text-accent' : 'text-muted-foreground'
              )} />
              <span className="font-semibold">{session.currentStage}</span>
            </div>
            {session.estimatedTimeRemaining && session.status === 'in_progress' && (
              <p className="text-sm text-muted-foreground ml-7">
                Estimated time: {formatTimeRemaining(session.estimatedTimeRemaining)}
              </p>
            )}
          </div>

          {/* Progress Bar */}
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Overall Progress</span>
              <span className="font-medium">
                {session.totalIterations} / 10 attempts
              </span>
            </div>
            <Progress
              value={progressPercentage}
              className={cn(
                "h-3",
                session.status === 'approved'
                  ? "[&>div]:bg-green-500"
                  : "[&>div]:bg-gradient-to-r [&>div]:from-accent [&>div]:to-purple"
              )}
            />
          </div>

          {/* Key Metrics */}
          <div className="grid grid-cols-3 gap-4 pt-2">
            <div className="text-center p-3 bg-muted/20 rounded-lg">
              <div className="text-2xl font-bold text-foreground">
                {session.attempts.length}
              </div>
              <div className="text-xs text-muted-foreground">Total Attempts</div>
            </div>
            <div className="text-center p-3 bg-muted/20 rounded-lg">
              <div className="text-2xl font-bold text-foreground">
                {session.attempts.filter(a => a.status === 'rejected').length}
              </div>
              <div className="text-xs text-muted-foreground">Rejections</div>
            </div>
            <div className="text-center p-3 bg-muted/20 rounded-lg">
              <div className="text-2xl font-bold text-foreground">
                {session.attempts.reduce((sum, a) => sum + (a.fixesApplied?.length || 0), 0)}
              </div>
              <div className="text-xs text-muted-foreground">AI Fixes</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Timeline Feed */}
      <Card className="glass-panel">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="w-5 h-5" />
            Submission Timeline
          </CardTitle>
          <CardDescription>
            Live updates - showing each attempt and AI-powered fixes
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-4">
              {session.attempts.map((attempt, index) => (
                <div
                  key={index}
                  className={cn(
                    "border-l-2 pl-4 pb-4",
                    attempt.status === 'approved' ? 'border-green-500' :
                    attempt.status === 'rejected' ? 'border-red-500' :
                    'border-accent'
                  )}
                >
                  {/* Attempt Header */}
                  <div className="flex items-start gap-3 mb-2">
                    {getStatusIcon(attempt.status)}
                    <div className="flex-1">
                      <div className="font-semibold">
                        Attempt #{attempt.attemptNumber}
                      </div>
                      <div className="text-sm text-muted-foreground">
                        {new Date(attempt.timestamp).toLocaleString()}
                      </div>
                    </div>
                    <Badge variant="outline">
                      {attempt.store === 'app_store' ? 'App Store' : 'Play Store'}
                    </Badge>
                  </div>

                  {/* Rejection Reasons */}
                  {attempt.rejectionReasons && attempt.rejectionReasons.length > 0 && (
                    <div className="mt-3 ml-8 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-red-500">
                        <AlertTriangle className="w-4 h-4" />
                        {attempt.rejectionReasons.length} Issue{attempt.rejectionReasons.length > 1 ? 's' : ''} Found
                      </div>
                      {attempt.rejectionReasons.map((reason, idx) => (
                        <div key={idx} className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs">
                              {reason.category}
                            </Badge>
                            <Badge variant={reason.severity === 'blocking' ? 'destructive' : 'default'} className="text-xs">
                              {reason.severity}
                            </Badge>
                          </div>
                          <p className="text-sm text-foreground/90">{reason.message}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* AI Fixes Applied */}
                  {attempt.fixesApplied && attempt.fixesApplied.length > 0 && (
                    <div className="mt-3 ml-8 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium text-accent">
                        <Sparkles className="w-4 h-4" />
                        {attempt.fixesApplied.length} AI-Powered Fix{attempt.fixesApplied.length > 1 ? 'es' : ''} Applied
                      </div>
                      {attempt.fixesApplied.map((fix, idx) => (
                        <div key={idx} className="p-3 bg-accent/10 border border-accent/20 rounded-lg">
                          <div className="flex items-center gap-2 mb-1">
                            <Badge variant="outline" className="text-xs bg-accent/20">
                              {fix.aiModel.toUpperCase()}
                            </Badge>
                            <div className="text-xs text-muted-foreground">
                              Confidence: {(fix.confidence * 100).toFixed(0)}%
                            </div>
                          </div>
                          <p className="text-sm text-foreground/90">{fix.action}</p>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Approved Message */}
                  {attempt.status === 'approved' && (
                    <div className="mt-3 ml-8 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                      <div className="flex items-center gap-2 text-green-500 font-semibold">
                        <CheckCircle2 className="w-5 h-5" />
                        Approved and Live!
                      </div>
                      <p className="text-sm text-foreground/90 mt-1">
                        Your app is now available on the store
                      </p>
                    </div>
                  )}
                </div>
              ))}

              {/* Manual Review Needed Warning */}
              {session.status === 'manual_review_needed' && (
                <div className="p-4 bg-orange-500/10 border-2 border-orange-500/20 rounded-lg">
                  <div className="flex items-center gap-2 text-orange-500 font-semibold mb-2">
                    <AlertTriangle className="w-5 h-5" />
                    Manual Review Required
                  </div>
                  <p className="text-sm text-foreground/90">
                    The AI has reached the maximum number of automatic attempts.
                    Please review the issues manually or contact support for assistance.
                  </p>
                </div>
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Expectation Setting */}
      <Card className="glass-panel border-accent/20">
        <CardContent className="p-4">
          <p className="text-sm text-muted-foreground">
            <strong>Timeline expectations:</strong> Simple apps typically take 1-3 days,
            while complex apps may require 4-6 weeks due to multiple review cycles.
            The AI will continue working automatically to address any rejections.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};

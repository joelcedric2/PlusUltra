import { EventEmitter } from 'events';
import { WorkspaceManager, Workspace } from './WorkspaceManager';
import { LivePreviewService } from './LivePreviewService';

export interface TCIIssue {
  id: string;
  workspaceId: string;
  type: 'error' | 'warning' | 'performance' | 'security';
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  file?: string;
  line?: number;
  detectedAt: Date;
  autoFixable: boolean;
  suggestedFix?: string;
  metadata?: Record<string, any>;
}

export interface TCIFix {
  issueId: string;
  status: 'pending' | 'applied' | 'failed' | 'verified';
  appliedAt?: Date;
  verifiedAt?: Date;
  changes: Map<string, string>; // file path -> new content
  rollback?: Map<string, string>; // backup for rollback
}

export interface TCIHealthCheck {
  workspaceId: string;
  timestamp: Date;
  status: 'healthy' | 'degraded' | 'unhealthy';
  issues: TCIIssue[];
  metrics: {
    errorCount: number;
    warningCount: number;
    performanceScore: number; // 0-100
    uptime: number; // milliseconds
  };
}

/**
 * TCISandboxMonitor
 * Integrates Temporal Code Intelligence with sandbox environments
 * Provides real-time monitoring, error detection, and self-healing capabilities
 */
export class TCISandboxMonitor extends EventEmitter {
  private workspaceManager: WorkspaceManager;
  private livePreview: LivePreviewService;
  private monitoredWorkspaces: Map<string, NodeJS.Timer> = new Map();
  private detectedIssues: Map<string, TCIIssue[]> = new Map();
  private appliedFixes: Map<string, TCIFix> = new Map();
  private readonly MONITOR_INTERVAL = 10000; // 10 seconds
  private readonly AUTO_FIX_ENABLED = true;

  constructor(workspaceManager: WorkspaceManager, livePreview: LivePreviewService) {
    super();
    this.workspaceManager = workspaceManager;
    this.livePreview = livePreview;

    this.setupWorkspaceListeners();
  }

  /**
   * Start monitoring a workspace
   */
  async startMonitoring(workspaceId: string): Promise<void> {
    if (this.monitoredWorkspaces.has(workspaceId)) {
      return; // Already monitoring
    }

    const timer = setInterval(async () => {
      await this.performHealthCheck(workspaceId);
    }, this.MONITOR_INTERVAL);

    this.monitoredWorkspaces.set(workspaceId, timer);

    // Perform initial health check
    await this.performHealthCheck(workspaceId);

    this.emit('monitoring:started', { workspaceId });
  }

  /**
   * Stop monitoring a workspace
   */
  stopMonitoring(workspaceId: string): void {
    const timer = this.monitoredWorkspaces.get(workspaceId);
    if (timer) {
      clearInterval(timer as any);
      this.monitoredWorkspaces.delete(workspaceId);
    }

    this.detectedIssues.delete(workspaceId);
    this.emit('monitoring:stopped', { workspaceId });
  }

  /**
   * Perform health check on workspace
   */
  async performHealthCheck(workspaceId: string): Promise<TCIHealthCheck> {
    try {
      const workspace = await this.workspaceManager.getWorkspace(workspaceId);
      if (!workspace) {
        throw new Error('Workspace not found');
      }

      // Get container logs for error detection
      const logs = await this.workspaceManager.getWorkspaceLogs(workspaceId, 100);

      // Analyze logs for issues
      const issues = await this.analyzeLogs(workspaceId, logs);

      // Get resource stats
      const stats = await this.workspaceManager.getWorkspaceStats(workspaceId);

      // Calculate health metrics
      const errorCount = issues.filter(i => i.type === 'error').length;
      const warningCount = issues.filter(i => i.type === 'warning').length;
      const performanceScore = this.calculatePerformanceScore(stats);

      const health: TCIHealthCheck = {
        workspaceId,
        timestamp: new Date(),
        status: errorCount > 0 ? 'unhealthy' : warningCount > 0 ? 'degraded' : 'healthy',
        issues,
        metrics: {
          errorCount,
          warningCount,
          performanceScore,
          uptime: Date.now() - (workspace.sandboxStatus?.startedAt?.getTime() || Date.now())
        }
      };

      // Store detected issues
      this.detectedIssues.set(workspaceId, issues);

      // Emit health update
      this.emit('health:checked', health);

      // Auto-fix critical issues if enabled
      if (this.AUTO_FIX_ENABLED) {
        await this.autoFixIssues(workspaceId, issues);
      }

      // Broadcast to live preview
      await this.livePreview.broadcastLog(
        workspaceId,
        `Health Check: ${health.status} - ${errorCount} errors, ${warningCount} warnings`,
        health.status === 'unhealthy' ? 'error' : 'info'
      );

      return health;

    } catch (error) {
      console.error('Error performing health check:', error);
      throw error;
    }
  }

  /**
   * Analyze logs to detect issues
   */
  private async analyzeLogs(workspaceId: string, logs: string[]): Promise<TCIIssue[]> {
    const issues: TCIIssue[] = [];

    for (const log of logs) {
      // Detect errors
      if (this.isError(log)) {
        const issue = this.parseErrorLog(workspaceId, log);
        if (issue) {
          issues.push(issue);
        }
      }

      // Detect warnings
      if (this.isWarning(log)) {
        const issue = this.parseWarningLog(workspaceId, log);
        if (issue) {
          issues.push(issue);
        }
      }

      // Detect performance issues
      if (this.isPerformanceIssue(log)) {
        const issue = this.parsePerformanceLog(workspaceId, log);
        if (issue) {
          issues.push(issue);
        }
      }

      // Detect security issues
      if (this.isSecurityIssue(log)) {
        const issue = this.parseSecurityLog(workspaceId, log);
        if (issue) {
          issues.push(issue);
        }
      }
    }

    return issues;
  }

  /**
   * Auto-fix detected issues
   */
  private async autoFixIssues(workspaceId: string, issues: TCIIssue[]): Promise<void> {
    const fixableIssues = issues.filter(i => i.autoFixable && i.severity === 'critical');

    for (const issue of fixableIssues) {
      try {
        await this.applyFix(workspaceId, issue);
      } catch (error) {
        console.error('Error auto-fixing issue:', error);
        await this.livePreview.broadcastLog(
          workspaceId,
          `Failed to auto-fix: ${issue.title}`,
          'error'
        );
      }
    }
  }

  /**
   * Apply fix for an issue
   */
  async applyFix(workspaceId: string, issue: TCIIssue): Promise<TCIFix> {
    if (!issue.suggestedFix) {
      throw new Error('No suggested fix available');
    }

    const fix: TCIFix = {
      issueId: issue.id,
      status: 'pending',
      changes: new Map(),
      rollback: new Map()
    };

    try {
      // Generate fix based on issue type
      const changes = await this.generateFix(issue);

      // Apply changes to workspace
      await this.workspaceManager.updateWorkspaceFiles(workspaceId, changes);

      fix.changes = changes;
      fix.status = 'applied';
      fix.appliedAt = new Date();

      this.appliedFixes.set(issue.id, fix);

      // Broadcast fix applied
      await this.livePreview.broadcastLog(
        workspaceId,
        `Auto-fixed: ${issue.title}`,
        'info'
      );

      this.emit('fix:applied', { workspaceId, issue, fix });

      // Verify fix after a delay
      setTimeout(async () => {
        await this.verifyFix(workspaceId, issue.id);
      }, 5000);

      return fix;

    } catch (error) {
      fix.status = 'failed';
      this.emit('fix:failed', { workspaceId, issue, error });
      throw error;
    }
  }

  /**
   * Verify that a fix resolved the issue
   */
  private async verifyFix(workspaceId: string, issueId: string): Promise<boolean> {
    const fix = this.appliedFixes.get(issueId);
    if (!fix) return false;

    // Perform health check to see if issue is resolved
    const health = await this.performHealthCheck(workspaceId);

    const issueResolved = !health.issues.some(i => i.id === issueId);

    if (issueResolved) {
      fix.status = 'verified';
      fix.verifiedAt = new Date();
      this.emit('fix:verified', { workspaceId, issueId });

      await this.livePreview.broadcastLog(
        workspaceId,
        `Fix verified successfully`,
        'info'
      );
    } else {
      // Fix didn't work, rollback if possible
      if (fix.rollback && fix.rollback.size > 0) {
        await this.workspaceManager.updateWorkspaceFiles(workspaceId, fix.rollback);
        await this.livePreview.broadcastLog(
          workspaceId,
          `Fix failed verification, rolled back changes`,
          'warn'
        );
      }
    }

    return issueResolved;
  }

  /**
   * Get current issues for workspace
   */
  getWorkspaceIssues(workspaceId: string): TCIIssue[] {
    return this.detectedIssues.get(workspaceId) || [];
  }

  /**
   * Get applied fixes for workspace
   */
  getWorkspaceFixes(workspaceId: string): TCIFix[] {
    return Array.from(this.appliedFixes.values()).filter(
      fix => {
        const issue = Array.from(this.detectedIssues.values())
          .flat()
          .find(i => i.id === fix.issueId);
        return issue?.workspaceId === workspaceId;
      }
    );
  }

  /**
   * Private helper methods
   */

  private isError(log: string): boolean {
    return /error|exception|failed|fatal/i.test(log);
  }

  private isWarning(log: string): boolean {
    return /warn|warning|deprecated/i.test(log);
  }

  private isPerformanceIssue(log: string): boolean {
    return /slow|timeout|performance|memory leak/i.test(log);
  }

  private isSecurityIssue(log: string): boolean {
    return /security|vulnerability|exposed|unsafe/i.test(log);
  }

  private parseErrorLog(workspaceId: string, log: string): TCIIssue | null {
    // Extract error details from log
    const errorMatch = log.match(/Error: (.+)/);
    if (!errorMatch) return null;

    const fileMatch = log.match(/at .+ \((.+):(\d+):\d+\)/);

    return {
      id: `issue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      workspaceId,
      type: 'error',
      severity: 'critical',
      title: errorMatch[1],
      description: log,
      file: fileMatch?.[1],
      line: fileMatch ? parseInt(fileMatch[2]) : undefined,
      detectedAt: new Date(),
      autoFixable: this.isAutoFixable(errorMatch[1]),
      suggestedFix: this.suggestFix(errorMatch[1])
    };
  }

  private parseWarningLog(workspaceId: string, log: string): TCIIssue | null {
    return {
      id: `issue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      workspaceId,
      type: 'warning',
      severity: 'medium',
      title: log.substring(0, 100),
      description: log,
      detectedAt: new Date(),
      autoFixable: false
    };
  }

  private parsePerformanceLog(workspaceId: string, log: string): TCIIssue | null {
    return {
      id: `issue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      workspaceId,
      type: 'performance',
      severity: 'high',
      title: 'Performance issue detected',
      description: log,
      detectedAt: new Date(),
      autoFixable: false
    };
  }

  private parseSecurityLog(workspaceId: string, log: string): TCIIssue | null {
    return {
      id: `issue_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      workspaceId,
      type: 'security',
      severity: 'critical',
      title: 'Security issue detected',
      description: log,
      detectedAt: new Date(),
      autoFixable: false
    };
  }

  private isAutoFixable(error: string): boolean {
    // Common auto-fixable errors
    const autoFixablePatterns = [
      /Cannot find module/,
      /Module not found/,
      /is not defined/,
      /Missing dependency/,
      /Unexpected token/
    ];

    return autoFixablePatterns.some(pattern => pattern.test(error));
  }

  private suggestFix(error: string): string | undefined {
    if (/Cannot find module/.test(error) || /Module not found/.test(error)) {
      return 'Install missing dependency';
    }
    if (/is not defined/.test(error)) {
      return 'Add missing import or declaration';
    }
    return undefined;
  }

  private async generateFix(issue: TCIIssue): Promise<Map<string, string>> {
    const changes = new Map<string, string>();

    // This is a simplified version - in production, use AI/TCI to generate actual fixes
    if (issue.suggestedFix?.includes('Install missing dependency')) {
      // Example: add to package.json or run npm install
      // For now, return empty changes - would need to integrate with package manager
    }

    return changes;
  }

  private calculatePerformanceScore(stats: any): number {
    // Calculate score based on CPU and memory usage
    const cpuScore = Math.max(0, 100 - stats.cpu);
    const memoryScore = Math.max(0, 100 - (stats.memory / 10)); // Assuming max 1GB = 1024MB

    return Math.round((cpuScore + memoryScore) / 2);
  }

  private setupWorkspaceListeners(): void {
    this.workspaceManager.on('workspace:created', (workspace: Workspace) => {
      // Auto-start monitoring for new workspaces
      this.startMonitoring(workspace.id);
    });

    this.workspaceManager.on('workspace:destroyed', ({ workspaceId }: any) => {
      this.stopMonitoring(workspaceId);
    });
  }

  /**
   * Shutdown
   */
  async shutdown(): Promise<void> {
    console.log('Shutting down TCISandboxMonitor...');

    // Stop all monitoring
    for (const workspaceId of this.monitoredWorkspaces.keys()) {
      this.stopMonitoring(workspaceId);
    }
  }
}

export default TCISandboxMonitor;

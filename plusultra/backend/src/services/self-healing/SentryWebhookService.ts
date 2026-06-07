/**
 * Sentry Webhook Service
 *
 * Receives error notifications from Sentry webhooks and processes them
 * for self-healing. Extracts error context and triggers healing workflow.
 */

import { prisma } from '../../lib/prisma';
import crypto from 'crypto';

export interface SentryWebhookPayload {
  id: string;
  project: string;
  project_name: string;
  project_slug: string;
  event: {
    event_id: string;
    timestamp: string;
    received: string;
    platform: string;
    tags: Array<{ key: string; value: string }>;
    user?: {
      id?: string;
      username?: string;
      email?: string;
      ip_address?: string;
    };
    contexts?: {
      runtime?: { name: string; version: string };
      browser?: { name: string; version: string };
      os?: { name: string; version: string };
    };
    exception?: {
      values: Array<{
        type: string;
        value: string;
        mechanism?: {
          type: string;
          handled: boolean;
        };
        stacktrace?: {
          frames: Array<{
            filename: string;
            function: string;
            lineno: number;
            colno: number;
            abs_path?: string;
            context_line?: string;
            pre_context?: string[];
            post_context?: string[];
            vars?: Record<string, any>;
            in_app: boolean;
          }>;
        };
      }>;
    };
    request?: {
      url: string;
      method: string;
      headers: Record<string, string>;
      query_string?: string;
      data?: any;
      env?: Record<string, string>;
    };
    environment: string;
    level: string; // fatal, error, warning, info, debug
    culprit?: string;
    message?: string;
  };
  url: string;
  web_url: string;
}

export interface ProcessedError {
  id: string;
  sentryEventId: string;
  errorMessage: string;
  errorType: string;
  stackTrace: string;
  filePath: string | null;
  lineNumber: number | null;
  columnNumber: number | null;
  severity: string;
  environment: string;
}

export class SentryWebhookService {
  /**
   * Verify Sentry webhook signature
   */
  verifySignature(payload: string, signature: string, secret: string): boolean {
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(payload, 'utf8');
    const digest = hmac.digest('hex');
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(digest)
    );
  }

  /**
   * Process incoming Sentry webhook
   */
  async processWebhook(payload: SentryWebhookPayload): Promise<ProcessedError | null> {
    console.log('[Sentry Webhook] Received error:', payload.event.event_id);

    // Extract error information
    const exception = payload.event.exception?.values[0];
    if (!exception) {
      console.log('[Sentry Webhook] No exception data, skipping');
      return null;
    }

    const errorMessage = exception.value || 'Unknown error';
    const errorType = exception.type || 'Error';
    const stackTrace = this.formatStackTrace(exception as any);

    // Find the first in-app frame (user's code, not library code)
    const inAppFrame = exception.stacktrace?.frames.find(f => f.in_app);
    const filePath = inAppFrame?.filename || exception.stacktrace?.frames[0]?.filename || null;
    const lineNumber = inAppFrame?.lineno || exception.stacktrace?.frames[0]?.lineno || null;
    const columnNumber = inAppFrame?.colno || exception.stacktrace?.frames[0]?.colno || null;

    // Determine severity
    const severity = this.mapSentryLevel(payload.event.level);

    // Check if this error already exists
    const existingError = await prisma.sentryError.findUnique({
      where: { sentryEventId: payload.event.event_id },
    });

    if (existingError) {
      // Update occurrence count and last seen
      await prisma.sentryError.update({
        where: { id: existingError.id },
        data: {
          occurrenceCount: { increment: 1 },
          lastSeen: new Date(),
        },
      });

      console.log(`[Sentry Webhook] Updated existing error: ${existingError.id}`);
      return {
        id: existingError.id,
        sentryEventId: existingError.sentryEventId,
        errorMessage: existingError.errorMessage,
        errorType: existingError.errorType,
        stackTrace: existingError.stackTrace,
        filePath: existingError.filePath,
        lineNumber: existingError.lineNumber,
        columnNumber: existingError.columnNumber,
        severity: existingError.severity,
        environment: existingError.environment,
      };
    }

    // Create new error record
    const newError = await prisma.sentryError.create({
      data: {
        sentryEventId: payload.event.event_id,
        projectId: payload.project,
        environment: payload.event.environment,
        errorMessage,
        errorType,
        stackTrace,
        filePath,
        lineNumber,
        columnNumber,
        userContext: payload.event.user ? (payload.event.user as any) : null,
        requestContext: payload.event.request ? {
          url: payload.event.request.url,
          method: payload.event.request.method,
          headers: payload.event.request.headers,
        } : {},
        severity,
        status: 'new',
      },
    });

    console.log(`[Sentry Webhook] Created new error: ${newError.id}`);

    return {
      id: newError.id,
      sentryEventId: newError.sentryEventId,
      errorMessage: newError.errorMessage,
      errorType: newError.errorType,
      stackTrace: newError.stackTrace,
      filePath: newError.filePath,
      lineNumber: newError.lineNumber,
      columnNumber: newError.columnNumber,
      severity: newError.severity,
      environment: newError.environment,
    };
  }

  /**
   * Format stack trace for storage
   */
  private formatStackTrace(stacktrace?: SentryWebhookPayload['event']['exception']): string {
    if (!(stacktrace as any)?.values?.[0]?.stacktrace?.frames) return '';

    return (stacktrace as any).values[0].stacktrace.frames
      .reverse() // Sentry sends frames in reverse order
      .map((frame: any) => {
        const location = `${frame.filename}:${frame.lineno}:${frame.colno}`;
        const func = frame.function || '<anonymous>';
        return `  at ${func} (${location})`;
      })
      .join('\n');
  }

  /**
   * Map Sentry level to our severity
   */
  private mapSentryLevel(level: string): string {
    const mapping: Record<string, string> = {
      fatal: 'fatal',
      error: 'error',
      warning: 'warning',
      info: 'info',
      debug: 'info',
    };
    return mapping[level] || 'error';
  }

  /**
   * Check if error should trigger healing
   */
  async shouldTriggerHealing(errorId: string): Promise<boolean> {
    const error = await prisma.sentryError.findUnique({
      where: { id: errorId },
      include: {
        healingAttempts: {
          orderBy: { startedAt: 'desc' },
          take: 1,
        },
      },
    });

    if (!error) return false;

    // Don't heal if already in progress
    if (error.status === 'healing') {
      console.log(`[Healing Check] Error ${errorId} already healing`);
      return false;
    }

    // Don't heal if already healed
    if (error.status === 'healed' || error.resolved) {
      console.log(`[Healing Check] Error ${errorId} already healed`);
      return false;
    }

    // Don't heal warnings or info level errors
    if (error.severity === 'warning' || error.severity === 'info') {
      console.log(`[Healing Check] Error ${errorId} severity too low: ${error.severity}`);
      return false;
    }

    // Don't heal if in cooldown
    if (error.status === 'cooldown') {
      console.log(`[Healing Check] Error ${errorId} in cooldown`);
      return false;
    }

    // Get project configuration
    const config = error.projectId
      ? await prisma.healingConfig.findUnique({
          where: { projectId: error.projectId },
        })
      : null;

    // Check if healing is enabled
    if (!config || !config.enabled) {
      console.log(`[Healing Check] Healing not enabled for project ${error.projectId}`);
      return false;
    }

    // Check environment restrictions
    if (error.environment === 'production' && !config.autoHealProduction) {
      console.log(`[Healing Check] Auto-heal disabled for production`);
      return false;
    }

    // Check emergency kill switch
    if (config.emergencyKillSwitch) {
      console.log(`[Healing Check] Emergency kill switch activated`);
      return false;
    }

    // Check rate limiting (attempts in last hour)
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const recentAttempts = await prisma.healingAttempt.count({
      where: {
        errorId,
        startedAt: { gte: oneHourAgo },
      },
    });

    if (recentAttempts >= config.maxAttemptsPerHour) {
      console.log(`[Healing Check] Rate limit exceeded: ${recentAttempts}/${config.maxAttemptsPerHour}`);
      return false;
    }

    // Check total attempts for this error
    const totalAttempts = await prisma.healingAttempt.count({
      where: { errorId },
    });

    if (totalAttempts >= config.maxAttemptsPerError) {
      console.log(`[Healing Check] Max attempts reached: ${totalAttempts}/${config.maxAttemptsPerError}`);
      return false;
    }

    console.log(`[Healing Check] Error ${errorId} eligible for healing`);
    return true;
  }

  /**
   * Get error details for healing
   */
  async getErrorDetails(errorId: string): Promise<any> {
    const error = await prisma.sentryError.findUnique({
      where: { id: errorId },
      include: {
        healingAttempts: {
          orderBy: { startedAt: 'desc' },
          take: 5,
        },
      },
    });

    return error;
  }
}

export const sentryWebhookService = new SentryWebhookService();

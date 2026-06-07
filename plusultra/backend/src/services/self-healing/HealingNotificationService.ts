/**
 * Healing Notification Service
 *
 * Sends notifications about healing attempts via multiple channels:
 * - Slack
 * - Email
 * - In-app (WebSocket)
 * - Webhooks
 */

import { prisma } from '../../lib/prisma';

// Stub function for sendEmail - implement with actual email service
async function sendEmail(to: string, subject: string, text: string, html: string, from?: string): Promise<void> {
  console.log(`[Email] To: ${to}, Subject: ${subject}, From: ${from || 'noreply@plusultra.app'}`);
}

export type NotificationChannel = 'slack' | 'email' | 'inapp' | 'webhook';

export type NotificationEvent =
  | 'attempt_started'
  | 'attempt_success'
  | 'attempt_failed'
  | 'fix_deployed'
  | 'rollback_triggered'
  | 'human_review_required';

export interface NotificationPayload {
  event: NotificationEvent;
  attemptId: string;
  errorId: string;
  projectId: string | null;
  environment: string;
  errorMessage: string;
  errorType: string;
  confidence?: number;
  fixDescription?: string;
  metadata?: Record<string, any>;
}

export interface NotificationConfig {
  slack?: {
    webhookUrl: string;
    channel?: string;
    username?: string;
  };
  email?: {
    to: string[];
    from: string;
    smtpHost?: string;
    smtpPort?: number;
    smtpUser?: string;
    smtpPass?: string;
  };
  webhook?: {
    url: string;
    headers?: Record<string, string>;
  };
}

export class HealingNotificationService {
  /**
   * Send notification based on healing config
   */
  async notify(payload: NotificationPayload): Promise<void> {
    try {
      // Get healing config for project
      const config = payload.projectId
        ? await prisma.healingConfig.findUnique({
            where: { projectId: payload.projectId },
          })
        : null;

      if (!config) {
        console.log('[Healing Notifications] No config found, skipping notifications');
        return;
      }

      // Check if notifications are enabled for this event
      const shouldNotify = this.shouldNotifyForEvent(payload.event, config);

      if (!shouldNotify) {
        console.log(`[Healing Notifications] Notifications disabled for ${payload.event}`);
        return;
      }

      // Get notification channels from config
      const notificationConfig = config.notificationChannels as NotificationConfig;

      if (!notificationConfig) {
        console.log('[Healing Notifications] No notification channels configured');
        return;
      }

      // Send to all configured channels
      const promises: Promise<void>[] = [];

      if (notificationConfig.slack) {
        promises.push(this.sendSlackNotification(payload, notificationConfig.slack));
      }

      if (notificationConfig.email) {
        promises.push(this.sendEmailNotification(payload, notificationConfig.email));
      }

      if (notificationConfig.webhook) {
        promises.push(this.sendWebhookNotification(payload, notificationConfig.webhook));
      }

      // Always send in-app notification
      promises.push(this.sendInAppNotification(payload));

      await Promise.allSettled(promises);

      console.log(`[Healing Notifications] Sent ${payload.event} notifications for attempt ${payload.attemptId}`);

    } catch (error: any) {
      console.error('[Healing Notifications] Failed to send notifications:', error);
    }
  }

  /**
   * Determine if we should notify for this event based on config
   */
  private shouldNotifyForEvent(event: NotificationEvent, config: any): boolean {
    switch (event) {
      case 'attempt_started':
        return config.notifyOnAttempt || false;

      case 'attempt_success':
      case 'fix_deployed':
        return config.notifyOnSuccess || false;

      case 'attempt_failed':
      case 'rollback_triggered':
        return config.notifyOnFailure || false;

      case 'human_review_required':
        return true; // Always notify for human review

      default:
        return false;
    }
  }

  /**
   * Send Slack notification
   */
  private async sendSlackNotification(
    payload: NotificationPayload,
    slackConfig: NonNullable<NotificationConfig['slack']>
  ): Promise<void> {
    try {
      const message = this.formatSlackMessage(payload);

      const response = await fetch(slackConfig.webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          channel: slackConfig.channel,
          username: slackConfig.username || 'PlusUltra Self-Healing',
          ...message,
        }),
      });

      if (!response.ok) {
        throw new Error(`Slack API error: ${response.statusText}`);
      }

      console.log('[Healing Notifications] Sent Slack notification');

    } catch (error: any) {
      console.error('[Healing Notifications] Failed to send Slack notification:', error);
      throw error;
    }
  }

  /**
   * Format Slack message with rich formatting
   */
  private formatSlackMessage(payload: NotificationPayload): any {
    const { event, errorMessage, errorType, environment, confidence, fixDescription } = payload;

    // Determine color and emoji based on event
    let color: string;
    let emoji: string;
    let title: string;

    switch (event) {
      case 'attempt_started':
        color = '#36a64f'; // Green
        emoji = '🔧';
        title = 'Self-Healing Attempt Started';
        break;

      case 'attempt_success':
      case 'fix_deployed':
        color = '#2eb886'; // Success green
        emoji = '✅';
        title = 'Self-Healing Successful';
        break;

      case 'attempt_failed':
        color = '#ff0000'; // Red
        emoji = '❌';
        title = 'Self-Healing Failed';
        break;

      case 'rollback_triggered':
        color = '#ff9900'; // Orange
        emoji = '⚠️';
        title = 'Self-Healing Rollback';
        break;

      case 'human_review_required':
        color = '#ffcc00'; // Yellow
        emoji = '👁️';
        title = 'Human Review Required';
        break;

      default:
        color = '#cccccc';
        emoji = 'ℹ️';
        title = 'Self-Healing Event';
    }

    const fields = [
      {
        title: 'Error Type',
        value: errorType,
        short: true,
      },
      {
        title: 'Environment',
        value: environment,
        short: true,
      },
      {
        title: 'Error Message',
        value: `\`${errorMessage.substring(0, 100)}${errorMessage.length > 100 ? '...' : ''}\``,
        short: false,
      },
    ];

    if (confidence !== undefined) {
      fields.push({
        title: 'Confidence',
        value: `${(confidence * 100).toFixed(0)}%`,
        short: true,
      });
    }

    if (fixDescription) {
      fields.push({
        title: 'Fix Description',
        value: fixDescription.substring(0, 200),
        short: false,
      });
    }

    return {
      text: `${emoji} ${title}`,
      attachments: [
        {
          color,
          title,
          fields,
          footer: 'PlusUltra Self-Healing',
          ts: Math.floor(Date.now() / 1000),
        },
      ],
    };
  }

  /**
   * Send email notification
   */
  private async sendEmailNotification(
    payload: NotificationPayload,
    emailConfig: NonNullable<NotificationConfig['email']>
  ): Promise<void> {
    try {
      const subject = this.getEmailSubject(payload.event);
      const body = this.formatEmailBody(payload);

      await sendEmail(
        emailConfig.to.join(', '),
        subject,
        body,
        body, // Sending HTML as well
        emailConfig.from
      );

      console.log('[Healing Notifications] Sent email notification');

    } catch (error: any) {
      console.error('[Healing Notifications] Failed to send email notification:', error);
      throw error;
    }
  }

  /**
   * Get email subject based on event
   */
  private getEmailSubject(event: NotificationEvent): string {
    switch (event) {
      case 'attempt_started':
        return '[PlusUltra] Self-Healing Attempt Started';
      case 'attempt_success':
        return '[PlusUltra] Self-Healing Successful ✅';
      case 'attempt_failed':
        return '[PlusUltra] Self-Healing Failed ❌';
      case 'fix_deployed':
        return '[PlusUltra] Fix Deployed Successfully 🚀';
      case 'rollback_triggered':
        return '[PlusUltra] Self-Healing Rollback Triggered ⚠️';
      case 'human_review_required':
        return '[PlusUltra] Human Review Required 👁️';
      default:
        return '[PlusUltra] Self-Healing Notification';
    }
  }

  /**
   * Format email body with HTML
   */
  private formatEmailBody(payload: NotificationPayload): string {
    const { event, errorMessage, errorType, environment, confidence, fixDescription, metadata } = payload;

    return `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: #2563eb; color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border-radius: 0 0 8px 8px; }
    .field { margin: 10px 0; }
    .label { font-weight: bold; color: #4b5563; }
    .value { margin-left: 10px; }
    .code { background: #1f2937; color: #f3f4f6; padding: 10px; border-radius: 4px; overflow-x: auto; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>🔧 PlusUltra Self-Healing System</h2>
      <p>${this.getEventDescription(event)}</p>
    </div>
    <div class="content">
      <div class="field">
        <span class="label">Error Type:</span>
        <span class="value">${errorType}</span>
      </div>
      <div class="field">
        <span class="label">Environment:</span>
        <span class="value">${environment}</span>
      </div>
      <div class="field">
        <span class="label">Error Message:</span>
        <div class="code">${errorMessage}</div>
      </div>
      ${confidence !== undefined ? `
        <div class="field">
          <span class="label">Confidence:</span>
          <span class="value">${(confidence * 100).toFixed(0)}%</span>
        </div>
      ` : ''}
      ${fixDescription ? `
        <div class="field">
          <span class="label">Fix Description:</span>
          <div class="value">${fixDescription}</div>
        </div>
      ` : ''}
      <div class="field">
        <span class="label">Attempt ID:</span>
        <span class="value">${payload.attemptId}</span>
      </div>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * Get event description for email
   */
  private getEventDescription(event: NotificationEvent): string {
    switch (event) {
      case 'attempt_started':
        return 'A new self-healing attempt has been started';
      case 'attempt_success':
        return 'Self-healing attempt completed successfully';
      case 'attempt_failed':
        return 'Self-healing attempt failed';
      case 'fix_deployed':
        return 'Fix has been deployed to production';
      case 'rollback_triggered':
        return 'Deployment has been rolled back due to health check failure';
      case 'human_review_required':
        return 'This fix requires human review before deployment';
      default:
        return 'Self-healing system notification';
    }
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(
    payload: NotificationPayload,
    webhookConfig: NonNullable<NotificationConfig['webhook']>
  ): Promise<void> {
    try {
      const response = await fetch(webhookConfig.url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(webhookConfig.headers || {}),
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        throw new Error(`Webhook error: ${response.statusText}`);
      }

      console.log('[Healing Notifications] Sent webhook notification');

    } catch (error: any) {
      console.error('[Healing Notifications] Failed to send webhook notification:', error);
      throw error;
    }
  }

  /**
   * Send in-app notification (via WebSocket or event system)
   */
  private async sendInAppNotification(payload: NotificationPayload): Promise<void> {
    try {
      // TODO: Integrate with WebSocket server or real-time event system
      // For now, store in database for polling

      // This could integrate with:
      // 1. WebSocket server (broadcast to connected clients)
      // 2. Server-Sent Events (SSE)
      // 3. Database table for polling
      // 4. Redis pub/sub

      console.log('[Healing Notifications] In-app notification:', {
        event: payload.event,
        attemptId: payload.attemptId,
        message: `${payload.errorType}: ${payload.errorMessage.substring(0, 50)}...`,
      });

      // Store notification in database for retrieval
      // (You would need to create a Notification model in Prisma)

    } catch (error: any) {
      console.error('[Healing Notifications] Failed to send in-app notification:', error);
      throw error;
    }
  }

  /**
   * Send attempt started notification
   */
  async notifyAttemptStarted(attemptId: string): Promise<void> {
    const attempt = await this.getAttemptDetails(attemptId);
    if (!attempt) return;

    await this.notify({
      event: 'attempt_started',
      attemptId: attempt.id,
      errorId: attempt.errorId,
      projectId: attempt.error.projectId,
      environment: attempt.error.environment,
      errorMessage: attempt.error.errorMessage,
      errorType: attempt.error.errorType,
    });
  }

  /**
   * Send attempt success notification
   */
  async notifyAttemptSuccess(attemptId: string): Promise<void> {
    const attempt = await this.getAttemptDetails(attemptId);
    if (!attempt) return;

    await this.notify({
      event: 'attempt_success',
      attemptId: attempt.id,
      errorId: attempt.errorId,
      projectId: attempt.error.projectId,
      environment: attempt.error.environment,
      errorMessage: attempt.error.errorMessage,
      errorType: attempt.error.errorType,
      confidence: attempt.confidence,
      fixDescription: attempt.fixDescription,
    });
  }

  /**
   * Send attempt failed notification
   */
  async notifyAttemptFailed(attemptId: string, error: string): Promise<void> {
    const attempt = await this.getAttemptDetails(attemptId);
    if (!attempt) return;

    await this.notify({
      event: 'attempt_failed',
      attemptId: attempt.id,
      errorId: attempt.errorId,
      projectId: attempt.error.projectId,
      environment: attempt.error.environment,
      errorMessage: attempt.error.errorMessage,
      errorType: attempt.error.errorType,
      metadata: { error },
    });
  }

  /**
   * Send fix deployed notification
   */
  async notifyFixDeployed(attemptId: string): Promise<void> {
    const attempt = await this.getAttemptDetails(attemptId);
    if (!attempt) return;

    await this.notify({
      event: 'fix_deployed',
      attemptId: attempt.id,
      errorId: attempt.errorId,
      projectId: attempt.error.projectId,
      environment: attempt.error.environment,
      errorMessage: attempt.error.errorMessage,
      errorType: attempt.error.errorType,
      confidence: attempt.confidence,
      fixDescription: attempt.fixDescription,
    });
  }

  /**
   * Send rollback triggered notification
   */
  async notifyRollbackTriggered(attemptId: string, reason: string): Promise<void> {
    const attempt = await this.getAttemptDetails(attemptId);
    if (!attempt) return;

    await this.notify({
      event: 'rollback_triggered',
      attemptId: attempt.id,
      errorId: attempt.errorId,
      projectId: attempt.error.projectId,
      environment: attempt.error.environment,
      errorMessage: attempt.error.errorMessage,
      errorType: attempt.error.errorType,
      metadata: { reason },
    });
  }

  /**
   * Send human review required notification
   */
  async notifyHumanReviewRequired(attemptId: string, reason: string): Promise<void> {
    const attempt = await this.getAttemptDetails(attemptId);
    if (!attempt) return;

    await this.notify({
      event: 'human_review_required',
      attemptId: attempt.id,
      errorId: attempt.errorId,
      projectId: attempt.error.projectId,
      environment: attempt.error.environment,
      errorMessage: attempt.error.errorMessage,
      errorType: attempt.error.errorType,
      confidence: attempt.confidence,
      fixDescription: attempt.fixDescription,
      metadata: { reason },
    });
  }

  /**
   * Get attempt details for notification
   */
  private async getAttemptDetails(attemptId: string): Promise<any> {
    return await prisma.healingAttempt.findUnique({
      where: { id: attemptId },
      include: {
        error: true,
        deployment: true,
      },
    });
  }
}

export const healingNotificationService = new HealingNotificationService();

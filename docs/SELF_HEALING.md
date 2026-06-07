# Self-Healing System Documentation

## Overview

The PlusUltra Self-Healing System is an autonomous error detection, analysis, and remediation platform that automatically fixes production errors using AI-powered code analysis and safe deployment strategies.

### Key Features

- **Automatic Error Detection**: Real-time error monitoring via Sentry webhooks
- **AI-Powered Fix Generation**: Uses TCI 6-Layer multi-model system for high-confidence fixes
- **Sandbox Validation**: Tests fixes in isolated environments before deployment
- **Safe Deployment**: Blue-green, canary, and immediate deployment strategies
- **Automatic Rollback**: Monitors deployment health and rolls back if issues detected
- **Comprehensive Monitoring**: Real-time dashboards and historical analytics
- **Multi-Channel Notifications**: Slack, email, webhooks, and in-app alerts

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────────────────┐
│                      PRODUCTION ERROR                            │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  SENTRY                                                          │
│  - Captures error with stack trace                             │
│  - Sends webhook to /api/webhooks/sentry                       │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  SENTRY WEBHOOK SERVICE                                         │
│  - Verifies webhook signature (HMAC-SHA256)                    │
│  - Deduplicates errors                                         │
│  - Checks if healing should trigger                           │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  SELF-HEALING ORCHESTRATOR                                      │
│  - Circuit breaker check                                        │
│  - Rate limiting validation                                     │
│  - Creates healing attempt record                              │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  ERROR ANALYSIS SERVICE                                         │
│  - Extracts stack trace context                                │
│  - Reads file content                                          │
│  - Detects programming language                                │
│  - Identifies known error patterns                             │
│  - Builds comprehensive error report                           │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  TCI 6-LAYER ORCHESTRATOR                                       │
│  Layer 1 (DeepSeek): Visual pattern recognition                │
│  Layer 2 (Claude): Causal analysis                             │
│  Layer 3 (GPT-5): Historical pattern matching                  │
│  Layer 4 (Grok): Symbolic logic verification                   │
│  Layer 5 (Gemini): Cross-model synthesis                       │
│  Layer 6 (Claude): Automatic fix implementation                │
│  → Generates fix with confidence score (0-1)                   │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
┌─────────────────────────────────────────────────────────────────┐
│  FIX VALIDATION SERVICE                                         │
│  - Creates isolated sandbox (/tmp/plusultra-healing-sandbox)   │
│  - Copies project files                                        │
│  - Applies fix                                                 │
│  - Runs tests (language-specific: npm test, pytest, etc.)     │
│  - Parses test output                                          │
│  - Cleanup sandbox                                             │
└──────────────────────┬──────────────────────────────────────────┘
                       │
                       ▼
        ┌──────────────┴──────────────┐
        │ Confidence >= 85% ?          │
        └──┬──────────────────────┬────┘
           │ NO                   │ YES
           ▼                      ▼
┌──────────────────────┐  ┌──────────────────────────────────────┐
│ HUMAN REVIEW         │  │ AUTO-DEPLOYMENT SERVICE              │
│ - Status: pending    │  │ Strategy Selection:                  │
│ - Notification sent  │  │ - Production: blue-green             │
│ - Awaits approval    │  │ - Staging: immediate                 │
└──────────────────────┘  │ - Canary: gradual rollout            │
                          └──────────┬───────────────────────────┘
                                     │
                                     ▼
                          ┌──────────────────────────────────────┐
                          │ DEPLOYMENT                           │
                          │ Blue-Green:                          │
                          │  1. Deploy to inactive slot          │
                          │  2. Health check                     │
                          │  3. Switch traffic                   │
                          │                                      │
                          │ Canary:                              │
                          │  1. Deploy new version               │
                          │  2. Route 10-50% traffic             │
                          │  3. Monitor for duration             │
                          │  4. Promote to 100%                  │
                          └──────────┬───────────────────────────┘
                                     │
                                     ▼
                          ┌──────────────────────────────────────┐
                          │ HEALTH MONITORING                    │
                          │ - Monitor error rates                │
                          │ - Track response times               │
                          │ - Check request success              │
                          │ - P95 latency tracking               │
                          └──────────┬───────────────────────────┘
                                     │
                        ┌────────────┴────────────┐
                        │ Health degraded?        │
                        └──┬──────────────────┬───┘
                           │ YES              │ NO
                           ▼                  ▼
                ┌──────────────────────┐  ┌──────────────────────┐
                │ AUTOMATIC ROLLBACK   │  │ SUCCESS              │
                │ - Revert deployment  │  │ - Mark as healed     │
                │ - Restore previous   │  │ - Track metrics      │
                │ - Notification sent  │  │ - Notification sent  │
                └──────────────────────┘  └──────────────────────┘
```

---

## Setup Guide

### 1. Environment Variables

Add to `plusultra/backend/.env`:

```bash
# Sentry Configuration
SENTRY_DSN=https://your-sentry-dsn@sentry.io/project-id
SENTRY_WEBHOOK_SECRET=your-webhook-secret

# Project Root (for file access)
PROJECTS_ROOT=/var/www/projects

# Notification Channels (Optional)
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/...
EMAIL_SMTP_HOST=smtp.gmail.com
EMAIL_SMTP_PORT=587
EMAIL_FROM=noreply@plusultra.com
```

### 2. Database Migration

The self-healing system requires 5 new database tables:

```bash
cd plusultra/backend
npx prisma migrate dev
```

**Tables Created:**
- `SentryError` - Stores error information from Sentry
- `HealingAttempt` - Tracks each healing attempt
- `FixDeployment` - Records deployment details
- `HealingConfig` - Project-specific configuration
- `HealingMetrics` - Daily aggregated metrics

### 3. Sentry Webhook Configuration

1. Go to your Sentry project settings
2. Navigate to **Webhooks**
3. Add new webhook:
   - **URL**: `https://your-domain.com/api/webhooks/sentry`
   - **Secret**: Use the value from `SENTRY_WEBHOOK_SECRET`
   - **Events**: Select "Errors"

### 4. Project Configuration

For each project, create a healing configuration:

```typescript
POST /api/self-healing/config/{projectId}
{
  "enabled": true,
  "autoHealProduction": false,     // Safer to start with false
  "autoHealStaging": true,
  "minConfidence": 0.85,            // 85% minimum confidence
  "maxAttemptsPerHour": 5,
  "maxAttemptsPerError": 3,
  "requireApproval": true,          // Require human review initially
  "notifyOnAttempt": true,
  "notifyOnSuccess": true,
  "notifyOnFailure": true,
  "notificationChannels": {
    "slack": {
      "webhookUrl": "https://hooks.slack.com/...",
      "channel": "#alerts"
    },
    "email": {
      "to": ["admin@example.com", "ops@example.com"],
      "from": "noreply@plusultra.com"
    }
  }
}
```

---

## Configuration Reference

### Healing Config Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `enabled` | boolean | `false` | Enable/disable self-healing for project |
| `autoHealProduction` | boolean | `false` | Auto-deploy to production (use with caution) |
| `autoHealStaging` | boolean | `true` | Auto-deploy to staging |
| `minConfidence` | number | `0.85` | Minimum confidence threshold (0.5-1.0) |
| `maxAttemptsPerHour` | number | `5` | Rate limit per error |
| `maxAttemptsPerError` | number | `3` | Total attempts before giving up |
| `cooldownPeriod` | number | `3600` | Seconds to wait after failures |
| `requireApproval` | boolean | `true` | Require human review |
| `emergencyKillSwitch` | boolean | `false` | Disable ALL healing immediately |
| `notifyOnAttempt` | boolean | `true` | Send notification when attempt starts |
| `notifyOnSuccess` | boolean | `true` | Send notification on success |
| `notifyOnFailure` | boolean | `true` | Send notification on failure |

### Deployment Strategies

**Blue-Green** (Production Default)
- Deploy to inactive environment
- Run health checks
- Switch traffic only if healthy
- Zero-downtime deployment

**Canary** (Advanced)
- Gradual rollout (10-50% traffic)
- Continuous monitoring
- Auto-promote or rollback based on metrics

**Immediate** (Staging Only)
- Direct deployment
- Faster but less safe
- Use only for non-critical environments

---

## API Reference

### Webhooks

**POST `/api/webhooks/sentry`**

Receives Sentry error webhooks.

Headers:
- `sentry-hook-signature`: HMAC-SHA256 signature

Response:
```json
{
  "success": true,
  "message": "Error logged, healing triggered",
  "errorId": "error-uuid"
}
```

### Manual Triggers

**POST `/api/self-healing/errors/:errorId/heal`**

Manually trigger healing for an error.

Body:
```json
{
  "requireApproval": false,
  "skipValidation": false,
  "deployEnvironment": "staging"
}
```

### Error Management

**GET `/api/self-healing/errors`**

List errors with optional filters.

Query Parameters:
- `projectId`: Filter by project
- `status`: `new`, `healing`, `healed`, `failed`, `ignored`
- `environment`: `production`, `staging`, `development`
- `limit`: Number of results (default: 50)
- `offset`: Pagination offset

**GET `/api/self-healing/errors/:errorId`**

Get detailed error information including healing attempts.

**POST `/api/self-healing/errors/:errorId/ignore`**

Mark error as ignored (won't trigger healing).

### Healing Attempts

**GET `/api/self-healing/attempts/:attemptId`**

Get detailed information about a specific healing attempt.

**POST `/api/self-healing/attempts/:attemptId/approve`**

Approve or reject a pending healing attempt.

Body:
```json
{
  "approved": true,
  "userId": "user-uuid"
}
```

### Configuration

**GET `/api/self-healing/config/:projectId`**

Get healing configuration for a project.

**PUT `/api/self-healing/config/:projectId`**

Update healing configuration.

**POST `/api/self-healing/config/:projectId/kill-switch`**

Activate/deactivate emergency kill switch.

Body:
```json
{
  "enabled": true  // true = disable all healing
}
```

### Dashboard & Analytics

**GET `/api/self-healing/dashboard`**

Get comprehensive dashboard data.

Query Parameters:
- `projectId`: Optional project filter
- `days`: Time range (default: 7)

Response includes:
- Overview metrics (total errors, active healings, success rate)
- Recent attempts
- Error trends
- Top error types
- Environment statistics
- System health indicators
- Alerts

**GET `/api/self-healing/dashboard/attempts/:attemptId`**

Get detailed view of a specific attempt with timeline.

**GET `/api/self-healing/dashboard/export`**

Export dashboard data as JSON.

---

## Frontend Components

### Admin Dashboard

Import components:
```typescript
import {
  HealingStatusPanel,
  HealingHistoryView,
  HealingConfigPanel
} from '@/components/admin/self-healing';
```

**HealingStatusPanel**
- Real-time active healings
- System health overview
- Recent completions
- Auto-refresh every 5 seconds

**HealingHistoryView**
- Searchable/filterable history
- Detailed attempt inspection
- Timeline visualization
- Export functionality

**HealingConfigPanel**
- Configuration management
- Emergency kill switch
- Notification setup
- Threshold adjustments

Usage example:
```typescript
<div className="space-y-6">
  <HealingStatusPanel />
  <HealingHistoryView />
  <HealingConfigPanel projectId={currentProject.id} />
</div>
```

---

## Safety Mechanisms

### 1. Circuit Breaker

Prevents infinite healing loops:
- Tracks failures per error
- Opens circuit after 3 consecutive failures
- 5-minute cooldown period
- Automatic reset on success

### 2. Rate Limiting

Controls healing frequency:
- Max 5 attempts per hour per error
- Max 3 total attempts per error
- Configurable per project

### 3. Confidence Threshold

Ensures fix quality:
- Default 85% minimum confidence
- Low-confidence fixes require human review
- Adjustable per project (50-100%)

### 4. Sandbox Validation

Tests fixes safely:
- Isolated environment (`/tmp/plusultra-healing-sandbox`)
- Language-specific test runners
- Syntax checking fallback
- Automatic cleanup

### 5. Health Monitoring

Tracks deployment health:
- Error rate monitoring
- Response time tracking
- Request success rate
- P95 latency

### 6. Automatic Rollback

Triggers on degradation:
- Error rate increase >5%
- Response time increase >50%
- Failed health checks
- Restores previous version

### 7. Emergency Kill Switch

Immediate shutdown:
- Stops all healing activity
- Available via API and UI
- Per-project or global
- Instant effect

### 8. Human Review Queue

For low-confidence fixes:
- Status: pending
- Notifications sent
- Approval workflow
- Audit trail

---

## Monitoring & Observability

### Metrics Tracked

**Attempt Metrics:**
- Total attempts
- Success rate
- Average time to fix
- Average confidence
- Tests run/passed/failed

**Deployment Metrics:**
- Deployment success rate
- Rollback rate
- Error rate improvement
- Response time improvement

**Error Metrics:**
- Errors by type
- Errors by environment
- Healing success by error type
- Circuit breaker activations

### Notifications

**Slack** (Rich formatted messages):
- Attempt started
- Attempt succeeded
- Attempt failed
- Fix deployed
- Rollback triggered
- Human review required

**Email** (HTML formatted):
- Same events as Slack
- Includes error details
- Stack trace
- Fix description

**Webhooks** (JSON payload):
- Custom integrations
- All event types
- Full attempt details

---

## Testing

### Running Tests

```bash
# All tests
npm test

# Integration tests
npm test tests/integration/self-healing.test.ts

# Unit tests
npm test tests/services/ErrorAnalysisService.test.ts

# With coverage
npm test -- --coverage
```

### Test Coverage

The test suite covers:
- Sentry webhook processing
- Error deduplication
- Rate limiting
- Circuit breaker
- Error analysis
- Pattern detection
- Language detection
- Configuration management
- Statistics calculation

---

## Best Practices

### 1. Start Conservative

```typescript
{
  "enabled": true,
  "autoHealProduction": false,    // Start with manual review
  "autoHealStaging": true,
  "requireApproval": true,        // Require approval initially
  "minConfidence": 0.9            // Higher threshold at first
}
```

### 2. Monitor Closely

- Watch dashboard for first week
- Review all healing attempts
- Adjust thresholds based on results
- Enable notifications

### 3. Gradual Rollout

1. Start with staging only
2. Require human approval
3. Review 10-20 successful fixes
4. Enable auto-deploy for staging
5. Test with production (approval required)
6. Consider auto-deploy for production

### 4. Error Categorization

Mark certain errors as ignored:
```bash
POST /api/self-healing/errors/:errorId/ignore
```

Use for:
- Known issues being worked on
- Third-party library errors
- Non-critical warnings

### 5. Regular Review

- Weekly review of metrics
- Monthly configuration adjustments
- Quarterly pattern analysis
- Update notification channels

---

## Troubleshooting

### Healing Not Triggering

**Check:**
1. Is self-healing enabled? (`config.enabled`)
2. Is kill switch off? (`config.emergencyKillSwitch === false`)
3. Is error severity high enough? (not `warning` or `info`)
4. Have rate limits been hit? (`maxAttemptsPerHour`)
5. Is circuit breaker open? (check logs)

### Low Success Rate

**Actions:**
1. Review failed attempts in dashboard
2. Check common failure reasons
3. Adjust confidence threshold
4. Improve error context (add logging)
5. Review TCI model performance

### Deployments Failing

**Check:**
1. Docker configuration
2. Project file permissions
3. Health check endpoints
4. Load balancer configuration
5. Deployment logs

### Notifications Not Sending

**Verify:**
1. Slack webhook URL is correct
2. Email SMTP settings
3. Notification flags enabled
4. Check service logs

---

## Security Considerations

### Webhook Security

- HMAC-SHA256 signature verification
- Environment variable for secret
- IP whitelisting recommended

### Code Access

- Sandboxed execution
- File system isolation
- Limited permissions
- Temporary directories only

### Deployment Access

- Separate credentials per environment
- Least privilege principle
- Audit logging enabled
- Rollback capabilities

### Data Privacy

- Error context sanitized
- PII removal
- Secure storage
- Encryption at rest

---

## Performance

### Resource Usage

**CPU:**
- Light: 1-5% during idle
- Peak: 20-30% during healing

**Memory:**
- Base: 200-300 MB
- Sandbox: +100-200 MB per attempt

**Disk:**
- Database: ~100 MB per 1000 errors
- Sandbox: Temporary, auto-cleaned

### Scaling

**Horizontal:**
- Stateless design
- Database-backed coordination
- Load balancer compatible

**Vertical:**
- Increase worker threads
- Larger sandbox memory
- Faster disk I/O

---

## Roadmap

### Planned Features

- [ ] Machine learning for pattern detection
- [ ] Multi-file fix support
- [ ] Integration with GitHub PRs
- [ ] Custom deployment strategies
- [ ] Mobile app notifications
- [ ] Predictive healing (before errors occur)
- [ ] Team collaboration features
- [ ] Advanced analytics dashboard

---

## Support

### Documentation
- Main docs: `/docs`
- API reference: This document
- Code examples: `/examples`

### Community
- GitHub Issues: Report bugs
- Discussions: Feature requests
- Slack: #self-healing channel

### Commercial Support
- Email: support@plusultra.com
- Priority: Enterprise customers
- SLA: 24-hour response

---

## License

Copyright © 2024 PlusUltra. All rights reserved.

# Gemini Visual Analysis Integration

## Overview

PlusUltra now integrates **Gemini 2.0 Flash's screen capture capabilities** to provide advanced visual bug detection, UI analysis, and regression testing. This enhancement significantly improves the TCI (Temporal Code Intelligence) system by adding real-time visual monitoring and analysis.

## Architecture

### Core Components

```
┌─────────────────────────────────────────────────────────────┐
│                    Gemini Visual Analysis                    │
└─────────────────────────────────────────────────────────────┘
                              │
          ┌───────────────────┼───────────────────┐
          │                   │                   │
┌─────────▼─────────┐  ┌──────▼──────┐  ┌────────▼────────┐
│ Gemini Screen     │  │   Visual    │  │  Visual Sandbox │
│ Capture Service   │  │   Bug       │  │    Monitor      │
│                   │  │  Detection  │  │                 │
│ • Screenshot      │  │  Service    │  │ • Real-time     │
│   Analysis        │  │             │  │   Monitoring    │
│ • Visual Issues   │  │ • Puppeteer │  │ • Health Checks │
│   Detection       │  │   Capture   │  │ • Regression    │
│ • Regression      │  │ • Pixel     │  │   Testing       │
│   Detection       │  │   Compare   │  │                 │
│ • Accessibility   │  │             │  │                 │
│   Analysis        │  │             │  │                 │
└───────────────────┘  └─────────────┘  └─────────────────┘
          │                   │                   │
          └───────────────────┼───────────────────┘
                              │
              ┌───────────────▼───────────────┐
              │   Enhanced TCI Layer 1       │
              │   (DeepSeek + Gemini)        │
              └───────────────────────────────┘
```

## Features

### 1. **Visual Bug Detection**

Automatically detects visual issues in running applications:
- **Layout issues**: Broken layouts, misaligned elements
- **Styling problems**: Color/font inconsistencies, CSS bugs
- **Content issues**: Missing images, text overflow
- **Accessibility violations**: Contrast ratios, font sizes, touch targets
- **Responsive design problems**: Mobile/tablet layout issues

### 2. **Visual Regression Testing**

Pixel-perfect comparison of UI changes:
- **Baseline management**: Create and update baseline screenshots
- **Automated comparison**: Pixel-by-pixel diff generation
- **Smart thresholds**: Configurable tolerance levels
- **AI analysis**: Gemini explains detected differences

### 3. **Real-time Sandbox Monitoring**

Continuous visual health monitoring:
- **Periodic screenshots**: Capture app state every N seconds
- **Change detection**: Alert on significant visual changes
- **Health scoring**: 0-100 score for UI health
- **Issue tracking**: Store and track visual bugs

### 4. **Enhanced TCI Layer 1**

Combines static and dynamic analysis:
- **Static (DeepSeek)**: Analyze code screenshots for patterns
- **Dynamic (Gemini)**: Analyze running app for visual bugs
- **Hybrid mode**: Best of both approaches

## API Reference

### Screenshot & Analysis

#### Analyze URL
```http
POST /api/visual/analyze-url
Content-Type: application/json

{
  "url": "https://example.com",
  "projectId": "proj-123",
  "viewport": { "width": 1920, "height": 1080 },
  "expectedBehavior": "Homepage should load correctly"
}
```

**Response:**
```json
{
  "success": true,
  "report": {
    "url": "https://example.com",
    "timestamp": "2024-12-01T18:00:00Z",
    "screenshotPath": "/tmp/screenshots/screenshot-1234.png",
    "analysisResult": {
      "success": true,
      "issues": [
        {
          "type": "accessibility",
          "severity": "high",
          "description": "Button text has insufficient contrast (3.2:1, needs 4.5:1)",
          "location": { "selector": ".submit-btn" },
          "suggestedFix": "Change button color to #1a73e8 for better contrast",
          "confidence": 92
        }
      ],
      "overallScore": 78,
      "summary": "Found 3 accessibility issues and 1 layout problem"
    }
  },
  "visualBugs": [...],
  "summary": {
    "totalIssues": 4,
    "critical": 0,
    "high": 2,
    "medium": 1,
    "low": 1
  }
}
```

#### Analyze Sandbox
```http
POST /api/visual/analyze-sandbox
Content-Type: application/json

{
  "sandboxId": "sandbox-abc",
  "previewPort": 3001,
  "projectId": "proj-123"
}
```

### Visual Regression Testing

#### Create Regression Test
```http
POST /api/visual/regression-tests
Content-Type: application/json

{
  "testName": "homepage-desktop",
  "sandboxId": "sandbox-abc",
  "projectId": "proj-123",
  "viewport": { "width": 1920, "height": 1080 },
  "threshold": 0.05
}
```

#### Run Regression Test
```http
POST /api/visual/regression-tests/:testId/run
```

**Response:**
```json
{
  "success": true,
  "passed": false,
  "comparison": {
    "pixelDiff": 15234,
    "diffPercentage": 7.2,
    "diffImagePath": "/tmp/diffs/homepage-desktop-diff.png"
  },
  "regressionAnalysis": {
    "hasRegression": true,
    "differences": [
      {
        "type": "layout",
        "description": "Header navigation shifted down by 20px",
        "severity": "high",
        "location": "Top navigation bar"
      }
    ],
    "summary": "Layout regression detected in header",
    "confidence": 95
  }
}
```

#### Update Baseline
```http
POST /api/visual/regression-tests/:testId/update-baseline
```

### Sandbox Visual Monitoring

#### Start Monitoring
```http
POST /api/visual/monitoring/start
Content-Type: application/json

{
  "sandboxId": "sandbox-abc",
  "previewPort": 3001,
  "captureBaseline": true,
  "enableRegressionTesting": true,
  "interval": 10000
}
```

#### Stop Monitoring
```http
POST /api/visual/monitoring/stop
Content-Type: application/json

{
  "sandboxId": "sandbox-abc"
}
```

#### Get Monitoring Status
```http
GET /api/visual/monitoring/status?sandboxId=sandbox-abc
```

**Response:**
```json
{
  "success": true,
  "isMonitoring": true,
  "issues": [
    {
      "id": "issue-123",
      "sandboxId": "sandbox-abc",
      "type": "layout",
      "severity": "high",
      "description": "Button overlapping text content",
      "screenshotPath": "/tmp/screenshots/...",
      "detectedAt": "2024-12-01T18:05:00Z",
      "confidence": 88
    }
  ]
}
```

### Visual Bugs Management

#### Get Visual Bugs
```http
GET /api/visual/bugs?projectId=proj-123&status=new&severity=high
```

#### Get Bug Details
```http
GET /api/visual/bugs/:bugId
```

#### Update Bug Status
```http
PATCH /api/visual/bugs/:bugId
Content-Type: application/json

{
  "status": "fixed",
  "fixedBy": "user-123",
  "fixCode": "Changed button z-index to 10"
}
```

### Responsive & Accessibility Testing

#### Test Responsive Design
```http
POST /api/visual/test-responsive
Content-Type: application/json

{
  "sandboxId": "sandbox-abc"
}
```

**Response:**
```json
{
  "success": true,
  "isResponsive": false,
  "screenshots": [
    {
      "viewport": "mobile",
      "path": "/tmp/screenshots/mobile-1234.png"
    },
    {
      "viewport": "tablet",
      "path": "/tmp/screenshots/tablet-1234.png"
    },
    {
      "viewport": "desktop",
      "path": "/tmp/screenshots/desktop-1234.png"
    }
  ],
  "issues": [
    {
      "viewport": "mobile",
      "problems": [
        "Text too small to read (10px, should be 16px minimum)",
        "Buttons too close together (30px spacing, needs 44px)"
      ]
    }
  ]
}
```

#### Test Accessibility
```http
POST /api/visual/test-accessibility
Content-Type: application/json

{
  "url": "https://example.com"
}
```

**Response:**
```json
{
  "success": true,
  "screenshotPath": "/tmp/screenshots/a11y-1234.png",
  "issues": [
    {
      "type": "contrast",
      "description": "Text color #777 on white background has 3.2:1 ratio",
      "wcagLevel": "AA",
      "suggestion": "Use #595959 or darker for 4.5:1 ratio"
    }
  ],
  "score": 72,
  "summary": "Found 5 WCAG AA violations"
}
```

### Configuration

#### Get Config
```http
GET /api/visual/config/:projectId
```

#### Update Config
```http
PUT /api/visual/config/:projectId
Content-Type: application/json

{
  "enableVisualMonitoring": true,
  "enableRegressionTesting": true,
  "enableAccessibilityCheck": true,
  "monitoringInterval": 10000,
  "regressionThreshold": 0.05,
  "autoFixVisualBugs": false,
  "minConfidence": 0.85,
  "notifyOnRegressions": true,
  "notificationChannels": {
    "slack": true,
    "email": true,
    "webhook": false
  },
  "screenshotRetentionDays": 30
}
```

## Database Schema

### Visual Bugs
```prisma
model VisualBug {
  id                String   @id @default(uuid())
  sandboxId         String?
  projectId         String?
  type              String   // layout, styling, content, accessibility, responsive, regression
  severity          String   // critical, high, medium, low
  status            String   // new, analyzing, fixing, fixed, ignored
  description       String
  screenshotPath    String
  diffImagePath     String?
  location          Json?
  detectedBy        String   // gemini, deepseek, manual
  confidence        Float
  geminiAnalysis    Json?
  suggestedFix      String?
  fixedAt           DateTime?
  fixedBy           String?
  fixCode           String?
  healingAttemptId  String?
  detectedAt        DateTime @default(now())
}
```

### Visual Regression Tests
```prisma
model VisualRegressionTest {
  id                    String   @id @default(uuid())
  testName              String
  sandboxId             String?
  projectId             String?
  viewport              Json
  threshold             Float    @default(0.05)
  baselineScreenshot    String
  currentScreenshot     String?
  diffImagePath         String?
  lastTestAt            DateTime?
  hasFailed             Boolean
  pixelDifference       Int
  diffPercentage        Float
  regressionAnalysis    Json?
  enabled               Boolean
}
```

### Visual Health Checks
```prisma
model VisualHealthCheck {
  id                    String   @id @default(uuid())
  sandboxId             String
  projectId             String?
  status                String   // healthy, degraded, unhealthy
  overallScore          Int      // 0-100
  accessibilityScore    Int?
  screenshotPath        String
  criticalIssues        Int
  highIssues            Int
  mediumIssues          Int
  lowIssues             Int
  regressionDetected    Boolean
  timestamp             DateTime @default(now())
}
```

## Integration Examples

### TypeScript/Node.js

```typescript
import { visualBugDetectionService } from './services/visual/VisualBugDetectionService';
import { visualSandboxMonitor } from './services/sandbox/VisualSandboxMonitor';

// Capture and analyze a URL
const report = await visualBugDetectionService.detectVisualBugs({
  url: 'https://example.com',
  viewport: { width: 1920, height: 1080 },
  expectedBehavior: 'Homepage loads correctly'
});

console.log(`Found ${report.analysisResult.issues.length} visual issues`);

// Start monitoring a sandbox
await visualSandboxMonitor.startMonitoring('sandbox-123', 3001, {
  captureBaseline: true,
  enableRegressionTesting: true,
  interval: 10000
});

// Run visual regression test
const regressionResult = await visualSandboxMonitor.runRegressionTest(
  'sandbox-123',
  'homepage-test',
  { threshold: 0.05 }
);

if (!regressionResult.passed) {
  console.warn('Visual regression detected!');
  console.log(regressionResult.geminiAnalysis);
}
```

### Integration with Self-Healing

The visual analysis system automatically integrates with the self-healing system. When visual bugs are detected with high confidence, they can trigger healing attempts:

```typescript
// Visual bugs automatically create healing attempts
const visualBug = await prisma.visualBug.findUnique({
  where: { id: bugId }
});

if (visualBug.confidence > 0.85 && visualBug.severity === 'critical') {
  // Trigger self-healing
  await selfHealingOrchestrator.handleVisualBug(visualBug.id);
}
```

### Enhanced TCI Layer 1

```typescript
import { enhancedVisualAnalysisService } from './services/tci/EnhancedVisualAnalysisService';

// Code analysis mode (DeepSeek)
const codeAnalysis = await enhancedVisualAnalysisService.analyzeCode(
  sourceCode,
  { language: 'typescript' },
  { mode: 'code' }
);

// UI analysis mode (Gemini)
const uiAnalysis = await enhancedVisualAnalysisService.analyzeCode(
  '',
  { language: 'typescript' },
  {
    mode: 'ui',
    sandboxId: 'sandbox-123',
    previewPort: 3001
  }
);

// Hybrid mode (both)
const hybridAnalysis = await enhancedVisualAnalysisService.analyzeCode(
  sourceCode,
  { language: 'typescript' },
  {
    mode: 'both',
    sandboxId: 'sandbox-123',
    previewPort: 3001
  }
);

console.log(`Combined score: ${hybridAnalysis.combinedScore}/10`);
```

## Use Cases

### 1. **Continuous Visual Monitoring**

Monitor sandboxes in real-time during development:

```typescript
// Developer starts working in sandbox
await visualSandboxMonitor.startMonitoring(sandboxId, previewPort, {
  interval: 5000,
  enableRegressionTesting: true
});

// Visual issues detected automatically
visualSandboxMonitor.on('issue:critical', ({ sandboxId, issues }) => {
  console.error(`Critical visual issues in ${sandboxId}:`, issues);
  notifyDeveloper(issues);
});
```

### 2. **Pre-Deployment Regression Testing**

Run visual tests before deploying:

```typescript
// Before deployment
const tests = await prisma.visualRegressionTest.findMany({
  where: { projectId, enabled: true }
});

for (const test of tests) {
  const result = await runRegressionTest(test.id);
  if (!result.passed) {
    throw new Error(`Visual regression detected in ${test.testName}`);
  }
}
```

### 3. **Accessibility Compliance**

Ensure WCAG compliance:

```typescript
const a11yResult = await visualBugDetectionService.testAccessibility(url);

if (a11yResult.score < 90) {
  console.warn('Accessibility score below threshold');
  for (const issue of a11yResult.issues) {
    console.log(`${issue.wcagLevel}: ${issue.description}`);
    console.log(`Fix: ${issue.suggestion}`);
  }
}
```

### 4. **Component Testing**

Validate component rendering:

```typescript
const componentAnalysis = await visualSandboxMonitor.analyzeComponent(
  sandboxId,
  'LoginForm',
  {
    showError: true,
    errorMessage: 'Invalid credentials'
  }
);

expect(componentAnalysis.isRenderedCorrectly).toBe(true);
```

## Configuration

### Environment Variables

Add to `.env`:

```bash
# Google Gemini API (already in .env.example)
GOOGLE_API_KEY=your-google-api-key

# Visual Analysis Settings
VISUAL_MONITORING_ENABLED=true
VISUAL_REGRESSION_ENABLED=true
VISUAL_MONITORING_INTERVAL=10000
VISUAL_REGRESSION_THRESHOLD=0.05
VISUAL_SCREENSHOT_RETENTION_DAYS=30
```

### Project Configuration

Configure per-project via API or database:

```sql
INSERT INTO visual_analysis_configs (
  project_id,
  enable_visual_monitoring,
  enable_regression_testing,
  monitoring_interval,
  regression_threshold
) VALUES (
  'proj-123',
  true,
  true,
  10000,
  0.05
);
```

## Performance

### Analysis Times

- **Screenshot capture**: 1-3 seconds
- **Gemini visual analysis**: 2-5 seconds
- **Pixel comparison**: < 1 second
- **Full visual health check**: 3-8 seconds

### Cost Estimates

Using Gemini 2.0 Flash:
- **Per screenshot analysis**: ~$0.001-0.003
- **Per regression test**: ~$0.002-0.005
- **Continuous monitoring (10s intervals, 1hr)**: ~$0.05-0.15

Much cheaper than manual QA while providing instant feedback!

## Limitations

1. **JavaScript-heavy apps**: Some SPAs may require longer wait times for full rendering
2. **Dynamic content**: Animations and videos may cause false positives
3. **Authentication**: Protected pages require authentication setup
4. **Rate limits**: Gemini API has rate limits (configure intervals accordingly)

## Best Practices

1. **Set appropriate thresholds**: 5% for strict UI, 10% for flexible layouts
2. **Update baselines after intentional changes**: Use `/update-baseline` endpoint
3. **Monitor critical paths**: Focus on homepage, checkout, login flows
4. **Combine with functional tests**: Visual tests complement, not replace, functional tests
5. **Review Gemini suggestions**: AI suggestions are helpful but may need human validation

## Troubleshooting

### Screenshot capture fails
- Check if URL is accessible
- Verify port is open (for sandboxes)
- Increase `waitForTimeout` in capture options

### False positives in regression tests
- Increase threshold (e.g., 0.10 instead of 0.05)
- Disable animations in test mode
- Use stable test data (no timestamps, random values)

### Gemini API errors
- Verify GOOGLE_API_KEY is set
- Check API quota and rate limits
- Ensure image size < 20MB

## Future Enhancements

- [ ] Video recording of user flows
- [ ] Cross-browser testing (Chrome, Firefox, Safari)
- [ ] Performance metrics (LCP, CLS, FID)
- [ ] Integration with Playwright/Cypress
- [ ] Visual diff annotations in UI
- [ ] Machine learning for issue prioritization
- [ ] Custom visual assertions DSL

## Support

For issues or questions:
- GitHub Issues: https://github.com/yourorg/plusultra/issues
- Documentation: https://docs.plusultra.dev/visual-analysis
- API Reference: https://api.plusultra.dev/docs#visual-analysis

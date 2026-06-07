-- CreateTable
CREATE TABLE "visual_bugs" (
    "id" TEXT NOT NULL,
    "sandboxId" TEXT,
    "projectId" TEXT,
    "workspaceId" TEXT,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'new',
    "description" TEXT NOT NULL,
    "screenshotPath" TEXT NOT NULL,
    "diffImagePath" TEXT,
    "location" JSONB,
    "detectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "detectedBy" TEXT NOT NULL DEFAULT 'gemini',
    "confidence" DOUBLE PRECISION NOT NULL,
    "geminiAnalysis" JSONB,
    "suggestedFix" TEXT,
    "fixedAt" TIMESTAMP(3),
    "fixedBy" TEXT,
    "fixCode" TEXT,
    "relatedBugs" TEXT[],
    "healingAttemptId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visual_bugs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visual_regression_tests" (
    "id" TEXT NOT NULL,
    "testName" TEXT NOT NULL,
    "sandboxId" TEXT,
    "projectId" TEXT,
    "workspaceId" TEXT,
    "url" TEXT,
    "viewport" JSONB NOT NULL,
    "threshold" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "baselineScreenshot" TEXT NOT NULL,
    "baselineCreatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "baselineUpdatedAt" TIMESTAMP(3) NOT NULL,
    "currentScreenshot" TEXT,
    "diffImagePath" TEXT,
    "lastTestAt" TIMESTAMP(3),
    "hasFailed" BOOLEAN NOT NULL DEFAULT false,
    "pixelDifference" INTEGER NOT NULL DEFAULT 0,
    "diffPercentage" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "regressionAnalysis" JSONB,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visual_regression_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visual_health_checks" (
    "id" TEXT NOT NULL,
    "sandboxId" TEXT NOT NULL,
    "projectId" TEXT,
    "workspaceId" TEXT,
    "status" TEXT NOT NULL,
    "overallScore" INTEGER NOT NULL,
    "accessibilityScore" INTEGER,
    "screenshotPath" TEXT NOT NULL,
    "criticalIssues" INTEGER NOT NULL DEFAULT 0,
    "highIssues" INTEGER NOT NULL DEFAULT 0,
    "mediumIssues" INTEGER NOT NULL DEFAULT 0,
    "lowIssues" INTEGER NOT NULL DEFAULT 0,
    "regressionDetected" BOOLEAN NOT NULL DEFAULT false,
    "analysisTime" INTEGER,
    "geminiResponse" JSONB,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "visual_health_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "screenshot_archives" (
    "id" TEXT NOT NULL,
    "sandboxId" TEXT,
    "projectId" TEXT,
    "workspaceId" TEXT,
    "screenshotPath" TEXT NOT NULL,
    "screenshotType" TEXT NOT NULL,
    "url" TEXT,
    "viewport" JSONB,
    "visualBugId" TEXT,
    "regressionTestId" TEXT,
    "capturedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "fileSize" INTEGER,
    "expiresAt" TIMESTAMP(3),

    CONSTRAINT "screenshot_archives_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "visual_analysis_configs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "enableVisualMonitoring" BOOLEAN NOT NULL DEFAULT false,
    "enableRegressionTesting" BOOLEAN NOT NULL DEFAULT false,
    "enableAccessibilityCheck" BOOLEAN NOT NULL DEFAULT true,
    "enableResponsiveCheck" BOOLEAN NOT NULL DEFAULT true,
    "monitoringInterval" INTEGER NOT NULL DEFAULT 10000,
    "regressionThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.05,
    "autoFixVisualBugs" BOOLEAN NOT NULL DEFAULT false,
    "minConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "notifyOnRegressions" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnCriticalIssues" BOOLEAN NOT NULL DEFAULT true,
    "notificationChannels" JSONB NOT NULL,
    "screenshotRetentionDays" INTEGER NOT NULL DEFAULT 30,
    "captureFullPage" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "visual_analysis_configs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "visual_bugs_sandboxId_idx" ON "visual_bugs"("sandboxId");

-- CreateIndex
CREATE INDEX "visual_bugs_projectId_idx" ON "visual_bugs"("projectId");

-- CreateIndex
CREATE INDEX "visual_bugs_workspaceId_idx" ON "visual_bugs"("workspaceId");

-- CreateIndex
CREATE INDEX "visual_bugs_status_idx" ON "visual_bugs"("status");

-- CreateIndex
CREATE INDEX "visual_bugs_severity_idx" ON "visual_bugs"("severity");

-- CreateIndex
CREATE INDEX "visual_bugs_detectedAt_idx" ON "visual_bugs"("detectedAt");

-- CreateIndex
CREATE INDEX "visual_regression_tests_sandboxId_idx" ON "visual_regression_tests"("sandboxId");

-- CreateIndex
CREATE INDEX "visual_regression_tests_projectId_idx" ON "visual_regression_tests"("projectId");

-- CreateIndex
CREATE INDEX "visual_regression_tests_hasFailed_idx" ON "visual_regression_tests"("hasFailed");

-- CreateIndex
CREATE INDEX "visual_regression_tests_lastTestAt_idx" ON "visual_regression_tests"("lastTestAt");

-- CreateIndex
CREATE UNIQUE INDEX "visual_regression_tests_testName_sandboxId_key" ON "visual_regression_tests"("testName", "sandboxId");

-- CreateIndex
CREATE INDEX "visual_health_checks_sandboxId_idx" ON "visual_health_checks"("sandboxId");

-- CreateIndex
CREATE INDEX "visual_health_checks_projectId_idx" ON "visual_health_checks"("projectId");

-- CreateIndex
CREATE INDEX "visual_health_checks_timestamp_idx" ON "visual_health_checks"("timestamp");

-- CreateIndex
CREATE INDEX "visual_health_checks_status_idx" ON "visual_health_checks"("status");

-- CreateIndex
CREATE INDEX "screenshot_archives_sandboxId_idx" ON "screenshot_archives"("sandboxId");

-- CreateIndex
CREATE INDEX "screenshot_archives_projectId_idx" ON "screenshot_archives"("projectId");

-- CreateIndex
CREATE INDEX "screenshot_archives_capturedAt_idx" ON "screenshot_archives"("capturedAt");

-- CreateIndex
CREATE INDEX "screenshot_archives_expiresAt_idx" ON "screenshot_archives"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "visual_analysis_configs_projectId_key" ON "visual_analysis_configs"("projectId");

-- CreateIndex
CREATE INDEX "visual_analysis_configs_projectId_idx" ON "visual_analysis_configs"("projectId");

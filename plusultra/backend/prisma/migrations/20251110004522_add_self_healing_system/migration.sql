-- CreateTable
CREATE TABLE "sentry_errors" (
    "id" TEXT NOT NULL,
    "sentryEventId" TEXT NOT NULL,
    "projectId" TEXT,
    "environment" TEXT NOT NULL,
    "errorMessage" TEXT NOT NULL,
    "errorType" TEXT NOT NULL,
    "stackTrace" TEXT NOT NULL,
    "filePath" TEXT,
    "lineNumber" INTEGER,
    "columnNumber" INTEGER,
    "userContext" JSONB,
    "requestContext" JSONB,
    "firstSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeen" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 1,
    "status" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "resolved" BOOLEAN NOT NULL DEFAULT false,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "sentry_errors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "healing_attempts" (
    "id" TEXT NOT NULL,
    "errorId" TEXT NOT NULL,
    "analysisId" TEXT,
    "triggerSource" TEXT NOT NULL,
    "fixCode" TEXT NOT NULL,
    "fixDescription" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "testsPassed" BOOLEAN NOT NULL DEFAULT false,
    "testsRun" INTEGER NOT NULL DEFAULT 0,
    "testsFailed" INTEGER NOT NULL DEFAULT 0,
    "sandboxId" TEXT,
    "validationLogs" TEXT,
    "deployed" BOOLEAN NOT NULL DEFAULT false,
    "deploymentId" TEXT,
    "rolledBack" BOOLEAN NOT NULL DEFAULT false,
    "rollbackReason" TEXT,
    "status" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "duration" INTEGER,
    "approvedBy" TEXT,
    "metadata" JSONB,

    CONSTRAINT "healing_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fix_deployments" (
    "id" TEXT NOT NULL,
    "attemptId" TEXT NOT NULL,
    "projectId" TEXT,
    "environment" TEXT NOT NULL,
    "strategy" TEXT NOT NULL,
    "deployedVersion" TEXT,
    "previousVersion" TEXT,
    "deployedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "rolledBackAt" TIMESTAMP(3),
    "healthCheckPassed" BOOLEAN NOT NULL DEFAULT false,
    "healthCheckDetails" JSONB,
    "errorRateBefore" DOUBLE PRECISION,
    "errorRateAfter" DOUBLE PRECISION,
    "responseTimeBefore" DOUBLE PRECISION,
    "responseTimeAfter" DOUBLE PRECISION,
    "trafficPercentage" INTEGER NOT NULL DEFAULT 100,
    "canaryDuration" INTEGER,
    "autoRollback" BOOLEAN NOT NULL DEFAULT true,
    "rollbackThreshold" DOUBLE PRECISION NOT NULL DEFAULT 0.05,

    CONSTRAINT "fix_deployments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "healing_configs" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "autoHealProduction" BOOLEAN NOT NULL DEFAULT false,
    "autoHealStaging" BOOLEAN NOT NULL DEFAULT true,
    "minConfidence" DOUBLE PRECISION NOT NULL DEFAULT 0.85,
    "maxAttemptsPerHour" INTEGER NOT NULL DEFAULT 5,
    "maxAttemptsPerError" INTEGER NOT NULL DEFAULT 3,
    "cooldownPeriod" INTEGER NOT NULL DEFAULT 3600,
    "notifyOnAttempt" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnSuccess" BOOLEAN NOT NULL DEFAULT true,
    "notifyOnFailure" BOOLEAN NOT NULL DEFAULT true,
    "notificationChannels" JSONB NOT NULL,
    "requireApproval" BOOLEAN NOT NULL DEFAULT true,
    "emergencyKillSwitch" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "healing_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "healing_metrics" (
    "id" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "projectId" TEXT,
    "totalAttempts" INTEGER NOT NULL DEFAULT 0,
    "successfulAttempts" INTEGER NOT NULL DEFAULT 0,
    "failedAttempts" INTEGER NOT NULL DEFAULT 0,
    "rolledBackAttempts" INTEGER NOT NULL DEFAULT 0,
    "avgConfidence" DOUBLE PRECISION,
    "avgTimeToFix" INTEGER,
    "avgTimeToValidate" INTEGER,
    "avgTimeToDeploy" INTEGER,
    "totalErrors" INTEGER NOT NULL DEFAULT 0,
    "healedErrors" INTEGER NOT NULL DEFAULT 0,
    "unhealedErrors" INTEGER NOT NULL DEFAULT 0,
    "successRate" DOUBLE PRECISION,
    "deploymentSuccessRate" DOUBLE PRECISION,

    CONSTRAINT "healing_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "sentry_errors_sentryEventId_key" ON "sentry_errors"("sentryEventId");

-- CreateIndex
CREATE INDEX "sentry_errors_sentryEventId_idx" ON "sentry_errors"("sentryEventId");

-- CreateIndex
CREATE INDEX "sentry_errors_projectId_idx" ON "sentry_errors"("projectId");

-- CreateIndex
CREATE INDEX "sentry_errors_status_idx" ON "sentry_errors"("status");

-- CreateIndex
CREATE INDEX "sentry_errors_environment_idx" ON "sentry_errors"("environment");

-- CreateIndex
CREATE INDEX "sentry_errors_firstSeen_idx" ON "sentry_errors"("firstSeen");

-- CreateIndex
CREATE INDEX "healing_attempts_errorId_idx" ON "healing_attempts"("errorId");

-- CreateIndex
CREATE INDEX "healing_attempts_status_idx" ON "healing_attempts"("status");

-- CreateIndex
CREATE INDEX "healing_attempts_startedAt_idx" ON "healing_attempts"("startedAt");

-- CreateIndex
CREATE INDEX "healing_attempts_confidence_idx" ON "healing_attempts"("confidence");

-- CreateIndex
CREATE UNIQUE INDEX "fix_deployments_attemptId_key" ON "fix_deployments"("attemptId");

-- CreateIndex
CREATE INDEX "fix_deployments_attemptId_idx" ON "fix_deployments"("attemptId");

-- CreateIndex
CREATE INDEX "fix_deployments_projectId_idx" ON "fix_deployments"("projectId");

-- CreateIndex
CREATE INDEX "fix_deployments_environment_idx" ON "fix_deployments"("environment");

-- CreateIndex
CREATE INDEX "fix_deployments_deployedAt_idx" ON "fix_deployments"("deployedAt");

-- CreateIndex
CREATE UNIQUE INDEX "healing_configs_projectId_key" ON "healing_configs"("projectId");

-- CreateIndex
CREATE INDEX "healing_configs_projectId_idx" ON "healing_configs"("projectId");

-- CreateIndex
CREATE INDEX "healing_metrics_date_idx" ON "healing_metrics"("date");

-- CreateIndex
CREATE INDEX "healing_metrics_projectId_idx" ON "healing_metrics"("projectId");

-- AddForeignKey
ALTER TABLE "healing_attempts" ADD CONSTRAINT "healing_attempts_errorId_fkey" FOREIGN KEY ("errorId") REFERENCES "sentry_errors"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fix_deployments" ADD CONSTRAINT "fix_deployments_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "healing_attempts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

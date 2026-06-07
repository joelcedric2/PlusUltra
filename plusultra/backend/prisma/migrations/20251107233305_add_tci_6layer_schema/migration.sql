-- CreateTable
CREATE TABLE "TCIAnalysis" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "context" JSONB NOT NULL,
    "visualInsights" JSONB NOT NULL,
    "causalChain" JSONB,
    "historicalInsights" JSONB NOT NULL,
    "logicVerification" JSONB NOT NULL,
    "finalVerdict" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "overallRisk" DOUBLE PRECISION NOT NULL,
    "timeElapsedMs" INTEGER NOT NULL,
    "costUSD" DOUBLE PRECISION NOT NULL,
    "analysisType" TEXT NOT NULL,
    "userTier" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TCIAnalysis_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TCIOutcome" (
    "id" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "bugsFound" JSONB NOT NULL,
    "breakingChanges" JSONB NOT NULL,
    "userFeedback" TEXT,
    "visualCorrect" BOOLEAN NOT NULL,
    "causalCorrect" BOOLEAN NOT NULL,
    "historicalCorrect" BOOLEAN NOT NULL,
    "logicCorrect" BOOLEAN NOT NULL,
    "synthesisCorrect" BOOLEAN NOT NULL,
    "overallAccuracy" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TCIOutcome_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TCIPattern" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "severity" TEXT NOT NULL,
    "codeSignature" TEXT NOT NULL,
    "visualSignature" JSONB,
    "occurrenceCount" INTEGER NOT NULL DEFAULT 0,
    "detectionCount" INTEGER NOT NULL DEFAULT 0,
    "missedCount" INTEGER NOT NULL DEFAULT 0,
    "accuracy" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TCIPattern_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ModelWeight" (
    "id" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "analysisType" TEXT NOT NULL,
    "currentWeight" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "accuracy" DOUBLE PRECISION NOT NULL DEFAULT 0.5,
    "totalAnalyses" INTEGER NOT NULL DEFAULT 0,
    "correctPredictions" INTEGER NOT NULL DEFAULT 0,
    "lastUpdated" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ModelWeight_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TCIFeedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "analysisId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "wasHelpful" BOOLEAN NOT NULL,
    "comment" TEXT,
    "visualHelpful" BOOLEAN,
    "causalHelpful" BOOLEAN,
    "historicalHelpful" BOOLEAN,
    "logicHelpful" BOOLEAN,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TCIFeedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "TCIAnalysis_userId_createdAt_idx" ON "TCIAnalysis"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "TCIAnalysis_codeHash_idx" ON "TCIAnalysis"("codeHash");

-- CreateIndex
CREATE UNIQUE INDEX "TCIOutcome_analysisId_key" ON "TCIOutcome"("analysisId");

-- CreateIndex
CREATE INDEX "TCIOutcome_createdAt_idx" ON "TCIOutcome"("createdAt");

-- CreateIndex
CREATE INDEX "TCIPattern_category_severity_idx" ON "TCIPattern"("category", "severity");

-- CreateIndex
CREATE INDEX "TCIPattern_accuracy_idx" ON "TCIPattern"("accuracy");

-- CreateIndex
CREATE UNIQUE INDEX "TCIPattern_name_key" ON "TCIPattern"("name");

-- CreateIndex
CREATE INDEX "ModelWeight_accuracy_idx" ON "ModelWeight"("accuracy");

-- CreateIndex
CREATE UNIQUE INDEX "ModelWeight_model_analysisType_key" ON "ModelWeight"("model", "analysisType");

-- CreateIndex
CREATE INDEX "TCIFeedback_userId_idx" ON "TCIFeedback"("userId");

-- CreateIndex
CREATE INDEX "TCIFeedback_analysisId_idx" ON "TCIFeedback"("analysisId");

-- CreateIndex
CREATE INDEX "TCIFeedback_createdAt_idx" ON "TCIFeedback"("createdAt");

-- AddForeignKey
ALTER TABLE "TCIOutcome" ADD CONSTRAINT "TCIOutcome_analysisId_fkey" FOREIGN KEY ("analysisId") REFERENCES "TCIAnalysis"("id") ON DELETE CASCADE ON UPDATE CASCADE;

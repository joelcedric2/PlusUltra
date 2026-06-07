/*
  Warnings:

  - You are about to drop the column `cancelAtPeriodEnd` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `currentPeriodStart` on the `subscriptions` table. All the data in the column will be lost.
  - You are about to drop the column `stripeSubscriptionId` on the `subscriptions` table. All the data in the column will be lost.
  - The `status` column on the `subscriptions` table would be dropped and recreated. This will lead to data loss if there is data in the column.
  - Changed the type of `plan` on the `subscriptions` table. No cast exists, the column would be dropped and recreated, which cannot be done if there is data, since the column is required.

*/
-- DropIndex
DROP INDEX "public"."subscriptions_stripeCustomerId_key";

-- DropIndex
DROP INDEX "public"."subscriptions_stripeSubscriptionId_key";

-- AlterTable
ALTER TABLE "subscriptions" DROP COLUMN "cancelAtPeriodEnd",
DROP COLUMN "currentPeriodStart",
DROP COLUMN "stripeSubscriptionId",
ADD COLUMN     "stripeSubId" TEXT,
DROP COLUMN "plan",
ADD COLUMN     "plan" TEXT NOT NULL,
DROP COLUMN "status",
ADD COLUMN     "status" TEXT NOT NULL DEFAULT 'active',
ALTER COLUMN "currentPeriodEnd" DROP NOT NULL;

-- DropEnum
DROP TYPE "public"."SubscriptionPlan";

-- DropEnum
DROP TYPE "public"."SubscriptionStatus";

-- CreateTable
CREATE TABLE "revenue_agreements" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "consented" BOOLEAN NOT NULL DEFAULT false,
    "sharePercent" DOUBLE PRECISION NOT NULL DEFAULT 0.3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "revenue_agreements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revenue_reports" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "grossRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "platformShare" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netRevenue" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "revenue_reports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "council_cases" (
    "id" TEXT NOT NULL,
    "scenarioType" TEXT NOT NULL,
    "scenarioDescription" TEXT NOT NULL,
    "scenarioContext" JSONB NOT NULL,
    "codeSnippet" TEXT,
    "options" JSONB NOT NULL,
    "chosenOptionId" TEXT NOT NULL,
    "decisionReasoning" TEXT NOT NULL,
    "votingResults" JSONB NOT NULL,
    "outcomeResult" TEXT,
    "lessonsLearned" TEXT[],
    "outcomeRecordedAt" TIMESTAMP(3),
    "embedding" TEXT,
    "tags" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "council_cases_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "revenue_agreements_userId_idx" ON "revenue_agreements"("userId");

-- CreateIndex
CREATE INDEX "revenue_agreements_projectId_idx" ON "revenue_agreements"("projectId");

-- CreateIndex
CREATE UNIQUE INDEX "revenue_agreements_userId_projectId_key" ON "revenue_agreements"("userId", "projectId");

-- CreateIndex
CREATE INDEX "revenue_reports_userId_idx" ON "revenue_reports"("userId");

-- CreateIndex
CREATE INDEX "revenue_reports_projectId_idx" ON "revenue_reports"("projectId");

-- CreateIndex
CREATE INDEX "revenue_reports_period_idx" ON "revenue_reports"("period");

-- CreateIndex
CREATE UNIQUE INDEX "revenue_reports_userId_projectId_period_key" ON "revenue_reports"("userId", "projectId", "period");

-- CreateIndex
CREATE INDEX "council_cases_scenarioType_idx" ON "council_cases"("scenarioType");

-- CreateIndex
CREATE INDEX "council_cases_outcomeResult_idx" ON "council_cases"("outcomeResult");

-- CreateIndex
CREATE INDEX "council_cases_createdAt_idx" ON "council_cases"("createdAt");

-- CreateIndex
CREATE INDEX "council_cases_tags_idx" ON "council_cases"("tags");

-- AddForeignKey
ALTER TABLE "revenue_agreements" ADD CONSTRAINT "revenue_agreements_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_agreements" ADD CONSTRAINT "revenue_agreements_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_reports" ADD CONSTRAINT "revenue_reports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "revenue_reports" ADD CONSTRAINT "revenue_reports_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

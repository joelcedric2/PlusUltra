/*
  Warnings:

  - Added the required column `verdict` to the `TCIAnalysis` table without a default value. This is not possible if the table is not empty.

*/
-- AlterTable
ALTER TABLE "TCIAnalysis" ADD COLUMN     "verdict" TEXT NOT NULL;

-- CreateTable
CREATE TABLE "collaboration_documents" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "state" BYTEA NOT NULL,
    "lastModified" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collaboration_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaboration_sessions" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    "lastActivity" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "participants" JSONB NOT NULL,
    "tciEnabled" BOOLEAN NOT NULL DEFAULT false,
    "metadata" JSONB,

    CONSTRAINT "collaboration_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaboration_activities" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "metadata" JSONB,

    CONSTRAINT "collaboration_activities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaborative_tci_results" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "verdict" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "triggeredBy" TEXT NOT NULL,
    "sharedWith" TEXT[],
    "summary" JSONB NOT NULL,
    "fullReport" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collaborative_tci_results_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collaboration_notifications" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "data" JSONB,
    "read" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "collaboration_notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "collaboration_documents_workspaceId_idx" ON "collaboration_documents"("workspaceId");

-- CreateIndex
CREATE INDEX "collaboration_documents_filePath_idx" ON "collaboration_documents"("filePath");

-- CreateIndex
CREATE INDEX "collaboration_sessions_workspaceId_idx" ON "collaboration_sessions"("workspaceId");

-- CreateIndex
CREATE INDEX "collaboration_sessions_documentId_idx" ON "collaboration_sessions"("documentId");

-- CreateIndex
CREATE INDEX "collaboration_sessions_isActive_idx" ON "collaboration_sessions"("isActive");

-- CreateIndex
CREATE INDEX "collaboration_sessions_lastActivity_idx" ON "collaboration_sessions"("lastActivity");

-- CreateIndex
CREATE INDEX "collaboration_activities_sessionId_idx" ON "collaboration_activities"("sessionId");

-- CreateIndex
CREATE INDEX "collaboration_activities_userId_idx" ON "collaboration_activities"("userId");

-- CreateIndex
CREATE INDEX "collaboration_activities_timestamp_idx" ON "collaboration_activities"("timestamp");

-- CreateIndex
CREATE INDEX "collaborative_tci_results_sessionId_idx" ON "collaborative_tci_results"("sessionId");

-- CreateIndex
CREATE INDEX "collaborative_tci_results_documentId_idx" ON "collaborative_tci_results"("documentId");

-- CreateIndex
CREATE INDEX "collaborative_tci_results_createdAt_idx" ON "collaborative_tci_results"("createdAt");

-- CreateIndex
CREATE INDEX "collaboration_notifications_userId_idx" ON "collaboration_notifications"("userId");

-- CreateIndex
CREATE INDEX "collaboration_notifications_sessionId_idx" ON "collaboration_notifications"("sessionId");

-- CreateIndex
CREATE INDEX "collaboration_notifications_read_idx" ON "collaboration_notifications"("read");

-- CreateIndex
CREATE INDEX "collaboration_notifications_createdAt_idx" ON "collaboration_notifications"("createdAt");

-- AddForeignKey
ALTER TABLE "collaboration_activities" ADD CONSTRAINT "collaboration_activities_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "collaboration_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaborative_tci_results" ADD CONSTRAINT "collaborative_tci_results_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "collaboration_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collaboration_notifications" ADD CONSTRAINT "collaboration_notifications_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "collaboration_sessions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

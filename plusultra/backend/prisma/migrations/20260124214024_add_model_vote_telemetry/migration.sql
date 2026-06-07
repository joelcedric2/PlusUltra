-- CreateTable
CREATE TABLE "model_votes" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "taskType" TEXT NOT NULL,
    "winner" TEXT NOT NULL,
    "claudeVote" INTEGER NOT NULL,
    "gpt5Vote" INTEGER NOT NULL,
    "geminiVote" INTEGER NOT NULL,
    "grokVote" INTEGER NOT NULL,
    "deepseekVote" INTEGER NOT NULL,
    "agreement" DOUBLE PRECISION NOT NULL,
    "userId" TEXT NOT NULL,
    "sessionId" TEXT,
    "consensusReached" BOOLEAN NOT NULL,

    CONSTRAINT "model_votes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "model_votes_userId_idx" ON "model_votes"("userId");

-- CreateIndex
CREATE INDEX "model_votes_taskType_idx" ON "model_votes"("taskType");

-- CreateIndex
CREATE INDEX "model_votes_winner_idx" ON "model_votes"("winner");

-- CreateIndex
CREATE INDEX "model_votes_timestamp_idx" ON "model_votes"("timestamp");

-- AddForeignKey
ALTER TABLE "model_votes" ADD CONSTRAINT "model_votes_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

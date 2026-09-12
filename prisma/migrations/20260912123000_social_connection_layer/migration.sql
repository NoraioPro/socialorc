-- Social connection layer: per-account capability bookkeeping and the
-- publishing job table the worker drains.
--
-- SocialAccount gains the fields the spec needs to tell "connected" apart from
-- "allowed to publish": account kind, user-vs-page parent, granted scopes, a
-- cached capability report, refresh-token expiry and a disconnect marker.
-- Existing rows keep working: every new column is nullable.

ALTER TABLE "SocialAccount" ADD COLUMN "accountType" TEXT;
ALTER TABLE "SocialAccount" ADD COLUMN "externalParentId" TEXT;
ALTER TABLE "SocialAccount" ADD COLUMN "scopes" TEXT;
ALTER TABLE "SocialAccount" ADD COLUMN "capabilities" JSONB;
ALTER TABLE "SocialAccount" ADD COLUMN "refreshTokenExpiresAt" DATETIME;
ALTER TABLE "SocialAccount" ADD COLUMN "disconnectedAt" DATETIME;

CREATE TABLE "PublishingJob" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "postId" TEXT,
    "platform" TEXT NOT NULL,
    "publishMethod" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "scheduledAt" DATETIME,
    "idempotencyKey" TEXT,
    "externalPostId" TEXT,
    "attemptCount" INTEGER NOT NULL DEFAULT 0,
    "lastErrorCode" TEXT,
    "lastErrorMessage" TEXT,
    "lastErrorDetail" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "startedAt" DATETIME,
    "completedAt" DATETIME,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PublishingJob_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PublishingJob_idempotencyKey_key" ON "PublishingJob"("idempotencyKey");
CREATE INDEX "PublishingJob_status_idx" ON "PublishingJob"("status");
CREATE INDEX "PublishingJob_scheduledAt_idx" ON "PublishingJob"("scheduledAt");
CREATE INDEX "PublishingJob_userId_idx" ON "PublishingJob"("userId");
CREATE INDEX "PublishingJob_socialAccountId_idx" ON "PublishingJob"("socialAccountId");

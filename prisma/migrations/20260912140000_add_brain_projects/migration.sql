-- Brain (project) model: the container social accounts are connected into.
-- A user can run several brains, each with its own independent set of
-- platform connections (src/lib routes now scope SocialAccount by brainId).

CREATE TABLE "Brain" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Brain_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE INDEX "Brain_userId_idx" ON "Brain"("userId");

-- Backfill: one "Default" brain per user who already has social accounts, so
-- existing connections keep working without a manual migration step.
INSERT INTO "Brain" ("id", "userId", "name", "isDefault", "updatedAt")
SELECT 'brain_' || lower(hex(randomblob(12))), "userId", 'Default', 1, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "userId" FROM "SocialAccount");

-- SQLite cannot add a NOT NULL FK column to an existing table in place, so
-- SocialAccount is rebuilt with brainId included from the start.
CREATE TABLE "new_SocialAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "brainId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "platformUsername" TEXT,
    "displayName" TEXT,
    "profileImageUrl" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "tokenExpiresAt" DATETIME,
    "metadata" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SocialAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SocialAccount_brainId_fkey" FOREIGN KEY ("brainId") REFERENCES "Brain" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

INSERT INTO "new_SocialAccount" ("id","userId","brainId","platform","platformUserId","platformUsername","displayName","profileImageUrl","accessToken","refreshToken","tokenExpiresAt","metadata","isActive","lastSyncAt","createdAt","updatedAt")
SELECT sa."id", sa."userId", b."id", sa."platform", sa."platformUserId", sa."platformUsername", sa."displayName", sa."profileImageUrl", sa."accessToken", sa."refreshToken", sa."tokenExpiresAt", sa."metadata", sa."isActive", sa."lastSyncAt", sa."createdAt", sa."updatedAt"
FROM "SocialAccount" sa
JOIN "Brain" b ON b."userId" = sa."userId";

DROP TABLE "SocialAccount";
ALTER TABLE "new_SocialAccount" RENAME TO "SocialAccount";

CREATE UNIQUE INDEX "SocialAccount_platform_platformUserId_key" ON "SocialAccount"("platform", "platformUserId");
CREATE INDEX "SocialAccount_userId_idx" ON "SocialAccount"("userId");
CREATE INDEX "SocialAccount_brainId_idx" ON "SocialAccount"("brainId");
CREATE INDEX "SocialAccount_platform_idx" ON "SocialAccount"("platform");

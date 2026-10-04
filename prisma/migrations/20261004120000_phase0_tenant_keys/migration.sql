-- AlterTable
ALTER TABLE "ScheduledJob" ADD COLUMN "workspaceId" TEXT;

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Brain" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "name" TEXT NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Brain_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Brain_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_Brain" ("createdAt", "id", "isDefault", "name", "updatedAt", "userId") SELECT "createdAt", "id", "isDefault", "name", "updatedAt", "userId" FROM "Brain";
DROP TABLE "Brain";
ALTER TABLE "new_Brain" RENAME TO "Brain";
CREATE INDEX "Brain_userId_idx" ON "Brain"("userId");
CREATE INDEX "Brain_workspaceId_idx" ON "Brain"("workspaceId");
CREATE TABLE "new_SocialAccount" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "brainId" TEXT,
    "platform" TEXT NOT NULL,
    "platformUserId" TEXT NOT NULL,
    "platformUsername" TEXT,
    "displayName" TEXT,
    "profileImageUrl" TEXT,
    "accessToken" TEXT NOT NULL,
    "refreshToken" TEXT,
    "tokenExpiresAt" DATETIME,
    "metadata" JSONB,
    "accountType" TEXT,
    "externalParentId" TEXT,
    "scopes" TEXT,
    "capabilities" JSONB,
    "refreshTokenExpiresAt" DATETIME,
    "disconnectedAt" DATETIME,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastSyncAt" DATETIME,
    "lastError" TEXT,
    "needsReconnect" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "SocialAccount_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SocialAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SocialAccount_brainId_fkey" FOREIGN KEY ("brainId") REFERENCES "Brain" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_SocialAccount" ("accessToken", "accountType", "brainId", "capabilities", "createdAt", "disconnectedAt", "displayName", "externalParentId", "id", "isActive", "lastError", "lastSyncAt", "metadata", "needsReconnect", "platform", "platformUserId", "platformUsername", "profileImageUrl", "refreshToken", "refreshTokenExpiresAt", "scopes", "tokenExpiresAt", "updatedAt", "userId", "workspaceId") SELECT "accessToken", "accountType", "brainId", "capabilities", "createdAt", "disconnectedAt", "displayName", "externalParentId", "id", "isActive", "lastError", "lastSyncAt", "metadata", "needsReconnect", "platform", "platformUserId", "platformUsername", "profileImageUrl", "refreshToken", "refreshTokenExpiresAt", "scopes", "tokenExpiresAt", "updatedAt", "userId", "workspaceId" FROM "SocialAccount";
DROP TABLE "SocialAccount";
ALTER TABLE "new_SocialAccount" RENAME TO "SocialAccount";
CREATE INDEX "SocialAccount_userId_idx" ON "SocialAccount"("userId");
CREATE INDEX "SocialAccount_brainId_idx" ON "SocialAccount"("brainId");
CREATE INDEX "SocialAccount_platform_idx" ON "SocialAccount"("platform");
CREATE INDEX "SocialAccount_workspaceId_idx" ON "SocialAccount"("workspaceId");
CREATE UNIQUE INDEX "SocialAccount_platform_platformUserId_key" ON "SocialAccount"("platform", "platformUserId");
CREATE TABLE "new_Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "socialAccountId" TEXT,
    "title" TEXT,
    "content" TEXT NOT NULL,
    "platformContent" JSONB,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "scheduledFor" DATETIME,
    "publishedAt" DATETIME,
    "platform" TEXT NOT NULL,
    "approvedAt" DATETIME,
    "approvedBy" TEXT,
    "rejectionReason" TEXT,
    "platformPostId" TEXT,
    "platformPostUrl" TEXT,
    "errorMessage" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "lastRetryAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Post_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Post_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Post_socialAccountId_fkey" FOREIGN KEY ("socialAccountId") REFERENCES "SocialAccount" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Post" ("approvedAt", "approvedBy", "content", "createdAt", "errorMessage", "id", "lastRetryAt", "platform", "platformContent", "platformPostId", "platformPostUrl", "publishedAt", "rejectionReason", "retryCount", "scheduledFor", "socialAccountId", "status", "title", "updatedAt", "userId") SELECT "approvedAt", "approvedBy", "content", "createdAt", "errorMessage", "id", "lastRetryAt", "platform", "platformContent", "platformPostId", "platformPostUrl", "publishedAt", "rejectionReason", "retryCount", "scheduledFor", "socialAccountId", "status", "title", "updatedAt", "userId" FROM "Post";
DROP TABLE "Post";
ALTER TABLE "new_Post" RENAME TO "Post";
CREATE INDEX "Post_userId_idx" ON "Post"("userId");
CREATE INDEX "Post_workspaceId_idx" ON "Post"("workspaceId");
CREATE INDEX "Post_status_idx" ON "Post"("status");
CREATE INDEX "Post_platform_idx" ON "Post"("platform");
CREATE INDEX "Post_scheduledFor_idx" ON "Post"("scheduledFor");
CREATE INDEX "Post_socialAccountId_idx" ON "Post"("socialAccountId");
CREATE TABLE "new_MediaAsset" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "url" TEXT NOT NULL,
    "blobPath" TEXT,
    "width" INTEGER,
    "height" INTEGER,
    "duration" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "MediaAsset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "MediaAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_MediaAsset" ("blobPath", "createdAt", "duration", "filename", "height", "id", "mimeType", "size", "updatedAt", "url", "userId", "width") SELECT "blobPath", "createdAt", "duration", "filename", "height", "id", "mimeType", "size", "updatedAt", "url", "userId", "width" FROM "MediaAsset";
DROP TABLE "MediaAsset";
ALTER TABLE "new_MediaAsset" RENAME TO "MediaAsset";
CREATE INDEX "MediaAsset_userId_idx" ON "MediaAsset"("userId");
CREATE INDEX "MediaAsset_workspaceId_idx" ON "MediaAsset"("workspaceId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "ScheduledJob_workspaceId_idx" ON "ScheduledJob"("workspaceId");


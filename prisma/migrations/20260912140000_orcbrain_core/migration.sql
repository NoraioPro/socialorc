-- OrcBrain core: the shared intelligence layer.
--
-- Adds workspaces (the isolation boundary), structured brand knowledge,
-- knowledge sources + embedded chunks, AI memories, insights, conversations,
-- messages and agent charters; and gives SocialAccount a workspace so brain
-- queries can be scoped to it.
--
-- Backfill: every existing user gets one workspace they own, and their existing
-- social accounts move into it, so nothing in the app is left unscoped.

CREATE TABLE "Workspace" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "WorkspaceMember" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'MEMBER',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceMember_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "WorkspaceMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "BrandProfile" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "brandName" TEXT,
    "tagline" TEXT,
    "description" TEXT,
    "industry" TEXT,
    "website" TEXT,
    "markets" TEXT,
    "languages" TEXT,
    "mission" TEXT,
    "vision" TEXT,
    "values" TEXT,
    "tone" TEXT,
    "personality" TEXT,
    "writingStyle" TEXT,
    "wordsPrefer" TEXT,
    "wordsAvoid" TEXT,
    "emojiStyle" TEXT,
    "ctaStyle" TEXT,
    "humorLevel" INTEGER,
    "formalityLevel" INTEGER,
    "audiencePrimary" TEXT,
    "audienceSecondary" TEXT,
    "audienceAgeRanges" TEXT,
    "audienceLocations" TEXT,
    "audienceInterests" TEXT,
    "audiencePainPoints" TEXT,
    "audienceMotivations" TEXT,
    "products" JSONB,
    "goals" JSONB,
    "contentStrategy" JSONB,
    "competitors" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BrandProfile_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "BrainSource" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sourceUrl" TEXT,
    "blobUrl" TEXT,
    "fileName" TEXT,
    "fileType" TEXT,
    "fileSize" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'processing',
    "errorMessage" TEXT,
    "extractedText" TEXT,
    "metadata" JSONB,
    "createdBy" TEXT,
    "lastSyncedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BrainSource_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "BrainChunk" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "chunkIndex" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "embedding" TEXT,
    "embeddingModel" TEXT,
    "tokenCount" INTEGER,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BrainChunk_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "BrainChunk_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "BrainSource" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "BrainMemory" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "confidence" REAL NOT NULL DEFAULT 0.5,
    "source" TEXT NOT NULL DEFAULT 'ai_inference',
    "evidence" JSONB,
    "approved" BOOLEAN NOT NULL DEFAULT false,
    "dismissed" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "BrainMemory_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "BrainInsight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "insightType" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "insight" TEXT NOT NULL,
    "evidence" JSONB,
    "confidence" REAL NOT NULL DEFAULT 0.5,
    "periodStart" DATETIME,
    "periodEnd" DATETIME,
    "expiresAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "BrainInsight_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "agentId" TEXT,
    "title" TEXT NOT NULL DEFAULT 'New chat',
    "summary" TEXT,
    "pinned" BOOLEAN NOT NULL DEFAULT false,
    "archived" BOOLEAN NOT NULL DEFAULT false,
    "lastMessageAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Conversation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Message" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "conversationId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "metadata" JSONB,
    "model" TEXT,
    "promptTokens" INTEGER,
    "completionTokens" INTEGER,
    "agentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Message_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "MessageAttachment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "messageId" TEXT NOT NULL,
    "assetUrl" TEXT,
    "fileName" TEXT,
    "fileType" TEXT,
    "fileSize" INTEGER,
    "brainSourceId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MessageAttachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "Message" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "AiAgent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "description" TEXT,
    "systemInstructions" TEXT NOT NULL,
    "enabledTools" JSONB,
    "avatar" TEXT,
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "AiAgent_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- SocialAccount gains its workspace. Nullable + SET NULL so an account can never
-- be lost by a workspace deletion, and the connector path keeps working until a
-- workspace is resolved.
ALTER TABLE "SocialAccount" ADD COLUMN "workspaceId" TEXT REFERENCES "Workspace" ("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE UNIQUE INDEX "Workspace_slug_key" ON "Workspace"("slug");
CREATE UNIQUE INDEX "WorkspaceMember_workspaceId_userId_key" ON "WorkspaceMember"("workspaceId", "userId");
CREATE INDEX "WorkspaceMember_userId_idx" ON "WorkspaceMember"("userId");
CREATE UNIQUE INDEX "BrandProfile_workspaceId_key" ON "BrandProfile"("workspaceId");
CREATE INDEX "BrainSource_workspaceId_status_idx" ON "BrainSource"("workspaceId", "status");
CREATE INDEX "BrainSource_workspaceId_type_idx" ON "BrainSource"("workspaceId", "type");
CREATE INDEX "BrainChunk_workspaceId_idx" ON "BrainChunk"("workspaceId");
CREATE INDEX "BrainChunk_sourceId_idx" ON "BrainChunk"("sourceId");
CREATE INDEX "BrainMemory_workspaceId_approved_idx" ON "BrainMemory"("workspaceId", "approved");
CREATE INDEX "BrainInsight_workspaceId_insightType_idx" ON "BrainInsight"("workspaceId", "insightType");
CREATE INDEX "Conversation_workspaceId_lastMessageAt_idx" ON "Conversation"("workspaceId", "lastMessageAt");
CREATE INDEX "Conversation_userId_idx" ON "Conversation"("userId");
CREATE INDEX "Message_conversationId_createdAt_idx" ON "Message"("conversationId", "createdAt");
CREATE INDEX "MessageAttachment_messageId_idx" ON "MessageAttachment"("messageId");
CREATE UNIQUE INDEX "AiAgent_workspaceId_slug_key" ON "AiAgent"("workspaceId", "slug");
CREATE INDEX "AiAgent_slug_idx" ON "AiAgent"("slug");
CREATE INDEX "SocialAccount_workspaceId_idx" ON "SocialAccount"("workspaceId");

-- Backfill 1: one owned workspace per existing user. The id is derived from the
-- user id so the second and third inserts can join on it without a lookup.
INSERT INTO "Workspace" ("id", "name", "slug", "createdAt", "updatedAt")
SELECT
  'ws_' || "id",
  COALESCE(
    NULLIF(TRIM(COALESCE("name", '')), ''),
    NULLIF(SUBSTR(COALESCE("email", ''), 1, INSTR(COALESCE("email", ''), '@') - 1), ''),
    'Workspace'
  ),
  'ws-' || LOWER("id"),
  CURRENT_TIMESTAMP,
  CURRENT_TIMESTAMP
FROM "User";

-- Backfill 2: the user owns it.
INSERT INTO "WorkspaceMember" ("id", "workspaceId", "userId", "role", "createdAt")
SELECT 'wm_' || "id", 'ws_' || "id", "id", 'OWNER', CURRENT_TIMESTAMP FROM "User";

-- Backfill 3: existing social accounts belong to that workspace.
UPDATE "SocialAccount" SET "workspaceId" = 'ws_' || "userId" WHERE "workspaceId" IS NULL;

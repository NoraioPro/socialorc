-- CreateTable
CREATE TABLE "TelegramConnectCode" (
    "id" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "chatId" TEXT,
    "chatType" TEXT,
    "authorId" TEXT,
    "seenAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramConnectCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramConnectCode_codeHash_key" ON "TelegramConnectCode"("codeHash");

-- CreateIndex
CREATE INDEX "TelegramConnectCode_userId_workspaceId_idx" ON "TelegramConnectCode"("userId", "workspaceId");

-- CreateIndex
CREATE INDEX "TelegramConnectCode_expiresAt_idx" ON "TelegramConnectCode"("expiresAt");

-- ---------------------------------------------------------------------------
-- Every Telegram chat is its own account.
--
-- Telegram accounts used the bot id as platformUserId, and (platform,
-- platformUserId) is unique, so the first workspace to connect owned the one
-- shared bot for the whole deployment. Accounts are now keyed `<botId>:<chatId>`
-- (src/lib/adapters/telegram.ts telegramAccountId): different workspaces can
-- connect different chats, and one chat still cannot be bound by two.
--
-- Existing rows are re-keyed from the chat id stored in their metadata. Rows
-- without one (mock rows, never-finished connects) are left alone. Idempotent:
-- a row already carrying a ':' is skipped.
-- ---------------------------------------------------------------------------
UPDATE "SocialAccount"
SET "platformUserId" = "platformUserId" || ':' || ("metadata"->>'chatId')
WHERE "platform" = 'TELEGRAM'
  AND POSITION(':' IN "platformUserId") = 0
  AND COALESCE(TRIM("metadata"->>'chatId'), '') <> ''
  AND NOT EXISTS (
    SELECT 1 FROM "SocialAccount" o
    WHERE o."platform" = 'TELEGRAM'
      AND o."platformUserId" = "SocialAccount"."platformUserId" || ':' || ("SocialAccount"."metadata"->>'chatId')
  );

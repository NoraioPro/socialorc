-- AlterTable
ALTER TABLE "ScheduledJob" ADD COLUMN "pendingPublishId" TEXT;
ALTER TABLE "ScheduledJob" ADD COLUMN "pendingSince" DATETIME;

-- CreateTable
CREATE TABLE "TelegramReply" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "updateId" BIGINT NOT NULL,
    "chatId" TEXT NOT NULL,
    "messageId" INTEGER NOT NULL,
    "replyToMessageId" INTEGER NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT,
    "text" TEXT NOT NULL,
    "sentAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "TelegramUpdateCursor" (
    "botId" TEXT NOT NULL PRIMARY KEY,
    "nextOffset" BIGINT NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramReply_updateId_key" ON "TelegramReply"("updateId");

-- CreateIndex
CREATE INDEX "TelegramReply_chatId_replyToMessageId_idx" ON "TelegramReply"("chatId", "replyToMessageId");


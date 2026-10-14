-- AlterTable
ALTER TABLE "ScheduledJob" ADD COLUMN     "pendingPublishId" TEXT,
ADD COLUMN     "pendingSince" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "TelegramReply" (
    "id" TEXT NOT NULL,
    "updateId" BIGINT NOT NULL,
    "chatId" TEXT NOT NULL,
    "messageId" INTEGER NOT NULL,
    "replyToMessageId" INTEGER NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT,
    "text" TEXT NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TelegramReply_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TelegramUpdateCursor" (
    "botId" TEXT NOT NULL,
    "nextOffset" BIGINT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TelegramUpdateCursor_pkey" PRIMARY KEY ("botId")
);

-- CreateIndex
CREATE UNIQUE INDEX "TelegramReply_updateId_key" ON "TelegramReply"("updateId");

-- CreateIndex
CREATE INDEX "TelegramReply_chatId_replyToMessageId_idx" ON "TelegramReply"("chatId", "replyToMessageId");


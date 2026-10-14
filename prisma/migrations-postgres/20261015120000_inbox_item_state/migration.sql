-- CreateTable
CREATE TABLE "InboxItemState" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "repliedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InboxItemState_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "InboxItemState_workspaceId_idx" ON "InboxItemState"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "InboxItemState_socialAccountId_commentId_key" ON "InboxItemState"("socialAccountId", "commentId");

-- CreateTable
CREATE TABLE "InboxItemState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "socialAccountId" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "readAt" DATETIME,
    "repliedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "InboxItemState_workspaceId_idx" ON "InboxItemState"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "InboxItemState_socialAccountId_commentId_key" ON "InboxItemState"("socialAccountId", "commentId");

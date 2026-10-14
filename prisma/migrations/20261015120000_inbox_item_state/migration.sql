-- CreateTable
CREATE TABLE "InboxItemState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "readAt" DATETIME,
    "repliedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "InboxItemState_workspaceId_platform_commentId_key" ON "InboxItemState"("workspaceId", "platform", "commentId");

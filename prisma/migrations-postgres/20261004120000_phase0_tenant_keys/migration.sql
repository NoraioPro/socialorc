-- DropForeignKey
ALTER TABLE "SocialAccount" DROP CONSTRAINT "SocialAccount_workspaceId_fkey";

-- AlterTable
ALTER TABLE "Brain" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "Post" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "MediaAsset" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "ScheduledJob" ADD COLUMN     "workspaceId" TEXT;

-- CreateIndex
CREATE INDEX "Brain_workspaceId_idx" ON "Brain"("workspaceId");

-- CreateIndex
CREATE INDEX "Post_workspaceId_idx" ON "Post"("workspaceId");

-- CreateIndex
CREATE INDEX "MediaAsset_workspaceId_idx" ON "MediaAsset"("workspaceId");

-- CreateIndex
CREATE INDEX "ScheduledJob_workspaceId_idx" ON "ScheduledJob"("workspaceId");

-- AddForeignKey
ALTER TABLE "Brain" ADD CONSTRAINT "Brain_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SocialAccount" ADD CONSTRAINT "SocialAccount_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Post" ADD CONSTRAINT "Post_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MediaAsset" ADD CONSTRAINT "MediaAsset_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;


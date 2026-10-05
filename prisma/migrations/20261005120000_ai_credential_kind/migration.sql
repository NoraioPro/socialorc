-- AlterTable
ALTER TABLE "AiCredential" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'text';

-- DropIndex
DROP INDEX "AiCredential_userId_key";

-- DropIndex
DROP INDEX "AiCredential_workspaceId_key";

-- CreateIndex
CREATE UNIQUE INDEX "AiCredential_userId_kind_key" ON "AiCredential"("userId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "AiCredential_workspaceId_kind_key" ON "AiCredential"("workspaceId", "kind");

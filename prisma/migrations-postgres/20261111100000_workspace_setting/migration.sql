-- Per-workspace key/value settings.
CREATE TABLE "WorkspaceSetting" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkspaceSetting_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkspaceSetting_workspaceId_key_key" ON "WorkspaceSetting"("workspaceId", "key");
ALTER TABLE "WorkspaceSetting" ADD CONSTRAINT "WorkspaceSetting_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- MediaAsset: alt text.
ALTER TABLE "MediaAsset" ADD COLUMN "altText" TEXT;

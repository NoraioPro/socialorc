-- Per-workspace key/value settings.
CREATE TABLE "WorkspaceSetting" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkspaceSetting_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WorkspaceSetting_workspaceId_key_key" ON "WorkspaceSetting"("workspaceId", "key");

-- MediaAsset: alt text.
ALTER TABLE "MediaAsset" ADD COLUMN "altText" TEXT;

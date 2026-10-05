CREATE TABLE "WorkspacePlatformCredential" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "workspaceId" TEXT NOT NULL,
    "platform" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "encryptedAppSecret" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "WorkspacePlatformCredential_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "WorkspacePlatformCredential_workspaceId_platform_idx" ON "WorkspacePlatformCredential"("workspaceId", "platform");
CREATE INDEX "WorkspacePlatformCredential_workspaceId_idx" ON "WorkspacePlatformCredential"("workspaceId");

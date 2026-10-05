CREATE TABLE "WorkspacePlatformCredential" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "platform" "Platform" NOT NULL,
    "appId" TEXT NOT NULL,
    "encryptedAppSecret" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "WorkspacePlatformCredential_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "WorkspacePlatformCredential_workspaceId_platform_key" ON "WorkspacePlatformCredential"("workspaceId", "platform");
CREATE INDEX "WorkspacePlatformCredential_workspaceId_idx" ON "WorkspacePlatformCredential"("workspaceId");
ALTER TABLE "WorkspacePlatformCredential" ADD CONSTRAINT "WorkspacePlatformCredential_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

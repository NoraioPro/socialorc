-- Timeline team updates and per-brain profiles.

-- NativePost: team updates belong to a workspace.
ALTER TABLE "NativePost" ADD COLUMN "workspaceId" TEXT;
CREATE INDEX "NativePost_workspaceId_createdAt_idx" ON "NativePost"("workspaceId", "createdAt");

-- CreateTable
CREATE TABLE "NativePostReaction" (
    "id" TEXT NOT NULL,
    "nativePostId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'LIKE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NativePostReaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "NativePostReaction_nativePostId_userId_key" ON "NativePostReaction"("nativePostId", "userId");
CREATE INDEX "NativePostReaction_nativePostId_idx" ON "NativePostReaction"("nativePostId");
ALTER TABLE "NativePostReaction" ADD CONSTRAINT "NativePostReaction_nativePostId_fkey" FOREIGN KEY ("nativePostId") REFERENCES "NativePost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NativePostReaction" ADD CONSTRAINT "NativePostReaction_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "NativePostComment" (
    "id" TEXT NOT NULL,
    "nativePostId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NativePostComment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "NativePostComment_nativePostId_createdAt_idx" ON "NativePostComment"("nativePostId", "createdAt");
ALTER TABLE "NativePostComment" ADD CONSTRAINT "NativePostComment_nativePostId_fkey" FOREIGN KEY ("nativePostId") REFERENCES "NativePost"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NativePostComment" ADD CONSTRAINT "NativePostComment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Brain: colour, handle and the brand profile.
ALTER TABLE "Brain" ADD COLUMN "color" TEXT;
ALTER TABLE "Brain" ADD COLUMN "handle" TEXT;
ALTER TABLE "Brain" ADD COLUMN "profile" TEXT;

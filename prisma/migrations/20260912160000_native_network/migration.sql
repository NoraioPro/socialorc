-- SocialOrc Network: the native timeline and friendships.
--
-- Posts are authored by a user (platform-wide network), not by a workspace.
-- `visibility` is stored as TEXT because SQLite has no enum; it is parsed
-- strictly in src/lib/network/timeline.ts and never trusted from the client.
-- `deletedAt` is a soft delete so content vanishes from every timeline while
-- staying auditable.

CREATE TABLE "NativePost" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "authorId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "visibility" TEXT NOT NULL DEFAULT 'PUBLIC',
    "deletedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "NativePost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Friendship" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "requesterId" TEXT NOT NULL,
    "addresseeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "respondedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Friendship_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Friendship_addresseeId_fkey" FOREIGN KEY ("addresseeId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Timeline reads: newest-first scan with a total order (createdAt, id).
CREATE INDEX "NativePost_createdAt_id_idx" ON "NativePost"("createdAt", "id");
-- "my posts" and author deletion cascades.
CREATE INDEX "NativePost_authorId_createdAt_idx" ON "NativePost"("authorId", "createdAt");
-- One row per ordered pair; the reverse direction is guarded in application
-- code (friendRequestState looks at either direction), so both A->B and B->A
-- cannot be acted on as separate pending requests.
CREATE UNIQUE INDEX "Friendship_requesterId_addresseeId_key" ON "Friendship"("requesterId", "addresseeId");
-- Incoming requests / friend lists.
CREATE INDEX "Friendship_addresseeId_status_idx" ON "Friendship"("addresseeId", "status");
CREATE INDEX "Friendship_requesterId_status_idx" ON "Friendship"("requesterId", "status");

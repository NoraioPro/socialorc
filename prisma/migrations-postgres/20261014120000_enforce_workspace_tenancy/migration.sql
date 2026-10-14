-- AlterTable
ALTER TABLE "BrandBrain" ADD COLUMN     "workspaceId" TEXT;

-- AlterTable
ALTER TABLE "Invitation" ADD COLUMN     "workspaceId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "BrandBrain_workspaceId_key" ON "BrandBrain"("workspaceId");

-- CreateIndex
CREATE INDEX "Invitation_workspaceId_idx" ON "Invitation"("workspaceId");

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BrandBrain" ADD CONSTRAINT "BrandBrain_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- ---------------------------------------------------------------------------
-- Tenancy backfill (docs/SAAS-PLAN.md §6). Runs inside this migration because
-- the deploy runs `migrate deploy` on build and has no separate data step.
--
-- Written once for both histories: plain SQL that sqlite and postgres both
-- accept (correlated subqueries instead of UPDATE ... FROM, `||` for strings,
-- CURRENT_TIMESTAMP for times). Every statement only touches rows that still
-- need it, so the whole block is idempotent.
-- ---------------------------------------------------------------------------

-- 1. The deployment's workspace, created only when some user has no membership.
--    Reuses the one `scripts/backfill-workspaces.ts` creates (slug 'deployment')
--    if that script was ever run, so the two cannot produce two workspaces.
INSERT INTO "Workspace" ("id", "name", "slug", "createdAt", "updatedAt")
SELECT 'cmtenancydeploymentwkspace', 'SocialOrc', 'deployment', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
WHERE EXISTS (
    SELECT 1 FROM "User" u
    WHERE NOT EXISTS (SELECT 1 FROM "WorkspaceMember" m WHERE m."userId" = u."id")
  )
  AND NOT EXISTS (SELECT 1 FROM "Workspace" w WHERE w."slug" = 'deployment');

-- 2. Every membership-less user joins it, with their User.role mapped onto the
--    workspace vocabulary (src/lib/tenancy/workspace-role.ts — lossless).
INSERT INTO "WorkspaceMember" ("id", "workspaceId", "userId", "role", "createdAt")
SELECT
  'wmbackfill' || u."id",
  (SELECT w."id" FROM "Workspace" w WHERE w."slug" = 'deployment'),
  u."id",
  CASE u."role"
    WHEN 'ADMIN' THEN 'OWNER'
    WHEN 'MANAGER' THEN 'MANAGER'
    WHEN 'EDITOR' THEN 'EDITOR'
    ELSE 'VIEWER'
  END,
  CURRENT_TIMESTAMP
FROM "User" u
WHERE NOT EXISTS (SELECT 1 FROM "WorkspaceMember" m WHERE m."userId" = u."id");

-- 3. Invitees who were given a personal workspace at signup instead of joining
--    the inviter's (the register route did that until now). Only the clear case
--    is repaired: the invitee's single membership is the auto-created personal
--    workspace ('ws-' || id, see workspace-slug.ts) and nobody else is in it.
--    Their rows move with them; the emptied personal workspace is left in place
--    rather than deleted, so nothing hanging off it can cascade away.
CREATE TABLE IF NOT EXISTS "_TenancyBackfillMove" (
  "userId" TEXT NOT NULL,
  "fromWorkspaceId" TEXT NOT NULL,
  "toWorkspaceId" TEXT NOT NULL
);
DELETE FROM "_TenancyBackfillMove";

INSERT INTO "_TenancyBackfillMove" ("userId", "fromWorkspaceId", "toWorkspaceId")
SELECT DISTINCT
  i."acceptedBy",
  m."workspaceId",
  (SELECT im."workspaceId" FROM "WorkspaceMember" im
    WHERE im."userId" = i."invitedBy"
    ORDER BY im."createdAt", im."id" LIMIT 1)
FROM "Invitation" i
JOIN "WorkspaceMember" m ON m."userId" = i."acceptedBy"
JOIN "Workspace" w ON w."id" = m."workspaceId"
WHERE i."acceptedBy" IS NOT NULL
  AND w."slug" = 'ws-' || LOWER(i."acceptedBy")
  AND (SELECT COUNT(*) FROM "WorkspaceMember" c WHERE c."userId" = i."acceptedBy") = 1
  AND (SELECT COUNT(*) FROM "WorkspaceMember" c WHERE c."workspaceId" = m."workspaceId") = 1
  AND (SELECT im."workspaceId" FROM "WorkspaceMember" im
        WHERE im."userId" = i."invitedBy"
        ORDER BY im."createdAt", im."id" LIMIT 1) IS NOT NULL
  AND (SELECT im."workspaceId" FROM "WorkspaceMember" im
        WHERE im."userId" = i."invitedBy"
        ORDER BY im."createdAt", im."id" LIMIT 1) <> m."workspaceId";

UPDATE "Brain"
SET "workspaceId" = (SELECT mv."toWorkspaceId" FROM "_TenancyBackfillMove" mv WHERE mv."fromWorkspaceId" = "Brain"."workspaceId"),
    "isDefault" = false
WHERE "workspaceId" IN (SELECT mv."fromWorkspaceId" FROM "_TenancyBackfillMove" mv);

UPDATE "SocialAccount"
SET "workspaceId" = (SELECT mv."toWorkspaceId" FROM "_TenancyBackfillMove" mv WHERE mv."fromWorkspaceId" = "SocialAccount"."workspaceId")
WHERE "workspaceId" IN (SELECT mv."fromWorkspaceId" FROM "_TenancyBackfillMove" mv);

UPDATE "Post"
SET "workspaceId" = (SELECT mv."toWorkspaceId" FROM "_TenancyBackfillMove" mv WHERE mv."fromWorkspaceId" = "Post"."workspaceId")
WHERE "workspaceId" IN (SELECT mv."fromWorkspaceId" FROM "_TenancyBackfillMove" mv);

UPDATE "MediaAsset"
SET "workspaceId" = (SELECT mv."toWorkspaceId" FROM "_TenancyBackfillMove" mv WHERE mv."fromWorkspaceId" = "MediaAsset"."workspaceId")
WHERE "workspaceId" IN (SELECT mv."fromWorkspaceId" FROM "_TenancyBackfillMove" mv);

-- They owned the personal workspace; in the team they hold the invited role.
UPDATE "WorkspaceMember"
SET "workspaceId" = (SELECT mv."toWorkspaceId" FROM "_TenancyBackfillMove" mv WHERE mv."fromWorkspaceId" = "WorkspaceMember"."workspaceId"),
    "role" = (SELECT CASE u."role"
                       WHEN 'ADMIN' THEN 'OWNER'
                       WHEN 'MANAGER' THEN 'MANAGER'
                       WHEN 'EDITOR' THEN 'EDITOR'
                       ELSE 'VIEWER'
                     END
                FROM "User" u WHERE u."id" = "WorkspaceMember"."userId")
WHERE "workspaceId" IN (SELECT mv."fromWorkspaceId" FROM "_TenancyBackfillMove" mv);

DROP TABLE "_TenancyBackfillMove";

-- 4. Stamp the tenant rows still carrying no workspace, from their author's
--    (oldest) membership.
UPDATE "Brain"
SET "workspaceId" = (SELECT m."workspaceId" FROM "WorkspaceMember" m
                      WHERE m."userId" = "Brain"."userId"
                      ORDER BY m."createdAt", m."id" LIMIT 1)
WHERE "workspaceId" IS NULL;

UPDATE "SocialAccount"
SET "workspaceId" = (SELECT m."workspaceId" FROM "WorkspaceMember" m
                      WHERE m."userId" = "SocialAccount"."userId"
                      ORDER BY m."createdAt", m."id" LIMIT 1)
WHERE "workspaceId" IS NULL;

UPDATE "Post"
SET "workspaceId" = (SELECT m."workspaceId" FROM "WorkspaceMember" m
                      WHERE m."userId" = "Post"."userId"
                      ORDER BY m."createdAt", m."id" LIMIT 1)
WHERE "workspaceId" IS NULL;

UPDATE "MediaAsset"
SET "workspaceId" = (SELECT m."workspaceId" FROM "WorkspaceMember" m
                      WHERE m."userId" = "MediaAsset"."userId"
                      ORDER BY m."createdAt", m."id" LIMIT 1)
WHERE "workspaceId" IS NULL;

-- 5. Brand Brain becomes one per workspace. Where several teammates each kept
--    their own, the most recently edited one becomes the workspace's; the others
--    stay unstamped (still readable in the database, no longer used).
UPDATE "BrandBrain"
SET "workspaceId" = (SELECT m."workspaceId" FROM "WorkspaceMember" m
                      WHERE m."userId" = "BrandBrain"."userId"
                      ORDER BY m."createdAt", m."id" LIMIT 1)
WHERE "workspaceId" IS NULL
  AND "id" = (
    SELECT b2."id" FROM "BrandBrain" b2
    WHERE (SELECT m2."workspaceId" FROM "WorkspaceMember" m2
            WHERE m2."userId" = b2."userId"
            ORDER BY m2."createdAt", m2."id" LIMIT 1)
        = (SELECT m3."workspaceId" FROM "WorkspaceMember" m3
            WHERE m3."userId" = "BrandBrain"."userId"
            ORDER BY m3."createdAt", m3."id" LIMIT 1)
    ORDER BY b2."updatedAt" DESC, b2."id" DESC
    LIMIT 1
  )
  AND NOT EXISTS (
    SELECT 1 FROM "BrandBrain" b4
    WHERE b4."workspaceId" = (SELECT m4."workspaceId" FROM "WorkspaceMember" m4
                               WHERE m4."userId" = "BrandBrain"."userId"
                               ORDER BY m4."createdAt", m4."id" LIMIT 1)
  );

-- 6. Scheduled jobs: a job whose post is gone can never run (the worker fails
--    it as "Post not found"), so it is deleted rather than stamped. The rest
--    take their post's workspace — including jobs whose post moved in step 3.
DELETE FROM "ScheduledJob"
WHERE NOT EXISTS (SELECT 1 FROM "Post" p WHERE p."id" = "ScheduledJob"."postId");

UPDATE "ScheduledJob"
SET "workspaceId" = (SELECT p."workspaceId" FROM "Post" p WHERE p."id" = "ScheduledJob"."postId")
WHERE EXISTS (
  SELECT 1 FROM "Post" p
  WHERE p."id" = "ScheduledJob"."postId"
    AND p."workspaceId" IS NOT NULL
    AND ("ScheduledJob"."workspaceId" IS NULL OR "ScheduledJob"."workspaceId" <> p."workspaceId")
);

-- 7. Invitations join the inviter's workspace.
UPDATE "Invitation"
SET "workspaceId" = (SELECT m."workspaceId" FROM "WorkspaceMember" m
                      WHERE m."userId" = "Invitation"."invitedBy"
                      ORDER BY m."createdAt", m."id" LIMIT 1)
WHERE "workspaceId" IS NULL;

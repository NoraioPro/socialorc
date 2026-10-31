-- Every post belongs to a brand (brain). Existing rows move to the workspace's
-- default brain so nothing disappears from the lists after the switch.
ALTER TABLE "Post" ADD COLUMN "brainId" TEXT;

UPDATE "Post"
SET "brainId" = (
  SELECT "Brain"."id" FROM "Brain"
  WHERE "Brain"."workspaceId" = "Post"."workspaceId" AND "Brain"."isDefault" = 1
  LIMIT 1
)
WHERE "brainId" IS NULL;

CREATE INDEX "Post_brainId_idx" ON "Post"("brainId");

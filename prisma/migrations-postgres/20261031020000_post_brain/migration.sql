-- Every post belongs to a brand (brain); existing rows move to the workspace's
-- default brain.
ALTER TABLE "Post" ADD COLUMN "brainId" TEXT;

UPDATE "Post"
SET "brainId" = (
  SELECT "Brain"."id" FROM "Brain"
  WHERE "Brain"."workspaceId" = "Post"."workspaceId" AND "Brain"."isDefault" = true
  LIMIT 1
)
WHERE "brainId" IS NULL;

CREATE INDEX "Post_brainId_idx" ON "Post"("brainId");

ALTER TABLE "Post" ADD CONSTRAINT "Post_brainId_fkey"
  FOREIGN KEY ("brainId") REFERENCES "Brain"("id") ON DELETE SET NULL ON UPDATE CASCADE;

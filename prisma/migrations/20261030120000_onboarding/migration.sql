-- AlterTable
ALTER TABLE "User" ADD COLUMN "onboardedAt" DATETIME;

-- AlterTable
ALTER TABLE "Workspace" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'PERSONAL';

-- Existing accounts predate the first-run question and must not be sent to it.
UPDATE "User" SET "onboardedAt" = CURRENT_TIMESTAMP WHERE "onboardedAt" IS NULL;

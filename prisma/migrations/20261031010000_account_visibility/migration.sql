-- Personal vs team connections: the owner decides whether the team may
-- publish through an account, defaulting to private.
ALTER TABLE "SocialAccount" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'PRIVATE';

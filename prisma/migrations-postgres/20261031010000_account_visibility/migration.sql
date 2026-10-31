-- Personal vs team connections; existing rows default to private.
ALTER TABLE "SocialAccount" ADD COLUMN "visibility" TEXT NOT NULL DEFAULT 'PRIVATE';

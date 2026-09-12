-- Add workspace roles to User (SQLite: ALTER TABLE, no enum type available).
-- Existing rows are the workspace owners, so they become ADMIN; new rows get
-- the same value from the cascade default.
ALTER TABLE "User" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'ADMIN';

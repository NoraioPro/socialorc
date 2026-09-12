import "dotenv/config";
import { defineConfig } from "prisma/config";

/**
 * One repo, two databases.
 *
 *   file:…        → prisma/schema.prisma          + prisma/migrations          (sqlite, local dev)
 *   postgresql://  → prisma/schema.postgres.prisma + prisma/migrations-postgres (Supabase)
 *
 * The target is derived from the DATABASE_URL *scheme*, so cutting a deployment
 * over is a one-line env change and rolling back is the same line in reverse.
 * Nothing else switches the database.
 *
 * Regenerate the postgres schema with `npm run db:pg:schema` after editing
 * prisma/schema.prisma — it is generated so the two can never drift.
 */
const url = process.env["DATABASE_URL"] ?? "";

// Fail loudly rather than guessing. The scheme decides which schema AND which
// driver adapter the build produces, so a missing DATABASE_URL would silently
// generate a *sqlite* client - which deploys fine and then fails at runtime
// against Supabase. A build that cannot know its database should stop.
if (!url) {
  throw new Error(
    "DATABASE_URL is not set, so the Prisma target cannot be determined.\n" +
      "This config derives the schema and migrations directory from its scheme " +
      "(file: -> sqlite, postgresql:// -> postgres), so guessing would generate " +
      "the wrong client. Set DATABASE_URL before any prisma or build command.",
  );
}

const isPostgres = /^postgres(ql)?:\/\//i.test(url);

export default defineConfig({
  schema: isPostgres ? "prisma/schema.postgres.prisma" : "prisma/schema.prisma",
  migrations: {
    path: isPostgres ? "prisma/migrations-postgres" : "prisma/migrations",
  },
  datasource: {
    url: process.env["DATABASE_URL"],
  },
});

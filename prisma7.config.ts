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

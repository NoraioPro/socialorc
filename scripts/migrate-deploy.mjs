#!/usr/bin/env node
/**
 * Apply migrations as part of a deployment.
 *
 * Why this exists: pushes to main auto-deploy, but nothing ran migrations — so a
 * future schema change would ship code against a database that had not been
 * migrated. That fails at runtime, in production, usually in the least obvious
 * place.
 *
 * Prisma Migrate needs a connection that can run DDL. The app's DATABASE_URL is
 * the Supabase TRANSACTION pooler (port 6543) because serverless functions need
 * it, and PgBouncer's transaction mode cannot run DDL — so migrations go through
 * DIRECT_URL (the session pooler, port 5432).
 *
 * Without DIRECT_URL it skips with an explanation rather than running against the
 * pooler and failing confusingly. A failed migration exits non-zero, which fails
 * the deploy instead of shipping code against a stale schema.
 */
import { spawnSync } from "node:child_process";

const direct = process.env.DIRECT_URL;

if (!direct) {
  console.log(
    "[migrate-deploy] DIRECT_URL is not set - skipping migrations.\n" +
      "  Migrations need a DDL-capable connection (Supabase session pooler, port 5432).\n" +
      "  DATABASE_URL is the transaction pooler (6543) and cannot run DDL.",
  );
  process.exit(0);
}

if (!/^postgres(ql)?:\/\//i.test(direct)) {
  console.error("[migrate-deploy] DIRECT_URL is not a postgresql:// URL - refusing to run.");
  process.exit(1);
}

console.log(
  `[migrate-deploy] applying migrations via ${direct.replace(/:[^:@/]+@/, ":***@")}`,
);

const run = spawnSync("npx", ["prisma", "migrate", "deploy"], {
  env: { ...process.env, DATABASE_URL: direct },
  stdio: "inherit",
});

if (run.status !== 0) {
  console.error(
    `[migrate-deploy] migrate deploy failed (exit ${run.status}) - failing the build ` +
      "rather than deploying code against an un-migrated database.",
  );
  process.exit(run.status ?? 1);
}

console.log("[migrate-deploy] migrations are up to date");

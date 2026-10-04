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
 * Without DIRECT_URL it used to skip with exit 0 everywhere, so a deployment could ship
 * code against a schema that did not match it — invisible, because the build stayed green,
 * and surfaced later at runtime in the least obvious place. Production and generic CI now
 * fail instead. A failed migration also exits non-zero, which fails the deploy.
 */
import { spawnSync } from "node:child_process";

const direct = process.env.DIRECT_URL;

/**
 * Whether this run is allowed to skip. A deploy that cannot migrate must not pretend it did.
 *
 * Production and generic CI fail hard. A Vercel *preview* only warns: previews are
 * disposable, and whether they even receive DIRECT_URL is unverified, so failing them
 * would block every preview build for the whole fleet — not this guard's job.
 * Set REQUIRE_MIGRATIONS=true to demand migrations in any environment.
 */
function mustApplyMigrations() {
  if (process.env.REQUIRE_MIGRATIONS === "true") return true;
  if (process.env.VERCEL_ENV === "production") return true;
  // A generic CI runner (GitHub Actions, Circle, …). Vercel sets CI as well, so the
  // VERCEL_ENV branch above decides for Vercel builds and this one covers everything else.
  const ci = process.env.CI;
  return (ci === "true" || ci === "1") && !process.env.VERCEL_ENV;
}

const missingMessage =
  "[migrate-deploy] DIRECT_URL is not set.\n" +
  "  Migrations need a DDL-capable connection (Supabase session pooler, port 5432).\n" +
  "  DATABASE_URL is the transaction pooler (6543) and cannot run DDL.";

if (!direct) {
  if (mustApplyMigrations()) {
    console.error(
      `${missingMessage}\n` +
        "[migrate-deploy] refusing to skip: this is a production or CI build, and a build that " +
        "does not migrate ships code against a schema that does not match it.\n" +
        "  Set DIRECT_URL (the Supabase session pooler) in the deployment's env vars.",
    );
    process.exit(1);
  }

  const where = process.env.VERCEL_ENV ? ` (VERCEL_ENV=${process.env.VERCEL_ENV})` : "";
  console.log(`${missingMessage}\n[migrate-deploy] skipping migrations${where}.`);
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

/**
 * Phase 0 checklist — is the tenancy actually in place?
 *
 * Read-only, and it prints COUNTS only, never a field value, so its output is
 * safe to paste anywhere.
 *
 *   npx tsx scripts/check-tenancy.ts
 *
 * Exit 0 = every tenant row is stamped, which is the precondition for the NOT
 * NULL migration (Phase 0.5) and the cross-tenant isolation suite (Phase 0.6).
 * Exit 1 = something is still null; do not run the NOT NULL migration.
 */

// Must precede the prisma import: `src/lib/prisma.ts` picks its driver adapter
// from the DATABASE_URL scheme, so loading it before the environment is loaded
// makes it choose the sqlite adapter and fail against the postgres schema.
import "dotenv/config";
import prisma from "@/lib/prisma";

const TENANT_TABLES = ["Brain", "Post", "MediaAsset", "SocialAccount", "ScheduledJob"] as const;

async function scalar(sql: string): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<{ count: bigint }[]>(sql);
  return Number(rows[0]?.count ?? 0);
}

async function main() {
  const results: { label: string; ok: boolean; detail: string }[] = [];
  const check = (label: string, ok: boolean, detail: string) => {
    results.push({ label, ok, detail });
  };

  const workspaces = await scalar(`SELECT COUNT(*)::bigint AS count FROM "Workspace"`);
  const members = await scalar(`SELECT COUNT(*)::bigint AS count FROM "WorkspaceMember"`);
  const users = await scalar(`SELECT COUNT(*)::bigint AS count FROM "User"`);

  check("a workspace exists", workspaces >= 1, `workspaces: ${workspaces}`);
  check(
    "every user has a membership",
    members >= users,
    `memberships: ${members} for users: ${users}`,
  );
  check(
    "membership is unique per (workspace, user)",
    (await scalar(
      `SELECT COUNT(*)::bigint AS count FROM (
         SELECT "workspaceId", "userId" FROM "WorkspaceMember"
          GROUP BY "workspaceId", "userId" HAVING COUNT(*) > 1
       ) AS d`,
    )) === 0,
    "the @@unique([workspaceId, userId]) constraint covers the data",
  );

  for (const table of TENANT_TABLES) {
    const nulls = await scalar(
      `SELECT COUNT(*)::bigint AS count FROM "${table}" WHERE "workspaceId" IS NULL`,
    );
    const total = await scalar(`SELECT COUNT(*)::bigint AS count FROM "${table}"`);
    check(`${table}: every row carries a tenant`, nulls === 0, `${total - nulls}/${total} stamped`);
  }

  const orphans = await scalar(
    `SELECT COUNT(*)::bigint AS count FROM "ScheduledJob" j
      WHERE NOT EXISTS (SELECT 1 FROM "Post" p WHERE p."id" = j."postId")`,
  );
  check("no orphan ScheduledJob rows", orphans === 0, `orphans: ${orphans}`);

  const roles = await prisma.$queryRawUnsafe<{ role: string; count: bigint }[]>(
    `SELECT role, COUNT(*)::bigint AS count FROM "WorkspaceMember" GROUP BY role ORDER BY role`,
  );
  console.log("membership roles (target vocabulary: OWNER|ADMIN|MANAGER|EDITOR|VIEWER):");
  for (const r of roles) console.log(`  ${r.role}: ${Number(r.count)}`);

  console.log("\nPhase 0 tenancy checklist:");
  for (const r of results) console.log(`  ${r.ok ? "PASS" : "FAIL"}  ${r.label} — ${r.detail}`);

  const failed = results.filter((r) => !r.ok);
  console.log(
    failed.length === 0
      ? "\nAll checks passed — Phase 0.5 (NOT NULL) and 0.6 (isolation suite) are unblocked."
      : `\n${failed.length} check(s) FAILED — do not run the NOT NULL migration yet.`,
  );
  if (failed.length > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("[check-tenancy] FAILED:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

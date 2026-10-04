/**
 * Phase 0.4 — gather the existing deployment into ONE workspace and stamp its rows.
 *
 * `docs/SAAS-PLAN.md` §6 is explicit that this deployment is a single workspace
 * with ADMIN/EDITOR/CLIENT users, so the backfill does **not** create one
 * workspace per user: it creates the deployment workspace and maps today's roles
 * onto memberships in it, losslessly (`src/lib/tenancy/workspace-role.ts`).
 *
 * Run:
 *   npx tsx scripts/backfill-workspaces.ts --dry-run     # read-only, prints the plan
 *   npx tsx scripts/backfill-workspaces.ts               # applies, then re-verifies
 *
 * Safe to run repeatedly, and safe to interrupt:
 *  - every step is an upsert or an "only where NULL" update, so a second run
 *    reports 0 changes;
 *  - nothing is deleted except a *lazy personal* workspace, after every row it
 *    held has been re-pointed at the deployment workspace. That case is repaired
 *    here on purpose: an earlier cut of the resolver created one on demand, and
 *    leaving it in place would leave that user outside the deployment workspace.
 *  - orphan `ScheduledJob` rows (no post) are REPORTED and skipped, never
 *    deleted — the NOT NULL migration needs them resolved, and deleting data is
 *    not a decision a backfill script gets to make on its own.
 *
 * It prints counts, never row contents, so its output is safe to paste.
 */

// Must come first: `src/lib/prisma.ts` picks its driver adapter from the
// DATABASE_URL *scheme*, so importing it before the environment is loaded makes
// it choose the sqlite adapter and fail against the postgres schema.
import "dotenv/config";
import prisma from "@/lib/prisma";

const DRY_RUN = process.argv.includes("--dry-run");
const DEPLOYMENT_SLUG = "deployment";

/** Slug shape produced by `workspaceSlugFor()` — a per-user lazy workspace. */
const LAZY_SLUG = /^ws-[a-z0-9]+$/;

/** Today's roles mapped losslessly onto the workspace vocabulary. */
const ROLE_MAP: Record<string, string> = {
  ADMIN: "OWNER",
  MANAGER: "MANAGER",
  EDITOR: "EDITOR",
  CLIENT: "VIEWER",
};

function workspaceRoleFor(role: unknown): string {
  return (typeof role === "string" && ROLE_MAP[role]) || "VIEWER";
}

const changes: Record<string, number> = {};
function count(key: string, n = 1) {
  changes[key] = (changes[key] ?? 0) + n;
}

async function main() {
  console.log(`[backfill] ${DRY_RUN ? "DRY RUN — nothing will be written" : "APPLYING"}`);

  // ---------------------------------------------------------------- 1. the workspace
  const users = await prisma.user.findMany({ select: { id: true, email: true, role: true } });
  console.log(`[backfill] users: ${users.length}`);

  if (users.length === 0) {
    console.log("[backfill] no users — nothing to do");
    return;
  }

  let deployment = await prisma.workspace.findUnique({ where: { slug: DEPLOYMENT_SLUG } });
  if (!deployment) {
    count("workspace.created");
    if (!DRY_RUN) {
      deployment = await prisma.workspace.create({
        data: { name: "SocialOrc", slug: DEPLOYMENT_SLUG },
      });
    }
  }
  const deploymentId = deployment?.id ?? "(dry-run)";
  console.log(`[backfill] deployment workspace: ${DRY_RUN && !deployment ? "would be created" : deploymentId}`);

  // ------------------------------------------- 2. fold lazy personal workspaces away
  const tenants = await prisma.workspace.findMany({ select: { id: true, slug: true } });
  const lazy = tenants.filter((t) => LAZY_SLUG.test(t.slug));
  console.log(`[backfill] workspaces: ${tenants.length} (lazy personal: ${lazy.length})`);

  for (const ws of lazy) {
    count("workspace.folded");
    if (DRY_RUN) continue;

    // Re-point everything it held BEFORE deleting it — `SocialAccount.workspace`
    // is ON DELETE CASCADE now, so deleting first would take live credentials
    // with it.
    await prisma.socialAccount.updateMany({
      where: { workspaceId: ws.id },
      data: { workspaceId: deploymentId },
    });
    await prisma.post.updateMany({ where: { workspaceId: ws.id }, data: { workspaceId: deploymentId } });
    await prisma.mediaAsset.updateMany({
      where: { workspaceId: ws.id },
      data: { workspaceId: deploymentId },
    });
    await prisma.brain.updateMany({ where: { workspaceId: ws.id }, data: { workspaceId: deploymentId } });

    const members = await prisma.workspaceMember.findMany({ where: { workspaceId: ws.id } });
    for (const member of members) {
      await prisma.workspaceMember.upsert({
        where: { workspaceId_userId: { workspaceId: deploymentId, userId: member.userId } },
        create: { workspaceId: deploymentId, userId: member.userId, role: member.role },
        update: {},
      });
    }
    await prisma.workspaceMember.deleteMany({ where: { workspaceId: ws.id } });
    await prisma.workspace.delete({ where: { id: ws.id } });
  }

  // ------------------------------------------------------------- 3. memberships
  for (const user of users) {
    const existing = await prisma.workspaceMember.findFirst({
      where: { userId: user.id },
      select: { id: true, workspaceId: true, role: true },
    });

    if (existing && existing.workspaceId === deploymentId) continue;

    count("membership.created");
    if (DRY_RUN) continue;

    await prisma.workspaceMember.upsert({
      where: { workspaceId_userId: { workspaceId: deploymentId, userId: user.id } },
      create: { workspaceId: deploymentId, userId: user.id, role: workspaceRoleFor(user.role) },
      update: {},
    });
  }

  // ------------------------------------------------------------ 4. stamp the rows
  const stamps: { key: string; model: { updateMany: (a: unknown) => Promise<{ count: number }> } }[] = [
    { key: "Brain", model: prisma.brain as never },
    { key: "SocialAccount", model: prisma.socialAccount as never },
    { key: "Post", model: prisma.post as never },
    { key: "MediaAsset", model: prisma.mediaAsset as never },
  ];

  for (const { key, model } of stamps) {
    const unstamped = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS count FROM "${key}" WHERE "workspaceId" IS NULL`,
    );
    const n = Number(unstamped[0]?.count ?? 0);
    if (n === 0) continue;
    count(`${key}.stamped`, n);
    if (DRY_RUN) continue;
    // A correlated subquery keeps this to one statement per table instead of a
    // read-modify-write loop, so an interrupted run leaves no half-stamped row.
    await prisma.$executeRawUnsafe(
      `UPDATE "${key}" AS t SET "workspaceId" = m."workspaceId"
         FROM "WorkspaceMember" AS m
        WHERE m."userId" = t."userId" AND t."workspaceId" IS NULL`,
    );
  }

  // ---------------------------------------------------------- 5. scheduled jobs
  const orphanJobs = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint AS count FROM "ScheduledJob" j
      WHERE NOT EXISTS (SELECT 1 FROM "Post" p WHERE p."id" = j."postId")`,
  );
  const orphans = Number(orphanJobs[0]?.count ?? 0);
  if (orphans > 0) {
    console.log(`[backfill] ORPHAN ScheduledJob rows (no post): ${orphans} — reported, NOT deleted`);
  }

  const unstampedJobs = await prisma.$queryRawUnsafe<{ count: bigint }[]>(
    `SELECT COUNT(*)::bigint AS count FROM "ScheduledJob" WHERE "workspaceId" IS NULL`,
  );
  const jobs = Number(unstampedJobs[0]?.count ?? 0);
  if (jobs > 0) {
    count("ScheduledJob.stamped", jobs);
    if (!DRY_RUN) {
      await prisma.$executeRawUnsafe(
        `UPDATE "ScheduledJob" AS j SET "workspaceId" = p."workspaceId"
           FROM "Post" AS p
          WHERE p."id" = j."postId" AND j."workspaceId" IS NULL`,
      );
    }
  }

  console.log(`\n[backfill] ${DRY_RUN ? "would change" : "changed"}:`);
  const entries = Object.entries(changes).sort();
  if (entries.length === 0) console.log("  (nothing — already backfilled)");
  for (const [key, n] of entries) console.log(`  ${key}: ${n}`);
}

main()
  .catch((error) => {
    console.error("[backfill] FAILED:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

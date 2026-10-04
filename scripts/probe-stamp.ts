/**
 * Prove the client-layer tenant stamping works (docs/SAAS-PLAN.md Phase 0.3).
 *
 *   npx tsx scripts/probe-stamp.ts
 *
 * Creates one `Brain` through the app's own prisma client — so the extension in
 * `src/lib/tenancy/stamp.ts` is what fills the tenant — reads `workspaceId` back,
 * then deletes the probe row. That is the difference between "the writer exists"
 * and "the writer runs": nothing else observes an auto-filled column.
 *
 * It does write: exactly one row, and it removes it. It prints ids and a verdict,
 * never a field value, so the output is safe to paste.
 */
import "dotenv/config";
import prisma from "@/lib/prisma";

const PROBE_NAME = "__stamp_probe__";

async function main() {
  const user = await prisma.user.findFirst({
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  if (!user) {
    console.log("no users — nothing to probe against");
    return;
  }

  const membership = await prisma.workspaceMember.findFirst({
    where: { userId: user.id },
    select: { workspaceId: true },
  });
  console.log("expected workspace :", membership?.workspaceId ?? "(none)");

  const brain = await prisma.brain.create({
    data: { userId: user.id, name: PROBE_NAME },
  });
  console.log("brain created      :", brain.id);
  console.log("brain.workspaceId   :", brain.workspaceId ?? "(null — NOT stamped)");

  const ok = Boolean(brain.workspaceId) && brain.workspaceId === membership?.workspaceId;
  console.log(ok ? "RESULT: STAMPED CORRECTLY" : "RESULT: FAILED — the extension is not running");

  await prisma.brain.delete({ where: { id: brain.id } });
  const gone = await prisma.brain.findUnique({ where: { id: brain.id } });
  console.log("probe row deleted  :", gone === null);

  if (!ok) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error("[probe-stamp] FAILED:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

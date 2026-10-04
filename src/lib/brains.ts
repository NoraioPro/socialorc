import prisma from "@/lib/prisma";
import { workspaceIdForStamping, workspaceIdForWrite } from "@/lib/tenancy/workspace";

/**
 * A brain is a project: the container social accounts are connected into.
 * A user can run several brains (one per brand/client, say), each with its
 * own independent set of platform connections.
 *
 * Every user needs at least one brain to connect anything to, so the first
 * one is created lazily rather than requiring an explicit setup step.
 *
 * Phase 0 (`docs/SAAS-PLAN.md` §3): a brain also belongs to a workspace — the
 * tenant — and this is the one path every user passes through, so stamping it
 * here is what gives the tenant key coverage without touching every route.
 * Existing brains created before Phase 0 carry a null workspace; they are filled
 * on the next access as well as by the backfill script (Phase 0.4), so the
 * rollout does not depend on running the backfill first.
 */
export async function getOrCreateDefaultBrain(userId: string) {
  const existing = await prisma.brain.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });

  if (existing) {
    if (existing.workspaceId !== null) return existing;

    const workspaceId = await workspaceIdForStamping(userId);
    if (workspaceId === null) return existing;

    try {
      await prisma.brain.update({
        where: { id: existing.id },
        data: { workspaceId },
      });
      return { ...existing, workspaceId };
    } catch (error) {
      // Stamping is best effort: a brain that stays unstamped is fixed by the
      // backfill, and nothing reads the tenant yet.
      console.error("[tenancy] could not stamp brain with its workspace", {
        brainId: existing.id,
        error,
      });
      return existing;
    }
  }

  return prisma.brain.create({
    data: {
      userId,
      name: "Default",
      isDefault: true,
      workspaceId: await workspaceIdForWrite(userId),
    },
  });
}

/**
 * Resolve which brain an action applies to. A `brainId` the caller does not
 * own is never honoured — silently falling back to the user's own default
 * brain keeps a stray/forged id from ever reading or writing someone else's
 * connections, without needing to surface a separate error path for it.
 */
export async function resolveBrainForUser(userId: string, brainId?: string | null) {
  if (brainId) {
    const brain = await prisma.brain.findFirst({ where: { id: brainId, userId } });
    if (brain) return brain;
  }
  return getOrCreateDefaultBrain(userId);
}

import prisma from "@/lib/prisma";
import { workspaceIdForStamping } from "@/lib/tenancy/workspace";

/**
 * A brain is the container social accounts are connected into. A team can run
 * several (one per brand or client), each with an independent set of platform
 * connections.
 *
 * Phase 1: a brain belongs to the **workspace**, not to the person. Two members
 * of one team now share the same connected accounts; before this, each held a
 * private brain the other could not see, so a colleague's connected Instagram
 * was invisible and could not be posted through.
 *
 * Every workspace needs at least one brain to connect anything to, so the first
 * one is created lazily rather than behind an explicit setup step.
 *
 * The `userId` parameter is the **acting user**, not the owner: it resolves the
 * workspace and records who created the row. Signatures are deliberately
 * unchanged so no caller had to move in the same step.
 */
export async function getOrCreateDefaultBrain(userId: string) {
  const workspaceId = await workspaceIdForStamping(userId);

  // A user with no workspace keeps the old user-scoped lookup rather than
  // failing: this runs on every read of the accounts page, and throwing here
  // would lock someone out of their own brains. Phase 0.4 backfilled a workspace
  // for every existing user, so this branch is a safety net, not the normal path.
  const existing = await prisma.brain.findFirst({
    where: workspaceId ? { workspaceId } : { userId },
    // Prefer the flagged default: once a team shares a brain, "the default"
    // should mean the one someone chose, not merely the oldest row.
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  if (existing) {
    if (existing.workspaceId !== null || workspaceId === null) return existing;

    // Brains created before Phase 0 carry a null workspace. Stamp on access so
    // the rollout does not depend on the backfill having run.
    try {
      await prisma.brain.update({
        where: { id: existing.id },
        data: { workspaceId },
      });
      return { ...existing, workspaceId };
    } catch (error) {
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
      workspaceId: workspaceId ?? undefined,
    },
  });
}

/**
 * Resolve which brain an action applies to. A `brainId` from another workspace
 * is never honoured — silently falling back to the workspace's own default keeps
 * a stray or forged id from reading or writing someone else's connections,
 * without a separate error path for it.
 */
export async function resolveBrainForUser(userId: string, brainId?: string | null) {
  const workspaceId = await workspaceIdForStamping(userId);

  if (brainId) {
    // Membership is the check, not creation: a teammate may legitimately open a
    // brain a colleague created.
    const brain = await prisma.brain.findFirst({
      where: workspaceId ? { id: brainId, workspaceId } : { id: brainId, userId },
    });
    if (brain) return brain;
  }

  return getOrCreateDefaultBrain(userId);
}

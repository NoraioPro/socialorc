import prisma from "@/lib/prisma";
import type { TenantContext } from "@/lib/tenancy/guard";

/**
 * A brain is the container social accounts are connected into. A team can run
 * several (one per brand or client), each with an independent set of platform
 * connections.
 *
 * A brain belongs to the **workspace**, not to the person: teammates share the
 * same brains and therefore the same connected accounts. Both helpers take the
 * resolved tenant from `requireWorkspace()` (src/lib/tenancy/guard.ts) — the
 * workspace is the scope, the user only records who created a row.
 *
 * Every workspace needs at least one brain to connect anything to, so the first
 * one is created lazily rather than behind an explicit setup step — once per
 * workspace. Before this was workspace-scoped, every member who joined lazily
 * created yet another "Default".
 */
type BrainTenant = Pick<TenantContext, "userId" | "workspaceId">;

export async function getOrCreateDefaultBrain(tenant: BrainTenant) {
  const existing = await prisma.brain.findFirst({
    where: { workspaceId: tenant.workspaceId },
    // Prefer the flagged default: once a team shares a brain, "the default"
    // should mean the one someone chose, not merely the oldest row.
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });
  if (existing) return existing;

  return prisma.brain.create({
    data: {
      userId: tenant.userId,
      workspaceId: tenant.workspaceId,
      name: "Default",
      isDefault: true,
    },
  });
}

/**
 * Resolve which brain an action applies to. A `brainId` from another workspace
 * is never honoured — silently falling back to the workspace's own default keeps
 * a stray or forged id from reading or writing someone else's connections,
 * without a separate error path for it.
 */
export async function resolveBrainForWorkspace(tenant: BrainTenant, brainId?: string | null) {
  if (brainId) {
    // Membership is the check, not creation: a teammate may legitimately open a
    // brain a colleague created.
    const brain = await prisma.brain.findFirst({
      where: { id: brainId, workspaceId: tenant.workspaceId },
    });
    if (brain) return brain;
  }

  return getOrCreateDefaultBrain(tenant);
}

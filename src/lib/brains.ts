import prisma from "@/lib/prisma";

/**
 * A brain is a project: the container social accounts are connected into.
 * A user can run several brains (one per brand/client, say), each with its
 * own independent set of platform connections.
 *
 * Every user needs at least one brain to connect anything to, so the first
 * one is created lazily rather than requiring an explicit setup step.
 */
export async function getOrCreateDefaultBrain(userId: string) {
  const existing = await prisma.brain.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  if (existing) return existing;

  return prisma.brain.create({
    data: { userId, name: "Default", isDefault: true },
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

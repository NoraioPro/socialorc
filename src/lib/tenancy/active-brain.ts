/**
 * The brand (brain) a member is currently working in.
 *
 * Same shape as the workspace cookie: a preference, validated against the brains
 * of the active workspace on every request. With a single brain the concept stays
 * invisible — the default brain is chosen automatically.
 */
import { cookies } from "next/headers";
import prisma from "@/lib/prisma";
import { getOrCreateDefaultBrain } from "@/lib/brains";
import type { TenantContext } from "@/lib/tenancy/guard";

export const ACTIVE_BRAIN_COOKIE = "so_brain";

export const ACTIVE_BRAIN_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
  maxAge: 60 * 60 * 24 * 365,
};

async function readCookie(): Promise<string | null> {
  try {
    const jar = await cookies();
    const value = jar.get(ACTIVE_BRAIN_COOKIE)?.value;
    return value && value.length < 64 ? value : null;
  } catch {
    return null;
  }
}

/** The brain this request works in: the cookie when it names one of the workspace's brains. */
export async function activeBrainId(tenant: TenantContext): Promise<string> {
  const wanted = await readCookie();
  if (wanted) {
    const brain = await prisma.brain.findFirst({
      where: { id: wanted, workspaceId: tenant.workspaceId },
      select: { id: true },
    });
    if (brain) return brain.id;
  }
  const fallback = await getOrCreateDefaultBrain(tenant);
  return fallback.id;
}

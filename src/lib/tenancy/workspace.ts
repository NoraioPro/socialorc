/**
 * The tenant boundary: which workspace a user belongs to.
 *
 * Phase 0 of `docs/SAAS-PLAN.md`. Read the two rules before using anything here:
 *
 *  1. **This does not filter anything yet.** Permissions still come from
 *     `User.role`, and every existing query still scopes by `userId`. Phase 0
 *     only *records* the tenant on new rows so the backfill (Phase 0.4) has a
 *     key it can rely on. Turning the tenant into a filter is Phase 1, and
 *     switching early would break every route at once.
 *  2. **Stamping is best effort, resolving is not.** Use
 *     `workspaceIdForStamping()` on a write path: a workspace that cannot be
 *     resolved must not fail a request that would otherwise have succeeded,
 *     because nothing reads the value yet. `requireWorkspace()` is the strict
 *     variant Phase 1 uses, where an unresolvable tenant is a real error.
 */

import prisma from "@/lib/prisma";
import { parseRole } from "@/lib/roles";
import { workspaceNameFor, workspaceSlugFor } from "./workspace-slug";
import { parseWorkspaceRole, workspaceRoleFor, type WorkspaceRole } from "./workspace-role";

export interface WorkspaceContext {
  workspaceId: string;
  /** The membership's role. Recorded now, authoritative in Phase 3. */
  role: WorkspaceRole;
}

export class WorkspaceResolutionError extends Error {
  constructor(
    message: string,
    readonly userId: string,
  ) {
    super(message);
    this.name = "WorkspaceResolutionError";
  }
}

/**
 * The workspace a user belongs to, creating it on first use.
 *
 * Idempotent and safe to call from any request path, including concurrently:
 * `Workspace.slug` is unique and derived from the user id, so two racing calls
 * both try the same INSERT and the database picks one winner. The membership
 * upsert is anchored on `@@unique([workspaceId, userId])` for the same reason.
 *
 * The created membership records the role the user has **today**, mapped
 * losslessly onto the workspace vocabulary — never a promotion. `update: {}` is
 * deliberate: an existing membership's role is never rewritten by a lazy
 * resolution, so calling this can never quietly change what somebody can do.
 */
export async function getOrCreateWorkspaceForUser(userId: string): Promise<WorkspaceContext> {
  const existing = await prisma.workspaceMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { workspaceId: true, role: true },
  });

  if (existing) {
    return {
      workspaceId: existing.workspaceId,
      role: parseWorkspaceRole(existing.role),
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { name: true, email: true, role: true },
  });

  const slug = workspaceSlugFor(userId);
  const workspace = await prisma.workspace.upsert({
    where: { slug },
    create: {
      name: workspaceNameFor({ name: user?.name, email: user?.email }),
      slug,
    },
    update: {},
  });

  // parseRole is the least-privilege parser: an unreadable role becomes CLIENT,
  // which maps to VIEWER — never OWNER.
  const role = workspaceRoleFor(parseRole(user?.role));

  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId } },
    create: { workspaceId: workspace.id, userId, role },
    update: {},
  });

  return { workspaceId: workspace.id, role };
}

/**
 * Strict resolution for Phase 1 and later, where a missing tenant is an error
 * rather than something to work around.
 */
export async function requireWorkspace(userId: string): Promise<WorkspaceContext> {
  const context = await getOrCreateWorkspaceForUser(userId);
  if (!context.workspaceId) {
    throw new WorkspaceResolutionError("Could not resolve a workspace for this user", userId);
  }
  return context;
}

/**
 * Best-effort tenant id, for stamping a row on a write path.
 *
 * Returns `null` rather than throwing, and logs, because in Phase 0 the value is
 * recorded and never read — the backfill will fill in whatever a transient
 * failure leaves null. Returning null (rather than an empty string) is
 * deliberate: an empty tenant id is the kind of value that silently disables a
 * filter later, which plan §7 calls out as a hazard.
 */
export async function workspaceIdForStamping(userId: string): Promise<string | null> {
  try {
    const { workspaceId } = await getOrCreateWorkspaceForUser(userId);
    return workspaceId === "" ? null : workspaceId;
  } catch (error) {
    console.error("[tenancy] could not resolve a workspace to stamp", { userId, error });
    return null;
  }
}

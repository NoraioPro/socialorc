/**
 * The tenant boundary: which workspace a user belongs to.
 *
 * Phase 0 of `docs/SAAS-PLAN.md`. Three rules govern everything here:
 *
 *  1. **This does not filter anything yet.** Permissions still come from
 *     `User.role`, and every query still scopes by `userId`. Phase 0 only
 *     *records* the tenant on new rows so the backfill (Phase 0.4) has a key it
 *     can rely on. Turning the tenant into a filter is Phase 1.
 *  2. **Resolution does not create.** `findWorkspaceForUser` returns null when a
 *     user has no membership, and it must stay that way. If it conjured a
 *     workspace on demand, the first existing account to touch any write path
 *     would get a *personal* workspace — and the backfill, which must gather the
 *     whole existing deployment into ONE workspace, would then see that user as
 *     already placed and leave the deployment fragmented. Creation belongs to
 *     signup (a genuinely new account) and to the backfill (the deployment).
 *  3. **Stamping is best effort.** Use `workspaceIdForStamping()` on a write
 *     path: nothing reads the value yet, so a null tenant must not fail a
 *     request that would otherwise have succeeded. `requireWorkspace()` is the
 *     strict variant Phase 1 uses, where an unresolvable tenant is a real error.
 */

import prisma from "@/lib/prisma";
import { workspaceNameFor, workspaceSlugFor } from "./workspace-slug";
import { parseWorkspaceRole, type WorkspaceRole } from "./workspace-role";

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
 * The workspace a user already belongs to, or `null`.
 *
 * Oldest membership first: a user is in one workspace today, and if that ever
 * stops being true the stable "first" answer is worth more than a random one.
 */
export async function findWorkspaceForUser(userId: string): Promise<WorkspaceContext | null> {
  const membership = await prisma.workspaceMember.findFirst({
    where: { userId },
    orderBy: { createdAt: "asc" },
    select: { workspaceId: true, role: true },
  });

  if (!membership) return null;

  return {
    workspaceId: membership.workspaceId,
    role: parseWorkspaceRole(membership.role),
  };
}

/**
 * Create the workspace a **brand-new** account owns, and its OWNER membership.
 *
 * Called from signup only — a password registration or a first OAuth sign-in —
 * never from a read path. That is the SaaS shape: a new account starts its own
 * workspace and owns it.
 *
 * The creator is recorded as OWNER rather than mapped from `User.role`, because
 * they own the workspace they just created. This grants nothing today: the role
 * that decides permissions is still `User.role`, and `WorkspaceMember.role` is
 * recorded and not yet consulted (Phase 3 flips that).
 *
 * Idempotent under concurrency: `Workspace.slug` is unique and derived from the
 * user id, so two racing calls collide on the INSERT and one wins; the loser
 * re-reads. `update: {}` means an existing membership's role is never rewritten.
 */
export async function createWorkspaceForNewUser(input: {
  userId: string;
  name?: string | null;
  email?: string | null;
}): Promise<WorkspaceContext> {
  const existing = await findWorkspaceForUser(input.userId);
  if (existing) return existing;

  const slug = workspaceSlugFor(input.userId);
  const workspace = await prisma.workspace.upsert({
    where: { slug },
    create: {
      name: workspaceNameFor({ name: input.name, email: input.email }),
      slug,
    },
    update: {},
  });

  const role: WorkspaceRole = "OWNER";
  await prisma.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: input.userId } },
    create: { workspaceId: workspace.id, userId: input.userId, role },
    update: {},
  });

  return { workspaceId: workspace.id, role };
}

/**
 * Strict resolution for Phase 1 and later, where a missing tenant is an error
 * rather than something to work around.
 */
export async function requireWorkspace(userId: string): Promise<WorkspaceContext> {
  const context = await findWorkspaceForUser(userId);
  if (!context || context.workspaceId === "") {
    throw new WorkspaceResolutionError("Could not resolve a workspace for this user", userId);
  }
  return context;
}

/**
 * The tenant id for a write that must have one.
 *
 * Phase 0.5 made the tenant columns required, so a create has to supply a
 * `string` the type system accepts — `workspaceIdForStamping` returns
 * `string | null` and therefore cannot be used at a create site. This is the
 * strict counterpart: resolve, or throw.
 *
 * Throwing is the point. A write with no tenant is not a row to be repaired
 * later any more — it is a request that cannot be served correctly. Every user
 * has a membership by construction (signup creates one, the backfill covered the
 * history), so in practice this never fires; when it does, it means the account
 * is in a state the caller must fix rather than paper over.
 */
export async function workspaceIdForWrite(userId: string): Promise<string> {
  const context = await findWorkspaceForUser(userId);
  if (!context || context.workspaceId === "") {
    throw new WorkspaceResolutionError(
      "Cannot write without a workspace: this user has no membership",
      userId,
    );
  }
  return context.workspaceId;
}

/**
 * Best-effort tenant id, for stamping a row on a write path.
 *
 * Returns `null` — never an empty string, and never a newly conjured workspace —
 * when the user has no membership yet. An empty tenant id is the value that
 * silently disables a filter later (plan §7), and inventing a workspace here is
 * what would fragment the existing deployment; a null is fixed by the backfill.
 */
export async function workspaceIdForStamping(userId: string): Promise<string | null> {
  try {
    const context = await findWorkspaceForUser(userId);
    return context && context.workspaceId !== "" ? context.workspaceId : null;
  } catch (error) {
    console.error("[tenancy] could not resolve a workspace to stamp", { userId, error });
    return null;
  }
}

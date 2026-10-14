/**
 * Workspace membership: who belongs where, and the only places a membership is
 * created.
 *
 * Workspaces are the isolation boundary (docs/SAAS-PLAN.md). Request handlers do
 * not call this module to scope their queries — they call `requireWorkspace()`
 * in `./guard.ts`, which resolves the caller's workspace and role per request.
 * This module holds the membership *writes* and the plain lookups.
 *
 * Two rules:
 *
 *  1. **Resolution does not create.** `findWorkspaceForUser` returns null when a
 *     user has no membership, and it must stay that way. If it conjured a
 *     workspace on demand, an account that should have been placed in a team
 *     would silently get a personal workspace instead, and be isolated from its
 *     teammates.
 *  2. **Creation happens at the door, atomically.** A password signup, a first
 *     OAuth sign-in and an invitation acceptance are the only places a
 *     membership is written (`createWorkspaceForNewUser`, `joinWorkspace`). They
 *     accept a transaction client so the account and its membership commit
 *     together: an account without a workspace cannot use the product.
 */

import type { Prisma, PrismaClient } from "@prisma/client";
import prisma from "@/lib/prisma";
import { workspaceNameFor, workspaceSlugFor } from "./workspace-slug";
import { parseWorkspaceRole, type WorkspaceRole } from "./workspace-role";

/** Either the app client or an interactive transaction's client. */
type Db = PrismaClient | Prisma.TransactionClient;

export interface WorkspaceContext {
  workspaceId: string;
  /**
   * The membership's role, in the workspace vocabulary. Recorded and kept in
   * step with `User.role`; permissions are still decided by `User.role` and
   * src/lib/roles.ts.
   */
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
 * `./guard.ts` uses the same ordering.
 */
export async function findWorkspaceForUser(
  userId: string,
  db: Db = prisma,
): Promise<WorkspaceContext | null> {
  const membership = await db.workspaceMember.findFirst({
    where: { userId },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    select: { workspaceId: true, role: true },
  });

  if (!membership || membership.workspaceId === "") return null;

  return {
    workspaceId: membership.workspaceId,
    role: parseWorkspaceRole(membership.role),
  };
}

/**
 * Create the workspace a **brand-new** account owns, and its OWNER membership.
 *
 * Called from signup only — a password registration without an invitation, or a
 * first OAuth sign-in — never from a read path. A new account starts its own
 * workspace and owns it.
 *
 * Idempotent under concurrency: `Workspace.slug` is unique and derived from the
 * user id, so two racing calls collide on the INSERT and one wins; the loser
 * re-reads. `update: {}` means an existing membership's role is never rewritten.
 */
export async function createWorkspaceForNewUser(
  input: {
    userId: string;
    name?: string | null;
    email?: string | null;
  },
  db: Db = prisma,
): Promise<WorkspaceContext> {
  const existing = await findWorkspaceForUser(input.userId, db);
  if (existing) return existing;

  const slug = workspaceSlugFor(input.userId);
  const workspace = await db.workspace.upsert({
    where: { slug },
    create: {
      name: workspaceNameFor({ name: input.name, email: input.email }),
      slug,
    },
    update: {},
  });

  const role: WorkspaceRole = "OWNER";
  await db.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: workspace.id, userId: input.userId } },
    create: { workspaceId: workspace.id, userId: input.userId, role },
    update: {},
  });

  return { workspaceId: workspace.id, role };
}

/**
 * Add an account to an existing workspace — an accepted invitation.
 *
 * The invitee joins the inviter's team; they do not get a workspace of their
 * own. The role is recorded in the workspace vocabulary.
 */
export async function joinWorkspace(
  input: { userId: string; workspaceId: string; role: WorkspaceRole },
  db: Db = prisma,
): Promise<WorkspaceContext> {
  if (input.workspaceId === "") {
    throw new WorkspaceResolutionError("Cannot join a workspace with an empty id", input.userId);
  }
  await db.workspaceMember.upsert({
    where: { workspaceId_userId: { workspaceId: input.workspaceId, userId: input.userId } },
    create: { workspaceId: input.workspaceId, userId: input.userId, role: input.role },
    update: {},
  });
  return { workspaceId: input.workspaceId, role: input.role };
}

/**
 * The tenant id for a write that must have one, for code outside a request
 * (scripts). Request handlers take `workspaceId` from `requireWorkspace()`.
 *
 * Throws rather than returning null: a write with no tenant is not a row to be
 * repaired later, it is a request that cannot be served correctly.
 */
export async function workspaceIdForWrite(userId: string): Promise<string> {
  const context = await findWorkspaceForUser(userId);
  if (!context) {
    throw new WorkspaceResolutionError(
      "Cannot write without a workspace: this user has no membership",
      userId,
    );
  }
  return context.workspaceId;
}

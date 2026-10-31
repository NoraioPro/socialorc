/**
 * The tenant boundary for a request: who is calling, in which workspace, with
 * which role — resolved fresh from the database on every call.
 *
 * Every route that reads or writes a workspace-owned row (Post, SocialAccount,
 * MediaAsset, Brain, BrandBrain, ScheduledJob, PostMedia, feed reactions and
 * comments) starts here and scopes its queries by the returned `workspaceId`.
 * No route hand-rolls the lookup: `tests/unit/route-permissions.test.ts` fails
 * the build when a route touching those models does not call `requireWorkspace`.
 *
 * Three rules:
 *
 *  1. **The workspace is the isolation boundary.** Teammates in one workspace
 *     share posts, accounts, media, brains and the feed; a row from another
 *     workspace is *not found* (404), never "forbidden" — a 403 would confirm
 *     that the id exists.
 *  2. **The role is read per request**, not from the JWT. A role change by an
 *     admin takes effect on the caller's next request rather than whenever their
 *     token happens to be re-issued.
 *  3. **Resolution never creates.** A signed-in user with no membership gets a
 *     403 here, not a freshly conjured personal workspace (see `workspace.ts`).
 *     Signup, OAuth signup and invitation acceptance are the only places a
 *     membership is created, and the backfill migration covered the history.
 */

import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { can, effectiveRole, type Permission, type Role } from "@/lib/roles";
import { isSoleWorkspaceMember } from "./solo";
import { readActiveWorkspaceId } from "./active-workspace";

export interface TenantContext {
  userId: string;
  role: Role;
  workspaceId: string;
}

export type TenantGuard =
  | ({ ok: true } & TenantContext)
  | { ok: false; status: 401 | 403; error: string };

export const NO_WORKSPACE_MESSAGE =
  "Your account is not a member of any workspace. Ask a workspace admin to invite you.";

/**
 * The caller's user row, role and workspace, or why there is none.
 *
 * One query: the user (for the current role) and their oldest membership. A user
 * is in exactly one workspace today; if that stops being true the oldest is the
 * stable answer until a workspace switcher exists.
 */
export async function tenantForUser(userId: string): Promise<TenantGuard> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      role: true,
      workspaceMembers: {
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 25,
        select: { workspaceId: true, role: true },
      },
    },
  });

  // A signed token for a user this database does not hold (a session minted by
  // another local server sharing NEXTAUTH_SECRET, or a deleted account).
  if (!user) return { ok: false, status: 401, error: "Unauthorized" };

  // The cookie only chooses among memberships this user actually holds; a value
  // naming somebody else's workspace is ignored and the oldest is used instead.
  const activeId = await readActiveWorkspaceId();
  const chosen =
    (activeId ? user.workspaceMembers.find((m) => m.workspaceId === activeId) : undefined) ??
    user.workspaceMembers[0];

  const workspaceId = chosen?.workspaceId;
  // Never an empty string: an empty tenant id silently disables a filter.
  if (!workspaceId) return { ok: false, status: 403, error: NO_WORKSPACE_MESSAGE };

  // The membership decides, not the global account flag: the product promises
  // "access comes from workspace membership", and a role change in Team has to
  // take effect on the next request. The global role is only a fallback for a
  // membership that predates the column being populated.
  //
  // Membership rows use OWNER/MEMBER alongside the app's roles, so they are
  // mapped explicitly — an unmapped value would fall through to CLIENT and
  // silently demote a workspace owner.
  const MEMBERSHIP_ROLE: Record<string, typeof user.role> = {
    OWNER: "ADMIN",
    ADMIN: "ADMIN",
    MANAGER: "MANAGER",
    EDITOR: "EDITOR",
    CLIENT: "CLIENT",
    VIEWER: "CLIENT",
  };
  const membershipRole = String(chosen?.role ?? "").toUpperCase();
  const baseRole = MEMBERSHIP_ROLE[membershipRole] ?? user.role;
  const role = effectiveRole(baseRole, await isSoleWorkspaceMember(userId));
  return { ok: true, userId, role, workspaceId };
}

/**
 * Authenticate, resolve the workspace, and check one permission.
 *
 * `dashboard:view` is held by every role, so `requireWorkspace()` with no
 * argument means "any signed-in member of a workspace".
 */
export async function requireWorkspace(
  permission: Permission = "dashboard:view",
): Promise<TenantGuard> {
  const session = await getAuthSession();
  const userId = session?.user?.id;
  if (!userId) return { ok: false, status: 401, error: "Unauthorized" };

  const tenant = await tenantForUser(userId);
  if (!tenant.ok) return tenant;

  if (!can(tenant.role, permission)) {
    return {
      ok: false,
      status: 403,
      error: `Your role (${tenant.role}) is not allowed to ${permission}`,
    };
  }

  return tenant;
}

/** Whether an already-resolved tenant also holds `permission` (no extra query). */
export function tenantCan(tenant: TenantContext, permission: Permission): boolean {
  return can(tenant.role, permission);
}

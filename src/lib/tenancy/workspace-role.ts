/**
 * The workspace-role vocabulary, and how today's roles map onto it.
 *
 * `docs/SAAS-PLAN.md` §8 records the decision. The plan proposed
 * `OWNER | ADMIN | EDITOR | MEMBER | VIEWER`, but that set **cannot** convert
 * today's accounts without changing who can do what: `MANAGER` has no home in
 * it, and folding `MANAGER` into `ADMIN` silently grants `posts:delete` and
 * `users:manage`.
 *
 * So the vocabulary keeps `MANAGER` and gains `OWNER`:
 *
 *   ADMIN   → OWNER     (the existing full-rights account becomes the seat that
 *                        can hold billing and delete the workspace)
 *   MANAGER → MANAGER   (unchanged — it keeps approve/schedule/connect)
 *   EDITOR  → EDITOR    (unchanged)
 *   CLIENT  → VIEWER    (renamed only; still read-only)
 *
 * Every mapping is lossless: nobody gains a permission they do not already have.
 *
 * IMPORTANT — this module is deliberately ahead of the behaviour. Phase 0 only
 * *records* the workspace role; permissions still come from `User.role` and
 * `src/lib/roles.ts`. Phase 3 flips that over, and it must land before Phase 1
 * copies roles onto `WorkspaceMember` (plan §5).
 */

import type { Role } from "@/lib/roles";

export const WORKSPACE_ROLES = [
  "OWNER",
  "ADMIN",
  "MANAGER",
  "EDITOR",
  "VIEWER",
] as const;

export type WorkspaceRole = (typeof WORKSPACE_ROLES)[number];

/** Strict membership test — never coerces. */
export function isWorkspaceRole(value: unknown): value is WorkspaceRole {
  return (
    typeof value === "string" &&
    (WORKSPACE_ROLES as readonly string[]).includes(value)
  );
}

/** Least privilege: anything unreadable becomes the read-only seat. */
export const FALLBACK_WORKSPACE_ROLE: WorkspaceRole = "VIEWER";

/**
 * Map a current `User.role` onto its workspace role.
 *
 * Exhaustive over `Role` by construction — a new value in `roles.ts` fails the
 * build here rather than silently becoming VIEWER somewhere downstream.
 */
export function workspaceRoleFor(role: Role): WorkspaceRole {
  switch (role) {
    case "ADMIN":
      return "OWNER";
    case "MANAGER":
      return "MANAGER";
    case "EDITOR":
      return "EDITOR";
    case "CLIENT":
      return "VIEWER";
  }
}

/** Parse a stored `WorkspaceMember.role` string, falling back to least privilege. */
export function parseWorkspaceRole(value: unknown): WorkspaceRole {
  return isWorkspaceRole(value) ? value : FALLBACK_WORKSPACE_ROLE;
}

/**
 * Roles that may be handed out through an invite. `OWNER` is excluded: ownership
 * transfer is a deliberate action, not something an invitation grants.
 */
export function invitableWorkspaceRoles(): WorkspaceRole[] {
  return WORKSPACE_ROLES.filter((role) => role !== "OWNER");
}

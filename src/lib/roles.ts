/**
 * Single source of truth for workspace roles and permissions.
 *
 * Pure module: no clock, no network, no database access, so it is safe to
 * import from client components, server routes and unit tests alike.
 */

export const ROLES = ["ADMIN", "MANAGER", "EDITOR", "CLIENT"] as const;

export type Role = (typeof ROLES)[number];

/** Role granted to a brand-new self-registered account (the workspace owner). */
export const DEFAULT_ROLE: Role = "ADMIN";

/**
 * Role for a self-serve signup.
 *
 * Every self-signup creates and owns a workspace of its own (see
 * createWorkspaceForNewUser), and ADMIN's powers are all scoped to the caller's
 * workspace: `users:manage` and `posts:delete` act on that workspace only
 * (requireWorkspace). So the owner of a private workspace must be ADMIN. At
 * EDITOR they could not connect a social account, approve or schedule
 * (`accounts:connect`, `posts:approve`, `posts:schedule` are ADMIN/MANAGER), so
 * public signup produced accounts that could not use the product.
 *
 * Roles are still global, not per workspace (docs/AUDIT-MVP-2026-10-29.md N-9):
 * this default is only safe while every self-signup lives in its own workspace
 * and team invitations stay off (NEXT_PUBLIC_TEAMS_ENABLED). Revisit before
 * enabling teams. auth.ts applies the same rule to OAuth sign-ups. Override with
 * SIGNUP_ROLE.
 *
 * Takes the env bag as a parameter (like auth-providers.ts) so this module stays
 * free of ambient globals and remains trivially testable.
 */
export function selfSignupRole(env: NodeJS.ProcessEnv = process.env): Role {
  const configured = env.SIGNUP_ROLE;
  return configured && (ROLES as readonly string[]).includes(configured)
    ? (configured as Role)
    : "ADMIN";
}

/**
 * The role a request is actually authorised as: a user who is alone in their
 * workspace has full rights there (see src/lib/tenancy/solo.ts), otherwise the
 * stored role, validated.
 */
export function effectiveRole(storedRole: unknown, soleWorkspaceMember: boolean): Role {
  return soleWorkspaceMember ? "ADMIN" : parseRole(storedRole);
}

/**
 * Role assumed for any value we could not validate. Least privilege: an
 * unreadable role must never silently grant approval rights.
 */
export const FALLBACK_ROLE: Role = "CLIENT";

export const PERMISSIONS = [
  "dashboard:view",
  "posts:create",
  "posts:submit",
  "posts:approve",
  "posts:schedule",
  "posts:delete",
  "accounts:connect",
  /**
   * Uploading and deleting media, managing brains, and posting into the native
   * feed. These write paths were session-only: any signed-in role, including
   * CLIENT, could call them. They are in the matrix now because "signed in" is
   * authentication, not authorisation.
   */
  "media:upload",
  "media:delete",
  "brains:read",
  "brains:manage",
  "feed:post",
  "users:manage",
  "engagement:view",
  "engagement:reply",
  "engagement:react",
  "engagement:delete",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

/** Which roles may exercise which permission. */
const MATRIX: Record<Permission, readonly Role[]> = {
  "dashboard:view": ROLES,
  "posts:create": ["ADMIN", "MANAGER", "EDITOR"],
  "posts:submit": ["ADMIN", "MANAGER", "EDITOR"],
  "posts:approve": ["ADMIN", "MANAGER"],
  "posts:schedule": ["ADMIN", "MANAGER"],
  "posts:delete": ["ADMIN"],
  "accounts:connect": ["ADMIN", "MANAGER"],
  "media:upload": ["ADMIN", "MANAGER", "EDITOR"],
  "media:delete": ["ADMIN", "MANAGER"],
  "brains:read": ROLES,
  "brains:manage": ["ADMIN", "MANAGER"],
  "feed:post": ["ADMIN", "MANAGER", "EDITOR"],
  "users:manage": ["ADMIN"],
  "engagement:view": ROLES,
  "engagement:reply": ["ADMIN", "MANAGER", "EDITOR"],
  "engagement:react": ["ADMIN", "MANAGER", "EDITOR"],
  "engagement:delete": ["ADMIN", "MANAGER"],
};

export interface RoleMeta {
  label: string;
  /** One line used in docs and any future dev tooling. */
  blurb: string;
  /** Tailwind classes for the role badge, kept here so every surface agrees. */
  badgeClassName: string;
}

export const ROLE_META: Record<Role, RoleMeta> = {
  ADMIN: {
    label: "Admin",
    blurb: "Owns the workspace: connects accounts, approves, schedules, manages users.",
    badgeClassName: "bg-violet-100 text-violet-800 border-violet-200",
  },
  MANAGER: {
    label: "Manager",
    blurb: "Reviews and ships content: approves, schedules and connects accounts.",
    badgeClassName: "bg-blue-100 text-blue-800 border-blue-200",
  },
  EDITOR: {
    label: "Editor",
    blurb: "Writes and submits drafts, but cannot approve or schedule them.",
    badgeClassName: "bg-amber-100 text-amber-900 border-amber-200",
  },
  CLIENT: {
    label: "Client",
    blurb: "Read-only stakeholder: sees the calendar and content, changes nothing.",
    badgeClassName: "bg-slate-100 text-slate-700 border-slate-200",
  },
};

/** Strict membership test — never coerces, never guesses. */
export function isRole(value: unknown): value is Role {
  return typeof value === "string" && (ROLES as readonly string[]).includes(value);
}

/**
 * Parse a role out of untrusted input (request body, query string, form field,
 * a database column written before this module existed).
 *
 * Anything not an exact role string becomes FALLBACK_ROLE so a malformed or
 * hostile value can never widen access.
 */
export function parseRole(value: unknown): Role {
  return isRole(value) ? value : FALLBACK_ROLE;
}

export function can(role: Role, permission: Permission): boolean {
  return MATRIX[permission].includes(role);
}

export function permissionsFor(role: Role): Permission[] {
  return PERMISSIONS.filter((permission) => can(role, permission));
}

/** Convenience predicates for the common gates. */
export function isApprover(role: Role): boolean {
  return can(role, "posts:approve");
}

export function isReadOnly(role: Role): boolean {
  return !can(role, "posts:create");
}

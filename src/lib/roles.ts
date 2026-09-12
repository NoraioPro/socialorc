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
  "users:manage",
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
  "users:manage": ["ADMIN"],
};

export interface RoleMeta {
  label: string;
  /** One line used in the dev role switcher and in docs. */
  blurb: string;
  demoName: string;
  demoEmail: string;
  /** Tailwind classes for the role badge, kept here so every surface agrees. */
  badgeClassName: string;
}

export const ROLE_META: Record<Role, RoleMeta> = {
  ADMIN: {
    label: "Admin",
    blurb: "Owns the workspace: connects accounts, approves, schedules, manages users.",
    demoName: "Ada Admin",
    demoEmail: "demo-admin@socialorc.local",
    badgeClassName: "bg-violet-100 text-violet-800 border-violet-200",
  },
  MANAGER: {
    label: "Manager",
    blurb: "Reviews and ships content: approves, schedules and connects accounts.",
    demoName: "Mo Manager",
    demoEmail: "demo-manager@socialorc.local",
    badgeClassName: "bg-blue-100 text-blue-800 border-blue-200",
  },
  EDITOR: {
    label: "Editor",
    blurb: "Writes and submits drafts, but cannot approve or schedule them.",
    demoName: "Ed Editor",
    demoEmail: "demo-editor@socialorc.local",
    badgeClassName: "bg-amber-100 text-amber-900 border-amber-200",
  },
  CLIENT: {
    label: "Client",
    blurb: "Read-only stakeholder: sees the calendar and content, changes nothing.",
    demoName: "Cleo Client",
    demoEmail: "demo-client@socialorc.local",
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

/**
 * The first-run question: is this account just one person, or a team?
 *
 * It is asked once, before the dashboard. "Just me" is a private workspace whose
 * only member owns everything in it (src/lib/tenancy/solo.ts). "A team" is only
 * offered while team features are enabled (src/lib/features.ts); until then the
 * option is shown as unavailable rather than silently behaving like "Just me".
 */

import { ROLES, isRole, type Role } from "@/lib/roles";

export const WORKSPACE_KINDS = ["PERSONAL", "TEAM"] as const;
export type WorkspaceKind = (typeof WORKSPACE_KINDS)[number];

export function isWorkspaceKind(value: unknown): value is WorkspaceKind {
  return typeof value === "string" && (WORKSPACE_KINDS as readonly string[]).includes(value);
}

/** Accounts created before the question existed are marked answered by the migration. */
export function needsOnboarding(onboardedAt: Date | null | undefined): boolean {
  return !onboardedAt;
}

/** Roles a team creator may take; Admin is the default and the only one that can invite. */
export const TEAM_ROLE_CHOICES: readonly Role[] = ROLES;

/**
 * The stored role an answer produces, or null when the answer is invalid.
 * Just me is always ADMIN (and the role is ignored); a team creator picks one,
 * defaulting to ADMIN when none is sent.
 */
export function onboardingRole(kind: WorkspaceKind, role: unknown): Role | null {
  if (kind === "PERSONAL") return "ADMIN";
  if (role === undefined || role === null || role === "") return "ADMIN";
  return isRole(role) ? role : null;
}

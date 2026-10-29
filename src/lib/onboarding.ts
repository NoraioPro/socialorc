/**
 * The first-run question: is this account just one person, or a team?
 *
 * It is asked once, before the dashboard. "Just me" is a private workspace whose
 * only member owns everything in it (src/lib/tenancy/solo.ts). "A team" is only
 * offered while team features are enabled (src/lib/features.ts); until then the
 * option is shown as unavailable rather than silently behaving like "Just me".
 */

export const WORKSPACE_KINDS = ["PERSONAL", "TEAM"] as const;
export type WorkspaceKind = (typeof WORKSPACE_KINDS)[number];

export function isWorkspaceKind(value: unknown): value is WorkspaceKind {
  return typeof value === "string" && (WORKSPACE_KINDS as readonly string[]).includes(value);
}

/** Accounts created before the question existed are marked answered by the migration. */
export function needsOnboarding(onboardedAt: Date | null | undefined): boolean {
  return !onboardedAt;
}

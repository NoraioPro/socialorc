/**
 * Workspace naming and slug rules — pure, so they can be tested without a
 * database and reused by the backfill script (Phase 0.4).
 *
 * The slug is the idempotency key for workspace creation. `Workspace.slug` is
 * `@unique`, so two concurrent "ensure this user has a workspace" calls race on
 * the INSERT and exactly one wins; the loser re-reads. That is what makes
 * `getOrCreateWorkspaceForUser` safe to call from any request path rather than
 * only from a signup hook.
 */

/**
 * Slug for a user's personal workspace.
 *
 * Derived from the user id, not from a name or an email: ids are already unique
 * and slug-safe (cuid), whereas a name collides the moment two people are called
 * "Ahmed", and an email in a URL is a data leak waiting to happen.
 */
export function workspaceSlugFor(userId: string): string {
  const cleaned = userId.trim().toLowerCase().replace(/[^a-z0-9]/g, "");
  if (cleaned === "") {
    // Never return an empty slug: every such user would collide on "" and the
    // first one would own the row for everybody.
    throw new Error("workspaceSlugFor: userId must contain alphanumeric characters");
  }
  return `ws-${cleaned}`;
}

/**
 * A human label for the auto-created workspace, e.g. "Ahmed's workspace".
 *
 * Falls back to the email's local part and then to a generic name, so a user
 * with neither a name nor an email still gets something readable.
 */
export function workspaceNameFor(input: {
  name?: string | null;
  email?: string | null;
}): string {
  const fromName = (input.name ?? "").trim();
  const fromEmail = (input.email ?? "").split("@")[0].trim();
  const raw = fromName || fromEmail;
  if (raw === "") return "My workspace";

  const first = raw.split(/\s+/)[0];
  return `${first}'s workspace`;
}

/**
 * M0.10 — the "this account needs reconnecting" surface.
 *
 * The *fact* is decided elsewhere and already exists in the data: a
 * credential-shaped dead-letter sets `SocialAccount.needsReconnect` +
 * `lastError` (cron worker and publish route), `getTokenStatus()` reports
 * `requiresReconnect` for a token that cannot be recovered by a refresh, and
 * a finished reconnect clears both fields (`src/lib/oauth/callback.ts`).
 *
 * This module only turns that fact into something the settings UI can render,
 * so the banner logic is unit-testable without a database or a browser.
 *
 * Display only: nothing here decides whether an account may publish. The
 * worker and the publish route own that, and the approval gate is untouched.
 */

export type ReconnectCandidate = {
  id?: string | null;
  platform: string;
  /** Human label shown with the platform name (username / display name). */
  label?: string | null;
  isActive?: boolean | null;
  needsReconnect?: boolean | null;
  lastError?: string | null;
  tokenStatus?: { requiresReconnect?: boolean | null } | null;
};

export type ReconnectNotice = {
  platform: string;
  accountId: string;
  label: string;
  /** Concrete, ready to render — never empty. */
  reason: string;
};

/** Shown when the worker flagged the account but stored no error text. */
export const RECONNECT_FALLBACK_REASON =
  "The platform rejected the stored credentials. Reconnect this account to keep publishing.";

/**
 * Flagged when the worker says so, or when the token lifecycle says the stored
 * token cannot be recovered by a refresh. A disconnected (`isActive: false`)
 * account is never flagged — it has nothing to publish through.
 */
export function accountNeedsReconnect(account: ReconnectCandidate): boolean {
  if (account.isActive === false) return false;
  return account.needsReconnect === true || account.tokenStatus?.requiresReconnect === true;
}

/** The stored `lastError` verbatim when present (it already carries the adapter error code). */
export function reconnectReason(account: ReconnectCandidate): string {
  const stored = typeof account.lastError === "string" ? account.lastError.trim() : "";
  return stored || RECONNECT_FALLBACK_REASON;
}

function labelFor(account: ReconnectCandidate): string {
  const label = typeof account.label === "string" ? account.label.trim() : "";
  return label || account.platform;
}

/** Flagged accounts in a stable order (platform, then label) for the banner list. */
export function reconnectNotices(accounts: readonly ReconnectCandidate[]): ReconnectNotice[] {
  return accounts
    .filter(accountNeedsReconnect)
    .map((account) => ({
      platform: account.platform,
      accountId: account.id ?? `${account.platform}:${labelFor(account)}`,
      label: labelFor(account),
      reason: reconnectReason(account),
    }))
    .sort(
      (a, b) => a.platform.localeCompare(b.platform) || a.label.localeCompare(b.label)
    );
}

/** One sentence for the banner headline; empty string when there is nothing to say. */
export function reconnectSummary(count: number): string {
  if (count <= 0) return "";
  if (count === 1) return "1 connected account needs reconnecting before it can publish.";
  return `${count} connected accounts need reconnecting before they can publish.`;
}

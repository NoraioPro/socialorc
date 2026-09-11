/**
 * Token lifetime decisions.
 *
 * Kept as pure functions so the policy is unit-testable without a platform:
 * the worker asks "is this token about to be unusable?" and "can this connector
 * even refresh?", and the answers must not depend on network state.
 */

/** Refresh this far before nominal expiry, so a publish never races the clock. */
export const REFRESH_SKEW_MS = 5 * 60_000;

/** Alert threshold: warn when token expires within 24 hours. */
export const EXPIRY_ALERT_THRESHOLD_MS = 24 * 60 * 60_000;

/** Warning threshold: warn when token expires within 7 days. */
export const EXPIRY_WARNING_THRESHOLD_MS = 7 * 24 * 60 * 60_000;

/**
 * True when the stored token is expired or close enough to expiry that a publish
 * now would likely fail. A missing expiry means "no expiry known" (Telegram bot
 * tokens, for example) and is never treated as expired.
 */
export function needsTokenRefresh(
  expiresAt: Date | null | undefined,
  now: Date = new Date(),
  skewMs: number = REFRESH_SKEW_MS,
): boolean {
  if (!expiresAt) return false;
  return expiresAt.getTime() - now.getTime() <= skewMs;
}

/** True when the connector can obtain a new access token without human consent. */
export function canRefresh(hasRefreshToken: boolean, platformSupportsRefresh: boolean): boolean {
  return hasRefreshToken && platformSupportsRefresh;
}

/**
 * Token status for UI display and proactive alerting.
 * - "valid": token is healthy, far from expiry
 * - "expiring_soon": token will expire within warning threshold (7 days)
 * - "expiring_urgent": token will expire within alert threshold (24 hours)
 * - "expired": token has already expired
 * - "no_expiry": token has no known expiry (permanent tokens like Telegram)
 */
export type TokenExpiryStatus = "valid" | "expiring_soon" | "expiring_urgent" | "expired" | "no_expiry";

export interface TokenStatus {
  status: TokenExpiryStatus;
  expiresAt: Date | null;
  expiresInMs: number | null;
  needsRefresh: boolean;
  canAutoRefresh: boolean;
  requiresReconnect: boolean;
}

/**
 * Comprehensive token status for UI and alerting.
 *
 * Combines expiry timing with the platform's refresh capability to give a
 * single source of truth: is this token healthy, and if not, what action is needed?
 */
export function getTokenStatus(
  expiresAt: Date | null | undefined,
  hasRefreshToken: boolean,
  platformSupportsRefresh: boolean,
  needsReconnect: boolean,
  now: Date = new Date(),
): TokenStatus {
  const normalizedExpiresAt = expiresAt ?? null;
  const refreshable = canRefresh(hasRefreshToken, platformSupportsRefresh);

  if (!normalizedExpiresAt) {
    return {
      status: "no_expiry",
      expiresAt: null,
      expiresInMs: null,
      needsRefresh: false,
      canAutoRefresh: refreshable,
      requiresReconnect: needsReconnect,
    };
  }

  const expiresInMs = normalizedExpiresAt.getTime() - now.getTime();
  const needsRefresh = needsTokenRefresh(normalizedExpiresAt, now);

  let status: TokenExpiryStatus;
  if (expiresInMs <= 0) {
    status = "expired";
  } else if (expiresInMs <= EXPIRY_ALERT_THRESHOLD_MS) {
    status = "expiring_urgent";
  } else if (expiresInMs <= EXPIRY_WARNING_THRESHOLD_MS) {
    status = "expiring_soon";
  } else {
    status = "valid";
  }

  const requiresReconnect =
    needsReconnect ||
    ((status === "expired" || status === "expiring_urgent") && !refreshable);

  return {
    status,
    expiresAt: normalizedExpiresAt,
    expiresInMs,
    needsRefresh,
    canAutoRefresh: refreshable,
    requiresReconnect,
  };
}

/**
 * True when the token is expiring soon enough that an alert should be shown.
 * This is for proactive UI warnings, not for the publish worker.
 */
export function isTokenExpiringSoon(
  expiresAt: Date | null | undefined,
  now: Date = new Date(),
  thresholdMs: number = EXPIRY_WARNING_THRESHOLD_MS,
): boolean {
  if (!expiresAt) return false;
  const expiresInMs = expiresAt.getTime() - now.getTime();
  return expiresInMs > 0 && expiresInMs <= thresholdMs;
}

/**
 * Human-readable time until expiry.
 */
export function formatExpiryTime(expiresInMs: number | null): string {
  if (expiresInMs === null) return "No expiry";
  if (expiresInMs <= 0) return "Expired";

  const minutes = Math.floor(expiresInMs / 60_000);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days} day${days === 1 ? "" : "s"}`;
  if (hours > 0) return `${hours} hour${hours === 1 ? "" : "s"}`;
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/**
 * Token lifetime decisions.
 *
 * Kept as pure functions so the policy is unit-testable without a platform:
 * the worker asks "is this token about to be unusable?" and "can this connector
 * even refresh?", and the answers must not depend on network state.
 */

/** Refresh this far before nominal expiry, so a publish never races the clock. */
export const REFRESH_SKEW_MS = 5 * 60_000;

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

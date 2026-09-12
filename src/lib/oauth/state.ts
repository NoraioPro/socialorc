/**
 * OAuth state handling.
 *
 * The connect route parks a state cookie (`oauth_state_<state>`) and the
 * provider echoes the state back. Two subtleties live here:
 *
 * 1. X (Twitter) packs a PKCE code verifier into the state as
 *    `<state>:<verifier>`, so the raw parameter is not the cookie key — it has
 *    to be split before lookup, and the verifier handed to the token exchange.
 * 2. A state cookie is only trustworthy if it matches the session user, the
 *    platform being connected, and a short TTL.
 *
 * Both are pure functions so they can be tested without a provider.
 */

export interface OAuthStateData {
  userId: string;
  platform: string;
  timestamp: number;
  /**
   * PKCE code verifier, kept server-side in the state cookie.
   *
   * It must NOT travel in the `state` parameter: anything that can read the
   * redirect URL (browser history, proxy logs, referrer headers) would then
   * learn the value that is supposed to prove the token exchange comes from the
   * client that started the flow. X still packs its verifier into the state
   * string (`<state>:<verifier>`) for backwards compatibility; TikTok and newer
   * connectors put it here instead.
   */
  verifier?: string;
  codeChallengeMethod?: "S256" | "plain";
  /** Which brain (project, src/lib/brains.ts) this connection should belong to. */
  brainId?: string;
  /** Connect was opened in a popup window rather than a full-page navigation. */
  popup?: boolean;
}

/** Best-effort peek at the state cookie for fields needed before/without full validation. */
export function peekStateCookie(rawCookieValue: string | undefined | null): Partial<OAuthStateData> {
  if (!rawCookieValue) return {};
  try {
    return JSON.parse(rawCookieValue) as Partial<OAuthStateData>;
  } catch {
    return {};
  }
}

export const OAUTH_STATE_TTL_MS = 10 * 60_000;

export type OAuthStateProblem = "malformed" | "expired" | "user_mismatch" | "platform_mismatch";

export function splitState(rawState: string): { baseState: string; verifier: string | null } {
  const separator = rawState.indexOf(":");
  if (separator === -1) return { baseState: rawState, verifier: null };
  return {
    baseState: rawState.slice(0, separator),
    verifier: rawState.slice(separator + 1) || null,
  };
}

/** Read the PKCE verifier the connect route parked with the state cookie. */
export function verifierFromStateCookie(rawCookieValue: string | undefined | null): string | null {
  if (!rawCookieValue) return null;
  try {
    const data = JSON.parse(rawCookieValue) as OAuthStateData;
    return typeof data?.verifier === "string" && data.verifier.length > 0 ? data.verifier : null;
  } catch {
    return null;
  }
}

export function validateOAuthState(
  rawCookieValue: string | undefined | null,
  opts: { userId: string; platform: string; now?: Date; ttlMs?: number },
): { ok: true; data: OAuthStateData } | { ok: false; reason: OAuthStateProblem } {
  if (!rawCookieValue) return { ok: false, reason: "malformed" };

  let data: OAuthStateData;
  try {
    data = JSON.parse(rawCookieValue) as OAuthStateData;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (!data || typeof data.userId !== "string" || typeof data.platform !== "string" || typeof data.timestamp !== "number") {
    return { ok: false, reason: "malformed" };
  }

  const now = (opts.now ?? new Date()).getTime();
  if (now - data.timestamp > (opts.ttlMs ?? OAUTH_STATE_TTL_MS)) {
    return { ok: false, reason: "expired" };
  }

  // A state cookie minted for another session must never connect an account here.
  if (data.userId !== opts.userId) return { ok: false, reason: "user_mismatch" };

  // …and neither must one minted for another platform (a mixed-up callback).
  if (data.platform !== opts.platform) return { ok: false, reason: "platform_mismatch" };

  return { ok: true, data };
}

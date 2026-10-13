import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * OAuth state handling.
 *
 * The connect route parks a state cookie (`oauth_state_<state>`) and the
 * provider echoes the state back. Three subtleties live here:
 *
 * 1. X (Twitter) packs a PKCE code verifier into the state as
 *    `<state>:<verifier>`, so the raw parameter is not the cookie key — it has
 *    to be split before lookup, and the verifier handed to the token exchange.
 * 2. The cookie is **signed** (`<hmac>.<base64url(json)>`). It used to be plain
 *    JSON, which made it forgeable: anybody who can set a cookie in their own
 *    browser can claim any `userId` and any platform, and the callback believed
 *    it. The signature is what makes "this callback belongs to the flow this
 *    user started" a fact rather than a claim.
 * 3. A state cookie is only trustworthy if the signature verifies, and it
 *    matches the session user, the platform being connected, and a short TTL.
 *
 * The cryptography and the parsing are pure functions of (value, secret), so
 * they can be tested without a provider or a browser.
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

export const OAUTH_STATE_TTL_MS = 10 * 60_000;

export type OAuthStateProblem = "malformed" | "expired" | "user_mismatch" | "platform_mismatch";

/** HMAC-SHA256 over the JSON payload, base64url, no padding. */
export function signStateJson(json: string, secret: string): string {
  return createHmac("sha256", secret).update(json).digest("base64url");
}

/**
 * Return the JSON payload only if the signature matches, else null.
 * An unsigned or edited cookie is indistinguishable from garbage here, which is
 * the point: there is no code path that trusts an unverified value.
 */
export function verifyStateJson(
  rawCookieValue: string | undefined | null,
  secret: string
): string | null {
  if (!rawCookieValue) return null;

  const separator = rawCookieValue.indexOf(".");
  if (separator <= 0) return null;

  const providedSignature = rawCookieValue.slice(0, separator);
  const body = rawCookieValue.slice(separator + 1);
  if (body === "") return null;

  let json: string;
  try {
    json = Buffer.from(body, "base64url").toString("utf8");
  } catch {
    return null;
  }

  const expected = Buffer.from(signStateJson(json, secret), "utf8");
  const provided = Buffer.from(providedSignature, "utf8");
  // Length check first: timingSafeEqual throws on different-length buffers.
  if (expected.length !== provided.length) return null;
  if (!timingSafeEqual(expected, provided)) return null;

  return json;
}

/** Mint the cookie value the connect route stores. */
export function encodeStateCookie(data: OAuthStateData, secret: string): string {
  const json = JSON.stringify(data);
  return `${signStateJson(json, secret)}.${Buffer.from(json, "utf8").toString("base64url")}`;
}

/** Best-effort peek at the state cookie for fields needed before full validation. */
export function peekStateCookie(
  rawCookieValue: string | undefined | null,
  secret: string
): Partial<OAuthStateData> {
  const json = verifyStateJson(rawCookieValue, secret);
  if (!json) return {};
  try {
    return JSON.parse(json) as Partial<OAuthStateData>;
  } catch {
    return {};
  }
}

export function splitState(rawState: string): { baseState: string; verifier: string | null } {
  const separator = rawState.indexOf(":");
  if (separator === -1) return { baseState: rawState, verifier: null };
  return {
    baseState: rawState.slice(0, separator),
    verifier: rawState.slice(separator + 1) || null,
  };
}

/** Read the PKCE verifier the connect route parked with the state cookie. */
export function verifierFromStateCookie(
  rawCookieValue: string | undefined | null,
  secret: string
): string | null {
  const json = verifyStateJson(rawCookieValue, secret);
  if (!json) return null;
  try {
    const data = JSON.parse(json) as OAuthStateData;
    return typeof data?.verifier === "string" && data.verifier.length > 0 ? data.verifier : null;
  } catch {
    return null;
  }
}

export function validateOAuthState(
  rawCookieValue: string | undefined | null,
  opts: { userId: string; platform: string; secret: string; now?: Date; ttlMs?: number }
): { ok: true; data: OAuthStateData } | { ok: false; reason: OAuthStateProblem } {
  const json = verifyStateJson(rawCookieValue, opts.secret);
  if (!json) return { ok: false, reason: "malformed" };

  let data: OAuthStateData;
  try {
    data = JSON.parse(json) as OAuthStateData;
  } catch {
    return { ok: false, reason: "malformed" };
  }

  if (
    !data ||
    typeof data.userId !== "string" ||
    typeof data.platform !== "string" ||
    typeof data.timestamp !== "number"
  ) {
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

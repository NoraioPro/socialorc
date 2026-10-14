import { decrypt, encrypt } from "@/lib/encryption";
import { signStateJson, verifyStateJson } from "@/lib/oauth/state";

/**
 * A finished OAuth grant waiting for the user to pick what to connect it as.
 *
 * Facebook and Instagram grants cover every Page (and linked Instagram
 * account) the person manages. When there is more than one, the callback cannot
 * guess — it used to take `pages[0]`, so whoever managed two Pages could only
 * ever connect the first. Instead it parks the grant here and the settings page
 * asks.
 *
 * Shape and protections:
 * - one httpOnly cookie per platform, `oauth_pending_<platform>`;
 * - **signed** with the OAuth state secret (same HMAC as the state cookie), so
 *   it cannot be minted or edited client-side;
 * - **the token inside is encrypted** with the token-encryption key — no
 *   plaintext credential ever sits in a cookie;
 * - bound to the user and platform, and short-lived (`PENDING_TTL_MS`).
 *
 * The cookie carries no Page list: candidates are re-read from Meta with the
 * token on every request, so the browser can never offer a Page the grant does
 * not cover, and the adapter re-verifies the chosen id before storing it.
 */

export const PENDING_TTL_MS = 10 * 60_000;

export interface PendingConnection {
  userId: string;
  platform: string;
  brainId: string;
  /** Long-lived user token, decrypted. Never serialise this anywhere. */
  userToken: string;
  /** Expiry of that user token, if the provider stated one (ISO). */
  userTokenExpiresAt?: string | null;
  scope?: string | null;
  timestamp: number;
}

type Envelope = Omit<PendingConnection, "userToken"> & { tok: string };

export function pendingCookieName(platform: string): string {
  return `oauth_pending_${platform.toLowerCase()}`;
}

export function encodePendingConnection(data: PendingConnection, secret: string): string {
  const { userToken, ...rest } = data;
  const envelope: Envelope = { ...rest, tok: encrypt(userToken) };
  const json = JSON.stringify(envelope);
  return `${signStateJson(json, secret)}.${Buffer.from(json, "utf8").toString("base64url")}`;
}

export type PendingProblem = "missing" | "malformed" | "expired" | "user_mismatch" | "platform_mismatch";

export function readPendingConnection(
  raw: string | undefined | null,
  opts: { userId: string; platform: string; secret: string; now?: Date; ttlMs?: number },
): { ok: true; data: PendingConnection } | { ok: false; reason: PendingProblem } {
  if (!raw) return { ok: false, reason: "missing" };
  const json = verifyStateJson(raw, opts.secret);
  if (!json) return { ok: false, reason: "malformed" };

  let envelope: Envelope;
  try {
    envelope = JSON.parse(json) as Envelope;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (
    !envelope ||
    typeof envelope.userId !== "string" ||
    typeof envelope.platform !== "string" ||
    typeof envelope.brainId !== "string" ||
    typeof envelope.timestamp !== "number" ||
    typeof envelope.tok !== "string"
  ) {
    return { ok: false, reason: "malformed" };
  }

  const now = (opts.now ?? new Date()).getTime();
  if (now - envelope.timestamp > (opts.ttlMs ?? PENDING_TTL_MS)) return { ok: false, reason: "expired" };
  if (envelope.userId !== opts.userId) return { ok: false, reason: "user_mismatch" };
  if (envelope.platform !== opts.platform) return { ok: false, reason: "platform_mismatch" };

  let userToken: string;
  try {
    userToken = decrypt(envelope.tok);
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!userToken) return { ok: false, reason: "malformed" };

  return {
    ok: true,
    data: {
      userId: envelope.userId,
      platform: envelope.platform,
      brainId: envelope.brainId,
      userToken,
      userTokenExpiresAt: envelope.userTokenExpiresAt ?? null,
      scope: envelope.scope ?? null,
      timestamp: envelope.timestamp,
    },
  };
}

/** Cookie attributes: httpOnly, same-site lax (it is set on a cross-site redirect back from Meta). */
export function pendingCookieOptions() {
  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge: Math.floor(PENDING_TTL_MS / 1000),
  };
}

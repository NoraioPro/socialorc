import { timingSafeEqual } from "node:crypto";
import { decrypt, encrypt } from "@/lib/encryption";
import { signStateJson } from "@/lib/oauth/state";

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
 * - bound to the user, the workspace and the platform, and short-lived
 *   (`PENDING_TTL_MS`); the workspace is re-checked against the live guard, so
 *   a grant parked before a workspace change cannot land in the new one;
 * - the signature covers a purpose prefix (`PENDING_PURPOSE`), so a value
 *   signed for another purpose with the same secret (an OAuth state cookie)
 *   can never verify as a pending grant, and vice versa.
 *
 * The cookie carries no Page list: candidates are re-read from Meta with the
 * token on every request, so the browser can never offer a Page the grant does
 * not cover, and the adapter re-verifies the chosen id before storing it.
 */

export const PENDING_TTL_MS = 10 * 60_000;

/** Domain separation from the OAuth state cookie, which shares the secret. */
export const PENDING_PURPOSE = "socialorc:oauth-pending:v1\n";

export interface PendingConnection {
  userId: string;
  /** The workspace the grant was parked for; must match the caller's live workspace. */
  workspaceId: string;
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
  return `${signStateJson(PENDING_PURPOSE + json, secret)}.${Buffer.from(json, "utf8").toString("base64url")}`;
}

/** The JSON payload if the purpose-bound signature matches, else null. */
function verifyPendingJson(raw: string, secret: string): string | null {
  const separator = raw.indexOf(".");
  if (separator <= 0) return null;
  const body = raw.slice(separator + 1);
  if (body === "") return null;
  const json = Buffer.from(body, "base64url").toString("utf8");
  const expected = Buffer.from(signStateJson(PENDING_PURPOSE + json, secret), "utf8");
  const provided = Buffer.from(raw.slice(0, separator), "utf8");
  if (expected.length !== provided.length) return null;
  return timingSafeEqual(expected, provided) ? json : null;
}

export type PendingProblem =
  | "missing"
  | "malformed"
  | "expired"
  | "user_mismatch"
  | "workspace_mismatch"
  | "platform_mismatch";

export function readPendingConnection(
  raw: string | undefined | null,
  opts: {
    userId: string;
    /** The caller's workspace from the live guard (requireWorkspace), never from the cookie. */
    workspaceId: string;
    platform: string;
    secret: string;
    now?: Date;
    ttlMs?: number;
  },
): { ok: true; data: PendingConnection } | { ok: false; reason: PendingProblem } {
  if (!raw) return { ok: false, reason: "missing" };
  const json = verifyPendingJson(raw, opts.secret);
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
    typeof envelope.workspaceId !== "string" ||
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
  if (envelope.workspaceId !== opts.workspaceId) return { ok: false, reason: "workspace_mismatch" };
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
      workspaceId: envelope.workspaceId,
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

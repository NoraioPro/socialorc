/**
 * Signed review links.
 *
 * A client reviews a post without an account: the link carries a post id and an
 * expiry, signed with the deployment secret. Nothing is stored, so a link cannot
 * be enumerated and expires on its own. Verification happens on the server for
 * both the page and the decision endpoint.
 */
import { createHmac, timingSafeEqual } from "crypto";

const TTL_HOURS = 72;

function key(): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("NEXTAUTH_SECRET is required to sign review links");
  return `${secret}:review-link`;
}

function sign(payload: string): string {
  return createHmac("sha256", key()).update(payload).digest("base64url");
}

export function mintReviewToken(postId: string, ttlHours = TTL_HOURS): string {
  const payload = Buffer.from(JSON.stringify({ p: postId, e: Date.now() + ttlHours * 3600_000 })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function verifyReviewToken(token: string): { postId: string } | null {
  const [payload, signature] = String(token || "").split(".");
  if (!payload || !signature) return null;

  const expected = sign(payload);
  const a = Buffer.from(signature);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(payload, "base64url").toString()) as { p?: string; e?: number };
    if (!parsed.p || !parsed.e || Date.now() > parsed.e) return null;
    return { postId: parsed.p };
  } catch {
    return null;
  }
}

export function reviewPath(token: string): string {
  return `/review/${token}`;
}

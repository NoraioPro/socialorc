/**
 * Password reset links. There is no email service in this deployment, so a
 * workspace admin generates the link for a member and hands it over. The token
 * is signed, expires in 2 hours, and carries a fingerprint of the current
 * password hash, so it stops working the moment the password changes (single use).
 */
import { createHash, createHmac, timingSafeEqual } from "crypto";

const TTL_MS = 2 * 3600_000;
const key = () => {
  const s = process.env.NEXTAUTH_SECRET;
  if (!s) throw new Error("NEXTAUTH_SECRET is required");
  return `${s}:password-reset`;
};
const sign = (p: string) => createHmac("sha256", key()).update(p).digest("base64url");
export const fingerprint = (passwordHash: string | null) => createHash("sha256").update(passwordHash ?? "none").digest("base64url").slice(0, 16);

export function mintResetToken(userId: string, passwordHash: string | null): string {
  const payload = Buffer.from(JSON.stringify({ u: userId, e: Date.now() + TTL_MS, f: fingerprint(passwordHash) })).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readResetToken(token: string): { userId: string; fingerprint: string } | null {
  const [payload, sig] = String(token || "").split(".");
  if (!payload || !sig) return null;
  const a = Buffer.from(sig); const b = Buffer.from(sign(payload));
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(payload, "base64url").toString()) as { u?: string; e?: number; f?: string };
    if (!p.u || !p.e || !p.f || Date.now() > p.e) return null;
    return { userId: p.u, fingerprint: p.f };
  } catch { return null; }
}

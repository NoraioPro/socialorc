/**
 * PKCE helpers.
 *
 * The verifier must never leave the server: putting it in the OAuth `state`
 * (the pattern this repo inherited from X, where the verifier is appended to
 * the state and round-trips through the browser) defeats PKCE, because anything
 * that can read the redirect URL — browser history, a proxy log, a referrer
 * header — learns the secret that is supposed to prove the token exchange comes
 * from the client that started it.
 *
 * So: the verifier is generated here with a CSPRNG, stored server-side with the
 * state, and only the challenge is sent to the platform.
 */

import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

/** RFC 7636 allows 43–128 characters from the unreserved set. */
const VERIFIER_LENGTH = 64;
const VERIFIER_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";

/**
 * A cryptographic verifier. `Math.random()` is not acceptable here: it is
 * predictable from a few outputs, which is exactly what PKCE exists to prevent.
 * Rejection sampling keeps the distribution flat (256 is not a multiple of 66).
 */
export function generateCodeVerifier(length = VERIFIER_LENGTH): string {
  const max = 256 - (256 % VERIFIER_ALPHABET.length);
  let out = "";
  while (out.length < length) {
    for (const byte of randomBytes(length)) {
      if (byte >= max) continue;
      out += VERIFIER_ALPHABET[byte % VERIFIER_ALPHABET.length];
      if (out.length === length) break;
    }
  }
  return out;
}

/** base64url(SHA-256(verifier)) per RFC 7636 §4.2, or the verifier itself for `plain`. */
export function codeChallengeFor(verifier: string, method: "S256" | "plain" = "S256"): string {
  if (method === "plain") return verifier;
  return createHash("sha256").update(verifier, "ascii").digest("base64url");
}

/** Opaque, unguessable state value (32 bytes of entropy, hex encoded). */
export function generateState(): string {
  return randomBytes(32).toString("hex");
}

/** Constant-time compare for values that arrive from a query string. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

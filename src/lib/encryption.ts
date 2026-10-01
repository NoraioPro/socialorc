import CryptoJS from "crypto-js";

/**
 * Fallback key, used **outside production only**.
 *
 * It is published in this repository, so it protects nothing. A production
 * process that silently fell back to it would be storing every tenant's OAuth
 * tokens under a key anyone can read — and because the encrypted values are
 * returned by several API routes, that is a full token compromise rather than a
 * theoretical one. So in production a missing key is a hard failure, raised on
 * first use (not at module load, so the build and `/api/health` still work and
 * tell you what is wrong).
 */
const DEV_FALLBACK_KEY = "dev-key-change-in-production";

let warnedAboutFallback = false;

function encryptionKey(): string {
  const configured = process.env.TOKEN_ENCRYPTION_KEY;
  if (configured) return configured;

  if (process.env.NODE_ENV === "production") {
    throw new Error(
      "TOKEN_ENCRYPTION_KEY is not set. Refusing to encrypt or decrypt social tokens with the " +
        "development fallback key in production. Set it in the deployment environment.",
    );
  }

  if (!warnedAboutFallback) {
    warnedAboutFallback = true;
    console.warn(
      "[encryption] TOKEN_ENCRYPTION_KEY is not set — using the development fallback key. " +
        "Tokens stored now cannot be read by a deployment that sets a real key.",
    );
  }
  return DEV_FALLBACK_KEY;
}

export function encrypt(text: string): string {
  return CryptoJS.AES.encrypt(text, encryptionKey()).toString();
}

export function decrypt(ciphertext: string): string {
  const bytes = CryptoJS.AES.decrypt(ciphertext, encryptionKey());
  return bytes.toString(CryptoJS.enc.Utf8);
}

export function encryptTokens(tokens: {
  accessToken: string;
  refreshToken?: string | null;
}): { accessToken: string; refreshToken: string | null } {
  return {
    accessToken: encrypt(tokens.accessToken),
    refreshToken: tokens.refreshToken ? encrypt(tokens.refreshToken) : null,
  };
}

export function decryptTokens(encrypted: {
  accessToken: string;
  refreshToken?: string | null;
}): { accessToken: string; refreshToken: string | null } {
  return {
    accessToken: decrypt(encrypted.accessToken),
    refreshToken: encrypted.refreshToken ? decrypt(encrypted.refreshToken) : null,
  };
}

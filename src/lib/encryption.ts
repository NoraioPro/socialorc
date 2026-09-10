import CryptoJS from "crypto-js";

const ENCRYPTION_KEY = process.env.TOKEN_ENCRYPTION_KEY || "dev-key-change-in-production";

export function encrypt(text: string): string {
  return CryptoJS.AES.encrypt(text, ENCRYPTION_KEY).toString();
}

export function decrypt(ciphertext: string): string {
  const bytes = CryptoJS.AES.decrypt(ciphertext, ENCRYPTION_KEY);
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

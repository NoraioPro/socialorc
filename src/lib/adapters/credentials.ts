/**
 * Credential validation utilities.
 *
 * Each platform has its own credential shape — OAuth apps need client ID + secret,
 * token-based connectors need bot tokens, etc. This module provides:
 * 1. Shape validators: regex patterns that catch obvious typos before an API call
 * 2. Platform-specific validation: knows which credentials each platform needs
 *
 * The validators are intentionally permissive: they catch clearly invalid formats
 * (e.g. "test" for a Telegram bot token) but accept any string that could be valid.
 * The real platform API is the source of truth.
 */

export type CredentialValidationResult = {
  valid: boolean;
  missing: string[];
  invalid: { key: string; reason: string }[];
};

/**
 * Telegram bot token format: {bot_id}:{alphanumeric_token}
 * e.g., "123456789:ABCdefGHIjklMNOpqrsTUVwxyz-_12345"
 * The bot_id is numeric (typically 8-12 digits), the token part is 35+ alphanumeric + dash/underscore characters.
 * The actual token length can vary slightly (typically 35-50 chars).
 */
export function isValidTelegramBotTokenShape(token: string): boolean {
  // Format: numeric_id:alphanumeric_string
  // The token part is base64url-ish: A-Za-z0-9_-
  // Allow 7-12 digit bot_id and 30-50 char token for flexibility
  const pattern = /^\d{7,12}:[A-Za-z0-9_-]{30,50}$/;
  return pattern.test(token);
}

/**
 * Telegram chat ID: numeric, possibly negative (for groups/channels).
 * e.g., "123456789" or "-1001234567890"
 */
export function isValidTelegramChatIdShape(chatId: string): boolean {
  // Numeric, optionally negative, 1-20 digits
  const pattern = /^-?\d{1,20}$/;
  return pattern.test(chatId);
}

/**
 * OAuth client ID shape — varies by platform but generally alphanumeric.
 * This is a loose check to catch obvious placeholders like "your-client-id".
 */
export function isValidOAuthClientIdShape(clientId: string): boolean {
  // Most OAuth client IDs are at least 10 characters, alphanumeric/dash/underscore
  // LinkedIn: alphanumeric, ~14 chars
  // Twitter: alphanumeric, ~25-30 chars
  // Meta (FB/Instagram): numeric, 15-20 digits
  // Google: numeric with .apps.googleusercontent.com suffix or just alphanumeric
  // TikTok: alphanumeric, ~20 chars
  if (clientId.length < 8) return false;
  if (/^(your|test|fake|placeholder|example)/i.test(clientId)) return false;
  // Allow alphanumeric, dash, underscore, dot, and some special chars for Google
  return /^[A-Za-z0-9._-]+$/.test(clientId);
}

/**
 * OAuth client secret shape — varies by platform but should look like a secret.
 * Catches obvious placeholders.
 */
export function isValidOAuthClientSecretShape(secret: string): boolean {
  if (secret.length < 8) return false;
  if (/^(your|test|fake|placeholder|example|secret)/i.test(secret)) return false;
  // Secrets are typically alphanumeric with some special chars
  return /^[A-Za-z0-9._~!@#$%^&*()\-+=]+$/.test(secret);
}

/**
 * Validate credentials for Telegram adapter.
 */
export function validateTelegramCredentials(): CredentialValidationResult {
  const missing: string[] = [];
  const invalid: { key: string; reason: string }[] = [];

  const botToken = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!botToken) {
    missing.push("TELEGRAM_BOT_TOKEN");
  } else if (!isValidTelegramBotTokenShape(botToken)) {
    invalid.push({
      key: "TELEGRAM_BOT_TOKEN",
      reason: "Invalid format. Expected: {bot_id}:{35-char-token} (e.g., 123456789:ABCdefGHI...)",
    });
  }

  if (!chatId) {
    missing.push("TELEGRAM_CHAT_ID");
  } else if (!isValidTelegramChatIdShape(chatId)) {
    invalid.push({
      key: "TELEGRAM_CHAT_ID",
      reason: "Invalid format. Expected numeric chat ID (e.g., 123456789 or -1001234567890)",
    });
  }

  return {
    valid: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
  };
}

/**
 * Validate credentials for LinkedIn adapter.
 */
export function validateLinkedInCredentials(): CredentialValidationResult {
  const missing: string[] = [];
  const invalid: { key: string; reason: string }[] = [];

  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;

  if (!clientId) {
    missing.push("LINKEDIN_CLIENT_ID");
  } else if (!isValidOAuthClientIdShape(clientId)) {
    invalid.push({
      key: "LINKEDIN_CLIENT_ID",
      reason: "Invalid format. Expected alphanumeric client ID (~14 chars)",
    });
  }

  if (!clientSecret) {
    missing.push("LINKEDIN_CLIENT_SECRET");
  } else if (!isValidOAuthClientSecretShape(clientSecret)) {
    invalid.push({
      key: "LINKEDIN_CLIENT_SECRET",
      reason: "Invalid format. Expected alphanumeric client secret",
    });
  }

  return {
    valid: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
  };
}

/**
 * Validate credentials for Twitter/X adapter.
 */
export function validateTwitterCredentials(): CredentialValidationResult {
  const missing: string[] = [];
  const invalid: { key: string; reason: string }[] = [];

  const clientId = process.env.TWITTER_CLIENT_ID;
  const clientSecret = process.env.TWITTER_CLIENT_SECRET;

  if (!clientId) {
    missing.push("TWITTER_CLIENT_ID");
  } else if (!isValidOAuthClientIdShape(clientId)) {
    invalid.push({
      key: "TWITTER_CLIENT_ID",
      reason: "Invalid format. Expected alphanumeric client ID",
    });
  }

  if (!clientSecret) {
    missing.push("TWITTER_CLIENT_SECRET");
  } else if (!isValidOAuthClientSecretShape(clientSecret)) {
    invalid.push({
      key: "TWITTER_CLIENT_SECRET",
      reason: "Invalid format. Expected alphanumeric client secret",
    });
  }

  return {
    valid: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
  };
}

/**
 * Validate credentials for Instagram adapter.
 */
export function validateInstagramCredentials(): CredentialValidationResult {
  const missing: string[] = [];
  const invalid: { key: string; reason: string }[] = [];

  const appId = process.env.INSTAGRAM_APP_ID;
  const appSecret = process.env.INSTAGRAM_APP_SECRET;

  if (!appId) {
    missing.push("INSTAGRAM_APP_ID");
  } else if (!/^\d{15,20}$/.test(appId)) {
    invalid.push({
      key: "INSTAGRAM_APP_ID",
      reason: "Invalid format. Expected 15-20 digit numeric App ID",
    });
  }

  if (!appSecret) {
    missing.push("INSTAGRAM_APP_SECRET");
  } else if (!isValidOAuthClientSecretShape(appSecret)) {
    invalid.push({
      key: "INSTAGRAM_APP_SECRET",
      reason: "Invalid format. Expected alphanumeric app secret",
    });
  }

  return {
    valid: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
  };
}

/**
 * Validate credentials for Facebook adapter.
 */
export function validateFacebookCredentials(): CredentialValidationResult {
  const missing: string[] = [];
  const invalid: { key: string; reason: string }[] = [];

  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;

  if (!appId) {
    missing.push("FACEBOOK_APP_ID");
  } else if (!/^\d{15,20}$/.test(appId)) {
    invalid.push({
      key: "FACEBOOK_APP_ID",
      reason: "Invalid format. Expected 15-20 digit numeric App ID",
    });
  }

  if (!appSecret) {
    missing.push("FACEBOOK_APP_SECRET");
  } else if (!isValidOAuthClientSecretShape(appSecret)) {
    invalid.push({
      key: "FACEBOOK_APP_SECRET",
      reason: "Invalid format. Expected alphanumeric app secret",
    });
  }

  return {
    valid: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
  };
}

/**
 * Validate credentials for TikTok adapter.
 */
export function validateTikTokCredentials(): CredentialValidationResult {
  const missing: string[] = [];
  const invalid: { key: string; reason: string }[] = [];

  const clientKey = process.env.TIKTOK_CLIENT_KEY;
  const clientSecret = process.env.TIKTOK_CLIENT_SECRET;

  if (!clientKey) {
    missing.push("TIKTOK_CLIENT_KEY");
  } else if (!isValidOAuthClientIdShape(clientKey)) {
    invalid.push({
      key: "TIKTOK_CLIENT_KEY",
      reason: "Invalid format. Expected alphanumeric client key",
    });
  }

  if (!clientSecret) {
    missing.push("TIKTOK_CLIENT_SECRET");
  } else if (!isValidOAuthClientSecretShape(clientSecret)) {
    invalid.push({
      key: "TIKTOK_CLIENT_SECRET",
      reason: "Invalid format. Expected alphanumeric client secret",
    });
  }

  return {
    valid: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
  };
}

/**
 * Validate credentials for YouTube adapter.
 */
export function validateYouTubeCredentials(): CredentialValidationResult {
  const missing: string[] = [];
  const invalid: { key: string; reason: string }[] = [];

  const clientId = process.env.YOUTUBE_CLIENT_ID;
  const clientSecret = process.env.YOUTUBE_CLIENT_SECRET;

  if (!clientId) {
    missing.push("YOUTUBE_CLIENT_ID");
  } else if (!isValidOAuthClientIdShape(clientId)) {
    invalid.push({
      key: "YOUTUBE_CLIENT_ID",
      reason: "Invalid format. Expected alphanumeric client ID",
    });
  }

  if (!clientSecret) {
    missing.push("YOUTUBE_CLIENT_SECRET");
  } else if (!isValidOAuthClientSecretShape(clientSecret)) {
    invalid.push({
      key: "YOUTUBE_CLIENT_SECRET",
      reason: "Invalid format. Expected alphanumeric client secret",
    });
  }

  return {
    valid: missing.length === 0 && invalid.length === 0,
    missing,
    invalid,
  };
}

/**
 * Format credential validation result for display/logging.
 * Never includes actual credential values.
 */
export function formatCredentialError(result: CredentialValidationResult): string {
  const parts: string[] = [];

  if (result.missing.length > 0) {
    parts.push(`Missing: ${result.missing.join(", ")}`);
  }

  if (result.invalid.length > 0) {
    const invalidParts = result.invalid.map((i) => `${i.key} (${i.reason})`);
    parts.push(`Invalid: ${invalidParts.join("; ")}`);
  }

  return parts.join(". ");
}

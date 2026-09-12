import { test, beforeEach, afterEach, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isValidTelegramBotTokenShape,
  isValidTelegramChatIdShape,
  isValidOAuthClientIdShape,
  isValidOAuthClientSecretShape,
  validateTelegramCredentials,
  validateLinkedInCredentials,
  validateTwitterCredentials,
  validateInstagramCredentials,
  validateFacebookCredentials,
  validateTikTokCredentials,
  validateYouTubeCredentials,
  formatCredentialError,
} from "../../src/lib/adapters/credentials";

describe("Telegram token shape validation", () => {
  test("accepts valid Telegram bot token format", () => {
    // Real format: {7-12 digit bot_id}:{30-50 char alphanumeric token}
    assert.equal(isValidTelegramBotTokenShape("123456789:ABCdefGHIjklMNOpqrsTUVwxyz12345"), true);
    assert.equal(isValidTelegramBotTokenShape("1234567:ABCdefGHIjklMNOpqrsTUVwxyz12345678"), true);
    assert.equal(isValidTelegramBotTokenShape("123456789012:ABCdefGHIjklMNOpqrsTUVwxyz1234"), true);
    // Token with dash and underscore
    assert.equal(isValidTelegramBotTokenShape("123456789:ABCdef-GHI_jklMNOpqrsTUVwxyz123"), true);
    // Typical real-world token length (~35 chars)
    assert.equal(isValidTelegramBotTokenShape("7175461256:AAFa8xHPZvLdQ_7FMnOP9RST5uvwxy"), true);
  });

  test("rejects invalid Telegram bot token formats", () => {
    // Too short bot_id (< 7 digits)
    assert.equal(isValidTelegramBotTokenShape("123456:ABCdefGHIjklMNOpqrsTUVwxyz12345678"), false);
    // Too long bot_id (> 12 digits)
    assert.equal(isValidTelegramBotTokenShape("1234567890123:ABCdefGHIjklMNOpqrsTUVwxyz12"), false);
    // Non-numeric bot_id
    assert.equal(isValidTelegramBotTokenShape("abc456789:ABCdefGHIjklMNOpqrsTUVwxyz12345"), false);
    // Missing colon
    assert.equal(isValidTelegramBotTokenShape("123456789ABCdefGHIjklMNOpqrsTUVwxyz12345678"), false);
    // Wrong token length (too short, < 30)
    assert.equal(isValidTelegramBotTokenShape("123456789:ABCdef"), false);
    // Empty string
    assert.equal(isValidTelegramBotTokenShape(""), false);
    // Just a placeholder
    assert.equal(isValidTelegramBotTokenShape("your-bot-token"), false);
    // Invalid characters in token
    assert.equal(isValidTelegramBotTokenShape("123456789:ABCdef@#$%^&*()GHIjklMNOpqrsTUV"), false);
  });
});

describe("Telegram chat ID shape validation", () => {
  test("accepts valid chat ID formats", () => {
    assert.equal(isValidTelegramChatIdShape("123456789"), true);
    assert.equal(isValidTelegramChatIdShape("5896074160"), true);
    assert.equal(isValidTelegramChatIdShape("-1001234567890"), true); // Group/channel
    assert.equal(isValidTelegramChatIdShape("-100123456789"), true);
    assert.equal(isValidTelegramChatIdShape("1"), true);
  });

  test("rejects invalid chat ID formats", () => {
    assert.equal(isValidTelegramChatIdShape(""), false);
    assert.equal(isValidTelegramChatIdShape("abc123"), false);
    assert.equal(isValidTelegramChatIdShape("123abc"), false);
    assert.equal(isValidTelegramChatIdShape("@username"), false);
    assert.equal(isValidTelegramChatIdShape("chat_id"), false);
    assert.equal(isValidTelegramChatIdShape("123.456"), false);
  });
});

describe("OAuth client ID shape validation", () => {
  test("accepts valid OAuth client IDs", () => {
    // LinkedIn-style (alphanumeric, ~14 chars)
    assert.equal(isValidOAuthClientIdShape("77abcdef123456"), true);
    // Twitter-style (longer alphanumeric)
    assert.equal(isValidOAuthClientIdShape("Vj1R5MnUw4cT8lL2KpZxYaBcDefGhI"), true);
    // Google-style (may include dots)
    assert.equal(isValidOAuthClientIdShape("123456789012.apps.googleusercontent.com"), true);
    // TikTok-style
    assert.equal(isValidOAuthClientIdShape("aw1abc2def3ghi4jk"), true);
  });

  test("rejects obviously invalid client IDs", () => {
    // Too short
    assert.equal(isValidOAuthClientIdShape("short"), false);
    assert.equal(isValidOAuthClientIdShape("abc"), false);
    // Placeholder patterns
    assert.equal(isValidOAuthClientIdShape("your-client-id"), false);
    assert.equal(isValidOAuthClientIdShape("test-client-id"), false);
    assert.equal(isValidOAuthClientIdShape("fake_client_id"), false);
    assert.equal(isValidOAuthClientIdShape("placeholder-id"), false);
    assert.equal(isValidOAuthClientIdShape("example_client_id"), false);
    // Empty
    assert.equal(isValidOAuthClientIdShape(""), false);
  });
});

describe("OAuth client secret shape validation", () => {
  test("accepts valid OAuth client secrets", () => {
    assert.equal(isValidOAuthClientSecretShape("aB3dEfGhI9KlMnOpQrStUvWxYz"), true);
    assert.equal(isValidOAuthClientSecretShape("very_secure_secret_123"), true);
    assert.equal(isValidOAuthClientSecretShape("Abc123-_~!@#$%"), true);
  });

  test("rejects obviously invalid client secrets", () => {
    // Too short
    assert.equal(isValidOAuthClientSecretShape("short"), false);
    // Placeholder patterns
    assert.equal(isValidOAuthClientSecretShape("your-secret"), false);
    assert.equal(isValidOAuthClientSecretShape("test_secret_here"), false);
    assert.equal(isValidOAuthClientSecretShape("fake-secret"), false);
    assert.equal(isValidOAuthClientSecretShape("placeholder_secret"), false);
    assert.equal(isValidOAuthClientSecretShape("secret_goes_here"), false);
    // Empty
    assert.equal(isValidOAuthClientSecretShape(""), false);
  });
});

describe("Telegram credential validation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("reports missing when no credentials are set", () => {
    const result = validateTelegramCredentials();
    assert.equal(result.valid, false);
    assert.deepEqual(result.missing.sort(), ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]);
    assert.equal(result.invalid.length, 0);
  });

  test("reports invalid when credentials have wrong format", () => {
    process.env.TELEGRAM_BOT_TOKEN = "invalid-token";
    process.env.TELEGRAM_CHAT_ID = "not-a-number";
    const result = validateTelegramCredentials();
    assert.equal(result.valid, false);
    assert.equal(result.missing.length, 0);
    assert.equal(result.invalid.length, 2);
    assert.ok(result.invalid.some((i) => i.key === "TELEGRAM_BOT_TOKEN"));
    assert.ok(result.invalid.some((i) => i.key === "TELEGRAM_CHAT_ID"));
  });

  test("passes with valid credentials", () => {
    process.env.TELEGRAM_BOT_TOKEN = "123456789:ABCdefGHIjklMNOpqrsTUVwxyz12345";
    process.env.TELEGRAM_CHAT_ID = "5896074160";
    const result = validateTelegramCredentials();
    assert.equal(result.valid, true);
    assert.equal(result.missing.length, 0);
    assert.equal(result.invalid.length, 0);
  });

  test("accepts negative chat IDs for groups/channels", () => {
    process.env.TELEGRAM_BOT_TOKEN = "123456789:ABCdefGHIjklMNOpqrsTUVwxyz12345";
    process.env.TELEGRAM_CHAT_ID = "-1001234567890";
    const result = validateTelegramCredentials();
    assert.equal(result.valid, true);
  });
});

describe("LinkedIn credential validation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.LINKEDIN_CLIENT_ID;
    delete process.env.LINKEDIN_CLIENT_SECRET;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("reports missing when no credentials are set", () => {
    const result = validateLinkedInCredentials();
    assert.equal(result.valid, false);
    assert.deepEqual(result.missing.sort(), ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"]);
  });

  test("passes with valid credentials", () => {
    process.env.LINKEDIN_CLIENT_ID = "77abcdef123456";
    process.env.LINKEDIN_CLIENT_SECRET = "aB3dEfGhI9KlMnOpQrStUvWxYz";
    const result = validateLinkedInCredentials();
    assert.equal(result.valid, true);
  });

  test("rejects placeholder credentials", () => {
    process.env.LINKEDIN_CLIENT_ID = "your-client-id";
    process.env.LINKEDIN_CLIENT_SECRET = "your-client-secret";
    const result = validateLinkedInCredentials();
    assert.equal(result.valid, false);
    assert.equal(result.invalid.length, 2);
  });
});

describe("Twitter credential validation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.TWITTER_CLIENT_ID;
    delete process.env.TWITTER_CLIENT_SECRET;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("reports missing when no credentials are set", () => {
    const result = validateTwitterCredentials();
    assert.equal(result.valid, false);
    assert.deepEqual(result.missing.sort(), ["TWITTER_CLIENT_ID", "TWITTER_CLIENT_SECRET"]);
  });

  test("passes with valid credentials", () => {
    process.env.TWITTER_CLIENT_ID = "Vj1R5MnUw4cT8lL2KpZxYaBcDef";
    process.env.TWITTER_CLIENT_SECRET = "aB3dEfGhI9KlMnOpQrStUvWxYz";
    const result = validateTwitterCredentials();
    assert.equal(result.valid, true);
  });
});

describe("Instagram credential validation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.INSTAGRAM_APP_ID;
    delete process.env.INSTAGRAM_APP_SECRET;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("reports missing when no credentials are set", () => {
    const result = validateInstagramCredentials();
    assert.equal(result.valid, false);
    assert.deepEqual(result.missing.sort(), ["INSTAGRAM_APP_ID", "INSTAGRAM_APP_SECRET"]);
  });

  test("passes with valid credentials (Meta numeric App ID)", () => {
    process.env.INSTAGRAM_APP_ID = "123456789012345678";
    process.env.INSTAGRAM_APP_SECRET = "aB3dEfGhI9KlMnOpQrStUvWxYz";
    const result = validateInstagramCredentials();
    assert.equal(result.valid, true);
  });

  test("rejects non-numeric App ID", () => {
    process.env.INSTAGRAM_APP_ID = "not-a-number";
    process.env.INSTAGRAM_APP_SECRET = "aB3dEfGhI9KlMnOpQrStUvWxYz";
    const result = validateInstagramCredentials();
    assert.equal(result.valid, false);
    assert.equal(result.invalid.length, 1);
    assert.equal(result.invalid[0].key, "INSTAGRAM_APP_ID");
  });
});

describe("Facebook credential validation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.FACEBOOK_APP_ID;
    delete process.env.FACEBOOK_APP_SECRET;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("reports missing when no credentials are set", () => {
    const result = validateFacebookCredentials();
    assert.equal(result.valid, false);
    assert.deepEqual(result.missing.sort(), ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"]);
  });

  test("passes with valid credentials (Meta numeric App ID)", () => {
    process.env.FACEBOOK_APP_ID = "123456789012345678";
    process.env.FACEBOOK_APP_SECRET = "aB3dEfGhI9KlMnOpQrStUvWxYz";
    const result = validateFacebookCredentials();
    assert.equal(result.valid, true);
  });
});

describe("TikTok credential validation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.TIKTOK_CLIENT_KEY;
    delete process.env.TIKTOK_CLIENT_SECRET;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("reports missing when no credentials are set", () => {
    const result = validateTikTokCredentials();
    assert.equal(result.valid, false);
    assert.deepEqual(result.missing.sort(), ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"]);
  });

  test("passes with valid credentials", () => {
    process.env.TIKTOK_CLIENT_KEY = "aw1abc2def3ghi4jk";
    process.env.TIKTOK_CLIENT_SECRET = "aB3dEfGhI9KlMnOpQrStUvWxYz";
    const result = validateTikTokCredentials();
    assert.equal(result.valid, true);
  });
});

describe("YouTube credential validation", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.YOUTUBE_CLIENT_ID;
    delete process.env.YOUTUBE_CLIENT_SECRET;
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  test("reports missing when no credentials are set", () => {
    const result = validateYouTubeCredentials();
    assert.equal(result.valid, false);
    assert.deepEqual(result.missing.sort(), ["YOUTUBE_CLIENT_ID", "YOUTUBE_CLIENT_SECRET"]);
  });

  test("passes with valid credentials (Google-style)", () => {
    process.env.YOUTUBE_CLIENT_ID = "123456789012.apps.googleusercontent.com";
    process.env.YOUTUBE_CLIENT_SECRET = "GOCSPX-aB3dEfGhI9KlMnOp";
    const result = validateYouTubeCredentials();
    assert.equal(result.valid, true);
  });
});

describe("formatCredentialError", () => {
  test("formats missing credentials", () => {
    const result = {
      valid: false,
      missing: ["VAR_A", "VAR_B"],
      invalid: [],
    };
    const text = formatCredentialError(result);
    assert.ok(text.includes("Missing: VAR_A, VAR_B"));
  });

  test("formats invalid credentials", () => {
    const result = {
      valid: false,
      missing: [],
      invalid: [{ key: "VAR_A", reason: "bad format" }],
    };
    const text = formatCredentialError(result);
    assert.ok(text.includes("Invalid: VAR_A (bad format)"));
  });

  test("formats both missing and invalid", () => {
    const result = {
      valid: false,
      missing: ["VAR_A"],
      invalid: [{ key: "VAR_B", reason: "bad format" }],
    };
    const text = formatCredentialError(result);
    assert.ok(text.includes("Missing: VAR_A"));
    assert.ok(text.includes("Invalid: VAR_B (bad format)"));
  });
});

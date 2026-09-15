import { test } from "node:test";
import assert from "node:assert/strict";
import { telegramAdapter } from "../../src/lib/adapters/telegram";
import { validateTelegramCredentials } from "../../src/lib/adapters/credentials";
import type { PostOptions } from "../../src/types/platform";

/**
 * Telegram readiness.
 *
 * Telegram is the one connector that needs no OAuth and no platform review - a
 * bot token and a chat id are the whole credential set - so it is the first
 * platform that can go live. These tests exercise the real adapter against a
 * stubbed Telegram API to prove the publish path is correct before a token
 * exists, rather than discovering it afterwards.
 *
 * The rule they most protect: an attached video must be refused outright. It must
 * never be sent as a photo, and never silently dropped so the post goes out as
 * text-only.
 */

const realFetch = globalThis.fetch;
const BOT_TOKEN = "123456789:AAFakeTokenForUnitTestsOnly_0000000000";

interface Call {
  url: string;
  body: Record<string, unknown> | null;
}

function stubFetch(options: { ok?: boolean; result?: boolean } = {}): Call[] {
  const calls: Call[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    let body: Record<string, unknown> | null = null;
    if (typeof init?.body === "string") {
      try {
        body = JSON.parse(init.body) as Record<string, unknown>;
      } catch {
        body = null;
      }
    }
    calls.push({ url, body });

    if (url.includes("/getMe")) {
      return new Response(
        JSON.stringify({
          ok: true,
          result: { id: 123456789, username: "socialorc_bot", first_name: "SocialOrc" },
        }),
        { status: 200 },
      );
    }

    if (url.includes("/sendMessage") || url.includes("/sendPhoto")) {
      const ok = options.ok ?? true;
      const withResult = options.result ?? true;
      return new Response(
        JSON.stringify(
          ok
            ? withResult
              ? { ok: true, result: { message_id: 42, chat: { username: "my_channel" } } }
              : { ok: true }
            : { ok: false, description: "Bad Request: chat not found" },
        ),
        { status: ok ? 200 : 400 },
      );
    }

    return new Response("unexpected request", { status: 500 });
  }) as typeof fetch;

  return calls;
}

function withEnv(values: Record<string, string | undefined>, fn: () => void) {
  const env = process.env as Record<string, string | undefined>;
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(values)) saved[key] = env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
  }
}

const withChat = {
  text: "Hello from SocialOrc",
  additionalOptions: { chatId: "-1001234567890" },
} as unknown as PostOptions;

test("a text post goes to sendMessage with the configured chat", async () => {
  const calls = stubFetch();
  try {
    const result = await telegramAdapter.createPost(BOT_TOKEN, withChat);

    assert.equal(result.success, true);
    assert.equal(result.platformPostId, "42");
    assert.equal(result.platformPostUrl, "https://t.me/my_channel/42");

    const sent = calls.find((c) => c.url.includes("/sendMessage"));
    assert.ok(sent, "expected a sendMessage call");
    assert.equal(sent.body?.chat_id, "-1001234567890");
    assert.equal(sent.body?.text, "Hello from SocialOrc");
    assert.equal(calls.some((c) => c.url.includes("/sendPhoto")), false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a single image goes to sendPhoto, not sendMessage", async () => {
  const calls = stubFetch();
  try {
    const result = await telegramAdapter.createPost(BOT_TOKEN, {
      text: "With a picture",
      mediaUrls: ["https://cdn.example.invalid/shot.png"],
      additionalOptions: { chatId: "-1001234567890" },
    } as unknown as PostOptions);

    assert.equal(result.success, true);
    const photo = calls.find((c) => c.url.includes("/sendPhoto"));
    assert.ok(photo, "expected a sendPhoto call");
    assert.equal(photo.body?.photo, "https://cdn.example.invalid/shot.png");
    assert.equal(photo.body?.caption, "With a picture");
    assert.equal(calls.some((c) => c.url.includes("/sendMessage")), false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("an attached video is refused and NOTHING is sent", async () => {
  const calls = stubFetch();
  try {
    const result = await telegramAdapter.createPost(BOT_TOKEN, {
      text: "A clip",
      mediaUrls: ["https://cdn.example.invalid/clip.mp4"],
      additionalOptions: { chatId: "-1001234567890" },
    } as unknown as PostOptions);

    assert.equal(result.success, false);
    assert.equal(result.code, "UNSUPPORTED_MEDIA");
    assert.equal(
      calls.length,
      0,
      "a refused video must not become a photo, and must not go out as text-only",
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a bot token with no chat id is refused before any request", async () => {
  const calls = stubFetch();
  try {
    await withEnv({ TELEGRAM_CHAT_ID: undefined }, async () => {
      const result = await telegramAdapter.createPost(BOT_TOKEN, {
        text: "Nowhere to send this",
      } as unknown as PostOptions);
      assert.equal(result.success, false);
      assert.match(result.error ?? "", /TELEGRAM_CHAT_ID|chat/i);
      assert.equal(calls.length, 0);
    });
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a failure from Telegram is never reported as a publish", async () => {
  stubFetch({ ok: false });
  try {
    const result = await telegramAdapter.createPost(BOT_TOKEN, withChat);
    assert.equal(result.success, false);
    assert.match(result.error ?? "", /chat not found/);
    assert.equal(result.platformPostId, undefined);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("an ok response with no result is not a publish either", async () => {
  stubFetch({ result: false });
  try {
    const result = await telegramAdapter.createPost(BOT_TOKEN, withChat);
    assert.equal(result.success, false);
    assert.equal(result.platformPostId, undefined);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("the bot token must match Telegram's shape, and the chat id must be numeric", () => {
  withEnv(
    { TELEGRAM_BOT_TOKEN: "not-a-token", TELEGRAM_CHAT_ID: "my-channel-name" },
    () => {
      const result = validateTelegramCredentials();
      assert.equal(result.valid, false);
      assert.ok(result.invalid.length > 0, "a malformed token must be reported");
    },
  );

  withEnv(
    { TELEGRAM_BOT_TOKEN: "123456789:AAFakeTokenForUnitTestsOnly_0000000000", TELEGRAM_CHAT_ID: "-1001234567890" },
    () => {
      assert.equal(validateTelegramCredentials().valid, true);
    },
  );
});

test("missing Telegram credentials are reported by name", () => {
  withEnv({ TELEGRAM_BOT_TOKEN: undefined, TELEGRAM_CHAT_ID: undefined }, () => {
    const result = validateTelegramCredentials();
    assert.equal(result.valid, false);
    assert.deepEqual(result.missing, ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"]);
  });
});

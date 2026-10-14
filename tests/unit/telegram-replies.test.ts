/**
 * Telegram reply reads across tenants.
 *
 * One SocialOrc bot serves every tenant, and its getUpdates queue is shared by
 * every chat the bot is in. Two bugs lived here:
 *
 *   1. Replies were matched on `reply_to_message.message_id` alone. Message ids
 *      are only unique per chat, so tenant B saw tenant A's replies whenever
 *      their two posts happened to carry the same message id.
 *   2. Reading with an offset CONFIRMS every update below it for the whole bot,
 *      so reading tenant A's replies destroyed tenant B's — Telegram never
 *      returns a confirmed update again.
 *
 * The adapter now drains the queue into a per-chat store and answers from it.
 * fetch is stubbed; nothing here talks to Telegram or to a database.
 */

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { TelegramAdapter } from "../../src/lib/adapters/telegram";
import {
  MemoryTelegramReplyStore,
  botIdFromToken,
} from "../../src/lib/adapters/telegram-replies";

const TOKEN = "123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const CHAT_A = "-1001111111111";
const CHAT_B = "-1002222222222";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

interface Update {
  update_id: number;
  message?: Record<string, unknown>;
}

/**
 * A fake Telegram queue with the real semantics: getUpdates returns pending
 * updates at or above `offset`, and an offset confirms (deletes) everything
 * below it.
 */
function fakeTelegram(initial: Update[]) {
  let pending = [...initial];
  const requests: Array<Record<string, unknown>> = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    assert.match(url, /\/getUpdates$/, `unexpected call ${url}`);
    const body = JSON.parse(String(init?.body ?? "{}")) as { offset?: number; limit?: number };
    requests.push(body);
    if (typeof body.offset === "number") {
      const offset = body.offset;
      pending = pending.filter((u) => u.update_id >= offset);
    }
    const result = pending.slice(0, body.limit ?? 100);
    return new Response(JSON.stringify({ ok: true, result }), { status: 200 });
  }) as typeof fetch;

  return {
    requests,
    push(update: Update) {
      pending.push(update);
    },
    get pending() {
      return pending;
    },
  };
}

function reply(updateId: number, chatId: string, messageId: number, replyTo: number, text: string): Update {
  return {
    update_id: updateId,
    message: {
      message_id: messageId,
      date: 1_760_000_000 + updateId,
      text,
      chat: { id: Number(chatId) },
      from: { id: 900 + updateId, first_name: `user${updateId}` },
      reply_to_message: { message_id: replyTo },
    },
  };
}

test("a reply in another chat to the same message id is never shown", async () => {
  // Both tenants published a post that got message id 42 in their own chat.
  fakeTelegram([
    reply(1, CHAT_A, 100, 42, "for tenant A"),
    reply(2, CHAT_B, 200, 42, "for tenant B"),
  ]);
  const adapter = new TelegramAdapter({ replyStore: new MemoryTelegramReplyStore() });

  const a = await adapter.listComments(TOKEN, {
    platformPostId: "42",
    additionalOptions: { chatId: CHAT_A },
  });
  assert.equal(a.success, true);
  assert.deepEqual(a.items?.map((c) => c.text), ["for tenant A"]);

  const b = await adapter.listComments(TOKEN, {
    platformPostId: "42",
    additionalOptions: { chatId: CHAT_B },
  });
  assert.deepEqual(b.items?.map((c) => c.text), ["for tenant B"]);
});

test("reading one tenant's replies does not lose another tenant's", async () => {
  const telegram = fakeTelegram([
    reply(10, CHAT_A, 100, 42, "A1"),
    reply(11, CHAT_B, 300, 7, "B1"),
  ]);
  const store = new MemoryTelegramReplyStore();
  const adapter = new TelegramAdapter({ replyStore: store });

  // Tenant A reads first. Its drain confirms both updates on Telegram's side...
  await adapter.listComments(TOKEN, { platformPostId: "42", additionalOptions: { chatId: CHAT_A } });
  // ...a later read passes an offset past them, so Telegram has forgotten B1:
  await adapter.listComments(TOKEN, { platformPostId: "42", additionalOptions: { chatId: CHAT_A } });
  assert.equal(telegram.pending.length, 0, "Telegram has confirmed and dropped both updates");

  // ...and tenant B still sees its reply, because it was persisted per chat.
  const b = await adapter.listComments(TOKEN, {
    platformPostId: "7",
    additionalOptions: { chatId: CHAT_B },
  });
  assert.deepEqual(b.items?.map((c) => c.text), ["B1"]);
});

test("the confirm offset only advances past what was stored", async () => {
  const telegram = fakeTelegram([reply(50, CHAT_A, 1, 42, "x"), { update_id: 51 }]);
  const store = new MemoryTelegramReplyStore();
  const adapter = new TelegramAdapter({ replyStore: store });

  await adapter.listComments(TOKEN, { platformPostId: "42", additionalOptions: { chatId: CHAT_A } });

  // First call has no offset (nothing stored yet), so nothing is confirmed by it.
  assert.equal(telegram.requests[0].offset, undefined);
  assert.equal(await store.getOffset(botIdFromToken(TOKEN)), 52);
  assert.ok(store.replies.has(50), "the reply was stored before its offset was recorded");

  telegram.push(reply(52, CHAT_A, 2, 42, "y"));
  const second = await adapter.listComments(TOKEN, {
    platformPostId: "42",
    additionalOptions: { chatId: CHAT_A },
  });
  assert.equal(telegram.requests.at(-1)?.offset, 52);
  assert.deepEqual(second.items?.map((c) => c.text), ["x", "y"]);
});

test("a failed store write does not advance the offset (nothing is lost)", async () => {
  fakeTelegram([reply(5, CHAT_A, 1, 42, "keep me")]);
  const store = new MemoryTelegramReplyStore();
  store.saveReplies = async () => {
    throw new Error("database down");
  };
  const adapter = new TelegramAdapter({ replyStore: store });

  await assert.rejects(
    adapter.listComments(TOKEN, { platformPostId: "42", additionalOptions: { chatId: CHAT_A } }),
    /database down/,
  );
  assert.equal(await store.getOffset(botIdFromToken(TOKEN)), null);
});

test("pagination walks this chat's replies only", async () => {
  fakeTelegram([
    reply(1, CHAT_A, 11, 42, "a1"),
    reply(2, CHAT_B, 12, 42, "b1"),
    reply(3, CHAT_A, 13, 42, "a2"),
    reply(4, CHAT_A, 14, 42, "a3"),
  ]);
  const adapter = new TelegramAdapter({ replyStore: new MemoryTelegramReplyStore() });
  const opts = { platformPostId: "42", additionalOptions: { chatId: CHAT_A }, limit: 2 };

  const page1 = await adapter.listComments(TOKEN, opts);
  assert.deepEqual(page1.items?.map((c) => c.text), ["a1", "a2"]);
  assert.equal(page1.nextCursor, "2");

  const page2 = await adapter.listComments(TOKEN, { ...opts, cursor: page1.nextCursor! });
  assert.deepEqual(page2.items?.map((c) => c.text), ["a3"]);
  assert.equal(page2.nextCursor, null);
});

test("no chat id is refused before Telegram is called", async () => {
  let called = false;
  globalThis.fetch = (async () => {
    called = true;
    return new Response("{}");
  }) as typeof fetch;
  const adapter = new TelegramAdapter({ replyStore: new MemoryTelegramReplyStore() });
  const result = await adapter.listComments(TOKEN, { platformPostId: "42" });
  assert.equal(result.success, false);
  assert.equal(called, false);
});

test("a getUpdates failure is reported, not turned into an empty list", async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ ok: false, description: "Conflict: can't use getUpdates method while webhook is active" }), {
      status: 409,
    })) as typeof fetch;
  const adapter = new TelegramAdapter({ replyStore: new MemoryTelegramReplyStore() });
  const result = await adapter.listComments(TOKEN, {
    platformPostId: "42",
    additionalOptions: { chatId: CHAT_A },
  });
  assert.equal(result.success, false);
  assert.match(result.error ?? "", /webhook/);
});

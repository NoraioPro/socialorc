/**
 * Connecting a Telegram chat requires proof of control: a one-time code the
 * server issued to this user, posted in the chat, and noticed by the bot's own
 * update drain. These pin the pieces that do not need a database or a session:
 * the code format, where the drain records a code, and the per-chat account key.
 * The routes' cookie and env-fallback rules are pinned in oauth-state-signing.
 */

import assert from "node:assert/strict";
import { afterEach, describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import { cpSync, mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

import { TelegramAdapter } from "../../src/lib/adapters/telegram";
import { MemoryTelegramReplyStore } from "../../src/lib/adapters/telegram-replies";
import {
  extractConnectCodes,
  generateConnectCode,
  hashConnectCode,
  isConnectCodeShape,
  telegramAccountId,
} from "../../src/lib/adapters/telegram-connect-code";
import { requiresAdminProof } from "../../src/lib/social/telegram-connect";

const TOKEN = "123456789:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA";
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe("connect codes", () => {
  it("are random, well-formed and never repeat in practice", () => {
    const codes = new Set(Array.from({ length: 200 }, generateConnectCode));
    assert.equal(codes.size, 200);
    for (const code of codes) assert.ok(isConnectCodeShape(code), code);
  });

  it("are found however Telegram delivers them", () => {
    const code = generateConnectCode();
    assert.deepEqual(extractConnectCodes(`/start ${code}`), [code]);
    assert.deepEqual(extractConnectCodes(`/connect@socialorc_bot ${code}`), [code]);
    assert.deepEqual(extractConnectCodes(`please connect: ${code.toLowerCase()}!`), [code]);
    assert.deepEqual(extractConnectCodes(`X${code}`), [], "must not match inside a longer token");
    assert.deepEqual(extractConnectCodes(`${code}9`), []);
    assert.deepEqual(extractConnectCodes(undefined), []);
  });

  it("hash case-insensitively, so what the drain sees matches what was issued", () => {
    const code = generateConnectCode();
    assert.equal(hashConnectCode(code), hashConnectCode(code.toLowerCase()));
    assert.notEqual(hashConnectCode(code), hashConnectCode(generateConnectCode()));
    assert.ok(!hashConnectCode(code).includes(code));
  });
});

describe("accounts are per chat", () => {
  it("two chats through one bot are two accounts", () => {
    assert.notEqual(telegramAccountId("123", "-1001"), telegramAccountId("123", "-1002"));
    assert.equal(telegramAccountId("123", "-1001"), "123:-1001");
  });

  it("group posters must prove they are admins; private chats and channels prove it by posting", () => {
    assert.equal(requiresAdminProof("group"), true);
    assert.equal(requiresAdminProof("supergroup"), true);
    assert.equal(requiresAdminProof("private"), false);
    assert.equal(requiresAdminProof("channel"), false);
  });
});

describe("the update drain records where a code was posted", () => {
  function fakeQueue(updates: unknown[]) {
    const bodies: Array<Record<string, unknown>> = [];
    let pending = [...updates] as { update_id: number }[];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      assert.match(String(input), /\/getUpdates$/);
      const body = JSON.parse(String(init?.body ?? "{}")) as { offset?: number };
      bodies.push(body);
      if (typeof body.offset === "number") pending = pending.filter((u) => u.update_id >= body.offset!);
      return new Response(JSON.stringify({ ok: true, result: pending }), { status: 200 });
    }) as typeof fetch;
    return bodies;
  }

  it("binds a live code to the FIRST chat it appears in, including channel posts", async () => {
    const mine = generateConnectCode();
    const channelCode = generateConnectCode();
    const stranger = generateConnectCode(); // never issued: ignored
    const bodies = fakeQueue([
      { update_id: 1, message: { message_id: 1, date: 1, text: `/connect@bot ${mine}`, chat: { id: -100111, type: "supergroup" }, from: { id: 5 } } },
      // Somebody who saw the code reposts it in their own chat: too late.
      { update_id: 2, message: { message_id: 2, date: 2, text: mine, chat: { id: -100999, type: "group" }, from: { id: 6 } } },
      { update_id: 3, channel_post: { message_id: 3, date: 3, text: channelCode, chat: { id: -100222, type: "channel" } } },
      { update_id: 4, message: { message_id: 4, date: 4, text: stranger, chat: { id: 77, type: "private" }, from: { id: 77 } } },
      // An ordinary reply in the same batch is still stored as before.
      { update_id: 5, message: { message_id: 9, date: 5, text: "nice post", chat: { id: -100111, type: "supergroup" }, from: { id: 8 }, reply_to_message: { message_id: 42 } } },
    ]);
    const store = new MemoryTelegramReplyStore();
    store.liveCodes.add(hashConnectCode(mine));
    store.liveCodes.add(hashConnectCode(channelCode));
    const adapter = new TelegramAdapter({ replyStore: store });

    const drained = await adapter.drainUpdates(TOKEN);
    assert.deepEqual(drained, { ok: true, drained: 5 });
    assert.deepEqual((bodies[0].allowed_updates as string[]).sort(), ["channel_post", "message"]);

    assert.deepEqual(store.codeSightings.get(hashConnectCode(mine)), {
      codeHash: hashConnectCode(mine),
      chatId: "-100111",
      chatType: "supergroup",
      authorId: "5",
    });
    assert.deepEqual(store.codeSightings.get(hashConnectCode(channelCode)), {
      codeHash: hashConnectCode(channelCode),
      chatId: "-100222",
      chatType: "channel",
      authorId: null,
    });
    assert.equal(store.codeSightings.has(hashConnectCode(stranger)), false);
    assert.equal(store.replies.size, 1, "replies are still persisted per chat");
    assert.equal(store.offsets.get("123456789"), 6, "the offset still advances past the batch");
  });
});

describe("existing Telegram accounts are re-keyed per chat", () => {
  it("the sqlite data migration appends the stored chat id, once", () => {
    const ROOT = path.resolve(__dirname, "..", "..");
    const MIGRATION = "20261015130000_telegram_chat_accounts";
    const dir = mkdtempSync(path.join(tmpdir(), "telegram-rekey-"));
    try {
      const migrations = path.join(dir, "migrations");
      mkdirSync(migrations);
      cpSync(path.join(ROOT, "prisma/migrations/migration_lock.toml"), path.join(migrations, "migration_lock.toml"));
      for (const d of readdirSync(path.join(ROOT, "prisma/migrations")).filter((d) => /^\d/.test(d) && d < MIGRATION)) {
        cpSync(path.join(ROOT, "prisma/migrations", d), path.join(migrations, d), { recursive: true });
      }
      const config = path.join(dir, "prisma.config.ts");
      writeFileSync(
        config,
        `export default { schema: ${JSON.stringify(path.join(ROOT, "prisma/schema.prisma"))}, ` +
          `migrations: { path: ${JSON.stringify(migrations)} }, datasource: { url: process.env.DATABASE_URL } };\n`,
      );
      const file = path.join(dir, "t.db");
      const deploy = spawnSync("npx", ["prisma", "migrate", "deploy", "--config", config], {
        cwd: ROOT,
        env: { ...process.env, DATABASE_URL: `file:${file}` },
        encoding: "utf8",
      });
      assert.equal(deploy.status, 0, `${deploy.stdout}\n${deploy.stderr}`);

      const Database = createRequire(__filename)("better-sqlite3") as new (f: string) => {
        exec(sql: string): void;
        prepare(sql: string): { run(...p: unknown[]): unknown; all(...p: unknown[]): unknown[] };
        close(): void;
      };
      const db = new Database(file);
      db.exec(`INSERT INTO "User" ("id", "email", "updatedAt") VALUES ('u1', 'u1@x.test', CURRENT_TIMESTAMP)`);
      const add = db.prepare(
        `INSERT INTO "SocialAccount" ("id", "userId", "platform", "platformUserId", "accessToken", "metadata", "updatedAt") VALUES (?, 'u1', ?, ?, 'x', ?, CURRENT_TIMESTAMP)`,
      );
      add.run("tg", "TELEGRAM", "7001", JSON.stringify({ chatId: "-1001234", isBot: true }));
      add.run("tgmock", "TELEGRAM", "mock_ws_brain_telegram", JSON.stringify({ isMock: true }));
      add.run("x", "TWITTER", "999", JSON.stringify({ chatId: "nope" }));

      const sql = readFileSync(path.join(ROOT, "prisma/migrations", MIGRATION, "migration.sql"), "utf8");
      const dataStep = sql.slice(sql.indexOf('UPDATE "SocialAccount"'));
      db.exec(sql);
      db.exec(dataStep); // idempotent
      const rows = db.prepare(`SELECT "id", "platformUserId" FROM "SocialAccount" ORDER BY "id"`).all();
      assert.deepEqual(rows, [
        { id: "tg", platformUserId: "7001:-1001234" },
        { id: "tgmock", platformUserId: "mock_ws_brain_telegram" },
        { id: "x", platformUserId: "999" },
      ]);
      db.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

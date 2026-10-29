import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  isDefiniteMembershipError,
  verifyTelegramDestination,
  type MemberLookup,
} from "../../src/lib/adapters/telegram-destination";
import { destinationForAccount } from "../../src/lib/adapters/destination";

/** Pre-send re-check of a connected Telegram chat. */

const member = (status: string, extra: Record<string, boolean> = {}): MemberLookup => ({
  ok: true,
  member: { status, ...extra },
});
const lookupFrom = (answers: Record<string, MemberLookup>) => async (userId: string) =>
  answers[userId] ?? ({ ok: false, definite: false, error: "unreachable" } as MemberLookup);

const group = { chatId: "-100", chatType: "supergroup", botId: "99", connectedBy: "7" };

describe("verifyTelegramDestination", () => {
  it("passes when the bot is present and the connecting user is still an admin", async () => {
    const v = await verifyTelegramDestination(group, lookupFrom({ "99": member("member"), "7": member("administrator") }));
    assert.deepEqual(v, { ok: true });
  });

  it("blocks when the connecting user is no longer an admin", async () => {
    const v = await verifyTelegramDestination(group, lookupFrom({ "99": member("member"), "7": member("member") }));
    assert.equal(v.ok, false);
  });

  it("blocks when the connecting user has left the chat (definite answer)", async () => {
    const v = await verifyTelegramDestination(
      group,
      lookupFrom({ "99": member("member"), "7": { ok: false, definite: true, error: "user not found" } }),
    );
    assert.equal(v.ok, false);
  });

  it("blocks when the bot was removed or kicked", async () => {
    for (const status of ["left", "kicked"]) {
      const v = await verifyTelegramDestination(group, lookupFrom({ "99": member(status), "7": member("creator") }));
      assert.equal(v.ok, false, status);
    }
  });

  it("blocks when the bot lookup definitively says the chat is gone", async () => {
    const v = await verifyTelegramDestination(
      group,
      lookupFrom({ "99": { ok: false, definite: true, error: "chat not found" } }),
    );
    assert.equal(v.ok, false);
  });

  it("in a channel the bot must still be an admin that can post", async () => {
    const channel = { chatId: "-100", chatType: "channel", botId: "99" };
    assert.deepEqual(
      await verifyTelegramDestination(channel, lookupFrom({ "99": member("administrator", { canPostMessages: true }) })),
      { ok: true },
    );
    assert.equal((await verifyTelegramDestination(channel, lookupFrom({ "99": member("member") }))).ok, false);
    assert.equal(
      (await verifyTelegramDestination(channel, lookupFrom({ "99": member("administrator", { canPostMessages: false }) }))).ok,
      false,
    );
  });

  it("a Telegram outage is unknown, never a verdict (the send is allowed to try)", async () => {
    const v = await verifyTelegramDestination(group, lookupFrom({}));
    assert.deepEqual(v, { ok: "unknown" });
  });

  it("connections with nothing recorded, and private chats, are not checked", async () => {
    const never = async () => {
      throw new Error("must not be called");
    };
    assert.deepEqual(await verifyTelegramDestination({ chatId: "1" }, never), { ok: true });
    assert.deepEqual(await verifyTelegramDestination({ chatId: "1", chatType: "private", botId: "9" }, never), { ok: true });
  });

  it("skips the author check when no connecting user was recorded (channels)", async () => {
    const seen: string[] = [];
    const v = await verifyTelegramDestination(
      { chatId: "-100", chatType: "supergroup", botId: "99" },
      async (id) => {
        seen.push(id);
        return member("member");
      },
    );
    assert.deepEqual(v, { ok: true });
    assert.deepEqual(seen, ["99"]);
  });
});

describe("isDefiniteMembershipError", () => {
  it("treats chat/user not found and kicked as verdicts", () => {
    assert.equal(isDefiniteMembershipError(400, "Bad Request: chat not found"), true);
    assert.equal(isDefiniteMembershipError(400, "Bad Request: user not found"), true);
    assert.equal(isDefiniteMembershipError(403, "Forbidden: bot was kicked from the supergroup chat"), true);
  });
  it("does not treat a bad token, rate limit or server error as a verdict", () => {
    assert.equal(isDefiniteMembershipError(401, "Unauthorized"), false);
    assert.equal(isDefiniteMembershipError(429, "Too Many Requests"), false);
    assert.equal(isDefiniteMembershipError(502, "Bad Gateway"), false);
  });
});

describe("destinationForAccount carries the facts the re-check needs", () => {
  it("includes chatType, botId and connectedBy when recorded", () => {
    assert.deepEqual(
      destinationForAccount({ chatId: "-100", chatType: "supergroup", botId: 99, connectedBy: "7", chatTitle: "x" }),
      { chatId: "-100", chatType: "supergroup", botId: "99", connectedBy: "7" },
    );
  });
});

describe("wiring", () => {
  it("the adapter verifies the destination before it sends", () => {
    const src = fs.readFileSync("src/lib/adapters/telegram.ts", "utf8");
    const create = src.slice(src.indexOf("async createPost"));
    assert.ok(create.indexOf("verifyTelegramDestination(") > 0);
    assert.ok(create.indexOf("verifyTelegramDestination(") < create.indexOf("sendPhoto"));
    assert.match(create, /code: "PERMISSION_DENIED"/);
  });

  it("the connect route records who connected the chat", () => {
    assert.match(fs.readFileSync("src/app/api/social/telegram/connect/route.ts", "utf8"), /connectedBy: row\.authorId/);
  });

  it("the deployment's TELEGRAM_CHAT_ID is never offered to users", () => {
    const route = fs.readFileSync("src/app/api/social/telegram/connect/code/route.ts", "utf8");
    assert.equal(/process\.env\.TELEGRAM_CHAT_ID/.test(route), false);
    assert.equal(/suggestedChatId/.test(route.replace(/\/\*[\s\S]*?\*\//g, "")), false);
    assert.equal(/suggestedChatId/.test(fs.readFileSync("src/components/settings/telegram-connect-dialog.tsx", "utf8")), false);
  });
});

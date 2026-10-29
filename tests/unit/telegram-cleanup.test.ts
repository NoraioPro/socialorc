import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  CLEANUP_BATCH_SIZE,
  CLEANUP_MAX_BATCHES,
  TELEGRAM_CODE_RETENTION_DAYS,
  TELEGRAM_REPLY_RETENTION_DAYS,
  isCleanupTick,
  purgeStaleTelegramData,
  type TelegramCleanupClient,
} from "../../src/lib/jobs/telegram-cleanup";

/** Bounded, verifiable cleanup of the shared bot's stored Telegram data. */

const DAY = 24 * 60 * 60 * 1000;
const now = new Date("2026-10-29T12:00:00Z");

/** An in-memory table honouring the where/order/take/deleteMany the job uses. */
function fakeClient(replyAgesDays: number[], codeAgesPastExpiryDays: number[]) {
  const replies = replyAgesDays.map((age, i) => ({ id: `r${i}`, createdAt: new Date(now.getTime() - age * DAY) }));
  const codes = codeAgesPastExpiryDays.map((age, i) => ({ id: `c${i}`, expiresAt: new Date(now.getTime() - age * DAY) }));
  let deleteCalls = 0;
  const client: TelegramCleanupClient = {
    telegramReply: {
      async findMany({ where, take }) {
        return replies.filter((r) => r.createdAt < where.createdAt.lt).sort((a, b) => +a.createdAt - +b.createdAt).slice(0, take).map((r) => ({ id: r.id }));
      },
      async deleteMany({ where }) {
        deleteCalls++;
        let count = 0;
        for (const id of where.id.in) {
          const i = replies.findIndex((r) => r.id === id);
          if (i >= 0) { replies.splice(i, 1); count++; }
        }
        return { count };
      },
    },
    telegramConnectCode: {
      async findMany({ where, take }) {
        return codes.filter((c) => c.expiresAt < where.expiresAt.lt).slice(0, take).map((c) => ({ id: c.id }));
      },
      async deleteMany({ where }) {
        deleteCalls++;
        let count = 0;
        for (const id of where.id.in) {
          const i = codes.findIndex((c) => c.id === id);
          if (i >= 0) { codes.splice(i, 1); count++; }
        }
        return { count };
      },
    },
  };
  return { client, replies, codes, calls: () => deleteCalls };
}

describe("purgeStaleTelegramData", () => {
  it("deletes only replies older than the retention window", async () => {
    const t = fakeClient([1, 29, TELEGRAM_REPLY_RETENTION_DAYS + 1, 90], []);
    const result = await purgeStaleTelegramData(t.client, now);
    assert.equal(result.repliesDeleted, 2);
    assert.deepEqual(t.replies.map((r) => r.id).sort(), ["r0", "r1"]);
  });

  it("drops codes only well past expiry", async () => {
    const t = fakeClient([], [0.5, TELEGRAM_CODE_RETENTION_DAYS + 1, 10]);
    const result = await purgeStaleTelegramData(t.client, now);
    assert.equal(result.codesDeleted, 2);
    assert.deepEqual(t.codes.map((c) => c.id), ["c0"]);
  });

  it("is bounded: a huge backlog is worked off over several runs", async () => {
    const backlog = CLEANUP_BATCH_SIZE * CLEANUP_MAX_BATCHES + 300;
    const t = fakeClient(Array.from({ length: backlog }, () => 60), []);
    const first = await purgeStaleTelegramData(t.client, now);
    assert.equal(first.repliesDeleted, CLEANUP_BATCH_SIZE * CLEANUP_MAX_BATCHES);
    assert.equal(t.replies.length, 300);
    const second = await purgeStaleTelegramData(t.client, now);
    assert.equal(second.repliesDeleted, 300);
    assert.equal(t.replies.length, 0);
  });

  it("does nothing, and deletes nothing, when there is nothing stale", async () => {
    const t = fakeClient([1, 2], [0]);
    assert.deepEqual(await purgeStaleTelegramData(t.client, now), { repliesDeleted: 0, codesDeleted: 0 });
    assert.equal(t.calls(), 0);
  });
});

describe("isCleanupTick", () => {
  it("is true once per hour for a five-minute cron", () => {
    const ticks = Array.from({ length: 12 }, (_, i) => new Date(Date.UTC(2026, 9, 29, 12, i * 5)));
    assert.equal(ticks.filter(isCleanupTick).length, 1);
  });
});

describe("wiring", () => {
  it("the worker runs the cleanup on the hourly tick and never lets it stop publishing", () => {
    const cron = fs.readFileSync("src/app/api/cron/publish/route.ts", "utf8");
    const at = cron.indexOf("if (isCleanupTick(now))");
    assert.ok(at > 0);
    assert.match(cron.slice(at, at + 600), /try \{[\s\S]*purgeStaleTelegramData\(prisma, now\)[\s\S]*\} catch/);
  });
});

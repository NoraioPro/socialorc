/**
 * After "publish now" has talked to the platform, recording the answer must
 * not be able to strand the post in PUBLISHING with no job. The write is
 * retried once; then the post is closed FAILED as "outcome unknown".
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  OUTCOME_UNKNOWN_CODE,
  outcomeUnknownMessage,
  recordPublishOutcome,
} from "../../src/lib/jobs/record-outcome";

const quiet = () => {
  const original = console.error;
  console.error = () => undefined;
  return () => {
    console.error = original;
  };
};

test("a write that succeeds is returned and nothing is closed", async () => {
  let closed = 0;
  const result = await recordPublishOutcome(async () => "ok", async () => closed++);
  assert.deepEqual(result, { ok: true, value: "ok" });
  assert.equal(closed, 0);
});

test("a transient write failure is retried once, without closing", async () => {
  let calls = 0;
  let closed = 0;
  const result = await recordPublishOutcome(
    async () => {
      calls++;
      if (calls === 1) throw new Error("connection reset");
      return 42;
    },
    async () => closed++,
  );
  assert.deepEqual(result, { ok: true, value: 42 });
  assert.equal(calls, 2);
  assert.equal(closed, 0);
});

test("a write that keeps failing closes the post as outcome-unknown", async () => {
  const restore = quiet();
  try {
    let calls = 0;
    let closed = 0;
    const result = await recordPublishOutcome(
      async () => {
        calls++;
        throw new Error("db down");
      },
      async () => closed++,
    );
    assert.equal(result.ok, false);
    assert.equal(calls, 2);
    assert.equal(closed, 1);
  } finally {
    restore();
  }
});

test("a failing close is swallowed: the caller still gets an answer", async () => {
  const restore = quiet();
  try {
    const result = await recordPublishOutcome(
      async () => {
        throw new Error("db down");
      },
      async () => {
        throw new Error("still down");
      },
    );
    assert.equal(result.ok, false);
  } finally {
    restore();
  }
});

test("the message tells the user to check the platform", () => {
  const message = outcomeUnknownMessage("X reported success at https://x.com/i/status/1");
  assert.match(message, /outcome unknown/i);
  assert.match(message, /check the platform/i);
  assert.match(message, /x\.com/);
  assert.equal(OUTCOME_UNKNOWN_CODE, "OUTCOME_UNKNOWN");
});

test("publish-now routes every post-send write through recordPublishOutcome", () => {
  const src = readFileSync("src/app/api/posts/[id]/publish/route.ts", "utf8");
  const afterSend = src.slice(src.indexOf("let result: Awaited"));
  assert.equal((afterSend.match(/recordPublishOutcome\(/g) ?? []).length, 4);
  assert.match(afterSend, /handOffPendingPublish\(prisma/);
  // The close only ever moves a post that is still PUBLISHING.
  assert.match(src, /where: \{ id: post\.id, status: PostStatus\.PUBLISHING \}/);
  // No bare post.update after the send outside a recorded write.
  const bare = afterSend.split("recordPublishOutcome(").slice(0, 1).join("");
  assert.doesNotMatch(bare, /prisma\.post\.update\(/);
});

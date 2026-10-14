/**
 * A post's platform picks the adapter; its linked account supplies the token.
 * They must be the same network, on every write and again before every send,
 * and a mismatch must never be reported as a credential problem.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  ACCOUNT_PLATFORM_MISMATCH_CODE,
  accountPlatformMismatch,
  accountPlatformMismatchMessage,
} from "../../src/lib/posts/transitions";

test("same platform is not a mismatch; a different one is", () => {
  assert.equal(accountPlatformMismatch("INSTAGRAM", { platform: "INSTAGRAM" }), false);
  assert.equal(accountPlatformMismatch("INSTAGRAM", { platform: "TWITTER" }), true);
});

test("no linked account is not a mismatch (other checks own that case)", () => {
  assert.equal(accountPlatformMismatch("INSTAGRAM", null), false);
  assert.equal(accountPlatformMismatch("INSTAGRAM", undefined), false);
});

test("the message names both platforms and what to do", () => {
  const message = accountPlatformMismatchMessage("INSTAGRAM", "TWITTER");
  assert.match(message, /INSTAGRAM/);
  assert.match(message, /TWITTER/);
  assert.match(message, /link/i);
  assert.doesNotMatch(message, /reconnect/i);
});

const routes = [
  "src/app/api/posts/route.ts",
  "src/app/api/posts/[id]/route.ts",
  "src/app/api/posts/[id]/schedule/route.ts",
  "src/app/api/posts/[id]/publish/route.ts",
  "src/app/api/cron/publish/route.ts",
];

for (const file of routes) {
  test(`${file} checks the account's platform against the post's`, () => {
    const src = readFileSync(file, "utf8");
    assert.match(src, /accountPlatformMismatch\(/);
    assert.match(src, new RegExp(ACCOUNT_PLATFORM_MISMATCH_CODE));
  });
}

test("the worker closes a mismatch without flagging the account for reconnect", () => {
  const src = readFileSync("src/app/api/cron/publish/route.ts", "utf8");
  const start = src.indexOf("if (accountPlatformMismatch(");
  const branch = src.slice(start, src.indexOf("continue;", start));
  assert.ok(start > 0);
  assert.match(branch, /PostStatus\.FAILED/);
  assert.doesNotMatch(branch, /needsReconnect/);
  assert.doesNotMatch(branch, /handleFailure/);
  // ...and it happens before the post is claimed and anything is sent.
  assert.ok(start < src.indexOf("publishClaimWhere(post.id)"));
});

test("publish-now refuses a mismatch before any send", () => {
  const src = readFileSync("src/app/api/posts/[id]/publish/route.ts", "utf8");
  const check = src.indexOf("if (accountPlatformMismatch(");
  assert.ok(check > 0 && check < src.indexOf("adapter.createPost("));
});

test("PATCH relinks (or unlinks) when only the platform changes", () => {
  const src = readFileSync("src/app/api/posts/[id]/route.ts", "utf8");
  assert.match(src, /relinkAccountId = replacement\?\.id \?\? null/);
  assert.match(src, /updatePayload\.socialAccountId = relinkAccountId/);
});

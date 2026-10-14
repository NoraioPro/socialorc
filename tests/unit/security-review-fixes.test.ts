import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * Source-level guards for the small findings of the 2026-10 security review.
 * The behavioural tests for the larger findings live next to their modules.
 */

test("the mock OAuth callback never reflects a raw error message into the redirect", () => {
  const source = readFileSync("src/app/api/social/mock/callback/route.ts", "utf8");
  assert.ok(!/error\.message/.test(source), "mock callback still reads error.message");
  assert.ok(source.includes('safeRedirectCode(error, "mock_connection_failed")'));
});

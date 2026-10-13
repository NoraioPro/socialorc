import { test } from "node:test";
import assert from "node:assert/strict";
import {
  OAUTH_STATE_TTL_MS,
  encodeStateCookie,
  splitState,
  validateOAuthState,
} from "../../src/lib/oauth/state";

/**
 * The state cookie is signed now (see state.ts). These cases used to build it
 * with `JSON.stringify`; that unsigned shape is exactly what must no longer be
 * accepted, so they mint a real cookie with a real secret instead — and the
 * case at the bottom asserts the old shape is refused.
 */

const SECRET = "test-secret-do-not-use-in-production";
const now = new Date("2026-09-11T12:00:00.000Z");

const state = (over: Partial<{ userId: string; platform: string; timestamp: number }> = {}) =>
  encodeStateCookie(
    { userId: "user_1", platform: "TWITTER", timestamp: now.getTime(), ...over },
    SECRET
  );

const check = (
  value: string | null | undefined,
  opts: { userId?: string; platform?: string } = {}
) =>
  validateOAuthState(value, {
    userId: opts.userId ?? "user_1",
    platform: opts.platform ?? "TWITTER",
    secret: SECRET,
    now,
  });

test("a plain state is its own cookie key", () => {
  assert.deepEqual(splitState("abc123"), { baseState: "abc123", verifier: null });
});

test("X packs its PKCE verifier after the state", () => {
  const { baseState, verifier } = splitState("abc123:verifier-value");
  assert.equal(baseState, "abc123");
  assert.equal(verifier, "verifier-value");
});

test("a verifier containing colons survives the split", () => {
  const { baseState, verifier } = splitState("abc:ver:with:colons");
  assert.equal(baseState, "abc");
  assert.equal(verifier, "ver:with:colons");
});

test("an empty verifier is treated as absent, not as an empty string", () => {
  assert.equal(splitState("abc:").verifier, null);
});

test("a matching, fresh state is accepted", () => {
  assert.equal(check(state()).ok, true);
});

test("a missing cookie is rejected", () => {
  assert.deepEqual(check(undefined), { ok: false, reason: "malformed" });
  assert.deepEqual(check(null), { ok: false, reason: "malformed" });
});

test("unparseable or incomplete cookies are rejected", () => {
  for (const bad of ["not json", "{}", '{"userId":"user_1"}', '{"userId":"user_1","platform":"TWITTER"}']) {
    const result = check(bad);
    assert.equal(result.ok, false, `should reject ${bad}`);
    assert.equal(result.ok === false && result.reason, "malformed");
  }
});

test("an unsigned cookie — the format this used to trust — is rejected", () => {
  const unsigned = JSON.stringify({ userId: "user_1", platform: "TWITTER", timestamp: now.getTime() });
  assert.deepEqual(check(unsigned), { ok: false, reason: "malformed" });
});

test("an expired state is rejected", () => {
  const stale = state({ timestamp: now.getTime() - OAUTH_STATE_TTL_MS - 1000 });
  assert.deepEqual(check(stale), { ok: false, reason: "expired" });
});

test("a state minted for another session is rejected", () => {
  assert.deepEqual(check(state({ userId: "someone_else" })), { ok: false, reason: "user_mismatch" });
});

test("a state minted for another platform is rejected", () => {
  // Guards against a callback being replayed against a different connector.
  assert.deepEqual(check(state({ platform: "LINKEDIN" })), {
    ok: false,
    reason: "platform_mismatch",
  });
});

test("acceptance is not affected by extra fields", () => {
  const extra = encodeStateCookie(
    {
      userId: "user_1",
      platform: "TWITTER",
      timestamp: now.getTime(),
      unexpected: "ignored",
    } as never,
    SECRET
  );
  assert.equal(check(extra).ok, true);
});

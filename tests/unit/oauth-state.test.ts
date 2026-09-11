import { test } from "node:test";
import assert from "node:assert/strict";
import { splitState, validateOAuthState, OAUTH_STATE_TTL_MS } from "../../src/lib/oauth/state";

const now = new Date("2026-09-11T12:00:00.000Z");
const state = (over: Partial<{ userId: string; platform: string; timestamp: number }> = {}) =>
  JSON.stringify({ userId: "user_1", platform: "TWITTER", timestamp: now.getTime(), ...over });

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
  const result = validateOAuthState(state(), { userId: "user_1", platform: "TWITTER", now });
  assert.equal(result.ok, true);
});

test("a missing cookie is rejected", () => {
  assert.deepEqual(validateOAuthState(undefined, { userId: "user_1", platform: "TWITTER", now }), {
    ok: false,
    reason: "malformed",
  });
  assert.deepEqual(validateOAuthState(null, { userId: "user_1", platform: "TWITTER", now }), {
    ok: false,
    reason: "malformed",
  });
});

test("unparseable or incomplete cookies are rejected", () => {
  for (const bad of ["not json", "{}", '{"userId":"user_1"}', '{"userId":"user_1","platform":"TWITTER"}', '{"userId":"user_1","platform":"TWITTER","timestamp":"soon"}']) {
    const result = validateOAuthState(bad, { userId: "user_1", platform: "TWITTER", now });
    assert.equal(result.ok, false, `should reject ${bad}`);
    assert.equal(result.ok === false && result.reason, "malformed");
  }
});

test("an expired state is rejected", () => {
  const stale = state({ timestamp: now.getTime() - OAUTH_STATE_TTL_MS - 1000 });
  const result = validateOAuthState(stale, { userId: "user_1", platform: "TWITTER", now });
  assert.deepEqual(result, { ok: false, reason: "expired" });
});

test("a state minted for another session is rejected", () => {
  const result = validateOAuthState(state({ userId: "someone_else" }), { userId: "user_1", platform: "TWITTER", now });
  assert.deepEqual(result, { ok: false, reason: "user_mismatch" });
});

test("a state minted for another platform is rejected", () => {
  // Guards against a callback being replayed against a different connector.
  const result = validateOAuthState(state({ platform: "LINKEDIN" }), { userId: "user_1", platform: "TWITTER", now });
  assert.deepEqual(result, { ok: false, reason: "platform_mismatch" });
});

test("acceptance is not affected by extra fields", () => {
  const extra = JSON.stringify({
    userId: "user_1",
    platform: "TWITTER",
    timestamp: now.getTime(),
    unexpected: "ignored",
  });
  assert.equal(validateOAuthState(extra, { userId: "user_1", platform: "TWITTER", now }).ok, true);
});

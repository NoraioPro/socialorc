import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  OAUTH_STATE_TTL_MS,
  encodeStateCookie,
  peekStateCookie,
  signStateJson,
  validateOAuthState,
  verifierFromStateCookie,
} from "../../src/lib/oauth/state";

/**
 * The state cookie is what proves a callback belongs to the flow this user
 * started. It used to be plain JSON: anyone who could set a cookie in their own
 * browser could claim any user id and any platform, and the callback believed
 * it. These assertions are about the signature — including that the old,
 * unsigned format no longer verifies.
 */

const SECRET = "test-secret-do-not-use-in-production";
const OTHER_SECRET = "a-different-secret";
const USER = "user_1";
const PLATFORM = "LINKEDIN";

function cookie(overrides: Record<string, unknown> = {}) {
  return encodeStateCookie(
    { userId: USER, platform: PLATFORM, timestamp: Date.now(), ...overrides } as never,
    SECRET
  );
}

function valid(value: string) {
  return validateOAuthState(value, { userId: USER, platform: PLATFORM, secret: SECRET });
}

test("a state cookie the connect route minted validates", () => {
  const result = valid(cookie({ brainId: "brain_1", popup: true }));
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.data.brainId, "brain_1");
  assert.equal(result.ok && result.data.popup, true);
});

test("the cookie is signed, not plain JSON", () => {
  const value = cookie();
  assert.match(value, /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/);
  assert.notEqual(value.trim().charAt(0), "{");
});

test("the old unsigned JSON format no longer verifies", () => {
  const legacy = JSON.stringify({ userId: USER, platform: PLATFORM, timestamp: Date.now() });
  const result = valid(legacy);
  assert.equal(result.ok, false);
  assert.equal(result.ok === false && result.reason, "malformed");
});

test("a forged payload is refused even when the shape looks perfect", () => {
  // Exactly what a client could do before: claim to be somebody else.
  const forgedJson = JSON.stringify({
    userId: "victim",
    platform: PLATFORM,
    timestamp: Date.now(),
  });
  const forgedBody = Buffer.from(forgedJson, "utf8").toString("base64url");
  const forged = `${signStateJson(JSON.stringify({ userId: USER }), SECRET)}.${forgedBody}`;
  const result = validateOAuthState(forged, { userId: "victim", platform: PLATFORM, secret: SECRET });
  assert.equal(result.ok, false);
});

test("a cookie signed with another key is refused", () => {
  const foreign = encodeStateCookie(
    { userId: USER, platform: PLATFORM, timestamp: Date.now() },
    OTHER_SECRET
  );
  assert.equal(valid(foreign).ok, false);
});

test("editing one character of the payload breaks the signature", () => {
  const value = cookie();
  const [signature, body] = value.split(".");
  const decoded = Buffer.from(body, "base64url").toString("utf8");
  const edited = decoded.replace(USER, "user_2");
  assert.notEqual(edited, decoded, "the payload must contain the user id for this test to mean anything");
  const tampered = `${signature}.${Buffer.from(edited, "utf8").toString("base64url")}`;
  assert.equal(valid(tampered).ok, false);
});

test("a signed cookie still has to belong to this user and platform", () => {
  assert.equal(
    validateOAuthState(cookie(), { userId: "someone_else", platform: PLATFORM, secret: SECRET }).ok,
    false
  );
  assert.equal(
    validateOAuthState(cookie(), { userId: USER, platform: "TWITTER", secret: SECRET }).ok,
    false
  );
});

test("a signed cookie still expires", () => {
  const stale = cookie({ timestamp: Date.now() - OAUTH_STATE_TTL_MS - 1000 });
  const result = valid(stale);
  assert.equal(result.ok === false && result.reason, "expired");
});

test("the PKCE verifier survives the round trip and is hidden from an unverified read", () => {
  const value = cookie({ verifier: "verifier-abc" });
  assert.equal(verifierFromStateCookie(value, SECRET), "verifier-abc");
  assert.equal(verifierFromStateCookie(JSON.stringify({ verifier: "verifier-abc" }), SECRET), null);
});

test("peeking a cookie that fails verification yields nothing", () => {
  assert.deepEqual(peekStateCookie(JSON.stringify({ brainId: "brain_1" }), SECRET), {});
  assert.deepEqual(peekStateCookie("", SECRET), {});
  assert.deepEqual(peekStateCookie(cookie({ brainId: "brain_1" }), SECRET).brainId, "brain_1");
});

test("every reader mints or verifies through the module, never by parsing raw JSON", () => {
  const connect = readFileSync("src/app/api/social/connect/route.ts", "utf8");
  assert.match(connect, /encodeStateCookie\(/);
  assert.doesNotMatch(connect, /cookies\.set\(`oauth_state_\$\{state\}`, JSON\.stringify/);

  for (const file of [
    "src/lib/oauth/callback.ts",
    "src/lib/social/telegram-connect.ts",
    "src/app/api/social/mock/callback/route.ts",
  ]) {
    const source = readFileSync(file, "utf8");
    assert.doesNotMatch(source, /JSON\.parse\(stateCookie/, `${file} must not parse the cookie raw`);
    assert.match(source, /peekStateCookie\(|validateOAuthState\(/, `${file} must verify through the module`);
  }
});

test("the Telegram connect requires this session's cookie on every path that issues or binds", () => {
  for (const file of [
    "src/app/api/social/telegram/connect/route.ts",
  ]) {
    const source = readFileSync(file, "utf8");
    assert.match(source, /readTelegramState\(req, body\?\.state, guard\.userId\)/, file);
    // The deployment's chat is a UI prefill only, never a connect target.
    assert.doesNotMatch(source, /chatId[^\n]*process\.env\.TELEGRAM_CHAT_ID/, file);
  }
  const connect = readFileSync("src/app/api/social/telegram/connect/route.ts", "utf8");
  // GET writes nothing: no prisma call before the POST handler.
  const getHandler = connect.slice(connect.indexOf("export async function GET"), connect.indexOf("export async function POST"));
  assert.doesNotMatch(getHandler, /prisma\./);
});

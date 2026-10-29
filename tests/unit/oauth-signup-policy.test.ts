import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { mayLinkOAuthToExisting, oauthSignInDecision } from "../../src/lib/signup-policy";

/**
 * Regression tests for the OAuth sign-up gaps found in the MVP audit
 * (docs/AUDIT-MVP-2026-10-29.md: A-01, A-03, A-04).
 */

const CLOSED = { ALLOW_PUBLIC_SIGNUP: "false" } as unknown as NodeJS.ProcessEnv;
const base = {
  identityKnown: false,
  userWithEmailExists: false,
  existingUserCount: 5,
  env: CLOSED,
};

test("A-03: a brand-new OAuth identity is refused on an invite-only deployment", () => {
  assert.equal(oauthSignInDecision({ ...base, email: "stranger@evil.example" }).allowed, false);
});

test("A-03: a new OAuth identity without an email is refused (cannot be checked against the allowlist)", () => {
  assert.equal(oauthSignInDecision({ ...base, email: null }).allowed, false);
});

test("A-03: an allowlisted address may sign up with OAuth", () => {
  const env = { ...CLOSED, SIGNUP_ALLOWLIST: "invited@partner.example" } as unknown as NodeJS.ProcessEnv;
  assert.equal(oauthSignInDecision({ ...base, env, email: "invited@partner.example" }).allowed, true);
});

test("A-03: an already-linked identity or existing user can still sign in", () => {
  assert.equal(oauthSignInDecision({ ...base, email: "a@b.example", identityKnown: true }).allowed, true);
  assert.equal(oauthSignInDecision({ ...base, email: "a@b.example", userWithEmailExists: true }).allowed, true);
});

test("A-03: the first account still bootstraps", () => {
  assert.equal(oauthSignInDecision({ ...base, existingUserCount: 0, email: "owner@x.example" }).allowed, true);
});

test("A-04: Google is never linked onto an unverified password account", () => {
  assert.equal(mayLinkOAuthToExisting({ password: "hash", emailVerified: null }), false);
});

test("A-04: linking is allowed when there is no password or the email was verified", () => {
  assert.equal(mayLinkOAuthToExisting({ password: null, emailVerified: null }), true);
  assert.equal(mayLinkOAuthToExisting({ password: "hash", emailVerified: new Date() }), true);
});

// Source-level pin (the callbacks need NextAuth + a database to run): the
// properties below were the defects, so assert they cannot quietly return.
const auth = fs.readFileSync(path.join(process.cwd(), "src/lib/auth.ts"), "utf8");
/** Just the jwt callback body, so unrelated code later in the file cannot match. */
const jwtBody = auth.slice(auth.indexOf("async jwt("), auth.indexOf("return token;"));

test("A-01: the jwt callback never trusts the adapter's user.role", () => {
  assert.equal(/isRole\(user\.role\)/.test(jwtBody), false);
  assert.match(auth, /token\.role = await roleForUser\(user\.id\)/);
});

test("A-01: the new-user role correction in jwt is not wrapped in try/catch (fail closed)", () => {
  const jwt = jwtBody;
  const fix = jwt.indexOf("data: { role: OAUTH_SIGNUP_ROLE }");
  assert.ok(fix > 0, "role correction missing from jwt callback");
  assert.equal(/try\s*\{[^}]*data: \{ role: OAUTH_SIGNUP_ROLE \}/.test(jwt), false);
});

test("A-03: the signIn callback applies the signup policy", () => {
  assert.match(auth, /oauthSignInDecision\(/);
});

test("A-07: session lifetime is bounded below the 30-day default", () => {
  assert.match(auth, /maxAge:\s*7 \* 24 \* 60 \* 60/);
});

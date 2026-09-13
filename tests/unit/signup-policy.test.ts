import { test } from "node:test";
import assert from "node:assert/strict";
import { signupDecision, signupAllowlist } from "../../src/lib/signup-policy";

/**
 * Regression tests for public-signup safety.
 *
 * Production was found open (ALLOW_PUBLIC_SIGNUP=true) and strangers were
 * registering. These tests pin the closed state: shipping with the flag off must
 * actually refuse new accounts, and an allowlist entry must not widen access to
 * lookalike domains.
 */

/** Build an env bag without pretending to be the whole process environment. */
function envOf(values: Record<string, string>): NodeJS.ProcessEnv {
  return values as unknown as NodeJS.ProcessEnv;
}

const OFF = envOf({ ALLOW_PUBLIC_SIGNUP: "false" });
const ABSENT = envOf({});

test("with ALLOW_PUBLIC_SIGNUP=false a stranger is refused", () => {
  assert.equal(signupDecision("stranger@evil.example", 5, OFF).allowed, false);
});

test("signup is closed by default when the variable is absent", () => {
  // A deployment that never sets the flag must not be open by accident.
  assert.equal(signupDecision("stranger@evil.example", 5, ABSENT).allowed, false);
});

test("the refusal reason never leaks who is invited", () => {
  const decision = signupDecision("stranger@evil.example", 5, OFF);
  assert.equal(decision.reason.includes("stranger@evil.example"), false);
});

test("the first account still bootstraps, so a deployment is never locked out", () => {
  assert.equal(signupDecision("owner@example.com", 0, OFF).allowed, true);
});

test("ALLOW_PUBLIC_SIGNUP=true reopens registration deliberately", () => {
  const env = envOf({ ALLOW_PUBLIC_SIGNUP: "true" });
  assert.equal(signupDecision("anyone@wherever.example", 5, env).allowed, true);
});

test("an exact allowlist entry is still honoured with public signup off", () => {
  const env = envOf({
    ALLOW_PUBLIC_SIGNUP: "false",
    SIGNUP_ALLOWLIST: "invited@partner.example",
  });
  assert.equal(signupDecision("invited@partner.example", 5, env).allowed, true);
  assert.equal(signupDecision("not.invited@partner.example", 5, env).allowed, false);
});

test("a domain allowlist entry does not match a lookalike domain", () => {
  // "@example.com" must invite me@example.com - never me@notexample.com or
  // me@example.com.evil.example. A naive substring check would hand accounts to
  // any domain that merely contains the invited string.
  const env = envOf({
    ALLOW_PUBLIC_SIGNUP: "false",
    SIGNUP_ALLOWLIST: "@example.com",
  });
  assert.equal(signupDecision("me@example.com", 5, env).allowed, true);
  assert.equal(signupDecision("me@notexample.com", 5, env).allowed, false);
  assert.equal(signupDecision("me@example.com.evil.example", 5, env).allowed, false);
});

test("allowlist entries are matched case-insensitively and trimmed", () => {
  const env = envOf({
    ALLOW_PUBLIC_SIGNUP: "false",
    SIGNUP_ALLOWLIST: "  Invited@Partner.Example , ",
  });
  assert.deepEqual(signupAllowlist(env), ["invited@partner.example"]);
  assert.equal(signupDecision("invited@partner.example", 5, env).allowed, true);
});

test("the flag only counts when it is exactly true", () => {
  for (const value of ["false", "0", "no", "TRUE", "", " true "]) {
    const env = envOf({ ALLOW_PUBLIC_SIGNUP: value });
    const expected = value.trim().toLowerCase() === "true";
    assert.equal(
      signupDecision("stranger@evil.example", 5, env).allowed,
      expected,
      `ALLOW_PUBLIC_SIGNUP=${JSON.stringify(value)} should ${expected ? "" : "not "}open signup`,
    );
  }
});

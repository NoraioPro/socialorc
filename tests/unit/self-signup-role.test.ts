import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { can, selfSignupRole } from "../../src/lib/roles";

/**
 * Public self-service signup: every new account owns a private workspace and
 * must be able to use the core product in it. At EDITOR a signup could not
 * connect an account, approve or schedule, so the product was unusable for
 * everyone after the first user (the e2e harness hid this by forcing
 * SIGNUP_ROLE=ADMIN).
 */

const none = {} as unknown as NodeJS.ProcessEnv;

test("a self-signup with no override is ADMIN of its own workspace", () => {
  assert.equal(selfSignupRole(none), "ADMIN");
});

test("SIGNUP_ROLE can still override the default, but not with junk", () => {
  assert.equal(selfSignupRole({ SIGNUP_ROLE: "MANAGER" } as unknown as NodeJS.ProcessEnv), "MANAGER");
  assert.equal(selfSignupRole({ SIGNUP_ROLE: "root" } as unknown as NodeJS.ProcessEnv), "ADMIN");
});

test("the default self-signup role can run the whole core flow", () => {
  const role = selfSignupRole(none);
  for (const permission of [
    "posts:create",
    "posts:approve",
    "posts:schedule",
    "accounts:connect",
    "media:upload",
  ] as const) {
    assert.equal(can(role, permission), true, permission);
  }
});

test("EDITOR cannot connect an account or schedule (why it is not the default)", () => {
  assert.equal(can("EDITOR", "accounts:connect"), false);
  assert.equal(can("EDITOR", "posts:schedule"), false);
});

test("OAuth sign-ups default to the same role as password sign-ups", () => {
  const auth = fs.readFileSync("src/lib/auth.ts", "utf8");
  assert.match(auth, /: \("ADMIN" as Role\)/);
  assert.equal(/"EDITOR" as Role/.test(auth), false);
});

test("the draft page lets an approver approve straight from DRAFT", () => {
  const page = fs.readFileSync("src/app/(dashboard)/dashboard/drafts/[id]/page.tsx", "utf8");
  assert.match(page, /post\.status === "DRAFT" && canApprove/);
});

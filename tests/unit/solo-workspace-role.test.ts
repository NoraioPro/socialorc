import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { can, effectiveRole } from "../../src/lib/roles";

describe("a user alone in their workspace has every privilege there", () => {
  it("promotes any stored role to ADMIN when the user is the only member", () => {
    for (const stored of ["ADMIN", "MANAGER", "EDITOR", "CLIENT", "garbage", null, undefined]) {
      assert.equal(effectiveRole(stored, true), "ADMIN", `stored=${String(stored)}`);
    }
    assert.equal(can(effectiveRole("EDITOR", true), "accounts:connect"), true);
    assert.equal(can(effectiveRole("CLIENT", true), "posts:schedule"), true);
  });

  it("uses the stored role, validated, once the workspace has other members", () => {
    assert.equal(effectiveRole("EDITOR", false), "EDITOR");
    assert.equal(can(effectiveRole("EDITOR", false), "accounts:connect"), false);
    assert.equal(effectiveRole("CLIENT", false), "CLIENT");
    assert.equal(effectiveRole("garbage", false), "CLIENT", "an unreadable role still fails closed");
  });

  it("every authorisation path applies the rule: the tenant guard, requirePermission and the session role", () => {
    const guard = fs.readFileSync("src/lib/tenancy/guard.ts", "utf8");
    const auth = fs.readFileSync("src/lib/auth.ts", "utf8");
    assert.match(guard, /effectiveRole\(user\.role, await isSoleWorkspaceMember\(userId\)\)/);
    assert.match(auth, /effectiveRole\(row\?\.role, await isSoleWorkspaceMember\(userId\)\)/);
    assert.match(auth, /effectiveRole\(row\.role, await isSoleWorkspaceMember\(session\.user\.id\)\)/);
  });
});

/**
 * Role matrix, its metadata, and the guard that keeps the dev quick-login
 * surface removed.
 *
 * These are pure functions, so the tests read the module's own source for the
 * forbidden imports that would make them non-deterministic.
 *
 * `src/lib/dev-login.ts` used to export one-click dev sign-in helpers backed by
 * seeded `demo-*@socialorc.local` accounts. That surface was removed on purpose
 * (it put a credential path and real-looking demo accounts in front of the
 * browser), so the last block here fails if any of it comes back.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import {
  DEFAULT_ROLE,
  FALLBACK_ROLE,
  PERMISSIONS,
  ROLES,
  ROLE_META,
  can,
  isApprover,
  isReadOnly,
  isRole,
  parseRole,
  permissionsFor,
} from "../../src/lib/roles";

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

/** Read a repo file, or null when it is absent (absence is asserted elsewhere). */
function readProjectFile(relative: string): string | null {
  const absolute = path.join(PROJECT_ROOT, relative);
  return existsSync(absolute) ? readFileSync(absolute, "utf8") : null;
}

describe("roles: strict parsing", () => {
  it("accepts exactly the four defined roles", () => {
    for (const role of ROLES) {
      assert.equal(isRole(role), true);
      assert.equal(parseRole(role), role);
    }
  });

  it("refuses anything else and falls back to the least-privileged role", () => {
    const hostile = [
      "admin",
      "Admin",
      "ADMIN ",
      "SUPERADMIN",
      "",
      null,
      undefined,
      0,
      1,
      true,
      {},
      [],
      ["ADMIN"],
    ];

    for (const value of hostile) {
      assert.equal(isRole(value), false, `${JSON.stringify(value)} must not be a role`);
      assert.equal(parseRole(value), FALLBACK_ROLE);
    }
  });

  it("defaults new accounts to an owner role and never to the fallback", () => {
    assert.equal(DEFAULT_ROLE, "ADMIN");
    assert.equal(ROLES.includes(DEFAULT_ROLE), true);
    assert.notEqual(DEFAULT_ROLE, FALLBACK_ROLE);
  });
});

describe("roles: permission matrix", () => {
  it("covers every permission for every role exactly once", () => {
    for (const role of ROLES) {
      const permissions = permissionsFor(role);
      assert.equal(new Set(permissions).size, permissions.length);
      for (const permission of permissions) {
        assert.equal(PERMISSIONS.includes(permission), true);
      }
    }
  });

  it("lets only admins and managers approve and schedule", () => {
    for (const role of ROLES) {
      const expected = role === "ADMIN" || role === "MANAGER";
      assert.equal(can(role, "posts:approve"), expected, `approve for ${role}`);
      assert.equal(can(role, "posts:schedule"), expected, `schedule for ${role}`);
      assert.equal(isApprover(role), expected, `isApprover for ${role}`);
    }
  });

  it("keeps user management admin-only and the client role read-only", () => {
    assert.equal(can("ADMIN", "users:manage"), true);
    assert.equal(can("MANAGER", "users:manage"), false);
    assert.equal(can("EDITOR", "users:manage"), false);
    assert.equal(can("CLIENT", "users:manage"), false);

    assert.equal(isReadOnly("CLIENT"), true);
    assert.equal(can("CLIENT", "posts:create"), false);
    assert.equal(can("CLIENT", "posts:submit"), false);
    assert.equal(can("CLIENT", "posts:delete"), false);
    // Read-only still means "can look at the workspace".
    assert.equal(can("CLIENT", "dashboard:view"), true);
  });

  it("lets editors write drafts but not ship them", () => {
    assert.equal(can("EDITOR", "posts:create"), true);
    assert.equal(can("EDITOR", "posts:submit"), true);
    assert.equal(can("EDITOR", "posts:approve"), false);
    assert.equal(can("EDITOR", "posts:schedule"), false);
    assert.equal(can("EDITOR", "accounts:connect"), false);
    assert.equal(can("EDITOR", "engagement:reply"), true);
    assert.equal(can("EDITOR", "engagement:delete"), false);
  });

  it("maps engagement permissions by role", () => {
    for (const role of ROLES) {
      assert.equal(can(role, "engagement:view"), true, `view for ${role}`);
    }
    assert.equal(can("CLIENT", "engagement:reply"), false);
    assert.equal(can("CLIENT", "engagement:react"), false);
    assert.equal(can("MANAGER", "engagement:delete"), true);
    assert.equal(can("EDITOR", "engagement:delete"), false);
  });
});

describe("roles: metadata stays in sync", () => {
  it("describes every role", () => {
    for (const role of ROLES) {
      const meta = ROLE_META[role];
      assert.ok(meta.label.length > 0, `label for ${role}`);
      assert.ok(meta.blurb.length > 0, `blurb for ${role}`);
      assert.ok(meta.badgeClassName.includes("bg-"), `badge classes for ${role}`);
    }
  });

  it("gives every role its own badge style", () => {
    const badges = new Set<string>();
    for (const role of ROLES) {
      const { badgeClassName } = ROLE_META[role];
      assert.equal(badges.has(badgeClassName), false, `duplicate badge for ${role}`);
      badges.add(badgeClassName);
    }
  });

  it("carries no demo-account fields", () => {
    for (const role of ROLES) {
      const meta = ROLE_META[role] as unknown as Record<string, unknown>;
      assert.equal("demoEmail" in meta, false, `demoEmail still on ${role}`);
      assert.equal("demoName" in meta, false, `demoName still on ${role}`);
    }
  });
});

describe("roles.ts stays pure and offline", () => {
  const forbidden = [
    "fetch(",
    "axios",
    "http://",
    "https://",
    "Date.now",
    "new Date(",
    "Math.random",
  ];

  it("src/lib/roles.ts imports nothing impure", () => {
    const source = readProjectFile("src/lib/roles.ts") ?? "";
    for (const token of forbidden) {
      assert.equal(
        source.includes(token),
        false,
        `src/lib/roles.ts must not contain "${token}"`
      );
    }
  });
});

describe("the dev quick-login surface stays removed", () => {
  /**
   * Files that only existed to serve one-click dev role sign-in. They are
   * deleted, not feature-flagged: a flag can be flipped by a stray env var.
   */
  const DELETED_FILES = [
    "src/components/dev/role-switcher.tsx",
    "src/app/api/dev/login-as/route.ts",
  ];

  for (const file of DELETED_FILES) {
    it(`${file} no longer exists`, () => {
      assert.equal(existsSync(path.join(PROJECT_ROOT, file)), false, file);
    });
  }

  it("the credentials provider accepts no devRole credential", () => {
    const source = readProjectFile("src/lib/auth.ts") ?? "";
    assert.equal(
      source.includes("devRole"),
      false,
      "src/lib/auth.ts must not know about a devRole credential"
    );
    assert.equal(
      source.includes("ALLOW_DEV_ROLE_LOGIN"),
      false,
      "src/lib/auth.ts must not read ALLOW_DEV_ROLE_LOGIN"
    );
    assert.equal(
      source.includes("resolveDemoUser"),
      false,
      "src/lib/auth.ts must not resolve a demo user"
    );
  });

  it("the login page renders no role switcher", () => {
    const source = readProjectFile("src/app/(auth)/login/page.tsx") ?? "";
    assert.equal(source.includes("RoleSwitcher"), false, "login page must not render RoleSwitcher");
    assert.equal(
      source.includes("isDevRoleLoginVisible"),
      false,
      "login page must not read a dev-visibility flag"
    );
  });

  it("no module imports the dev-login note", () => {
    for (const file of ["src/lib/roles.ts", "src/lib/auth.ts"]) {
      const source = readProjectFile(file) ?? "";
      assert.equal(source.includes("dev-login"), false, `${file} must not import dev-login`);
    }
  });

  it("src/lib/dev-login.ts is a comment-only note", () => {
    const source = readProjectFile("src/lib/dev-login.ts");
    assert.notEqual(source, null, "src/lib/dev-login.ts should stay as the historical note");
    assert.equal(
      /\bexport\b/.test(source as string),
      false,
      "src/lib/dev-login.ts must export nothing"
    );
  });

  it("keeps demo-account passwords out of the shared modules", () => {
    for (const file of ["src/lib/roles.ts", "src/lib/dev-login.ts"]) {
      const source = readProjectFile(file) ?? "";
      assert.equal(source.includes("DEV_PASSWORD"), false, file);
      assert.equal(/password\s*:\s*["'`]/.test(source), false, file);
    }
  });
});

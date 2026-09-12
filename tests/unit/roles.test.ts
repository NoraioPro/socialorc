/**
 * Role matrix, dev role login gating and the login error copy.
 *
 * These are pure functions, so the tests read the module's own source for the
 * forbidden imports that would make them non-deterministic.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
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
import {
  DEV_ROLE_LOGIN_ENV,
  DEV_ROLE_LOGIN_PUBLIC_ENV,
  demoEmailFor,
  devRoleFromCredential,
  devRoleOptions,
  isDevRoleLoginEnabled,
  isDevRoleLoginVisible,
} from "../../src/lib/dev-login";

const PROJECT_ROOT = path.resolve(__dirname, "..", "..");

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
  });
});

describe("roles: metadata stays in sync", () => {
  it("describes every role with a distinct demo account", () => {
    const emails = new Set<string>();
    for (const role of ROLES) {
      const meta = ROLE_META[role];
      assert.ok(meta.label.length > 0, `label for ${role}`);
      assert.ok(meta.blurb.length > 0, `blurb for ${role}`);
      assert.ok(meta.badgeClassName.includes("bg-"), `badge classes for ${role}`);
      assert.equal(emails.has(meta.demoEmail), false, `duplicate demo email ${meta.demoEmail}`);
      emails.add(meta.demoEmail);
      assert.equal(meta.demoEmail, demoEmailFor(role));
    }
  });

  it("orders the dev role options by privilege and matches the demo emails", () => {
    const options = devRoleOptions();
    assert.deepEqual(
      options.map((option) => option.role),
      [...ROLES]
    );
    assert.equal(options[0].role, "ADMIN");
    assert.equal(options[options.length - 1].role, "CLIENT");
  });
});

describe("dev role login fails closed", () => {
  it("is off unless the flag is explicitly true", () => {
    const disabled = [
      {},
      { [DEV_ROLE_LOGIN_ENV]: "false" },
      { [DEV_ROLE_LOGIN_ENV]: "1" },
      { [DEV_ROLE_LOGIN_ENV]: "yes" },
      { [DEV_ROLE_LOGIN_ENV]: "TRUE" },
    ];

    for (const env of disabled) {
      assert.equal(
        isDevRoleLoginEnabled({ NODE_ENV: "development", ...env } as NodeJS.ProcessEnv),
        false,
        JSON.stringify(env)
      );
    }
  });

  it("is off in a production build even when the flag is set", () => {
    assert.equal(
      isDevRoleLoginEnabled({
        NODE_ENV: "production",
        [DEV_ROLE_LOGIN_ENV]: "true",
      } as NodeJS.ProcessEnv),
      false
    );
  });

  it("is on only for the exact opt-in outside production", () => {
    assert.equal(
      isDevRoleLoginEnabled({
        NODE_ENV: "development",
        [DEV_ROLE_LOGIN_ENV]: "true",
      } as NodeJS.ProcessEnv),
      true
    );
    assert.equal(
      isDevRoleLoginEnabled({
        NODE_ENV: "test",
        [DEV_ROLE_LOGIN_ENV]: "true",
      } as NodeJS.ProcessEnv),
      true
    );
  });

  it("gates the browser panel on its own public flag", () => {
    assert.equal(
      isDevRoleLoginVisible({
        NODE_ENV: "development",
        [DEV_ROLE_LOGIN_ENV]: "true",
      } as NodeJS.ProcessEnv),
      false,
      "server flag alone must not render the panel from public config"
    );
    assert.equal(
      isDevRoleLoginVisible({
        NODE_ENV: "development",
        [DEV_ROLE_LOGIN_PUBLIC_ENV]: "true",
      } as NodeJS.ProcessEnv),
      true
    );
    assert.equal(
      isDevRoleLoginVisible({
        NODE_ENV: "production",
        [DEV_ROLE_LOGIN_PUBLIC_ENV]: "true",
      } as NodeJS.ProcessEnv),
      false
    );
  });

  it("refuses a devRole credential that is not a real role", () => {
    assert.equal(devRoleFromCredential("ADMIN"), "ADMIN");
    assert.equal(devRoleFromCredential("CLIENT"), "CLIENT");
    for (const bad of ["admin", "ADMIN ", "OWNER", "", undefined, null, 1, {}]) {
      assert.equal(devRoleFromCredential(bad), null, JSON.stringify(bad));
    }
  });
});

describe("roles + dev-login stay pure and offline", () => {
  const forbidden = [
    "fetch(",
    "axios",
    "http://",
    "https://",
    "Date.now",
    "new Date(",
    "Math.random",
  ];

  for (const file of ["src/lib/roles.ts", "src/lib/dev-login.ts"]) {
    it(`${file} imports nothing impure`, () => {
      const source = readFileSync(path.join(PROJECT_ROOT, file), "utf8");
      for (const token of forbidden) {
        assert.equal(
          source.includes(token),
          false,
          `${file} must not contain "${token}"`
        );
      }
    });
  }

  it("keeps demo-account passwords out of the shared modules", () => {
    for (const file of [
      "src/lib/roles.ts",
      "src/lib/dev-login.ts",
      "src/components/dev/role-switcher.tsx",
    ]) {
      const source = readFileSync(path.join(PROJECT_ROOT, file), "utf8");
      assert.equal(source.includes("DEV_PASSWORD"), false, file);
      assert.equal(/password\s*:\s*["'`]/.test(source), false, file);
    }
  });
});

/**
 * The pure half of the tenancy layer: the role vocabulary and its lossless
 * mapping from today's roles, plus the workspace slug/name rules.
 *
 * Nothing here touches a database, so these are the tests that pin the
 * decisions — in particular that the role mapping can never *grant* anything.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { ROLES, permissionsFor } from "../../src/lib/roles";
import {
  FALLBACK_WORKSPACE_ROLE,
  WORKSPACE_ROLES,
  invitableWorkspaceRoles,
  isWorkspaceRole,
  parseWorkspaceRole,
  workspaceRoleFor,
} from "../../src/lib/tenancy/workspace-role";
import { workspaceNameFor, workspaceSlugFor } from "../../src/lib/tenancy/workspace-slug";

describe("workspace role mapping is lossless", () => {
  it("maps every current role, and only the four we know", () => {
    assert.deepEqual(ROLES, ["ADMIN", "MANAGER", "EDITOR", "CLIENT"]);
    for (const role of ROLES) {
      assert.ok(
        WORKSPACE_ROLES.includes(workspaceRoleFor(role)),
        `${role} must map into the workspace vocabulary`,
      );
    }
  });

  it("keeps MANAGER as MANAGER — the reason the proposed five had to change", () => {
    // The plan proposed OWNER|ADMIN|EDITOR|MEMBER|VIEWER. MANAGER has no home in
    // it, and folding it into ADMIN would hand over posts:delete and
    // users:manage. This assertion is the guard against re-introducing that.
    assert.equal(workspaceRoleFor("MANAGER"), "MANAGER");
  });

  it("promotes the existing admin to OWNER and demotes nobody", () => {
    assert.equal(workspaceRoleFor("ADMIN"), "OWNER");
    assert.equal(workspaceRoleFor("EDITOR"), "EDITOR");
    assert.equal(workspaceRoleFor("CLIENT"), "VIEWER");
  });

  it("grants no permission the role did not already have", () => {
    // The mapping only renames seats. If a future edit folds MANAGER into ADMIN,
    // these fail — that is the whole point of keeping MANAGER in the vocabulary.
    assert.notEqual(workspaceRoleFor("MANAGER"), workspaceRoleFor("ADMIN"));
    assert.equal(workspaceRoleFor("MANAGER"), "MANAGER");
    assert.equal(permissionsFor("MANAGER").includes("posts:approve"), true);
    assert.equal(permissionsFor("MANAGER").includes("users:manage"), false);
    // And OWNER is only ever the mapped admin, never a promotion of anyone else.
    assert.equal(workspaceRoleFor("ADMIN"), "OWNER");
  });

  it("puts every role in the five-role vocabulary exactly once", () => {
    assert.equal(new Set(WORKSPACE_ROLES).size, WORKSPACE_ROLES.length);
    assert.equal(WORKSPACE_ROLES.length, 5);
    assert.equal(WORKSPACE_ROLES[0], "OWNER");
  });
});

describe("workspace role parsing fails closed", () => {
  it("accepts exactly the five", () => {
    for (const role of WORKSPACE_ROLES) {
      assert.equal(isWorkspaceRole(role), true);
      assert.equal(parseWorkspaceRole(role), role);
    }
  });

  it("falls back to the read-only seat for anything else", () => {
    for (const hostile of ["owner", "OWNER ", "SUPERADMIN", "ADMIN", "", null, undefined, 0, {}, []]) {
      if (hostile === "ADMIN") continue; // a real role
      assert.equal(parseWorkspaceRole(hostile), FALLBACK_WORKSPACE_ROLE, JSON.stringify(hostile));
    }
    assert.equal(FALLBACK_WORKSPACE_ROLE, "VIEWER");
  });

  it("never lets an invitation confer ownership", () => {
    assert.equal(invitableWorkspaceRoles().includes("OWNER"), false);
    assert.equal(invitableWorkspaceRoles().length, WORKSPACE_ROLES.length - 1);
  });
});

describe("workspace slugs are derived from the id, never the name", () => {
  it("is stable for the same user", () => {
    assert.equal(workspaceSlugFor("abc123"), workspaceSlugFor("abc123"));
  });

  it("differs between users, including two people with the same name", () => {
    // Names collide; ids do not. Slugging by name would give two "Ahmed"s one
    // workspace, which is the tenant-isolation failure in miniature.
    assert.notEqual(workspaceSlugFor("userAAA"), workspaceSlugFor("userBBB"));
  });

  it("is lower-cased and slug-safe", () => {
    for (const id of ["AbC123", "user-9", "User_9", "  x1  "]) {
      const slug = workspaceSlugFor(id);
      assert.match(slug, /^ws-[a-z0-9]+$/, slug);
    }
  });

  it("is prefixed, so it cannot collide with a human-chosen slug", () => {
    assert.equal(workspaceSlugFor("abc").startsWith("ws-"), true);
  });

  it("refuses an id with nothing slug-safe in it", () => {
    // Returning "" would make every such user share one workspace row.
    assert.throws(() => workspaceSlugFor("---"), /alphanumeric/);
    assert.throws(() => workspaceSlugFor("   "), /alphanumeric/);
  });
});

describe("tenant resolution never invents a workspace", () => {
  const source = readFileSync(
    path.resolve(__dirname, "..", "..", "src", "lib", "tenancy", "workspace.ts"),
    "utf8",
  );

  it("creates a workspace in exactly one place", () => {
    // Regression guard for a hazard that was real in the first cut: resolution
    // used to create a workspace on demand, so the first existing account to
    // touch a write path got a *personal* one — and the backfill, which has to
    // gather the whole existing deployment into ONE workspace, would then see
    // that user as already placed and leave the deployment fragmented.
    const creates = source.match(/prisma\.workspace\.upsert/g) ?? [];
    assert.equal(creates.length, 1, "only the signup helper may create a workspace");
  });

  it("keeps that one creation inside createWorkspaceForNewUser", () => {
    const creatorAt = source.indexOf("export async function createWorkspaceForNewUser");
    const createAt = source.indexOf("prisma.workspace.upsert");
    const nextExportAt = source.indexOf("\nexport ", creatorAt + 1);

    assert.notEqual(creatorAt, -1, "createWorkspaceForNewUser must exist");
    assert.ok(createAt > creatorAt, "creation must sit inside the signup helper");
    assert.ok(
      nextExportAt === -1 || createAt < nextExportAt,
      "creation must not have drifted into the resolver below it",
    );
  });

  it("hands back null — never an empty id — when a user has no membership", () => {
    // An empty tenant id is the value that silently disables a filter later
    // (plan §7).
    assert.equal(/workspaceId === ""/.test(source), true);
    assert.match(source, /return null;/);
  });
});

describe("workspace names are readable, never empty", () => {
  it("uses the first name", () => {
    assert.equal(workspaceNameFor({ name: "Ahmed Nagah" }), "Ahmed's workspace");
  });

  it("falls back to the email local part", () => {
    assert.equal(workspaceNameFor({ email: "hassan@socialorc.local" }), "hassan's workspace");
  });

  it("prefers the name when both are present", () => {
    assert.equal(
      workspaceNameFor({ name: "Hassan", email: "someone-else@x.com" }),
      "Hassan's workspace",
    );
  });

  it("never returns an empty or whitespace name", () => {
    for (const input of [{}, { name: "  " }, { email: "  " }, { name: null, email: null }]) {
      const name = workspaceNameFor(input);
      assert.ok(name.trim().length > 0, JSON.stringify(input));
    }
    assert.equal(workspaceNameFor({}), "My workspace");
  });
});

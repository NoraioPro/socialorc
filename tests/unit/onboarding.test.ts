import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { isWorkspaceKind, needsOnboarding, onboardingRole } from "../../src/lib/onboarding";

describe("first-run onboarding (just me / a team)", () => {
  it("knows the two kinds and nothing else", () => {
    assert.equal(isWorkspaceKind("PERSONAL"), true);
    assert.equal(isWorkspaceKind("TEAM"), true);
    for (const bad of ["ENTERPRISE", "personal", "", null, undefined, 1]) assert.equal(isWorkspaceKind(bad), false);
  });

  it("Just me is always ADMIN; a team creator picks a valid role, ADMIN by default", () => {
    assert.equal(onboardingRole("PERSONAL", "CLIENT"), "ADMIN", "the role is ignored for Just me");
    assert.equal(onboardingRole("TEAM", undefined), "ADMIN");
    assert.equal(onboardingRole("TEAM", ""), "ADMIN");
    for (const role of ["ADMIN", "MANAGER", "EDITOR", "CLIENT"]) assert.equal(onboardingRole("TEAM", role), role);
    for (const bad of ["ROOT", "admin", 5, {}]) assert.equal(onboardingRole("TEAM", bad), null, String(bad));
  });

  it("asks only accounts that have not answered yet", () => {
    assert.equal(needsOnboarding(null), true);
    assert.equal(needsOnboarding(undefined), true);
    assert.equal(needsOnboarding(new Date()), false);
  });

  it("the dashboard layout sends an unanswered account to /onboarding, and the page leaves once answered", () => {
    const layout = fs.readFileSync("src/app/(dashboard)/layout.tsx", "utf8");
    assert.match(layout, /needsOnboarding\(user\.onboardedAt\)/);
    assert.match(layout, /redirect\("\/onboarding"\)/);
    const page = fs.readFileSync("src/app/onboarding/page.tsx", "utf8");
    assert.match(page, /redirect\("\/login"\)/);
    assert.match(page, /redirect\("\/dashboard"\)/);
  });

  it("the route is workspace-scoped and refuses TEAM while teams are disabled", () => {
    const route = fs.readFileSync("src/app/api/onboarding/route.ts", "utf8");
    assert.match(route, /requireWorkspace\(\)/);
    assert.match(route, /guard\.workspaceId/);
    assert.match(route, /body\.kind === "TEAM" && !teamsEnabled\(\)/);
  });

  it("both migrations mark every existing account as answered, so nobody is bounced", () => {
    for (const dir of ["prisma/migrations", "prisma/migrations-postgres"]) {
      const sql = fs.readFileSync(`${dir}/20261030120000_onboarding/migration.sql`, "utf8");
      assert.match(sql, /ADD COLUMN "onboardedAt"/);
      assert.match(sql, /ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'PERSONAL'/);
      assert.match(sql, /UPDATE "User" SET "onboardedAt" = CURRENT_TIMESTAMP/);
    }
  });
});

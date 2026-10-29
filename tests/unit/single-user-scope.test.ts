import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { teamsDisabledResponse, teamsEnabled } from "../../src/lib/features";

/**
 * Single-user MVP: team features are off by default and refused server-side,
 * not just hidden in the UI.
 */

test("teams are off unless explicitly enabled", () => {
  assert.equal(teamsEnabled(undefined), false);
  assert.equal(teamsEnabled(""), false);
  assert.equal(teamsEnabled("false"), false);
  assert.equal(teamsEnabled("1"), false);
  assert.equal(teamsEnabled("true"), true);
  assert.equal(teamsEnabled(" TRUE "), true);
});

test("a disabled team endpoint answers like a missing route", async () => {
  const res = teamsDisabledResponse();
  assert.equal(res.status, 404);
  assert.deepEqual(await res.json(), { error: "Not found" });
});

const ROUTES: Array<[string, string]> = [
  ["src/app/api/workspace/invitations/route.ts", "GET"],
  ["src/app/api/workspace/invitations/route.ts", "POST"],
  ["src/app/api/workspace/invitations/[id]/route.ts", "DELETE"],
  ["src/app/api/workspace/users/route.ts", "GET"],
  ["src/app/api/workspace/users/[id]/route.ts", "PATCH"],
];

for (const [file, method] of ROUTES) {
  test(`${method} ${file} refuses before touching auth or data when teams are off`, () => {
    const src = fs.readFileSync(file, "utf8");
    const handler = src.slice(src.indexOf(`export async function ${method}`));
    const gate = handler.indexOf("if (!teamsEnabled()) return teamsDisabledResponse();");
    const guard = handler.indexOf("requireWorkspace(");
    assert.ok(gate > 0, "feature gate missing");
    assert.ok(gate < guard, "feature gate must run before the workspace guard");
  });
}

test("the UI hides the Team and Permissions panels and the timeline when teams are off", () => {
  const settings = fs.readFileSync("src/app/(dashboard)/settings/accounts/page.tsx", "utf8");
  assert.match(settings, /teamsEnabled\(\) \|\| \(s\.key !== "team" && s\.key !== "permissions"\)/);
  const sidebar = fs.readFileSync("src/components/dashboard/sidebar.tsx", "utf8");
  assert.match(sidebar, /teamsEnabled\(\) \|\| item\.href !== "\/dashboard\/feed"/);
});

test("the e2e harness opts into teams so its tenancy and role suites still run", () => {
  assert.match(fs.readFileSync("tests/e2e/run.mjs", "utf8"), /NEXT_PUBLIC_TEAMS_ENABLED: "true"/);
});

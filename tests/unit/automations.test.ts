import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { RULES, RULE_KEYS } from "../../src/lib/socialork/automations";
import { RECIPES } from "../../src/lib/socialork/autopilot";

test("every automation rule has a unique key and complete copy", () => {
  assert.equal(new Set(RULE_KEYS).size, RULES.length);
  for (const r of RULES) {
    assert.ok(r.name && r.when && r.then && r.saves, r.key);
    assert.ok(r.clicks > 0, r.key);
  }
});

test("autopilot recipes are the four the page offers", () => {
  assert.deepEqual(RECIPES.map((r) => r.key), ["daily-draft", "repurpose", "retry-failed", "weekly-recap"]);
});

test("no automation approves or publishes: only people approve, and the worker publishes", () => {
  for (const f of ["src/lib/socialork/automations.ts", "src/lib/socialork/autopilot.ts"]) {
    const src = readFileSync(f, "utf8");
    assert.doesNotMatch(src, /data:\s*\{[^}]*status:\s*PostStatus\.(APPROVED|PUBLISHED)/, f);
    assert.doesNotMatch(src, /approvedAt:\s*new Date/, f);
  }
});

test("the approve route enforces the client sign-off gate before approving", () => {
  const src = readFileSync("src/app/api/posts/[id]/approve/route.ts", "utf8");
  assert.ok(src.indexOf("CLIENT_SIGNOFF_REQUIRED") > 0 && src.indexOf("CLIENT_SIGNOFF_REQUIRED") < src.indexOf("approveGuardWhere(id, guard.workspaceId)"));
});

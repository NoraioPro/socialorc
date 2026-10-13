import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { can } from "../../src/lib/roles";

/**
 * "Signed in" is authentication; these routes were treating it as authorisation.
 *
 * The check below walks the API tree instead of naming files, so a new mutating
 * route fails this test until it is given a permission. The two exceptions are
 * deliberate and each has a reason.
 */

const API_ROOT = "src/app/api";

/** Routes that legitimately have no permission of their own. */
const EXCEPTIONS: Record<string, string> = {
  "auth/register/route.ts":
    "public by design: the signup form is the way in, and the first account bootstraps the workspace",
  "social/mock/callback/route.ts":
    "development-only: refused in production, and it is a callback the browser cannot call itself",
  "profile/route.ts":
    "self-scoped: every query is keyed on session.user.id, so the caller can only ever change their own row",
  "settings/profile/route.ts":
    "self-scoped for the same reason: it reads and writes profileSelect columns of the caller's own user row",
  "cron/publish/route.ts": "machine caller: guarded by the CRON_SECRET bearer token",
  "health/route.ts": "public by design: a health check answers monitors without a session",
};

function routeFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...routeFiles(path));
    else if (entry.name === "route.ts") out.push(path);
  }
  return out;
}

const MUTATING = /export async function (POST|PATCH|PUT|DELETE)/;

test("every mutating route that is not a deliberate exception checks a permission", () => {
  const offenders: string[] = [];
  for (const file of routeFiles(API_ROOT)) {
    const source = readFileSync(file, "utf8");
    if (!MUTATING.test(source)) continue;
    const relative = file.slice(API_ROOT.length + 1);
    if (EXCEPTIONS[relative]) continue;
    if (!source.includes("requirePermission")) offenders.push(relative);
  }
  assert.deepEqual(
    offenders,
    [],
    `these routes write without a permission check: ${offenders.join(", ")}`
  );
});

test("the exceptions are all still real routes, so this list cannot rot silently", () => {
  const present = new Set(routeFiles(API_ROOT).map((f) => f.slice(API_ROOT.length + 1)));
  for (const relative of Object.keys(EXCEPTIONS)) {
    assert.ok(present.has(relative), `${relative} no longer exists — remove it from EXCEPTIONS`);
  }
});

test("the new permissions are least-privilege in the matrix", () => {
  // Uploading media: the people who write posts.
  assert.equal(can("EDITOR", "media:upload"), true);
  assert.equal(can("CLIENT", "media:upload"), false);
  // Deleting it, and managing brains: managers and up only.
  assert.equal(can("MANAGER", "media:delete"), true);
  assert.equal(can("EDITOR", "media:delete"), false);
  assert.equal(can("MANAGER", "brains:manage"), true);
  assert.equal(can("EDITOR", "brains:manage"), false);
  // Reading the brand brain is not restricted.
  assert.equal(can("CLIENT", "brains:read"), true);
  // Posting into the feed: contributors.
  assert.equal(can("EDITOR", "feed:post"), true);
  assert.equal(can("CLIENT", "feed:post"), false);
});

test("the inbox — where a reply is actually sent — requires engagement:reply", () => {
  const source = readFileSync("src/app/api/inbox/route.ts", "utf8");
  assert.match(source, /requirePermission\("engagement:reply"\)/);
  assert.match(source, /requirePermission\("engagement:view"\)/);
});

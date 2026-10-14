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
    if (!source.includes("requirePermission") && !source.includes("requireWorkspace(")) {
      offenders.push(relative);
    }
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

// ---------------------------------------------------------------------------
// Workspace tenancy. Workspaces are the isolation boundary: every route or page
// that reads or writes workspace-owned rows must resolve the caller's workspace
// through the ONE resolver (`requireWorkspace` in src/lib/tenancy/guard.ts) and
// scope by it. These checks walk the app tree, so a new route that touches
// tenant data without the resolver fails the build.
// ---------------------------------------------------------------------------

const APP_ROOT = "src/app";

function appFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...appFiles(path));
    else if (entry.name === "route.ts" || entry.name === "page.tsx") out.push(path);
  }
  return out;
}

/** Direct access to a workspace-owned model, or a helper that reads one. */
const TENANT_DATA = new RegExp(
  [
    String.raw`\b(prisma|tx)\.(post|socialAccount|mediaAsset|brain|brandBrain|brainSource|brainChunk|scheduledJob|postMedia|feedReaction|feedComment)\.`,
    String.raw`\b(loadWorkspaceAccount|loadBrandContext|resolveBrainForWorkspace|getOrCreateDefaultBrain|findWorkspaceSocialAccount|foreignMediaAssetIds|listKnowledgeSources|addKnowledgeSource|deleteKnowledgeSource|retrieveBrandKnowledge)\(`,
  ].join("|"),
);

/** Machine callers with no user session; they are tenant-aware in their own way. */
const TENANT_EXCEPTIONS: Record<string, string> = {
  "src/app/api/cron/publish/route.ts":
    "machine caller: claims jobs globally (a per-tenant claim would starve tenants) and refuses a post whose account is in another workspace",
  "src/app/api/health/route.ts": "counts pending jobs across the deployment for monitoring; returns no rows",
};

test("every route and page touching workspace data resolves the workspace through requireWorkspace", () => {
  const offenders: string[] = [];
  for (const file of appFiles(APP_ROOT)) {
    const relative = file.split("\\").join("/");
    const source = readFileSync(file, "utf8");
    if (!TENANT_DATA.test(source)) continue;
    if (TENANT_EXCEPTIONS[relative]) continue;
    if (!source.includes("requireWorkspace(")) offenders.push(relative);
  }
  assert.deepEqual(offenders, [], `these read or write workspace data without requireWorkspace: ${offenders.join(", ")}`);
});

test("no route hand-rolls tenant resolution from the membership table", () => {
  const offenders = appFiles(APP_ROOT)
    .filter((file) => !file.endsWith("api/workspaces/route.ts")) // lists memberships, by design
    .filter((file) => /prisma\.workspaceMember\./.test(readFileSync(file, "utf8")));
  assert.deepEqual(offenders, [], `use requireWorkspace() instead of reading WorkspaceMember: ${offenders.join(", ")}`);
});

test("no tenant-model query in the app is scoped by the author instead of the workspace", () => {
  // `{ where: { ..., userId: ... } }` on a workspace-owned model is the shape of
  // the old per-user scoping. The author is still recorded on create; it is
  // never the access filter.
  const scopedByUser =
    /\b(prisma|tx)\.(post|socialAccount|mediaAsset|brain|brandBrain)\.(findFirst|findMany|findUnique|count|updateMany|deleteMany|groupBy)\(\{\s*where:\s*\{(?:(?!workspaceId)[^}])*\buserId\b/;
  const offenders = appFiles(APP_ROOT).filter((file) => scopedByUser.test(readFileSync(file, "utf8")));
  assert.deepEqual(offenders, [], `scope these by workspaceId: ${offenders.join(", ")}`);
});

test("the guarded post transitions are scoped by workspace, not by author", () => {
  const source = readFileSync("src/lib/posts/transitions.ts", "utf8");
  const guards = source.match(/export function \w+GuardWhere\([^)]*\)/g) ?? [];
  assert.ok(guards.length >= 6, "expected the guarded transitions");
  for (const signature of guards) {
    assert.match(signature, /workspaceId: string/, signature);
    assert.doesNotMatch(signature, /userId/, signature);
  }
});

test("approving is a workspace decision: the approve route scopes by workspace", () => {
  const source = readFileSync("src/app/api/posts/[id]/approve/route.ts", "utf8");
  assert.match(source, /approveGuardWhere\(id, guard\.workspaceId\)/);
  assert.doesNotMatch(source, /userId: guard\.userId/);
});

test("the feed no longer depends on friendships nobody can create", () => {
  for (const file of appFiles(APP_ROOT)) {
    assert.doesNotMatch(readFileSync(file, "utf8"), /prisma\.friendship\./, file);
  }
});

test("the inbox — where a reply is actually sent — requires engagement:reply", () => {
  const source = readFileSync("src/app/api/inbox/route.ts", "utf8");
  assert.match(source, /requireWorkspace\("engagement:reply"\)/);
  assert.match(source, /requireWorkspace\("engagement:view"\)/);
});

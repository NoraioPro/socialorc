import { describe, it } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

/**
 * A workspace may store its own OAuth app (`WorkspacePlatformCredential`) and the
 * connect flow honours it — `/api/social/connect` and every callback run under
 * `withPlatformEnv(overridesForCurrentUser())`.
 *
 * The readiness report is what tells an owner "needs app credentials", so it has
 * to be evaluated under the same overrides. It was not: Settings and
 * `/api/social/status` called `readinessReport()` bare, so a workspace that had
 * already saved its own Facebook/YouTube app was still told to set
 * `FACEBOOK_APP_ID` in the deployment — the deployment app looked like the only
 * way to connect, which reads as "everyone shares one app".
 *
 * These are source pins (no database, no server), in the style of
 * account-isolation-wiring.test.ts: they fail if the wrapper is dropped again.
 */

const root = process.cwd();

function read(rel: string): string {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

/** Every file that calls readinessReport(), except the module that defines it. */
function readinessCallers(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(ts|tsx)$/.test(entry.name) && !full.endsWith("src/lib/social/readiness.ts")) {
        if (fs.readFileSync(full, "utf8").includes("readinessReport(")) out.push(full);
      }
    }
  };
  walk(path.join(root, "src"));
  return out;
}

describe("readiness honours the workspace's own OAuth app", () => {
  it("the Settings screen evaluates readiness under the caller's overrides", () => {
    const src = read("src/app/socialork/settings/page.tsx");
    assert.match(src, /overridesForCurrentUser\(\)/, "overrides are not resolved on the Settings screen");
    const wrap = src.indexOf("withPlatformEnv(");
    const call = src.indexOf("readinessReport(");
    assert.ok(wrap > 0, "withPlatformEnv is not used on the Settings screen");
    assert.ok(wrap < call, "readinessReport must be called INSIDE withPlatformEnv, not beside it");
    assert.ok(
      src.slice(wrap, call).includes("() =>"),
      "the readiness call is not the thunk withPlatformEnv runs",
    );
  });

  it("the status API evaluates readiness under the caller's overrides", () => {
    const src = read("src/app/api/social/status/route.ts");
    assert.match(src, /overridesForCurrentUser\(\)/);
    const wrap = src.indexOf("withPlatformEnv(");
    const call = src.indexOf("readinessReport(");
    assert.ok(wrap > 0 && wrap < call, "the status route must wrap readinessReport in withPlatformEnv");
    assert.match(src, /await withPlatformEnv\(/, "the override must be applied with await, not fire-and-forget");
  });

  it("no surface reports readiness without the workspace's overrides", () => {
    const callers = readinessCallers();
    assert.ok(callers.length >= 2, `expected at least the Settings screen and the status route, found ${callers.length}`);
    for (const file of callers) {
      const src = fs.readFileSync(file, "utf8");
      assert.ok(
        src.includes("withPlatformEnv(") && src.includes("overridesForCurrentUser()"),
        `${path.relative(root, file)} calls readinessReport() without the workspace's app credentials, ` +
          `so a workspace that stored its own OAuth app will still be told the deployment is missing it`,
      );
    }
  });
});

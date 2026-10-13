import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

/**
 * What an anonymous caller may learn from /api/health.
 *
 * The endpoint was reported as "a status endpoint", but the payload also carried
 * the applied-migration count, the number of queued jobs, and the per-connector
 * list of missing environment variable NAMES: a map of the deployment, readable
 * by anyone who knows the URL. None of that is an uptime signal. The
 * unauthenticated answer is now health plus the live commit; the detail sits
 * behind the same bearer token the cron uses.
 */

const source = readFileSync("src/app/api/health/route.ts", "utf8");

test("the health route accepts a request so it can read the authorization header", () => {
  assert.match(source, /export async function GET\(req: NextRequest\)/);
});

test("an unauthenticated caller is answered before the detailed report is built", () => {
  const gate = source.indexOf("isAuthorizedCronRequest(");
  const detail = source.indexOf("...report,");
  assert.ok(gate > 0, "the route must check the bearer token");
  assert.ok(detail > 0, "the detailed report must still exist for authorized callers");
  assert.ok(gate < detail, "the gate must come first — nothing detailed may be returned before it");
});

test("the public answer is health and the live commit, and nothing else", () => {
  const publicBlock = source.slice(
    source.indexOf("if (!authorized)"),
    source.indexOf("return NextResponse.json(\n    {\n      ...report,")
  );
  assert.match(publicBlock, /status: report\.status/);
  assert.match(publicBlock, /commit:/);
  for (const leak of ["pendingJobs", "appliedMigrations", "connectors", "capabilities"]) {
    assert.doesNotMatch(
      publicBlock,
      new RegExp(`${leak}:`),
      `the unauthenticated response must not include ${leak}`
    );
  }
});

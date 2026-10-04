/**
 * A build that cannot migrate must fail, not silently skip.
 *
 * `scripts/migrate-deploy.mjs` runs on every Vercel build. It used to exit 0 with a
 * log line whenever DIRECT_URL was unset, so a deployment could ship code against a
 * schema that did not match it — and the build stayed green while it happened.
 *
 * Only the paths that exit *before* Prisma is spawned are exercised here. With
 * DIRECT_URL unset there is nothing to connect to, and a postgres DIRECT_URL would
 * spawn a real `prisma migrate deploy` — which a unit test must never do.
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { spawnSync } from "node:child_process";
import path from "node:path";

const SCRIPT = path.resolve(__dirname, "..", "..", "scripts", "migrate-deploy.mjs");

/**
 * Run the script with a controlled environment. The base deliberately omits the
 * script's inputs: an inherited DIRECT_URL from the developer's shell would turn
 * these cases into a real migration attempt against their database.
 */
function run(env: Record<string, string | undefined> = {}) {
  // NODE_ENV is required by Next's ambient ProcessEnv type; the script never reads it.
  const base: NodeJS.ProcessEnv = { PATH: process.env.PATH ?? "", NODE_ENV: "test" };
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) base[key] = value;
  }

  const result = spawnSync(process.execPath, [SCRIPT], { env: base, encoding: "utf8" });
  return { status: result.status, output: `${result.stdout ?? ""}${result.stderr ?? ""}` };
}

describe("migrate-deploy: when it may skip", () => {
  it("skips on a local run with no DIRECT_URL", () => {
    const { status, output } = run();
    assert.equal(status, 0);
    assert.match(output, /skipping migrations/);
  });

  it("still explains why, so a developer is not left guessing", () => {
    const { output } = run();
    assert.match(output, /DIRECT_URL is not set/);
    assert.match(output, /5432/);
    assert.match(output, /transaction pooler/);
  });
});

describe("migrate-deploy: when it must fail", () => {
  it("refuses to skip on a production build", () => {
    const { status, output } = run({ VERCEL_ENV: "production" });
    assert.equal(status, 1, "a production build without DIRECT_URL must fail");
    assert.match(output, /refusing to skip/);
    assert.equal(/skipping migrations/.test(output), false, "it must not also claim to skip");
  });

  it("refuses to skip on a generic CI runner (CI=true)", () => {
    const { status } = run({ CI: "true" });
    assert.equal(status, 1);
  });

  it("refuses to skip on a generic CI runner (CI=1)", () => {
    const { status } = run({ CI: "1" });
    assert.equal(status, 1);
  });

  it("refuses to skip when REQUIRE_MIGRATIONS=true, anywhere", () => {
    const { status } = run({ REQUIRE_MIGRATIONS: "true" });
    assert.equal(status, 1);
  });

  it("still refuses a DIRECT_URL that is not postgres, without connecting", () => {
    const { status, output } = run({ DIRECT_URL: "mysql://user:pw@host:3306/db" });
    assert.equal(status, 1);
    assert.match(output, /not a postgresql:\/\/ URL/);
    assert.equal(output.includes("pw"), false, "it must not echo the URL back");
  });
});

describe("migrate-deploy: preview is a warning, not a failure", () => {
  it("warns but does not fail a preview build", () => {
    // Previews are disposable and whether they receive DIRECT_URL is unverified;
    // failing them would block every preview build for the whole fleet.
    const { status, output } = run({ VERCEL_ENV: "preview", CI: "1" });
    assert.equal(status, 0);
    assert.match(output, /skipping migrations/);
    assert.match(output, /VERCEL_ENV=preview/);
  });
});

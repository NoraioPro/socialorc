import { test } from "node:test";
import assert from "node:assert/strict";
import { Platform } from "@prisma/client";
import { summarizeHealth, platformReadiness, type PlatformReadiness } from "../../src/lib/health";

const ready = (over: Partial<PlatformReadiness> = {}): PlatformReadiness => ({
  platform: Platform.TELEGRAM,
  name: "Telegram",
  configured: true,
  missing: [],
  auth: "token",
  ...over,
});

test("a reachable, migrated database with a working connector is ok", () => {
  const report = summarizeHealth({
    databaseReachable: true,
    appliedMigrations: 1,
    pendingJobs: 0,
    platforms: [ready()],
  });
  assert.equal(report.status, "ok");
  assert.equal(report.platforms.configured, 1);
  assert.equal(report.needsCredentials, false);
});

test("an unreachable database is an error, not a degradation", () => {
  const report = summarizeHealth({
    databaseReachable: false,
    appliedMigrations: null,
    platforms: [ready()],
  });
  assert.equal(report.status, "error");
});

test("a reachable but unmigrated database is degraded", () => {
  const report = summarizeHealth({
    databaseReachable: true,
    appliedMigrations: 0,
    platforms: [ready()],
  });
  assert.equal(report.status, "degraded");
});

test("no configured connectors is reported as needing credentials", () => {
  const report = summarizeHealth({
    databaseReachable: true,
    appliedMigrations: 1,
    platforms: [
      ready({ platform: Platform.LINKEDIN, name: "LinkedIn", configured: false, missing: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"], auth: "oauth" }),
      ready({ configured: false, missing: ["TELEGRAM_BOT_TOKEN", "TELEGRAM_CHAT_ID"] }),
    ],
  });
  assert.equal(report.status, "ok", "a healthy app with no credentials is still healthy");
  assert.equal(report.needsCredentials, true);
  assert.deepEqual(report.platforms.unconfigured, [Platform.LINKEDIN, Platform.TELEGRAM]);
});

test("pending job count is surfaced for the worker", () => {
  const report = summarizeHealth({
    databaseReachable: true,
    appliedMigrations: 1,
    pendingJobs: 7,
    platforms: [ready()],
  });
  assert.equal(report.worker.pendingJobs, 7);
});

test("readiness covers every platform and never reports a value, only names", () => {
  const status = {
    LINKEDIN: { configured: false, missing: ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"] },
    TELEGRAM: { configured: true, missing: [] },
  };
  const readiness = platformReadiness(status);

  assert.equal(readiness.length, Object.values(Platform).length, "every platform is reported");
  const byPlatform = Object.fromEntries(readiness.map((r) => [r.platform, r]));
  assert.equal(byPlatform.LINKEDIN.configured, false);
  assert.deepEqual(byPlatform.LINKEDIN.missing, ["LINKEDIN_CLIENT_ID", "LINKEDIN_CLIENT_SECRET"]);
  assert.equal(byPlatform.TELEGRAM.configured, true);
  assert.equal(byPlatform.TELEGRAM.auth, "token", "Telegram connects with a token, not a redirect");
  assert.equal(byPlatform.LINKEDIN.auth, "oauth");

  // A platform absent from the adapter map is reported as unconfigured, not omitted.
  assert.equal(byPlatform.TWITTER.configured, false);
  for (const entry of readiness) {
    for (const value of entry.missing) {
      assert.match(value, /^[A-Z0-9_]+$/, `${value} should be a variable name, not a value`);
    }
  }
});

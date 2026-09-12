/**
 * Connect readiness — the contract behind "one-click connect".
 *
 * The properties asserted here are the ones that decide whether the product can
 * promise a working button: a platform is never `ready` without credentials, the
 * redirect URI shown to the owner matches what the callback route actually
 * serves, and the report can never carry a credential VALUE — only variable
 * names. That last one is a shape assertion, so a future field cannot quietly
 * start leaking a secret into an API response.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { Platform } from "@prisma/client";

import {
  CONNECTABLE_PLATFORMS,
  accountStatusLabel,
  buildReadinessReport,
  connectMethodFor,
  redirectUriFor,
  type ReadinessDeps,
} from "../../src/lib/social/status";

const APP_URL = "https://app.socialorc.com";

function deps(overrides: Partial<ReadinessDeps> = {}): ReadinessDeps {
  return {
    credentialStatus: () => ({ configured: false, missing: ["TIKTOK_CLIENT_KEY"] }),
    capabilities: () => ({
      capabilities: { directPublish: false, schedule: true },
      limitations: [],
    }),
    approval: () => ({ directPublish: false, draftUpload: false }),
    appUrl: APP_URL,
    ...overrides,
  };
}

/** Credential names the app actually checks. */
const CREDENTIAL_PATTERN = /^[A-Z][A-Z0-9_]*$/;

test("every connectable platform is reported, in UI order", () => {
  const report = buildReadinessReport(CONNECTABLE_PLATFORMS, deps());
  assert.deepEqual(
    report.platforms.map((row) => row.platform),
    ["TIKTOK", "INSTAGRAM", "FACEBOOK", "YOUTUBE", "LINKEDIN", "TWITTER", "TELEGRAM"],
  );
  assert.equal(report.totals.platforms, 7);
});

test("a platform without credentials is never reported ready", () => {
  const report = buildReadinessReport(CONNECTABLE_PLATFORMS, deps());
  assert.ok(report.platforms.every((row) => row.state === "needs_setup"));
  assert.equal(report.totals.ready, 0);
  assert.equal(report.totals.needsSetup, 7);
});

test("ready platforms count correctly and say so in their summary", () => {
  const report = buildReadinessReport(CONNECTABLE_PLATFORMS, deps({
    credentialStatus: (platform) =>
      platform === "TIKTOK" || platform === "TELEGRAM"
        ? { configured: true, missing: [] }
        : { configured: false, missing: ["MISSING_THING"] },
    approval: (platform) =>
      platform === "TIKTOK"
        ? { directPublish: true, draftUpload: true }
        : { directPublish: false, draftUpload: false },
  }));

  assert.equal(report.totals.ready, 2);
  assert.equal(report.totals.needsSetup, 5);

  const tiktok = report.platforms.find((row) => row.platform === "TIKTOK")!;
  assert.equal(tiktok.state, "ready");
  assert.match(tiktok.summary, /ready to connect and publish/i);

  const telegram = report.platforms.find((row) => row.platform === "TELEGRAM")!;
  assert.equal(telegram.state, "ready");
  assert.match(telegram.summary, /bot token/i);
});

test("a connectable but unapproved app is honest about not being able to publish", () => {
  const report = buildReadinessReport(["TIKTOK"] as Platform[], deps({
    credentialStatus: () => ({ configured: true, missing: [] }),
    approval: () => ({ directPublish: false, draftUpload: false }),
  }));
  const row = report.platforms[0];
  assert.equal(row.state, "ready");
  assert.match(row.summary, /not yet approved for publishing/i);
  assert.equal(row.approval.directPublish, false);
});

test("missing credentials are reported as variable NAMES, never values", () => {
  const report = buildReadinessReport(CONNECTABLE_PLATFORMS, deps({
    credentialStatus: () => ({
      configured: false,
      missing: ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"],
    }),
  }));

  for (const row of report.platforms) {
    for (const name of row.missing) {
      assert.match(name, CREDENTIAL_PATTERN, `${name} is not an env var name`);
    }
  }

  // Shape guard: no row may grow a field that carries an actual credential.
  const allowedKeys = new Set([
    "platform",
    "method",
    "state",
    "missing",
    "redirectUri",
    "capabilities",
    "limitations",
    "approval",
    "summary",
  ]);
  for (const row of report.platforms) {
    for (const key of Object.keys(row)) {
      assert.ok(allowedKeys.has(key), `unexpected report field: ${key}`);
    }
  }
  assert.ok(!JSON.stringify(report).includes("sk-"), "report must not carry key material");
});

test("redirect URIs match the callback routes the app serves", () => {
  assert.equal(
    redirectUriFor("TIKTOK" as Platform, APP_URL),
    "https://app.socialorc.com/api/social/tiktok/callback",
  );
  assert.equal(
    redirectUriFor("INSTAGRAM" as Platform, APP_URL),
    "https://app.socialorc.com/api/social/instagram/callback",
  );
  assert.equal(
    redirectUriFor("YOUTUBE" as Platform, APP_URL),
    "https://app.socialorc.com/api/social/youtube/callback",
  );
});

test("a trailing slash on the app URL does not produce a double slash", () => {
  assert.equal(
    redirectUriFor("FACEBOOK" as Platform, "https://app.socialorc.com/"),
    "https://app.socialorc.com/api/social/facebook/callback",
  );
});

test("telegram is token based: no OAuth app, no redirect URI", () => {
  assert.equal(connectMethodFor("TELEGRAM" as Platform), "bot_token");
  assert.equal(redirectUriFor("TELEGRAM" as Platform, APP_URL), null);
  assert.equal(connectMethodFor("TIKTOK" as Platform), "oauth2");
  assert.equal(redirectUriFor("TIKTOK" as Platform, APP_URL)?.startsWith(APP_URL), true);
});

test("connected accounts are counted per platform and totalled", () => {
  const report = buildReadinessReport(
    CONNECTABLE_PLATFORMS,
    deps({ credentialStatus: () => ({ configured: true, missing: [] }) }),
    { TELEGRAM: 1, YOUTUBE: 2 },
  );
  assert.equal(report.totals.connected, 3);
});

test("the report is timestamped and self-describing", () => {
  const now = new Date("2026-09-12T12:00:00Z");
  const report = buildReadinessReport(["TIKTOK"] as Platform[], deps(), {}, now);
  assert.equal(report.generatedAt, "2026-09-12T12:00:00.000Z");
  assert.equal(report.appUrl, APP_URL);
});

test("credential-free capabilities are still reported, so the UI can explain limits", () => {
  const report = buildReadinessReport(["TIKTOK"] as Platform[], deps({
    capabilities: () => ({
      capabilities: { directPublish: false, draftUpload: true },
      limitations: [
        { capability: "directPublish", code: "APP_REVIEW_REQUIRED", message: "TikTok review needed." },
      ],
    }),
  }));
  assert.equal(report.platforms[0].capabilities.draftUpload, true);
  assert.deepEqual(report.platforms[0].limitations, ["TikTok review needed."]);
});

test("connection status maps to user-facing labels", () => {
  assert.equal(accountStatusLabel("connected"), "Connected");
  assert.equal(accountStatusLabel("disconnected"), "Not connected");
  assert.equal(accountStatusLabel("refresh_required"), "Reconnect required");
  assert.equal(accountStatusLabel("permission_missing"), "Permissions missing");
  assert.equal(accountStatusLabel("review_required"), "App review required");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { Platform } from "@prisma/client";
import {
  needsTokenRefresh,
  canRefresh,
  REFRESH_SKEW_MS,
  EXPIRY_ALERT_THRESHOLD_MS,
  EXPIRY_WARNING_THRESHOLD_MS,
  getTokenStatus,
  isTokenExpiringSoon,
  formatExpiryTime,
  type TokenExpiryStatus,
} from "../../src/lib/adapters/tokens";
import { PLATFORM_CONFIGS } from "../../src/types/platform";

const now = new Date("2026-09-11T12:00:00.000Z");
const at = (offsetMs: number) => new Date(now.getTime() + offsetMs);

test("a token with no recorded expiry is never treated as expired", () => {
  assert.equal(needsTokenRefresh(null, now), false);
  assert.equal(needsTokenRefresh(undefined, now), false);
});

test("a token far from expiry is left alone", () => {
  assert.equal(needsTokenRefresh(at(60 * 60_000), now), false);
});

test("a token inside the skew window is refreshed early", () => {
  assert.equal(needsTokenRefresh(at(REFRESH_SKEW_MS - 1000), now), true);
  assert.equal(needsTokenRefresh(at(REFRESH_SKEW_MS + 60_000), now), false);
});

test("an already-expired token needs refreshing", () => {
  assert.equal(needsTokenRefresh(at(-1000), now), true);
  assert.equal(needsTokenRefresh(at(-24 * 60 * 60_000), now), true);
});

test("the skew is configurable", () => {
  const expiresAt = at(10 * 60_000);
  assert.equal(needsTokenRefresh(expiresAt, now, 15 * 60_000), true);
  assert.equal(needsTokenRefresh(expiresAt, now, 60_000), false);
});

test("refresh needs both a refresh token and a platform that supports refresh", () => {
  assert.equal(canRefresh(true, true), true);
  assert.equal(canRefresh(false, true), false);
  assert.equal(canRefresh(true, false), false);
  assert.equal(canRefresh(false, false), false);
});

test("connector capability flags agree with the refresh contract", () => {
  // Telegram bot tokens are permanent: never refreshable, no expiry.
  assert.equal(PLATFORM_CONFIGS[Platform.TELEGRAM].capabilities.refreshableTokens, false);
  // OAuth platforms all support refresh today.
  for (const platform of [Platform.LINKEDIN, Platform.TWITTER, Platform.INSTAGRAM, Platform.FACEBOOK, Platform.TIKTOK, Platform.YOUTUBE]) {
    assert.equal(
      PLATFORM_CONFIGS[platform].capabilities.refreshableTokens,
      true,
      `${platform} should support token refresh`,
    );
  }
});

// --- Token lifecycle tests (M1.6) ---

test("getTokenStatus returns no_expiry for tokens without expiration", () => {
  const status = getTokenStatus(null, false, false, false, now);
  assert.equal(status.status, "no_expiry");
  assert.equal(status.expiresAt, null);
  assert.equal(status.expiresInMs, null);
  assert.equal(status.needsRefresh, false);
});

test("getTokenStatus returns valid for tokens far from expiry", () => {
  const farFuture = at(30 * 24 * 60 * 60_000); // 30 days
  const status = getTokenStatus(farFuture, true, true, false, now);
  assert.equal(status.status, "valid");
  assert.equal(status.needsRefresh, false);
  assert.equal(status.canAutoRefresh, true);
  assert.equal(status.requiresReconnect, false);
});

test("getTokenStatus returns expiring_soon for tokens within warning threshold", () => {
  const soonish = at(5 * 24 * 60 * 60_000); // 5 days (within 7-day threshold)
  const status = getTokenStatus(soonish, true, true, false, now);
  assert.equal(status.status, "expiring_soon");
  assert.equal(status.canAutoRefresh, true);
  assert.equal(status.requiresReconnect, false);
});

test("getTokenStatus returns expiring_urgent for tokens within alert threshold", () => {
  const urgent = at(12 * 60 * 60_000); // 12 hours (within 24-hour threshold)
  const status = getTokenStatus(urgent, true, true, false, now);
  assert.equal(status.status, "expiring_urgent");
  assert.equal(status.canAutoRefresh, true);
  assert.equal(status.requiresReconnect, false);
});

test("getTokenStatus returns expired for tokens that have expired", () => {
  const expired = at(-60_000); // 1 minute ago
  const status = getTokenStatus(expired, true, true, false, now);
  assert.equal(status.status, "expired");
  assert.equal(status.needsRefresh, true);
});

test("expired token without refresh capability requires reconnect", () => {
  const expired = at(-60_000);
  const status = getTokenStatus(expired, false, true, false, now);
  assert.equal(status.status, "expired");
  assert.equal(status.canAutoRefresh, false);
  assert.equal(status.requiresReconnect, true);
});

test("expired token on non-refreshable platform requires reconnect", () => {
  const expired = at(-60_000);
  const status = getTokenStatus(expired, true, false, false, now);
  assert.equal(status.status, "expired");
  assert.equal(status.canAutoRefresh, false);
  assert.equal(status.requiresReconnect, true);
});

test("expiring_urgent token without refresh capability requires reconnect", () => {
  const urgent = at(12 * 60 * 60_000); // 12 hours
  const status = getTokenStatus(urgent, false, true, false, now);
  assert.equal(status.status, "expiring_urgent");
  assert.equal(status.canAutoRefresh, false);
  assert.equal(status.requiresReconnect, true);
});

test("needsReconnect flag is respected in getTokenStatus", () => {
  const valid = at(30 * 24 * 60 * 60_000); // far future
  const status = getTokenStatus(valid, true, true, true, now);
  assert.equal(status.status, "valid");
  assert.equal(status.requiresReconnect, true);
});

test("isTokenExpiringSoon returns true within threshold", () => {
  assert.equal(isTokenExpiringSoon(at(3 * 24 * 60 * 60_000), now), true); // 3 days
  assert.equal(isTokenExpiringSoon(at(6 * 24 * 60 * 60_000), now), true); // 6 days
  assert.equal(isTokenExpiringSoon(at(10 * 24 * 60 * 60_000), now), false); // 10 days
  assert.equal(isTokenExpiringSoon(null, now), false);
  assert.equal(isTokenExpiringSoon(at(-60_000), now), false); // expired is not "expiring soon"
});

test("isTokenExpiringSoon respects custom threshold", () => {
  const expiresAt = at(2 * 24 * 60 * 60_000); // 2 days
  assert.equal(isTokenExpiringSoon(expiresAt, now, 24 * 60 * 60_000), false); // 1 day threshold
  assert.equal(isTokenExpiringSoon(expiresAt, now, 3 * 24 * 60 * 60_000), true); // 3 day threshold
});

test("formatExpiryTime produces human-readable output", () => {
  assert.equal(formatExpiryTime(null), "No expiry");
  assert.equal(formatExpiryTime(-1000), "Expired");
  assert.equal(formatExpiryTime(30 * 60_000), "30 minutes");
  assert.equal(formatExpiryTime(60_000), "1 minute");
  assert.equal(formatExpiryTime(90 * 60_000), "1 hour");
  assert.equal(formatExpiryTime(5 * 60 * 60_000), "5 hours");
  assert.equal(formatExpiryTime(25 * 60 * 60_000), "1 day");
  assert.equal(formatExpiryTime(3 * 24 * 60 * 60_000), "3 days");
});

test("thresholds are correctly ordered", () => {
  assert.ok(REFRESH_SKEW_MS < EXPIRY_ALERT_THRESHOLD_MS, "refresh skew < alert threshold");
  assert.ok(EXPIRY_ALERT_THRESHOLD_MS < EXPIRY_WARNING_THRESHOLD_MS, "alert < warning");
});

test("token status transitions are sensible", () => {
  const statuses: TokenExpiryStatus[] = [];
  const intervals = [
    10 * 24 * 60 * 60_000, // 10 days - valid
    5 * 24 * 60 * 60_000,  // 5 days - expiring_soon
    12 * 60 * 60_000,      // 12 hours - expiring_urgent
    -60_000,               // -1 minute - expired
  ];

  for (const offset of intervals) {
    const expiresAt = at(offset);
    const status = getTokenStatus(expiresAt, true, true, false, now);
    statuses.push(status.status);
  }

  assert.deepEqual(statuses, ["valid", "expiring_soon", "expiring_urgent", "expired"]);
});

test("a refreshable expired token can auto-refresh without reconnect", () => {
  const expired = at(-60_000);
  const status = getTokenStatus(expired, true, true, false, now);
  assert.equal(status.status, "expired");
  assert.equal(status.canAutoRefresh, true);
  assert.equal(status.requiresReconnect, false);
});

test("Telegram tokens (no expiry, no refresh) return no_expiry and cannot auto-refresh", () => {
  const status = getTokenStatus(
    null,
    false, // no refresh token
    PLATFORM_CONFIGS[Platform.TELEGRAM].capabilities.refreshableTokens, // false
    false,
    now,
  );
  assert.equal(status.status, "no_expiry");
  assert.equal(status.canAutoRefresh, false);
  assert.equal(status.requiresReconnect, false);
});

test("TikTok short-lived token lifecycle (24h expiry)", () => {
  // TikTok tokens expire in ~24h, but are refreshable
  const tiktokExpiry = at(20 * 60 * 60_000); // 20 hours remaining
  const status = getTokenStatus(
    tiktokExpiry,
    true, // has refresh token
    PLATFORM_CONFIGS[Platform.TIKTOK].capabilities.refreshableTokens, // true
    false,
    now,
  );
  assert.equal(status.status, "expiring_urgent"); // within 24h
  assert.equal(status.canAutoRefresh, true);
  assert.equal(status.requiresReconnect, false);
});

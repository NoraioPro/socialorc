import { test } from "node:test";
import assert from "node:assert/strict";
import { Platform } from "@prisma/client";
import { needsTokenRefresh, canRefresh, REFRESH_SKEW_MS } from "../../src/lib/adapters/tokens";
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

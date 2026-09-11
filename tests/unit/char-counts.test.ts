import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Platform } from "@prisma/client";
import {
  countForPlatform,
  countsForPlatforms,
  effectiveTextLimit,
  formatRemaining,
} from "../../src/lib/char-counts";
import { PLATFORM_CONFIGS } from "../../src/types/platform";

describe("char-counts", () => {
  it("remaining is limit - used", () => {
    const snap = countForPlatform("hi", Platform.TWITTER);
    assert.equal(snap.used, 2);
    assert.equal(snap.limit, PLATFORM_CONFIGS.TWITTER.maxTextLength);
    assert.equal(snap.remaining, snap.limit - 2);
    assert.equal(snap.withinLimit, true);
  });

  it("marks over-limit text", () => {
    const limit = PLATFORM_CONFIGS.TWITTER.maxTextLength;
    const snap = countForPlatform("x".repeat(limit + 5), Platform.TWITTER);
    assert.equal(snap.withinLimit, false);
    assert.equal(snap.remaining, -5);
    assert.match(formatRemaining(snap), /over/i);
  });

  it("applies captionMaxWithMedia when media is attached", () => {
    const withMedia = effectiveTextLimit(Platform.TELEGRAM, true);
    const plain = effectiveTextLimit(Platform.TELEGRAM, false);
    assert.equal(plain, PLATFORM_CONFIGS.TELEGRAM.maxTextLength);
    assert.ok(PLATFORM_CONFIGS.TELEGRAM.capabilities.captionMaxWithMedia != null);
    assert.equal(
      withMedia,
      PLATFORM_CONFIGS.TELEGRAM.capabilities.captionMaxWithMedia
    );
    assert.ok(withMedia <= plain);
  });

  it("countsForPlatforms returns one row per platform", () => {
    const rows = countsForPlatforms("hello", [
      Platform.TWITTER,
      Platform.LINKEDIN,
    ]);
    assert.equal(rows.length, 2);
    assert.equal(rows[0].platform, Platform.TWITTER);
  });

  it("formatRemaining for under-limit", () => {
    const snap = countForPlatform("", Platform.TWITTER);
    assert.match(formatRemaining(snap), /left/i);
  });
});

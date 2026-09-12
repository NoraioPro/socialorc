import { test } from "node:test";
import assert from "node:assert/strict";
import { Platform } from "@prisma/client";
import { PLATFORM_CONFIGS } from "../../src/types/platform";

const allPlatforms = Object.values(Platform) as Platform[];

test("every Platform value has a config whose id matches its key", () => {
  for (const platform of allPlatforms) {
    const config = PLATFORM_CONFIGS[platform];
    assert.ok(config, `missing PLATFORM_CONFIGS entry for ${platform}`);
    assert.equal(config.id, platform, `config.id mismatch for ${platform}`);
  }
});

test("configs are not empty shells", () => {
  for (const platform of allPlatforms) {
    const c = PLATFORM_CONFIGS[platform];
    assert.ok(c.name.length > 0, `${platform} has no name`);
    assert.ok(c.maxTextLength > 0, `${platform} maxTextLength must be positive`);
    assert.ok(c.maxMediaCount >= 1, `${platform} must allow at least one media item`);
    assert.ok(c.supportedMediaTypes.length > 0, `${platform} declares no media types`);
    assert.ok(c.notes.length > 0, `${platform} has no operator notes`);
  }
});

test("every platform declares a complete capability set", () => {
  const booleanFlags = [
    "text",
    "image",
    "video",
    "carousel",
    "mediaRequired",
    "tokenBasedAuth",
    "refreshableTokens",
    "readComments",
    "writeComments",
    "replyToComments",
    "deleteComments",
    "reactToPosts",
    "reactToComments",
  ] as const;

  for (const platform of allPlatforms) {
    const caps = PLATFORM_CONFIGS[platform].capabilities;
    assert.ok(caps, `${platform} has no capabilities`);
    for (const flag of booleanFlags) {
      assert.equal(typeof caps[flag], "boolean", `${platform}.capabilities.${flag} must be a boolean`);
    }
    assert.ok(
      Number.isFinite(caps.schedulingHorizonDays) && caps.schedulingHorizonDays > 0,
      `${platform} needs a positive schedulingHorizonDays`,
    );
  }
});

test("a platform that requires media declares media types it accepts", () => {
  for (const platform of allPlatforms) {
    const { capabilities, supportedMediaTypes } = PLATFORM_CONFIGS[platform];
    if (capabilities.mediaRequired) {
      assert.ok(
        supportedMediaTypes.length > 0,
        `${platform} requires media but accepts none`,
      );
    }
  }
});

test("declared capability invariants hold for the current connector set", () => {
  // Media-required platforms (feed posts are impossible without media).
  for (const platform of [Platform.INSTAGRAM, Platform.TIKTOK, Platform.YOUTUBE]) {
    assert.equal(PLATFORM_CONFIGS[platform].capabilities.mediaRequired, true, `${platform} should require media`);
  }

  // Text-only platforms must say so, so validation rejects caption-only posts.
  for (const platform of [Platform.TIKTOK, Platform.YOUTUBE]) {
    assert.equal(PLATFORM_CONFIGS[platform].capabilities.text, false, `${platform} cannot publish text-only`);
  }

  // Telegram is the token-based reference: no OAuth redirect, no refresh flow.
  const telegram = PLATFORM_CONFIGS[Platform.TELEGRAM].capabilities;
  assert.equal(telegram.tokenBasedAuth, true, "TELEGRAM must be token-based");
  assert.equal(telegram.refreshableTokens, false, "TELEGRAM bot tokens do not refresh");

  // Caption limits that differ from the body limit must be declared.
  assert.equal(PLATFORM_CONFIGS[Platform.TELEGRAM].capabilities.captionMaxWithMedia, 1024);
  assert.equal(PLATFORM_CONFIGS[Platform.INSTAGRAM].capabilities.captionMaxWithMedia, 2200);

  // X's hard 280-character ceiling is a product-level constraint, not a toggle.
  assert.equal(PLATFORM_CONFIGS[Platform.TWITTER].maxTextLength, 280);

  // Only Instagram and Facebook accept multiple media in one post today.
  const carouselPlatforms = allPlatforms.filter((p) => PLATFORM_CONFIGS[p].capabilities.carousel);
  assert.deepEqual(carouselPlatforms.sort(), [Platform.FACEBOOK, Platform.INSTAGRAM].sort());
});

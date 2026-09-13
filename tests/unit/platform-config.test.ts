import { test } from "node:test";
import assert from "node:assert/strict";
import { Platform } from "@prisma/client";
import { PLATFORM_CONFIGS, AuthMethod } from "../../src/types/platform";
import {
  getCapabilities,
  getConfig,
  isTokenBased,
  getAuthMethod,
  filterByCapability,
  platformsByAuthMethod,
  platformsWithNativeScheduling,
  platformsRequiringMedia,
} from "../../src/lib/adapters/index";

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
    assert.ok(c.notes.length > 0, `${platform} has no operator notes`);

    // Limits follow the declared capabilities. A connector that accepts no media
    // must declare neither a media type nor a positive count, or the UI would
    // offer attachments the adapter cannot transmit.
    const acceptsMedia = c.capabilities.image || c.capabilities.video;
    if (acceptsMedia) {
      assert.ok(c.maxMediaCount >= 1, `${platform} accepts media but allows none`);
      assert.ok(c.supportedMediaTypes.length > 0, `${platform} accepts media but declares no media types`);
    } else {
      assert.equal(c.maxMediaCount, 0, `${platform} accepts no media but allows ${c.maxMediaCount}`);
      assert.equal(
        c.supportedMediaTypes.length,
        0,
        `${platform} accepts no media but declares media types`,
      );
    }
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
    "nativeScheduling",
    "mentions",
    "hashtags",
    "linkPreview",
    "directMessages",
    "stories",
    "polls",
    "threads",
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

test("every platform has a valid authMethod", () => {
  const validMethods: AuthMethod[] = ["oauth", "token"];
  for (const platform of allPlatforms) {
    const method = PLATFORM_CONFIGS[platform].capabilities.authMethod;
    assert.ok(
      validMethods.includes(method),
      `${platform}.capabilities.authMethod must be 'oauth' or 'token', got '${method}'`,
    );
  }
});

test("authMethod and tokenBasedAuth are consistent", () => {
  for (const platform of allPlatforms) {
    const caps = PLATFORM_CONFIGS[platform].capabilities;
    const expected = caps.authMethod === "token";
    assert.equal(
      caps.tokenBasedAuth,
      expected,
      `${platform}: tokenBasedAuth=${caps.tokenBasedAuth} should match authMethod='${caps.authMethod}'`,
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
  assert.equal(telegram.authMethod, "token", "TELEGRAM must use token auth");
  assert.equal(telegram.tokenBasedAuth, true, "TELEGRAM must be token-based (deprecated flag)");
  assert.equal(telegram.refreshableTokens, false, "TELEGRAM bot tokens do not refresh");

  // Caption limits that differ from the body limit must be declared.
  assert.equal(PLATFORM_CONFIGS[Platform.TELEGRAM].capabilities.captionMaxWithMedia, 1024);
  assert.equal(PLATFORM_CONFIGS[Platform.INSTAGRAM].capabilities.captionMaxWithMedia, 2200);

  // X's hard 280-character ceiling is a product-level constraint, not a toggle.
  assert.equal(PLATFORM_CONFIGS[Platform.TWITTER].maxTextLength, 280);

  // Carousel is declared for NO platform today: no adapter transmits more than
  // one media item, so declaring it would advertise a feature that silently
  // drops the extra files. Move a platform into this list only alongside a real
  // carousel implementation.
  const carouselPlatforms = allPlatforms.filter((p) => PLATFORM_CONFIGS[p].capabilities.carousel);
  assert.deepEqual(carouselPlatforms, [], `carousel is not implemented yet: ${carouselPlatforms.join(", ")}`);

  // Video is declared only where the adapter genuinely uploads video.
  const videoPlatforms = allPlatforms.filter((p) => PLATFORM_CONFIGS[p].capabilities.video);
  assert.deepEqual(videoPlatforms.sort(), [Platform.TIKTOK, Platform.YOUTUBE].sort());

  // Image is declared only where the adapter genuinely sends an image.
  const imagePlatforms = allPlatforms.filter((p) => PLATFORM_CONFIGS[p].capabilities.image);
  assert.deepEqual(
    imagePlatforms.sort(),
    [Platform.FACEBOOK, Platform.INSTAGRAM, Platform.LINKEDIN, Platform.TELEGRAM].sort(),
  );

  // The legacy `supportsVideo` flag must agree with capabilities.video, or the UI
  // and validation disagree about the same platform.
  for (const platform of allPlatforms) {
    assert.equal(
      PLATFORM_CONFIGS[platform].supportsVideo,
      PLATFORM_CONFIGS[platform].capabilities.video,
      `${platform}: supportsVideo disagrees with capabilities.video`,
    );
  }
});

test("registry helpers return correct data", () => {
  // getCapabilities returns the full capability object
  const telegramCaps = getCapabilities(Platform.TELEGRAM);
  assert.equal(telegramCaps.authMethod, "token");
  assert.equal(telegramCaps.text, true);

  // getConfig returns the full config
  const linkedinConfig = getConfig(Platform.LINKEDIN);
  assert.equal(linkedinConfig.name, "LinkedIn");
  assert.equal(linkedinConfig.maxTextLength, 3000);

  // isTokenBased correctly identifies token-based platforms
  assert.equal(isTokenBased(Platform.TELEGRAM), true);
  assert.equal(isTokenBased(Platform.LINKEDIN), false);
  assert.equal(isTokenBased(Platform.TWITTER), false);

  // getAuthMethod returns the correct auth method
  assert.equal(getAuthMethod(Platform.TELEGRAM), "token");
  assert.equal(getAuthMethod(Platform.FACEBOOK), "oauth");
});

test("filterByCapability returns correct platform sets", () => {
  // OAuth platforms (6 of 7)
  const oauthPlatforms = platformsByAuthMethod("oauth");
  assert.equal(oauthPlatforms.length, 6);
  assert.ok(!oauthPlatforms.includes(Platform.TELEGRAM));

  // Token-based platforms (just Telegram for now)
  const tokenPlatforms = platformsByAuthMethod("token");
  assert.deepEqual(tokenPlatforms, [Platform.TELEGRAM]);

  // Platforms with native scheduling
  const nativeScheduling = platformsWithNativeScheduling();
  assert.ok(nativeScheduling.includes(Platform.FACEBOOK));
  assert.ok(nativeScheduling.includes(Platform.YOUTUBE));
  assert.ok(nativeScheduling.includes(Platform.TELEGRAM));

  // Platforms requiring media
  const mediaRequired = platformsRequiringMedia();
  assert.ok(mediaRequired.includes(Platform.INSTAGRAM));
  assert.ok(mediaRequired.includes(Platform.TIKTOK));
  assert.ok(mediaRequired.includes(Platform.YOUTUBE));
  assert.ok(!mediaRequired.includes(Platform.LINKEDIN));
  assert.ok(!mediaRequired.includes(Platform.TELEGRAM));
});

test("filterByCapability with custom predicates", () => {
  // Platforms that support hashtags
  const withHashtags = filterByCapability((caps) => caps.hashtags);
  assert.equal(withHashtags.length, 7); // All platforms support hashtags

  // Platforms that support stories
  const withStories = filterByCapability((caps) => caps.stories);
  assert.ok(withStories.includes(Platform.INSTAGRAM));
  assert.ok(withStories.includes(Platform.FACEBOOK));
  assert.ok(!withStories.includes(Platform.LINKEDIN));

  // Platforms that support threading
  const withThreads = filterByCapability((caps) => caps.threads);
  assert.ok(withThreads.includes(Platform.TWITTER));
  assert.ok(withThreads.includes(Platform.TELEGRAM));
});

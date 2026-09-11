import { test } from "node:test";
import assert from "node:assert/strict";
import { Platform } from "@prisma/client";
import { BasePlatformAdapter } from "../../src/lib/adapters/base";
import type { OAuthTokens, AccountInfo, PostOptions, PostResult } from "../../src/types/platform";

/**
 * A probe adapter: the content rules live in BasePlatformAdapter.validatePostContent,
 * which is protected. Subclassing lets the tests exercise the real rules for any
 * platform's declared config without touching the network.
 */
class ProbeAdapter extends BasePlatformAdapter {
  platform: Platform;
  constructor(platform: Platform) {
    super();
    this.platform = platform;
  }
  getOAuthUrl(): string {
    return "https://example.invalid/oauth";
  }
  async exchangeCodeForTokens(): Promise<OAuthTokens> {
    return { accessToken: "probe" };
  }
  async refreshAccessToken(): Promise<OAuthTokens> {
    return { accessToken: "probe" };
  }
  async getAccountInfo(): Promise<AccountInfo> {
    return { platformUserId: "probe" };
  }
  async createPost(_token: string, options: PostOptions): Promise<PostResult> {
    const error = this.validatePostContent(options);
    return error ? { success: false, error } : { success: true, platformPostId: "probe" };
  }
  validateCredentials() {
    return { valid: true, missing: [] as string[] };
  }
}

const post = (platform: Platform, text: string, media: string[] = []) =>
  new ProbeAdapter(platform).createPost("probe", { text, mediaUrls: media });

test("Instagram refuses a text-only post", async () => {
  const r = await post(Platform.INSTAGRAM, "hello world");
  assert.equal(r.success, false);
  assert.match(r.error ?? "", /requires at least one media item/);
});

test("Instagram refuses a media type it cannot publish (PNG/WebP are unsupported)", async () => {
  const r = await post(Platform.INSTAGRAM, "caption", ["https://cdn.example/a.png"]);
  assert.equal(r.success, false);
  assert.match(r.error ?? "", /Unsupported media type for Instagram: image\/png/);
});

test("Instagram accepts a JPEG and a two-image carousel", async () => {
  const single = await post(Platform.INSTAGRAM, "caption", ["https://cdn.example/a.jpg"]);
  assert.equal(single.success, true, single.error);
  const carousel = await post(Platform.INSTAGRAM, "caption", [
    "https://cdn.example/a.jpg",
    "https://cdn.example/b.jpg",
  ]);
  assert.equal(carousel.success, true, carousel.error);
});

test("TikTok refuses multiple videos (single-video platform) and any still image", async () => {
  const twoVideos = await post(Platform.TIKTOK, "caption", [
    "https://cdn.example/a.mp4",
    "https://cdn.example/b.mp4",
  ]);
  assert.equal(twoVideos.success, false);
  // TikTok allows exactly one media item, so the count guard fires before the
  // (also true) carousel rule — both are correct rejections.
  assert.match(twoVideos.error ?? "", /Too many media items|does not support carousel posts/);

  const image = await post(Platform.TIKTOK, "caption", ["https://cdn.example/a.jpg"]);
  assert.equal(image.success, false);
  assert.match(image.error ?? "", /Unsupported media type for TikTok/);
});

test("a platform with room for several items still rejects a carousel it cannot post", async () => {
  // LinkedIn allows 20 media items but publishes only single-media posts today.
  const carousel = await post(Platform.LINKEDIN, "caption", [
    "https://cdn.example/a.jpg",
    "https://cdn.example/b.jpg",
  ]);
  assert.equal(carousel.success, false);
  assert.match(carousel.error ?? "", /does not support carousel posts/);
});

test("X enforces the 280-character ceiling", async () => {
  const ok = await post(Platform.TWITTER, "x".repeat(280));
  assert.equal(ok.success, true, ok.error);
  const tooLong = await post(Platform.TWITTER, "x".repeat(281));
  assert.equal(tooLong.success, false);
  assert.match(tooLong.error ?? "", /exceeds maximum length of 280 characters/);
});

test("Telegram allows a long text post but caps a caption", async () => {
  const long = await post(Platform.TELEGRAM, "x".repeat(3000));
  assert.equal(long.success, true, long.error);

  const cappedCaption = await post(Platform.TELEGRAM, "x".repeat(1500), ["https://cdn.example/a.jpg"]);
  assert.equal(cappedCaption.success, false);
  assert.match(cappedCaption.error ?? "", /Caption exceeds 1024 characters when media is attached/);

  const okCaption = await post(Platform.TELEGRAM, "x".repeat(1000), ["https://cdn.example/a.jpg"]);
  assert.equal(okCaption.success, true, okCaption.error);
});

test("media count limits are enforced", async () => {
  const tooMany = await post(
    Platform.LINKEDIN,
    "caption",
    Array.from({ length: 21 }, (_, i) => `https://cdn.example/${i}.jpg`),
  );
  assert.equal(tooMany.success, false);
  assert.match(tooMany.error ?? "", /Too many media items\. Maximum is 20/);
});

test("unknown extensions are not guessed into a false rejection", async () => {
  const r = await post(Platform.TELEGRAM, "caption", ["https://cdn.example/media-without-extension"]);
  assert.equal(r.success, true, r.error);
});

test("a clean post always passes validation", async () => {
  for (const platform of Object.values(Platform) as Platform[]) {
    const needsMedia = new ProbeAdapter(platform).config.capabilities.mediaRequired;
    const r = await post(platform, "hello", needsMedia ? ["https://cdn.example/a.mp4"] : []);
    if (needsMedia && platform === Platform.TIKTOK) {
      assert.equal(r.success, true, `${platform}: ${r.error}`);
    } else if (!needsMedia) {
      assert.equal(r.success, true, `${platform}: ${r.error}`);
    }
  }
});

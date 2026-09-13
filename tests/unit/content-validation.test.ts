import { test } from "node:test";
import assert from "node:assert/strict";
import { Platform } from "@prisma/client";
import { BasePlatformAdapter } from "../../src/lib/adapters/base";
import type {
  OAuthTokens,
  AccountInfo,
  PostOptions,
  PostMediaDescriptor,
  PostResult,
} from "../../src/types/platform";

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
    const invalid = this.validatePostContent(options);
    return invalid
      ? { success: false, error: invalid.message, code: invalid.code }
      : { success: true, platformPostId: "probe" };
  }
  validateCredentials() {
    return { valid: true, missing: [] as string[] };
  }
}

const post = (platform: Platform, text: string, media: string[] = [], descriptors?: PostMediaDescriptor[]) =>
  new ProbeAdapter(platform).createPost("probe", { text, mediaUrls: media, media: descriptors });

test("Instagram refuses a text-only post", async () => {
  const r = await post(Platform.INSTAGRAM, "hello world");
  assert.equal(r.success, false);
  assert.match(r.error ?? "", /requires at least one media item/);
});

test("Instagram refuses a media type it cannot publish (PNG/WebP are unsupported)", async () => {
  const r = await post(Platform.INSTAGRAM, "caption", ["https://cdn.example/a.png"]);
  assert.equal(r.success, false);
  assert.match(r.error ?? "", /Unsupported media type for Instagram: image\/png/);
  assert.equal(r.code, "UNSUPPORTED_MEDIA");
});

test("Instagram accepts a single JPEG and refuses a carousel it cannot publish", async () => {
  const single = await post(Platform.INSTAGRAM, "caption", ["https://cdn.example/a.jpg"]);
  assert.equal(single.success, true, single.error);

  // Carousel is declared false because the adapter only ever sends
  // `mediaUrls[0]`. Accepting two images would silently drop the second.
  const carousel = await post(Platform.INSTAGRAM, "caption", [
    "https://cdn.example/a.jpg",
    "https://cdn.example/b.jpg",
  ]);
  assert.equal(carousel.success, false);
  assert.match(carousel.error ?? "", /does not support carousel posts/);
  assert.equal(carousel.code, "UNSUPPORTED_MEDIA");
});

test("TikTok refuses multiple videos (single-video platform) and any still image", async () => {
  const twoVideos = await post(Platform.TIKTOK, "caption", [
    "https://cdn.example/a.mp4",
    "https://cdn.example/b.mp4",
  ]);
  assert.equal(twoVideos.success, false);
  assert.match(twoVideos.error ?? "", /Too many media items|does not support carousel posts/);

  const image = await post(Platform.TIKTOK, "caption", ["https://cdn.example/a.jpg"]);
  assert.equal(image.success, false);
  // TikTok declares image:false, so the capability rule names the real reason
  // (images are not supported at all) ahead of the type allowlist.
  assert.match(image.error ?? "", /does not support image|Unsupported media type for TikTok/);
  assert.equal(image.code, "UNSUPPORTED_MEDIA");
});

test("LinkedIn refuses a carousel it cannot post", async () => {
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

test("multi-media is refused when the platform cannot publish a carousel", async () => {
  const many = await post(
    Platform.LINKEDIN,
    "caption",
    Array.from({ length: 21 }, (_, i) => `https://cdn.example/${i}.jpg`),
  );
  assert.equal(many.success, false);
  // Carousel is checked first, so the message names the real reason; the raw
  // count ceiling stays behind it as a guard for a future carousel connector.
  assert.match(many.error ?? "", /does not support carousel posts|Too many media items/);
});

// --- Capability honesty: nothing may be accepted and then dropped ------------

test("X refuses media instead of publishing the text alone", async () => {
  const r = await post(Platform.TWITTER, "text plus an image", ["https://cdn.example/a.jpg"]);
  assert.equal(r.success, false);
  assert.equal(r.code, "UNSUPPORTED_MEDIA");
  assert.match(r.error ?? "", /does not support media attachments/);
});

test("video is refused on every platform that does not implement it", async () => {
  const video = ["https://cdn.example/clip.mp4"];
  for (const platform of [Platform.LINKEDIN, Platform.FACEBOOK, Platform.INSTAGRAM, Platform.TELEGRAM]) {
    const r = await post(platform, "caption", video);
    assert.equal(r.success, false, `${platform} must refuse video`);
    assert.equal(r.code, "UNSUPPORTED_MEDIA", `${platform} code`);
    assert.match(r.error ?? "", /does not support video|Unsupported media type|does not support media/);
  }
});

test("video-capable platforms still accept a video", async () => {
  for (const platform of [Platform.YOUTUBE, Platform.TIKTOK]) {
    const r = await post(platform, "my clip", ["https://cdn.example/clip.mp4"]);
    assert.equal(r.success, true, `${platform}: ${r.error}`);
  }
});

test("Facebook refuses video and a carousel", async () => {
  const vid = await post(Platform.FACEBOOK, "caption", ["https://cdn.example/clip.mp4"]);
  assert.equal(vid.success, false);
  assert.equal(vid.code, "UNSUPPORTED_MEDIA");

  const carousel = await post(Platform.FACEBOOK, "caption", [
    "https://cdn.example/a.jpg",
    "https://cdn.example/b.jpg",
  ]);
  assert.equal(carousel.success, false);
  assert.match(carousel.error ?? "", /does not support carousel posts/);
});

// --- Type and size validation ------------------------------------------------

test("a media URL whose type cannot be determined is refused, not guessed", async () => {
  // Previously a null MIME skipped every check — which is how a `data:` URL
  // slipped past validation. Unknown types now fail closed.
  const r = await post(Platform.TELEGRAM, "caption", ["https://cdn.example/media-without-extension"]);
  assert.equal(r.success, false);
  assert.equal(r.code, "UNSUPPORTED_MEDIA");
  assert.match(r.error ?? "", /Could not determine the media type/);
});

test("a data: URL cannot bypass validation", async () => {
  const dataUrl = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==";
  // Instagram supports JPEG only, so a PNG data URL must be rejected — the
  // stored type travels with the descriptor instead of being guessed.
  const r = await post(Platform.INSTAGRAM, "caption", [dataUrl], [
    { url: dataUrl, mimeType: "image/png", sizeBytes: 128 },
  ]);
  assert.equal(r.success, false);
  assert.match(r.error ?? "", /Unsupported media type for Instagram: image\/png/);
});

test("per-platform size limits are enforced from real metadata", async () => {
  const url = "https://cdn.example/huge.jpg";
  const sixMb = 6 * 1024 * 1024;
  const tooBig = await post(Platform.LINKEDIN, "caption", [url], [
    { url, mimeType: "image/jpeg", sizeBytes: sixMb },
  ]);
  assert.equal(tooBig.success, false);
  assert.equal(tooBig.code, "MEDIA_INVALID");
  assert.match(tooBig.error ?? "", /allows at most 5 MB per image/);

  const fine = await post(Platform.LINKEDIN, "caption", [url], [
    { url, mimeType: "image/jpeg", sizeBytes: 1024 },
  ]);
  assert.equal(fine.success, true, fine.error);
});

test("a clean post always passes validation", async () => {
  // Pick media the platform actually supports instead of assuming every
  // media-required platform takes the same file.
  const mediaFor = (platform: Platform): string[] => {
    const caps = new ProbeAdapter(platform).config.capabilities;
    if (caps.video) return ["https://cdn.example/a.mp4"];
    if (caps.image) return ["https://cdn.example/a.jpg"];
    return [];
  };

  for (const platform of Object.values(Platform) as Platform[]) {
    const needsMedia = new ProbeAdapter(platform).config.capabilities.mediaRequired;
    const media = needsMedia ? mediaFor(platform) : [];
    const r = await post(platform, "hello", media);
    assert.equal(r.success, true, `${platform}: ${r.error}`);
  }
});

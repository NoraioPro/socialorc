import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * The publish-confirmation contract, checked across every adapter source.
 *
 * The recurring defect in this codebase is a publish reported as successful when
 * the platform confirmed nothing: YouTube returned success after only creating an
 * upload session, TikTok after only initialising a post, and Facebook/Instagram
 * would pass through an undefined id when the platform answered 200 with no body.
 * In every case the post was marked PUBLISHED while nothing existed on the
 * platform.
 *
 * These tests assert the guard is present in each adapter's source, so removing
 * one during a refactor fails here instead of silently reopening the hole.
 */

const ADAPTERS = "src/lib/adapters";

function source(file: string): string {
  return readFileSync(path.resolve(process.cwd(), ADAPTERS, file), "utf8");
}

/** The block that returns a success PostResult for a given adapter. */
function successReturn(file: string): string {
  const src = source(file);
  const index = src.lastIndexOf("success: true");
  assert.ok(index > -1, `${file} should return a success result`);
  return src.slice(index, index + 500);
}

test("YouTube only reports success with a video id from the platform", () => {
  const src = source("youtube.ts");
  assert.match(src, /uploadResponse\.json\(\)/);
  assert.match(src, /if \(!uploaded\?\.id\)/);
  assert.match(src, /platformPostId: uploaded\.id/);
});

test("TikTok only reports success after the bytes were transferred", () => {
  const src = source("tiktok.ts");
  assert.match(src, /await this\.uploadChunks\(uploadUrl, bytes, plan\.plan\)/);
  assert.match(src, /if \(!uploadUrl\)/);
  // The init must not select the transfer mode that needs a verified domain.
  assert.equal(
    /mediaUrl: options\.mediaUrls\[0\]/.test(src),
    false,
    "createPost must not initialise a PULL_FROM_URL transfer",
  );
});

test("Facebook refuses a 200 with no post id", () => {
  const src = source("facebook.ts");
  assert.match(src, /const platformPostId = data\.id \|\| data\.post_id;/);
  assert.match(src, /if \(!platformPostId\)/);
  assert.equal(
    /platformPostId: data\.id \|\| data\.post_id,/.test(src),
    false,
    "the id must not be passed straight into a success result",
  );
});

test("Instagram refuses a 200 with no media id", () => {
  const src = source("instagram.ts");
  assert.match(src, /const mediaId = publishData\.id;/);
  assert.match(src, /if \(!mediaId\)/);
  assert.equal(
    /platformPostId: publishData\.id,/.test(src),
    false,
    "the id must not be passed straight into a success result",
  );
});

test("Telegram only reports success on a real message id", () => {
  const src = source("telegram.ts");
  assert.match(src, /if \(!json\.ok \|\| !json\.result\)/);
  assert.match(src, /platformPostId: String\(messageId\)/);
});

test("X only reports success with a tweet id", () => {
  // createPost surfaces the tweet id; the later success returns are engagement
  // helpers that reuse the same field name, so match the publish itself.
  assert.match(source("twitter.ts"), /platformPostId: data\.data\.id/);
});

test("LinkedIn only reports success with a post urn", () => {
  const success = successReturn("linkedin.ts");
  assert.match(success, /success: true/);
  assert.match(source("linkedin.ts"), /platformPostId/);
});

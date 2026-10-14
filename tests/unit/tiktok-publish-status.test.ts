/**
 * TikTok publish follow-through.
 *
 * Uploading the chunks is not the post existing: TikTok then processes the
 * video and can still reject it. createPost used to report success as soon as
 * the last chunk was accepted, and the status endpoint was never read by the
 * worker, so a rejected video was recorded as published (with the publish id
 * standing in for a post id that never came).
 *
 * Now: a short bounded poll inside createPost, a `pending` result when TikTok
 * has not decided yet, and a read-only checkPublishStatus the worker calls on
 * later ticks. fetch is stubbed; TikTok is never called.
 */

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { TikTokAdapter, extractTikTokPublicPostIds } from "../../src/lib/adapters/tiktok";
import {
  TIKTOK_CREATOR_INFO_URL,
  TIKTOK_DIRECT_POST_INIT_URL,
  TIKTOK_STATUS_FETCH_URL,
} from "../../src/lib/social/tiktok/constants";
import type { PostOptions } from "../../src/types/platform";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const UPLOAD_URL = "https://upload.example.invalid/session";
const MEDIA_URL = "https://cdn.example.invalid/clip.mp4";
// Larger than 2^53: JSON.parse would turn this into a different number.
const PUBLIC_ID = "7351234567890123456";

const videoPost = {
  text: "A clip",
  mediaUrls: [MEDIA_URL],
  additionalOptions: { accountUsername: "orc.creator" },
} as unknown as PostOptions;

/** Status bodies are raw strings so the int64 id reaches the adapter unrounded. */
function stubTikTok(statusBodies: string[]) {
  const calls: string[] = [];
  let statusIndex = 0;
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    calls.push(url);
    if (url === MEDIA_URL) return new Response(new Uint8Array(100), { status: 200 });
    if (url === TIKTOK_CREATOR_INFO_URL) {
      return new Response(
        JSON.stringify({ data: { privacy_level_options: ["PUBLIC_TO_EVERYONE", "SELF_ONLY"] } }),
      );
    }
    if (url === TIKTOK_DIRECT_POST_INIT_URL) {
      return new Response(JSON.stringify({ data: { publish_id: "v_pub_1", upload_url: UPLOAD_URL } }));
    }
    if (url === UPLOAD_URL) return new Response("{}", { status: 201 });
    if (url === TIKTOK_STATUS_FETCH_URL) {
      const body = statusBodies[Math.min(statusIndex, statusBodies.length - 1)];
      statusIndex += 1;
      return new Response(body, { status: 200 });
    }
    return new Response("unexpected", { status: 500 });
  }) as typeof fetch;
  return calls;
}

const status = (value: string, extra = "") =>
  `{"data":{"status":"${value}"${extra}},"error":{"code":"ok","message":"","log_id":"x"}}`;

function fastAdapter(budgetMs = 1_000): TikTokAdapter {
  const adapter = new TikTokAdapter();
  adapter.inlinePollBudgetMs = budgetMs;
  adapter.inlinePollIntervalMs = 1;
  return adapter;
}

test("int64 public post ids survive intact", () => {
  assert.deepEqual(
    extractTikTokPublicPostIds(`{"data":{"publicaly_available_post_id":[${PUBLIC_ID}, 42]}}`),
    [PUBLIC_ID, "42"],
  );
  assert.deepEqual(extractTikTokPublicPostIds(`{"data":{"publicaly_available_post_id":[]}}`), []);
  assert.deepEqual(extractTikTokPublicPostIds("{}"), []);
});

test("a publish TikTok completes inline is reported with the public id and URL", async () => {
  stubTikTok([
    status("PROCESSING_UPLOAD"),
    status("PUBLISH_COMPLETE", `,"publicaly_available_post_id":[${PUBLIC_ID}]`),
  ]);
  const result = await fastAdapter().createPost("token", videoPost);
  assert.equal(result.success, true);
  assert.equal(result.pending, undefined);
  assert.equal(result.platformPostId, PUBLIC_ID);
  assert.equal(result.platformPostUrl, `https://www.tiktok.com/@orc.creator/video/${PUBLIC_ID}`);
});

test("a video TikTok rejects during processing is a failure, not a publish", async () => {
  stubTikTok([status("FAILED", `,"fail_reason":"duration_check_failed"`)]);
  const result = await fastAdapter().createPost("token", videoPost);
  assert.equal(result.success, false);
  assert.match(result.error ?? "", /duration_check_failed/);
  assert.equal(result.code, "CONTENT_INVALID");
});

test("still processing when the inline budget runs out -> pending with the publish id", async () => {
  const calls = stubTikTok([status("PROCESSING_UPLOAD")]);
  const result = await fastAdapter(0).createPost("token", videoPost);
  assert.equal(result.success, true);
  assert.equal(result.pending, true);
  assert.equal(result.platformPostId, "v_pub_1");
  assert.equal(result.platformPostUrl, undefined);
  assert.equal(calls.filter((u) => u === UPLOAD_URL).length, 1);
});

test("a status read that errors after the upload is pending, never a failure", async () => {
  // A failure here would invite the worker to retry — i.e. upload a second copy.
  globalThis.fetch = realFetch;
  stubTikTok([]);
  const adapter = fastAdapter();
  const inner = globalThis.fetch;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) =>
    String(input) === TIKTOK_STATUS_FETCH_URL
      ? new Response(JSON.stringify({ error: { code: "internal_error" } }), { status: 500 })
      : inner(input, init)) as typeof fetch;

  const result = await adapter.createPost("token", videoPost);
  assert.equal(result.success, true);
  assert.equal(result.pending, true);
  assert.equal(result.platformPostId, "v_pub_1");
});

test("checkPublishStatus only reads status — it never uploads", async () => {
  const calls = stubTikTok([status("PROCESSING_DOWNLOAD")]);
  const adapter = fastAdapter();

  const pending = await adapter.checkPublishStatus("token", "v_pub_1");
  assert.equal(pending.success, true);
  assert.equal(pending.pending, true);
  assert.deepEqual(calls, [TIKTOK_STATUS_FETCH_URL]);
});

test("checkPublishStatus: complete without a public id (SELF_ONLY) keeps the publish id, no URL", async () => {
  stubTikTok([status("PUBLISH_COMPLETE", `,"publicaly_available_post_id":[]`)]);
  const result = await fastAdapter().checkPublishStatus("token", "v_pub_1", {
    additionalOptions: { accountUsername: "orc.creator" },
  });
  assert.equal(result.success, true);
  assert.equal(result.pending, undefined);
  assert.equal(result.platformPostId, "v_pub_1");
  assert.equal(result.platformPostUrl, undefined);
});

test("checkPublishStatus maps an expired token to AUTH_EXPIRED", async () => {
  globalThis.fetch = (async () =>
    new Response(JSON.stringify({ error: { code: "access_token_invalid", message: "expired" } }), {
      status: 401,
    })) as typeof fetch;
  const result = await fastAdapter().checkPublishStatus("token", "v_pub_1");
  assert.equal(result.success, false);
  assert.equal(result.code, "AUTH_EXPIRED");
});

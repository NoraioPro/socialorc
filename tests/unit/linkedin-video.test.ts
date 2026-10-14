/**
 * LinkedIn video publishing through the Videos API.
 *
 * Request shapes pinned against
 * https://learn.microsoft.com/linkedin/marketing/community-management/shares/videos-api
 * and .../posts-api (checked 2026-10-14):
 *   initializeUpload {owner, fileSizeBytes} -> PUT each part's byte range to its
 *   uploadUrl, keeping the ETag -> finalizeUpload {video, uploadToken,
 *   uploadedPartIds in instruction order} -> post content.media.id = video urn.
 * fetch is stubbed; LinkedIn is never called.
 */

import assert from "node:assert/strict";
import { afterEach, test } from "node:test";

import { LinkedInAdapter, byteRangeReader } from "../../src/lib/adapters/linkedin";
import type { PostOptions } from "../../src/types/platform";

process.env.LINKEDIN_CLIENT_ID = "78abcdefghijkl";
process.env.LINKEDIN_CLIENT_SECRET = "s".repeat(20) + "LinkedInSecret01";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const MEDIA_URL = "https://cdn.example.invalid/clip.mp4";
const API = "https://api.linkedin.com";
const PART = 4 * 1024 * 1024;
const VIDEO_URN = "urn:li:video:C5505AQH";

interface Call {
  url: string;
  method: string;
  headers: Headers;
  json?: Record<string, unknown>;
  bytes?: Uint8Array;
}

function stream(total: number): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream({
    pull(c) {
      if (sent >= total) return c.close();
      const n = Math.min(1_000_003, total - sent);
      const chunk = new Uint8Array(n);
      for (let i = 0; i < n; i += 1) chunk[i] = (sent + i) % 253;
      sent += n;
      c.enqueue(chunk);
    },
  });
}

function stub(opts: {
  total: number;
  videoStatuses?: string[];
  partStatus?: number;
  omitEtag?: boolean;
}) {
  const calls: Call[] = [];
  let statusIndex = 0;
  const parts = Math.ceil(opts.total / PART);
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const headers = new Headers(init?.headers as HeadersInit | undefined);
    const call: Call = { url, method, headers };
    if (typeof init?.body === "string") call.json = JSON.parse(init.body);
    if (init?.body instanceof Uint8Array) call.bytes = new Uint8Array(init.body);
    calls.push(call);

    if (url === `${API}/v2/userinfo`) return Response.json({ sub: "AbC123", name: "Member" });
    if (url === MEDIA_URL) {
      return new Response(stream(opts.total), { headers: { "content-length": String(opts.total) } });
    }
    if (url === `${API}/rest/videos?action=initializeUpload`) {
      return Response.json({
        value: {
          video: VIDEO_URN,
          uploadToken: "tok",
          uploadUrlsExpireAt: 0,
          // Deliberately out of order: the adapter must follow byte order.
          uploadInstructions: Array.from({ length: parts }, (_, i) => ({
            uploadUrl: `https://www.linkedin.com/dms-uploads/part${i}`,
            firstByte: i * PART,
            lastByte: Math.min((i + 1) * PART, opts.total) - 1,
          })).reverse(),
        },
      });
    }
    if (url.startsWith("https://www.linkedin.com/dms-uploads/part")) {
      const index = url.slice(-1);
      return new Response(null, {
        status: opts.partStatus ?? 200,
        headers: opts.omitEtag ? {} : { etag: `/ambry/etag-${index}.bin` },
      });
    }
    if (url === `${API}/rest/videos?action=finalizeUpload`) return new Response(null, { status: 200 });
    if (url === `${API}/rest/videos/${encodeURIComponent(VIDEO_URN)}`) {
      const statuses = opts.videoStatuses ?? ["PROCESSING"];
      const status = statuses[Math.min(statusIndex, statuses.length - 1)];
      statusIndex += 1;
      return Response.json({
        id: VIDEO_URN,
        status,
        ...(status === "PROCESSING_FAILED" ? { processingFailureReason: "Unsupported codec" } : {}),
      });
    }
    if (url === `${API}/rest/posts`) {
      return new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:ugcPost:99" } });
    }
    return new Response("unexpected", { status: 500 });
  }) as typeof fetch;
  return calls;
}

function adapter(): LinkedInAdapter {
  const a = new LinkedInAdapter();
  a.videoReadyIntervalMs = 1;
  a.videoReadyBudgetMs = 200;
  return a;
}

const videoPost = (total: number): PostOptions => ({
  text: "Launch clip",
  mediaUrls: [MEDIA_URL],
  media: [{ url: MEDIA_URL, mimeType: "video/mp4", sizeBytes: total }],
  additionalOptions: { title: "Launch" },
});

test("a video is uploaded part by part, finalized with the ETags in order, and posted by urn", async () => {
  const total = 2 * PART + 12_345;
  const calls = stub({ total });
  const result = await adapter().createPost("token", videoPost(total));
  assert.equal(result.success, true, result.error);
  assert.equal(result.platformPostId, "urn:li:ugcPost:99");

  const init = calls.find((c) => c.url.endsWith("action=initializeUpload"))!;
  assert.deepEqual(init.json, {
    initializeUploadRequest: {
      owner: "urn:li:person:AbC123",
      fileSizeBytes: total,
      uploadCaptions: false,
      uploadThumbnail: false,
    },
  });
  assert.match(init.headers.get("linkedin-version") ?? "", /^\d{6}$/);
  assert.equal(init.headers.get("x-restli-protocol-version"), "2.0.0");

  const puts = calls.filter((c) => c.method === "PUT");
  assert.deepEqual(
    puts.map((p) => p.url),
    ["part0", "part1", "part2"].map((p) => `https://www.linkedin.com/dms-uploads/${p}`),
  );
  assert.deepEqual(
    puts.map((p) => p.bytes?.byteLength),
    [PART, PART, 12_345],
  );
  // Bytes arrive intact, in order, and no part carries the whole file.
  const all = puts.flatMap((p) => [...(p.bytes ?? [])]);
  assert.equal(all.length, total);
  assert.ok(all.every((b, i) => b === i % 253));

  const finalize = calls.find((c) => c.url.endsWith("action=finalizeUpload"))!;
  assert.deepEqual(finalize.json, {
    finalizeUploadRequest: {
      video: VIDEO_URN,
      uploadToken: "tok",
      uploadedPartIds: ["/ambry/etag-0.bin", "/ambry/etag-1.bin", "/ambry/etag-2.bin"],
    },
  });

  const post = calls.find((c) => c.url === `${API}/rest/posts`)!;
  assert.deepEqual((post.json as { content: unknown }).content, {
    media: { id: VIDEO_URN, title: "Launch" },
  });
});

test("the post waits until LinkedIn has registered the upload", async () => {
  const calls = stub({ total: 100_000, videoStatuses: ["WAITING_UPLOAD", "WAITING_UPLOAD", "AVAILABLE"] });
  const result = await adapter().createPost("token", videoPost(100_000));
  assert.equal(result.success, true, result.error);
  assert.equal(calls.filter((c) => c.url.includes("/rest/videos/")).length, 3);
});

test("a video LinkedIn fails to process is never posted", async () => {
  const calls = stub({ total: 100_000, videoStatuses: ["PROCESSING_FAILED"] });
  const result = await adapter().createPost("token", videoPost(100_000));
  assert.equal(result.success, false);
  assert.match(result.error ?? "", /Unsupported codec/);
  assert.equal(result.code, "MEDIA_INVALID");
  assert.equal(calls.some((c) => c.url === `${API}/rest/posts`), false);
});

test("a video stuck in WAITING_UPLOAD is not posted", async () => {
  const calls = stub({ total: 100_000, videoStatuses: ["WAITING_UPLOAD"] });
  const result = await adapter().createPost("token", videoPost(100_000));
  assert.equal(result.success, false);
  assert.equal(calls.some((c) => c.url === `${API}/rest/posts`), false);
});

test("a part without an ETag fails the upload — finalize cannot be built without it", async () => {
  const calls = stub({ total: 100_000, omitEtag: true });
  const result = await adapter().createPost("token", videoPost(100_000));
  assert.equal(result.success, false);
  assert.equal(calls.some((c) => c.url.endsWith("action=finalizeUpload")), false);
});

test("a video under LinkedIn's 75 KB minimum is refused before any upload", async () => {
  const calls = stub({ total: 10_000 });
  const result = await adapter().createPost("token", videoPost(10_000));
  assert.equal(result.success, false);
  assert.equal(result.code, "MEDIA_INVALID");
  assert.equal(calls.some((c) => c.url.endsWith("action=initializeUpload")), false);
});

test("non-MP4 video is refused by validation", async () => {
  const calls = stub({ total: 100_000 });
  const result = await adapter().createPost("token", {
    text: "x",
    mediaUrls: [MEDIA_URL],
    media: [{ url: MEDIA_URL, mimeType: "video/quicktime", sizeBytes: 100_000 }],
  });
  assert.equal(result.success, false);
  assert.equal(result.code, "UNSUPPORTED_MEDIA");
  assert.equal(calls.length, 0);
});

test("byteRangeReader serves exact ranges across uneven stream pieces", async () => {
  const reader = byteRangeReader(stream(2_500_000));
  const a = await reader.read(1_500_000);
  const b = await reader.read(1_500_000);
  assert.equal(a.byteLength, 1_500_000);
  assert.equal(b.byteLength, 1_000_000);
  assert.equal(b[0], 1_500_000 % 253);
  assert.equal(await reader.exhausted(), true);
});

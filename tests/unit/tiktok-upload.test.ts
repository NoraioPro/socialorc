import { test } from "node:test";
import assert from "node:assert/strict";
import { tiktokAdapter } from "../../src/lib/adapters/tiktok";
import {
  TIKTOK_CREATOR_INFO_URL,
  TIKTOK_DIRECT_POST_INIT_URL,
} from "../../src/lib/social/tiktok/constants";
import type { PostOptions } from "../../src/types/platform";

/**
 * Regression tests for the TikTok video transfer.
 *
 * `createPost` used to call the Direct Post INIT endpoint with PULL_FROM_URL and
 * return `success: true` immediately. Nothing was transferred: PULL_FROM_URL only
 * works for a domain whose ownership the developer has verified with TikTok - the
 * project's own validateMediaForPlatform rejects it for exactly that reason - and
 * our media lives on a Vercel Blob host we cannot verify. The post was recorded
 * as published while the video was never sent.
 *
 * These tests pin the honest behaviour: the bytes are read from the media URL and
 * PUT to TikTok as chunks with a Content-Range, and success is reported only once
 * the transfer was accepted.
 */

const realFetch = globalThis.fetch;
const UPLOAD_URL = "https://upload.example.invalid/session";
const MEDIA_URL = "https://cdn.example.invalid/clip.mp4";
const VIDEO_BYTES = 200;

interface Call {
  url: string;
  method: string;
  contentRange: string | null;
  bytes: number;
  json: string | null;
}

function stubFetch(options: {
  mediaStatus?: number;
  initBody?: unknown;
  uploadStatus?: number;
} = {}): Call[] {
  const calls: Call[] = [];

  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(init?.headers as HeadersInit | undefined);
    const body = init?.body;

    calls.push({
      url,
      method: init?.method ?? "GET",
      contentRange: headers.get("content-range"),
      bytes: body instanceof Uint8Array ? body.byteLength : 0,
      json: typeof body === "string" ? body : null,
    });

    if (url === MEDIA_URL) {
      const status = options.mediaStatus ?? 200;
      return status === 200
        ? new Response(new Uint8Array(VIDEO_BYTES), { status: 200 })
        : new Response("gone", { status });
    }
    if (url === TIKTOK_CREATOR_INFO_URL) {
      // An unaudited app: TikTok offers the creator SELF_ONLY only.
      return new Response(
        JSON.stringify({ data: { privacy_level_options: ["SELF_ONLY"] } }),
        { status: 200 },
      );
    }
    if (url === TIKTOK_DIRECT_POST_INIT_URL) {
      return new Response(
        JSON.stringify(
          options.initBody ?? { data: { publish_id: "pub123", upload_url: UPLOAD_URL } },
        ),
        { status: 200 },
      );
    }
    if (url === UPLOAD_URL) {
      return new Response("{}", { status: options.uploadStatus ?? 201 });
    }
    return new Response(`unexpected request: ${url}`, { status: 500 });
  }) as typeof fetch;

  return calls;
}

const videoPost = {
  text: "A short product clip",
  mediaUrls: [MEDIA_URL],
} as unknown as PostOptions;

test("the video bytes are really transferred, with a Content-Range per chunk", async () => {
  const calls = stubFetch();
  try {
    const result = await tiktokAdapter.createPost("access-token", videoPost);

    assert.equal(result.success, true);
    assert.equal(result.platformPostId, "pub123");

    const uploaded = calls.find((c) => c.url === UPLOAD_URL);
    assert.ok(uploaded, "the adapter must PUT the video to the upload URL");
    assert.equal(uploaded.method, "PUT");
    assert.equal(uploaded.bytes, VIDEO_BYTES);
    assert.equal(
      uploaded.contentRange,
      `bytes 0-${VIDEO_BYTES - 1}/${VIDEO_BYTES}`,
      "chunks must identify their byte range",
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("the post is initialised as a FILE_UPLOAD, never PULL_FROM_URL", async () => {
  const calls = stubFetch();
  try {
    await tiktokAdapter.createPost("access-token", videoPost);

    const init = calls.find((c) => c.url === TIKTOK_DIRECT_POST_INIT_URL);
    assert.ok(init?.json, "the init call should carry a JSON body");
    assert.match(init.json, /FILE_UPLOAD/);
    assert.match(init.json, new RegExp(`"video_size":${VIDEO_BYTES}`));
    assert.equal(
      init.json.includes("PULL_FROM_URL"),
      false,
      "PULL_FROM_URL needs a verified domain, which a Blob host is not",
    );
    assert.equal(init.json.includes(MEDIA_URL), false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a rejected chunk is never reported as a publish", async () => {
  stubFetch({ uploadStatus: 500 });
  try {
    const result = await tiktokAdapter.createPost("access-token", videoPost);
    assert.equal(result.success, false);
    assert.match(result.error ?? "", /chunk 1 of 1/);
    assert.equal(result.platformPostId, undefined);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("an unreadable media URL fails before claiming anything", async () => {
  stubFetch({ mediaStatus: 404 });
  try {
    const result = await tiktokAdapter.createPost("access-token", videoPost);
    assert.equal(result.success, false);
    assert.match(result.error ?? "", /404/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("no upload URL means no publish", async () => {
  stubFetch({ initBody: { data: { publish_id: "pub123" } } });
  try {
    const result = await tiktokAdapter.createPost("access-token", videoPost);
    assert.equal(result.success, false);
    assert.match(result.error ?? "", /no upload URL/i);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("text without a video is refused, and no API call is made", async () => {
  const calls = stubFetch();
  try {
    const result = await tiktokAdapter.createPost("access-token", {
      text: "just text",
    } as unknown as PostOptions);
    assert.equal(result.success, false);
    assert.match(result.error ?? "", /requires a video/i);
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("an unaudited creator is posted as SELF_ONLY, and that is stated", async () => {
  stubFetch();
  try {
    const result = await tiktokAdapter.createPost("access-token", videoPost);
    const raw = result.rawResponse as { privacyLevel?: string; note?: string };
    assert.equal(raw.privacyLevel, "SELF_ONLY");
    assert.match(raw.note ?? "", /SELF_ONLY/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

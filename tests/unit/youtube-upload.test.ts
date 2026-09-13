import { test } from "node:test";
import assert from "node:assert/strict";
import { youtubeAdapter } from "../../src/lib/adapters/youtube";
import type { PostOptions } from "../../src/types/platform";

/**
 * Regression tests for the YouTube upload path.
 *
 * The adapter used to create a resumable upload session and then return
 * `success: true` without ever sending the video bytes — its own `note` field
 * admitted "requires additional implementation for actual file upload". Nothing
 * was stored on YouTube, no video id came back, and the post was still reported
 * as published. These tests pin the honest behaviour:
 *
 *   1. success requires a real video id returned by YouTube;
 *   2. the bytes are actually PUT to the session's upload URL;
 *   3. a session on its own is never a publish;
 *   4. an upload rejection is a failure.
 */

const realFetch = globalThis.fetch;

interface Call {
  url: string;
  method: string;
  contentType: string | null;
  bodyBytes: number;
}

/** Queue stub responses and record every request the adapter makes. */
function stubFetch(
  responses: Array<() => Response | Promise<Response>>,
): Call[] {
  const calls: Call[] = [];
  let index = 0;
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    calls.push({
      url: String(input),
      method: init?.method ?? "GET",
      contentType:
        new Headers(init?.headers as HeadersInit | undefined).get(
          "content-type",
        ) ?? null,
      bodyBytes:
        init?.body instanceof Uint8Array
          ? init.body.byteLength
          : init?.body instanceof ArrayBuffer
            ? init.body.byteLength
            : 0,
    });
    const next = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return next();
  }) as typeof fetch;
  return calls;
}

const session = () =>
  new Response("{}", {
    status: 200,
    headers: { Location: "https://upload.example.invalid/session" },
  });

const videoBytes = () => new Response(new Uint8Array([0, 1, 2, 3]), { status: 200 });

const options = {
  text: "A short product clip",
  mediaUrls: ["https://cdn.example.invalid/clip.mp4"],
} as unknown as PostOptions;

test("youtube: a confirmed upload returns the real video id", async () => {
  const calls = stubFetch([
    session,
    videoBytes,
    () => new Response(JSON.stringify({ id: "vid123" }), { status: 200 }),
  ]);
  try {
    const result = await youtubeAdapter.createPost("access-token", options);

    assert.equal(result.success, true);
    assert.equal(result.platformPostId, "vid123");
    assert.equal(result.platformPostUrl, "https://www.youtube.com/watch?v=vid123");

    // The bytes really were sent to the session URL, not just requested.
    const put = calls.find((c) => c.method === "PUT");
    assert.ok(put, "expected the adapter to PUT the video bytes");
    assert.equal(put.url, "https://upload.example.invalid/session");
    assert.equal(put.bodyBytes, 4);
    assert.match(put.contentType ?? "", /^video\//);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("youtube: a created session alone is never reported as a publish", async () => {
  // This is the exact shape of the old bug: the session succeeded, the upload
  // returned no id, and the post was still claimed as published.
  stubFetch([
    session,
    videoBytes,
    () => new Response("{}", { status: 200 }),
  ]);
  try {
    const result = await youtubeAdapter.createPost("access-token", options);
    assert.equal(result.success, false);
    assert.match(result.error ?? "", /video id/i);
    assert.equal(result.platformPostId, undefined);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("youtube: a rejected upload is a failure, not a publish", async () => {
  stubFetch([
    session,
    videoBytes,
    () => new Response("quota exceeded", { status: 403 }),
  ]);
  try {
    const result = await youtubeAdapter.createPost("access-token", options);
    assert.equal(result.success, false);
    assert.match(result.error ?? "", /403/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("youtube: an unreadable media URL fails before claiming anything", async () => {
  stubFetch([session, () => new Response("gone", { status: 404 })]);
  try {
    const result = await youtubeAdapter.createPost("access-token", options);
    assert.equal(result.success, false);
    assert.match(result.error ?? "", /404/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("youtube: a rejected session is a failure", async () => {
  stubFetch([() => new Response("forbidden", { status: 403 })]);
  try {
    const result = await youtubeAdapter.createPost("access-token", options);
    assert.equal(result.success, false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("youtube: text without a video is refused, never published as text", async () => {
  const calls = stubFetch([session, videoBytes]);
  try {
    const result = await youtubeAdapter.createPost("access-token", {
      text: "just text",
    } as unknown as PostOptions);
    assert.equal(result.success, false);
    assert.match(result.error ?? "", /requires a video/i);
    assert.equal(calls.length, 0, "no API request may be made without a video");
  } finally {
    globalThis.fetch = realFetch;
  }
});

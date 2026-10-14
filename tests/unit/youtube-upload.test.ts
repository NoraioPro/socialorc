import { afterEach, test } from "node:test";
import assert from "node:assert/strict";
import { YouTubeAdapter, readInChunks } from "../../src/lib/adapters/youtube";
import type { PostOptions } from "../../src/types/platform";

/**
 * Regression tests for the YouTube upload path.
 *
 * 1. The adapter once created a resumable session and returned success without
 *    sending a byte. Success now requires the video id YouTube returns after
 *    the final chunk.
 * 2. It then buffered the whole video in memory (`arrayBuffer()`) before one
 *    PUT — a large file ran the function out of memory. The bytes are now
 *    streamed from the media URL into the session in 256 KiB-multiple chunks,
 *    with Content-Range per chunk and the 308/Range protocol honoured.
 *
 * fetch is stubbed per URL; YouTube is never called.
 */

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

const MEDIA_URL = "https://cdn.example.invalid/clip.mp4";
const INIT_PREFIX = "https://www.googleapis.com/upload/youtube/v3/videos";
const SESSION_URL = "https://upload.example.invalid/session";
const KIB256 = 256 * 1024;

interface Put {
  contentRange: string | null;
  bytes: Uint8Array;
}

/** A source stream that delivers `total` bytes in uneven pieces, like a CDN would. */
function sourceStream(total: number, piece = 100_003): ReadableStream<Uint8Array> {
  let sent = 0;
  return new ReadableStream({
    pull(controller) {
      if (sent >= total) return controller.close();
      const n = Math.min(piece, total - sent);
      const chunk = new Uint8Array(n);
      for (let i = 0; i < n; i += 1) chunk[i] = (sent + i) % 251;
      sent += n;
      controller.enqueue(chunk);
    },
  });
}

function stub(opts: {
  total: number;
  declaredLength?: number | null;
  mediaStatus?: number;
  initStatus?: number;
  /** Decide the answer to each PUT; default: 308 until the last byte, then 201. */
  onPut?: (put: Put, index: number) => Response;
}) {
  const puts: Put[] = [];
  const init: { headers: Headers }[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, reqInit?: RequestInit) => {
    const url = String(input);
    const headers = new Headers(reqInit?.headers as HeadersInit | undefined);
    if (url === MEDIA_URL) {
      if (opts.mediaStatus && opts.mediaStatus !== 200) return new Response("gone", { status: opts.mediaStatus });
      const responseHeaders = new Headers();
      const declared = opts.declaredLength === undefined ? opts.total : opts.declaredLength;
      if (declared !== null) responseHeaders.set("content-length", String(declared));
      return new Response(sourceStream(opts.total), { status: 200, headers: responseHeaders });
    }
    if (url.startsWith(INIT_PREFIX)) {
      init.push({ headers });
      if (opts.initStatus && opts.initStatus !== 200) return new Response("{}", { status: opts.initStatus });
      return new Response("{}", { status: 200, headers: { Location: SESSION_URL } });
    }
    if (url === SESSION_URL) {
      const put: Put = {
        contentRange: headers.get("content-range"),
        bytes: new Uint8Array(reqInit?.body as Uint8Array),
      };
      puts.push(put);
      if (opts.onPut) return opts.onPut(put, puts.length - 1);
      const [, , last, total] = /bytes (\d+)-(\d+)\/(\d+)/.exec(put.contentRange ?? "") ?? [];
      return Number(last) + 1 === Number(total)
        ? new Response(JSON.stringify({ id: "vid123" }), { status: 201 })
        : new Response("", { status: 308, headers: { Range: `bytes=0-${last}` } });
    }
    return new Response("unexpected", { status: 500 });
  }) as typeof fetch;
  return { puts, init };
}

function adapter(chunkBytes = KIB256): YouTubeAdapter {
  const a = new YouTubeAdapter();
  a.uploadChunkBytes = chunkBytes;
  return a;
}

const options = {
  text: "A short product clip",
  mediaUrls: [MEDIA_URL],
} as unknown as PostOptions;

test("youtube: the video is streamed in 256 KiB-multiple chunks with Content-Range", async () => {
  const total = 3 * KIB256 + 1234;
  const { puts, init } = stub({ total });
  const result = await adapter().createPost("access-token", options);

  assert.equal(result.success, true);
  assert.equal(result.platformPostId, "vid123");
  assert.equal(result.platformPostUrl, "https://www.youtube.com/watch?v=vid123");

  assert.equal(init[0].headers.get("x-upload-content-length"), String(total));
  assert.deepEqual(
    puts.map((p) => p.contentRange),
    [
      `bytes 0-${KIB256 - 1}/${total}`,
      `bytes ${KIB256}-${2 * KIB256 - 1}/${total}`,
      `bytes ${2 * KIB256}-${3 * KIB256 - 1}/${total}`,
      `bytes ${3 * KIB256}-${total - 1}/${total}`,
    ],
  );
  for (const put of puts.slice(0, -1)) assert.equal(put.bytes.byteLength % KIB256, 0);

  // The bytes arrive intact and in order.
  const all = puts.flatMap((p) => [...p.bytes]);
  assert.equal(all.length, total);
  assert.ok(all.every((b, i) => b === i % 251));
});

test("youtube: no single request carries the whole file", async () => {
  const total = 10 * KIB256;
  const { puts } = stub({ total });
  await adapter().createPost("access-token", options);
  assert.ok(puts.length >= 10);
  assert.ok(puts.every((p) => p.bytes.byteLength <= KIB256));
});

test("youtube: a short Range on 308 re-sends exactly the missing bytes", async () => {
  const total = 2 * KIB256;
  let partialDone = false;
  const { puts } = stub({
    total,
    onPut(put, index) {
      if (index === 0 && !partialDone) {
        partialDone = true;
        // YouTube kept only the first 1000 bytes of the first chunk.
        return new Response("", { status: 308, headers: { Range: "bytes=0-999" } });
      }
      const [, , last] = /bytes (\d+)-(\d+)\//.exec(put.contentRange ?? "") ?? [];
      return Number(last) + 1 === total
        ? new Response(JSON.stringify({ id: "vid123" }), { status: 200 })
        : new Response("", { status: 308, headers: { Range: `bytes=0-${last}` } });
    },
  });
  const result = await adapter().createPost("access-token", options);
  assert.equal(result.success, true);
  assert.equal(puts[1].contentRange, `bytes 1000-${KIB256 - 1}/${total}`);
  assert.equal(puts[1].bytes[0], 1000 % 251, "resumes from the first missing byte");
});

test("youtube: a final chunk without a video id is never reported as a publish", async () => {
  stub({ total: 1000, onPut: () => new Response("{}", { status: 200 }) });
  const result = await adapter().createPost("access-token", options);
  assert.equal(result.success, false);
  assert.match(result.error ?? "", /video id/i);
  assert.equal(result.platformPostId, undefined);
});

test("youtube: a rejected upload is a failure, not a publish", async () => {
  stub({ total: 1000, onPut: () => new Response("quota exceeded", { status: 403 }) });
  const result = await adapter().createPost("access-token", options);
  assert.equal(result.success, false);
  assert.match(result.error ?? "", /403/);
});

test("youtube: a source shorter than it declared is abandoned, not published", async () => {
  stub({ total: 1000, declaredLength: 5000 });
  const result = await adapter().createPost("access-token", options);
  assert.equal(result.success, false);
  assert.match(result.error ?? "", /1000 of the 5000 bytes/);
});

test("youtube: an unknown size falls back to the stored media size", async () => {
  const { init } = stub({ total: 1000, declaredLength: null });
  const result = await adapter().createPost("access-token", {
    ...options,
    media: [{ url: MEDIA_URL, mimeType: "video/mp4", sizeBytes: 1000 }],
  } as unknown as PostOptions);
  assert.equal(result.success, true);
  assert.equal(init[0].headers.get("x-upload-content-length"), "1000");
});

test("youtube: with no size at all nothing is uploaded", async () => {
  const { init, puts } = stub({ total: 1000, declaredLength: null });
  const result = await adapter().createPost("access-token", options);
  assert.equal(result.success, false);
  assert.match(result.error ?? "", /size is unknown/);
  assert.equal(init.length, 0);
  assert.equal(puts.length, 0);
});

test("youtube: an unreadable media URL fails before a session is opened", async () => {
  const { init } = stub({ total: 1000, mediaStatus: 404 });
  const result = await adapter().createPost("access-token", options);
  assert.equal(result.success, false);
  assert.match(result.error ?? "", /404/);
  assert.equal(init.length, 0);
});

test("youtube: a rejected session is a failure", async () => {
  stub({ total: 1000, initStatus: 403 });
  const result = await adapter().createPost("access-token", options);
  assert.equal(result.success, false);
});

test("youtube: text without a video is refused, never published as text", async () => {
  let called = 0;
  globalThis.fetch = (async () => {
    called += 1;
    return new Response("{}");
  }) as typeof fetch;
  const result = await adapter().createPost("access-token", {
    text: "just text",
  } as unknown as PostOptions);
  assert.equal(result.success, false);
  assert.match(result.error ?? "", /requires a video/i);
  assert.equal(called, 0, "no API request may be made without a video");
});

test("readInChunks re-slices uneven pieces into fixed chunks", async () => {
  const sizes: number[] = [];
  for await (const chunk of readInChunks(sourceStream(1000, 7), 256)) sizes.push(chunk.byteLength);
  assert.deepEqual(sizes, [256, 256, 256, 232]);
});

import { test, describe, it } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  blobUrlProblem,
  blobPathFromUrl,
  blobPathFor,
  blobFolderFor,
  ownBlobHost,
  mediaSourceUrlProblem,
  assertOwnBlobUrl,
  fetchOwnMedia,
  MediaSourceNotAllowedError,
} from "../../src/lib/social/blob-upload";

/**
 * Blob upload validation.
 *
 * `blobUrlProblem` decides whether the server will later fetch a URL (the
 * adapters download the recorded blob when a post publishes), so its rejections
 * are security-relevant. Its "never throws" contract is load-bearing too: a
 * throw here becomes a 500 instead of a 400.
 *
 * Every expectation below was confirmed by running the module, not by reading
 * it. Two parser behaviours are easy to get wrong and are pinned here:
 *
 *   1. `new URL()` itself removes `.` and `..` path segments, including their
 *      encoded spellings `%2e` and `%2e%2e`. So `/u1/%2e%2e/u2/a.png` arrives
 *      at the validator already normalised to `/u2/a.png` — it never sees a
 *      `..` segment and is rejected for pointing outside the caller's folder.
 *   2. `%2F` is NOT a segment separator, so `/u1/..%2Fu2/a.png` keeps its
 *      `..%2Fu2` segment. Decoding it yields a real `../` escape, which is the
 *      case that motivated the segment check.
 */

const USER = "u1";
const HOST = "store123.public.blob.vercel-storage.com";

function url(path: string, host: string = HOST): string {
  return `https://${host}${path}`;
}

test("blobUrlProblem accepts the caller's own path", () => {
  assert.equal(blobUrlProblem(url("/socialorc/u1/a.png"), USER), null);
});

test("blobUrlProblem rejects another user's path", () => {
  assert.notEqual(blobUrlProblem(url("/socialorc/u2/a.png"), USER), null);
});

test("blobUrlProblem rejects a sibling folder that merely starts with the user id", () => {
  assert.notEqual(blobUrlProblem(url("/socialorc/u12/a.png"), USER), null);
});

test("blobUrlProblem rejects the folder with no filename", () => {
  assert.notEqual(blobUrlProblem(url("/socialorc/u1/"), USER), null);
  assert.notEqual(blobUrlProblem(url("/socialorc/u1"), USER), null);
});

test("blobUrlProblem rejects a raw traversal segment", () => {
  assert.notEqual(blobUrlProblem(url("/socialorc/u1/../u2/a.png"), USER), null);
});

test("blobUrlProblem rejects an encoded double-dot segment", () => {
  // `new URL()` has already stripped it, so the path lands on u2 and is refused
  // for that reason. Assert the refusal, not the mechanism.
  assert.notEqual(blobUrlProblem(url("/socialorc/u1/%2e%2e/u2/a.png"), USER), null);
});

test("blobUrlProblem rejects ..%2F, which the old prefix test allowed through", () => {
  // The regression case: `%2F` is not a separator, so the segment survives the
  // parser and decodes to a genuine escape.
  assert.notEqual(blobUrlProblem(url("/socialorc/u1/..%2Fu2/a.png"), USER), null);
});

test("blobUrlProblem still accepts a traversal that resolves inside the caller's folder", () => {
  // Normalised to /socialorc/u1/a.png by the parser — harmless, and worth
  // pinning so a future change does not start rejecting legitimate uploads.
  assert.equal(blobUrlProblem(url("/socialorc/u1/sub/../a.png"), USER), null);
});

test("blobUrlProblem rejects a foreign host", () => {
  assert.notEqual(blobUrlProblem(url("/socialorc/u1/a.png", "evil.com"), USER), null);
});

test("blobUrlProblem rejects the storage domain smuggled into a path", () => {
  assert.notEqual(
    blobUrlProblem("https://evil.com/.public.blob.vercel-storage.com/socialorc/u1/a.png", USER),
    null,
  );
});

test("blobUrlProblem treats the host as the host, not as userinfo", () => {
  // The dangerous direction: the storage domain appears before the '@', so the
  // real host is evil.com.
  assert.notEqual(blobUrlProblem(`https://${HOST}@evil.com/socialorc/u1/a.png`, USER), null);
  // The harmless direction: the last '@' wins, so the real host is the store.
  // Accepted — documented rather than desired, see the note below.
  assert.equal(blobUrlProblem(`https://user@evil.com@${HOST}/socialorc/u1/a.png`, USER), null);
});

test("blobUrlProblem rejects non-https schemes", () => {
  assert.notEqual(blobUrlProblem(url("/socialorc/u1/a.png").replace("https:", "http:"), USER), null);
});

test("blobUrlProblem rejects a malformed URL instead of throwing", () => {
  assert.doesNotThrow(() => blobUrlProblem("not a url", USER));
  assert.notEqual(blobUrlProblem("not a url", USER), null);
});

test("blobUrlProblem rejects invalid percent escapes instead of throwing", () => {
  assert.doesNotThrow(() => blobUrlProblem(url("/socialorc/u1/%zz"), USER));
  assert.notEqual(blobUrlProblem(url("/socialorc/u1/%zz"), USER), null);
});

test("blobUrlProblem accepts a port on the storage host", () => {
  assert.equal(blobUrlProblem(`https://${HOST}:8443/socialorc/u1/a.png`, USER), null);
});

/**
 * Without a store configured (local development) any Vercel Blob store is
 * accepted: not internal SSRF, but not provenance either. With
 * `BLOB_READ_WRITE_TOKEN` set the host is pinned to this app's own store.
 */
test("blobUrlProblem accepts a different Vercel Blob store only when no store is configured", () => {
  const other = url("/socialorc/u1/a.png", "someone-elses-store.public.blob.vercel-storage.com");
  assert.equal(blobUrlProblem(other, USER, {} as NodeJS.ProcessEnv), null);
  const pinned = { BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_Store123_secretpart" } as unknown as NodeJS.ProcessEnv;
  assert.notEqual(blobUrlProblem(other, USER, pinned), null);
  assert.equal(blobUrlProblem(url("/socialorc/u1/a.png"), USER, pinned), null);
});

test("ownBlobHost derives the store host from the read-write token", () => {
  assert.equal(
    ownBlobHost({ BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_AbC123_xyz" } as unknown as NodeJS.ProcessEnv),
    "abc123.public.blob.vercel-storage.com",
  );
  assert.equal(ownBlobHost({} as NodeJS.ProcessEnv), null);
  assert.equal(ownBlobHost({ BLOB_READ_WRITE_TOKEN: "garbage" } as unknown as NodeJS.ProcessEnv), null);
});

describe("media source URLs the adapters may download", () => {
  const prod = {
    NODE_ENV: "production",
    BLOB_READ_WRITE_TOKEN: "vercel_blob_rw_Store123_secretpart",
  } as unknown as NodeJS.ProcessEnv;

  it("accepts our own store over https and data: URLs", () => {
    assert.equal(mediaSourceUrlProblem(url("/socialorc/u1/a.mp4"), prod), null);
    assert.equal(mediaSourceUrlProblem("data:image/png;base64,AAAA", prod), null);
  });

  it("refuses everything else in production", () => {
    for (const bad of [
      "http://store123.public.blob.vercel-storage.com/socialorc/u1/a.mp4",
      "https://store123.public.blob.vercel-storage.com:8443/a.mp4",
      "https://user:pw@store123.public.blob.vercel-storage.com/a.mp4",
      "https://other.public.blob.vercel-storage.com/a.mp4",
      "https://169.254.169.254/latest/meta-data/",
      "https://127.0.0.1/a.mp4",
      "https://internal.service/a.mp4",
      "https://cdn.example.invalid/a.mp4",
      "file:///etc/passwd",
      "not a url",
    ]) {
      assert.notEqual(mediaSourceUrlProblem(bad, prod), null, bad);
      assert.throws(() => assertOwnBlobUrl(bad, prod), MediaSourceNotAllowedError, bad);
    }
  });

  it("accepts the reserved test hosts only outside production", () => {
    const dev = { NODE_ENV: "test" } as unknown as NodeJS.ProcessEnv;
    assert.equal(mediaSourceUrlProblem("https://cdn.example.invalid/a.mp4", dev), null);
    assert.equal(mediaSourceUrlProblem("https://cdn.example.com/a.mp4", dev), null);
    assert.notEqual(mediaSourceUrlProblem("https://169.254.169.254/x", dev), null);
    assert.notEqual(mediaSourceUrlProblem("https://localhost/x", dev), null);
  });

  it("fetchOwnMedia refuses before any request and never follows redirects", async () => {
    const original = globalThis.fetch;
    const seen: { url: string; redirect?: RequestRedirect }[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
      seen.push({ url: String(input), redirect: init?.redirect });
      return new Response("ok");
    }) as typeof fetch;
    try {
      await assert.rejects(fetchOwnMedia("https://169.254.169.254/latest/"), MediaSourceNotAllowedError);
      assert.equal(seen.length, 0, "a refused URL must not be requested at all");
      await fetchOwnMedia("https://cdn.example.invalid/a.mp4");
      assert.deepEqual(seen, [{ url: "https://cdn.example.invalid/a.mp4", redirect: "error" }]);
    } finally {
      globalThis.fetch = original;
    }
  });
});

test("no adapter downloads media with a bare fetch", () => {
  for (const file of ["youtube", "linkedin", "twitter", "tiktok"]) {
    const source = readFileSync(`src/lib/adapters/${file}.ts`, "utf8");
    assert.ok(
      !/\bfetch\((sourceUrl|descriptor\.url|options\.mediaUrls\[0\]|attachment\.url)\)/.test(source),
      `${file}.ts downloads media without fetchOwnMedia`,
    );
    assert.ok(source.includes("fetchOwnMedia("), `${file}.ts does not use fetchOwnMedia`);
  }
});

test("blobPathFromUrl strips the leading slash", () => {
  assert.equal(blobPathFromUrl(url("/socialorc/u1/a.png")), "socialorc/u1/a.png");
});

test("blobPathFromUrl refuses to record a path that escapes its folder", () => {
  assert.throws(() => blobPathFromUrl(url("/socialorc/u1/..%2Fu2/a.png")));
  assert.throws(() => blobPathFromUrl(url("/socialorc/u1/%zz")));
});

test("path helpers build the caller's folder", () => {
  assert.equal(blobFolderFor(USER), "socialorc/u1");
  assert.equal(blobPathFor(USER, "a.png"), "socialorc/u1/a.png");
});

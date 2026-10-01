import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blobUrlProblem,
  blobPathFromUrl,
  blobPathFor,
  blobFolderFor,
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
 * KNOWN LIMITATION, asserted so it cannot change silently.
 *
 * The host check accepts ANY Vercel Blob store, so someone with their own store
 * can host a file under `socialorc/<their id>/` and have it recorded. The host
 * is still Vercel's, so this is not internal SSRF, but it is not proof of
 * provenance either. Closing it means pinning to our own store id, derived from
 * `BLOB_READ_WRITE_TOKEN`. If this test starts failing, that pin landed and this
 * assertion should be inverted.
 */
test("blobUrlProblem accepts a different Vercel Blob store (known limitation)", () => {
  assert.equal(
    blobUrlProblem(url("/socialorc/u1/a.png", "someone-elses-store.public.blob.vercel-storage.com"), USER),
    null,
  );
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

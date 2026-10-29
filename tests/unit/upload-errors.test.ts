import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { blobStorageIsUnconfigured, errorFromResponse } from "../../src/lib/media/upload-errors";

/** UI-02: upload failures must keep their real cause. */

test("UI-02: only a missing Blob token triggers the dev fallback", () => {
  assert.equal(blobStorageIsUnconfigured("Vercel Blob: No token found. BLOB_READ_WRITE_TOKEN"), true);
  assert.equal(blobStorageIsUnconfigured("Vercel Blob: Failed to retrieve the client token"), true);
});

test("UI-02: type, size, rate-limit and network errors never fall back", () => {
  for (const message of [
    "Content type video/x-ms-wmv is not allowed",
    "The file is too large",
    "Too many requests",
    "Failed to fetch",
    "Your session expired. Sign in again.",
  ]) {
    assert.equal(blobStorageIsUnconfigured(message), false, message);
  }
});

test("UI-02: a JSON error body is shown as-is", async () => {
  const res = new Response(JSON.stringify({ error: "File type not allowed" }), { status: 400 });
  assert.equal(await errorFromResponse(res, "Could not upload"), "File type not allowed");
});

test("UI-02: a non-JSON 413 page is a clear message, not 'Unexpected token'", async () => {
  const res = new Response("<html>Request Entity Too Large</html>", { status: 413 });
  assert.equal(await errorFromResponse(res, "Could not upload"), "The file is too large to upload.");
});

test("UI-02: any other non-JSON failure names the HTTP status", async () => {
  const res = new Response("Bad gateway", { status: 502 });
  assert.equal(await errorFromResponse(res, "Could not upload"), "Could not upload (HTTP 502).");
});

test("UI-02: the Create page rethrows non-storage blob errors instead of falling back", () => {
  const src = fs.readFileSync("src/app/(dashboard)/dashboard/create/page.tsx", "utf8");
  assert.match(src, /if \(!blobStorageIsUnconfigured\(blobMessage\)\) throw blobErr;/);
});

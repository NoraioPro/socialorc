import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { mediaStorage } from "../../src/lib/media-storage";

/**
 * Regression tests for media storage.
 *
 * Production must store uploads in Vercel Blob and get a real https URL back. It
 * must never fall back to a base64 `data:` URL (social APIs cannot fetch those,
 * and the payload would land in Postgres), and it must refuse honestly rather
 * than write a MediaAsset that can never be published.
 *
 * The pure decision is tested directly; the route is tested by asserting the real
 * order of operations in its source, so a refactor that moves the storage call
 * before the guards - or re-introduces a production base64 fallback - fails here.
 */

const ROUTE = "src/app/api/media/route.ts";
const routeSource = () => readFileSync(path.resolve(process.cwd(), ROUTE), "utf8");

/** Run `fn` with a temporary environment, restoring it afterwards. */
function withEnv(values: Record<string, string | undefined>, fn: () => void) {
  const env = process.env as Record<string, string | undefined>;
  const saved: Record<string, string | undefined> = {};
  for (const key of Object.keys(values)) saved[key] = env[key];
  for (const [key, value] of Object.entries(values)) {
    if (value === undefined) delete env[key];
    else env[key] = value;
  }
  try {
    fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete env[key];
      else env[key] = value;
    }
  }
}

// ---------------------------------------------------------------- the decision

test("a Blob token means storage is blob, in any environment", () => {
  const token = "vercel_blob_rw_ExampleStoreId_ExampleSecret";
  withEnv({ BLOB_READ_WRITE_TOKEN: token, NODE_ENV: "production" }, () => {
    assert.equal(mediaStorage(), "blob");
  });
  withEnv({ BLOB_READ_WRITE_TOKEN: token, NODE_ENV: "development" }, () => {
    assert.equal(mediaStorage(), "blob");
  });
});

test("production without a token is unconfigured - never the base64 fallback", () => {
  withEnv({ BLOB_READ_WRITE_TOKEN: undefined, NODE_ENV: "production" }, () => {
    assert.equal(mediaStorage(), "unconfigured");
  });
});

test("development without a token may still use the local base64 fallback", () => {
  withEnv({ BLOB_READ_WRITE_TOKEN: undefined, NODE_ENV: "development" }, () => {
    assert.equal(mediaStorage(), "dev-base64");
  });
});

test("an empty token does not count as configured", () => {
  withEnv({ BLOB_READ_WRITE_TOKEN: "", NODE_ENV: "production" }, () => {
    assert.equal(mediaStorage(), "unconfigured");
  });
});

// ------------------------------------------------------------------- the route

test("the route requires a session before touching storage", () => {
  const source = routeSource();
  const guard = source.indexOf("getAuthSession");
  const storage = source.indexOf("await put(");
  assert.ok(guard > -1, "the route must authenticate");
  assert.ok(guard < storage, "authentication must precede the storage call");
});

test("an unconfigured store is refused with 503 before anything is stored", () => {
  const source = routeSource();
  const guard = source.indexOf('storage === "unconfigured"');
  const putCall = source.indexOf("await put(");
  const dbWrite = source.indexOf("prisma.mediaAsset.create(");
  assert.ok(guard > -1, "the route must check mediaStorage()");
  assert.ok(guard < putCall, "the refusal must come before put()");
  assert.ok(putCall < dbWrite, "the MediaAsset row is written only after a successful put()");
  assert.match(source, /MEDIA_STORAGE_NOT_CONFIGURED/);
  assert.match(source, /status: 503/);
});

test("invalid media is rejected before any storage call", () => {
  const source = routeSource();
  const typeCheck = source.indexOf("allowedTypes");
  const sizeCheck = source.indexOf("File too large");
  const putCall = source.indexOf("await put(");
  assert.ok(typeCheck > -1 && typeCheck < putCall, "the MIME allowlist must run before put()");
  assert.ok(sizeCheck > -1 && sizeCheck < putCall, "the size limit must run before put()");
});

test("blobs are stored publicly, so social platforms can download them", () => {
  // The adapters hand the URL to LinkedIn/Meta/Telegram, which fetch it
  // themselves. A private store would break every image post.
  assert.match(routeSource(), /access:\s*"public"/);
});

test("no base64 payload can be produced in production", () => {
  const source = routeSource();
  const refusal = source.indexOf('storage === "unconfigured"');
  const blobBranch = source.indexOf('storage === "blob"');
  const dataUrl = source.indexOf("data:${file.type}");
  assert.ok(dataUrl > -1, "the development-only branch should still exist");
  assert.ok(blobBranch < dataUrl, "the data: URL lives in the non-blob branch");
  // Production hits the refusal above and returns before reaching the data: URL.
  assert.ok(refusal < dataUrl, "the production refusal must precede the data: URL");
});

test("the MediaAsset row is persisted with the storage facts, not the payload", () => {
  const source = routeSource();
  const create = source.indexOf("prisma.mediaAsset.create(");
  const block = source.slice(create, create + 400);
  assert.match(block, /mimeType:\s*file\.type/);
  assert.match(block, /size:\s*file\.size/);
  assert.match(block, /filename:\s*file\.name/);
  // The bytes themselves must never be written to the database.
  assert.equal(/base64/.test(block), false, "the MediaAsset row must not carry the payload");
});

test("the Blob pathname is scoped per user, keeping uploads separated", () => {
  assert.match(routeSource(), /socialorc\/\$\{session\.user\.id\}\//);
});

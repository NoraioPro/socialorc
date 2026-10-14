/**
 * Blob upload validation, shared by the token issuer and the finalize route.
 *
 * The finalize route used to accept any URL containing
 * `.public.blob.vercel-storage.com/` anywhere in the string, so
 * `https://evil/.public.blob.vercel-storage.com/x` passed, and so did another
 * tenant's real blob. The recorded URL is later fetched by the adapters when a
 * post publishes (`youtube.ts`, `linkedin.ts`, `tiktok.ts`), which turned that
 * loose check into SSRF. Parse the URL and require an exact host plus a path
 * that belongs to the caller.
 *
 * When `BLOB_READ_WRITE_TOKEN` is set the host is pinned to this app's own
 * store (`<storeId>.public.blob.vercel-storage.com`), so a file hosted in
 * somebody else's store is refused. Without a token (local development) any
 * Vercel Blob store is accepted, which is not internal SSRF — the host is still
 * Vercel's — but is not proof of provenance either. Nor does this prove the
 * object exists: `finalize` records the client's word for mime type and size.
 *
 * `assertOwnBlobUrl` is the same rule applied where it matters most: right
 * before an adapter downloads a MediaAsset URL to forward it to a platform.
 */

const BLOB_HOST_SUFFIX = ".public.blob.vercel-storage.com";

/**
 * The store id inside a read-write token (`vercel_blob_rw_<storeId>_<secret>`),
 * the same parse @vercel/blob uses to build blob URLs; null when absent.
 */
export function blobStoreIdFromToken(token: string | undefined | null): string | null {
  if (!token) return null;
  const [, , , storeId = ""] = token.split("_");
  return /^[A-Za-z0-9]+$/.test(storeId) ? storeId : null;
}

/** This deployment's own public blob host, or null when no store is configured. */
export function ownBlobHost(env: NodeJS.ProcessEnv = process.env): string | null {
  const storeId = blobStoreIdFromToken(env.BLOB_READ_WRITE_TOKEN);
  return storeId ? `${storeId.toLowerCase()}${BLOB_HOST_SUFFIX}` : null;
}

/** Is this hostname a Vercel Blob host we accept (our own store when known)? */
function isAcceptedBlobHost(host: string, env: NodeJS.ProcessEnv): boolean {
  const own = ownBlobHost(env);
  if (own) return host === own;
  // One label in front of the suffix: `<store>.public.blob.vercel-storage.com`.
  return host.endsWith(BLOB_HOST_SUFFIX) && !host.slice(0, -BLOB_HOST_SUFFIX.length).includes(".");
}

/**
 * Hosts reserved for documentation and testing by RFC 2606 / RFC 6761. They
 * never resolve on the public internet; unit tests and mock flows use them as
 * stand-in media URLs. Accepted only outside production.
 */
const RESERVED_TEST_HOST = /(^|\.)(example|invalid|test|example\.com|example\.net|example\.org)$/i;

export class MediaSourceNotAllowedError extends Error {
  readonly code = "MEDIA_INVALID";
  constructor() {
    super(
      "The attached media is not one of this app's uploads, so it was not fetched. Nothing was published.",
    );
    this.name = "MediaSourceNotAllowedError";
  }
}

/**
 * Why a MediaAsset URL may not be downloaded by the server, or null when it may.
 *
 * Accepted: an https URL on this app's own blob store (any Vercel Blob store
 * when none is configured), on the default port, with no credentials; a
 * `data:` URL (development storage; no network is involved); and, outside
 * production, the reserved test hosts the mock and unit-test paths use.
 */
export function mediaSourceUrlProblem(rawUrl: string, env: NodeJS.ProcessEnv = process.env): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return "not a URL";
  }
  if (parsed.protocol === "data:") return null;
  if (parsed.protocol !== "https:") return "not https";
  if (parsed.username || parsed.password) return "credentials in URL";
  if (parsed.port !== "") return "non-default port";
  const host = parsed.hostname.toLowerCase();
  if (isAcceptedBlobHost(host, env)) return null;
  if (env.NODE_ENV !== "production" && RESERVED_TEST_HOST.test(host)) return null;
  return "not this app's blob store";
}

/** Throw unless the URL is one of this app's own uploads (see mediaSourceUrlProblem). */
export function assertOwnBlobUrl(rawUrl: string, env: NodeJS.ProcessEnv = process.env): void {
  if (mediaSourceUrlProblem(rawUrl, env)) throw new MediaSourceNotAllowedError();
}

/**
 * Download a MediaAsset URL for forwarding to a platform.
 *
 * Every adapter that reads media bytes goes through this: the URL must be one
 * of our own uploads, and a redirect is an error — the blob store does not
 * redirect, so a redirect means the URL is not what it claims to be.
 */
export async function fetchOwnMedia(rawUrl: string, init: RequestInit = {}): Promise<Response> {
  assertOwnBlobUrl(rawUrl);
  return fetch(rawUrl, { ...init, redirect: "error" });
}

/** Exactly the upload constraints `onBeforeGenerateToken` hands to Blob. */
export const ALLOWED_UPLOAD_CONTENT_TYPES = [
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
  "video/mp4",
  "video/quicktime",
  "video/webm",
] as const;

export const MAX_UPLOAD_BYTES = 500 * 1024 * 1024;

/** `socialorc/<userId>/` — every upload lands in the caller's own folder. */
export function blobFolderFor(userId: string): string {
  return `socialorc/${userId}`;
}

export function blobPathFor(userId: string, filename: string): string {
  return `${blobFolderFor(userId)}/${filename}`;
}

/**
 * Decode a URL's path, or null when the percent escapes are malformed.
 *
 * `decodeURIComponent` throws `URIError` on input like `/u1/%zz`. That has to be
 * a rejection, not an exception — otherwise a bad URL becomes a 500 instead of a
 * 400, and the caller's promise of "never throws" is a lie.
 */
function decodedPathname(parsed: URL): string | null {
  try {
    return decodeURIComponent(parsed.pathname);
  } catch {
    return null;
  }
}

/**
 * Returns a human-readable reason the URL is not an acceptable upload, or null
 * when it is. Never throws: a malformed URL is just a rejection.
 */
export function blobUrlProblem(
  rawUrl: string,
  userId: string,
  env: NodeJS.ProcessEnv = process.env,
): string | null {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return "Not a recognized upload";
  }

  if (parsed.protocol !== "https:") {
    return "Not a recognized upload";
  }

  // Exact host check. A suffix test on the full string let a crafted domain
  // through; compare the hostname itself.
  const host = parsed.hostname.toLowerCase();
  if (!isAcceptedBlobHost(host, env)) {
    return "Not a recognized upload";
  }

  const decoded = decodedPathname(parsed);
  if (decoded === null) {
    return "Not a recognized upload";
  }

  // The folder check has to run on decoded, normalised segments, or `..%2F`
  // walks straight past it: it decodes to `../`, which the old startswith test
  // happily accepted because the string still began with the caller's folder.
  // Blob keys are literal today, but nothing guarantees the consumer of this
  // recorded path will treat them that way.
  const segments = decoded.split("/").filter((segment) => segment.length > 0);
  if (segments.some((segment) => segment === ".." || segment === ".")) {
    return "This upload does not belong to your account";
  }

  // Must be inside this user's own folder, so one tenant cannot attach (or make
  // the server fetch) another tenant's file.
  const relative = segments.join("/");
  const folder = `${blobFolderFor(userId)}/`;
  if (!relative.startsWith(folder) || relative.length <= folder.length) {
    return "This upload does not belong to your account";
  }

  return null;
}

/**
 * The blob pathname as recorded — taken from the URL, never from the client.
 * Call this only after `blobUrlProblem` has accepted the URL; it throws rather
 * than record a path that escapes the caller's folder.
 */
export function blobPathFromUrl(rawUrl: string): string {
  const decoded = decodedPathname(new URL(rawUrl));
  if (decoded === null) {
    throw new Error("blobPathFromUrl called with a URL that failed validation");
  }
  const segments = decoded.split("/").filter((segment) => segment.length > 0);
  if (segments.some((segment) => segment === ".." || segment === ".")) {
    throw new Error("blobPathFromUrl called with a path that escapes its folder");
  }
  return segments.join("/");
}

/** Is this MIME type in the set the upload token allows? */
export function isAllowedUploadType(mimeType: string): boolean {
  return (ALLOWED_UPLOAD_CONTENT_TYPES as readonly string[]).includes(mimeType);
}

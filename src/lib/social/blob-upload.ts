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
 * What this still does not prove: the host check accepts any Vercel Blob store,
 * not only this app's. An attacker with their own store can host a file under
 * `socialorc/<their own id>/` and have it recorded. The host is still Vercel's,
 * so it is not internal SSRF, but it is not proof of provenance either. Pinning
 * to our own store id (derived from `BLOB_READ_WRITE_TOKEN`) would close it.
 * Nor does it prove the object exists: `finalize` records the client's word for
 * mime type and size.
 */

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
export function blobUrlProblem(rawUrl: string, userId: string): string | null {
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
  if (!host.endsWith(".public.blob.vercel-storage.com")) {
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

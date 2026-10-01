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

  // Must be inside this user's own folder, so one tenant cannot attach (or make
  // the server fetch) another tenant's file.
  const pathname = decodeURIComponent(parsed.pathname).replace(/^\/+/, "");
  const folder = `${blobFolderFor(userId)}/`;
  if (!pathname.startsWith(folder) || pathname.length <= folder.length) {
    return "This upload does not belong to your account";
  }

  return null;
}

/** The blob pathname as recorded — taken from the URL, never from the client. */
export function blobPathFromUrl(rawUrl: string): string {
  return decodeURIComponent(new URL(rawUrl).pathname).replace(/^\/+/, "");
}

/** A filename that is safe to store and display. */
export function isAllowedUploadType(mimeType: string): boolean {
  return (ALLOWED_UPLOAD_CONTENT_TYPES as readonly string[]).includes(mimeType);
}

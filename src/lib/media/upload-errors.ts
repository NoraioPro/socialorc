/**
 * Decisions for the browser upload flow on the Create page.
 *
 * The page uploads straight to Blob and used to fall back to the small-file
 * `/api/media` route on ANY failure. A rejected file type, a size limit, a rate
 * limit or a dropped connection then surfaced as the fallback route's error (or
 * as "Unexpected token" when a 413 came back as HTML), hiding the real cause and
 * trying to push a large video through a body-limited function (audit UI-02).
 */

/** True only when the direct upload failed because Blob storage is not set up. */
export function blobStorageIsUnconfigured(message: string): boolean {
  return /BLOB_READ_WRITE_TOKEN|no token found|blob.*not configured|storage is not configured|failed to retrieve the client token/i.test(
    message,
  );
}

/** Turn a failed response into text without assuming the body is JSON. */
export async function errorFromResponse(res: Response, fallback: string): Promise<string> {
  const text = await res.text().catch(() => "");
  try {
    const data = JSON.parse(text) as { error?: unknown };
    if (typeof data.error === "string" && data.error) return data.error;
  } catch {
    // Not JSON: a platform error page (e.g. 413 Request Entity Too Large).
  }
  if (res.status === 413) return "The file is too large to upload.";
  return `${fallback} (HTTP ${res.status}).`;
}

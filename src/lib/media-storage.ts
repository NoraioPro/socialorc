/**
 * Where an uploaded attachment can actually be stored.
 *
 * Split out of the upload route so the decision is unit-testable without a
 * request, a session or a database — this is the difference between a post that
 * can be published and one that never will be.
 *
 * - `blob`         — Vercel Blob is configured: the asset gets a real https URL.
 * - `dev-base64`   — development only. The asset becomes a `data:` URL stored in
 *                    Postgres. Social APIs cannot fetch it, so these posts are
 *                    not publishable; that is acceptable locally, never in
 *                    production.
 * - `unconfigured` — production with no Blob token. Callers must refuse the
 *                    upload rather than store something unpublishable.
 */
export type MediaStorage = "blob" | "dev-base64" | "unconfigured";

export function mediaStorage(): MediaStorage {
  if (process.env.BLOB_READ_WRITE_TOKEN) return "blob";
  return process.env.NODE_ENV === "production" ? "unconfigured" : "dev-base64";
}

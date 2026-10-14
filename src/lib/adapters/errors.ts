/**
 * Normalized connector errors.
 *
 * Platforms report failures in wildly different shapes (HTTP status, JSON error
 * codes, prose strings). Classification matters because the worker's retry
 * policy should not be the same for "the API is briefly down" and "this token
 * will never work": retrying a permanent failure wastes the schedule window and
 * buries the real cause in the dead-letter queue.
 */

export type AdapterErrorCode =
  | "AUTH_INVALID"
  | "AUTH_EXPIRED"
  | "PERMISSION_DENIED"
  | "NOT_FOUND"
  | "CONTENT_INVALID"
  | "MEDIA_INVALID"
  | "RATE_LIMITED"
  | "PLATFORM_UNAVAILABLE"
  | "NETWORK"
  /**
   * The connector's credentials are absent from the environment. Never publish
   * through a stand-in for this — the caller must fail loudly.
   */
  | "PLATFORM_NOT_CONFIGURED"
  /** The content uses a capability the adapter (or platform) does not implement. */
  | "UNSUPPORTED_MEDIA"
  /** No Blob token, so attachments have nowhere to live and cannot be published. */
  | "MEDIA_STORAGE_NOT_CONFIGURED"
  /** No AI provider key, so generation would have to invent its answer. */
  | "AI_NOT_CONFIGURED"
  /**
   * The platform accepted the upload but is still processing it (an Instagram
   * Reels container that is not FINISHED yet, an X video still transcoding).
   * Nothing was published; the in-flight upload is remembered and the next
   * attempt resumes it instead of uploading again.
   */
  | "MEDIA_PROCESSING"
  | "UNKNOWN";

/** Worth trying again later: nothing about the request itself is wrong. */
const RETRYABLE: readonly AdapterErrorCode[] = [
  "RATE_LIMITED",
  "PLATFORM_UNAVAILABLE",
  "NETWORK",
  "MEDIA_PROCESSING",
];

/** Never worth retrying without a human or config change. */
const PERMANENT: readonly AdapterErrorCode[] = [
  "AUTH_INVALID",
  "AUTH_EXPIRED",
  "PERMISSION_DENIED",
  "NOT_FOUND",
  "CONTENT_INVALID",
  "MEDIA_INVALID",
  // Configuration gaps and unimplemented capabilities are permanent by nature:
  // retrying them just burns attempts on something that cannot succeed.
  "PLATFORM_NOT_CONFIGURED",
  "UNSUPPORTED_MEDIA",
  "MEDIA_STORAGE_NOT_CONFIGURED",
  "AI_NOT_CONFIGURED",
];

const MESSAGE_RULES: { pattern: RegExp; code: AdapterErrorCode }[] = [
  // Meta Graph's own wording for a dead token (codes 190 / 102), for messages
  // that arrive without the `[graph …]` tag. Checked first so "Error
  // validating access token: Session has expired" cannot fall through to a
  // generic rule — only the AUTH_* codes raise the reconnect banner.
  { pattern: /session has expired|access token (has )?expired/i, code: "AUTH_EXPIRED" },
  { pattern: /error validating access token|session has been invalidated|invalid oauth (2\.0 )?access token/i, code: "AUTH_INVALID" },
  { pattern: /unauthorized|invalid[_ -]?token|invalid[_ -]?credentials|bad token/i, code: "AUTH_INVALID" },
  { pattern: /token (has )?expired|expired[_ -]?token|reauth(enticate)?/i, code: "AUTH_EXPIRED" },
  { pattern: /permission|forbidden|not authorized to|insufficient (scope|privilege)/i, code: "PERMISSION_DENIED" },
  { pattern: /not found|unknown (chat|user|page)|no such/i, code: "NOT_FOUND" },
  { pattern: /too long|exceeds maximum|character limit|too many characters|caption exceeds/i, code: "CONTENT_INVALID" },
  { pattern: /platform credentials are not configured|credentials not configured for/i, code: "PLATFORM_NOT_CONFIGURED" },
  { pattern: /media storage is not configured/i, code: "MEDIA_STORAGE_NOT_CONFIGURED" },
  { pattern: /ai is not configured|no ai provider|api key not configured/i, code: "AI_NOT_CONFIGURED" },
  { pattern: /does not support (media|video|image)|carousel publishing is not supported|unsupported media type for/i, code: "UNSUPPORTED_MEDIA" },
  { pattern: /unsupported media|media type|video required|requires (at least one )?media|media is required/i, code: "MEDIA_INVALID" },
  { pattern: /rate limit|too many requests|slow down/i, code: "RATE_LIMITED" },
  { pattern: /fetch failed|econnrefused|econnreset|etimedout|enotfound|network|socket hang up|deadline/i, code: "NETWORK" },
  { pattern: /unavailable|timeout|gateway|internal server|5\d\d/i, code: "PLATFORM_UNAVAILABLE" },
];

function fromStatus(status: number): AdapterErrorCode | null {
  if (status === 401) return "AUTH_INVALID";
  if (status === 403) return "PERMISSION_DENIED";
  if (status === 404) return "NOT_FOUND";
  if (status === 400 || status === 422) return "CONTENT_INVALID";
  if (status === 429) return "RATE_LIMITED";
  if (status >= 500) return "PLATFORM_UNAVAILABLE";
  return null;
}

/**
 * Classify a connector failure. The HTTP status wins when present (it is
 * unambiguous); otherwise the message is matched, most specific rule first.
 */
export function classifyAdapterError(input: { status?: number | null; message?: string | null }): AdapterErrorCode {
  // A Meta Graph error carries its own machine code. The adapters tag their
  // messages with it (`formatGraphError`), so callers that only ever see the
  // message — the engagement API, the worker's fallback — classify it exactly.
  const graph = parseGraphErrorTag(input.message);
  if (graph) return classifyGraphError(graph.code, graph.subcode);
  if (typeof input.status === "number") {
    const byStatus = fromStatus(input.status);
    if (byStatus) return byStatus;
  }
  const message = input.message ?? "";
  if (message) {
    for (const rule of MESSAGE_RULES) {
      if (rule.pattern.test(message)) return rule.code;
    }
  }
  return "UNKNOWN";
}

/**
 * Meta Graph API error codes -> our codes.
 *
 * From https://developers.facebook.com/docs/graph-api/guides/error-handling :
 * 102 / 190 are dead sessions or tokens (subcode 463 = expired; 458, 459, 460,
 * 464, 467, 492 = app removed, checkpoint, password changed, lost Page role…),
 * 10 and 200–299 are missing permissions, 4 / 17 / 32 / 341 / 613 throttling,
 * 1 / 2 transient, 368 a temporary policy block, 506 a duplicate post.
 * Instagram adds 9004 (media could not be fetched) and 9007 (media not ready).
 */
export function classifyGraphError(code: number, subcode?: number | null): AdapterErrorCode {
  if (code === 190 || code === 102) {
    return subcode === 463 ? "AUTH_EXPIRED" : "AUTH_INVALID";
  }
  if (code === 10 || (code >= 200 && code <= 299)) return "PERMISSION_DENIED";
  if ([4, 17, 32, 341, 368, 613].includes(code)) return "RATE_LIMITED";
  if (code === 1 || code === 2) return "PLATFORM_UNAVAILABLE";
  if (code === 9007) return "MEDIA_PROCESSING";
  if (code === 9004) return "MEDIA_INVALID";
  if (code === 506) return "CONTENT_INVALID";
  if (code === 100 && subcode === 33) return "NOT_FOUND";
  if (code === 100) return "CONTENT_INVALID";
  return "UNKNOWN";
}

/**
 * Turn a Graph error body (`{ error: { message, code, error_subcode } }`) into a
 * message tagged with its machine code, plus the classification. The tag
 * survives anywhere the message travels (job notes, `lastError`), so the code
 * can always be recovered from the text alone.
 */
export function formatGraphError(
  body: unknown,
  fallback: string,
): { message: string; code: AdapterErrorCode } {
  const error =
    body && typeof body === "object" && "error" in body
      ? ((body as { error?: unknown }).error as Record<string, unknown> | undefined)
      : undefined;
  const text = typeof error?.message === "string" && error.message ? error.message : fallback;
  const code = typeof error?.code === "number" ? error.code : null;
  if (code === null) return { message: text, code: classifyAdapterError({ message: text }) };
  const subcode = typeof error?.error_subcode === "number" ? error.error_subcode : null;
  return {
    message: `${text} [graph ${code}${subcode !== null ? `/${subcode}` : ""}]`,
    code: classifyGraphError(code, subcode),
  };
}

function parseGraphErrorTag(
  message: string | null | undefined,
): { code: number; subcode: number | null } | null {
  if (!message) return null;
  const match = /\[graph (\d+)(?:\/(\d+))?\]/.exec(message);
  if (!match) return null;
  return { code: Number(match[1]), subcode: match[2] ? Number(match[2]) : null };
}

export function isRetryable(code: AdapterErrorCode): boolean {
  return RETRYABLE.includes(code);
}

export function isPermanent(code: AdapterErrorCode): boolean {
  return PERMANENT.includes(code);
}

/**
 * True when the failure is something only a human can fix by re-authorising the
 * account: expired or rejected credentials, or missing permissions/scopes.
 * A rejected post or a gone target is NOT this — the account itself is fine.
 */
export function requiresReconnect(code: AdapterErrorCode): boolean {
  return code === "AUTH_INVALID" || code === "AUTH_EXPIRED" || code === "PERMISSION_DENIED";
}

/** Short, user-facing explanation — never leaks tokens or raw payloads. */
export function describeAdapterError(code: AdapterErrorCode): string {
  switch (code) {
    case "AUTH_INVALID":
      return "The platform rejected the stored credentials; reconnect the account.";
    case "AUTH_EXPIRED":
      return "The access token has expired; reconnect the account to refresh it.";
    case "PERMISSION_DENIED":
      return "The connected account lacks the permissions or scopes this post needs.";
    case "NOT_FOUND":
      return "The target (account, page, chat or media) no longer exists.";
    case "CONTENT_INVALID":
      return "The platform rejected the content itself (length or format).";
    case "MEDIA_INVALID":
      return "The platform rejected the attached media (type, count or requirement).";
    case "RATE_LIMITED":
      return "The platform is rate limiting this account; the post will be retried.";
    case "PLATFORM_UNAVAILABLE":
      return "The platform is temporarily unavailable; the post will be retried.";
    case "NETWORK":
      return "The platform could not be reached; the post will be retried.";
    case "PLATFORM_NOT_CONFIGURED":
      return "This platform has no credentials configured on the server, so nothing was published.";
    case "UNSUPPORTED_MEDIA":
      return "This platform does not support the attached media type yet; nothing was published.";
    case "MEDIA_STORAGE_NOT_CONFIGURED":
      return "Media storage is not configured, so attachments cannot be published.";
    case "AI_NOT_CONFIGURED":
      return "No AI provider is configured, so no AI content was generated.";
    case "MEDIA_PROCESSING":
      return "The platform is still processing the uploaded media; nothing was published yet and the post will be re-checked on the next run.";
    default:
      return "The platform returned an unrecognized error.";
  }
}

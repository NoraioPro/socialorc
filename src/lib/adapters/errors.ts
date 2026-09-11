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
  | "UNKNOWN";

/** Worth trying again later: nothing about the request itself is wrong. */
const RETRYABLE: readonly AdapterErrorCode[] = ["RATE_LIMITED", "PLATFORM_UNAVAILABLE", "NETWORK"];

/** Never worth retrying without a human or config change. */
const PERMANENT: readonly AdapterErrorCode[] = [
  "AUTH_INVALID",
  "AUTH_EXPIRED",
  "PERMISSION_DENIED",
  "NOT_FOUND",
  "CONTENT_INVALID",
  "MEDIA_INVALID",
];

const MESSAGE_RULES: { pattern: RegExp; code: AdapterErrorCode }[] = [
  { pattern: /unauthorized|invalid[_ -]?token|invalid[_ -]?credentials|bad token/i, code: "AUTH_INVALID" },
  { pattern: /token (has )?expired|expired[_ -]?token|reauth(enticate)?/i, code: "AUTH_EXPIRED" },
  { pattern: /permission|forbidden|not authorized to|insufficient (scope|privilege)/i, code: "PERMISSION_DENIED" },
  { pattern: /not found|unknown (chat|user|page)|no such/i, code: "NOT_FOUND" },
  { pattern: /too long|exceeds maximum|character limit|too many characters|caption exceeds/i, code: "CONTENT_INVALID" },
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

export function isRetryable(code: AdapterErrorCode): boolean {
  return RETRYABLE.includes(code);
}

export function isPermanent(code: AdapterErrorCode): boolean {
  return PERMANENT.includes(code);
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
    default:
      return "The platform returned an unrecognized error.";
  }
}

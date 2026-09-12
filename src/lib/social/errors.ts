/**
 * Normalized errors for the social layer.
 *
 * A route handler must never hand a raw third-party payload to the browser: it
 * leaks the app's client id, internal ids and sometimes account details. Every
 * provider failure is mapped onto a stable code the frontend can switch on, and
 * the technical detail stays server-side (`technical` is logged, not returned).
 */

export const SOCIAL_ERROR_CODES = [
  "SOCIAL_AUTH_FAILED",
  "SOCIAL_AUTH_EXPIRED",
  "SOCIAL_REAUTHORIZE_REQUIRED",
  "SOCIAL_PERMISSION_REQUIRED",
  "SOCIAL_APP_REVIEW_REQUIRED",
  "SOCIAL_RATE_LIMITED",
  "SOCIAL_MEDIA_INVALID",
  "SOCIAL_UPLOAD_FAILED",
  "SOCIAL_PUBLISH_FAILED",
  "SOCIAL_ACCOUNT_UNAVAILABLE",
  "SOCIAL_PROVIDER_UNAVAILABLE",
  "SOCIAL_NOT_IMPLEMENTED",
  "SOCIAL_ACCOUNT_NOT_FOUND",
] as const;

export type SocialErrorCode = (typeof SOCIAL_ERROR_CODES)[number];

/** What the frontend should do about it — a code alone forces guesswork. */
export type SocialErrorAction = "RETRY" | "REAUTHORIZE" | "FIX_MEDIA" | "CONTACT_SUPPORT" | "NONE";

export class SocialError extends Error {
  readonly code: SocialErrorCode;
  readonly action: SocialErrorAction;
  readonly platform?: string;
  /** Server-side only: never serialized into an API response. */
  readonly technical?: unknown;
  readonly httpStatus?: number;

  constructor(input: {
    code: SocialErrorCode;
    message: string;
    action?: SocialErrorAction;
    platform?: string;
    technical?: unknown;
    httpStatus?: number;
  }) {
    super(input.message);
    this.name = "SocialError";
    this.code = input.code;
    this.action = input.action ?? DEFAULT_ACTIONS[input.code];
    this.platform = input.platform;
    this.technical = input.technical;
    this.httpStatus = input.httpStatus;
  }

  /** The safe projection sent to the browser. */
  toResponse() {
    return {
      success: false as const,
      error: {
        code: this.code,
        platform: this.platform,
        message: this.message,
        action: this.action,
      },
    };
  }
}

const DEFAULT_ACTIONS: Record<SocialErrorCode, SocialErrorAction> = {
  SOCIAL_AUTH_FAILED: "REAUTHORIZE",
  SOCIAL_AUTH_EXPIRED: "REAUTHORIZE",
  SOCIAL_REAUTHORIZE_REQUIRED: "REAUTHORIZE",
  SOCIAL_PERMISSION_REQUIRED: "REAUTHORIZE",
  SOCIAL_APP_REVIEW_REQUIRED: "NONE",
  SOCIAL_RATE_LIMITED: "RETRY",
  SOCIAL_MEDIA_INVALID: "FIX_MEDIA",
  SOCIAL_UPLOAD_FAILED: "RETRY",
  SOCIAL_PUBLISH_FAILED: "RETRY",
  SOCIAL_ACCOUNT_UNAVAILABLE: "REAUTHORIZE",
  SOCIAL_PROVIDER_UNAVAILABLE: "RETRY",
  SOCIAL_NOT_IMPLEMENTED: "NONE",
  SOCIAL_ACCOUNT_NOT_FOUND: "NONE",
};

/** HTTP status per code, so every route answers consistently. */
export function httpStatusFor(code: SocialErrorCode): number {
  switch (code) {
    case "SOCIAL_ACCOUNT_NOT_FOUND":
      return 404;
    case "SOCIAL_PERMISSION_REQUIRED":
    case "SOCIAL_APP_REVIEW_REQUIRED":
      return 403;
    case "SOCIAL_RATE_LIMITED":
      return 429;
    case "SOCIAL_MEDIA_INVALID":
      return 422;
    case "SOCIAL_PROVIDER_UNAVAILABLE":
      return 503;
    default:
      return 400;
  }
}

/**
 * TikTok's OAuth and Content Posting API speak in `{error: {code, message}}`
 * or `{error, error_description}`. Translate the documented codes we act on;
 * everything else becomes SOCIAL_PUBLISH_FAILED / SOCIAL_AUTH_FAILED with the
 * original message kept for the log.
 */
export function classifyTikTokError(
  raw: unknown,
  context: "auth" | "publish" | "upload" | "status" = "publish",
): SocialError {
  const payload = (raw ?? {}) as Record<string, unknown>;
  const errorObj = (payload.error ?? {}) as Record<string, unknown>;
  const code =
    (typeof errorObj.code === "string" && errorObj.code) ||
    (typeof payload.error === "string" && payload.error) ||
    (typeof payload.error_code === "string" && payload.error_code) ||
    "";
  const detail =
    (typeof errorObj.message === "string" && errorObj.message) ||
    (typeof payload.error_description === "string" && payload.error_description) ||
    (typeof payload.message === "string" && payload.message) ||
    "";

  const base = { platform: "tiktok", technical: raw } as const;

  switch (code) {
    case "access_token_invalid":
    case "invalid_grant":
      return new SocialError({
        ...base,
        code: "SOCIAL_AUTH_EXPIRED",
        message: "The TikTok authorization has expired. Reconnect the account.",
      });
    case "scope_not_authorized":
    case "scope_permission_missed":
    case "insufficient_scope":
      return new SocialError({
        ...base,
        code: "SOCIAL_PERMISSION_REQUIRED",
        message: "TikTok did not grant the scope this action needs. Reconnect and approve it.",
      });
    case "unaudited_client_can_only_post_to_private_accounts":
      return new SocialError({
        ...base,
        code: "SOCIAL_APP_REVIEW_REQUIRED",
        message:
          "TikTok only allows private (SELF_ONLY) posts until the app passes TikTok's audit for public posting.",
      });
    case "url_ownership_unverified":
      return new SocialError({
        ...base,
        code: "SOCIAL_MEDIA_INVALID",
        message:
          "TikTok requires verifying ownership of the domain serving this media. Upload the file instead of passing a URL.",
      });
    case "rate_limit_exceeded":
    case "too_many_requests":
      return new SocialError({
        ...base,
        code: "SOCIAL_RATE_LIMITED",
        message: "TikTok is rate limiting this app. Retry shortly.",
      });
    case "duration_check_failed":
    case "picture_size_check_failed":
    case "file_format_check_failed":
    case "video_pull_failed":
      return new SocialError({
        ...base,
        code: "SOCIAL_MEDIA_INVALID",
        message: detail
          ? `TikTok rejected the media: ${detail}`
          : "TikTok rejected the media (duration, size or format).",
      });
    default:
      return new SocialError({
        ...base,
        code: context === "auth" ? "SOCIAL_AUTH_FAILED" : context === "upload" ? "SOCIAL_UPLOAD_FAILED" : "SOCIAL_PUBLISH_FAILED",
        message: detail || "TikTok rejected the request.",
      });
  }
}

/** Wrap any thrown value into a SocialError without losing the cause. */
export function toSocialError(error: unknown, fallback: SocialErrorCode, platform?: string): SocialError {
  if (error instanceof SocialError) return error;
  return new SocialError({
    code: fallback,
    platform,
    message: error instanceof Error ? error.message : "Unexpected provider failure.",
    technical: error,
  });
}

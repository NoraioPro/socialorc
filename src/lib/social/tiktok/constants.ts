/**
 * Verified TikTok facts, in one place, each with the official page it came from
 * (checked against developers.tiktok.com on 2026-09-12 — re-check before
 * shipping, TikTok changes endpoints and limits without notice).
 */

/** Login Kit for Web — https://developers.tiktok.com/doc/login-kit-web */
export const TIKTOK_AUTHORIZE_URL = "https://www.tiktok.com/v2/auth/authorize/";

/** User Access Token Management — https://developers.tiktok.com/doc/oauth-user-access-token-management */
export const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
export const TIKTOK_REVOKE_URL = "https://open.tiktokapis.com/v2/oauth/revoke/";

/** TikTok API v2 base — every content endpoint below hangs off this. */
export const TIKTOK_API_BASE = "https://open.tiktokapis.com/v2";

/** GET /v2/user/info — https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info */
export const TIKTOK_USER_INFO_URL = `${TIKTOK_API_BASE}/user/info/`;

/** POST /v2/post/publish/creator_info/query/ — required before a Direct Post. */
export const TIKTOK_CREATOR_INFO_URL = `${TIKTOK_API_BASE}/post/publish/creator_info/query/`;

/** POST /v2/post/publish/video/init/ — Direct Post — https://developers.tiktok.com/doc/content-posting-api-reference-direct-post */
export const TIKTOK_DIRECT_POST_INIT_URL = `${TIKTOK_API_BASE}/post/publish/video/init/`;

/** POST /v2/post/publish/inbox/video/init/ — draft/inbox upload — https://developers.tiktok.com/doc/content-posting-api-reference-upload-video */
export const TIKTOK_INBOX_UPLOAD_INIT_URL = `${TIKTOK_API_BASE}/post/publish/inbox/video/init/`;

/** POST /v2/post/publish/status/fetch/ — https://developers.tiktok.com/doc/content-posting-api-reference-get-video-status */
export const TIKTOK_STATUS_FETCH_URL = `${TIKTOK_API_BASE}/post/publish/status/fetch/`;

/**
 * Scopes — https://developers.tiktok.com/doc/tiktok-api-scopes
 *
 * `user.info.basic` gives open_id/union_id/avatar_url/display_name;
 * `user.info.profile` adds username and the profile fields;
 * `video.upload` covers the inbox/draft endpoint only;
 * `video.publish` covers Direct Post and needs the app audited by TikTok.
 */
export const TIKTOK_SCOPES = {
  basic: "user.info.basic",
  profile: "user.info.profile",
  upload: "video.upload",
  publish: "video.publish",
} as const;

/** What we ask for at connect time, most privileged last. */
export const TIKTOK_REQUESTED_SCOPES = [
  TIKTOK_SCOPES.basic,
  TIKTOK_SCOPES.profile,
  TIKTOK_SCOPES.upload,
  TIKTOK_SCOPES.publish,
] as const;

/** Fields we read from /v2/user/info — only those the granted scopes allow. */
export const TIKTOK_USER_FIELDS = ["open_id", "union_id", "avatar_url", "display_name"] as const;

/** The extra field `user.info.profile` unlocks; requested separately so a
 *  basic-only grant still parses. */
export const TIKTOK_PROFILE_FIELDS = ["username"] as const;

/**
 * Media transfer limits — https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide
 *
 * FILE_UPLOAD: a video of 64 MB or less goes up as a single chunk;
 * anything larger must be split into chunks of at least 5 MB and at most
 * 64 MB (the final chunk may be smaller), with at most 1000 chunks.
 * PULL_FROM_URL instead requires the developer to have verified ownership of
 * the URL's domain, which is why FILE_UPLOAD is our default.
 */
export const TIKTOK_CHUNK_MIN_BYTES = 5 * 1024 * 1024;
export const TIKTOK_CHUNK_MAX_BYTES = 64 * 1024 * 1024;
export const TIKTOK_SINGLE_CHUNK_MAX_BYTES = 64 * 1024 * 1024;
export const TIKTOK_MAX_CHUNKS = 1000;

/**
 * Direct Post privacy levels TikTok may return from the creator-info query.
 * The client must display the creator's own options and honour the choice —
 * TikTok treats hardcoding this as a product-use violation.
 */
export const TIKTOK_PRIVACY_LEVELS = [
  "PUBLIC_TO_EVERYONE",
  "MUTUAL_FOLLOW_FRIENDS",
  "FOLLOWER_OF_CREATOR",
  "SELF_ONLY",
] as const;

export type TikTokPrivacyLevel = (typeof TIKTOK_PRIVACY_LEVELS)[number];

/** Status values returned by /post/publish/status/fetch/. */
export const TIKTOK_PUBLISH_STATUSES = [
  "PROCESSING_UPLOAD",
  "PROCESSING_DOWNLOAD",
  "SEND_TO_USER_INBOX",
  "PUBLISH_COMPLETE",
  "FAILED",
] as const;

export type TikTokPublishStatus = (typeof TIKTOK_PUBLISH_STATUSES)[number];

/** Caption limit on a TikTok video post. */
export const TIKTOK_CAPTION_MAX_LENGTH = 2200;

/** Direct Post title field (the caption shown on the video) is capped at 150. */
export const TIKTOK_DIRECT_POST_TITLE_MAX_LENGTH = 150;

export const TIKTOK_DOCS = {
  loginKitWeb: "https://developers.tiktok.com/doc/login-kit-web",
  tokenManagement: "https://developers.tiktok.com/doc/oauth-user-access-token-management",
  contentPostingGetStarted: "https://developers.tiktok.com/doc/content-posting-api-get-started",
  directPost: "https://developers.tiktok.com/doc/content-posting-api-reference-direct-post",
  upload: "https://developers.tiktok.com/doc/content-posting-api-reference-upload-video",
  creatorInfo: "https://developers.tiktok.com/doc/content-posting-api-reference-query-creator-info",
  postStatus: "https://developers.tiktok.com/doc/content-posting-api-reference-get-video-status",
  mediaTransfer: "https://developers.tiktok.com/doc/content-posting-api-media-transfer-guide",
  scopes: "https://developers.tiktok.com/doc/tiktok-api-scopes",
  userInfo: "https://developers.tiktok.com/doc/tiktok-api-v2-get-user-info",
} as const;

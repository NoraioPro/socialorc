import { Platform } from "@prisma/client";
import type { CapabilityReport } from "@/lib/social/types";

/**
 * Authentication method discriminator.
 * 
 * - `oauth`: Browser redirect flow (LinkedIn, Twitter, Instagram, Facebook, TikTok, YouTube)
 * - `token`: Static token stored directly (Telegram bot tokens, future Discord/Slack bots)
 * 
 * This distinction drives:
 * - UI: OAuth shows "Connect via..." button; token shows credential input form
 * - Refresh: OAuth tokens typically expire and refresh; bot tokens are permanent
 * - Reconnect flow: OAuth re-runs the consent flow; token re-prompts for the secret
 */
export type AuthMethod = "oauth" | "token";

/**
 * What a connector can actually do. Declared per platform so the UI, the
 * scheduler and the adapters agree without hard-coding platform names anywhere.
 * 
 * Capability flags are read by:
 * - Content validation (BasePlatformAdapter.validatePostContent)
 * - Token refresh logic (canRefresh in tokens.ts)
 * - Health reporting (platformReadiness in health.ts)
 * - UI feature toggles (to show/hide scheduling, media upload, etc.)
 */
export interface PlatformCapabilities {
  /** Accepts text-only posts. */
  text: boolean;
  /** Accepts image attachments. */
  image: boolean;
  /** Accepts video attachments. */
  video: boolean;
  /** More than one media item in a single post (carousel/gallery). */
  carousel: boolean;
  /** Publishing is impossible without media (e.g. Instagram feed, TikTok, YouTube). */
  mediaRequired: boolean;
  
  /**
   * Authentication method used by this platform.
   * Replaces the boolean `tokenBasedAuth` with a discriminated type.
   */
  authMethod: AuthMethod;
  
  /**
   * @deprecated Use `authMethod === "token"` instead.
   * Kept for backward compatibility during M0.6 transition.
   * Connects with a stored token instead of an OAuth redirect (e.g. Telegram bots).
   */
  tokenBasedAuth: boolean;
  
  /** Access tokens can be refreshed without re-consent (OAuth platforms typically true). */
  refreshableTokens: boolean;
  
  /** How far ahead a post may be scheduled, in days. */
  schedulingHorizonDays: number;
  
  /** Text limit applied when media is attached (platforms often cap captions). */
  captionMaxWithMedia?: number;
  /** List comments on the account's own posts via the platform API. */
  readComments: boolean;
  /** Post a top-level comment on the account's own post. */
  writeComments: boolean;
  /** Reply to an existing comment thread. */
  replyToComments: boolean;
  /** Delete a comment the connected account may moderate. */
  deleteComments: boolean;
  /** Like or react to the account's own posts. */
  reactToPosts: boolean;
  /** Like or react to comments on the account's posts. */
  reactToComments: boolean;
  /** Platform supports native scheduling (server-side scheduled posts). */
  nativeScheduling: boolean;
  /** Platform supports @mentions in post text. */
  mentions: boolean;
  /** Platform supports #hashtags in post text. */
  hashtags: boolean;
  /** Platform generates link previews from URLs in text. */
  linkPreview: boolean;
  /** Platform supports direct/private messages (for future inbox features). */
  directMessages: boolean;
  /** Platform supports stories/ephemeral content (24h posts). */
  stories: boolean;
  /** Platform supports polls in posts. */
  polls: boolean;
  /** Platform supports threading/reply chains. */
  threads: boolean;
}

export interface PlatformConfig {
  id: Platform;
  name: string;
  icon: string;
  color: string;
  maxTextLength: number;
  maxMediaCount: number;
  maxVideoSizeMb?: number;
  maxImageSizeMb?: number;
  supportedMediaTypes: string[];
  supportsScheduling: boolean;
  supportsVideo: boolean;
  requiresBusinessAccount?: boolean;
  capabilities: PlatformCapabilities;
  notes: string[];
}

export interface OAuthConfig {
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string | null;
  expiresAt?: Date | null;
  tokenType?: string;
  scope?: string;
  /** When the refresh token itself expires (TikTok's `refresh_expires_in`). */
  refreshExpiresAt?: Date | null;
  /** Some providers return the account id with the token (TikTok's `open_id`). */
  externalAccountId?: string;
}

/**
 * What a connector returns when it starts an authorization: the URL to send the
 * user to, plus anything that must stay server-side. TikTok (and PKCE in
 * general) needs the verifier kept out of the browser, so it travels with the
 * state cookie instead of inside `state`.
 */
export interface AuthorizationRequest {
  url: string;
  /** PKCE code verifier — never sent to the provider or to the browser. */
  verifier?: string;
  codeChallengeMethod?: "S256" | "plain";
}

export interface AccountInfo {
  platformUserId: string;
  platformUsername?: string;
  displayName?: string;
  profileImageUrl?: string;
  metadata?: Record<string, unknown>;
}

export interface PostOptions {
  text: string;
  mediaUrls?: string[];
  scheduledTime?: Date;
  visibility?: "public" | "private" | "connections";
  additionalOptions?: Record<string, unknown>;
}

export interface PostResult {
  success: boolean;
  platformPostId?: string;
  platformPostUrl?: string;
  error?: string;
  rawResponse?: unknown;
}

/**
 * Reaction kinds the connector may send. Platforms ignore kinds they do not support;
 * every adapter that can react at all supports at least `"like"`.
 */
export type ReactionKind =
  | "like"
  | "dislike"
  | "love"
  | "haha"
  | "wow"
  | "sad"
  | "angry"
  | "care";

export interface SocialComment {
  id: string;
  platform: Platform;
  platformPostId: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string;
  text: string;
  createdAt: Date;
  likeCount?: number;
  replyCount?: number;
  parentCommentId?: string;
  permalink?: string;
  canReply: boolean;
  canReact: boolean;
  canDelete: boolean;
  raw?: unknown;
}

export interface CommentPage {
  items: SocialComment[];
  nextCursor?: string | null;
}

export interface ListCommentsOptions {
  platformPostId: string;
  cursor?: string | null;
  limit?: number;
}

export interface ListCommentsResult {
  success: boolean;
  items?: SocialComment[];
  nextCursor?: string | null;
  error?: string;
  rawResponse?: unknown;
}

export interface WriteCommentOptions {
  platformPostId: string;
  text: string;
}

export interface ReplyToCommentOptions {
  commentId: string;
  text: string;
  /** Required on some platforms when the reply target is not globally unique. */
  platformPostId?: string;
}

export interface DeleteCommentOptions {
  commentId: string;
}

export interface ReactToPostOptions {
  platformPostId: string;
  kind: ReactionKind;
}

export interface ReactToCommentOptions {
  commentId: string;
  kind: ReactionKind;
  platformPostId?: string;
}

export interface UnreactToPostOptions {
  platformPostId: string;
  kind?: ReactionKind;
}

export interface UnreactToCommentOptions {
  commentId: string;
  kind?: ReactionKind;
}

export interface EngagementResult {
  success: boolean;
  commentId?: string;
  error?: string;
  rawResponse?: unknown;
}

export interface PlatformAdapter {
  platform: Platform;
  config: PlatformConfig;
  
  getOAuthUrl(state: string): string;
  
  exchangeCodeForTokens(code: string, codeVerifier?: string): Promise<OAuthTokens>;
  
  refreshAccessToken(refreshToken: string): Promise<OAuthTokens>;
  
  getAccountInfo(accessToken: string): Promise<AccountInfo>;
  
  createPost(accessToken: string, options: PostOptions): Promise<PostResult>;
  
  validateCredentials(): { valid: boolean; missing: string[] };

  listComments?(
    accessToken: string,
    options: ListCommentsOptions,
  ): Promise<ListCommentsResult>;

  createComment?(
    accessToken: string,
    options: WriteCommentOptions,
  ): Promise<EngagementResult>;

  replyToComment?(
    accessToken: string,
    options: ReplyToCommentOptions,
  ): Promise<EngagementResult>;

  deleteComment?(
    accessToken: string,
    options: DeleteCommentOptions,
  ): Promise<EngagementResult>;

  reactToPost?(
    accessToken: string,
    options: ReactToPostOptions,
  ): Promise<EngagementResult>;

  unreactToPost?(
    accessToken: string,
    options: UnreactToPostOptions,
  ): Promise<EngagementResult>;

  reactToComment?(
    accessToken: string,
    options: ReactToCommentOptions,
  ): Promise<EngagementResult>;

  unreactToComment?(
    accessToken: string,
    options: UnreactToCommentOptions,
  ): Promise<EngagementResult>;

  /**
   * Preferred over `getOAuthUrl` when implemented: returns the authorization
   * URL and the PKCE verifier separately so the caller can park the verifier in
   * the state cookie. Connectors without PKCE omit this.
   */
  createAuthorizationRequest?(state: string): AuthorizationRequest;

  /**
   * Per-account capability report (granted scopes + account type + app
   * approval). Connectors implement it as they are migrated to the provider
   * contract; the UI must treat an absent report as "nothing available".
   */
  getCapabilities?(input: { scopes: string[]; accountType?: string | null }): CapabilityReport;
}

export const PLATFORM_CONFIGS: Record<Platform, PlatformConfig> = {
  LINKEDIN: {
    id: "LINKEDIN",
    name: "LinkedIn",
    icon: "linkedin",
    color: "#0A66C2",
    maxTextLength: 3000,
    maxMediaCount: 20,
    maxImageSizeMb: 5,
    maxVideoSizeMb: 200,
    supportedMediaTypes: ["image/jpeg", "image/png", "image/gif", "video/mp4"],
    supportsScheduling: false,
    supportsVideo: true,
    capabilities: {
      text: true,
      image: true,
      video: true,
      carousel: false,
      mediaRequired: false,
      authMethod: "oauth",
      tokenBasedAuth: false,
      refreshableTokens: true,
      schedulingHorizonDays: 365,
      readComments: false,
      writeComments: false,
      replyToComments: false,
      deleteComments: false,
      reactToPosts: false,
      reactToComments: false,
      nativeScheduling: false,
      mentions: true,
      hashtags: true,
      linkPreview: true,
      directMessages: true,
      stories: false,
      polls: true,
      threads: false,
    },
    notes: [
      "Personal profile posting via Share on LinkedIn product",
      "Requires w_member_social scope",
      "Company Page posting requires w_organization_social scope",
      "Comment and reaction APIs require Community Management feed scopes (e.g. r_member_social_feed) that LinkedIn grants to approved partners only",
    ],
  },
  TWITTER: {
    id: "TWITTER",
    name: "X (Twitter)",
    icon: "twitter",
    color: "#000000",
    maxTextLength: 280,
    maxMediaCount: 4,
    maxImageSizeMb: 5,
    maxVideoSizeMb: 512,
    supportedMediaTypes: ["image/jpeg", "image/png", "image/gif", "image/webp", "video/mp4"],
    supportsScheduling: false,
    supportsVideo: true,
    capabilities: {
      text: true,
      image: true,
      video: true,
      carousel: false,
      mediaRequired: false,
      authMethod: "oauth",
      tokenBasedAuth: false,
      refreshableTokens: true,
      schedulingHorizonDays: 365,
      readComments: true,
      writeComments: true,
      replyToComments: true,
      deleteComments: true,
      reactToPosts: false,
      reactToComments: false,
      nativeScheduling: false,
      mentions: true,
      hashtags: true,
      linkPreview: true,
      directMessages: true,
      stories: false,
      polls: true,
      threads: true,
    },
    notes: [
      "Free tier: 50 tweets/day",
      "Basic ($200/mo): 50K tweets/mo",
      "Media upload requires OAuth 1.0a (v1.1 endpoint)",
      "Text posting works with OAuth 2.0 PKCE",
      "Replies are tweets (POST /2/tweets); conversation replies are read via recent search (7-day window)",
      "Like/unlike write endpoints are not available on self-serve API tiers",
    ],
  },
  INSTAGRAM: {
    id: "INSTAGRAM",
    name: "Instagram",
    icon: "instagram",
    color: "#E4405F",
    maxTextLength: 2200,
    maxMediaCount: 10,
    maxImageSizeMb: 8,
    maxVideoSizeMb: 100,
    supportedMediaTypes: ["image/jpeg", "video/mp4"],
    supportsScheduling: false,
    supportsVideo: true,
    requiresBusinessAccount: true,
    capabilities: {
      text: true,
      image: true,
      video: true,
      carousel: true,
      mediaRequired: true,
      authMethod: "oauth",
      tokenBasedAuth: false,
      refreshableTokens: true,
      schedulingHorizonDays: 30,
      captionMaxWithMedia: 2200,
      readComments: true,
      writeComments: true,
      replyToComments: true,
      deleteComments: true,
      reactToPosts: false,
      reactToComments: false,
      nativeScheduling: false,
      mentions: true,
      hashtags: true,
      linkPreview: false,
      directMessages: true,
      stories: true,
      polls: false,
      threads: false,
    },
    notes: [
      "REQUIRES Business or Creator account",
      "Must be linked to a Facebook Page",
      "Two-step publishing: create container → publish",
      "50 posts per 24 hours limit",
      "JPEG only for images (no PNG/WebP)",
      "Comment moderation requires instagram_manage_comments (reconnect after scope change)",
      "Instagram does not expose liking arbitrary media via Graph API",
    ],
  },
  FACEBOOK: {
    id: "FACEBOOK",
    name: "Facebook",
    icon: "facebook",
    color: "#1877F2",
    maxTextLength: 63206,
    maxMediaCount: 10,
    maxImageSizeMb: 10,
    maxVideoSizeMb: 1024,
    supportedMediaTypes: ["image/jpeg", "image/png", "image/gif", "video/mp4"],
    supportsScheduling: true,
    supportsVideo: true,
    capabilities: {
      text: true,
      image: true,
      video: true,
      carousel: true,
      mediaRequired: false,
      authMethod: "oauth",
      tokenBasedAuth: false,
      refreshableTokens: true,
      schedulingHorizonDays: 180,
      readComments: true,
      writeComments: true,
      replyToComments: true,
      deleteComments: true,
      reactToPosts: true,
      reactToComments: true,
      nativeScheduling: true,
      mentions: true,
      hashtags: true,
      linkPreview: true,
      directMessages: true,
      stories: true,
      polls: true,
      threads: false,
    },
    notes: [
      "Posts to Pages only (not personal profiles)",
      "Requires pages_manage_posts permission",
      "App Review required for non-owned Pages",
      "Business Verification required for Advanced Access",
      "Comment and like actions require pages_manage_engagement (reconnect after scope change)",
    ],
  },
  TIKTOK: {
    id: "TIKTOK",
    name: "TikTok",
    icon: "tiktok",
    color: "#000000",
    maxTextLength: 2200,
    maxMediaCount: 1,
    maxVideoSizeMb: 1024,
    supportedMediaTypes: ["video/mp4", "video/webm", "video/quicktime"],
    supportsScheduling: false,
    supportsVideo: true,
    capabilities: {
      text: false,
      image: false,
      video: true,
      carousel: false,
      mediaRequired: true,
      authMethod: "oauth",
      tokenBasedAuth: false,
      refreshableTokens: true,
      schedulingHorizonDays: 10,
      captionMaxWithMedia: 2200,
      readComments: false,
      writeComments: false,
      replyToComments: false,
      deleteComments: false,
      reactToPosts: false,
      reactToComments: false,
      nativeScheduling: false,
      mentions: true,
      hashtags: true,
      linkPreview: false,
      directMessages: true,
      stories: false,
      polls: false,
      threads: false,
    },
    notes: [
      "Video-only platform",
      "Unaudited apps: private/SELF_ONLY visibility only",
      "Requires TikTok audit for public posting",
      "Access token expires in 24h",
      "25 posts per creator per day limit",
      "TikTok Content Posting API does not expose public comment read/write",
    ],
  },
  YOUTUBE: {
    id: "YOUTUBE",
    name: "YouTube",
    icon: "youtube",
    color: "#FF0000",
    maxTextLength: 5000,
    maxMediaCount: 1,
    maxVideoSizeMb: 128000,
    supportedMediaTypes: ["video/mp4", "video/quicktime", "video/x-msvideo"],
    supportsScheduling: true,
    supportsVideo: true,
    capabilities: {
      text: false,
      image: false,
      video: true,
      carousel: false,
      mediaRequired: true,
      authMethod: "oauth",
      tokenBasedAuth: false,
      refreshableTokens: true,
      schedulingHorizonDays: 365,
      captionMaxWithMedia: 5000,
      readComments: true,
      writeComments: true,
      replyToComments: true,
      deleteComments: true,
      reactToPosts: true,
      reactToComments: false,
      nativeScheduling: true,
      mentions: false,
      hashtags: true,
      linkPreview: false,
      directMessages: false,
      stories: false,
      polls: false,
      threads: false,
    },
    notes: [
      "Video uploads only",
      "1,600 quota units per upload",
      "Default quota: ~6 uploads/day",
      "OAuth consent screen verification required",
      "Resumable uploads recommended for large files",
      "Comment threads use commentThreads/comments; video rating uses videos.rate (not comment likes)",
      "Comment write/delete requires youtube.force-ssl scope (reconnect after scope change)",
    ],
  },
  TELEGRAM: {
    id: "TELEGRAM",
    name: "Telegram",
    icon: "telegram",
    color: "#229ED9",
    maxTextLength: 4096,
    maxMediaCount: 10,
    maxImageSizeMb: 10,
    maxVideoSizeMb: 50,
    supportedMediaTypes: ["image/jpeg", "image/png", "image/webp", "video/mp4"],
    supportsScheduling: true,
    supportsVideo: true,
    capabilities: {
      text: true,
      image: true,
      video: true,
      carousel: false,
      mediaRequired: false,
      authMethod: "token",
      tokenBasedAuth: true,
      refreshableTokens: false,
      schedulingHorizonDays: 365,
      captionMaxWithMedia: 1024,
      readComments: true,
      writeComments: true,
      replyToComments: true,
      deleteComments: true,
      reactToPosts: true,
      reactToComments: true,
      nativeScheduling: true,
      mentions: true,
      hashtags: true,
      linkPreview: true,
      directMessages: true,
      stories: false,
      polls: true,
      threads: true,
    },
    notes: [
      "Bot-token connector (no OAuth handshake)",
      "Publishes to a chat or channel where the bot is a member/admin",
      "Caption limit is 1024 characters when media is attached",
      "Real-network reference implementation for token-based connectors",
      "Comment reads use getUpdates (replies the bot has received); reactions use setMessageReaction",
    ],
  },
};

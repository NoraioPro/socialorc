import { Platform } from "@prisma/client";
import type { CapabilityReport } from "@/lib/social/types";

/**
 * What a connector can actually do. Declared per platform so the UI, the
 * scheduler and the adapters agree without hard-coding platform names anywhere.
 */
export interface PlatformCapabilities {
  /** Accepts text-only posts. */
  text: boolean;
  image: boolean;
  video: boolean;
  /** More than one media item in a single post. */
  carousel: boolean;
  /** Publishing is impossible without media (e.g. Instagram feed, TikTok, YouTube). */
  mediaRequired: boolean;
  /** Connects with a stored token instead of an OAuth redirect (e.g. Telegram bots). */
  tokenBasedAuth: boolean;
  /** Access tokens can be refreshed without re-consent. */
  refreshableTokens: boolean;
  /** How far ahead a post may be scheduled, in days. */
  schedulingHorizonDays: number;
  /** Text limit applied when media is attached (platforms often cap captions). */
  captionMaxWithMedia?: number;
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

export interface PlatformAdapter {
  platform: Platform;
  config: PlatformConfig;
  
  getOAuthUrl(state: string): string;
  
  exchangeCodeForTokens(code: string, codeVerifier?: string): Promise<OAuthTokens>;
  
  refreshAccessToken(refreshToken: string): Promise<OAuthTokens>;
  
  getAccountInfo(accessToken: string): Promise<AccountInfo>;
  
  createPost(accessToken: string, options: PostOptions): Promise<PostResult>;
  
  validateCredentials(): { valid: boolean; missing: string[] };

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
      tokenBasedAuth: false,
      refreshableTokens: true,
      schedulingHorizonDays: 365,
    },
    notes: [
      "Personal profile posting via Share on LinkedIn product",
      "Requires w_member_social scope",
      "Company Page posting requires w_organization_social scope",
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
      tokenBasedAuth: false,
      refreshableTokens: true,
      schedulingHorizonDays: 365,
    },
    notes: [
      "Free tier: 50 tweets/day",
      "Basic ($200/mo): 50K tweets/mo",
      "Media upload requires OAuth 1.0a (v1.1 endpoint)",
      "Text posting works with OAuth 2.0 PKCE",
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
      tokenBasedAuth: false,
      refreshableTokens: true,
      schedulingHorizonDays: 30,
      captionMaxWithMedia: 2200,
    },
    notes: [
      "REQUIRES Business or Creator account",
      "Must be linked to a Facebook Page",
      "Two-step publishing: create container → publish",
      "50 posts per 24 hours limit",
      "JPEG only for images (no PNG/WebP)",
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
      tokenBasedAuth: false,
      refreshableTokens: true,
      schedulingHorizonDays: 180,
    },
    notes: [
      "Posts to Pages only (not personal profiles)",
      "Requires pages_manage_posts permission",
      "App Review required for non-owned Pages",
      "Business Verification required for Advanced Access",
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
      tokenBasedAuth: false,
      refreshableTokens: true,
      schedulingHorizonDays: 10,
      captionMaxWithMedia: 2200,
    },
    notes: [
      "Video-only platform",
      "Unaudited apps: private/SELF_ONLY visibility only",
      "Requires TikTok audit for public posting",
      "Access token expires in 24h",
      "25 posts per creator per day limit",
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
      tokenBasedAuth: false,
      refreshableTokens: true,
      schedulingHorizonDays: 365,
      captionMaxWithMedia: 5000,
    },
    notes: [
      "Video uploads only",
      "1,600 quota units per upload",
      "Default quota: ~6 uploads/day",
      "OAuth consent screen verification required",
      "Resumable uploads recommended for large files",
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
      tokenBasedAuth: true,
      refreshableTokens: false,
      schedulingHorizonDays: 365,
      captionMaxWithMedia: 1024,
    },
    notes: [
      "Bot-token connector (no OAuth handshake)",
      "Publishes to a chat or channel where the bot is a member/admin",
      "Caption limit is 1024 characters when media is attached",
      "Real-network reference implementation for token-based connectors",
    ],
  },
};

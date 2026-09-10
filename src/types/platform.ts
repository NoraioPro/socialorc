import { Platform } from "@prisma/client";

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
  
  exchangeCodeForTokens(code: string): Promise<OAuthTokens>;
  
  refreshAccessToken(refreshToken: string): Promise<OAuthTokens>;
  
  getAccountInfo(accessToken: string): Promise<AccountInfo>;
  
  createPost(accessToken: string, options: PostOptions): Promise<PostResult>;
  
  validateCredentials(): { valid: boolean; missing: string[] };
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
    notes: [
      "Video uploads only",
      "1,600 quota units per upload",
      "Default quota: ~6 uploads/day",
      "OAuth consent screen verification required",
      "Resumable uploads recommended for large files",
    ],
  },
};

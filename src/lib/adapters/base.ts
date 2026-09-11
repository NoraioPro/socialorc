import { Platform } from "@prisma/client";
import {
  PlatformAdapter,
  PlatformConfig,
  OAuthTokens,
  AccountInfo,
  PostOptions,
  PostResult,
  PLATFORM_CONFIGS,
} from "@/types/platform";

export abstract class BasePlatformAdapter implements PlatformAdapter {
  abstract platform: Platform;
  
  get config(): PlatformConfig {
    return PLATFORM_CONFIGS[this.platform];
  }

  abstract getOAuthUrl(state: string): string;
  
  abstract exchangeCodeForTokens(code: string): Promise<OAuthTokens>;
  
  abstract refreshAccessToken(refreshToken: string): Promise<OAuthTokens>;
  
  abstract getAccountInfo(accessToken: string): Promise<AccountInfo>;
  
  abstract createPost(accessToken: string, options: PostOptions): Promise<PostResult>;
  
  abstract validateCredentials(): { valid: boolean; missing: string[] };

  protected getRedirectUri(): string {
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    return `${baseUrl}/api/social/${this.platform.toLowerCase()}/callback`;
  }

  /** Best-effort MIME inference from a URL — used only when the extension is known. */
  protected static inferMimeType(url: string): string | null {
    const clean = url.split("?")[0].split("#")[0].toLowerCase();
    const ext = clean.slice(clean.lastIndexOf(".") + 1);
    const map: Record<string, string> = {
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      png: "image/png",
      gif: "image/gif",
      webp: "image/webp",
      mp4: "video/mp4",
      mov: "video/quicktime",
      webm: "video/webm",
      avi: "video/x-msvideo",
    };
    return map[ext] ?? null;
  }

  /**
   * Reject content the platform cannot accept, before spending an API call.
   * Rules come from the platform's declared capabilities, so a new connector
   * inherits enforcement by declaring them rather than by copying checks.
   */
  protected validatePostContent(options: PostOptions): string | null {
    const { capabilities, name } = this.config;
    const media = options.mediaUrls ?? [];

    if (capabilities.mediaRequired && media.length === 0) {
      return `${name} requires at least one media item — text-only posts are not supported`;
    }

    if (!capabilities.text && media.length === 0) {
      return `${name} cannot publish without media`;
    }

    if (options.text.length > this.config.maxTextLength) {
      return `Text exceeds maximum length of ${this.config.maxTextLength} characters`;
    }

    if (
      media.length > 0 &&
      capabilities.captionMaxWithMedia !== undefined &&
      options.text.length > capabilities.captionMaxWithMedia
    ) {
      return `Caption exceeds ${capabilities.captionMaxWithMedia} characters when media is attached`;
    }

    if (media.length > this.config.maxMediaCount) {
      return `Too many media items. Maximum is ${this.config.maxMediaCount}`;
    }

    if (media.length > 1 && !capabilities.carousel) {
      return `${name} does not support carousel posts (multiple media items)`;
    }

    if (media.length > 0 && this.config.supportedMediaTypes.length > 0) {
      for (const url of media) {
        const mime = BasePlatformAdapter.inferMimeType(url);
        if (mime && !this.config.supportedMediaTypes.includes(mime)) {
          return `Unsupported media type for ${name}: ${mime}. Supported: ${this.config.supportedMediaTypes.join(", ")}`;
        }
      }
    }

    return null;
  }
}

export class AdapterError extends Error {
  constructor(
    message: string,
    public code: string,
    public statusCode?: number,
    public rawError?: unknown
  ) {
    super(message);
    this.name = "AdapterError";
  }
}

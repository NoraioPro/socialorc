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

  protected validatePostContent(options: PostOptions): string | null {
    if (options.text.length > this.config.maxTextLength) {
      return `Text exceeds maximum length of ${this.config.maxTextLength} characters`;
    }
    
    if (options.mediaUrls && options.mediaUrls.length > this.config.maxMediaCount) {
      return `Too many media items. Maximum is ${this.config.maxMediaCount}`;
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

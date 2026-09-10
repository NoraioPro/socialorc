import { Platform } from "@prisma/client";
import { BasePlatformAdapter, AdapterError } from "./base";
import { OAuthTokens, AccountInfo, PostOptions, PostResult } from "@/types/platform";

const TIKTOK_AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const TIKTOK_TOKEN_URL = "https://open.tiktokapis.com/v2/oauth/token/";
const TIKTOK_API_URL = "https://open.tiktokapis.com/v2";

export class TikTokAdapter extends BasePlatformAdapter {
  platform = Platform.TIKTOK;

  validateCredentials(): { valid: boolean; missing: string[] } {
    const missing: string[] = [];
    
    if (!process.env.TIKTOK_CLIENT_KEY) missing.push("TIKTOK_CLIENT_KEY");
    if (!process.env.TIKTOK_CLIENT_SECRET) missing.push("TIKTOK_CLIENT_SECRET");
    
    return {
      valid: missing.length === 0,
      missing,
    };
  }

  private generateCodeVerifier(): string {
    const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~";
    let result = "";
    for (let i = 0; i < 64; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  getOAuthUrl(state: string): string {
    const codeVerifier = this.generateCodeVerifier();

    const params = new URLSearchParams({
      client_key: process.env.TIKTOK_CLIENT_KEY || "",
      redirect_uri: this.getRedirectUri(),
      scope: "user.info.basic,video.upload,video.publish",
      response_type: "code",
      state: `${state}:${codeVerifier}`,
      code_challenge: codeVerifier,
      code_challenge_method: "plain",
    });

    return `${TIKTOK_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string, codeVerifier?: string): Promise<OAuthTokens> {
    const body: Record<string, string> = {
      client_key: process.env.TIKTOK_CLIENT_KEY || "",
      client_secret: process.env.TIKTOK_CLIENT_SECRET || "",
      code,
      grant_type: "authorization_code",
      redirect_uri: this.getRedirectUri(),
    };

    if (codeVerifier) {
      body.code_verifier = codeVerifier;
    }

    const response = await fetch(TIKTOK_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new AdapterError(
        `Failed to exchange code for tokens: ${error}`,
        "TOKEN_EXCHANGE_FAILED",
        response.status,
        error
      );
    }

    const data = await response.json();

    if (data.error) {
      throw new AdapterError(
        data.error_description || data.error,
        "TOKEN_EXCHANGE_FAILED"
      );
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || null,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : null,
      tokenType: data.token_type,
      scope: data.scope,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    const response = await fetch(TIKTOK_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_key: process.env.TIKTOK_CLIENT_KEY || "",
        client_secret: process.env.TIKTOK_CLIENT_SECRET || "",
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new AdapterError(
        `Failed to refresh token: ${error}`,
        "TOKEN_REFRESH_FAILED",
        response.status,
        error
      );
    }

    const data = await response.json();

    if (data.error) {
      throw new AdapterError(
        data.error_description || data.error,
        "TOKEN_REFRESH_FAILED"
      );
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token || refreshToken,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : null,
      tokenType: data.token_type,
      scope: data.scope,
    };
  }

  async getAccountInfo(accessToken: string): Promise<AccountInfo> {
    const response = await fetch(
      `${TIKTOK_API_URL}/user/info/?fields=open_id,union_id,avatar_url,display_name`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new AdapterError(
        `Failed to get account info: ${error}`,
        "ACCOUNT_INFO_FAILED",
        response.status,
        error
      );
    }

    const data = await response.json();

    if (data.error?.code !== "ok") {
      throw new AdapterError(
        data.error?.message || "Failed to get TikTok account info",
        "ACCOUNT_INFO_FAILED"
      );
    }

    const user = data.data?.user;

    return {
      platformUserId: user?.open_id || user?.union_id,
      displayName: user?.display_name,
      profileImageUrl: user?.avatar_url,
      metadata: user,
    };
  }

  async createPost(accessToken: string, options: PostOptions): Promise<PostResult> {
    if (!options.mediaUrls || options.mediaUrls.length === 0) {
      return {
        success: false,
        error: "TikTok requires a video file for posting. Text-only posts are not supported.",
      };
    }

    const validationError = this.validatePostContent(options);
    if (validationError) {
      return { success: false, error: validationError };
    }

    try {
      const creatorInfoResponse = await fetch(
        `${TIKTOK_API_URL}/post/publish/creator_info/query/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({}),
        }
      );

      if (!creatorInfoResponse.ok) {
        return {
          success: false,
          error: "Failed to query creator info. Make sure your TikTok app has video.publish scope.",
        };
      }

      const creatorInfo = await creatorInfoResponse.json();
      
      const privacyLevels = creatorInfo.data?.privacy_level_options || ["SELF_ONLY"];
      const privacyLevel = privacyLevels.includes("PUBLIC_TO_EVERYONE")
        ? "PUBLIC_TO_EVERYONE"
        : "SELF_ONLY";

      const initResponse = await fetch(
        `${TIKTOK_API_URL}/post/publish/video/init/`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            post_info: {
              title: options.text.slice(0, 150),
              privacy_level: privacyLevel,
              disable_duet: false,
              disable_comment: false,
              disable_stitch: false,
            },
            source_info: {
              source: "PULL_FROM_URL",
              video_url: options.mediaUrls[0],
            },
          }),
        }
      );

      if (!initResponse.ok) {
        const error = await initResponse.json();
        return {
          success: false,
          error: error.error?.message || "Failed to initialize video upload",
          rawResponse: error,
        };
      }

      const initData = await initResponse.json();

      if (initData.error?.code !== "ok") {
        return {
          success: false,
          error: initData.error?.message || "Failed to initialize video upload",
          rawResponse: initData,
        };
      }

      const publishId = initData.data?.publish_id;

      return {
        success: true,
        platformPostId: publishId,
        rawResponse: {
          ...initData,
          note: privacyLevel === "SELF_ONLY"
            ? "Video posted as private (SELF_ONLY). App requires TikTok audit approval for public posting."
            : "Video upload initiated. Check TikTok for processing status.",
        },
      };
    } catch (error) {
      if (error instanceof AdapterError) {
        return { success: false, error: error.message, rawResponse: error.rawError };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }
}

export const tiktokAdapter = new TikTokAdapter();

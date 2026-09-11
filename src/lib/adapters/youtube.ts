import { Platform } from "@prisma/client";
import { BasePlatformAdapter, AdapterError } from "./base";
import { OAuthTokens, AccountInfo, PostOptions, PostResult } from "@/types/platform";
import {
  validateYouTubeCredentials,
  type CredentialValidationResult,
} from "./credentials";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3";

export class YouTubeAdapter extends BasePlatformAdapter {
  platform = Platform.YOUTUBE;

  /**
   * Validate YouTube/Google OAuth credentials: both presence and format.
   */
  validateCredentials(): { valid: boolean; missing: string[] } {
    const result = this.validateCredentialsExtended();
    const allIssues = [
      ...result.missing,
      ...result.invalid.map((i) => `${i.key} (invalid format)`),
    ];
    return { valid: result.valid, missing: allIssues };
  }

  /**
   * Extended validation returning detailed error information.
   */
  validateCredentialsExtended(): CredentialValidationResult {
    return validateYouTubeCredentials();
  }

  getOAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: process.env.YOUTUBE_CLIENT_ID || "",
      redirect_uri: this.getRedirectUri(),
      response_type: "code",
      scope: "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly",
      access_type: "offline",
      prompt: "consent",
      state,
    });

    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.YOUTUBE_CLIENT_ID || "",
        client_secret: process.env.YOUTUBE_CLIENT_SECRET || "",
        code,
        grant_type: "authorization_code",
        redirect_uri: this.getRedirectUri(),
      }),
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
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.YOUTUBE_CLIENT_ID || "",
        client_secret: process.env.YOUTUBE_CLIENT_SECRET || "",
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

    return {
      accessToken: data.access_token,
      refreshToken: refreshToken,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : null,
      tokenType: data.token_type,
      scope: data.scope,
    };
  }

  async getAccountInfo(accessToken: string): Promise<AccountInfo> {
    const response = await fetch(
      `${YOUTUBE_API_URL}/channels?part=snippet,contentDetails&mine=true`,
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
    const channel = data.items?.[0];

    if (!channel) {
      throw new AdapterError(
        "No YouTube channel found for this account",
        "NO_CHANNEL_FOUND"
      );
    }

    return {
      platformUserId: channel.id,
      platformUsername: channel.snippet?.customUrl,
      displayName: channel.snippet?.title,
      profileImageUrl: channel.snippet?.thumbnails?.default?.url,
      metadata: {
        uploadsPlaylistId: channel.contentDetails?.relatedPlaylists?.uploads,
        channelDescription: channel.snippet?.description,
      },
    };
  }

  async createPost(accessToken: string, options: PostOptions): Promise<PostResult> {
    if (!options.mediaUrls || options.mediaUrls.length === 0) {
      return {
        success: false,
        error: "YouTube requires a video file for posting. Text-only posts are not supported.",
      };
    }

    const validationError = this.validatePostContent(options);
    if (validationError) {
      return { success: false, error: validationError };
    }

    try {
      const videoMetadata = {
        snippet: {
          title: (options.additionalOptions?.title as string) || options.text.slice(0, 100),
          description: options.text,
          tags: (options.additionalOptions?.tags as string[]) || [],
          categoryId: (options.additionalOptions?.categoryId as string) || "22",
        },
        status: {
          privacyStatus: options.visibility === "private" ? "private" : "public",
          selfDeclaredMadeForKids: false,
        },
      };

      if (options.scheduledTime) {
        videoMetadata.status.privacyStatus = "private";
        (videoMetadata.status as Record<string, unknown>).publishAt = options.scheduledTime.toISOString();
      }

      const initResponse = await fetch(
        `${YOUTUBE_API_URL}/videos?uploadType=resumable&part=snippet,status`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
            "X-Upload-Content-Type": "video/*",
          },
          body: JSON.stringify(videoMetadata),
        }
      );

      if (!initResponse.ok) {
        const error = await initResponse.json();
        return {
          success: false,
          error: error.error?.message || `YouTube API error: ${initResponse.status}`,
          rawResponse: error,
        };
      }

      const uploadUrl = initResponse.headers.get("Location");

      if (!uploadUrl) {
        return {
          success: false,
          error: "Failed to get upload URL from YouTube",
        };
      }

      return {
        success: true,
        rawResponse: {
          uploadUrl,
          metadata: videoMetadata,
          note: "Resumable upload session created. Use the uploadUrl to upload video bytes. This requires additional implementation for actual file upload.",
          videoUrl: options.mediaUrls[0],
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

export const youtubeAdapter = new YouTubeAdapter();

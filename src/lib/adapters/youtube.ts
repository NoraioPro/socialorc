import { Platform } from "@prisma/client";
import { BasePlatformAdapter, AdapterError } from "./base";
import {
  OAuthTokens,
  AccountInfo,
  PostOptions,
  PostResult,
  ListCommentsOptions,
  ListCommentsResult,
  WriteCommentOptions,
  ReplyToCommentOptions,
  DeleteCommentOptions,
  ReactToPostOptions,
  UnreactToPostOptions,
  EngagementResult,
  SocialComment,
} from "@/types/platform";
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
      scope:
        "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.force-ssl",
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

  async listComments(
    accessToken: string,
    options: ListCommentsOptions,
  ): Promise<ListCommentsResult> {
    try {
      const limit = Math.min(options.limit ?? 20, 100);
      const params = new URLSearchParams({
        part: "snippet,replies",
        videoId: options.platformPostId,
        maxResults: String(limit),
        textFormat: "plainText",
      });
      if (options.cursor) {
        params.set("pageToken", options.cursor);
      }

      const response = await fetch(`${YOUTUBE_API_URL}/commentThreads?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          error: error.error?.message || `YouTube API error: ${response.status}`,
          rawResponse: error,
        };
      }

      const data = await response.json();
      const items: SocialComment[] = (data.items ?? []).map((thread: Record<string, unknown>) => {
        const top = (thread.snippet as Record<string, unknown>).topLevelComment as Record<
          string,
          unknown
        >;
        const snippet = top.snippet as Record<string, unknown>;
        return {
          id: top.id as string,
          platform: this.platform,
          platformPostId: options.platformPostId,
          authorId: (snippet.authorChannelId as { value?: string })?.value ?? "unknown",
          authorName: (snippet.authorDisplayName as string) ?? "unknown",
          text: (snippet.textDisplay as string) ?? "",
          createdAt: new Date((snippet.publishedAt as string) ?? Date.now()),
          likeCount: snippet.likeCount as number | undefined,
          replyCount: (thread.snippet as Record<string, unknown>).totalReplyCount as number | undefined,
          canReply: true,
          canReact: false,
          canDelete: true,
          raw: thread,
        };
      });

      return {
        success: true,
        items,
        nextCursor: data.nextPageToken ?? null,
        rawResponse: data,
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

  async createComment(
    accessToken: string,
    options: WriteCommentOptions,
  ): Promise<EngagementResult> {
    try {
      const accountInfo = await this.getAccountInfo(accessToken);
      const body = {
        snippet: {
          channelId: accountInfo.platformUserId,
          videoId: options.platformPostId,
          topLevelComment: {
            snippet: {
              textOriginal: options.text,
            },
          },
        },
      };

      const response = await fetch(`${YOUTUBE_API_URL}/commentThreads?part=snippet`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          error: error.error?.message || `YouTube API error: ${response.status}`,
          rawResponse: error,
        };
      }

      const data = await response.json();
      const commentId = data.snippet?.topLevelComment?.id as string | undefined;
      return { success: true, commentId, rawResponse: data };
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

  async replyToComment(
    accessToken: string,
    options: ReplyToCommentOptions,
  ): Promise<EngagementResult> {
    try {
      const body = {
        snippet: {
          parentId: options.commentId,
          textOriginal: options.text,
        },
      };

      const response = await fetch(`${YOUTUBE_API_URL}/comments?part=snippet`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          error: error.error?.message || `YouTube API error: ${response.status}`,
          rawResponse: error,
        };
      }

      const data = await response.json();
      return { success: true, commentId: data.id, rawResponse: data };
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

  async deleteComment(
    accessToken: string,
    options: DeleteCommentOptions,
  ): Promise<EngagementResult> {
    try {
      const response = await fetch(
        `${YOUTUBE_API_URL}/comments?id=${encodeURIComponent(options.commentId)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      if (!response.ok) {
        const error = await response.text();
        return {
          success: false,
          error: error || `YouTube API error: ${response.status}`,
          rawResponse: error,
        };
      }

      return { success: true };
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

  async reactToPost(
    accessToken: string,
    options: ReactToPostOptions,
  ): Promise<EngagementResult> {
    if (options.kind !== "like" && options.kind !== "dislike") {
      return {
        success: false,
        error: "YouTube videos.rate only supports like and dislike ratings",
      };
    }

    try {
      const params = new URLSearchParams({
        id: options.platformPostId,
        rating: options.kind,
      });
      const response = await fetch(`${YOUTUBE_API_URL}/videos/rate?${params.toString()}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const error = await response.text();
        return {
          success: false,
          error: error || `YouTube API error: ${response.status}`,
          rawResponse: error,
        };
      }

      return { success: true };
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

  async unreactToPost(
    accessToken: string,
    options: UnreactToPostOptions,
  ): Promise<EngagementResult> {
    try {
      const params = new URLSearchParams({
        id: options.platformPostId,
        rating: "none",
      });
      const response = await fetch(`${YOUTUBE_API_URL}/videos/rate?${params.toString()}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const error = await response.text();
        return {
          success: false,
          error: error || `YouTube API error: ${response.status}`,
          rawResponse: error,
        };
      }

      return { success: true };
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

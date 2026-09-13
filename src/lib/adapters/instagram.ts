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
  EngagementResult,
} from "@/types/platform";
import { graphPagingCursor, mapGraphComment } from "./meta-graph-comments";
import {
  validateInstagramCredentials,
  type CredentialValidationResult,
} from "./credentials";

const FACEBOOK_AUTH_URL = "https://www.facebook.com/v25.0/dialog/oauth";
const FACEBOOK_TOKEN_URL = "https://graph.facebook.com/v25.0/oauth/access_token";
const GRAPH_API_URL = "https://graph.facebook.com/v25.0";

export class InstagramAdapter extends BasePlatformAdapter {
  platform = Platform.INSTAGRAM;

  /**
   * Validate Instagram/Meta OAuth credentials: both presence and format.
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
    return validateInstagramCredentials();
  }

  getOAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: process.env.INSTAGRAM_APP_ID || "",
      redirect_uri: this.getRedirectUri(),
      state,
      scope:
        "instagram_basic,instagram_content_publish,instagram_manage_comments,pages_read_engagement,pages_show_list",
      response_type: "code",
    });

    return `${FACEBOOK_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
    const response = await fetch(FACEBOOK_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: process.env.INSTAGRAM_APP_ID || "",
        client_secret: process.env.INSTAGRAM_APP_SECRET || "",
        redirect_uri: this.getRedirectUri(),
        code,
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

    const longLivedResponse = await fetch(
      `${GRAPH_API_URL}/oauth/access_token?` +
        new URLSearchParams({
          grant_type: "fb_exchange_token",
          client_id: process.env.INSTAGRAM_APP_ID || "",
          client_secret: process.env.INSTAGRAM_APP_SECRET || "",
          fb_exchange_token: data.access_token,
        })
    );

    if (longLivedResponse.ok) {
      const longLivedData = await longLivedResponse.json();
      return {
        accessToken: longLivedData.access_token,
        refreshToken: null,
        expiresAt: longLivedData.expires_in
          ? new Date(Date.now() + longLivedData.expires_in * 1000)
          : null,
        tokenType: longLivedData.token_type || "bearer",
      };
    }

    return {
      accessToken: data.access_token,
      refreshToken: null,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : null,
      tokenType: data.token_type || "bearer",
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    const response = await fetch(
      `${GRAPH_API_URL}/oauth/access_token?` +
        new URLSearchParams({
          grant_type: "fb_exchange_token",
          client_id: process.env.INSTAGRAM_APP_ID || "",
          client_secret: process.env.INSTAGRAM_APP_SECRET || "",
          fb_exchange_token: refreshToken,
        })
    );

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
      refreshToken: data.access_token,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : null,
      tokenType: data.token_type || "bearer",
    };
  }

  async getAccountInfo(accessToken: string): Promise<AccountInfo> {
    const pagesResponse = await fetch(
      `${GRAPH_API_URL}/me/accounts?access_token=${accessToken}`
    );

    if (!pagesResponse.ok) {
      throw new AdapterError(
        "Failed to get Facebook Pages",
        "PAGES_FETCH_FAILED",
        pagesResponse.status
      );
    }

    const pagesData = await pagesResponse.json();
    const pages = pagesData.data || [];

    if (pages.length === 0) {
      throw new AdapterError(
        "No Facebook Pages found. Instagram Business accounts must be linked to a Facebook Page.",
        "NO_PAGES_FOUND"
      );
    }

    const pageAccessToken = pages[0].access_token;
    const pageId = pages[0].id;

    const igAccountResponse = await fetch(
      `${GRAPH_API_URL}/${pageId}?fields=instagram_business_account&access_token=${pageAccessToken}`
    );

    if (!igAccountResponse.ok) {
      throw new AdapterError(
        "Failed to get Instagram Business Account",
        "IG_ACCOUNT_FETCH_FAILED",
        igAccountResponse.status
      );
    }

    const igAccountData = await igAccountResponse.json();
    const igAccountId = igAccountData.instagram_business_account?.id;

    if (!igAccountId) {
      throw new AdapterError(
        "No Instagram Business account linked to this Facebook Page. Please connect an Instagram Business or Creator account.",
        "NO_IG_ACCOUNT"
      );
    }

    const igInfoResponse = await fetch(
      `${GRAPH_API_URL}/${igAccountId}?fields=id,username,name,profile_picture_url&access_token=${pageAccessToken}`
    );

    if (!igInfoResponse.ok) {
      throw new AdapterError(
        "Failed to get Instagram account info",
        "IG_INFO_FAILED",
        igInfoResponse.status
      );
    }

    const igInfo = await igInfoResponse.json();

    return {
      platformUserId: igAccountId,
      platformUsername: igInfo.username,
      displayName: igInfo.name || igInfo.username,
      profileImageUrl: igInfo.profile_picture_url,
      metadata: {
        pageId,
        pageAccessToken,
        facebookPages: pages.map((p: { id: string; name: string }) => ({ id: p.id, name: p.name })),
      },
    };
  }

  async createPost(accessToken: string, options: PostOptions): Promise<PostResult> {
    const invalidContent = this.validatePostContent(options);
    if (invalidContent) {
      return { success: false, error: invalidContent.message, code: invalidContent.code };
    }

    try {
      const accountInfo = await this.getAccountInfo(accessToken);
      const igUserId = accountInfo.platformUserId;
      const pageAccessToken = (accountInfo.metadata as Record<string, unknown>)?.pageAccessToken as string;

      if (!pageAccessToken) {
        return { success: false, error: "Page access token not found" };
      }

      const containerParams: Record<string, string> = {
        caption: options.text,
        access_token: pageAccessToken,
      };

      if (options.mediaUrls && options.mediaUrls.length > 0) {
        containerParams.image_url = options.mediaUrls[0];
      } else {
        return { success: false, error: "Instagram requires at least one image for posts" };
      }

      const containerResponse = await fetch(
        `${GRAPH_API_URL}/${igUserId}/media`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams(containerParams),
        }
      );

      if (!containerResponse.ok) {
        const error = await containerResponse.json();
        return {
          success: false,
          error: error.error?.message || "Failed to create media container",
          rawResponse: error,
        };
      }

      const containerData = await containerResponse.json();
      const containerId = containerData.id;

      const publishResponse = await fetch(
        `${GRAPH_API_URL}/${igUserId}/media_publish`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            creation_id: containerId,
            access_token: pageAccessToken,
          }),
        }
      );

      if (!publishResponse.ok) {
        const error = await publishResponse.json();
        return {
          success: false,
          error: error.error?.message || "Failed to publish media",
          rawResponse: error,
        };
      }

      const publishData = await publishResponse.json();

      return {
        success: true,
        platformPostId: publishData.id,
        platformPostUrl: `https://www.instagram.com/p/${publishData.id}/`,
        rawResponse: publishData,
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

  private async resolvePageAccessToken(accessToken: string): Promise<string> {
    const accountInfo = await this.getAccountInfo(accessToken);
    const pageAccessToken = (accountInfo.metadata as Record<string, unknown>)?.pageAccessToken as string;
    if (!pageAccessToken) {
      throw new AdapterError("Page access token not found", "PAGE_TOKEN_MISSING");
    }
    return pageAccessToken;
  }

  async listComments(
    accessToken: string,
    options: ListCommentsOptions,
  ): Promise<ListCommentsResult> {
    try {
      const pageAccessToken = await this.resolvePageAccessToken(accessToken);
      const limit = Math.min(options.limit ?? 25, 50);
      const params = new URLSearchParams({
        access_token: pageAccessToken,
        fields: "id,text,username,timestamp,like_count,replies",
        limit: String(limit),
      });
      if (options.cursor) {
        params.set("after", options.cursor);
      }

      const response = await fetch(
        `${GRAPH_API_URL}/${options.platformPostId}/comments?${params.toString()}`,
      );

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          error: error.error?.message || `Instagram API error: ${response.status}`,
          rawResponse: error,
        };
      }

      const data = await response.json();
      const items = (data.data ?? []).map((node: Record<string, unknown>) => {
        const mapped = mapGraphComment(this.platform, options.platformPostId, {
          id: String(node.id),
          text: String(node.text ?? ""),
          timestamp: node.timestamp as string | undefined,
          like_count: node.like_count as number | undefined,
          from: {
            id: String(node.username ?? "instagram"),
            username: node.username as string | undefined,
          },
        });
        const replies = (node.replies as { data?: unknown[] } | undefined)?.data ?? [];
        mapped.replyCount = replies.length;
        return mapped;
      });

      return {
        success: true,
        items,
        nextCursor: graphPagingCursor(data),
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
      const pageAccessToken = await this.resolvePageAccessToken(accessToken);
      const response = await fetch(`${GRAPH_API_URL}/${options.platformPostId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          message: options.text,
          access_token: pageAccessToken,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          error: error.error?.message || `Instagram API error: ${response.status}`,
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

  async replyToComment(
    accessToken: string,
    options: ReplyToCommentOptions,
  ): Promise<EngagementResult> {
    try {
      const pageAccessToken = await this.resolvePageAccessToken(accessToken);
      const response = await fetch(`${GRAPH_API_URL}/${options.commentId}/replies`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          message: options.text,
          access_token: pageAccessToken,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          error: error.error?.message || `Instagram API error: ${response.status}`,
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
      const pageAccessToken = await this.resolvePageAccessToken(accessToken);
      const response = await fetch(
        `${GRAPH_API_URL}/${options.commentId}?access_token=${pageAccessToken}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          error: error.error?.message || `Instagram API error: ${response.status}`,
          rawResponse: error,
        };
      }

      const data = await response.json();
      return { success: data.success === true, rawResponse: data };
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

export const instagramAdapter = new InstagramAdapter();

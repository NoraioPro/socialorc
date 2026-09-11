import { Platform } from "@prisma/client";
import { BasePlatformAdapter, AdapterError } from "./base";
import { OAuthTokens, AccountInfo, PostOptions, PostResult } from "@/types/platform";
import {
  validateFacebookCredentials,
  type CredentialValidationResult,
} from "./credentials";

const FACEBOOK_AUTH_URL = "https://www.facebook.com/v25.0/dialog/oauth";
const FACEBOOK_TOKEN_URL = "https://graph.facebook.com/v25.0/oauth/access_token";
const GRAPH_API_URL = "https://graph.facebook.com/v25.0";

export class FacebookAdapter extends BasePlatformAdapter {
  platform = Platform.FACEBOOK;

  /**
   * Validate Facebook OAuth credentials: both presence and format.
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
    return validateFacebookCredentials();
  }

  getOAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: process.env.FACEBOOK_APP_ID || "",
      redirect_uri: this.getRedirectUri(),
      state,
      scope: "pages_show_list,pages_read_engagement,pages_manage_posts,pages_manage_metadata",
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
        client_id: process.env.FACEBOOK_APP_ID || "",
        client_secret: process.env.FACEBOOK_APP_SECRET || "",
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
          client_id: process.env.FACEBOOK_APP_ID || "",
          client_secret: process.env.FACEBOOK_APP_SECRET || "",
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
          client_id: process.env.FACEBOOK_APP_ID || "",
          client_secret: process.env.FACEBOOK_APP_SECRET || "",
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
      `${GRAPH_API_URL}/me/accounts?fields=id,name,access_token,picture&access_token=${accessToken}`
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
        "No Facebook Pages found. You must be an admin of at least one Facebook Page to use this feature.",
        "NO_PAGES_FOUND"
      );
    }

    const primaryPage = pages[0];

    return {
      platformUserId: primaryPage.id,
      displayName: primaryPage.name,
      profileImageUrl: primaryPage.picture?.data?.url,
      metadata: {
        pageAccessToken: primaryPage.access_token,
        allPages: pages.map((p: { id: string; name: string; access_token: string }) => ({
          id: p.id,
          name: p.name,
          accessToken: p.access_token,
        })),
      },
    };
  }

  async createPost(accessToken: string, options: PostOptions): Promise<PostResult> {
    const validationError = this.validatePostContent(options);
    if (validationError) {
      return { success: false, error: validationError };
    }

    try {
      const accountInfo = await this.getAccountInfo(accessToken);
      const pageId = accountInfo.platformUserId;
      const pageAccessToken = (accountInfo.metadata as Record<string, unknown>)?.pageAccessToken as string;

      if (!pageAccessToken) {
        return { success: false, error: "Page access token not found" };
      }

      const postParams: Record<string, string> = {
        message: options.text,
        access_token: pageAccessToken,
      };

      if (options.scheduledTime) {
        postParams.published = "false";
        postParams.scheduled_publish_time = Math.floor(
          options.scheduledTime.getTime() / 1000
        ).toString();
      }

      let endpoint = `${GRAPH_API_URL}/${pageId}/feed`;

      if (options.mediaUrls && options.mediaUrls.length > 0) {
        postParams.url = options.mediaUrls[0];
        endpoint = `${GRAPH_API_URL}/${pageId}/photos`;
      }

      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams(postParams),
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          error: error.error?.message || `Facebook API error: ${response.status}`,
          rawResponse: error,
        };
      }

      const data = await response.json();

      return {
        success: true,
        platformPostId: data.id || data.post_id,
        platformPostUrl: `https://www.facebook.com/${data.id || data.post_id}`,
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
}

export const facebookAdapter = new FacebookAdapter();

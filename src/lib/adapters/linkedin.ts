import { Platform } from "@prisma/client";
import { BasePlatformAdapter, AdapterError } from "./base";
import { OAuthTokens, AccountInfo, PostOptions, PostResult } from "@/types/platform";
import {
  validateLinkedInCredentials,
  type CredentialValidationResult,
} from "./credentials";

const LINKEDIN_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const LINKEDIN_API_URL = "https://api.linkedin.com";
const LINKEDIN_VERSION = "202608";

export class LinkedInAdapter extends BasePlatformAdapter {
  platform = Platform.LINKEDIN;

  /**
   * Validate LinkedIn OAuth credentials: both presence and format.
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
    return validateLinkedInCredentials();
  }

  getOAuthUrl(state: string): string {
    const params = new URLSearchParams({
      response_type: "code",
      client_id: process.env.LINKEDIN_CLIENT_ID || "",
      redirect_uri: this.getRedirectUri(),
      state,
      scope: "openid profile email w_member_social",
    });

    return `${LINKEDIN_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
    const response = await fetch(LINKEDIN_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "authorization_code",
        code,
        redirect_uri: this.getRedirectUri(),
        client_id: process.env.LINKEDIN_CLIENT_ID || "",
        client_secret: process.env.LINKEDIN_CLIENT_SECRET || "",
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
    const response = await fetch(LINKEDIN_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: process.env.LINKEDIN_CLIENT_ID || "",
        client_secret: process.env.LINKEDIN_CLIENT_SECRET || "",
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
      refreshToken: data.refresh_token || refreshToken,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : null,
      tokenType: data.token_type,
      scope: data.scope,
    };
  }

  async getAccountInfo(accessToken: string): Promise<AccountInfo> {
    const response = await fetch(`${LINKEDIN_API_URL}/v2/userinfo`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

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

    return {
      platformUserId: data.sub,
      displayName: data.name,
      profileImageUrl: data.picture,
      metadata: {
        email: data.email,
        emailVerified: data.email_verified,
        locale: data.locale,
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
      const personUrn = `urn:li:person:${accountInfo.platformUserId}`;

      const postBody: Record<string, unknown> = {
        author: personUrn,
        commentary: options.text,
        visibility: options.visibility === "connections" ? "CONNECTIONS" : "PUBLIC",
        distribution: {
          feedDistribution: "MAIN_FEED",
          targetEntities: [],
          thirdPartyDistributionChannels: [],
        },
        lifecycleState: "PUBLISHED",
      };

      if (options.mediaUrls && options.mediaUrls.length > 0) {
        postBody.content = {
          multiImage: {
            images: options.mediaUrls.map((url) => ({
              altText: "",
              id: url,
            })),
          },
        };
      }

      const response = await fetch(`${LINKEDIN_API_URL}/rest/posts`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "LinkedIn-Version": LINKEDIN_VERSION,
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify(postBody),
      });

      if (!response.ok) {
        const errorText = await response.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { message: errorText };
        }

        return {
          success: false,
          error: errorData.message || `LinkedIn API error: ${response.status}`,
          rawResponse: errorData,
        };
      }

      const postId = response.headers.get("x-restli-id") || response.headers.get("x-linkedin-id");

      return {
        success: true,
        platformPostId: postId || undefined,
        platformPostUrl: postId
          ? `https://www.linkedin.com/feed/update/${postId}`
          : undefined,
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

export const linkedInAdapter = new LinkedInAdapter();

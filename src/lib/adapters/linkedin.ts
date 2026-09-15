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

  /**
   * LinkedIn's Images API: register an upload, PUT the bytes, and return the
   * image URN the post must reference. LinkedIn cannot fetch a URL itself, so a
   * URL handed straight to the post would be rejected.
   */
  private async uploadImage(
    accessToken: string,
    ownerUrn: string,
    sourceUrl: string,
  ): Promise<string> {
    const initResponse = await fetch(
      `${LINKEDIN_API_URL}/rest/images?action=initializeUpload`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
          "LinkedIn-Version": LINKEDIN_VERSION,
          "X-Restli-Protocol-Version": "2.0.0",
        },
        body: JSON.stringify({ initializeUploadRequest: { owner: ownerUrn } }),
      },
    );

    if (!initResponse.ok) {
      const detail = await initResponse.text().catch(() => "");
      throw new AdapterError(
        "LinkedIn refused the image upload registration.",
        "IMAGE_UPLOAD_FAILED",
        initResponse.status,
        detail,
      );
    }

    const initData = (await initResponse.json()) as {
      value?: { uploadUrl?: string; image?: string };
    };
    const uploadUrl = initData.value?.uploadUrl;
    const imageUrn = initData.value?.image;

    if (!uploadUrl || !imageUrn) {
      throw new AdapterError(
        "LinkedIn returned no upload URL or image urn.",
        "IMAGE_UPLOAD_FAILED",
      );
    }

    const source = await fetch(sourceUrl);
    if (!source.ok) {
      throw new AdapterError(
        `Could not read the image to upload (HTTP ${source.status}).`,
        "IMAGE_UPLOAD_FAILED",
      );
    }
    const bytes = new Uint8Array(await source.arrayBuffer());

    const putResponse = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/octet-stream",
      },
      body: bytes,
    });

    if (!putResponse.ok) {
      throw new AdapterError(
        `LinkedIn rejected the image upload (HTTP ${putResponse.status}).`,
        "IMAGE_UPLOAD_FAILED",
        putResponse.status,
      );
    }

    return imageUrn;
  }

  async createPost(accessToken: string, options: PostOptions): Promise<PostResult> {
    const invalidContent = this.validatePostContent(options);
    if (invalidContent) {
      return { success: false, error: invalidContent.message, code: invalidContent.code };
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
        // The bytes have to be registered and uploaded first; the post then
        // references the returned URN. Sending the URL itself is rejected by the
        // API, which is why the declared single-image capability never worked.
        const imageUrn = await this.uploadImage(
          accessToken,
          personUrn,
          options.mediaUrls[0],
        );
        postBody.content = { media: { id: imageUrn } };
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

      // LinkedIn confirms a published post by returning its urn in the
      // x-restli-id header. A 2xx without it means nothing was confirmed, and
      // reporting success would record a PUBLISHED post with no id and no URL.
      if (!postId) {
        return {
          success: false,
          error: "LinkedIn returned no post id, so the post was not confirmed.",
        };
      }

      return {
        success: true,
        platformPostId: postId,
        platformPostUrl: `https://www.linkedin.com/feed/update/${postId}`,
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

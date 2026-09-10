import { Platform } from "@prisma/client";
import { BasePlatformAdapter, AdapterError } from "./base";
import { OAuthTokens, AccountInfo, PostOptions, PostResult } from "@/types/platform";

const TWITTER_AUTH_URL = "https://x.com/i/oauth2/authorize";
const TWITTER_TOKEN_URL = "https://api.x.com/2/oauth2/token";
const TWITTER_API_URL = "https://api.x.com/2";

export class TwitterAdapter extends BasePlatformAdapter {
  platform = Platform.TWITTER;

  validateCredentials(): { valid: boolean; missing: string[] } {
    const missing: string[] = [];
    
    if (!process.env.TWITTER_CLIENT_ID) missing.push("TWITTER_CLIENT_ID");
    if (!process.env.TWITTER_CLIENT_SECRET) missing.push("TWITTER_CLIENT_SECRET");
    
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

  private async generateCodeChallenge(verifier: string): Promise<string> {
    const encoder = new TextEncoder();
    const data = encoder.encode(verifier);
    const hash = await crypto.subtle.digest("SHA-256", data);
    const base64 = btoa(String.fromCharCode(...new Uint8Array(hash)));
    return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  getOAuthUrl(state: string): string {
    const codeVerifier = this.generateCodeVerifier();
    
    const params = new URLSearchParams({
      response_type: "code",
      client_id: process.env.TWITTER_CLIENT_ID || "",
      redirect_uri: this.getRedirectUri(),
      scope: "tweet.read tweet.write users.read offline.access",
      state: `${state}:${codeVerifier}`,
      code_challenge: codeVerifier,
      code_challenge_method: "plain",
    });

    return `${TWITTER_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string, codeVerifier?: string): Promise<OAuthTokens> {
    const basicAuth = Buffer.from(
      `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`
    ).toString("base64");

    const body: Record<string, string> = {
      grant_type: "authorization_code",
      code,
      redirect_uri: this.getRedirectUri(),
      client_id: process.env.TWITTER_CLIENT_ID || "",
    };

    if (codeVerifier) {
      body.code_verifier = codeVerifier;
    }

    const response = await fetch(TWITTER_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
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
    const basicAuth = Buffer.from(
      `${process.env.TWITTER_CLIENT_ID}:${process.env.TWITTER_CLIENT_SECRET}`
    ).toString("base64");

    const response = await fetch(TWITTER_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: refreshToken,
        client_id: process.env.TWITTER_CLIENT_ID || "",
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
    const response = await fetch(`${TWITTER_API_URL}/users/me?user.fields=profile_image_url,name,username`, {
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
      platformUserId: data.data.id,
      platformUsername: data.data.username,
      displayName: data.data.name,
      profileImageUrl: data.data.profile_image_url,
      metadata: data.data,
    };
  }

  async createPost(accessToken: string, options: PostOptions): Promise<PostResult> {
    const validationError = this.validatePostContent(options);
    if (validationError) {
      return { success: false, error: validationError };
    }

    try {
      const tweetBody: Record<string, unknown> = {
        text: options.text,
      };

      const response = await fetch(`${TWITTER_API_URL}/tweets`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(tweetBody),
      });

      if (!response.ok) {
        const errorData = await response.json();
        return {
          success: false,
          error: errorData.detail || errorData.title || `Twitter API error: ${response.status}`,
          rawResponse: errorData,
        };
      }

      const data = await response.json();

      return {
        success: true,
        platformPostId: data.data.id,
        platformPostUrl: `https://x.com/i/status/${data.data.id}`,
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

export const twitterAdapter = new TwitterAdapter();

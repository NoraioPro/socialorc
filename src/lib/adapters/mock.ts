import { Platform } from "@prisma/client";
import { BasePlatformAdapter } from "./base";
import { OAuthTokens, AccountInfo, PostOptions, PostResult } from "@/types/platform";

/**
 * Mock adapter for development and testing.
 * Simulates all platform operations without making real API calls.
 * Use when:
 * - Testing the full workflow locally without real credentials
 * - Running automated tests
 * - Demo/staging environments
 */
export class MockAdapter extends BasePlatformAdapter {
  platform: Platform;

  constructor(platform: Platform) {
    super();
    this.platform = platform;
  }

  validateCredentials(): { valid: boolean; missing: string[] } {
    return { valid: true, missing: [] };
  }

  getOAuthUrl(state: string): string {
    const baseUrl = process.env.NEXTAUTH_URL || "http://localhost:3000";
    return `${baseUrl}/api/social/mock/callback?state=${state}&platform=${this.platform}`;
  }

  async exchangeCodeForTokens(): Promise<OAuthTokens> {
    return {
      accessToken: `mock_access_token_${this.platform}_${Date.now()}`,
      refreshToken: `mock_refresh_token_${this.platform}_${Date.now()}`,
      expiresAt: new Date(Date.now() + 3600 * 1000),
      tokenType: "Bearer",
      scope: "mock_scope",
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    return {
      accessToken: `mock_refreshed_token_${this.platform}_${Date.now()}`,
      refreshToken: refreshToken,
      expiresAt: new Date(Date.now() + 3600 * 1000),
      tokenType: "Bearer",
      scope: "mock_scope",
    };
  }

  async getAccountInfo(): Promise<AccountInfo> {
    return {
      platformUserId: `mock_user_${this.platform}_${Date.now()}`,
      platformUsername: `mock_${this.platform.toLowerCase()}_user`,
      displayName: `Mock ${this.platform} Account`,
      profileImageUrl: undefined,
      metadata: {
        isMock: true,
        platform: this.platform,
      },
    };
  }

  async createPost(_accessToken: string, options: PostOptions): Promise<PostResult> {
    const validationError = this.validatePostContent(options);
    if (validationError) {
      return { success: false, error: validationError };
    }

    const mockPostId = `mock_post_${this.platform}_${Date.now()}`;

    console.log(`[MOCK ${this.platform}] Publishing post:`, {
      text: options.text.slice(0, 100) + (options.text.length > 100 ? "..." : ""),
      mediaCount: options.mediaUrls?.length || 0,
    });

    return {
      success: true,
      platformPostId: mockPostId,
      platformPostUrl: `https://mock.${this.platform.toLowerCase()}.com/post/${mockPostId}`,
      rawResponse: {
        mock: true,
        platform: this.platform,
        timestamp: new Date().toISOString(),
      },
    };
  }
}

export function createMockAdapter(platform: Platform): MockAdapter {
  return new MockAdapter(platform);
}

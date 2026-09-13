import { Platform } from "@prisma/client";
import { BasePlatformAdapter } from "./base";
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
  ReactToCommentOptions,
  UnreactToCommentOptions,
  EngagementResult,
} from "@/types/platform";
import {
  mockCreateComment,
  mockDeleteComment,
  mockFindComment,
  mockListComments,
  mockReact,
  mockReactToPost,
} from "./mock-engagement-store";

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
    const invalidContent = this.validatePostContent(options);
    if (invalidContent) {
      return { success: false, error: invalidContent.message, code: invalidContent.code };
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

  async listComments(
    _accessToken: string,
    options: ListCommentsOptions,
  ): Promise<ListCommentsResult> {
    const limit = options.limit ?? 25;
    const page = mockListComments(
      this.platform,
      options.platformPostId,
      options.cursor,
      limit,
    );
    return { success: true, items: page.items, nextCursor: page.nextCursor };
  }

  async createComment(
    _accessToken: string,
    options: WriteCommentOptions,
  ): Promise<EngagementResult> {
    const comment = mockCreateComment(this.platform, options.platformPostId, options.text);
    return { success: true, commentId: comment.id };
  }

  async replyToComment(
    _accessToken: string,
    options: ReplyToCommentOptions,
  ): Promise<EngagementResult> {
    const parent = mockFindComment(this.platform, options.commentId);
    const platformPostId = options.platformPostId ?? parent?.platformPostId;
    if (!platformPostId) {
      return { success: false, error: "platformPostId is required when the parent comment is unknown" };
    }
    const comment = mockCreateComment(
      this.platform,
      platformPostId,
      options.text,
      options.commentId,
    );
    return { success: true, commentId: comment.id };
  }

  async deleteComment(
    _accessToken: string,
    options: DeleteCommentOptions,
  ): Promise<EngagementResult> {
    const found = mockFindComment(this.platform, options.commentId);
    if (!found) {
      return { success: false, error: "Comment not found" };
    }
    const ok = mockDeleteComment(this.platform, found.platformPostId, options.commentId);
    return ok ? { success: true } : { success: false, error: "Comment not found" };
  }

  async reactToPost(
    _accessToken: string,
    options: ReactToPostOptions,
  ): Promise<EngagementResult> {
    mockReactToPost(this.platform, options.platformPostId, options.kind, true);
    return { success: true };
  }

  async unreactToPost(
    _accessToken: string,
    options: UnreactToPostOptions,
  ): Promise<EngagementResult> {
    const kind = options.kind ?? "like";
    mockReactToPost(this.platform, options.platformPostId, kind, false);
    return { success: true };
  }

  async reactToComment(
    _accessToken: string,
    options: ReactToCommentOptions,
  ): Promise<EngagementResult> {
    const ok = mockReact(this.platform, options.commentId, options.kind, true);
    return ok ? { success: true } : { success: false, error: "Comment not found" };
  }

  async unreactToComment(
    _accessToken: string,
    options: UnreactToCommentOptions,
  ): Promise<EngagementResult> {
    const kind = options.kind ?? "like";
    const ok = mockReact(this.platform, options.commentId, kind, false);
    return ok ? { success: true } : { success: false, error: "Comment not found" };
  }
}

export function createMockAdapter(platform: Platform): MockAdapter {
  return new MockAdapter(platform);
}

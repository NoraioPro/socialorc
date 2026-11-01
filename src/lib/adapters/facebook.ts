import { Platform } from "@prisma/client";
import { BasePlatformAdapter, AdapterError } from "./base";
import { metaAppId } from "./meta-app";
import {
  OAuthTokens,
  AccountInfo,
  ConnectTarget,
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
import { graphPagingCursor, mapGraphComment } from "./meta-graph-comments";
import {
  FACEBOOK_AUTH_URL,
  GRAPH_API_URL,
  exchangeCodeForLongLivedUserToken,
  fetchManagedPages,
  metaTokensDoNotRefresh,
  type ManagedPage,
} from "./meta-graph";
import { encodeMetaPageCredential, parseMetaCredential } from "./meta-credential";
import { formatGraphError } from "./errors";
import {
  validateFacebookCredentials,
  type CredentialValidationResult,
} from "./credentials";

const PAGE_FIELDS = "id,name,access_token,picture{url},tasks";

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
      client_id: metaAppId(),
      redirect_uri: this.getRedirectUri(),
      state,
      // Only the scopes Meta still accepts. `pages_manage_metadata` and
      // `pages_manage_engagement` were removed from Facebook Login; requesting
      // them aborts the whole dialog with "Invalid Scopes: ..." and the user
      // never reaches the consent screen (observed 2026-11-01). Comment and like
      // actions therefore run on pages_manage_posts alone.
      scope: "pages_show_list,pages_read_engagement,pages_manage_posts,business_management",
      response_type: "code",
    });

    return `${FACEBOOK_AUTH_URL}?${params.toString()}`;
  }

  /** Returns the long-lived USER token; the callback turns it into a Page credential. */
  async exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
    return exchangeCodeForLongLivedUserToken(code, this.getRedirectUri());
  }

  async refreshAccessToken(): Promise<OAuthTokens> {
    return metaTokensDoNotRefresh("Facebook");
  }

  /** Pages this grant can publish to — one per entry, chosen by the user when there are several. */
  async listConnectTargets(userToken: string): Promise<ConnectTarget[]> {
    const pages = await fetchManagedPages(userToken, PAGE_FIELDS);
    // Diagnostic for the "no Page found" dead end: an operator needs to know
    // whether the grant saw no Page at all, or saw Pages it may not publish to.
    if (pages.length === 0) {
      console.warn("[facebook] listConnectTargets: the grant returned 0 Pages");
    } else if (pages.filter(publishablePage).length === 0) {
      console.warn(
        `[facebook] listConnectTargets: ${pages.length} Page(s) returned, none publishable (tasks: ${pages
          .map((p) => (Array.isArray(p.tasks) ? p.tasks.join("/") : "none"))
          .join(" | ")})`,
      );
    }
    return pages.filter(publishablePage).map((page) => ({
      id: page.id,
      name: page.name,
      pictureUrl: page.picture?.data?.url,
    }));
  }

  /**
   * Store the chosen Page's own token. A Page token read with a long-lived
   * user token has no expiry, so the connection no longer dies after 60 days.
   * The Page list is re-read here rather than trusted from the browser: the id
   * must be one this grant actually manages.
   */
  async connectTarget(
    userToken: string,
    pageId: string,
  ): Promise<{ tokens: OAuthTokens; info: AccountInfo }> {
    const pages = await fetchManagedPages(userToken, PAGE_FIELDS);
    const page = pages.find((p) => p.id === pageId);
    if (!page || !publishablePage(page)) {
      throw new AdapterError(
        "That Facebook Page is not one this login can publish to.",
        "PAGE_NOT_MANAGED",
      );
    }

    return {
      tokens: {
        accessToken: encodeMetaPageCredential({ token: page.access_token as string, pageId: page.id }),
        refreshToken: null,
        // Page tokens from a long-lived user token do not expire. Recording the
        // user token's 60-day expiry here is what used to put a healthy Page
        // into the reconnect banner.
        expiresAt: null,
        tokenType: "page",
      },
      info: {
        platformUserId: page.id,
        displayName: page.name,
        profileImageUrl: page.picture?.data?.url,
        metadata: { accountType: "facebook_page", pageId: page.id },
      },
    };
  }

  async getAccountInfo(accessToken: string): Promise<AccountInfo> {
    const credential = parseMetaCredential(accessToken);
    if (credential.kind === "page") {
      const response = await fetch(
        `${GRAPH_API_URL}/${credential.pageId}?` +
          new URLSearchParams({ fields: "id,name,picture{url}", access_token: credential.token }),
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const formatted = formatGraphError(body, "Failed to get Facebook Page");
        throw new AdapterError(formatted.message, "PAGE_FETCH_FAILED", response.status, body);
      }
      return {
        platformUserId: body.id,
        displayName: body.name,
        profileImageUrl: body.picture?.data?.url,
        metadata: { accountType: "facebook_page", pageId: body.id },
      };
    }

    // Legacy row (bare long-lived user token, connected before Page selection
    // existed): first Page, as before. These expire and are reconnected.
    const pages = await fetchManagedPages(credential.token, PAGE_FIELDS);
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
        allPages: pages.map((p) => ({ id: p.id, name: p.name, accessToken: p.access_token })),
      },
    };
  }

  /** The Page to act as and its token, from either credential shape. */
  private async resolvePage(accessToken: string): Promise<{ pageId: string; pageToken: string }> {
    const credential = parseMetaCredential(accessToken);
    if (credential.kind === "page") {
      return { pageId: credential.pageId, pageToken: credential.token };
    }
    const info = await this.getAccountInfo(credential.token);
    const pageToken = (info.metadata as Record<string, unknown>)?.pageAccessToken as string;
    if (!pageToken) {
      throw new AdapterError("Page access token not found", "PAGE_TOKEN_MISSING");
    }
    return { pageId: info.platformUserId, pageToken };
  }

  async createPost(accessToken: string, options: PostOptions): Promise<PostResult> {
    const invalidContent = this.validatePostContent(options);
    if (invalidContent) {
      return { success: false, error: invalidContent.message, code: invalidContent.code };
    }

    try {
      const { pageId, pageToken } = await this.resolvePage(accessToken);

      const postParams: Record<string, string> = {
        message: options.text,
        access_token: pageToken,
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
        const error = await response.json().catch(() => ({}));
        const formatted = formatGraphError(error, `Facebook API error: ${response.status}`);
        return {
          success: false,
          error: formatted.message,
          code: formatted.code,
          rawResponse: error,
        };
      }

      const data = await response.json();

      // /photos answers { id: <photo id>, post_id: <page post id> }. The post id
      // is what comments, insights and the permalink address; recording the
      // photo id pointed every later read at the wrong object. A scheduled
      // (unpublished) photo may have no post_id yet, so fall back to the id.
      const isPhoto = endpoint.endsWith("/photos");
      const platformPostId = isPhoto ? data.post_id || data.id : data.id || data.post_id;

      // A 200 with no id means Facebook confirmed nothing. Reporting success
      // here would record a PUBLISHED post that does not exist.
      if (!platformPostId) {
        return {
          success: false,
          error: "Facebook returned no post id, so the post was not confirmed.",
          rawResponse: data,
        };
      }

      return {
        success: true,
        platformPostId,
        platformPostUrl: `https://www.facebook.com/${platformPostId}`,
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

  private async resolvePageAccessToken(accessToken: string): Promise<string> {
    return (await this.resolvePage(accessToken)).pageToken;
  }


  async listComments(
    accessToken: string,
    options: ListCommentsOptions,
  ): Promise<ListCommentsResult> {
    try {
      const pageAccessToken = await this.resolvePageAccessToken(accessToken);
      const limit = Math.min(options.limit ?? 25, 100);
      const params = new URLSearchParams({
        access_token: pageAccessToken,
        fields: "id,message,from,created_time,like_count,comment_count,parent",
        limit: String(limit),
        filter: "stream",
      });
      if (options.cursor) {
        params.set("after", options.cursor);
      }

      const response = await fetch(
        `${GRAPH_API_URL}/${options.platformPostId}/comments?${params.toString()}`,
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return {
          success: false,
          error: formatGraphError(error, `Facebook API error: ${response.status}`).message,
          rawResponse: error,
        };
      }

      const data = await response.json();
      const items = (data.data ?? []).map((node: Record<string, unknown>) =>
        mapGraphComment(this.platform, options.platformPostId, node as never, { canReact: true }),
      );

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
        const error = await response.json().catch(() => ({}));
        return {
          success: false,
          error: formatGraphError(error, `Facebook API error: ${response.status}`).message,
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
      const response = await fetch(`${GRAPH_API_URL}/${options.commentId}/comments`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          message: options.text,
          access_token: pageAccessToken,
        }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return {
          success: false,
          error: formatGraphError(error, `Facebook API error: ${response.status}`).message,
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
        const error = await response.json().catch(() => ({}));
        return {
          success: false,
          error: formatGraphError(error, `Facebook API error: ${response.status}`).message,
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

  async reactToPost(
    accessToken: string,
    options: ReactToPostOptions,
  ): Promise<EngagementResult> {
    if (options.kind !== "like") {
      return {
        success: false,
        error: "Facebook Page post reactions via Graph API are limited to likes on this connector",
      };
    }

    try {
      const pageAccessToken = await this.resolvePageAccessToken(accessToken);
      const response = await fetch(`${GRAPH_API_URL}/${options.platformPostId}/likes`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ access_token: pageAccessToken }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return {
          success: false,
          error: formatGraphError(error, `Facebook API error: ${response.status}`).message,
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

  async unreactToPost(
    accessToken: string,
    options: UnreactToPostOptions,
  ): Promise<EngagementResult> {
    try {
      const pageAccessToken = await this.resolvePageAccessToken(accessToken);
      const response = await fetch(
        `${GRAPH_API_URL}/${options.platformPostId}/likes?access_token=${pageAccessToken}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return {
          success: false,
          error: formatGraphError(error, `Facebook API error: ${response.status}`).message,
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

  async reactToComment(
    accessToken: string,
    options: ReactToCommentOptions,
  ): Promise<EngagementResult> {
    if (options.kind !== "like") {
      return {
        success: false,
        error: "Facebook comment reactions via Graph API are limited to likes on this connector",
      };
    }

    try {
      const pageAccessToken = await this.resolvePageAccessToken(accessToken);
      const response = await fetch(`${GRAPH_API_URL}/${options.commentId}/likes`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ access_token: pageAccessToken }),
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return {
          success: false,
          error: formatGraphError(error, `Facebook API error: ${response.status}`).message,
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

  async unreactToComment(
    accessToken: string,
    options: UnreactToCommentOptions,
  ): Promise<EngagementResult> {
    try {
      const pageAccessToken = await this.resolvePageAccessToken(accessToken);
      const response = await fetch(
        `${GRAPH_API_URL}/${options.commentId}/likes?access_token=${pageAccessToken}`,
        { method: "DELETE" },
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        return {
          success: false,
          error: formatGraphError(error, `Facebook API error: ${response.status}`).message,
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

/**
 * A Page can be published to only with a Page token and, when Meta reports
 * tasks, the CREATE_CONTENT task (MANAGE implies it). A Page the person only
 * moderates or analyses would connect and then fail every post.
 */
function publishablePage(page: ManagedPage): boolean {
  if (!page.access_token) return false;
  if (!Array.isArray(page.tasks)) return true;
  return page.tasks.includes("CREATE_CONTENT") || page.tasks.includes("MANAGE");
}

export const facebookAdapter = new FacebookAdapter();

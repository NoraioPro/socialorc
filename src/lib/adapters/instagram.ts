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
import { formatGraphError, type AdapterErrorCode } from "./errors";
import { inFlightKey, inFlightMediaStore } from "./in-flight-media";
import {
  validateInstagramCredentials,
  type CredentialValidationResult,
} from "./credentials";

const IG_PAGE_FIELDS =
  "id,name,access_token,instagram_business_account{id,username,name,profile_picture_url}";

/** `GET /{container}?fields=status_code` values (content-publishing guide). */
type ContainerStatus = "FINISHED" | "IN_PROGRESS" | "ERROR" | "EXPIRED" | "PUBLISHED";

type Failure = { success: false; error: string; code?: AdapterErrorCode; rawResponse?: unknown };

export class InstagramAdapter extends BasePlatformAdapter {
  platform = Platform.INSTAGRAM;

  /**
   * How long one publish attempt may wait for a container to reach FINISHED.
   *
   * The publish routes run under `maxDuration = 60` and the worker stops
   * claiming new jobs 15s before that, so the last job of a run has ~15s left.
   * Waiting longer risks the function being killed mid-publish, which is the
   * one state the worker cannot reason about. Past this budget the attempt
   * reports MEDIA_PROCESSING (retryable) and the next run resumes polling the
   * same container — Meta recommends polling about once a minute for up to five
   * minutes, which the cron cadence (every 5 min, 3 attempts) covers.
   */
  pollBudgetMs = 10_000;
  pollIntervalMs = 2_000;
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

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
      client_id: metaAppId(),
      redirect_uri: this.getRedirectUri(),
      state,
      scope:
        "instagram_basic,instagram_content_publish,instagram_manage_comments,pages_read_engagement,pages_show_list",
      response_type: "code",
    });

    return `${FACEBOOK_AUTH_URL}?${params.toString()}`;
  }

  /** Returns the long-lived USER token; the callback turns it into a Page credential. */
  async exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
    return exchangeCodeForLongLivedUserToken(code, this.getRedirectUri());
  }

  async refreshAccessToken(): Promise<OAuthTokens> {
    return metaTokensDoNotRefresh("Instagram");
  }

  /** Instagram professional accounts linked to a Page this grant manages. */
  async listConnectTargets(userToken: string): Promise<ConnectTarget[]> {
    const pages = await fetchManagedPages(userToken, IG_PAGE_FIELDS);
    const seen = new Set<string>();
    const targets: ConnectTarget[] = [];
    for (const page of pages) {
      const ig = page.instagram_business_account;
      if (!ig?.id || !page.access_token || seen.has(ig.id)) continue;
      seen.add(ig.id);
      targets.push({
        id: ig.id,
        name: ig.name || ig.username || ig.id,
        username: ig.username,
        pictureUrl: ig.profile_picture_url,
        detail: `Linked to the Facebook Page "${page.name}"`,
      });
    }
    return targets;
  }

  /**
   * Store the linked Page's token (no expiry — see meta-credential.ts) with the
   * Instagram account id. The content-publishing guide lists the Facebook Page
   * access token as the token for the Facebook Login flavour of this API.
   */
  async connectTarget(
    userToken: string,
    igUserId: string,
  ): Promise<{ tokens: OAuthTokens; info: AccountInfo }> {
    const pages = await fetchManagedPages(userToken, IG_PAGE_FIELDS);
    const page = pages.find(
      (p): p is ManagedPage & { access_token: string } =>
        p.instagram_business_account?.id === igUserId && Boolean(p.access_token),
    );
    if (!page) {
      throw new AdapterError(
        "That Instagram account is not linked to a Facebook Page this login manages.",
        "IG_ACCOUNT_NOT_MANAGED",
      );
    }
    const ig = page.instagram_business_account!;
    return {
      tokens: {
        accessToken: encodeMetaPageCredential({ token: page.access_token, pageId: page.id, igUserId }),
        refreshToken: null,
        expiresAt: null,
        tokenType: "page",
      },
      info: {
        platformUserId: igUserId,
        platformUsername: ig.username,
        displayName: ig.name || ig.username,
        profileImageUrl: ig.profile_picture_url,
        metadata: {
          accountType: "instagram_business",
          pageId: page.id,
          externalParentId: page.id,
        },
      },
    };
  }

  async getAccountInfo(accessToken: string): Promise<AccountInfo> {
    const credential = parseMetaCredential(accessToken);
    if (credential.kind === "page" && credential.igUserId) {
      const igInfoResponse = await fetch(
        `${GRAPH_API_URL}/${credential.igUserId}?` +
          new URLSearchParams({
            fields: "id,username,name,profile_picture_url",
            access_token: credential.token,
          }),
      );
      const igInfo = await igInfoResponse.json().catch(() => ({}));
      if (!igInfoResponse.ok) {
        const formatted = formatGraphError(igInfo, "Failed to get Instagram account info");
        throw new AdapterError(formatted.message, "IG_INFO_FAILED", igInfoResponse.status, igInfo);
      }
      return {
        platformUserId: credential.igUserId,
        platformUsername: igInfo.username,
        displayName: igInfo.name || igInfo.username,
        profileImageUrl: igInfo.profile_picture_url,
        metadata: { accountType: "instagram_business", pageId: credential.pageId, externalParentId: credential.pageId },
      };
    }

    // Legacy row (bare long-lived user token): first Page, as before.
    const userToken = credential.token;
    const pages = await fetchManagedPages(userToken, "id,name,access_token");

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
        facebookPages: pages.map((p) => ({ id: p.id, name: p.name })),
      },
    };
  }

  /** The Instagram account to act as and the Page token to act with. */
  private async resolveAccount(accessToken: string): Promise<{ igUserId: string; pageToken: string }> {
    const credential = parseMetaCredential(accessToken);
    if (credential.kind === "page" && credential.igUserId) {
      return { igUserId: credential.igUserId, pageToken: credential.token };
    }
    const info = await this.getAccountInfo(credential.token);
    const pageToken = (info.metadata as Record<string, unknown>)?.pageAccessToken as string;
    if (!pageToken) {
      throw new AdapterError("Page access token not found", "PAGE_TOKEN_MISSING");
    }
    return { igUserId: info.platformUserId, pageToken };
  }

  /**
   * Publish = create a container, wait until Meta has fetched and processed
   * the media (`status_code` FINISHED), then `media_publish` it.
   *
   * Single image, single video (published as a Reel — the only video type the
   * feed API publishes now), or a carousel of 2–10 images.
   */
  async createPost(accessToken: string, options: PostOptions): Promise<PostResult> {
    const invalidContent = this.validatePostContent(options);
    if (invalidContent) {
      return { success: false, error: invalidContent.message, code: invalidContent.code };
    }

    const media = this.mediaDescriptors(options);
    const kinds = media.map((m) => this.classifyMedia(m));
    if (media.length > 1 && kinds.includes("video")) {
      return {
        success: false,
        error:
          "Instagram carousels with video are not supported by this connector yet (Reels cannot be carousel items). Publish the video on its own. Nothing was published.",
        code: "UNSUPPORTED_MEDIA",
      };
    }

    try {
      const { igUserId, pageToken } = await this.resolveAccount(accessToken);

      const key = options.idempotencyKey
        ? inFlightKey(Platform.INSTAGRAM, "container", options.idempotencyKey)
        : null;
      const store = key ? await inFlightMediaStore() : null;

      // Resume a container an earlier attempt created, so a slow video keeps
      // its place in Meta's processing queue instead of being uploaded again.
      let containerId = key && store ? await store.get(key) : null;
      let status: ContainerStatus | Failure | null = null;

      if (containerId) {
        status = await this.waitForContainer(containerId, pageToken);
        // An expired or failed leftover is discarded and the post starts over.
        if (status === "EXPIRED" || status === "ERROR") {
          await store?.done(key!, {});
          containerId = null;
          status = null;
        }
      }

      if (!containerId) {
        const created = await this.createContainer(igUserId, pageToken, options.text, media, kinds);
        if (!created.success) return created;
        containerId = created.id;
        if (key && store && options.idempotencyKey) {
          await store.put(key, containerId, { postId: options.idempotencyKey, platform: Platform.INSTAGRAM });
        }
        status = await this.waitForContainer(containerId, pageToken);
      }

      if (typeof status === "object" && status !== null) return status;

      switch (status) {
        case "FINISHED":
          break;
        case "IN_PROGRESS":
          return {
            success: false,
            error: `Instagram is still processing the media (container ${containerId}); nothing was published yet. It will be re-checked on the next run.`,
            code: "MEDIA_PROCESSING",
          };
        case "PUBLISHED":
          // Only possible when a previous attempt published and then failed to
          // record it. Publishing again would duplicate the post.
          await store?.done(key!, {});
          return {
            success: false,
            error:
              "Instagram reports this post's media was already published by an earlier attempt that could not record it. Check the account before retrying; nothing new was published.",
            code: "CONTENT_INVALID",
          };
        default:
          await store?.done(key!, {});
          return {
            success: false,
            error: `Instagram could not process the media (container status ${status ?? "unknown"}). Check the file meets Instagram's format requirements. Nothing was published.`,
            code: "MEDIA_INVALID",
          };
      }

      const publishResponse = await fetch(`${GRAPH_API_URL}/${igUserId}/media_publish`, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ creation_id: containerId, access_token: pageToken }),
      });

      if (!publishResponse.ok) {
        const error = await publishResponse.json().catch(() => ({}));
        const formatted = formatGraphError(error, "Failed to publish media");
        return { success: false, error: formatted.message, code: formatted.code, rawResponse: error };
      }

      const publishData = await publishResponse.json();
      const mediaId = publishData.id;

      // Instagram answers 200 with an empty body when it accepted nothing.
      // Success is only real once it returns the published media id.
      if (!mediaId) {
        return {
          success: false,
          error: "Instagram returned no media id, so the post was not confirmed.",
          rawResponse: publishData,
        };
      }

      await store?.done(key!, { publishedId: mediaId }).catch(() => undefined);

      return {
        success: true,
        platformPostId: mediaId,
        platformPostUrl: await this.permalink(mediaId, pageToken),
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

  private async postContainer(
    igUserId: string,
    params: Record<string, string>,
  ): Promise<{ success: true; id: string } | Failure> {
    const response = await fetch(`${GRAPH_API_URL}/${igUserId}/media`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(params),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok || !body.id) {
      const formatted = formatGraphError(body, "Failed to create media container");
      return { success: false, error: formatted.message, code: formatted.code, rawResponse: body };
    }
    return { success: true, id: body.id as string };
  }

  private async createContainer(
    igUserId: string,
    pageToken: string,
    caption: string,
    media: { url: string }[],
    kinds: ("image" | "video" | "unknown")[],
  ): Promise<{ success: true; id: string } | Failure> {
    if (media.length === 1 && kinds[0] === "video") {
      return this.postContainer(igUserId, {
        media_type: "REELS",
        video_url: media[0].url,
        caption,
        share_to_feed: "true",
        access_token: pageToken,
      });
    }

    if (media.length === 1) {
      return this.postContainer(igUserId, {
        image_url: media[0].url,
        caption,
        access_token: pageToken,
      });
    }

    // Carousel: one item container per image (no caption on items), then the
    // parent. Item containers are cheap to orphan — unpublished ones expire.
    const children: string[] = [];
    for (const item of media) {
      const child = await this.postContainer(igUserId, {
        image_url: item.url,
        is_carousel_item: "true",
        access_token: pageToken,
      });
      if (!child.success) return child;
      children.push(child.id);
    }
    return this.postContainer(igUserId, {
      media_type: "CAROUSEL",
      children: children.join(","),
      caption,
      access_token: pageToken,
    });
  }

  /**
   * Poll `status_code` until it leaves IN_PROGRESS or the budget runs out.
   * Returns the last status seen, or a Failure when the status call itself
   * failed (an expired token there is the same reconnect case as anywhere).
   */
  private async waitForContainer(containerId: string, pageToken: string): Promise<ContainerStatus | Failure> {
    const startedAt = Date.now();
    let slept = 0;
    for (;;) {
      const response = await fetch(
        `${GRAPH_API_URL}/${containerId}?` +
          new URLSearchParams({ fields: "status_code,status", access_token: pageToken }),
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const formatted = formatGraphError(body, "Failed to read media container status");
        return { success: false, error: formatted.message, code: formatted.code, rawResponse: body };
      }
      const status = String(body.status_code ?? "IN_PROGRESS") as ContainerStatus;
      if (status !== "IN_PROGRESS") return status;
      // Budget = whichever is larger: wall time, or time spent waiting.
      if (Math.max(Date.now() - startedAt, slept) + this.pollIntervalMs > this.pollBudgetMs) {
        return "IN_PROGRESS";
      }
      await this.sleep(this.pollIntervalMs);
      slept += this.pollIntervalMs;
    }
  }

  /**
   * The public URL. A media id is not the shortcode in `/p/<shortcode>/`, so
   * the URL the old code built never resolved; ask for the permalink instead
   * (best effort — the post is published either way).
   */
  private async permalink(mediaId: string, pageToken: string): Promise<string | undefined> {
    try {
      const response = await fetch(
        `${GRAPH_API_URL}/${mediaId}?` + new URLSearchParams({ fields: "permalink", access_token: pageToken }),
      );
      if (!response.ok) return undefined;
      const body = await response.json();
      return typeof body.permalink === "string" ? body.permalink : undefined;
    } catch {
      return undefined;
    }
  }

  private async resolvePageAccessToken(accessToken: string): Promise<string> {
    return (await this.resolveAccount(accessToken)).pageToken;
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
        const error = await response.json().catch(() => ({}));
        return {
          success: false,
          error: formatGraphError(error, `Instagram API error: ${response.status}`).message,
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
        const error = await response.json().catch(() => ({}));
        return {
          success: false,
          error: formatGraphError(error, `Instagram API error: ${response.status}`).message,
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
        const error = await response.json().catch(() => ({}));
        return {
          success: false,
          error: formatGraphError(error, `Instagram API error: ${response.status}`).message,
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
          error: formatGraphError(error, `Instagram API error: ${response.status}`).message,
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

import { Platform } from "@prisma/client";
import { BasePlatformAdapter, AdapterError } from "./base";
import { fetchOwnMedia, MediaSourceNotAllowedError } from "@/lib/social/blob-upload";
import {
  OAuthTokens,
  AccountInfo,
  PostOptions,
  PostResult,
  PostMediaDescriptor,
  ListCommentsOptions,
  ListCommentsResult,
  WriteCommentOptions,
  ReplyToCommentOptions,
  DeleteCommentOptions,
  EngagementResult,
  SocialComment,
} from "@/types/platform";
import {
  validateTwitterCredentials,
  type CredentialValidationResult,
} from "./credentials";
import { codeChallengeFor, generateCodeVerifier } from "@/lib/social/pkce";
import { classifyAdapterError, type AdapterErrorCode } from "./errors";
import {
  inFlightFingerprint,
  inFlightKey,
  inFlightMediaStore,
  type InFlightMediaStore,
} from "./in-flight-media";

const TWITTER_AUTH_URL = "https://x.com/i/oauth2/authorize";
const TWITTER_TOKEN_URL = "https://api.x.com/2/oauth2/token";
const TWITTER_API_URL = "https://api.x.com/2";

/** X recommends chunks of at most 5 MB (server maximum 8 MB). */
const X_CHUNK_BYTES = 4 * 1024 * 1024;

type UploadFailure = { success: false; error: string; code?: AdapterErrorCode; rawResponse?: unknown };

export class TwitterAdapter extends BasePlatformAdapter {
  platform = Platform.TWITTER;

  /** Same bound and reasoning as InstagramAdapter.pollBudgetMs (60s route ceiling). */
  pollBudgetMs = 10_000;
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  /**
   * Validate Twitter/X OAuth credentials: both presence and format.
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
    return validateTwitterCredentials();
  }

  /**
   * Build the authorization request. The caller stores `verifier` with the
   * state cookie; only the challenge is exposed — same contract as TikTok.
   *
   * This replaces a flow that was broken three ways at once: the verifier was
   * generated with `Math.random()`, the challenge method was `plain` (so the
   * challenge *was* the verifier), and the verifier was appended to `state`, so
   * it travelled through the browser in the redirect URL. Anything that could
   * read that URL — history, a proxy log, a referrer header — held the secret
   * that is supposed to prove the token exchange came from the client that
   * started it, which defeats PKCE entirely.
   */
  createAuthorizationRequest(state: string): {
    url: string;
    verifier: string;
    codeChallengeMethod: "S256";
  } {
    const verifier = generateCodeVerifier();
    const codeChallengeMethod = "S256" as const;

    const params = new URLSearchParams({
      response_type: "code",
      client_id: process.env.TWITTER_CLIENT_ID || "",
      redirect_uri: this.getRedirectUri(),
      // media.write: required by the v2 media upload endpoints
      // (https://docs.x.com/x-api/media/upload-media). Accounts connected
      // before it was added must reconnect before attaching media.
      scope: "tweet.read tweet.write users.read offline.access media.write",
      state,
      code_challenge: codeChallengeFor(verifier, codeChallengeMethod),
      code_challenge_method: codeChallengeMethod,
    });

    return { url: `${TWITTER_AUTH_URL}?${params.toString()}`, verifier, codeChallengeMethod };
  }

  /**
   * Legacy contract: an authorization URL with no server-side verifier. X
   * requires PKCE, so this delegates to `createAuthorizationRequest` and
   * abandons the verifier — kept so the older
   * `/api/social/connect?platform=TWITTER` route cannot quietly ship a `plain`
   * challenge. Prefer the explicit call.
   */
  getOAuthUrl(state: string): string {
    return this.createAuthorizationRequest(state).url;
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
    const invalidContent = this.validatePostContent(options);
    if (invalidContent) {
      return { success: false, error: invalidContent.message, code: invalidContent.code };
    }

    const media = this.mediaDescriptors(options);
    const kinds = media.map((m) => this.mediaKindFor(m));
    // X: up to 4 images, or exactly one video or GIF — never mixed.
    if (media.length > 1 && kinds.some((k) => k !== "image")) {
      return {
        success: false,
        error: "X allows up to 4 images, or a single video or GIF, per post. Nothing was published.",
        code: "UNSUPPORTED_MEDIA",
      };
    }

    const key =
      options.idempotencyKey && media.length > 0
        ? inFlightKey(Platform.TWITTER, "media", options.idempotencyKey)
        : null;
    const store = key ? await inFlightMediaStore() : null;
    // What this attempt uploads; a remembered upload of other content is not resumed.
    const fingerprint = inFlightFingerprint(options.text, media.map((m) => m.url));

    try {
      const tweetBody: Record<string, unknown> = {
        text: options.text,
      };

      if (media.length > 0) {
        const uploaded = await this.uploadAll(accessToken, media, kinds, key, store, options.idempotencyKey, fingerprint);
        if (!uploaded.success) return uploaded;
        tweetBody.media = { media_ids: uploaded.mediaIds };
      }

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

      if (key && store) await store.done(key, { publishedId: data.data.id }).catch(() => undefined);

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

  /** Image, GIF (its own upload category on X) or video. */
  private mediaKindFor(descriptor: PostMediaDescriptor): "image" | "gif" | "video" {
    const mime = descriptor.mimeType ?? BasePlatformAdapter.inferMimeType(descriptor.url);
    if (mime === "image/gif") return "gif";
    return mime?.startsWith("video/") ? "video" : "image";
  }

  /**
   * Upload every attachment and return the media ids for `POST /2/tweets`.
   *
   * Images go through the one-shot `POST /2/media/upload`; video and GIF use
   * the chunked initialize → append → finalize flow and may need processing.
   * Processing is polled within `pollBudgetMs`; past that the attempt reports
   * MEDIA_PROCESSING and, when the caller passed an idempotency key, the next
   * attempt resumes the same media id instead of uploading again.
   */
  private async uploadAll(
    accessToken: string,
    media: PostMediaDescriptor[],
    kinds: ("image" | "gif" | "video")[],
    key: string | null,
    store: InFlightMediaStore | null,
    postId: string | undefined,
    fingerprint: string,
  ): Promise<{ success: true; mediaIds: string[] } | UploadFailure> {
    const asyncKind = kinds.length === 1 && kinds[0] !== "image";

    if (asyncKind && key && store) {
      const pending = await store.get(key, fingerprint);
      if (pending) {
        const state = await this.waitForProcessing(accessToken, pending);
        if (state === "succeeded") return { success: true, mediaIds: [pending] };
        if (typeof state === "object") return state;
        if (state === "in_progress") return this.stillProcessing(pending);
        // failed or gone: forget it and upload afresh below
        await store.done(key, {});
      }
    }

    const mediaIds: string[] = [];
    for (let i = 0; i < media.length; i++) {
      const bytes = await this.download(media[i]);
      if (!bytes.success) return bytes;

      if (kinds[i] === "image") {
        const uploaded = await this.uploadImage(accessToken, bytes.blob);
        if (!uploaded.success) return uploaded;
        mediaIds.push(uploaded.id);
        continue;
      }

      const uploaded = await this.uploadChunked(accessToken, bytes.blob, kinds[i] === "gif" ? "tweet_gif" : "tweet_video");
      if (!uploaded.success) return uploaded;
      if (key && store && postId) {
        await store.put(key, uploaded.id, { postId, platform: Platform.TWITTER, fingerprint });
      }
      if (uploaded.processing) {
        const state = await this.waitForProcessing(accessToken, uploaded.id);
        if (typeof state === "object") return state;
        if (state === "in_progress") return this.stillProcessing(uploaded.id);
        if (state !== "succeeded") {
          if (key && store) await store.done(key, {});
          return {
            success: false,
            error: "X could not process the uploaded media. Check the file meets X's format limits. Nothing was published.",
            code: "MEDIA_INVALID",
          };
        }
      }
      mediaIds.push(uploaded.id);
    }
    return { success: true, mediaIds };
  }

  private stillProcessing(mediaId: string): UploadFailure {
    return {
      success: false,
      error: `X is still processing the media (${mediaId}); nothing was published yet. It will be re-checked on the next run.`,
      code: "MEDIA_PROCESSING",
    };
  }

  private async download(descriptor: PostMediaDescriptor): Promise<{ success: true; blob: Blob } | UploadFailure> {
    let response: Response;
    try {
      response = await fetchOwnMedia(descriptor.url);
    } catch (error) {
      if (error instanceof MediaSourceNotAllowedError) {
        return { success: false, error: error.message, code: "MEDIA_INVALID" };
      }
      throw error;
    }
    if (!response.ok) {
      return {
        success: false,
        error: `Could not read the attached media (${response.status}). Nothing was published.`,
        code: "MEDIA_INVALID",
      };
    }
    const type =
      descriptor.mimeType ??
      BasePlatformAdapter.inferMimeType(descriptor.url) ??
      response.headers.get("content-type") ??
      "application/octet-stream";
    return { success: true, blob: new Blob([await response.arrayBuffer()], { type }) };
  }

  private async mediaFailure(response: Response, what: string): Promise<UploadFailure> {
    const body = await response.json().catch(() => ({}));
    const detail = body?.detail || body?.title || body?.errors?.[0]?.message || `HTTP ${response.status}`;
    return {
      success: false,
      error: `X media ${what} failed: ${detail}`,
      code: classifyAdapterError({ status: response.status, message: detail }),
      rawResponse: body,
    };
  }

  private async uploadImage(accessToken: string, blob: Blob): Promise<{ success: true; id: string } | UploadFailure> {
    const form = new FormData();
    form.append("media", blob);
    form.append("media_category", "tweet_image");
    const response = await fetch(`${TWITTER_API_URL}/media/upload`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
      body: form,
    });
    if (!response.ok) return this.mediaFailure(response, "upload");
    const body = await response.json();
    const id = body?.data?.id;
    if (!id) return { success: false, error: "X returned no media id for the upload.", rawResponse: body };
    return { success: true, id: String(id) };
  }

  private async uploadChunked(
    accessToken: string,
    blob: Blob,
    category: "tweet_video" | "tweet_gif",
  ): Promise<{ success: true; id: string; processing: boolean } | UploadFailure> {
    const auth = { Authorization: `Bearer ${accessToken}` };

    const init = await fetch(`${TWITTER_API_URL}/media/upload/initialize`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/json" },
      body: JSON.stringify({ media_type: blob.type, total_bytes: blob.size, media_category: category }),
    });
    if (!init.ok) return this.mediaFailure(init, "initialize");
    const initBody = await init.json();
    const id = initBody?.data?.id ? String(initBody.data.id) : null;
    if (!id) return { success: false, error: "X returned no media id for the upload.", rawResponse: initBody };

    for (let offset = 0, segment = 0; offset < blob.size; offset += X_CHUNK_BYTES, segment++) {
      const form = new FormData();
      form.append("segment_index", String(segment));
      form.append("media", blob.slice(offset, offset + X_CHUNK_BYTES));
      const append = await fetch(`${TWITTER_API_URL}/media/upload/${id}/append`, {
        method: "POST",
        headers: auth,
        body: form,
      });
      if (!append.ok) return this.mediaFailure(append, "append");
    }

    const finalize = await fetch(`${TWITTER_API_URL}/media/upload/${id}/finalize`, {
      method: "POST",
      headers: auth,
    });
    if (!finalize.ok) return this.mediaFailure(finalize, "finalize");
    const finalBody = await finalize.json().catch(() => ({}));
    const state = finalBody?.data?.processing_info?.state as string | undefined;
    return { success: true, id, processing: Boolean(state && state !== "succeeded") };
  }

  /** Poll `GET /2/media/upload?command=STATUS` within the budget. */
  private async waitForProcessing(
    accessToken: string,
    mediaId: string,
  ): Promise<"succeeded" | "failed" | "in_progress" | UploadFailure> {
    const startedAt = Date.now();
    let slept = 0;
    for (;;) {
      const response = await fetch(
        `${TWITTER_API_URL}/media/upload?` + new URLSearchParams({ command: "STATUS", media_id: mediaId }),
        { headers: { Authorization: `Bearer ${accessToken}` } },
      );
      // Unknown or expired upload session: treat as failed so it is re-uploaded.
      if (response.status === 404) return "failed";
      if (!response.ok) return this.mediaFailure(response, "status");
      const body = await response.json();
      const info = body?.data?.processing_info as { state?: string; check_after_secs?: number } | undefined;
      const state = info?.state ?? "succeeded";
      if (state === "succeeded" || state === "failed") return state;
      const waitMs = Math.max(1, info?.check_after_secs ?? 1) * 1000;
      // Budget = whichever is larger: wall time, or time spent waiting.
      if (Math.max(Date.now() - startedAt, slept) + waitMs > this.pollBudgetMs) return "in_progress";
      await this.sleep(waitMs);
      slept += waitMs;
    }
  }

  async listComments(
    accessToken: string,
    options: ListCommentsOptions,
  ): Promise<ListCommentsResult> {
    try {
      const limit = Math.min(options.limit ?? 25, 100);
      const params = new URLSearchParams({
        query: `conversation_id:${options.platformPostId} -is:retweet`,
        max_results: String(limit),
        "tweet.fields": "author_id,created_at,conversation_id,in_reply_to_user_id",
        expansions: "author_id",
        "user.fields": "username,name,profile_image_url",
      });
      if (options.cursor) {
        params.set("next_token", options.cursor);
      }

      const response = await fetch(`${TWITTER_API_URL}/tweets/search/recent?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
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
      const users = new Map<string, Record<string, unknown>>();
      for (const user of data.includes?.users ?? []) {
        users.set(user.id as string, user);
      }

      const items: SocialComment[] = (data.data ?? [])
        .filter((tweet: { id: string }) => tweet.id !== options.platformPostId)
        .map((tweet: Record<string, unknown>) => {
          const author = users.get(tweet.author_id as string);
          return {
            id: tweet.id as string,
            platform: this.platform,
            platformPostId: options.platformPostId,
            authorId: (tweet.author_id as string) ?? "unknown",
            authorName: (author?.name as string) ?? (author?.username as string) ?? "unknown",
            authorAvatarUrl: author?.profile_image_url as string | undefined,
            text: (tweet.text as string) ?? "",
            createdAt: new Date((tweet.created_at as string) ?? Date.now()),
            permalink: `https://x.com/i/status/${tweet.id as string}`,
            canReply: true,
            canReact: false,
            canDelete: true,
            raw: tweet,
          };
        });

      return {
        success: true,
        items,
        nextCursor: data.meta?.next_token ?? null,
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
    return this.replyToComment(accessToken, {
      commentId: options.platformPostId,
      text: options.text,
      platformPostId: options.platformPostId,
    });
  }

  async replyToComment(
    accessToken: string,
    options: ReplyToCommentOptions,
  ): Promise<EngagementResult> {
    try {
      const response = await fetch(`${TWITTER_API_URL}/tweets`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          text: options.text,
          reply: { in_reply_to_tweet_id: options.commentId },
        }),
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
      return { success: true, commentId: data.data.id, rawResponse: data };
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
      const response = await fetch(`${TWITTER_API_URL}/tweets/${options.commentId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${accessToken}` },
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
      return { success: data.data?.deleted === true, rawResponse: data };
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

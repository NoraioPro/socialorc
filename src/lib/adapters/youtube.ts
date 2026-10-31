import { Platform } from "@prisma/client";
import { BasePlatformAdapter, AdapterError } from "./base";
import { fetchOwnMedia } from "@/lib/social/blob-upload";
import { postRevocation } from "./revoke";
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
  EngagementResult,
  SocialComment,
} from "@/types/platform";
import {
  validateYouTubeCredentials,
  type CredentialValidationResult,
} from "./credentials";
import { platformEnv } from "@/lib/platform-env";

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_REVOKE_URL = "https://oauth2.googleapis.com/revoke";
const YOUTUBE_API_URL = "https://www.googleapis.com/youtube/v3";
// Uploading bytes (as opposed to reading/writing metadata) goes through a
// separate host path. Posting the resumable-init request to YOUTUBE_API_URL
// instead of this one is exactly what produces Google's generic 400
// "Request contains an invalid argument." with no field named.
const YOUTUBE_UPLOAD_API_URL = "https://www.googleapis.com/upload/youtube/v3";

/** 8 MiB: a multiple of the 256 KiB the resumable protocol requires per chunk. */
export const YOUTUBE_UPLOAD_CHUNK_BYTES = 32 * 256 * 1024;

/**
 * Re-slice a byte stream into fixed-size chunks (the last may be shorter),
 * holding at most one chunk at a time.
 */
export async function* readInChunks(
  body: ReadableStream<Uint8Array>,
  size: number,
): AsyncGenerator<Uint8Array<ArrayBuffer>> {
  const reader = body.getReader();
  let buffer = new Uint8Array(size);
  let filled = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      let offset = 0;
      while (offset < value.byteLength) {
        const take = Math.min(size - filled, value.byteLength - offset);
        buffer.set(value.subarray(offset, offset + take), filled);
        filled += take;
        offset += take;
        if (filled === size) {
          yield buffer;
          buffer = new Uint8Array(size);
          filled = 0;
        }
      }
    }
    if (filled > 0) yield buffer.subarray(0, filled);
  } finally {
    reader.releaseLock();
  }
}

/** `Range: bytes=0-524287` -> 524287; no header (nothing persisted) -> -1. */
function lastPersistedByte(range: string | null): number {
  const match = range ? /bytes=\d+-(\d+)/.exec(range) : null;
  return match ? Number(match[1]) : -1;
}

export class YouTubeAdapter extends BasePlatformAdapter {
  platform = Platform.YOUTUBE;

  /** Resumable chunk size; must be a multiple of 256 KiB. Overridable for tests. */
  uploadChunkBytes = YOUTUBE_UPLOAD_CHUNK_BYTES;

  /**
   * Validate YouTube/Google OAuth credentials: both presence and format.
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
    return validateYouTubeCredentials();
  }

  getOAuthUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: platformEnv("YOUTUBE_CLIENT_ID") || "",
      redirect_uri: this.getRedirectUri(),
      response_type: "code",
      scope:
        "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.force-ssl",
      access_type: "offline",
      prompt: "consent",
      state,
    });

    return `${GOOGLE_AUTH_URL}?${params.toString()}`;
  }

  async exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: platformEnv("YOUTUBE_CLIENT_ID") || "",
        client_secret: platformEnv("YOUTUBE_CLIENT_SECRET") || "",
        code,
        grant_type: "authorization_code",
        redirect_uri: this.getRedirectUri(),
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

  /**
   * Revoke the user's grant at Google (documented: POST /revoke with `token`;
   * revoking an access token also revokes its refresh token). If the access
   * token is already expired Google rejects it, so the refresh token is tried
   * next. Success means one of them was accepted.
   */
  async revokeAccess(accessToken: string, refreshToken?: string | null): Promise<void> {
    let lastError: unknown = new Error("No token to revoke.");
    for (const token of [accessToken, refreshToken].filter((t): t is string => Boolean(t))) {
      try {
        await postRevocation({ url: GOOGLE_REVOKE_URL, token });
        return;
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    const response = await fetch(GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: platformEnv("YOUTUBE_CLIENT_ID") || "",
        client_secret: platformEnv("YOUTUBE_CLIENT_SECRET") || "",
        grant_type: "refresh_token",
        refresh_token: refreshToken,
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
      refreshToken: refreshToken,
      expiresAt: data.expires_in
        ? new Date(Date.now() + data.expires_in * 1000)
        : null,
      tokenType: data.token_type,
      scope: data.scope,
    };
  }

  async getAccountInfo(accessToken: string): Promise<AccountInfo> {
    const response = await fetch(
      `${YOUTUBE_API_URL}/channels?part=snippet,contentDetails&mine=true`,
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      }
    );

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
    const channel = data.items?.[0];

    if (!channel) {
      throw new AdapterError(
        "No YouTube channel found for this account",
        "NO_CHANNEL_FOUND"
      );
    }

    return {
      platformUserId: channel.id,
      platformUsername: channel.snippet?.customUrl,
      displayName: channel.snippet?.title,
      profileImageUrl: channel.snippet?.thumbnails?.default?.url,
      metadata: {
        uploadsPlaylistId: channel.contentDetails?.relatedPlaylists?.uploads,
        channelDescription: channel.snippet?.description,
      },
    };
  }

  async createPost(accessToken: string, options: PostOptions): Promise<PostResult> {
    if (!options.mediaUrls || options.mediaUrls.length === 0) {
      return {
        success: false,
        error: "YouTube requires a video file for posting. Text-only posts are not supported.",
      };
    }

    const invalidContent = this.validatePostContent(options);
    if (invalidContent) {
      return { success: false, error: invalidContent.message, code: invalidContent.code };
    }

    try {
      const videoMetadata = {
        snippet: {
          title: (options.additionalOptions?.title as string) || options.text.slice(0, 100),
          description: options.text,
          tags: (options.additionalOptions?.tags as string[]) || [],
          categoryId: (options.additionalOptions?.categoryId as string) || "22",
        },
        status: {
          privacyStatus: options.visibility === "private" ? "private" : "public",
          selfDeclaredMadeForKids: false,
        },
      };

      if (options.scheduledTime) {
        videoMetadata.status.privacyStatus = "private";
        (videoMetadata.status as Record<string, unknown>).publishAt = options.scheduledTime.toISOString();
      }

      const sourceUrl = options.mediaUrls[0];
      const descriptor = this.mediaDescriptors(options)[0];
      const uploadMimeType =
        descriptor?.mimeType ??
        BasePlatformAdapter.inferMimeType(sourceUrl) ??
        "video/*";

      // Open the source as a stream first: its length goes into the session
      // request, and its bytes are forwarded chunk by chunk below. Nothing here
      // holds more than one chunk in memory — buffering the whole file is what
      // made a large video run the function out of memory.
      const source = await fetchOwnMedia(sourceUrl);
      if (!source.ok || !source.body) {
        return {
          success: false,
          error: `Could not read the video to upload (HTTP ${source.status} from the media URL).`,
        };
      }
      const servedLength = Number(source.headers.get("content-length"));
      const totalBytes =
        Number.isFinite(servedLength) && servedLength > 0 ? servedLength : descriptor?.sizeBytes ?? 0;
      if (!totalBytes) {
        await source.body.cancel().catch(() => undefined);
        return {
          success: false,
          error:
            "The video's size is unknown (no Content-Length from the media host), and YouTube's resumable upload needs it up front.",
        };
      }

      const initResponse = await fetch(
        `${YOUTUBE_UPLOAD_API_URL}/videos?uploadType=resumable&part=snippet,status`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json; charset=UTF-8",
            "X-Upload-Content-Type": uploadMimeType,
            "X-Upload-Content-Length": String(totalBytes),
          },
          body: JSON.stringify(videoMetadata),
        }
      );

      if (!initResponse.ok) {
        await source.body.cancel().catch(() => undefined);
        const error = await initResponse.json().catch(() => ({}));
        return {
          success: false,
          error: error.error?.message || `YouTube API error: ${initResponse.status}`,
          rawResponse: error,
        };
      }

      const uploadUrl = initResponse.headers.get("Location");

      if (!uploadUrl) {
        await source.body.cancel().catch(() => undefined);
        return {
          success: false,
          error: "Failed to get upload URL from YouTube",
        };
      }

      // The resumable session is only a slot. YouTube stores nothing until the
      // bytes are actually sent to uploadUrl, so returning success before the
      // final chunk is answered would claim a publish that never happened.
      const upload = await this.streamResumableUpload({
        accessToken,
        uploadUrl,
        body: source.body,
        totalBytes,
        mimeType: uploadMimeType,
      });
      if (!upload.ok) {
        return { success: false, error: upload.error, rawResponse: upload.detail };
      }

      const uploaded = upload.resource as { id?: string } | null;

      // Only a video id proves YouTube accepted and stored the upload.
      if (!uploaded?.id) {
        return {
          success: false,
          error:
            "YouTube did not return a video id; refusing to report a publish that was not confirmed.",
        };
      }

      return {
        success: true,
        platformPostId: uploaded.id,
        platformPostUrl: `https://www.youtube.com/watch?v=${uploaded.id}`,
        rawResponse: {
          id: uploaded.id,
          mimeType: uploadMimeType,
          bytes: totalBytes,
          chunks: upload.chunks,
          metadata: videoMetadata,
        },
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

  /**
   * Send the video to a resumable session in chunks, straight from the source
   * stream (https://developers.google.com/youtube/v3/guides/using_resumable_upload_protocol).
   *
   * Every chunk but the last is a multiple of 256 KiB, as the protocol requires.
   * A non-final chunk is answered 308 with a `Range` of what YouTube actually
   * persisted; if that is short of the chunk, the remainder is re-sent from the
   * chunk still in memory (overlapping or skipping bytes would make YouTube
   * discard the upload). The final chunk is answered 200/201 with the video.
   */
  private async streamResumableUpload(input: {
    accessToken: string;
    uploadUrl: string;
    body: ReadableStream<Uint8Array>;
    totalBytes: number;
    mimeType: string;
  }): Promise<
    | { ok: true; resource: unknown; chunks: number }
    | { ok: false; error: string; detail?: unknown }
  > {
    const { accessToken, uploadUrl, totalBytes, mimeType } = input;
    let next = 0; // first byte YouTube does not have yet
    let chunks = 0;

    const put = (bytes: Uint8Array<ArrayBuffer>, first: number) =>
      fetch(uploadUrl, {
        method: "PUT",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": mimeType,
          "Content-Range": `bytes ${first}-${first + bytes.byteLength - 1}/${totalBytes}`,
        },
        body: bytes,
      });

    for await (const chunk of readInChunks(input.body, this.uploadChunkBytes)) {
      const chunkStart = next;
      const chunkEnd = chunkStart + chunk.byteLength; // exclusive
      if (chunkEnd > totalBytes) {
        return {
          ok: false,
          error: `The media host sent more bytes than it declared (${totalBytes}); upload abandoned.`,
        };
      }
      chunks += 1;

      for (let tries = 0; next < chunkEnd; tries += 1) {
        if (tries >= 3) {
          return { ok: false, error: "YouTube kept refusing to persist an upload chunk; upload abandoned." };
        }
        const response = await put(chunk.subarray(next - chunkStart), next);

        if (response.status === 308) {
          const persisted = lastPersistedByte(response.headers.get("range"));
          // Never move backwards past what this chunk started at: the bytes
          // before it are no longer in memory.
          next = Math.max(chunkStart, persisted + 1);
          continue;
        }

        if (response.ok) {
          if (chunkEnd !== totalBytes) {
            return {
              ok: false,
              error: "YouTube finished the upload before all bytes were sent.",
            };
          }
          const resource = await response.json().catch(() => null);
          return { ok: true, resource, chunks };
        }

        const detail = await response.text().catch(() => "");
        return {
          ok: false,
          error: `YouTube rejected the video upload (HTTP ${response.status}). ${detail}`
            .trim()
            .slice(0, 400),
          detail: detail || undefined,
        };
      }
    }

    return {
      ok: false,
      error: `The media host sent ${next} of the ${totalBytes} bytes it declared; upload abandoned.`,
    };
  }

  async listComments(
    accessToken: string,
    options: ListCommentsOptions,
  ): Promise<ListCommentsResult> {
    try {
      const limit = Math.min(options.limit ?? 20, 100);
      const params = new URLSearchParams({
        part: "snippet,replies",
        videoId: options.platformPostId,
        maxResults: String(limit),
        textFormat: "plainText",
      });
      if (options.cursor) {
        params.set("pageToken", options.cursor);
      }

      const response = await fetch(`${YOUTUBE_API_URL}/commentThreads?${params.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          error: error.error?.message || `YouTube API error: ${response.status}`,
          rawResponse: error,
        };
      }

      const data = await response.json();
      const items: SocialComment[] = (data.items ?? []).map((thread: Record<string, unknown>) => {
        const top = (thread.snippet as Record<string, unknown>).topLevelComment as Record<
          string,
          unknown
        >;
        const snippet = top.snippet as Record<string, unknown>;
        return {
          id: top.id as string,
          platform: this.platform,
          platformPostId: options.platformPostId,
          authorId: (snippet.authorChannelId as { value?: string })?.value ?? "unknown",
          authorName: (snippet.authorDisplayName as string) ?? "unknown",
          text: (snippet.textDisplay as string) ?? "",
          createdAt: new Date((snippet.publishedAt as string) ?? Date.now()),
          likeCount: snippet.likeCount as number | undefined,
          replyCount: (thread.snippet as Record<string, unknown>).totalReplyCount as number | undefined,
          canReply: true,
          canReact: false,
          canDelete: true,
          raw: thread,
        };
      });

      return {
        success: true,
        items,
        nextCursor: data.nextPageToken ?? null,
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
      const accountInfo = await this.getAccountInfo(accessToken);
      const body = {
        snippet: {
          channelId: accountInfo.platformUserId,
          videoId: options.platformPostId,
          topLevelComment: {
            snippet: {
              textOriginal: options.text,
            },
          },
        },
      };

      const response = await fetch(`${YOUTUBE_API_URL}/commentThreads?part=snippet`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          error: error.error?.message || `YouTube API error: ${response.status}`,
          rawResponse: error,
        };
      }

      const data = await response.json();
      const commentId = data.snippet?.topLevelComment?.id as string | undefined;
      return { success: true, commentId, rawResponse: data };
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
      const body = {
        snippet: {
          parentId: options.commentId,
          textOriginal: options.text,
        },
      };

      const response = await fetch(`${YOUTUBE_API_URL}/comments?part=snippet`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const error = await response.json();
        return {
          success: false,
          error: error.error?.message || `YouTube API error: ${response.status}`,
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
      const response = await fetch(
        `${YOUTUBE_API_URL}/comments?id=${encodeURIComponent(options.commentId)}`,
        {
          method: "DELETE",
          headers: { Authorization: `Bearer ${accessToken}` },
        },
      );

      if (!response.ok) {
        const error = await response.text();
        return {
          success: false,
          error: error || `YouTube API error: ${response.status}`,
          rawResponse: error,
        };
      }

      return { success: true };
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
    if (options.kind !== "like" && options.kind !== "dislike") {
      return {
        success: false,
        error: "YouTube videos.rate only supports like and dislike ratings",
      };
    }

    try {
      const params = new URLSearchParams({
        id: options.platformPostId,
        rating: options.kind,
      });
      const response = await fetch(`${YOUTUBE_API_URL}/videos/rate?${params.toString()}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const error = await response.text();
        return {
          success: false,
          error: error || `YouTube API error: ${response.status}`,
          rawResponse: error,
        };
      }

      return { success: true };
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
      const params = new URLSearchParams({
        id: options.platformPostId,
        rating: "none",
      });
      const response = await fetch(`${YOUTUBE_API_URL}/videos/rate?${params.toString()}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const error = await response.text();
        return {
          success: false,
          error: error || `YouTube API error: ${response.status}`,
          rawResponse: error,
        };
      }

      return { success: true };
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

export const youtubeAdapter = new YouTubeAdapter();

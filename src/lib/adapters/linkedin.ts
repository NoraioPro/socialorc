import { Platform } from "@prisma/client";
import { BasePlatformAdapter, AdapterError } from "./base";
import { fetchOwnMedia } from "@/lib/social/blob-upload";
import { OAuthTokens, AccountInfo, PostOptions, PostResult } from "@/types/platform";
import {
  validateLinkedInCredentials,
  type CredentialValidationResult,
} from "./credentials";

const LINKEDIN_AUTH_URL = "https://www.linkedin.com/oauth/v2/authorization";
const LINKEDIN_TOKEN_URL = "https://www.linkedin.com/oauth/v2/accessToken";
const LINKEDIN_API_URL = "https://api.linkedin.com";
const LINKEDIN_VERSION = "202608";

/**
 * Videos API limits for feed video
 * (https://learn.microsoft.com/linkedin/marketing/community-management/shares/videos-api):
 * MP4, 75 KB to 500 MB, 3 s to 30 min.
 */
export const LINKEDIN_VIDEO_MIN_BYTES = 75 * 1024;
export const LINKEDIN_VIDEO_MAX_BYTES = 500 * 1024 * 1024;

/** After finalizeUpload, how long to wait for LinkedIn to leave WAITING_UPLOAD. */
const VIDEO_READY_BUDGET_MS = 15_000;
const VIDEO_READY_INTERVAL_MS = 2_000;

/**
 * Pull exact byte ranges off a stream, holding only the range being read.
 * LinkedIn's upload instructions dictate the part sizes (4 MiB each, last one
 * shorter), so the reader serves whatever length the next part needs.
 */
export function byteRangeReader(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  let carry: Uint8Array = new Uint8Array(0);
  let done = false;

  return {
    /** Up to `length` bytes; fewer only when the stream has ended. */
    async read(length: number): Promise<Uint8Array<ArrayBuffer>> {
      const out = new Uint8Array(length);
      let filled = 0;
      while (filled < length) {
        if (carry.byteLength === 0) {
          if (done) break;
          const next = await reader.read();
          if (next.done) {
            done = true;
            break;
          }
          carry = next.value;
          continue;
        }
        const take = Math.min(length - filled, carry.byteLength);
        out.set(carry.subarray(0, take), filled);
        carry = carry.subarray(take);
        filled += take;
      }
      return out.subarray(0, filled);
    },
    /** True once every byte has been consumed. */
    async exhausted(): Promise<boolean> {
      if (carry.byteLength > 0) return false;
      if (done) return true;
      const next = await reader.read();
      if (next.done) {
        done = true;
        return true;
      }
      carry = next.value;
      return false;
    },
    cancel(): Promise<void> {
      return reader.cancel().catch(() => undefined);
    },
  };
}

export class LinkedInAdapter extends BasePlatformAdapter {
  platform = Platform.LINKEDIN;

  /** Overridable so tests do not wait for real seconds. */
  videoReadyBudgetMs = VIDEO_READY_BUDGET_MS;
  videoReadyIntervalMs = VIDEO_READY_INTERVAL_MS;

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

    const source = await fetchOwnMedia(sourceUrl);
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

  private restHeaders(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      "LinkedIn-Version": LINKEDIN_VERSION,
      "X-Restli-Protocol-Version": "2.0.0",
    };
  }

  /**
   * LinkedIn's Videos API: initializeUpload → PUT each part to the URL the
   * instructions give for its byte range (collecting each part's ETag) →
   * finalizeUpload → wait until the video has left WAITING_UPLOAD. Returns the
   * video urn the post references.
   *
   * The source is streamed: only the part being sent is in memory.
   */
  private async uploadVideo(
    accessToken: string,
    ownerUrn: string,
    sourceUrl: string,
    sizeHint?: number,
  ): Promise<string> {
    const source = await fetchOwnMedia(sourceUrl);
    if (!source.ok || !source.body) {
      throw new AdapterError(
        `Could not read the video to upload (HTTP ${source.status}).`,
        "VIDEO_UPLOAD_FAILED",
      );
    }
    const served = Number(source.headers.get("content-length"));
    const fileSizeBytes = Number.isFinite(served) && served > 0 ? served : sizeHint ?? 0;
    const reader = byteRangeReader(source.body);

    if (!fileSizeBytes) {
      await reader.cancel();
      throw new AdapterError(
        "The video's size is unknown, and LinkedIn needs it to plan the upload.",
        "VIDEO_UPLOAD_FAILED",
      );
    }
    if (fileSizeBytes < LINKEDIN_VIDEO_MIN_BYTES || fileSizeBytes > LINKEDIN_VIDEO_MAX_BYTES) {
      await reader.cancel();
      throw new AdapterError(
        `LinkedIn accepts videos between 75 KB and 500 MB; this one is ${(fileSizeBytes / 1024 / 1024).toFixed(1)} MB.`,
        "MEDIA_INVALID",
      );
    }

    const initResponse = await fetch(`${LINKEDIN_API_URL}/rest/videos?action=initializeUpload`, {
      method: "POST",
      headers: this.restHeaders(accessToken),
      body: JSON.stringify({
        initializeUploadRequest: {
          owner: ownerUrn,
          fileSizeBytes,
          uploadCaptions: false,
          uploadThumbnail: false,
        },
      }),
    });
    if (!initResponse.ok) {
      await reader.cancel();
      const detail = await initResponse.text().catch(() => "");
      throw new AdapterError(
        "LinkedIn refused the video upload registration.",
        "VIDEO_UPLOAD_FAILED",
        initResponse.status,
        detail,
      );
    }

    const init = (await initResponse.json()) as {
      value?: {
        video?: string;
        uploadToken?: string;
        uploadInstructions?: Array<{ uploadUrl?: string; firstByte?: number; lastByte?: number }>;
      };
    };
    const videoUrn = init.value?.video;
    const instructions = [...(init.value?.uploadInstructions ?? [])].sort(
      (a, b) => (a.firstByte ?? 0) - (b.firstByte ?? 0),
    );
    if (!videoUrn || instructions.length === 0) {
      await reader.cancel();
      throw new AdapterError(
        "LinkedIn returned no video urn or upload instructions.",
        "VIDEO_UPLOAD_FAILED",
      );
    }

    const partIds: string[] = [];
    let expectedFirst = 0;
    for (const [index, part] of instructions.entries()) {
      const first = part.firstByte ?? -1;
      const last = part.lastByte ?? -1;
      if (!part.uploadUrl || first !== expectedFirst || last < first) {
        await reader.cancel();
        throw new AdapterError(
          `LinkedIn's upload instructions are not contiguous at part ${index + 1}.`,
          "VIDEO_UPLOAD_FAILED",
        );
      }
      const bytes = await reader.read(last - first + 1);
      if (bytes.byteLength !== last - first + 1) {
        throw new AdapterError(
          `The media host ended the video early (part ${index + 1} of ${instructions.length}).`,
          "VIDEO_UPLOAD_FAILED",
        );
      }

      const put = await fetch(part.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/octet-stream" },
        body: bytes,
      });
      const etag = put.headers.get("etag");
      if (!put.ok || !etag) {
        await reader.cancel();
        throw new AdapterError(
          `LinkedIn rejected video part ${index + 1} of ${instructions.length} (HTTP ${put.status}).`,
          "VIDEO_UPLOAD_FAILED",
          put.status,
        );
      }
      partIds.push(etag);
      expectedFirst = last + 1;
    }

    if (expectedFirst !== fileSizeBytes || !(await reader.exhausted())) {
      await reader.cancel();
      throw new AdapterError(
        "The video's bytes do not match the size LinkedIn planned the upload for.",
        "VIDEO_UPLOAD_FAILED",
      );
    }

    const finalize = await fetch(`${LINKEDIN_API_URL}/rest/videos?action=finalizeUpload`, {
      method: "POST",
      headers: this.restHeaders(accessToken),
      body: JSON.stringify({
        finalizeUploadRequest: {
          video: videoUrn,
          uploadToken: init.value?.uploadToken ?? "",
          uploadedPartIds: partIds,
        },
      }),
    });
    if (!finalize.ok) {
      const detail = await finalize.text().catch(() => "");
      throw new AdapterError(
        "LinkedIn did not accept the finished video upload.",
        "VIDEO_UPLOAD_FAILED",
        finalize.status,
        detail,
      );
    }

    await this.waitForVideo(accessToken, videoUrn);
    return videoUrn;
  }

  /**
   * After finalizeUpload the video is WAITING_UPLOAD until LinkedIn has the
   * parts, then PROCESSING, then AVAILABLE. A post may reference a PROCESSING
   * video (LinkedIn publishes it once processing completes), but not one still
   * WAITING_UPLOAD, and never a PROCESSING_FAILED one.
   */
  private async waitForVideo(accessToken: string, videoUrn: string): Promise<void> {
    const deadline = Date.now() + this.videoReadyBudgetMs;
    for (;;) {
      const response = await fetch(
        `${LINKEDIN_API_URL}/rest/videos/${encodeURIComponent(videoUrn)}`,
        { headers: this.restHeaders(accessToken) },
      );
      const video = (await response.json().catch(() => ({}))) as {
        status?: string;
        processingFailureReason?: string;
      };
      if (response.ok && video.status === "PROCESSING_FAILED") {
        throw new AdapterError(
          `LinkedIn could not process the video${video.processingFailureReason ? ` (${video.processingFailureReason})` : ""}.`,
          "MEDIA_INVALID",
        );
      }
      if (response.ok && (video.status === "AVAILABLE" || video.status === "PROCESSING")) return;
      if (Date.now() + this.videoReadyIntervalMs > deadline) {
        throw new AdapterError(
          "LinkedIn has not registered the uploaded video yet; nothing was posted.",
          "VIDEO_UPLOAD_FAILED",
          response.status,
        );
      }
      await new Promise((resolve) => setTimeout(resolve, this.videoReadyIntervalMs));
    }
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

      const attachment = this.mediaDescriptors(options)[0];
      if (attachment) {
        // The bytes have to be registered and uploaded first; the post then
        // references the returned URN. Sending the URL itself is rejected by the
        // API, which is why the declared single-image capability never worked.
        if (this.classifyMedia(attachment) === "video") {
          const videoUrn = await this.uploadVideo(
            accessToken,
            personUrn,
            attachment.url,
            attachment.sizeBytes,
          );
          const title = options.additionalOptions?.title;
          postBody.content = {
            media: { id: videoUrn, ...(typeof title === "string" && title ? { title } : {}) },
          };
        } else {
          const imageUrn = await this.uploadImage(accessToken, personUrn, attachment.url);
          postBody.content = { media: { id: imageUrn } };
        }
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
        return {
          success: false,
          error: error.message,
          ...(error.code === "MEDIA_INVALID" ? { code: "MEDIA_INVALID" } : {}),
          rawResponse: error.rawError,
        };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }
}

export const linkedInAdapter = new LinkedInAdapter();

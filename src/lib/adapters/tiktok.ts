import { Platform } from "@prisma/client";
import { BasePlatformAdapter, AdapterError } from "./base";
import { OAuthTokens, AccountInfo, PostOptions, PostResult } from "@/types/platform";
import {
  TIKTOK_AUTHORIZE_URL,
  TIKTOK_CAPTION_MAX_LENGTH,
  TIKTOK_CREATOR_INFO_URL,
  TIKTOK_DIRECT_POST_INIT_URL,
  TIKTOK_DIRECT_POST_TITLE_MAX_LENGTH,
  TIKTOK_INBOX_UPLOAD_INIT_URL,
  TIKTOK_REQUESTED_SCOPES,
  TIKTOK_REVOKE_URL,
  TIKTOK_SCOPES,
  TIKTOK_STATUS_FETCH_URL,
  TIKTOK_TOKEN_URL,
  TIKTOK_USER_FIELDS,
  TIKTOK_USER_INFO_URL,
  type TikTokPrivacyLevel,
  type TikTokPublishStatus,
} from "@/lib/social/tiktok/constants";
import { codeChallengeFor, generateCodeVerifier } from "@/lib/social/pkce";
import { tiktokCredentials, tiktokPkceMethod } from "@/lib/social/approval";
import { classifyTikTokError, SocialError } from "@/lib/social/errors";
import { planTikTokChunks } from "@/lib/social/media";
import { capabilitiesFor } from "@/lib/social/capabilities";
import { appApprovalFor } from "@/lib/social/approval";
import type { CapabilityReport } from "@/lib/social/types";
import {
  validateTikTokCredentials,
  type CredentialValidationResult,
} from "./credentials";

/**
 * TikTok provider.
 *
 * Endpoints, scopes and limits come from the official docs cited in
 * `src/lib/social/tiktok/constants.ts` (checked 2026-09-12). Two things are
 * worth knowing before reading on:
 *
 * 1. Connecting and publishing are separately authorised. `video.upload` lets
 *    us hand a video to the user's TikTok inbox; `video.publish` is required
 *    for Direct Post and, on top of that, needs the app to have passed TikTok's
 *    audit — an unaudited app can only post SELF_ONLY.
 * 2. PKCE verifiers never travel through the browser. The verifier is stored
 *    server-side with the OAuth state (see `src/lib/oauth/state.ts`) and only
 *    the challenge goes into the authorization URL.
 */

/** A network call that cannot hang a request handler forever. */
const REQUEST_TIMEOUT_MS = 20_000;

async function tiktokFetch(url: string, init: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new SocialError({
        code: "SOCIAL_PROVIDER_UNAVAILABLE",
        platform: "tiktok",
        message: "TikTok did not respond in time.",
        technical: { url },
      });
    }
    throw new SocialError({
      code: "SOCIAL_PROVIDER_UNAVAILABLE",
      platform: "tiktok",
      message: "Could not reach TikTok.",
      technical: error,
    });
  } finally {
    clearTimeout(timer);
  }
}

export interface TikTokAuthorizationRequest {
  url: string;
  /** Kept server-side; never sent to TikTok, never sent to the browser. */
  verifier: string;
  codeChallengeMethod: "S256" | "plain";
}

export interface TikTokCreatorInfo {
  privacyLevelOptions: TikTokPrivacyLevel[];
  maxVideoPostDurationSec?: number;
  commentDisabled?: boolean;
  duetDisabled?: boolean;
  stitchDisabled?: boolean;
  creatorUsername?: string;
  creatorNickname?: string;
}

export interface TikTokStatusResult {
  status: TikTokPublishStatus;
  failReason?: string;
}

export class TikTokAdapter extends BasePlatformAdapter {
  platform = Platform.TIKTOK;

  /**
   * Validate TikTok OAuth credentials: both presence and format.
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
    return validateTikTokCredentials();
  }

  /**
   * Build the authorization request. The caller stores `verifier` with the
   * state cookie; only the challenge is exposed.
   */
  createAuthorizationRequest(state: string): TikTokAuthorizationRequest {
    const { clientKey, redirectUri, configured, missing } = tiktokCredentials();
    if (!configured) {
      throw new SocialError({
        code: "SOCIAL_PROVIDER_UNAVAILABLE",
        platform: "tiktok",
        message: `TikTok credentials are not configured (${missing.join(", ")}).`,
      });
    }

    const verifier = generateCodeVerifier();
    const codeChallengeMethod = tiktokPkceMethod();

    const params = new URLSearchParams({
      client_key: clientKey as string,
      response_type: "code",
      scope: TIKTOK_REQUESTED_SCOPES.join(","),
      redirect_uri: redirectUri,
      state,
      code_challenge: codeChallengeFor(verifier, codeChallengeMethod),
      code_challenge_method: codeChallengeMethod,
    });

    return { url: `${TIKTOK_AUTHORIZE_URL}?${params.toString()}`, verifier, codeChallengeMethod };
  }

  /**
   * Legacy contract: an authorization URL with no server-side verifier.
   * PKCE is required by TikTok's web flow, so this delegates to
   * `createAuthorizationRequest` and abandons the verifier — kept only so the
   * older `/api/social/connect?platform=TIKTOK` route cannot quietly ship a
   * connection that fails at the token exchange. Prefer the explicit call.
   */
  getOAuthUrl(state: string): string {
    return this.createAuthorizationRequest(state).url;
  }

  async exchangeCodeForTokens(code: string, codeVerifier?: string): Promise<OAuthTokens> {
    const { clientKey, clientSecret, redirectUri } = tiktokCredentials();

    const body: Record<string, string> = {
      client_key: clientKey ?? "",
      client_secret: clientSecret ?? "",
      code,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
    };
    if (codeVerifier) body.code_verifier = codeVerifier;

    const response = await tiktokFetch(TIKTOK_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
      body: new URLSearchParams(body),
    });

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok || data.error || !data.access_token) {
      throw classifyTikTokError(data, "auth");
    }

    const expiresIn = typeof data.expires_in === "number" ? data.expires_in : undefined;
    const refreshExpiresIn = typeof data.refresh_expires_in === "number" ? data.refresh_expires_in : undefined;

    return {
      accessToken: data.access_token as string,
      refreshToken: (data.refresh_token as string) ?? null,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
      refreshExpiresAt: refreshExpiresIn ? new Date(Date.now() + refreshExpiresIn * 1000) : null,
      tokenType: (data.token_type as string) ?? "Bearer",
      scope: (data.scope as string) ?? undefined,
      // TikTok returns the account id with the token; keeping it here means the
      // identity call is an enrichment, not the only way to learn who connected.
      externalAccountId: (data.open_id as string) ?? undefined,
    };
  }

  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    const { clientKey, clientSecret } = tiktokCredentials();

    const response = await tiktokFetch(TIKTOK_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", "Cache-Control": "no-cache" },
      body: new URLSearchParams({
        client_key: clientKey ?? "",
        client_secret: clientSecret ?? "",
        grant_type: "refresh_token",
        refresh_token: refreshToken,
      }),
    });

    const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;

    if (!response.ok || data.error || !data.access_token) {
      throw classifyTikTokError(data, "auth");
    }

    const expiresIn = typeof data.expires_in === "number" ? data.expires_in : undefined;
    const refreshExpiresIn = typeof data.refresh_expires_in === "number" ? data.refresh_expires_in : undefined;

    return {
      accessToken: data.access_token as string,
      // TikTok rotates the refresh token; keep the old one only if it does not.
      refreshToken: (data.refresh_token as string) ?? refreshToken,
      expiresAt: expiresIn ? new Date(Date.now() + expiresIn * 1000) : null,
      refreshExpiresAt: refreshExpiresIn ? new Date(Date.now() + refreshExpiresIn * 1000) : null,
      tokenType: (data.token_type as string) ?? "Bearer",
      scope: (data.scope as string) ?? undefined,
    };
  }

  async getAccountInfo(accessToken: string): Promise<AccountInfo> {
    const fields = [...TIKTOK_USER_FIELDS, "username"].join(",");
    const response = await tiktokFetch(`${TIKTOK_USER_INFO_URL}?fields=${encodeURIComponent(fields)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    const data = (await response.json().catch(() => ({}))) as {
      data?: { user?: Record<string, unknown> };
      error?: { code?: string; message?: string };
    };

    if (!response.ok) throw classifyTikTokError(data, "auth");

    const errorCode = data.error?.code;
    if (errorCode && errorCode !== "ok") throw classifyTikTokError(data, "auth");

    const user = data.data?.user ?? {};
    const openId = typeof user.open_id === "string" ? user.open_id : undefined;

    if (!openId) {
      throw new SocialError({
        code: "SOCIAL_ACCOUNT_UNAVAILABLE",
        platform: "tiktok",
        message: "TikTok did not return an account id for this token.",
        technical: data,
      });
    }

    return {
      platformUserId: openId,
      platformUsername: typeof user.username === "string" ? user.username : undefined,
      displayName: typeof user.display_name === "string" ? user.display_name : undefined,
      profileImageUrl: typeof user.avatar_url === "string" ? user.avatar_url : undefined,
      metadata: {
        accountType: "tiktok_creator",
        unionId: typeof user.union_id === "string" ? user.union_id : undefined,
      },
    };
  }

  /**
   * Creator info must be read before a Direct Post: it carries the privacy
   * levels this creator may actually choose and their video duration ceiling.
   */
  async getCreatorInfo(accessToken: string): Promise<TikTokCreatorInfo> {
    const response = await tiktokFetch(TIKTOK_CREATOR_INFO_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });

    const data = (await response.json().catch(() => ({}))) as {
      data?: Record<string, unknown>;
      error?: { code?: string; message?: string };
    };

    if (!response.ok) throw classifyTikTokError(data, "publish");
    if (data.error?.code && data.error.code !== "ok") throw classifyTikTokError(data, "publish");

    const info = data.data ?? {};
    const options = Array.isArray(info.privacy_level_options)
      ? (info.privacy_level_options.filter((v) => typeof v === "string") as TikTokPrivacyLevel[])
      : [];

    return {
      privacyLevelOptions: options.length > 0 ? options : ["SELF_ONLY"],
      maxVideoPostDurationSec:
        typeof info.max_video_post_duration_sec === "number" ? info.max_video_post_duration_sec : undefined,
      commentDisabled: info.comment_disabled === true,
      duetDisabled: info.duet_disabled === true,
      stitchDisabled: info.stitch_disabled === true,
      creatorUsername: typeof info.creator_username === "string" ? info.creator_username : undefined,
      creatorNickname: typeof info.creator_nickname === "string" ? info.creator_nickname : undefined,
    };
  }

  /**
   * Direct Post. `media.localPath` uploads the bytes (FILE_UPLOAD, chunked per
   * TikTok's transfer guide); `media.url` uses PULL_FROM_URL, which only works
   * for a domain whose ownership has been verified with TikTok.
   */
  private async initDirectPost(input: {
    accessToken: string;
    caption: string;
    privacyLevel: TikTokPrivacyLevel;
    sizeBytes: number;
    mediaUrl?: string;
    options?: Record<string, unknown>;
  }): Promise<{ publishId: string; uploadUrl?: string }> {
    const source =
      input.mediaUrl !== undefined
        ? { source: "PULL_FROM_URL", video_url: input.mediaUrl }
        : (() => {
            const plan = planTikTokChunks(input.sizeBytes);
            if (!plan.ok) {
              throw new SocialError({
                code: "SOCIAL_MEDIA_INVALID",
                platform: "tiktok",
                message: plan.reason,
              });
            }
            return {
              source: "FILE_UPLOAD",
              video_size: input.sizeBytes,
              chunk_size: plan.plan.chunkSize,
              total_chunk_count: plan.plan.totalChunkCount,
            };
          })();

    const response = await tiktokFetch(TIKTOK_DIRECT_POST_INIT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${input.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        post_info: {
          title: input.caption.slice(0, TIKTOK_DIRECT_POST_TITLE_MAX_LENGTH),
          privacy_level: input.privacyLevel,
          disable_comment: input.options?.disableComment === true,
          disable_duet: input.options?.disableDuet === true,
          disable_stitch: input.options?.disableStitch === true,
        },
        source_info: source,
      }),
    });

    const data = (await response.json().catch(() => ({}))) as {
      data?: { publish_id?: string; upload_url?: string };
      error?: { code?: string; message?: string };
    };

    if (!response.ok) throw classifyTikTokError(data, "publish");
    if (data.error?.code && data.error.code !== "ok") throw classifyTikTokError(data, "publish");

    const publishId = data.data?.publish_id;
    if (!publishId) {
      throw new SocialError({
        code: "SOCIAL_PUBLISH_FAILED",
        platform: "tiktok",
        message: "TikTok accepted the request but returned no publish id.",
        technical: data,
      });
    }

    return { publishId, uploadUrl: data.data?.upload_url };
  }

  /** Draft/inbox upload: the video lands in the creator's TikTok inbox. */
  private async initInboxUpload(input: {
    accessToken: string;
    mediaUrl?: string;
    sizeBytes: number;
  }): Promise<{ publishId: string; uploadUrl?: string }> {
    const source =
      input.mediaUrl !== undefined
        ? { source: "PULL_FROM_URL", video_url: input.mediaUrl }
        : (() => {
            const plan = planTikTokChunks(input.sizeBytes);
            if (!plan.ok) {
              throw new SocialError({
                code: "SOCIAL_MEDIA_INVALID",
                platform: "tiktok",
                message: plan.reason,
              });
            }
            return {
              source: "FILE_UPLOAD",
              video_size: input.sizeBytes,
              chunk_size: plan.plan.chunkSize,
              total_chunk_count: plan.plan.totalChunkCount,
            };
          })();

    const response = await tiktokFetch(TIKTOK_INBOX_UPLOAD_INIT_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${input.accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ source_info: source }),
    });

    const data = (await response.json().catch(() => ({}))) as {
      data?: { publish_id?: string; upload_url?: string };
      error?: { code?: string; message?: string };
    };

    if (!response.ok) throw classifyTikTokError(data, "upload");
    if (data.error?.code && data.error.code !== "ok") throw classifyTikTokError(data, "upload");

    const publishId = data.data?.publish_id;
    if (!publishId) {
      throw new SocialError({
        code: "SOCIAL_UPLOAD_FAILED",
        platform: "tiktok",
        message: "TikTok accepted the upload but returned no publish id.",
        technical: data,
      });
    }

    return { publishId, uploadUrl: data.data?.upload_url };
  }

  /** Poll the state of an init'ed post. */
  async getPostStatus(accessToken: string, publishId: string): Promise<TikTokStatusResult> {
    const response = await tiktokFetch(TIKTOK_STATUS_FETCH_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({ publish_id: publishId }),
    });

    const data = (await response.json().catch(() => ({}))) as {
      data?: { status?: string; fail_reason?: string };
      error?: { code?: string; message?: string };
    };

    if (!response.ok) throw classifyTikTokError(data, "status");
    if (data.error?.code && data.error.code !== "ok") throw classifyTikTokError(data, "status");

    const status = (data.data?.status ?? "PROCESSING_UPLOAD") as TikTokPublishStatus;
    return { status, failReason: data.data?.fail_reason };
  }

  /** Revoke the grant on TikTok's side (best effort, called on disconnect). */
  async revokeAccess(accessToken: string): Promise<void> {
    const { clientKey, clientSecret, configured } = tiktokCredentials();
    if (!configured) return;

    const response = await tiktokFetch(TIKTOK_REVOKE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: clientKey as string,
        client_secret: clientSecret as string,
        token: accessToken,
      }),
    });

    if (!response.ok) {
      // A failed revoke must not block the local disconnect — the token is
      // dropped on our side either way — but it is worth knowing about.
      const body = await response.text().catch(() => "");
      throw new SocialError({
        code: "SOCIAL_ACCOUNT_UNAVAILABLE",
        platform: "tiktok",
        message: "TikTok did not confirm the revocation.",
        technical: { status: response.status, body },
      });
    }
  }

  /** Per-account capabilities, from granted scopes + app approval. */
  getCapabilities(input: { scopes: string[]; accountType?: string | null }): CapabilityReport {
    return capabilitiesFor(Platform.TIKTOK, {
      scopes: input.scopes,
      accountType: input.accountType,
      approval: appApprovalFor(Platform.TIKTOK),
    });
  }

  /**
   * Legacy `createPost` entry point, kept for the existing publish worker.
   * New code should call `publishDirect` / `uploadDraft` with a PublishInput.
   */
  async createPost(accessToken: string, options: PostOptions): Promise<PostResult> {
    if (!options.mediaUrls || options.mediaUrls.length === 0) {
      return {
        success: false,
        error: "TikTok requires a video file. Text-only posts are not supported.",
      };
    }

    if (options.text.length > TIKTOK_CAPTION_MAX_LENGTH) {
      return {
        success: false,
        error: `Caption exceeds TikTok's ${TIKTOK_CAPTION_MAX_LENGTH} character limit.`,
      };
    }

    try {
      // Read the creator's own privacy options first — hardcoding PUBLIC is a
      // product-use violation and fails for unaudited apps.
      const creator = await this.getCreatorInfo(accessToken);
      const privacy: TikTokPrivacyLevel = creator.privacyLevelOptions.includes("PUBLIC_TO_EVERYONE")
        ? "PUBLIC_TO_EVERYONE"
        : "SELF_ONLY";

      const { publishId, uploadUrl } = await this.initDirectPost({
        accessToken,
        caption: options.text,
        privacyLevel: privacy,
        sizeBytes: 0,
        mediaUrl: options.mediaUrls[0],
      });

      return {
        success: true,
        platformPostId: publishId,
        rawResponse: {
          publishId,
          uploadUrl,
          privacyLevel: privacy,
          note:
            privacy === "SELF_ONLY"
              ? "Posted as private (SELF_ONLY): TikTok only allows public posting for audited apps."
              : "Video accepted by TikTok. Poll /post/publish/status/fetch/ for progress.",
        },
      };
    } catch (error) {
      const social = error instanceof SocialError ? error : null;
      if (social) {
        return { success: false, error: social.message, rawResponse: { code: social.code } };
      }
      if (error instanceof AdapterError) {
        return { success: false, error: error.message, rawResponse: error.rawError };
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error occurred",
      };
    }
  }

  /** Exposed for the connection service and tests. */
  capabilitiesForScopes(scopes: string[], accountType?: string | null): CapabilityReport {
    return this.getCapabilities({ scopes, accountType });
  }
}

export const tiktokAdapter = new TikTokAdapter();

/** Which scopes this connector asks TikTok for (docs: tiktok-api-scopes). */
export const TIKTOK_SCOPE_LIST = TIKTOK_REQUESTED_SCOPES;
export const TIKTOK_UPLOAD_SCOPE = TIKTOK_SCOPES.upload;
export const TIKTOK_PUBLISH_SCOPE = TIKTOK_SCOPES.publish;

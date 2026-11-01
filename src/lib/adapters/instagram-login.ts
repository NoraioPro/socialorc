/**
 * Instagram publishing without a Facebook Page — "Instagram API with Instagram Login".
 *
 * The connector in `instagram.ts` is the Facebook-Login flavour: the user
 * authorises through facebook.com and Meta returns a **Page** token whose
 * `instagram_business_account` is what we publish to. A customer with an
 * Instagram professional account and no Facebook Page therefore cannot connect
 * at all — production logged
 * `[instagram] listConnectTargets: pages=0 linkedInstagramAccounts=0`
 * (2026-11-01).
 *
 * Meta's other flavour needs no Page: the user signs in **on instagram.com**, we
 * receive an Instagram user token, and publishing goes to
 * `graph.instagram.com/{ig-user-id}/media` → `/media_publish`.
 *
 * Which flavour runs is decided by credentials: set `INSTAGRAM_LOGIN_APP_ID` and
 * `INSTAGRAM_LOGIN_APP_SECRET` (Meta app → Instagram product → "API setup with
 * Instagram login" — these are **not** the Facebook app id) and the registry in
 * `index.ts` returns this adapter. With them unset, existing accounts keep using
 * the Facebook-Login connector.
 */
import { Platform } from "@prisma/client";

import { BasePlatformAdapter } from "./base";
import { platformEnv } from "@/lib/platform-env";
import { formatGraphError } from "./errors";
import {
  IG_LOGIN_GRAPH_URL,
  IG_LOGIN_TOKEN_URL,
  instagramContainerKind,
  instagramLoginAuthUrl,
  instagramLoginContainerStatusUrl,
  instagramLoginLongLivedUrl,
  instagramLoginMediaUrl,
  instagramLoginProfileUrl,
  instagramLoginPublishUrl,
  instagramLoginRefreshUrl,
  instagramLoginTokenForm,
  parseInstagramLoginToken,
} from "./instagram-login-urls";
import type {
  AccountInfo,
  ConnectTarget,
  OAuthTokens,
  PostOptions,
  PostResult,
} from "@/types/platform";

export {
  IG_LOGIN_AUTH_URL,
  IG_LOGIN_GRAPH_URL,
  IG_LOGIN_SCOPES,
  instagramLoginAuthUrl,
  instagramLoginLongLivedUrl,
  instagramLoginRefreshUrl,
  parseInstagramLoginToken,
} from "./instagram-login-urls";

/** Instagram app credentials, or what is missing. */
export function instagramLoginApp(): {
  appId: string;
  appSecret: string;
  configured: boolean;
  missing: string[];
} {
  const appId = platformEnv("INSTAGRAM_LOGIN_APP_ID").trim();
  const appSecret = platformEnv("INSTAGRAM_LOGIN_APP_SECRET").trim();
  const missing: string[] = [];
  if (!appId) missing.push("INSTAGRAM_LOGIN_APP_ID");
  if (!appSecret) missing.push("INSTAGRAM_LOGIN_APP_SECRET");
  return { appId, appSecret, configured: missing.length === 0, missing };
}

export function isInstagramLoginConfigured(): boolean {
  return instagramLoginApp().configured;
}

export class InstagramLoginAdapter extends BasePlatformAdapter {
  platform = Platform.INSTAGRAM;

  /** A container reaches FINISHED in seconds for images; video takes longer. */
  pollBudgetMs = 10_000;
  pollIntervalMs = 2_000;
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms));

  validateCredentials(): { valid: boolean; missing: string[] } {
    const app = instagramLoginApp();
    return { valid: app.configured, missing: app.missing };
  }

  getOAuthUrl(state: string): string {
    const app = instagramLoginApp();
    return instagramLoginAuthUrl({
      appId: app.appId,
      redirectUri: this.getRedirectUri(),
      state,
    });
  }

  /**
   * Code → short-lived token → long-lived token. The short-lived one lasts an
   * hour and cannot be refreshed, so it is never stored.
   */
  async exchangeCodeForTokens(code: string): Promise<OAuthTokens> {
    const app = instagramLoginApp();

    const res = await fetch(IG_LOGIN_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: instagramLoginTokenForm({
        appId: app.appId,
        appSecret: app.appSecret,
        redirectUri: this.getRedirectUri(),
        code,
      }),
    });
    const parsed = parseInstagramLoginToken(
      (await res.json()) as Parameters<typeof parseInstagramLoginToken>[0],
    );
    if (!parsed.ok) throw new Error(parsed.error);

    const longLived = await fetch(
      instagramLoginLongLivedUrl({
        appSecret: app.appSecret,
        accessToken: parsed.accessToken,
      }),
    );
    const longJson = (await longLived.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: { message?: string };
    };
    if (!longJson.access_token) {
      throw new Error(longJson.error?.message || "Instagram did not return a long-lived token.");
    }

    return {
      accessToken: longJson.access_token,
      refreshToken: null,
      expiresAt:
        typeof longJson.expires_in === "number"
          ? new Date(Date.now() + longJson.expires_in * 1000)
          : null,
      externalAccountId: parsed.userId || undefined,
    };
  }

  /** Instagram tokens are refreshed with the token itself — there is no refresh token. */
  async refreshAccessToken(refreshToken: string): Promise<OAuthTokens> {
    const res = await fetch(instagramLoginRefreshUrl(refreshToken));
    const json = (await res.json()) as {
      access_token?: string;
      expires_in?: number;
      error?: { message?: string };
    };
    if (!json.access_token) {
      throw new Error(json.error?.message || "Instagram did not refresh the token.");
    }
    return {
      accessToken: json.access_token,
      refreshToken: json.access_token,
      expiresAt:
        typeof json.expires_in === "number"
          ? new Date(Date.now() + json.expires_in * 1000)
          : null,
    };
  }

  async getAccountInfo(accessToken: string): Promise<AccountInfo> {
    const res = await fetch(instagramLoginProfileUrl(accessToken));
    const json = (await res.json()) as {
      user_id?: string | number;
      id?: string;
      username?: string;
      name?: string;
      profile_picture_url?: string;
      account_type?: string;
      error?: { message?: string };
    };
    if (json.error || (!json.user_id && !json.id)) {
      throw new Error(json.error?.message || "Instagram did not return an account.");
    }
    return {
      platformUserId: String(json.user_id ?? json.id),
      platformUsername: json.username,
      displayName: json.name || json.username,
      profileImageUrl: json.profile_picture_url,
      metadata: { accountType: json.account_type ?? "BUSINESS", authMode: "instagram_login" },
    };
  }

  /** No Page to choose: the authorising Instagram account is the only target. */
  async listConnectTargets(accessToken: string): Promise<ConnectTarget[]> {
    const info = await this.getAccountInfo(accessToken);
    return [
      {
        id: info.platformUserId,
        name: info.displayName || info.platformUsername || info.platformUserId,
        username: info.platformUsername,
        pictureUrl: info.profileImageUrl,
        detail: "Signed in with Instagram — no Facebook Page needed",
      },
    ];
  }

  async connectTarget(
    accessToken: string,
    targetId: string,
  ): Promise<{ tokens: OAuthTokens; info: AccountInfo }> {
    const info = await this.getAccountInfo(accessToken);
    if (info.platformUserId !== targetId) {
      throw new Error("That Instagram account is not the one that authorised this login.");
    }
    return { tokens: { accessToken, refreshToken: accessToken }, info };
  }

  /**
   * Two steps, as the content-publishing API requires: create a container, wait
   * for FINISHED, then publish it. Instagram accepts images and video, never text
   * alone.
   */
  async createPost(accessToken: string, options: PostOptions): Promise<PostResult> {
    const mediaUrl = options.mediaUrls?.[0];
    if (!mediaUrl) {
      return {
        success: false,
        error: "Instagram requires at least one media item — text-only posts are not supported",
        code: "MEDIA_INVALID",
      };
    }

    const me = await this.getAccountInfo(accessToken);
    const kind = instagramContainerKind({
      url: mediaUrl,
      mimeType: options.media?.[0]?.mimeType ?? null,
    });

    const body = new URLSearchParams({ access_token: accessToken });
    if (kind === "REELS") {
      body.set("media_type", "REELS");
      body.set("video_url", mediaUrl);
    } else {
      body.set("image_url", mediaUrl);
    }
    if (options.text) body.set("caption", options.text.slice(0, 2200));

    const created = await fetch(instagramLoginMediaUrl(me.platformUserId), {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: body.toString(),
    });
    const createdJson = (await created.json()) as { id?: string; error?: { message?: string } };
    if (!createdJson.id) {
      const failure = formatGraphError(createdJson, "Instagram rejected the media container.");
      return {
        success: false,
        error: failure.message,
        code: failure.code,
        rawResponse: createdJson,
      };
    }

    const status = await this.waitForContainer(accessToken, createdJson.id);
    if (status !== "FINISHED") {
      // Not a dead end: the container is processing, and a retry publishes the
      // same container instead of re-uploading the media.
      return {
        success: false,
        pending: true,
        platformPostId: createdJson.id,
        error: `Instagram is still processing this media (${status}).`,
        code: "PLATFORM_UNAVAILABLE",
        rawResponse: createdJson,
      };
    }

    const published = await fetch(
      instagramLoginPublishUrl(me.platformUserId, createdJson.id, accessToken),
      { method: "POST" },
    );
    const publishedJson = (await published.json()) as { id?: string; error?: { message?: string } };
    if (!publishedJson.id) {
      const failure = formatGraphError(publishedJson, "Instagram rejected the publish.");
      return {
        success: false,
        error: failure.message,
        code: failure.code,
        rawResponse: publishedJson,
      };
    }

    return {
      success: true,
      platformPostId: publishedJson.id,
      platformPostUrl: await this.permalink(accessToken, publishedJson.id),
      rawResponse: publishedJson,
    };
  }

  private async permalink(accessToken: string, mediaId: string): Promise<string | undefined> {
    try {
      const res = await fetch(
        `${IG_LOGIN_GRAPH_URL}/v21.0/${mediaId}?` +
          new URLSearchParams({ fields: "permalink", access_token: accessToken }).toString(),
      );
      const json = (await res.json()) as { permalink?: string };
      return json.permalink;
    } catch {
      return undefined;
    }
  }

  private async waitForContainer(
    accessToken: string,
    containerId: string,
  ): Promise<"FINISHED" | "IN_PROGRESS" | "ERROR" | "EXPIRED" | "PUBLISHED"> {
    const deadline = Date.now() + this.pollBudgetMs;
    let last: "FINISHED" | "IN_PROGRESS" | "ERROR" | "EXPIRED" | "PUBLISHED" = "IN_PROGRESS";
    while (Date.now() < deadline) {
      const res = await fetch(instagramLoginContainerStatusUrl(containerId, accessToken));
      const json = (await res.json()) as {
        status_code?: "FINISHED" | "IN_PROGRESS" | "ERROR" | "EXPIRED" | "PUBLISHED";
      };
      if (json.status_code) last = json.status_code;
      if (last !== "IN_PROGRESS") break;
      await this.sleep(this.pollIntervalMs);
    }
    return last;
  }
}

/** One instance: the registry returns it when the Instagram-Login credentials exist. */
export const instagramLoginAdapter = new InstagramLoginAdapter();

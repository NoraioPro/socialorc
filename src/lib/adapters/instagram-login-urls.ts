/**
 * URL and response helpers for the Instagram-Login flavour of the Instagram API.
 *
 * Pure on purpose: no `process.env`, no database, no adapter instance. The
 * adapter in `instagram-login.ts` reads the credentials and calls these, so the
 * exact endpoints and parameter names can be asserted in a unit test without a
 * network or a Prisma client.
 *
 * Endpoints (Meta, Instagram API with Instagram Login):
 *   authorize  https://www.instagram.com/oauth/authorize
 *   code→token https://api.instagram.com/oauth/access_token      short-lived
 *   long-lived https://graph.instagram.com/access_token          ig_exchange_token
 *   refresh    https://graph.instagram.com/refresh_access_token  ig_refresh_token
 *   graph      https://graph.instagram.com/v21.0
 */
export const IG_LOGIN_AUTH_URL = "https://www.instagram.com/oauth/authorize";
export const IG_LOGIN_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
export const IG_LOGIN_GRAPH_URL = "https://graph.instagram.com";
export const IG_LOGIN_SCOPES = [
  "instagram_business_basic",
  "instagram_business_content_publish",
] as const;

export function instagramLoginAuthUrl(input: {
  appId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.appId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: IG_LOGIN_SCOPES.join(","),
    state: input.state,
  });
  return `${IG_LOGIN_AUTH_URL}?${params.toString()}`;
}

export function instagramLoginTokenForm(input: {
  appId: string;
  appSecret: string;
  redirectUri: string;
  code: string;
}): string {
  return new URLSearchParams({
    client_id: input.appId,
    client_secret: input.appSecret,
    grant_type: "authorization_code",
    redirect_uri: input.redirectUri,
    code: input.code,
  }).toString();
}

export function instagramLoginLongLivedUrl(input: {
  appSecret: string;
  accessToken: string;
}): string {
  const params = new URLSearchParams({
    grant_type: "ig_exchange_token",
    client_secret: input.appSecret,
    access_token: input.accessToken,
  });
  return `${IG_LOGIN_GRAPH_URL}/access_token?${params.toString()}`;
}

export function instagramLoginRefreshUrl(accessToken: string): string {
  const params = new URLSearchParams({
    grant_type: "ig_refresh_token",
    access_token: accessToken,
  });
  return `${IG_LOGIN_GRAPH_URL}/refresh_access_token?${params.toString()}`;
}

export function instagramLoginProfileUrl(accessToken: string): string {
  const params = new URLSearchParams({
    fields: "user_id,username,name,profile_picture_url,account_type",
    access_token: accessToken,
  });
  return `${IG_LOGIN_GRAPH_URL}/v21.0/me?${params.toString()}`;
}

export function instagramLoginMediaUrl(igUserId: string): string {
  return `${IG_LOGIN_GRAPH_URL}/v21.0/${igUserId}/media`;
}

export function instagramLoginPublishUrl(igUserId: string, creationId: string, accessToken: string): string {
  const params = new URLSearchParams({ creation_id: creationId, access_token: accessToken });
  return `${IG_LOGIN_GRAPH_URL}/v21.0/${igUserId}/media_publish?${params.toString()}`;
}

export function instagramLoginContainerStatusUrl(containerId: string, accessToken: string): string {
  const params = new URLSearchParams({ fields: "status_code", access_token: accessToken });
  return `${IG_LOGIN_GRAPH_URL}/v21.0/${containerId}?${params.toString()}`;
}

export type InstagramLoginTokenResult =
  | { ok: true; accessToken: string; userId: string; expiresAt: Date | null }
  | { ok: false; error: string };

/** The code→token response, normalised. */
export function parseInstagramLoginToken(
  json: {
    access_token?: string;
    user_id?: number | string;
    expires_in?: number;
    error_message?: string;
    error?: { message?: string };
  } | null,
  now: number = Date.now(),
): InstagramLoginTokenResult {
  if (!json?.access_token) {
    return {
      ok: false,
      error: json?.error?.message || json?.error_message || "Instagram did not return an access token.",
    };
  }
  return {
    ok: true,
    accessToken: json.access_token,
    userId: String(json.user_id ?? ""),
    expiresAt: typeof json.expires_in === "number" ? new Date(now + json.expires_in * 1000) : null,
  };
}

/** Which media container a URL needs: Reels for video, plain image otherwise. */
export function instagramContainerKind(input: {
  url: string;
  mimeType?: string | null;
}): "REELS" | "IMAGE" {
  if ((input.mimeType ?? "").startsWith("video/")) return "REELS";
  return /\.(mp4|mov|m4v|webm)(\?|$)/i.test(input.url) ? "REELS" : "IMAGE";
}

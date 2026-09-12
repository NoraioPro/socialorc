/**
 * App-level approval state and credentials, read from the environment.
 *
 * Connecting an account and being allowed to publish are two different
 * permissions: TikTok hands out `video.publish` to any app, but public posting
 * only works once the app has passed TikTok's audit. Rather than guessing, the
 * operator states the approval in configuration and the capability layer reports
 * it — so the UI can disable "Publish directly" instead of promising it.
 */

import type { Platform } from "@prisma/client";
import type { AppApprovalState } from "./types";

export interface TikTokCredentials {
  clientKey: string | null;
  clientSecret: string | null;
  redirectUri: string;
  configured: boolean;
  missing: string[];
}

/** Public origin used to build redirect URIs when an explicit one is absent. */
export function appOrigin(env: NodeJS.ProcessEnv = process.env): string {
  return env.APP_URL || env.NEXTAUTH_URL || "http://localhost:3000";
}

export function tiktokRedirectUri(env: NodeJS.ProcessEnv = process.env): string {
  return env.TIKTOK_REDIRECT_URI || `${appOrigin(env)}/api/social/tiktok/callback`;
}

export function tiktokCredentials(env: NodeJS.ProcessEnv = process.env): TikTokCredentials {
  const clientKey = env.TIKTOK_CLIENT_KEY || null;
  const clientSecret = env.TIKTOK_CLIENT_SECRET || null;
  const missing: string[] = [];

  if (!clientKey) missing.push("TIKTOK_CLIENT_KEY");
  if (!clientSecret) missing.push("TIKTOK_CLIENT_SECRET");

  return {
    clientKey,
    clientSecret,
    redirectUri: tiktokRedirectUri(env),
    configured: missing.length === 0,
    missing,
  };
}

/** PKCE method for TikTok. S256 unless the operator forces `plain`. */
export function tiktokPkceMethod(env: NodeJS.ProcessEnv = process.env): "S256" | "plain" {
  return env.TIKTOK_PKCE_METHOD === "plain" ? "plain" : "S256";
}

/**
 * What the app is currently approved for. Both flags default to false: an
 * optimistic default is how "publish" ends up broken in production.
 */
export function appApprovalFor(platform: Platform, env: NodeJS.ProcessEnv = process.env): AppApprovalState {
  switch (platform) {
    case "TIKTOK":
      return {
        directPublish: env.TIKTOK_DIRECT_POST_APPROVED === "true",
        draftUpload: env.TIKTOK_UPLOAD_APPROVED === "true",
      };
    default:
      return { directPublish: false, draftUpload: false };
  }
}

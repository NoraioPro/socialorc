/**
 * OAuth sign-in providers for "fast login".
 *
 * Kept out of `auth.ts` so the rules are testable without NextAuth, Prisma or a
 * request context:
 *
 *  1. A provider is offered only when it is configured. A "Continue with …"
 *     button that cannot work is worse than no button — the user blames the
 *     product rather than the missing setup.
 *  2. Only variable NAMES are reported, never values.
 *  3. One Meta app serves both sign-in and publishing, so the Facebook login
 *     reads the same credentials the connector does (`FACEBOOK_APP_ID` /
 *     `FACEBOOK_APP_SECRET`) and accepts the NextAuth-style
 *     `FACEBOOK_CLIENT_ID` / `FACEBOOK_CLIENT_SECRET` if those are set instead.
 *
 * Registered redirect URIs (must match the portal exactly):
 *   Google   → ${APP_URL}/api/auth/callback/google
 *   Facebook → ${APP_URL}/api/auth/callback/facebook
 */

export type OAuthProviderId = "google" | "facebook";

export interface OAuthProviderSetting {
  id: OAuthProviderId;
  /** Label shown on the button. */
  name: string;
  /** Credentials present, so the provider can complete a round trip. */
  configured: boolean;
  /** Env variable names still missing (never values). */
  missing: string[];
}

export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
}

function pair(
  clientId: string | undefined,
  clientSecret: string | undefined,
  names: [string, string],
): { credentials: OAuthCredentials | null; missing: string[] } {
  const missing: string[] = [];
  if (!clientId) missing.push(names[0]);
  if (!clientSecret) missing.push(names[1]);
  return {
    credentials: clientId && clientSecret ? { clientId, clientSecret } : null,
    missing,
  };
}

/** Google sign-in credentials, or null when either half is absent. */
export function googleCredentials(env: NodeJS.ProcessEnv = process.env): OAuthCredentials | null {
  return pair(
    env.GOOGLE_CLIENT_ID || env.AUTH_GOOGLE_ID,
    env.GOOGLE_CLIENT_SECRET || env.AUTH_GOOGLE_SECRET,
    ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  ).credentials;
}

/** Facebook sign-in credentials, or null when either half is absent. */
export function facebookCredentials(env: NodeJS.ProcessEnv = process.env): OAuthCredentials | null {
  return pair(
    env.FACEBOOK_CLIENT_ID || env.FACEBOOK_APP_ID,
    env.FACEBOOK_CLIENT_SECRET || env.FACEBOOK_APP_SECRET,
    ["FACEBOOK_CLIENT_ID (or FACEBOOK_APP_ID)", "FACEBOOK_CLIENT_SECRET (or FACEBOOK_APP_SECRET)"],
  ).credentials;
}

function redirect(appUrl: string, provider: OAuthProviderId): string {
  return `${appUrl.replace(/\/+$/, "")}/api/auth/callback/${provider}`;
}

/** The redirect URI to register in the Google Cloud console for sign-in. */
export function googleLoginRedirectUri(appUrl: string): string {
  return redirect(appUrl, "google");
}

/** The redirect URI to add to the Meta app's "Valid OAuth Redirect URIs". */
export function facebookLoginRedirectUri(appUrl: string): string {
  return redirect(appUrl, "facebook");
}

/** Which OAuth providers this deployment can actually offer. */
export function enabledOAuthProviders(env: NodeJS.ProcessEnv = process.env): OAuthProviderSetting[] {
  const google = pair(
    env.GOOGLE_CLIENT_ID || env.AUTH_GOOGLE_ID,
    env.GOOGLE_CLIENT_SECRET || env.AUTH_GOOGLE_SECRET,
    ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"],
  );
  const facebook = pair(
    env.FACEBOOK_CLIENT_ID || env.FACEBOOK_APP_ID,
    env.FACEBOOK_CLIENT_SECRET || env.FACEBOOK_APP_SECRET,
    ["FACEBOOK_CLIENT_ID (or FACEBOOK_APP_ID)", "FACEBOOK_CLIENT_SECRET (or FACEBOOK_APP_SECRET)"],
  );

  return [
    { id: "google", name: "Google", configured: google.credentials !== null, missing: google.missing },
    { id: "facebook", name: "Facebook", configured: facebook.credentials !== null, missing: facebook.missing },
  ];
}

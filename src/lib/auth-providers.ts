/**
 * OAuth sign-in providers for "fast login".
 *
 * Kept separate from `auth.ts` so it is testable without NextAuth, Prisma or a
 * request context — and so the rule that matters is stated in one place: a
 * provider is offered only when it is actually configured. A "Continue with
 * Google" button that exists but cannot work is worse than no button, because the
 * user blames the product instead of the missing setup.
 */

export interface OAuthProviderSetting {
  id: "google";
  /** Label shown on the button. */
  name: string;
  /** Credentials are present, so the provider can complete a round trip. */
  configured: boolean;
  /** Env variable names still missing (never values). */
  missing: string[];
}

export interface OAuthCredentials {
  clientId: string;
  clientSecret: string;
}

/** Google sign-in credentials, or null when either half is absent. */
export function googleCredentials(
  env: NodeJS.ProcessEnv = process.env,
): OAuthCredentials | null {
  const clientId = env.GOOGLE_CLIENT_ID || env.AUTH_GOOGLE_ID;
  const clientSecret = env.GOOGLE_CLIENT_SECRET || env.AUTH_GOOGLE_SECRET;
  if (!clientId || !clientSecret) return null;
  return { clientId, clientSecret };
}

/** The redirect URI to register in the Google Cloud console for sign-in. */
export function googleLoginRedirectUri(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, "")}/api/auth/callback/google`;
}

/** Which OAuth providers this deployment can actually offer. */
export function enabledOAuthProviders(env: NodeJS.ProcessEnv = process.env): OAuthProviderSetting[] {
  const missing: string[] = [];
  if (!(env.GOOGLE_CLIENT_ID || env.AUTH_GOOGLE_ID)) missing.push("GOOGLE_CLIENT_ID");
  if (!(env.GOOGLE_CLIENT_SECRET || env.AUTH_GOOGLE_SECRET)) missing.push("GOOGLE_CLIENT_SECRET");

  return [
    {
      id: "google",
      name: "Google",
      configured: missing.length === 0,
      missing,
    },
  ];
}

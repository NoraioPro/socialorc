import { AdapterError } from "./base";
import { metaAppId, metaAppSecret } from "./meta-app";
import { formatGraphError } from "./errors";
import type { OAuthTokens } from "@/types/platform";

/**
 * Graph API plumbing shared by the Facebook and Instagram connectors (both run
 * through Facebook Login against graph.facebook.com).
 */

export const GRAPH_VERSION = "v25.0";
export const GRAPH_API_URL = `https://graph.facebook.com/${GRAPH_VERSION}`;
export const FACEBOOK_AUTH_URL = `https://www.facebook.com/${GRAPH_VERSION}/dialog/oauth`;
const TOKEN_URL = `${GRAPH_API_URL}/oauth/access_token`;

/** Upper bound on `/me/accounts` pages followed — a person with >500 Pages is not a real case. */
const MAX_PAGE_FETCHES = 5;

/**
 * Code -> short-lived user token -> long-lived user token.
 *
 * The long-lived exchange is mandatory: Page tokens derived from a short-lived
 * user token expire with it (~1h), whereas Page tokens derived from a
 * long-lived one do not expire. Falling back to the short-lived token — which
 * the old code did silently — would store a connection that dies within the
 * hour, so a failed exchange fails the connect instead.
 */
export async function exchangeCodeForLongLivedUserToken(
  code: string,
  redirectUri: string,
): Promise<OAuthTokens> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: metaAppId(),
      client_secret: metaAppSecret(),
      redirect_uri: redirectUri,
      code,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new AdapterError(
      `Failed to exchange code for tokens: ${error}`,
      "TOKEN_EXCHANGE_FAILED",
      response.status,
      error,
    );
  }

  const shortLived = (await response.json()) as { access_token?: string };
  if (!shortLived.access_token) {
    throw new AdapterError("Meta returned no access token", "TOKEN_EXCHANGE_FAILED");
  }

  const longLivedResponse = await fetch(
    `${TOKEN_URL}?` +
      new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: metaAppId(),
        client_secret: metaAppSecret(),
        fb_exchange_token: shortLived.access_token,
      }),
  );

  const longLived = (await longLivedResponse.json().catch(() => ({}))) as {
    access_token?: string;
    token_type?: string;
    expires_in?: number;
  };
  if (!longLivedResponse.ok || !longLived.access_token) {
    const formatted = formatGraphError(longLived, `HTTP ${longLivedResponse.status}`);
    throw new AdapterError(
      `Could not obtain a long-lived Meta token: ${formatted.message}`,
      "TOKEN_EXCHANGE_FAILED",
      longLivedResponse.status,
      longLived,
    );
  }

  return {
    accessToken: longLived.access_token,
    refreshToken: null,
    expiresAt: longLived.expires_in ? new Date(Date.now() + longLived.expires_in * 1000) : null,
    tokenType: longLived.token_type || "bearer",
  };
}

export interface ManagedPage {
  id: string;
  name: string;
  access_token?: string;
  picture?: { data?: { url?: string } };
  tasks?: string[];
  instagram_business_account?: {
    id: string;
    username?: string;
    name?: string;
    profile_picture_url?: string;
  };
}

/** Every Page the user token can act for, following pagination. */
export async function fetchManagedPages(userToken: string, fields: string): Promise<ManagedPage[]> {
  const pages: ManagedPage[] = [];
  let url: string | null =
    `${GRAPH_API_URL}/me/accounts?` +
    new URLSearchParams({ fields, limit: "100", access_token: userToken });

  for (let i = 0; url && i < MAX_PAGE_FETCHES; i++) {
    const response: Response = await fetch(url);
    const body = (await response.json().catch(() => ({}))) as {
      data?: ManagedPage[];
      paging?: { next?: string };
    };
    if (!response.ok) {
      const formatted = formatGraphError(body, "Failed to get Facebook Pages");
      throw new AdapterError(formatted.message, "PAGES_FETCH_FAILED", response.status, body);
    }
    pages.push(...(body.data ?? []));
    url = body.paging?.next ?? null;
  }

  return pages;
}

/**
 * Meta Page tokens do not refresh: they either keep working or must be
 * re-granted. Declared `refreshableTokens: false`, so the publish paths never
 * call this; it exists to fail loudly if something does.
 */
export function metaTokensDoNotRefresh(platformName: string): never {
  throw new AdapterError(
    `${platformName} Page tokens cannot be refreshed; reconnect the account to re-authorise it.`,
    "TOKEN_REFRESH_UNSUPPORTED",
  );
}

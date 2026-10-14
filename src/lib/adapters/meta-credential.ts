/**
 * The credential a Facebook Page / Instagram connection stores.
 *
 * Meta's token model (https://developers.facebook.com/docs/facebook-login/guides/access-tokens/get-long-lived):
 * the OAuth code yields a short-lived *user* token (~1h); `fb_exchange_token`
 * turns it into a long-lived user token (~60 days) which cannot be refreshed —
 * once it lapses the person has to log in again. A *Page* access token read
 * from `/me/accounts` with that long-lived user token "does not have an
 * expiration date" and only dies when invalidated (password change, lost Page
 * role, app removed).
 *
 * The connectors used to store the 60-day user token and re-derive the Page
 * token on every publish, so every connection silently died after two months.
 * They now store the Page token itself — together with which Page (and which
 * Instagram account) it is for, because a Page token alone does not say which
 * of the user's Pages was chosen, and the publish paths only hand an adapter
 * the token.
 *
 * The value is encrypted at rest like every other token (`encryptTokens`); this
 * envelope is only the plaintext shape inside that encryption.
 *
 * Rows connected before this change hold a bare long-lived user token. They
 * parse as `{ kind: "user" }` and keep the old resolve-at-publish behaviour
 * until they expire and are reconnected.
 */

const PREFIX = "metapage.v1.";

export type MetaCredential =
  | { kind: "page"; token: string; pageId: string; igUserId?: string }
  | { kind: "user"; token: string };

export function encodeMetaPageCredential(input: {
  token: string;
  pageId: string;
  igUserId?: string;
}): string {
  const payload: Record<string, string> = { t: input.token, p: input.pageId };
  if (input.igUserId) payload.i = input.igUserId;
  return PREFIX + Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
}

export function parseMetaCredential(raw: string): MetaCredential {
  if (!raw.startsWith(PREFIX)) return { kind: "user", token: raw };
  try {
    const payload = JSON.parse(Buffer.from(raw.slice(PREFIX.length), "base64url").toString("utf8")) as {
      t?: unknown;
      p?: unknown;
      i?: unknown;
    };
    if (typeof payload.t === "string" && payload.t && typeof payload.p === "string" && payload.p) {
      return {
        kind: "page",
        token: payload.t,
        pageId: payload.p,
        ...(typeof payload.i === "string" && payload.i ? { igUserId: payload.i } : {}),
      };
    }
  } catch {
    // fall through: an unreadable envelope is not a usable token either way
  }
  return { kind: "user", token: raw };
}

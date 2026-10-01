/**
 * Strip credentials out of connector metadata before it is persisted.
 *
 * Facebook and Instagram hand back a **Page access token** alongside the user
 * token, and the adapters put it in `metadata` — which the OAuth callback then
 * wrote to `SocialAccount.metadata` verbatim. Only the user token was encrypted,
 * so plaintext Page tokens sat in the database (and, before the response path
 * was closed, were serialised to the browser by every route that used
 * `include: { socialAccount: true }`).
 *
 * Neither adapter ever reads the *stored* copy: both resolve the Page token by
 * calling `getAccountInfo(accessToken)` live at publish time
 * (`facebook.ts:202`, `facebook.ts:276`, `instagram.ts:233`,
 * `instagram.ts:324`). So the stored copies are secrets nobody reads, and the
 * correct fix is to not store them rather than to encrypt them.
 *
 * Non-secret fields survive: `accountType`, `externalParentId`, `pageId`, and
 * the page list without its tokens.
 */

/** Keys that must never be persisted inside `SocialAccount.metadata`. */
const SECRET_METADATA_KEYS = ["pageAccessToken", "accessToken", "botToken", "clientSecret"];

export function sanitizeAccountMetadata(
  metadata: Record<string, unknown> | null | undefined,
): Record<string, unknown> | undefined {
  if (!metadata) return undefined;

  const clean: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    // Nested `allPages: [{ id, name, accessToken }]` — keep the page identity,
    // drop the token.
    if (key === "allPages" && Array.isArray(value)) {
      clean.allPages = value.map((page) => {
        if (!page || typeof page !== "object") return page;
        const { accessToken: _drop, ...rest } = page as Record<string, unknown>;
        return rest;
      });
      continue;
    }

    if (SECRET_METADATA_KEYS.includes(key)) continue;
    clean[key] = value;
  }

  return clean;
}

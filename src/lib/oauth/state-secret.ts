/**
 * The secret that signs an OAuth state cookie.
 *
 * The state cookie is the only thing standing between "this callback belongs to
 * the flow this user started" and "a client handed us a plausible JSON blob".
 * It used to be unsigned JSON, so anyone who could set a cookie on their own
 * browser could mint a state for any user id and any platform — and the
 * callback believed it. `/api/social/connect` mints state cookies and the
 * shared callback verifies them, so both sides read the key from here.
 *
 * Prefers a dedicated `OAUTH_STATE_SECRET` so rotating it cannot break session
 * tokens, and falls back to `NEXTAUTH_SECRET` (already required in production)
 * so an existing deployment keeps working.
 */
export function oauthStateSecret(): string {
  const secret = process.env.OAUTH_STATE_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) {
    // Fail loudly: silently minting or accepting unsigned state would quietly
    // reopen the hole this exists to close.
    throw new Error(
      "OAUTH_STATE_SECRET (or NEXTAUTH_SECRET) must be set: OAuth state cookies are signed with it"
    );
  }
  return secret;
}

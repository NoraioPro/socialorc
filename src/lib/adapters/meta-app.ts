/**
 * The Meta app credentials, under whichever name they happen to be set as.
 *
 * Instagram publishing and Facebook publishing run through a single Meta app, and
 * the sign-in provider already accepts the NextAuth-style `FACEBOOK_CLIENT_ID`.
 * Requiring a separate `INSTAGRAM_APP_ID` made both connectors report themselves
 * unconfigured to an operator who had registered the app correctly: the work was
 * done and the name simply did not match.
 *
 * Every alias is accepted here, and the connectors, the sign-in provider and the
 * status report all read through this one place so they cannot disagree again.
 */
export function metaAppId(): string {
  return (
    process.env.INSTAGRAM_APP_ID ||
    process.env.FACEBOOK_APP_ID ||
    process.env.FACEBOOK_CLIENT_ID ||
    process.env.META_APP_ID ||
    ""
  );
}

export function metaAppSecret(): string {
  return (
    process.env.INSTAGRAM_APP_SECRET ||
    process.env.FACEBOOK_APP_SECRET ||
    process.env.FACEBOOK_CLIENT_SECRET ||
    process.env.META_APP_SECRET ||
    ""
  );
}

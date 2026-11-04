/**
 * What an operator needs to switch a social connector on: where to create the
 * app, which redirect URIs and scopes to register, which environment variables
 * to set and what the provider must approve. One table, used by
 * scripts/setup-connector.mjs; tests/unit/connector-setup-data.test.ts keeps it
 * in step with the adapters (variable names, redirect paths).
 */

export const CONNECTORS = {
  linkedin: {
    label: "LinkedIn",
    portal: "https://www.linkedin.com/developers/apps",
    platforms: ["LINKEDIN"],
    vars: [
      { name: "LINKEDIN_CLIENT_ID", label: "Client ID" },
      { name: "LINKEDIN_CLIENT_SECRET", label: "Client Secret" },
    ],
    steps: [
      "Create an app (or open yours) and open its Products tab.",
      "Request \"Share on LinkedIn\" and \"Sign In with LinkedIn using OpenID Connect\".",
      "Auth tab: add the redirect URL below.",
      "Auth tab: copy the Client ID and Client Secret.",
    ],
    scopes: "openid profile email w_member_social",
    approval: "The \"Share on LinkedIn\" product must be approved before posts publish. Tokens last about 60 days, then the customer reconnects.",
  },
  x: {
    label: "X (Twitter)",
    portal: "https://developer.x.com/en/portal/dashboard",
    platforms: ["TWITTER"],
    vars: [
      { name: "TWITTER_CLIENT_ID", label: "OAuth 2.0 Client ID" },
      { name: "TWITTER_CLIENT_SECRET", label: "OAuth 2.0 Client Secret" },
    ],
    steps: [
      "Open your app, then User authentication settings, and enable OAuth 2.0.",
      "App type: Web App. App permissions: Read and write.",
      "Add the callback URI below.",
      "Keys and tokens: copy the OAuth 2.0 Client ID and Client Secret (not the API key).",
    ],
    scopes: "tweet.read tweet.write users.read offline.access media.write",
    approval: "Posting needs a paid X API plan. On the Free plan connecting works and publishing fails.",
  },
  youtube: {
    label: "YouTube",
    portal: "https://console.cloud.google.com/apis/credentials",
    platforms: ["YOUTUBE"],
    vars: [
      { name: "YOUTUBE_CLIENT_ID", label: "OAuth client ID" },
      { name: "YOUTUBE_CLIENT_SECRET", label: "OAuth client secret" },
    ],
    steps: [
      "Enable the YouTube Data API v3 for your project.",
      "OAuth consent screen: add yourself (and any testers) as test users.",
      "Credentials: create an OAuth client ID of type Web application.",
      "Add the authorized redirect URI below, then copy the client ID and secret.",
    ],
    scopes:
      "https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.force-ssl",
    approval: "Until Google verifies the app only listed test users can connect, and the default quota allows a few uploads a day.",
  },
  tiktok: {
    label: "TikTok",
    portal: "https://developers.tiktok.com/apps",
    platforms: ["TIKTOK"],
    vars: [
      { name: "TIKTOK_CLIENT_KEY", label: "Client key" },
      { name: "TIKTOK_CLIENT_SECRET", label: "Client secret" },
    ],
    flags: [
      { name: "TIKTOK_UPLOAD_APPROVED", label: "TikTok has approved draft uploads (video.upload)" },
      { name: "TIKTOK_DIRECT_POST_APPROVED", label: "TikTok has approved public posting after its audit (video.publish)" },
    ],
    steps: [
      "Create an app and add the Login Kit and Content Posting API products.",
      "Add the redirect URI below to Login Kit.",
      "Copy the client key and client secret.",
    ],
    scopes: "user.info.basic user.info.profile video.upload video.publish",
    approval: "Until TikTok audits the app, posts can only be drafts or private. Answer the approval questions honestly: they decide what the UI offers.",
  },
  meta: {
    label: "Facebook and Instagram (one Meta app)",
    portal: "https://developers.facebook.com/apps",
    platforms: ["FACEBOOK", "INSTAGRAM"],
    vars: [
      { name: "FACEBOOK_APP_ID", label: "App ID", pattern: "^\\d{15,20}$", hint: "a 15-20 digit number" },
      { name: "FACEBOOK_APP_SECRET", label: "App Secret" },
    ],
    steps: [
      "Create a Business app and add the Facebook Login and Instagram products.",
      "Facebook Login settings: add BOTH redirect URIs below as valid OAuth redirect URIs.",
      "Settings, Basic: copy the App ID and App Secret.",
      "Instagram publishing needs a Business or Creator account linked to a Facebook Page.",
    ],
    scopes:
      "Facebook: pages_show_list, pages_read_engagement, pages_manage_posts, pages_manage_metadata, pages_manage_engagement. Instagram: instagram_basic, instagram_content_publish, instagram_manage_comments, pages_read_engagement, pages_show_list",
    approval: "Business Verification and App Review are required before anyone outside the app's own roles can connect.",
  },
};

export function redirectUris(connector, appUrl) {
  const base = appUrl.replace(/\/+$/, "");
  return connector.platforms.map((p) => `${base}/api/social/${p.toLowerCase()}/callback`);
}

/** A loose shape check that catches empty values, spaces and placeholders. */
export function credentialShapeProblem(value) {
  if (!value) return "empty";
  if (/\s/.test(value)) return "contains whitespace";
  if (value.length < 8) return "too short to be a real credential";
  if (/^(your|test|fake|placeholder|example|changeme)/i.test(value)) return "looks like a placeholder";
  return null;
}

/** The shape problem for one variable's value: its own pattern first, then the generic check. */
export function variableProblem(variable, value) {
  const generic = credentialShapeProblem(value);
  if (generic) return generic;
  if (variable.pattern && !new RegExp(variable.pattern).test(value)) {
    return `is not ${variable.hint ?? "in the expected format"}`;
  }
  return null;
}

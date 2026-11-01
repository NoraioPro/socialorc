import { test } from "node:test";
import assert from "node:assert/strict";

import {
  IG_LOGIN_SCOPES,
  instagramContainerKind,
  instagramLoginAuthUrl,
  instagramLoginContainerStatusUrl,
  instagramLoginLongLivedUrl,
  instagramLoginMediaUrl,
  instagramLoginPublishUrl,
  instagramLoginRefreshUrl,
  instagramLoginTokenForm,
  parseInstagramLoginToken,
} from "../../src/lib/adapters/instagram-login-urls";

/**
 * The Instagram-Login flavour publishes without a Facebook Page, and its URLs are
 * the whole contract with Meta: the wrong host, parameter name or grant type is a
 * silent dead end. These assertions are the ones an actual failed connect would
 * otherwise have to teach us.
 */
test("authorize URL targets instagram.com with the business scopes and no Page", () => {
  const url = new URL(
    instagramLoginAuthUrl({
      appId: "1234567890",
      redirectUri: "https://www.socialork.com/api/social/instagram/callback",
      state: "abc.def",
    }),
  );
  assert.equal(url.origin + url.pathname, "https://www.instagram.com/oauth/authorize");
  assert.equal(url.searchParams.get("client_id"), "1234567890");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("state"), "abc.def");
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "https://www.socialork.com/api/social/instagram/callback",
  );
  assert.equal(url.searchParams.get("scope"), IG_LOGIN_SCOPES.join(","));
  assert.match(url.searchParams.get("scope") ?? "", /instagram_business_content_publish/);
  // The Page-based flavour asks for pages_* scopes; this one must not.
  assert.doesNotMatch(url.searchParams.get("scope") ?? "", /pages_/);
});

test("code exchange posts to api.instagram.com with the required fields", () => {
  const body = new URLSearchParams(
    instagramLoginTokenForm({
      appId: "app",
      appSecret: "secret",
      redirectUri: "https://example.test/cb",
      code: "the-code",
    }),
  );
  assert.equal(body.get("grant_type"), "authorization_code");
  assert.equal(body.get("client_id"), "app");
  assert.equal(body.get("client_secret"), "secret");
  assert.equal(body.get("redirect_uri"), "https://example.test/cb");
  assert.equal(body.get("code"), "the-code");
});

test("long-lived and refresh calls use the instagram exchange grant types", () => {
  const longUrl = new URL(
    instagramLoginLongLivedUrl({ appSecret: "secret", accessToken: "short" }),
  );
  assert.equal(longUrl.origin + longUrl.pathname, "https://graph.instagram.com/access_token");
  assert.equal(longUrl.searchParams.get("grant_type"), "ig_exchange_token");
  assert.equal(longUrl.searchParams.get("access_token"), "short");

  const refreshUrl = new URL(instagramLoginRefreshUrl("long"));
  assert.equal(
    refreshUrl.origin + refreshUrl.pathname,
    "https://graph.instagram.com/refresh_access_token",
  );
  assert.equal(refreshUrl.searchParams.get("grant_type"), "ig_refresh_token");
});

test("publishing URLs are the two-step container flow on graph.instagram.com", () => {
  assert.equal(
    instagramLoginMediaUrl("17841400000000000"),
    "https://graph.instagram.com/v21.0/17841400000000000/media",
  );
  const publish = new URL(instagramLoginPublishUrl("17841400000000000", "container-1", "tok"));
  assert.equal(
    publish.origin + publish.pathname,
    "https://graph.instagram.com/v21.0/17841400000000000/media_publish",
  );
  assert.equal(publish.searchParams.get("creation_id"), "container-1");

  const status = new URL(instagramLoginContainerStatusUrl("container-1", "tok"));
  assert.equal(status.searchParams.get("fields"), "status_code");
});

test("a token response is normalised, and a refusal is reported not thrown", () => {
  const ok = parseInstagramLoginToken(
    { access_token: "tok", user_id: 17841400000000000, expires_in: 3600 },
    1_000,
  );
  assert.equal(ok.ok, true);
  if (ok.ok) {
    assert.equal(ok.accessToken, "tok");
    assert.equal(ok.userId, "17841400000000000");
    assert.equal(ok.expiresAt?.getTime(), 1_000 + 3_600_000);
  }

  const refused = parseInstagramLoginToken({ error_message: "Invalid code" });
  assert.equal(refused.ok, false);
  if (!refused.ok) assert.match(refused.error, /Invalid code/);
});

test("media kind picks REELS only for video", () => {
  assert.equal(instagramContainerKind({ url: "https://x.test/a.jpg" }), "IMAGE");
  assert.equal(instagramContainerKind({ url: "https://x.test/a.mp4" }), "REELS");
  assert.equal(
    instagramContainerKind({ url: "https://x.test/blob", mimeType: "video/mp4" }),
    "REELS",
  );
  assert.equal(
    instagramContainerKind({ url: "https://x.test/blob", mimeType: "image/png" }),
    "IMAGE",
  );
});

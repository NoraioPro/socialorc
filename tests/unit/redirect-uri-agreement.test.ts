/**
 * OAuth redirect URI agreement — readiness reports and adapters must advertise
 * the same callback URL when APP_URL overrides NEXTAUTH_URL.
 */

import assert from "node:assert/strict";
import { test } from "node:test";
import { Platform } from "@prisma/client";
import { appOrigin, platformOAuthCallbackUri } from "../../src/lib/social/approval";
import {
  CONNECTABLE_PLATFORMS,
  connectMethodFor,
  redirectUriFor,
} from "../../src/lib/social/status";
import { facebookAdapter } from "../../src/lib/adapters/facebook";

test("appOrigin prefers APP_URL over NEXTAUTH_URL", () => {
  const env = {
    APP_URL: "https://app.socialorc.com",
    NEXTAUTH_URL: "http://localhost:3000",
  } as unknown as NodeJS.ProcessEnv;
  assert.equal(appOrigin(env), "https://app.socialorc.com");
});

test("readiness redirectUriFor matches platformOAuthCallbackUri for every OAuth platform", () => {
  const env = {
    APP_URL: "https://app.socialorc.com",
    NEXTAUTH_URL: "http://localhost:3000",
  } as unknown as NodeJS.ProcessEnv;
  const origin = appOrigin(env);

  for (const platform of CONNECTABLE_PLATFORMS) {
    if (connectMethodFor(platform) === "bot_token") continue;
    assert.equal(
      redirectUriFor(platform, origin),
      platformOAuthCallbackUri(platform, env),
      `${platform} readiness URI must match adapter callback URI`,
    );
  }
});

test("Facebook OAuth URL embeds the same redirect URI the readiness report shows", () => {
  const env = {
    APP_URL: "https://app.socialorc.com",
    NEXTAUTH_URL: "http://localhost:3999",
  } as unknown as NodeJS.ProcessEnv;
  const expected = platformOAuthCallbackUri(Platform.FACEBOOK, env);

  const previousApp = process.env.APP_URL;
  const previousAuth = process.env.NEXTAUTH_URL;
  process.env.APP_URL = env.APP_URL;
  process.env.NEXTAUTH_URL = env.NEXTAUTH_URL;

  try {
    const url = facebookAdapter.getOAuthUrl("test-state");
    assert.ok(url.includes(encodeURIComponent(expected)), `OAuth URL must contain ${expected}`);
  } finally {
    process.env.APP_URL = previousApp;
    process.env.NEXTAUTH_URL = previousAuth;
  }
});

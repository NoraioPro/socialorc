/**
 * Fast-login gating (Google + Facebook).
 *
 * The property that matters: the buttons and the NextAuth providers are driven by
 * one fact — whether credentials exist — so a deployment can never render a
 * fast-login button whose provider is not registered. Facebook additionally has
 * to accept the connector's env names, because one Meta app serves both sign-in
 * and publishing.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  enabledOAuthProviders,
  facebookCredentials,
  facebookLoginRedirectUri,
  googleCredentials,
  googleLoginRedirectUri,
} from "../../src/lib/auth-providers";

const NONE = {} as NodeJS.ProcessEnv;

test("no credentials means neither provider is offered", () => {
  assert.equal(googleCredentials(NONE), null);
  assert.equal(facebookCredentials(NONE), null);

  const providers = enabledOAuthProviders(NONE);
  assert.deepEqual(providers.map((p) => p.id), ["google", "facebook"]);
  assert.ok(providers.every((p) => !p.configured));
  assert.deepEqual(providers[0].missing, ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]);
  assert.match(providers[1].missing.join(" "), /FACEBOOK_APP_ID/);
});

test("half a pair is unconfigured and names the missing half", () => {
  const onlyGoogleId = { GOOGLE_CLIENT_ID: "123.apps.googleusercontent.com" } as unknown as NodeJS.ProcessEnv;
  assert.deepEqual(
    enabledOAuthProviders(onlyGoogleId).find((p) => p.id === "google")!.missing,
    ["GOOGLE_CLIENT_SECRET"],
  );

  const onlyFacebookAppId = { FACEBOOK_APP_ID: "1480436753949095" } as unknown as NodeJS.ProcessEnv;
  assert.equal(facebookCredentials(onlyFacebookAppId), null);
  assert.match(
    enabledOAuthProviders(onlyFacebookAppId).find((p) => p.id === "facebook")!.missing.join(" "),
    /FACEBOOK_APP_SECRET/,
  );
});

test("full pairs configure both providers", () => {
  const env = {
    GOOGLE_CLIENT_ID: "gid",
    GOOGLE_CLIENT_SECRET: "gsecret",
    FACEBOOK_APP_ID: "1480436753949095",
    FACEBOOK_APP_SECRET: "fsecret",
  } as unknown as NodeJS.ProcessEnv;

  assert.deepEqual(googleCredentials(env), { clientId: "gid", clientSecret: "gsecret" });
  assert.deepEqual(facebookCredentials(env), {
    clientId: "1480436753949095",
    clientSecret: "fsecret",
  });
  assert.ok(enabledOAuthProviders(env).every((p) => p.configured));
});

test("Facebook login reuses the connector's Meta app credentials", () => {
  // One app, two flows: sign-in and publishing must not need separate apps.
  const env = { FACEBOOK_APP_ID: "app-id", FACEBOOK_APP_SECRET: "app-secret" } as unknown as NodeJS.ProcessEnv;
  assert.deepEqual(facebookCredentials(env), { clientId: "app-id", clientSecret: "app-secret" });
});

test("NextAuth-style aliases work for both providers", () => {
  const env = {
    AUTH_GOOGLE_ID: "g",
    AUTH_GOOGLE_SECRET: "gs",
    FACEBOOK_CLIENT_ID: "f",
    FACEBOOK_CLIENT_SECRET: "fs",
  } as unknown as NodeJS.ProcessEnv;

  assert.ok(enabledOAuthProviders(env).every((p) => p.configured));
});

test("only variable NAMES are reported, never values", () => {
  const env = {
    FACEBOOK_APP_ID: "1480436753949095",
    FACEBOOK_APP_SECRET: "super-secret-value",
    GOOGLE_CLIENT_ID: "gid",
  } as unknown as NodeJS.ProcessEnv;

  const serialized = JSON.stringify(enabledOAuthProviders(env));
  assert.ok(!serialized.includes("super-secret-value"));
  for (const provider of enabledOAuthProviders(env)) {
    for (const name of provider.missing) assert.match(name, /^[A-Z][A-Z0-9_]*(\s.*)?$/);
  }
});

test("each provider has its own NextAuth callback URI", () => {
  assert.equal(
    googleLoginRedirectUri("https://app.socialorc.com"),
    "https://app.socialorc.com/api/auth/callback/google",
  );
  assert.equal(
    facebookLoginRedirectUri("https://app.socialorc.com"),
    "https://app.socialorc.com/api/auth/callback/facebook",
  );
  // Trailing slash tolerated, and the two never collide.
  assert.equal(
    facebookLoginRedirectUri("http://127.0.0.1:3001/"),
    "http://127.0.0.1:3001/api/auth/callback/facebook",
  );
  assert.notEqual(googleLoginRedirectUri("http://x"), facebookLoginRedirectUri("http://x"));
});

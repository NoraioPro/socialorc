/**
 * Google sign-in gating.
 *
 * The property that matters: the "Continue with Google" button and the NextAuth
 * provider are driven by the same fact — whether credentials exist — so a
 * deployment can never show a fast-login button whose provider is not registered.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  enabledOAuthProviders,
  googleCredentials,
  googleLoginRedirectUri,
} from "../../src/lib/auth-providers";

const NONE = {} as NodeJS.ProcessEnv;

test("no credentials means no Google provider", () => {
  assert.equal(googleCredentials(NONE), null);

  const providers = enabledOAuthProviders(NONE);
  const google = providers.find((p) => p.id === "google")!;
  assert.equal(google.configured, false);
  assert.deepEqual(google.missing, ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET"]);
});

test("half a credential pair is still unconfigured, and the missing half is named", () => {
  const onlyId = { GOOGLE_CLIENT_ID: "123.apps.googleusercontent.com" } as unknown as NodeJS.ProcessEnv;
  assert.equal(googleCredentials(onlyId), null);
  assert.deepEqual(
    enabledOAuthProviders(onlyId).find((p) => p.id === "google")!.missing,
    ["GOOGLE_CLIENT_SECRET"],
  );

  const onlySecret = { GOOGLE_CLIENT_SECRET: "shh" } as unknown as NodeJS.ProcessEnv;
  assert.deepEqual(
    enabledOAuthProviders(onlySecret).find((p) => p.id === "google")!.missing,
    ["GOOGLE_CLIENT_ID"],
  );
});

test("a full pair configures Google", () => {
  const env = {
    GOOGLE_CLIENT_ID: "123.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "secret",
  } as unknown as NodeJS.ProcessEnv;

  assert.deepEqual(googleCredentials(env), {
    clientId: "123.apps.googleusercontent.com",
    clientSecret: "secret",
  });
  assert.equal(enabledOAuthProviders(env).find((p) => p.id === "google")!.configured, true);
});

test("Auth.js-style variable names also configure Google", () => {
  const env = { AUTH_GOOGLE_ID: "id", AUTH_GOOGLE_SECRET: "secret" } as unknown as NodeJS.ProcessEnv;
  assert.equal(enabledOAuthProviders(env).find((p) => p.id === "google")!.configured, true);
});

test("only variable NAMES are reported, never values", () => {
  const env = { GOOGLE_CLIENT_SECRET: "super-secret-value" } as unknown as NodeJS.ProcessEnv;
  const serialized = JSON.stringify(enabledOAuthProviders(env));
  assert.ok(!serialized.includes("super-secret-value"));
  for (const provider of enabledOAuthProviders(env)) {
    for (const name of provider.missing) assert.match(name, /^[A-Z][A-Z0-9_]*$/);
  }
});

test("the redirect URI is the NextAuth callback, and tolerates a trailing slash", () => {
  assert.equal(
    googleLoginRedirectUri("https://app.socialorc.com"),
    "https://app.socialorc.com/api/auth/callback/google",
  );
  assert.equal(
    googleLoginRedirectUri("http://127.0.0.1:3001/"),
    "http://127.0.0.1:3001/api/auth/callback/google",
  );
});

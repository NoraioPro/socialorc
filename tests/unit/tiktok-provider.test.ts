/**
 * TikTok provider + social-layer unit tests.
 *
 * Everything here is offline: no network, no database. The point is to make the
 * security-critical and decision-critical parts of the connector provable —
 * PKCE verifier handling, the authorization URL (what must NOT be in it),
 * capability honesty, chunk planning, error classification and media checks.
 */

import test from "node:test";
import assert from "node:assert/strict";

import { codeChallengeFor, generateCodeVerifier, generateState, safeEqual } from "../../src/lib/social/pkce";
import { planTikTokChunks, validateMediaForPlatform } from "../../src/lib/social/media";
import {
  capabilitiesFor,
  deriveConnectionStatus,
  parseScopes,
} from "../../src/lib/social/capabilities";
import { classifyTikTokError, SocialError, httpStatusFor, toSocialError } from "../../src/lib/social/errors";
import { appApprovalFor, tiktokCredentials, tiktokRedirectUri } from "../../src/lib/social/approval";
import { verifierFromStateCookie } from "../../src/lib/oauth/state";
import { TikTokAdapter } from "../../src/lib/adapters/tiktok";
import { TIKTOK_SCOPES } from "../../src/lib/social/tiktok/constants";

/* ------------------------------------------------------------------ PKCE */

test("PKCE verifier is long, uses the RFC 7636 charset and is unguessable", () => {
  const verifier = generateCodeVerifier();
  assert.ok(verifier.length >= 43 && verifier.length <= 128, "length within RFC bounds");
  assert.match(verifier, /^[A-Za-z0-9\-._~]+$/);

  const many = new Set(Array.from({ length: 50 }, () => generateCodeVerifier()));
  assert.equal(many.size, 50, "50 verifiers must all differ");
});

test("PKCE S256 challenge matches the RFC 7636 test vector", () => {
  // RFC 7636 appendix B.
  const verifier = "dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk";
  assert.equal(codeChallengeFor(verifier, "S256"), "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
});

test("`plain` challenge is the verifier itself, and only on request", () => {
  const verifier = generateCodeVerifier();
  assert.equal(codeChallengeFor(verifier, "plain"), verifier);
  assert.notEqual(codeChallengeFor(verifier), verifier);
});

test("state values are high entropy and safeEqual compares honestly", () => {
  const states = new Set(Array.from({ length: 50 }, () => generateState()));
  assert.equal(states.size, 50);
  assert.equal(safeEqual("abc", "abc"), true);
  assert.equal(safeEqual("abc", "abd"), false);
  assert.equal(safeEqual("abc", "abcd"), false);
});

/* ------------------------------------------------- authorization URL safety */

function withTikTokEnv<T>(fn: () => T): T {
  const saved = { ...process.env };
  process.env.TIKTOK_CLIENT_KEY = "test-client-key";
  process.env.TIKTOK_CLIENT_SECRET = "test-client-secret";
  process.env.TIKTOK_REDIRECT_URI = "https://app.socialorc.test/api/social/tiktok/callback";
  delete process.env.TIKTOK_PKCE_METHOD;
  try {
    return fn();
  } finally {
    process.env = saved;
  }
}

test("authorization request carries the challenge and NEVER the verifier", () => {
  withTikTokEnv(() => {
    const adapter = new TikTokAdapter();
    const request = adapter.createAuthorizationRequest("state123");
    const url = new URL(request.url);

    assert.equal(url.origin + url.pathname, "https://www.tiktok.com/v2/auth/authorize/");
    assert.equal(url.searchParams.get("client_key"), "test-client-key");
    assert.equal(url.searchParams.get("response_type"), "code");
    assert.equal(url.searchParams.get("state"), "state123");
    assert.equal(url.searchParams.get("code_challenge_method"), "S256");
    assert.equal(
      url.searchParams.get("code_challenge"),
      codeChallengeFor(request.verifier, "S256"),
    );

    // The verifier is the secret half of PKCE: it must not appear anywhere in
    // the URL the browser is about to visit.
    assert.equal(request.url.includes(request.verifier), false);
    assert.equal(url.searchParams.has("code_verifier"), false);
    assert.equal(request.url.includes("test-client-secret"), false);

    const scopes = (url.searchParams.get("scope") ?? "").split(",");
    assert.deepEqual(scopes, [
      TIKTOK_SCOPES.basic,
      TIKTOK_SCOPES.profile,
      TIKTOK_SCOPES.upload,
      TIKTOK_SCOPES.publish,
    ]);
  });
});

test("the client secret is never part of an authorization URL, only the token call", () => {
  withTikTokEnv(() => {
    const adapter = new TikTokAdapter();
    const { url } = adapter.createAuthorizationRequest("s");
    assert.equal(url.includes("client_secret"), false);
  });
});

test("a missing client key is reported as a provider problem, not a broken URL", () => {
  const saved = { ...process.env };
  delete process.env.TIKTOK_CLIENT_KEY;
  delete process.env.TIKTOK_CLIENT_SECRET;
  try {
    const adapter = new TikTokAdapter();
    const validation = adapter.validateCredentials();
    assert.equal(validation.valid, false);
    assert.deepEqual(validation.missing, ["TIKTOK_CLIENT_KEY", "TIKTOK_CLIENT_SECRET"]);

    assert.throws(
      () => adapter.createAuthorizationRequest("state"),
      (error: unknown) =>
        error instanceof SocialError && error.code === "SOCIAL_PROVIDER_UNAVAILABLE",
    );
  } finally {
    process.env = saved;
  }
});

test("redirect URI prefers the explicit env var and falls back to APP_URL", () => {
  assert.equal(
    tiktokRedirectUri({ TIKTOK_REDIRECT_URI: "https://x.test/cb" } as unknown as NodeJS.ProcessEnv),
    "https://x.test/cb",
  );
  assert.equal(
    tiktokRedirectUri({ APP_URL: "https://dev.socialorc.test" } as unknown as NodeJS.ProcessEnv),
    "https://dev.socialorc.test/api/social/tiktok/callback",
  );
  assert.equal(
    tiktokCredentials({} as unknown as NodeJS.ProcessEnv).configured,
    false,
    "no credentials configured must not look configured",
  );
});

/* ----------------------------------------------------- state cookie + PKCE */

test("the state cookie is the only place the PKCE verifier lives", () => {
  const cookie = JSON.stringify({
    userId: "user_1",
    platform: "TIKTOK",
    timestamp: 1_700_000_000_000,
    verifier: "stored-verifier",
  });
  assert.equal(verifierFromStateCookie(cookie), "stored-verifier");
  assert.equal(verifierFromStateCookie(undefined), null);
  assert.equal(verifierFromStateCookie("not json"), null);
  assert.equal(
    verifierFromStateCookie(JSON.stringify({ userId: "u", platform: "TIKTOK", timestamp: 1 })),
    null,
  );
});

/* ------------------------------------------------------------- capabilities */

test("TikTok capabilities follow granted scopes and app approval", () => {
  const allScopes = parseScopes(
    `${TIKTOK_SCOPES.basic} ${TIKTOK_SCOPES.profile} ${TIKTOK_SCOPES.upload} ${TIKTOK_SCOPES.publish}`,
  );

  const unaudited = capabilitiesFor("TIKTOK", {
    scopes: allScopes,
    approval: { directPublish: false, draftUpload: true },
  });
  assert.equal(unaudited.capabilities.draftUpload, true);
  assert.equal(
    unaudited.capabilities.directPublish,
    false,
    "video.publish without TikTok's audit must not advertise direct publishing",
  );
  assert.ok(
    unaudited.limitations.some((l) => l.code === "APP_REVIEW_REQUIRED"),
    "the reason must be reported, not just the false",
  );

  const audited = capabilitiesFor("TIKTOK", {
    scopes: allScopes,
    approval: { directPublish: true, draftUpload: true },
  });
  assert.equal(audited.capabilities.directPublish, true);
  assert.equal(audited.capabilities.video, true);
  assert.equal(audited.capabilities.shortVideo, true);
  assert.equal(audited.capabilities.text, false);
  assert.equal(audited.capabilities.image, false);
  assert.equal(audited.capabilities.carousel, false);
  assert.equal(audited.capabilities.scheduling, true, "SocialOrc schedules through its own queue");
  assert.ok(
    audited.limitations.some((l) => l.capability === "image" && l.code === "NOT_IMPLEMENTED_YET"),
  );
});

test("a connection without video.upload cannot claim draft upload", () => {
  const report = capabilitiesFor("TIKTOK", {
    scopes: parseScopes(TIKTOK_SCOPES.basic),
    approval: { directPublish: true, draftUpload: true },
  });
  assert.equal(report.capabilities.draftUpload, false);
  assert.equal(report.capabilities.directPublish, false);
  assert.ok(report.limitations.some((l) => l.code === "SCOPE_NOT_GRANTED"));
});

test("nothing is advertised for platforms that have no provider yet", () => {
  const report = capabilitiesFor("INSTAGRAM", {
    scopes: [],
    approval: { directPublish: true, draftUpload: true },
  });
  assert.equal(report.capabilities.directPublish, false);
  assert.equal(report.capabilities.video, false);
});

test("connection status separates connected from permitted and from expired", () => {
  const base = { isActive: true, platform: "TIKTOK" as const, scopes: [] as string[] };
  const future = new Date(Date.now() + 60_000);
  const past = new Date(Date.now() - 60_000);

  assert.equal(deriveConnectionStatus({ ...base, hasRefreshToken: true, tokenExpiresAt: future }), "connected");
  assert.equal(deriveConnectionStatus({ ...base, isActive: false, hasRefreshToken: true }), "disconnected");
  assert.equal(
    deriveConnectionStatus({ ...base, hasRefreshToken: true, needsReconnect: true, tokenExpiresAt: future }),
    "refresh_required",
  );
  assert.equal(
    deriveConnectionStatus({ ...base, hasRefreshToken: true, tokenExpiresAt: past }),
    "refresh_required",
    "expired access token + refresh token means refresh, not re-auth",
  );
  assert.equal(
    deriveConnectionStatus({ ...base, hasRefreshToken: false, tokenExpiresAt: past }),
    "expired",
  );
  assert.equal(
    deriveConnectionStatus({
      ...base,
      hasRefreshToken: true,
      tokenExpiresAt: future,
      scopes: parseScopes(TIKTOK_SCOPES.basic),
      requiredScopes: [TIKTOK_SCOPES.publish],
    }),
    "permission_missing",
    "connected but missing the scope an action needs",
  );
});

/* ------------------------------------------------------------ chunk planning */

test("TikTok chunk plan follows the media transfer guide", () => {
  const MB = 1024 * 1024;

  const small = planTikTokChunks(4 * MB);
  assert.deepEqual(small, { ok: true, plan: { chunkSize: 4 * MB, totalChunkCount: 1 } });

  const atLimit = planTikTokChunks(64 * MB);
  assert.deepEqual(atLimit, { ok: true, plan: { chunkSize: 64 * MB, totalChunkCount: 1 } });

  const big = planTikTokChunks(100 * MB);
  assert.ok(big.ok && big.plan.totalChunkCount === 2 && big.plan.chunkSize === 64 * MB);

  const uneven = planTikTokChunks(130 * MB);
  assert.ok(uneven.ok && uneven.plan.totalChunkCount === 3, "last chunk may be smaller");

  assert.equal(planTikTokChunks(0).ok, false);
  assert.equal(planTikTokChunks(-1).ok, false);
  assert.equal(planTikTokChunks(Number.NaN).ok, false);

  // 1000 chunks x 64 MB is the ceiling; a file needing more cannot be uploaded.
  const tooBig = planTikTokChunks(1000 * 64 * MB + 1);
  assert.equal(tooBig.ok, false);
  assert.match(tooBig.ok === false ? tooBig.reason : "", /limit/);
});

/* --------------------------------------------------------- media validation */

test("media validation names the field that is wrong", () => {
  const wrongType = validateMediaForPlatform({
    platform: "TIKTOK",
    media: { mimeType: "image/png", sizeBytes: 1024 },
  });
  assert.equal(wrongType.valid, false);
  assert.equal(wrongType.issues[0].field, "mimeType");

  const tooLong = validateMediaForPlatform({
    platform: "TIKTOK",
    media: { mimeType: "video/mp4", sizeBytes: 5 * 1024 * 1024, durationSec: 600, maxDurationSec: 300 },
  });
  assert.equal(tooLong.valid, false);
  assert.equal(tooLong.issues[0].field, "videoDuration");

  const pullFromUrl = validateMediaForPlatform({
    platform: "TIKTOK",
    media: { mimeType: "video/mp4", sizeBytes: 5 * 1024 * 1024 },
    transfer: "pull_from_url",
  });
  assert.equal(pullFromUrl.valid, false);
  assert.match(pullFromUrl.issues[0].message, /verified ownership/);

  const fine = validateMediaForPlatform({
    platform: "TIKTOK",
    media: { mimeType: "video/mp4", sizeBytes: 100 * 1024 * 1024, durationSec: 120, maxDurationSec: 300 },
  });
  assert.equal(fine.valid, true);
  assert.ok(fine.notes.some((n) => /chunks/.test(n)), "chunking is reported as a note, not an error");

  const unknownDuration = validateMediaForPlatform({
    platform: "TIKTOK",
    media: { mimeType: "video/mp4", sizeBytes: 1024 },
  });
  assert.ok(unknownDuration.notes.some((n) => /duration/i.test(n)));
});

/* ------------------------------------------------------ error normalization */

test("TikTok error codes map onto the documented social errors", () => {
  const cases: Array<[unknown, string]> = [
    [{ error: { code: "access_token_invalid" } }, "SOCIAL_AUTH_EXPIRED"],
    [{ error: { code: "scope_not_authorized" } }, "SOCIAL_PERMISSION_REQUIRED"],
    [
      { error: { code: "unaudited_client_can_only_post_to_private_accounts" } },
      "SOCIAL_APP_REVIEW_REQUIRED",
    ],
    [{ error: { code: "url_ownership_unverified" } }, "SOCIAL_MEDIA_INVALID"],
    [{ error: { code: "rate_limit_exceeded" } }, "SOCIAL_RATE_LIMITED"],
    [{ error: { code: "duration_check_failed" } }, "SOCIAL_MEDIA_INVALID"],
    [{ error: { code: "something_new" } }, "SOCIAL_PUBLISH_FAILED"],
  ];

  for (const [raw, expected] of cases) {
    const error = classifyTikTokError(raw, "publish");
    assert.equal(error.code, expected, JSON.stringify(raw));
    assert.equal(error.platform, "tiktok");
  }
});

test("a SocialError response never leaks the technical detail", () => {
  const error = new SocialError({
    code: "SOCIAL_PUBLISH_FAILED",
    platform: "tiktok",
    message: "TikTok rejected the request.",
    technical: { access_token: "super-secret-token", client_secret: "shh" },
  });

  const body = JSON.stringify(error.toResponse());
  assert.equal(body.includes("super-secret-token"), false);
  assert.equal(body.includes("shh"), false);
  assert.deepEqual(error.toResponse(), {
    success: false,
    error: {
      code: "SOCIAL_PUBLISH_FAILED",
      platform: "tiktok",
      message: "TikTok rejected the request.",
      action: "RETRY",
    },
  });
});

test("httpStatusFor maps codes to statuses the frontend can rely on", () => {
  assert.equal(httpStatusFor("SOCIAL_ACCOUNT_NOT_FOUND"), 404);
  assert.equal(httpStatusFor("SOCIAL_PERMISSION_REQUIRED"), 403);
  assert.equal(httpStatusFor("SOCIAL_RATE_LIMITED"), 429);
  assert.equal(httpStatusFor("SOCIAL_MEDIA_INVALID"), 422);
  assert.equal(httpStatusFor("SOCIAL_PROVIDER_UNAVAILABLE"), 503);
});

test("toSocialError keeps a SocialError and wraps anything else", () => {
  const original = new SocialError({ code: "SOCIAL_AUTH_FAILED", message: "nope" });
  assert.equal(toSocialError(original, "SOCIAL_PUBLISH_FAILED"), original);

  const wrapped = toSocialError(new Error("socket hang up"), "SOCIAL_PROVIDER_UNAVAILABLE", "tiktok");
  assert.equal(wrapped.code, "SOCIAL_PROVIDER_UNAVAILABLE");
  assert.equal(wrapped.platform, "tiktok");
});

/* ---------------------------------------------- app approval configuration */

test("approval flags default to false — an optimistic default breaks publishing", () => {
  assert.deepEqual(appApprovalFor("TIKTOK", {} as unknown as NodeJS.ProcessEnv), {
    directPublish: false,
    draftUpload: false,
  });
  assert.deepEqual(
    appApprovalFor("TIKTOK", {
      TIKTOK_DIRECT_POST_APPROVED: "true",
      TIKTOK_UPLOAD_APPROVED: "true",
    } as unknown as NodeJS.ProcessEnv),
    { directPublish: true, draftUpload: true },
  );
  assert.equal(
    appApprovalFor("TIKTOK", { TIKTOK_DIRECT_POST_APPROVED: "yes" } as unknown as NodeJS.ProcessEnv).directPublish,
    false,
    "only the literal \"true\" counts",
  );
});

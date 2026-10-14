import { test } from "node:test";
import assert from "node:assert/strict";
import { facebookAdapter } from "../../src/lib/adapters/facebook";
import { instagramAdapter } from "../../src/lib/adapters/instagram";
import { encodeMetaPageCredential, parseMetaCredential } from "../../src/lib/adapters/meta-credential";
import {
  classifyAdapterError,
  classifyGraphError,
  formatGraphError,
  isRetryable,
  requiresReconnect,
} from "../../src/lib/adapters/errors";
import {
  encodePendingConnection,
  readPendingConnection,
} from "../../src/lib/oauth/pending-connection";
import { PLATFORM_CONFIGS } from "../../src/types/platform";
import { getTokenStatus } from "../../src/lib/adapters/tokens";

/**
 * Facebook / Instagram connections: long-lived token exchange, Page tokens that
 * do not expire, Page selection, and Graph errors that raise the reconnect
 * banner exactly when a human has to act. Every platform call is stubbed.
 */

const realFetch = globalThis.fetch;

type Seen = { url: string; method: string; form: Record<string, string> | null };

function stub(handler: (url: string, init?: RequestInit) => Response | undefined): Seen[] {
  const seen: Seen[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    seen.push({
      url,
      method: init?.method ?? "GET",
      form: init?.body instanceof URLSearchParams ? Object.fromEntries(init.body) : null,
    });
    return handler(url, init) ?? new Response(`unexpected ${url}`, { status: 500 });
  }) as typeof fetch;
  return seen;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const TWO_PAGES = {
  data: [
    { id: "p1", name: "Bakery", access_token: "page-token-1", tasks: ["CREATE_CONTENT", "MODERATE"] },
    { id: "p2", name: "Cafe", access_token: "page-token-2", tasks: ["MANAGE"] },
    // Analyst-only Page: connecting it would fail every post, so it is not offered.
    { id: "p3", name: "Stats only", access_token: "page-token-3", tasks: ["ANALYZE"] },
  ],
};

/* ------------------------------------------------------------ token exchange */

test("the code is exchanged for a LONG-LIVED user token, with its expiry", async () => {
  const seen = stub((url, init) => {
    if (init?.method === "POST" && url.includes("/oauth/access_token")) return json({ access_token: "short" });
    if (url.includes("grant_type=fb_exchange_token")) {
      return json({ access_token: "long", token_type: "bearer", expires_in: 5183944 });
    }
    return undefined;
  });
  try {
    const before = Date.now();
    const tokens = await facebookAdapter.exchangeCodeForTokens("code-1");
    assert.equal(tokens.accessToken, "long");
    assert.equal(tokens.refreshToken, null);
    const ms = tokens.expiresAt!.getTime() - before;
    assert.ok(ms > 59 * 86400_000 && ms < 61 * 86400_000, "about 60 days");
    const exchange = seen.find((s) => s.url.includes("fb_exchange_token="));
    assert.match(exchange!.url, /fb_exchange_token=short/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a failed long-lived exchange fails the connect instead of storing a 1-hour token", async () => {
  stub((url, init) => {
    if (init?.method === "POST") return json({ access_token: "short" });
    if (url.includes("fb_exchange_token")) {
      return json({ error: { message: "Invalid client secret", type: "OAuthException", code: 1 } }, 400);
    }
    return undefined;
  });
  try {
    await assert.rejects(instagramAdapter.exchangeCodeForTokens("code-1"), /long-lived/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("Meta tokens are declared non-refreshable and refreshing throws", async () => {
  assert.equal(PLATFORM_CONFIGS.FACEBOOK.capabilities.refreshableTokens, false);
  assert.equal(PLATFORM_CONFIGS.INSTAGRAM.capabilities.refreshableTokens, false);
  await assert.rejects(facebookAdapter.refreshAccessToken(), /reconnect/);
});

/* ------------------------------------------------------------ Page selection */

test("Facebook lists only Pages the grant can publish to", async () => {
  stub((url) => (url.includes("/me/accounts") ? json(TWO_PAGES) : undefined));
  try {
    const targets = await facebookAdapter.listConnectTargets("long");
    assert.deepEqual(
      targets.map((t) => t.id),
      ["p1", "p2"],
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("connecting a chosen Page stores ITS token with no expiry, and the Page as the account", async () => {
  stub((url) => (url.includes("/me/accounts") ? json(TWO_PAGES) : undefined));
  try {
    const { tokens, info } = await facebookAdapter.connectTarget("long", "p2");
    assert.equal(tokens.expiresAt, null, "Page tokens from a long-lived user token do not expire");
    assert.equal(info.platformUserId, "p2");
    assert.equal(info.displayName, "Cafe");
    const credential = parseMetaCredential(tokens.accessToken);
    assert.deepEqual(credential, { kind: "page", token: "page-token-2", pageId: "p2" });
    // No token in metadata — the credential lives encrypted in accessToken.
    assert.equal(JSON.stringify(info.metadata).includes("page-token"), false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a Page id the grant does not manage is refused (the id comes from the browser)", async () => {
  stub((url) => (url.includes("/me/accounts") ? json(TWO_PAGES) : undefined));
  try {
    await assert.rejects(facebookAdapter.connectTarget("long", "someone-elses-page"), /not one this login/);
    await assert.rejects(facebookAdapter.connectTarget("long", "p3"), /not one this login/);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("Instagram targets are the professional accounts linked to managed Pages", async () => {
  stub((url) =>
    url.includes("/me/accounts")
      ? json({
          data: [
            { id: "p1", name: "Bakery", access_token: "t1", instagram_business_account: { id: "ig1", username: "bakery" } },
            { id: "p2", name: "No IG", access_token: "t2" },
            { id: "p3", name: "Cafe", access_token: "t3", instagram_business_account: { id: "ig3", username: "cafe", name: "Cafe" } },
          ],
        })
      : undefined,
  );
  try {
    const targets = await instagramAdapter.listConnectTargets("long");
    assert.deepEqual(targets.map((t) => t.id), ["ig1", "ig3"]);
    assert.match(targets[1].detail ?? "", /Cafe/);

    const { tokens, info } = await instagramAdapter.connectTarget("long", "ig3");
    assert.deepEqual(parseMetaCredential(tokens.accessToken), {
      kind: "page",
      token: "t3",
      pageId: "p3",
      igUserId: "ig3",
    });
    assert.equal(tokens.expiresAt, null);
    assert.equal(info.platformUserId, "ig3");
    assert.equal(info.platformUsername, "cafe");
    assert.equal(info.metadata?.externalParentId, "p3");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a stored Page credential publishes to its own Page — no /me/accounts lookup", async () => {
  const seen = stub((url) => (url.includes("/p2/feed") ? json({ id: "p2_1" }) : undefined));
  try {
    const credential = encodeMetaPageCredential({ token: "page-token-2", pageId: "p2" });
    const result = await facebookAdapter.createPost(credential, { text: "Hello" });
    assert.equal(result.success, true, result.error);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].form?.access_token, "page-token-2");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("a legacy bare user token still publishes through the first Page", async () => {
  stub((url) => {
    if (url.includes("/me/accounts")) return json(TWO_PAGES);
    if (url.includes("/p1/feed")) return json({ id: "p1_1" });
    return undefined;
  });
  try {
    const result = await facebookAdapter.createPost("legacy-user-token", { text: "Hello" });
    assert.equal(result.success, true, result.error);
  } finally {
    globalThis.fetch = realFetch;
  }
});

/* --------------------------------------------------------- reconnect signals */

test("Graph token errors raise the reconnect banner; throttling and content do not", () => {
  // 190/463 = expired, 190/460 = password changed, 190/492 = lost Page role.
  assert.equal(classifyGraphError(190, 463), "AUTH_EXPIRED");
  assert.equal(classifyGraphError(190, 460), "AUTH_INVALID");
  assert.equal(classifyGraphError(190, 492), "AUTH_INVALID");
  assert.equal(classifyGraphError(102), "AUTH_INVALID");
  for (const code of [190, 102, 10, 200, 299]) {
    assert.equal(requiresReconnect(classifyGraphError(code)), true, `graph ${code}`);
  }
  for (const code of [4, 17, 32, 613, 1, 2, 506, 100]) {
    assert.equal(requiresReconnect(classifyGraphError(code)), false, `graph ${code}`);
  }
  assert.equal(isRetryable(classifyGraphError(4)), true);
  assert.equal(classifyGraphError(9007), "MEDIA_PROCESSING");
});

test("a Graph failure classifies the same from the tagged message alone", async () => {
  // The engagement API and the worker fallback only see the message.
  const formatted = formatGraphError(
    { error: { message: "Error validating access token: Session has expired", type: "OAuthException", code: 190, error_subcode: 463 } },
    "fallback",
  );
  assert.equal(formatted.code, "AUTH_EXPIRED");
  assert.equal(classifyAdapterError({ message: formatted.message }), "AUTH_EXPIRED");

  stub(() =>
    json({ error: { message: "The session has been invalidated because the user changed their password.", code: 190, error_subcode: 460 } }, 400),
  );
  try {
    const credential = encodeMetaPageCredential({ token: "t", pageId: "p1" });
    const result = await facebookAdapter.createPost(credential, { text: "Hello" });
    assert.equal(result.success, false);
    assert.equal(result.code, "AUTH_INVALID");
    assert.equal(requiresReconnect(result.code as never), true);

    const comment = await facebookAdapter.createComment(credential, { platformPostId: "p1_1", text: "hi" });
    assert.equal(classifyAdapterError({ message: comment.error }), "AUTH_INVALID");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("untagged Meta token wording is still recognised", () => {
  assert.equal(
    classifyAdapterError({ message: "Error validating access token: Session has expired on Tuesday" }),
    "AUTH_EXPIRED",
  );
  assert.equal(
    classifyAdapterError({ message: "Error validating access token: The user has not authorized application" }),
    "AUTH_INVALID",
  );
});

test("a Page connection never shows as expiring; a legacy 60-day token does, and needs a reconnect", () => {
  const now = new Date("2026-10-14T00:00:00Z");
  const page = getTokenStatus(null, false, PLATFORM_CONFIGS.FACEBOOK.capabilities.refreshableTokens, false, now);
  assert.equal(page.status, "no_expiry");
  assert.equal(page.requiresReconnect, false);

  const legacy = getTokenStatus(
    new Date(now.getTime() + 3600_000),
    false,
    PLATFORM_CONFIGS.FACEBOOK.capabilities.refreshableTokens,
    false,
    now,
  );
  assert.equal(legacy.status, "expiring_urgent");
  assert.equal(legacy.requiresReconnect, true);
});

/* ------------------------------------------------------------ pending cookie */

const SECRET = "test-secret";

test("the pending grant cookie is signed, user/platform bound, and never holds a plaintext token", () => {
  const raw = encodePendingConnection(
    { userId: "u1", platform: "FACEBOOK", brainId: "b1", userToken: "EAAB-secret-user-token", timestamp: Date.now() },
    SECRET,
  );
  const decoded = Buffer.from(raw.slice(raw.indexOf(".") + 1), "base64url").toString("utf8");
  assert.equal(decoded.includes("EAAB-secret-user-token"), false, "token must be encrypted in the cookie");

  const ok = readPendingConnection(raw, { userId: "u1", platform: "FACEBOOK", secret: SECRET });
  assert.ok(ok.ok);
  assert.equal(ok.ok && ok.data.userToken, "EAAB-secret-user-token");

  assert.deepEqual(readPendingConnection(raw, { userId: "u2", platform: "FACEBOOK", secret: SECRET }), {
    ok: false,
    reason: "user_mismatch",
  });
  assert.deepEqual(readPendingConnection(raw, { userId: "u1", platform: "INSTAGRAM", secret: SECRET }), {
    ok: false,
    reason: "platform_mismatch",
  });
  assert.deepEqual(readPendingConnection(raw, { userId: "u1", platform: "FACEBOOK", secret: "other" }), {
    ok: false,
    reason: "malformed",
  });
  assert.deepEqual(
    readPendingConnection(raw, {
      userId: "u1",
      platform: "FACEBOOK",
      secret: SECRET,
      now: new Date(Date.now() + 11 * 60_000),
    }),
    { ok: false, reason: "expired" },
  );
  assert.deepEqual(readPendingConnection(undefined, { userId: "u1", platform: "FACEBOOK", secret: SECRET }), {
    ok: false,
    reason: "missing",
  });
});

test("an edited pending cookie is rejected", () => {
  const raw = encodePendingConnection(
    { userId: "u1", platform: "FACEBOOK", brainId: "b1", userToken: "tok", timestamp: Date.now() },
    SECRET,
  );
  const [sig, body] = raw.split(".");
  const edited = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
  edited.userId = "attacker";
  const forged = `${sig}.${Buffer.from(JSON.stringify(edited)).toString("base64url")}`;
  assert.deepEqual(readPendingConnection(forged, { userId: "attacker", platform: "FACEBOOK", secret: SECRET }), {
    ok: false,
    reason: "malformed",
  });
});

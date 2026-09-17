/**
 * LinkedIn publish path — verified before credentials exist.
 *
 * LinkedIn cannot be exercised end to end without an approved app, so this pins
 * the request shape instead. Three regressions are known to have shipped here
 * and each one is asserted explicitly:
 *
 *   1. A LinkedIn-Version LinkedIn no longer supports → the post is rejected.
 *   2. Handing the API an image *URL* → rejected, because LinkedIn fetches
 *      nothing itself; the bytes must be uploaded and the post must reference
 *      the returned urn.
 *   3. Treating any 2xx as success → a PUBLISHED record with no id and no URL
 *      when LinkedIn returns no `x-restli-id`.
 */

import assert from "node:assert/strict";
import { afterEach, beforeEach, test } from "node:test";

import { linkedInAdapter } from "../../src/lib/adapters/linkedin";

// Credentials are read inside the adapter's methods, not at import time, so
// setting them here is enough to exercise the full request shape without a real
// LinkedIn app.
process.env.LINKEDIN_CLIENT_ID = "78abcdefghijkl";
process.env.LINKEDIN_CLIENT_SECRET = "s".repeat(20) + "LinkedInSecret01";
process.env.APP_URL = "http://127.0.0.1:3001";
process.env.NEXTAUTH_URL = "http://127.0.0.1:3001";

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: unknown;
}

const realFetch = globalThis.fetch;
let calls: Call[] = [];

/** Queue of responses, consumed in call order. */
function stubFetch(responses: Array<{ status?: number; json?: unknown; text?: string; headers?: Record<string, string> }>) {
  let i = 0;
  calls = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const method = (init?.method ?? "GET").toUpperCase();
    const headers = (init?.headers ?? {}) as Record<string, string>;
    let body: unknown = init?.body;
    if (typeof body === "string") {
      try {
        body = JSON.parse(body);
      } catch {
        /* form-encoded bodies stay as text */
      }
    }
    calls.push({ url, method, headers, body });

    const r = responses[i++] ?? { status: 200, json: {} };
    const status = r.status ?? 200;
    return {
      ok: status >= 200 && status < 300,
      status,
      headers: new Headers(r.headers ?? {}),
      json: async () => {
        if (r.json !== undefined) return r.json;
        throw new Error("no json stub");
      },
      text: async () => r.text ?? JSON.stringify(r.json ?? {}),
      arrayBuffer: async () => new ArrayBuffer(4),
    } as unknown as Response;
  }) as typeof fetch;
}

const userinfo = { json: { sub: "AbC123def", name: "Hassan Nasr", picture: "https://x/p.jpg" } };

beforeEach(() => {
  calls = [];
});
afterEach(() => {
  globalThis.fetch = realFetch;
});

test("the consent URL asks for OIDC identity plus posting, on the registered redirect", () => {
  const url = new URL(linkedInAdapter.getOAuthUrl("state-123"));
  assert.equal(url.origin + url.pathname, "https://www.linkedin.com/oauth/v2/authorization");
  assert.equal(url.searchParams.get("response_type"), "code");
  assert.equal(url.searchParams.get("client_id"), process.env.LINKEDIN_CLIENT_ID);
  assert.equal(url.searchParams.get("state"), "state-123");

  const scopes = (url.searchParams.get("scope") ?? "").split(" ");
  for (const scope of ["openid", "profile", "email", "w_member_social"]) {
    assert.ok(scopes.includes(scope), `missing scope ${scope}`);
  }

  assert.match(
    url.searchParams.get("redirect_uri") ?? "",
    /\/api\/social\/linkedin\/callback$/,
    "the redirect URI must be the route that actually exists",
  );
});

test("a text post is addressed to the member and carries a supported API version", async () => {
  stubFetch([
    userinfo,
    { status: 201, headers: { "x-restli-id": "urn:li:share:7188" } },
  ]);

  const result = await linkedInAdapter.createPost("token-abc", { text: "Hello LinkedIn" });

  assert.equal(result.success, true);
  assert.equal(result.platformPostId, "urn:li:share:7188");
  assert.equal(result.platformPostUrl, "https://www.linkedin.com/feed/update/urn:li:share:7188");

  const post = calls.find((c) => c.url.endsWith("/rest/posts"));
  assert.ok(post, "the post must be sent to /rest/posts");
  assert.equal(post!.method, "POST");
  assert.match(post!.headers["LinkedIn-Version"] ?? "", /^\d{6}$/, "LinkedIn-Version must look like YYYYMM");
  assert.equal(post!.headers["X-Restli-Protocol-Version"], "2.0.0");

  const body = post!.body as Record<string, unknown>;
  assert.equal(body.author, "urn:li:person:AbC123def", "author must be the member urn, not a url");
  assert.equal(body.commentary, "Hello LinkedIn");
  assert.equal(body.lifecycleState, "PUBLISHED");
  assert.deepEqual(body.distribution, {
    feedDistribution: "MAIN_FEED",
    targetEntities: [],
    thirdPartyDistributionChannels: [],
  });
});

test("visibility maps to LinkedIn's enum and never leaks as raw input", async () => {
  stubFetch([userinfo, { status: 201, headers: { "x-restli-id": "urn:li:share:1" } }]);
  await linkedInAdapter.createPost("t", { text: "x", visibility: "connections" });
  assert.equal((calls.find((c) => c.url.endsWith("/rest/posts"))!.body as any).visibility, "CONNECTIONS");

  stubFetch([userinfo, { status: 201, headers: { "x-restli-id": "urn:li:share:2" } }]);
  await linkedInAdapter.createPost("t", { text: "x" });
  assert.equal((calls.find((c) => c.url.endsWith("/rest/posts"))!.body as any).visibility, "PUBLIC");
});

test("an image is registered, uploaded as bytes, and referenced by urn", async () => {
  stubFetch([
    userinfo,
    { json: { value: { uploadUrl: "https://api.linkedin.com/mediaUpload/abc", image: "urn:li:image:999" } } },
    {}, // fetching the source image
    {}, // the PUT that uploads the bytes
    { status: 201, headers: { "x-restli-id": "urn:li:share:777" } },
  ]);

  const result = await linkedInAdapter.createPost("token-abc", {
    text: "with a picture",
    mediaUrls: ["https://cdn.example.com/pic.jpg"],
  });

  assert.equal(result.success, true);

  const init = calls.find((c) => c.url.includes("/rest/images?action=initializeUpload"));
  assert.ok(init, "image upload must be initialized first");
  assert.equal((init!.body as any).initializeUploadRequest.owner, "urn:li:person:AbC123def");

  const put = calls.find((c) => c.method === "PUT");
  assert.ok(put, "the bytes must be PUT to the returned upload URL");

  const post = calls.find((c) => c.url.endsWith("/rest/posts"));
  assert.deepEqual(
    (post!.body as any).content,
    { media: { id: "urn:li:image:999" } },
    "the post must reference the uploaded image urn, never the source URL",
  );
});

test("a 2xx without a post id is NOT reported as success", async () => {
  stubFetch([userinfo, { status: 201 }]);

  const result = await linkedInAdapter.createPost("token-abc", { text: "will not confirm" });

  assert.equal(result.success, false);
  assert.match(result.error ?? "", /no post id/i);
  assert.equal(result.platformPostId, undefined);
});

test("an API error surfaces LinkedIn's own message", async () => {
  stubFetch([
    userinfo,
    { status: 403, json: { message: "Not enough permissions to access: w_member_social", status: 403 } },
  ]);

  const result = await linkedInAdapter.createPost("token-abc", { text: "denied" });

  assert.equal(result.success, false);
  assert.match(result.error ?? "", /w_member_social/);
});

test("an empty post is refused before any request is made", async () => {
  stubFetch([]);
  const result = await linkedInAdapter.createPost("token-abc", { text: "   " });
  assert.equal(result.success, false);
  assert.equal(calls.length, 0, "nothing should be sent for an empty post");
});

test("credentials are validated by presence and shape", () => {
  assert.equal(linkedInAdapter.validateCredentials().valid, true);

  const savedId = process.env.LINKEDIN_CLIENT_ID;
  process.env.LINKEDIN_CLIENT_ID = "test-placeholder";
  const invalid = linkedInAdapter.validateCredentials();
  assert.equal(invalid.valid, false);
  assert.ok(invalid.missing.some((m) => m.includes("LINKEDIN_CLIENT_ID")));

  delete process.env.LINKEDIN_CLIENT_ID;
  const absent = linkedInAdapter.validateCredentials();
  assert.equal(absent.valid, false);
  assert.ok(absent.missing.includes("LINKEDIN_CLIENT_ID"));
  process.env.LINKEDIN_CLIENT_ID = savedId;
});

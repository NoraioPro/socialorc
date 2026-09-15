import { test } from "node:test";
import assert from "node:assert/strict";
import { linkedInAdapter } from "../../src/lib/adapters/linkedin";
import { facebookAdapter } from "../../src/lib/adapters/facebook";
import { instagramAdapter } from "../../src/lib/adapters/instagram";
import { twitterAdapter } from "../../src/lib/adapters/twitter";
import type { PostOptions } from "../../src/types/platform";

/**
 * Connector readiness: every publish path exercised against a stubbed platform
 * API, so the behaviour is known before credentials exist rather than after.
 *
 * LinkedIn matters most here - it is the only connector actually publishing in
 * production - and its image capability was broken in the same way TikTok's was:
 * it sent the media URL where the API requires an uploaded image URN, so the
 * declared single-image capability could never succeed. Its success path also
 * accepted a 2xx with no post id.
 */

const realFetch = globalThis.fetch;
// A real extension matters: an extension-less URL has no inferable MIME type and
// the adapters refuse it as unknown media (fail-closed, asserted elsewhere).
const MEDIA_URL = "https://cdn.example.invalid/shot.png";

interface Call {
  url: string;
  method: string;
  /** Parsed JSON body, when the adapter sent JSON. */
  json: Record<string, unknown> | null;
  /** Parsed form body, when the adapter sent x-www-form-urlencoded. */
  form: Record<string, string> | null;
  bytes: number;
  headers: Record<string, string>;
}

function stubFetch(
  handler: (url: string, init: RequestInit | undefined) => Response | undefined,
): Call[] {
  const calls: Call[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const headers: Record<string, string> = {};
    new Headers(init?.headers as HeadersInit | undefined).forEach((v, k) => {
      headers[k.toLowerCase()] = v;
    });

    let json: Record<string, unknown> | null = null;
    let form: Record<string, string> | null = null;
    if (init?.body instanceof URLSearchParams) {
      form = Object.fromEntries(init.body);
    } else if (typeof init?.body === "string") {
      try {
        json = JSON.parse(init.body) as Record<string, unknown>;
      } catch {
        form = Object.fromEntries(new URLSearchParams(init.body));
      }
    }

    calls.push({
      url,
      method: init?.method ?? "GET",
      json,
      form,
      bytes: init?.body instanceof Uint8Array ? init.body.byteLength : 0,
      headers,
    });

    // Any media the adapter downloads to upload it onwards.
    if (url.startsWith("https://cdn.example.invalid/")) {
      return new Response(new Uint8Array([1, 2, 3, 4, 5]), { status: 200 });
    }

    return handler(url, init) ?? new Response(`unexpected request: ${url}`, { status: 500 });
  }) as typeof fetch;
  return calls;
}

const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers });

/* ------------------------------------------------------------------ LinkedIn */

const LINKEDIN_PERSON = { sub: "person-1", name: "Test Person", picture: "" };
const LINKEDIN_URN = "urn:li:image:C4D22AQHExampleUrn";
const LINKEDIN_POST_ID = "urn:li:share:7500000000000000001";

function linkedInHandler(withPostId = true, uploadStatus = 201) {
  return (url: string) => {
    if (url.includes("/v2/userinfo")) return json(LINKEDIN_PERSON);
    if (url.includes("/rest/images?action=initializeUpload")) {
      return json({ value: { uploadUrl: "https://upload.invalid/li", image: LINKEDIN_URN } });
    }
    if (url === "https://upload.invalid/li") {
      return uploadStatus === 201
        ? new Response("", { status: 201 })
        : new Response("too big", { status: uploadStatus });
    }
    if (url.includes("/rest/posts")) {
      return withPostId
        ? new Response("", { status: 201, headers: { "x-restli-id": LINKEDIN_POST_ID } })
        : new Response("", { status: 201 });
    }
    return undefined;
  };
}

test("LinkedIn: a text post carries the version header and returns the real urn", async () => {
  const calls = stubFetch(linkedInHandler());
  try {
    const result = await linkedInAdapter.createPost("token", {
      text: "Hello LinkedIn",
    } as unknown as PostOptions);

    assert.equal(result.success, true);
    assert.equal(result.platformPostId, LINKEDIN_POST_ID);
    assert.equal(
      result.platformPostUrl,
      `https://www.linkedin.com/feed/update/${LINKEDIN_POST_ID}`,
    );

    const post = calls.find((c) => c.url.includes("/rest/posts"));
    assert.ok(post);
    assert.ok(post.headers["linkedin-version"], "LinkedIn requires the version header");
    assert.equal(post.json?.author, "urn:li:person:person-1");
    assert.equal(post.json?.commentary, "Hello LinkedIn");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("LinkedIn: an image is registered, uploaded, then referenced by URN", async () => {
  const calls = stubFetch(linkedInHandler());
  try {
    const result = await linkedInAdapter.createPost("token", {
      text: "With a picture",
      mediaUrls: [MEDIA_URL],
    } as unknown as PostOptions);

    assert.equal(result.success, true);

    const init = calls.find((c) => c.url.includes("initializeUpload"));
    assert.ok(init, "the image must be registered first");
    assert.equal(
      (init.json?.initializeUploadRequest as { owner?: string })?.owner,
      "urn:li:person:person-1",
    );

    const put = calls.find((c) => c.method === "PUT");
    assert.ok(put, "the image bytes must be PUT to the upload URL");
    assert.equal(put.bytes, 5);

    const post = calls.find((c) => c.url.includes("/rest/posts"));
    const content = post?.json?.content as { media?: { id?: string } } | undefined;
    assert.equal(content?.media?.id, LINKEDIN_URN);
    assert.equal(
      JSON.stringify(post?.json ?? {}).includes("cdn.example.invalid"),
      false,
      "a raw URL must not be sent as the image reference",
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("LinkedIn: a 2xx with no post id is not a publish", async () => {
  stubFetch(linkedInHandler(false));
  try {
    const result = await linkedInAdapter.createPost("token", {
      text: "Hello LinkedIn",
    } as unknown as PostOptions);
    assert.equal(result.success, false);
    assert.match(result.error ?? "", /no post id/i);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("LinkedIn: a rejected image upload aborts before any post is created", async () => {
  const calls = stubFetch(linkedInHandler(true, 400));
  try {
    const result = await linkedInAdapter.createPost("token", {
      text: "With a picture",
      mediaUrls: [MEDIA_URL],
    } as unknown as PostOptions);
    assert.equal(result.success, false);
    assert.equal(
      calls.some((c) => c.url.includes("/rest/posts")),
      false,
      "a post must not be created when its image failed to upload",
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

/* ------------------------------------------------------------------ Facebook */

function facebookHandler(withPostId = true) {
  return (url: string) => {
    if (url.includes("/me/accounts")) {
      return json({ data: [{ id: "page-1", name: "My Page", access_token: "page-token" }] });
    }
    if (url.includes("/page-1/feed") || url.includes("/page-1/photos")) {
      return withPostId ? json({ id: "page-1_100" }) : json({});
    }
    return undefined;
  };
}

test("Facebook: a text post goes to the page feed with the page token", async () => {
  const calls = stubFetch(facebookHandler());
  try {
    const result = await facebookAdapter.createPost("user-token", {
      text: "Hello Facebook",
    } as unknown as PostOptions);

    assert.equal(result.success, true);
    assert.equal(result.platformPostId, "page-1_100");

    const post = calls.find((c) => c.url.includes("/page-1/feed"));
    assert.ok(post, "expected the page feed endpoint");
    assert.equal(post.form?.message, "Hello Facebook");
    assert.equal(
      post.form?.access_token,
      "page-token",
      "the PAGE token must be used, not the user token",
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("Facebook: an image post goes to the photos endpoint", async () => {
  const calls = stubFetch(facebookHandler());
  try {
    const result = await facebookAdapter.createPost("user-token", {
      text: "With a picture",
      mediaUrls: [MEDIA_URL],
    } as unknown as PostOptions);

    assert.equal(result.success, true);
    const photo = calls.find((c) => c.url.includes("/page-1/photos"));
    assert.ok(photo, "an image must use /photos");
    assert.equal(photo.form?.url, MEDIA_URL);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("Facebook: a 200 with no post id is not a publish", async () => {
  stubFetch(facebookHandler(false));
  try {
    const result = await facebookAdapter.createPost("user-token", {
      text: "Hello Facebook",
    } as unknown as PostOptions);
    assert.equal(result.success, false);
    assert.match(result.error ?? "", /no post id/i);
  } finally {
    globalThis.fetch = realFetch;
  }
});

/* ----------------------------------------------------------------- Instagram */

function instagramHandler(withMediaId = true) {
  return (url: string) => {
    if (url.includes("/me/accounts")) {
      return json({ data: [{ id: "page-1", access_token: "page-token" }] });
    }
    if (url.includes("instagram_business_account")) {
      return json({ instagram_business_account: { id: "ig-1" } });
    }
    if (url.includes("/ig-1?fields=")) return json({ id: "ig-1", username: "myig", name: "My IG" });
    // media_publish must be matched before /media, which is a prefix of it.
    if (url.includes("/ig-1/media_publish")) return withMediaId ? json({ id: "media-1" }) : json({});
    if (url.includes("/ig-1/media")) return json({ id: "container-1" });
    return undefined;
  };
}

test("Instagram: a single JPEG is containerised then published", async () => {
  const calls = stubFetch(instagramHandler());
  try {
    const result = await instagramAdapter.createPost("user-token", {
      text: "Hello Instagram",
      mediaUrls: ["https://cdn.example.invalid/shot.jpg"],
    } as unknown as PostOptions);

    assert.equal(result.success, true);
    assert.equal(result.platformPostId, "media-1");
    assert.equal(result.platformPostUrl, "https://www.instagram.com/p/media-1/");

    const container = calls.find((c) => c.url.includes("/ig-1/media") && !c.url.includes("media_publish"));
    assert.equal(container?.form?.image_url, "https://cdn.example.invalid/shot.jpg");

    const publish = calls.find((c) => c.url.includes("/ig-1/media_publish"));
    assert.equal(publish?.form?.creation_id, "container-1", "the container must be published by id");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("Instagram: more than one image is refused, with no API calls", async () => {
  const calls = stubFetch(instagramHandler());
  try {
    const result = await instagramAdapter.createPost("user-token", {
      text: "Two pictures",
      mediaUrls: ["https://cdn.example.invalid/a.jpg", "https://cdn.example.invalid/b.jpg"],
    } as unknown as PostOptions);
    assert.equal(result.success, false);
    assert.equal(calls.length, 0, "an unsupported carousel must not reach the API");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("Instagram: a publish with no media id is not a publish", async () => {
  stubFetch(instagramHandler(false));
  try {
    const result = await instagramAdapter.createPost("user-token", {
      text: "Hello Instagram",
      mediaUrls: ["https://cdn.example.invalid/shot.jpg"],
    } as unknown as PostOptions);
    assert.equal(result.success, false);
    assert.match(result.error ?? "", /no media id/i);
  } finally {
    globalThis.fetch = realFetch;
  }
});

/* ------------------------------------------------------------------------- X */

test("X: a text post returns the real tweet id", async () => {
  const calls = stubFetch((url) =>
    url.includes("/2/tweets") ? json({ data: { id: "1812345678901234567" } }) : undefined,
  );
  try {
    const result = await twitterAdapter.createPost("token", {
      text: "Hello X",
    } as unknown as PostOptions);

    assert.equal(result.success, true);
    assert.equal(result.platformPostId, "1812345678901234567");
    assert.equal(result.platformPostUrl, "https://x.com/i/status/1812345678901234567");
    const post = calls.find((c) => c.url.includes("/2/tweets"));
    assert.equal(post?.json?.text, "Hello X");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("X: an attached image is refused with no API call - X is text only", async () => {
  const calls = stubFetch(() => undefined);
  try {
    const result = await twitterAdapter.createPost("token", {
      text: "With a picture",
      mediaUrls: [MEDIA_URL],
    } as unknown as PostOptions);
    assert.equal(result.success, false);
    assert.equal(result.code, "UNSUPPORTED_MEDIA");
    assert.equal(calls.length, 0, "the text must not go out with the media silently dropped");
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("X: an API error is never reported as a publish", async () => {
  stubFetch((url) =>
    url.includes("/2/tweets")
      ? json({ detail: "You are not allowed to create a Tweet" }, 403)
      : undefined,
  );
  try {
    const result = await twitterAdapter.createPost("token", {
      text: "Hello X",
    } as unknown as PostOptions);
    assert.equal(result.success, false);
    assert.match(result.error ?? "", /not allowed/i);
    assert.equal(result.platformPostId, undefined);
  } finally {
    globalThis.fetch = realFetch;
  }
});

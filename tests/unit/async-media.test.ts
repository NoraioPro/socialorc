import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { InstagramAdapter } from "../../src/lib/adapters/instagram";
import { TwitterAdapter } from "../../src/lib/adapters/twitter";
import { encodeMetaPageCredential } from "../../src/lib/adapters/meta-credential";
import {
  createMemoryInFlightStore,
  setInFlightMediaStore,
} from "../../src/lib/adapters/in-flight-media";
import { isRetryable } from "../../src/lib/adapters/errors";

/**
 * Asynchronous media: Instagram Reels and X video are processed after upload.
 * A publish attempt may only wait a bounded time (the routes have 60s); past
 * that it reports MEDIA_PROCESSING and the next attempt RESUMES the same
 * upload. These tests pin the two properties that matter: nothing is ever
 * published twice, and a slow upload is never restarted from zero.
 */

const realFetch = globalThis.fetch;
let store = createMemoryInFlightStore();

beforeEach(() => {
  store = createMemoryInFlightStore();
  setInFlightMediaStore(store);
});
afterEach(() => {
  setInFlightMediaStore(null);
  globalThis.fetch = realFetch;
});

type Seen = { url: string; method: string; form: Record<string, string> | null; body: unknown };

function stub(handler: (url: string, init?: RequestInit) => Response | undefined): Seen[] {
  const seen: Seen[] = [];
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    seen.push({
      url,
      method: init?.method ?? "GET",
      form: init?.body instanceof URLSearchParams ? Object.fromEntries(init.body) : null,
      body: init?.body,
    });
    if (url.startsWith("https://cdn.example.invalid/")) {
      return new Response(new Uint8Array(10), { status: 200, headers: { "content-type": "video/mp4" } });
    }
    return handler(url, init) ?? new Response(`unexpected ${url}`, { status: 500 });
  }) as typeof fetch;
  return seen;
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

const CREDENTIAL = encodeMetaPageCredential({ token: "page-token", pageId: "p1", igUserId: "ig1" });
const REEL = {
  text: "Reel caption",
  media: [{ url: "https://cdn.example.invalid/clip.mp4", mimeType: "video/mp4", sizeBytes: 10 }],
  idempotencyKey: "post-1",
};

function instagram(): InstagramAdapter {
  const adapter = new InstagramAdapter();
  adapter.pollBudgetMs = 50;
  adapter.pollIntervalMs = 10;
  adapter.sleep = async () => undefined;
  return adapter;
}

/** A Meta stub whose container reports `statuses` in order (last one repeats). */
function metaStub(statuses: string[]) {
  let i = 0;
  let created = 0;
  const seen = stub((url) => {
    if (url.includes("/ig1/media_publish")) return json({ id: "media-9" });
    if (url.endsWith("/ig1/media")) {
      created++;
      return json({ id: `container-${created}` });
    }
    if (url.includes("fields=status_code")) {
      const status = statuses[Math.min(i, statuses.length - 1)];
      i++;
      return json({ status_code: status });
    }
    if (url.includes("fields=permalink")) return json({ permalink: "https://www.instagram.com/reel/X/" });
    return undefined;
  });
  return { seen, created: () => created };
}

test("a video is published as a Reel once its container is FINISHED", async () => {
  const { seen } = metaStub(["IN_PROGRESS", "FINISHED"]);
  const result = await instagram().createPost(CREDENTIAL, REEL);
  assert.equal(result.success, true, result.error);
  assert.equal(result.platformPostUrl, "https://www.instagram.com/reel/X/");

  const container = seen.find((s) => s.url.endsWith("/ig1/media"));
  assert.equal(container?.form?.media_type, "REELS");
  assert.equal(container?.form?.video_url, "https://cdn.example.invalid/clip.mp4");
  assert.equal(container?.form?.access_token, "page-token");
  assert.equal(store.entries.size, 0, "a published container is forgotten");
});

test("a Reel still processing is NOT published, is retryable, and is remembered", async () => {
  const { seen } = metaStub(["IN_PROGRESS"]);
  const result = await instagram().createPost(CREDENTIAL, REEL);
  assert.equal(result.success, false);
  assert.equal(result.code, "MEDIA_PROCESSING");
  assert.equal(isRetryable("MEDIA_PROCESSING"), true, "the worker must retry, not dead-letter");
  assert.equal(seen.filter((s) => s.url.includes("media_publish")).length, 0);
  assert.equal(store.entries.get("instagram:container:post-1"), "container-1");
});

test("the next attempt resumes the same container instead of uploading again", async () => {
  const first = metaStub(["IN_PROGRESS"]);
  await instagram().createPost(CREDENTIAL, REEL);
  assert.equal(first.created(), 1);

  const second = metaStub(["FINISHED"]);
  const result = await instagram().createPost(CREDENTIAL, REEL);
  assert.equal(result.success, true, result.error);
  assert.equal(second.created(), 0, "no second container may be created");
  const publish = second.seen.find((s) => s.url.includes("media_publish"));
  assert.equal(publish?.form?.creation_id, "container-1");
});

test("a container already PUBLISHED is never published again", async () => {
  store.entries.set("instagram:container:post-1", "container-1");
  const { seen, created } = metaStub(["PUBLISHED"]);
  const result = await instagram().createPost(CREDENTIAL, REEL);
  assert.equal(result.success, false);
  assert.equal(isRetryable(result.code as never), false, "retrying would duplicate the post");
  assert.equal(created(), 0);
  assert.equal(seen.filter((s) => s.url.includes("media_publish")).length, 0);
});

test("an expired leftover container is discarded and the post starts over", async () => {
  store.entries.set("instagram:container:post-1", "container-old");
  const { created } = metaStub(["EXPIRED", "FINISHED"]);
  const result = await instagram().createPost(CREDENTIAL, REEL);
  assert.equal(result.success, true, result.error);
  assert.equal(created(), 1);
});

test("a container in ERROR fails as a media problem, not a retry", async () => {
  metaStub(["ERROR"]);
  const result = await instagram().createPost(CREDENTIAL, REEL);
  assert.equal(result.success, false);
  assert.equal(result.code, "MEDIA_INVALID");
  assert.equal(store.entries.size, 0);
});

test("the poll is bounded by the budget, whatever the platform says", async () => {
  const adapter = instagram();
  adapter.pollBudgetMs = 0;
  const { seen } = metaStub(["IN_PROGRESS"]);
  const result = await adapter.createPost(CREDENTIAL, REEL);
  assert.equal(result.code, "MEDIA_PROCESSING");
  assert.equal(seen.filter((s) => s.url.includes("status_code")).length, 1);
});

/* ------------------------------------------------------------------------- X */

function twitter(): TwitterAdapter {
  const adapter = new TwitterAdapter();
  // check_after_secs is honoured (min 1s); sleep is stubbed, so this allows a few polls.
  adapter.pollBudgetMs = 5_000;
  adapter.sleep = async () => undefined;
  return adapter;
}

const X_VIDEO = {
  text: "clip",
  media: [{ url: "https://cdn.example.invalid/clip.mp4", mimeType: "video/mp4", sizeBytes: 10 }],
  idempotencyKey: "post-x",
};

function xStub(states: string[]) {
  let i = 0;
  let inits = 0;
  const seen = stub((url) => {
    if (url.endsWith("/2/media/upload/initialize")) {
      inits++;
      return json({ data: { id: "900", media_key: "7_900", expires_after_secs: 86400 } });
    }
    if (url.endsWith("/2/media/upload/900/append")) return json({ data: { expires_at: 1 } });
    if (url.endsWith("/2/media/upload/900/finalize")) {
      return json({ data: { id: "900", processing_info: { state: "pending", check_after_secs: 1 } } });
    }
    if (url.includes("/2/media/upload?") && url.includes("command=STATUS")) {
      const state = states[Math.min(i, states.length - 1)];
      i++;
      return json({ data: { id: "900", processing_info: { state, check_after_secs: 0 } } });
    }
    if (url.endsWith("/2/tweets")) return json({ data: { id: "1888" } });
    return undefined;
  });
  return { seen, inits: () => inits };
}

test("X video: initialize, append, finalize, wait for succeeded, then post with the media id", async () => {
  const { seen } = xStub(["in_progress", "succeeded"]);
  const result = await twitter().createPost("user-token", X_VIDEO);
  assert.equal(result.success, true, result.error);

  const init = seen.find((s) => s.url.endsWith("/initialize"));
  assert.deepEqual(JSON.parse(String(init?.body)), {
    media_type: "video/mp4",
    total_bytes: 10,
    media_category: "tweet_video",
  });
  const append = seen.find((s) => s.url.endsWith("/append"));
  assert.ok(append?.body instanceof FormData);
  assert.equal((append.body as FormData).get("segment_index"), "0");
  const tweet = seen.find((s) => s.url.endsWith("/2/tweets"));
  assert.deepEqual(JSON.parse(String(tweet?.body)).media, { media_ids: ["900"] });
});

test("X video still processing is retried later and resumed, not re-uploaded", async () => {
  const first = xStub(["in_progress"]);
  const pending = await twitter().createPost("user-token", X_VIDEO);
  assert.equal(pending.code, "MEDIA_PROCESSING");
  assert.equal(first.seen.filter((s) => s.url.endsWith("/2/tweets")).length, 0);
  assert.equal(store.entries.get("twitter:media:post-x"), "900");

  const second = xStub(["succeeded"]);
  const result = await twitter().createPost("user-token", X_VIDEO);
  assert.equal(result.success, true, result.error);
  assert.equal(second.inits(), 0, "the upload is resumed, not repeated");
  assert.equal(store.entries.size, 0);
});

test("X refuses a video mixed with images before any call", async () => {
  const seen = stub(() => undefined);
  const result = await twitter().createPost("user-token", {
    text: "mix",
    media: [
      { url: "https://cdn.example.invalid/a.jpg", mimeType: "image/jpeg", sizeBytes: 10 },
      { url: "https://cdn.example.invalid/clip.mp4", mimeType: "video/mp4", sizeBytes: 10 },
    ],
  });
  assert.equal(result.code, "UNSUPPORTED_MEDIA");
  assert.equal(seen.length, 0);
});

test("X asks for media.write at connect time", () => {
  const { url } = new TwitterAdapter().createAuthorizationRequest("s");
  assert.match(new URL(url).searchParams.get("scope") ?? "", /\bmedia\.write\b/);
});

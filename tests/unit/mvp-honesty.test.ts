import { test } from "node:test";
import assert from "node:assert/strict";
import { Platform } from "@prisma/client";
import { getAdapter, resolvePublishAdapter, isMockAdapterAllowed } from "../../src/lib/adapters";
import { MockAdapter } from "../../src/lib/adapters/mock";
import { linkedInAdapter } from "../../src/lib/adapters/linkedin";
import { mediaStorage } from "../../src/lib/media-storage";
import {
  PROCESSING_LEASE_MS,
  leaseCutoff,
  recoverStaleProcessingJobs,
  type LeaseRecoveryClient,
} from "../../src/lib/jobs/lease-recovery";
import { aiStudioGenerate, improveContent, AINotConfiguredError } from "../../src/lib/ai";
import { cascadeContent } from "../../src/lib/cascade";

/**
 * The MVP's core safety contract:
 *   - an unconfigured platform can never become PUBLISHED,
 *   - unsupported media can never be silently dropped,
 *   - production never stores a `data:` URL or pretends to run AI,
 *   - a crashed publish cannot leave a job stuck forever.
 *
 * These run against the real modules with no network and no database.
 */

/** Run `fn` with NODE_ENV forced, restoring it afterwards. */
async function withNodeEnv<T>(value: string, fn: () => Promise<T> | T): Promise<T> {
  // NODE_ENV is typed readonly by Next's ProcessEnv augmentation, but these
  // modules read it at call time, so a temporary override is exactly what the
  // production/development branches need to be exercised in one test run.
  const env = process.env as Record<string, string | undefined>;
  const saved = env.NODE_ENV;
  env.NODE_ENV = value;
  try {
    return await fn();
  } finally {
    if (saved === undefined) delete env.NODE_ENV;
    else env.NODE_ENV = saved;
  }
}

/** Run `fn` with an env var set (or deleted when value is undefined). */
async function withEnv<T>(
  key: string,
  value: string | undefined,
  fn: () => Promise<T> | T,
): Promise<T> {
  const saved = process.env[key];
  if (value === undefined) delete process.env[key];
  else process.env[key] = value;
  try {
    return await fn();
  } finally {
    if (saved === undefined) delete process.env[key];
    else process.env[key] = saved;
  }
}

// --- Test 1: an unconfigured platform cannot publish -------------------------

test("an unconfigured platform resolves to PLATFORM_NOT_CONFIGURED, never a mock", async () => {
  await withNodeEnv("production", async () => {
    const resolution = resolvePublishAdapter(Platform.FACEBOOK);
    assert.equal(resolution.ok, false);
    if (resolution.ok) return; // narrowing
    assert.equal(resolution.code, "PLATFORM_NOT_CONFIGURED");
    // The operator gets the variable NAMES, never a value.
    assert.deepEqual(resolution.missing, ["FACEBOOK_APP_ID", "FACEBOOK_APP_SECRET"]);
    assert.match(resolution.message, /FACEBOOK credentials are not configured/);
  });
});

test("a configured platform still resolves to its real adapter", async () => {
  // Realistic shapes: the validators deliberately reject values that look like
  // placeholders (anything starting with "test", "your", "fake", ...).
  const resolution = await withEnv("LINKEDIN_CLIENT_ID", "78abc123def456xy", () =>
    withEnv("LINKEDIN_CLIENT_SECRET", "Ab3xyzQ9LmNp7RsT", () =>
      withNodeEnv("production", () => resolvePublishAdapter(Platform.LINKEDIN)),
    ),
  );
  assert.equal(resolution.ok, true);
  if (!resolution.ok) return;
  assert.equal(resolution.adapter.platform, Platform.LINKEDIN);
  // LinkedIn is the one production-proven connector: never a mock adapter.
  assert.ok(!(resolution.adapter instanceof MockAdapter));
});

// --- Test 2: production mock protection -------------------------------------

test("production never selects a mock adapter, even with useMockIfUnconfigured", async () => {
  await withNodeEnv("production", () => {
    assert.equal(isMockAdapterAllowed(), false);
    for (const platform of Object.values(Platform) as Platform[]) {
      const adapter = getAdapter(platform, { useMockIfUnconfigured: true });
      assert.ok(
        !(adapter instanceof MockAdapter),
        `${platform} must not resolve to a mock adapter in production`,
      );
    }
  });
});

test("development keeps mock adapters so local flows still work", async () => {
  await withNodeEnv("development", () => {
    assert.equal(isMockAdapterAllowed(), true);
    const adapter = getAdapter(Platform.FACEBOOK, { useMockIfUnconfigured: true });
    assert.ok(adapter instanceof MockAdapter);

    // The mock is what would mark a post PUBLISHED, which is exactly why it is
    // confined to non-production.
    assert.equal(adapter.validateCredentials().valid, true);
  });
});

test("the mock adapter's fake publish is recognisable by its fingerprint", async () => {
  await withNodeEnv("development", async () => {
    const adapter = getAdapter(Platform.FACEBOOK, { useMockIfUnconfigured: true });
    const result = await adapter.createPost("token", { text: "hello" });
    assert.equal(result.success, true);
    assert.match(String(result.platformPostId), /^mock_post_FACEBOOK_/);
    assert.match(String(result.platformPostUrl), /^https:\/\/mock\.facebook\.com\//);
  });
});

// --- Test 3: unsupported video never publishes text alone --------------------

test("a video on a video-less platform is refused, and nothing is sent", async () => {
  const originalFetch = globalThis.fetch;
  let fetchCalls = 0;
  globalThis.fetch = (async () => {
    fetchCalls++;
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;

  try {
    for (const platform of [Platform.LINKEDIN, Platform.FACEBOOK, Platform.INSTAGRAM, Platform.TELEGRAM]) {
      const adapter = getAdapter(platform);
      const result = await adapter.createPost("token", {
        text: "caption",
        mediaUrls: ["https://cdn.example/clip.mp4"],
        media: [{ url: "https://cdn.example/clip.mp4", mimeType: "video/mp4", sizeBytes: 1024 }],
      });
      assert.equal(result.success, false, `${platform} must refuse video`);
      assert.equal(result.code, "UNSUPPORTED_MEDIA", `${platform} code`);
    }
    // Refused before any API call: no text-only post can slip through.
    assert.equal(fetchCalls, 0, "no request may be made when the media is refused");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

// --- Test 4: unsupported carousel never drops the extra images ---------------

test("a carousel on a carousel-less platform is refused", async () => {
  for (const platform of [Platform.FACEBOOK, Platform.INSTAGRAM, Platform.LINKEDIN]) {
    const adapter = getAdapter(platform);
    const result = await adapter.createPost("token", {
      text: "caption",
      mediaUrls: ["https://cdn.example/a.jpg", "https://cdn.example/b.jpg"],
    });
    assert.equal(result.success, false, `${platform} must refuse a carousel`);
    assert.equal(result.code, "UNSUPPORTED_MEDIA", `${platform} code`);
  }
});

// --- Test 5: production media storage ---------------------------------------

test("production without Blob refuses media storage instead of storing base64", async () => {
  await withEnv("BLOB_READ_WRITE_TOKEN", undefined, () =>
    withNodeEnv("production", () => {
      assert.equal(mediaStorage(), "unconfigured");
      // The whole point: never the development base64 fallback.
      assert.notEqual(mediaStorage(), "dev-base64");
    }),
  );
});

test("production with Blob uses real object storage", async () => {
  await withEnv("BLOB_READ_WRITE_TOKEN", "vercel_blob_rw_test", () =>
    withNodeEnv("production", () => {
      assert.equal(mediaStorage(), "blob");
    }),
  );
});

test("development may still use the base64 fallback", async () => {
  await withEnv("BLOB_READ_WRITE_TOKEN", undefined, () =>
    withNodeEnv("development", () => {
      assert.equal(mediaStorage(), "dev-base64");
    }),
  );
});

// --- Test 6: production AI is never mocked ----------------------------------

test("production AI generation fails clearly instead of returning mock content", async () => {
  await withEnv("OPENAI_API_KEY", undefined, () =>
    withNodeEnv("production", async () => {
      await assert.rejects(
        () => aiStudioGenerate({ idea: "launch post", platforms: [Platform.LINKEDIN], tone: "professional" }),
        (error: unknown) =>
          error instanceof AINotConfiguredError && error.code === "AI_NOT_CONFIGURED",
      );
      await assert.rejects(
        () => improveContent("some copy", Platform.LINKEDIN, "make it shorter"),
        (error: unknown) => error instanceof AINotConfiguredError,
      );
    }),
  );
});

test("production cascade fails clearly instead of inventing adaptations", async () => {
  await withEnv("OPENAI_API_KEY", undefined, () =>
    withNodeEnv("production", async () => {
      await assert.rejects(
        () => cascadeContent({ content: "hello", platform: Platform.LINKEDIN }, [Platform.TWITTER]),
        (error: unknown) => error instanceof AINotConfiguredError,
      );
    }),
  );
});

test("development without a key still returns mock AI, flagged as mock", async () => {
  await withEnv("OPENAI_API_KEY", undefined, () =>
    withNodeEnv("development", async () => {
      const result = await aiStudioGenerate({
        idea: "launch post",
        platforms: [Platform.LINKEDIN],
        tone: "professional",
      });
      assert.equal(result.usedMock, true);
      assert.ok(result.variants.length > 0);
    }),
  );
});

test("an explicit forceMock request is still honoured in production", async () => {
  await withEnv("OPENAI_API_KEY", undefined, () =>
    withNodeEnv("production", async () => {
      const result = await aiStudioGenerate({
        idea: "launch post",
        platforms: [Platform.LINKEDIN],
        tone: "professional",
        forceMock: true,
      });
      // Explicitly asked for, and reported as mock — never passed off as real.
      assert.equal(result.usedMock, true);
    }),
  );
});

// --- Test 7: stale PROCESSING recovery --------------------------------------

function fakeJobClient(count = 1) {
  const calls: { where: Record<string, unknown>; data: Record<string, unknown> }[] = [];
  const client = {
    calls,
    scheduledJob: {
      async updateMany(args: {
        where: Record<string, unknown>;
        data: Record<string, unknown>;
      }): Promise<{ count: number }> {
        calls.push(args);
        return { count };
      },
    },
  };
  return client;
}

test("a stale PROCESSING job inside its retry budget is reclaimed", async () => {
  const now = new Date("2026-09-13T12:00:00.000Z");
  const client = fakeJobClient(2);

  const result = await recoverStaleProcessingJobs(
    client as unknown as LeaseRecoveryClient,
    now,
    3,
  );

  assert.equal(result.reclaimed, 2);
  const reclaim = client.calls[0];
  assert.equal(reclaim.where.status, "PROCESSING");
  assert.deepEqual(reclaim.where.attempts, { lt: 3 });
  assert.deepEqual(reclaim.data, { status: "PENDING" });

  // Only jobs older than the lease are touched.
  const window = reclaim.where.startedAt as { lt: Date };
  assert.ok(window.lt instanceof Date);
  assert.equal(window.lt.getTime(), now.getTime() - PROCESSING_LEASE_MS);
});

test("a stale PROCESSING job with no attempts left is dead-lettered, not retried", async () => {
  const now = new Date("2026-09-13T12:00:00.000Z");
  const client = fakeJobClient(1);

  const result = await recoverStaleProcessingJobs(
    client as unknown as LeaseRecoveryClient,
    now,
    3,
  );

  assert.equal(result.abandoned, 1);
  const abandon = client.calls[1];
  assert.equal(abandon.where.status, "PROCESSING");
  assert.deepEqual(abandon.where.attempts, { gte: 3 });
  assert.equal(abandon.data.status, "FAILED");
  assert.match(String(abandon.data.errorMessage), /Abandoned/);
});

test("the lease window is measurable and overridable", () => {
  const now = new Date("2026-09-13T12:00:00.000Z");
  assert.equal(leaseCutoff(now).getTime(), now.getTime() - PROCESSING_LEASE_MS);
  assert.equal(leaseCutoff(now, 60_000).getTime(), now.getTime() - 60_000);
  // Longer than one cron interval, so a healthy publish is never reclaimed.
  assert.ok(PROCESSING_LEASE_MS > 5 * 60_000);
});

// --- Test 8: LinkedIn regression --------------------------------------------

test("LinkedIn text publishing still works and stays on a supported API version", async () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; init: RequestInit }[] = [];

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const target = String(url);
    calls.push({ url: target, init: init ?? {} });
    if (target.endsWith("/v2/userinfo")) {
      return new Response(JSON.stringify({ sub: "abc123", name: "Test User" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (target.endsWith("/rest/posts")) {
      return new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:999" } });
    }
    return new Response("unexpected URL " + target, { status: 404 });
  }) as unknown as typeof fetch;

  try {
    const result = await linkedInAdapter.createPost("token", { text: "hello linkedin" });

    assert.equal(result.success, true, result.error);
    assert.equal(result.platformPostId, "urn:li:share:999");
    assert.equal(result.platformPostUrl, "https://www.linkedin.com/feed/update/urn:li:share:999");

    const post = calls.find((c) => c.url.endsWith("/rest/posts"));
    assert.ok(post, "the post must go to /rest/posts");
    assert.equal(post.url, "https://api.linkedin.com/rest/posts");

    const headers = post.init.headers as Record<string, string>;
    assert.match(headers.Authorization, /^Bearer token$/);
    assert.equal(headers["Content-Type"], "application/json");
    assert.equal(headers["X-Restli-Protocol-Version"], "2.0.0");

    // Guard against the failure that was dead-lettered in production: a retired
    // LinkedIn API version. It must be a YYYYMM and never the old dated form.
    assert.match(headers["LinkedIn-Version"], /^20\d{4}$/);
    assert.notEqual(headers["LinkedIn-Version"], "20240601");

    const body = JSON.parse(String(post.init.body));
    assert.equal(body.author, "urn:li:person:abc123");
    assert.equal(body.commentary, "hello linkedin");
    assert.equal(body.lifecycleState, "PUBLISHED");
    assert.equal(body.visibility, "PUBLIC");
    assert.deepEqual(body.distribution.feedDistribution, "MAIN_FEED");
    // Text-only: no content block invented.
    assert.equal(body.content, undefined);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test("LinkedIn single-image publishing registers, uploads, then references the urn", async () => {
  const originalFetch = globalThis.fetch;
  const calls: { url: string; init: RequestInit }[] = [];

  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const target = String(url);
    calls.push({ url: target, init: init ?? {} });
    if (target.endsWith("/v2/userinfo")) {
      return new Response(JSON.stringify({ sub: "abc123", name: "Test User" }), { status: 200 });
    }
    if (target.includes("initializeUpload")) {
      return new Response(
        JSON.stringify({
          value: { uploadUrl: "https://upload.invalid/li", image: "urn:li:image:ABC" },
        }),
        { status: 200 },
      );
    }
    if (target === "https://upload.invalid/li") {
      return new Response(null, { status: 201 });
    }
    return new Response(null, { status: 201, headers: { "x-restli-id": "urn:li:share:1000" } });
  }) as unknown as typeof fetch;

  try {
    const result = await linkedInAdapter.createPost("token", {
      text: "with a picture",
      mediaUrls: ["https://cdn.example/a.jpg"],
      media: [{ url: "https://cdn.example/a.jpg", mimeType: "image/jpeg", sizeBytes: 2048 }],
    });

    assert.equal(result.success, true, result.error);
    assert.equal(result.platformPostId, "urn:li:share:1000", "the urn from x-restli-id is required");

    // LinkedIn cannot fetch a URL: the bytes must be uploaded to the URL it
    // returned from the registration step.
    assert.ok(
      calls.some((c) => c.init.method === "PUT"),
      "the image bytes must be uploaded",
    );

    // The post references the returned image urn, never the source URL. Sending
    // the URL itself is what the API rejects, so this is the difference between a
    // working image post and one that could never succeed.
    const post = calls.find((c) => c.url.endsWith("/rest/posts"));
    const body = JSON.parse(String(post?.init.body));
    assert.equal(body.content.media.id, "urn:li:image:ABC");
    assert.equal(
      JSON.stringify(body).includes("cdn.example"),
      false,
      "a raw URL must not be sent as the image reference",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});

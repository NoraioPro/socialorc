import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { fetchAllPosts, POSTS_PAGE_SIZE } from "../../src/lib/posts/fetch-all";

/** UI-01: Calendar and Queue lost every post past the API's 100-row clamp. */

function serverWith(total: number): { fetchImpl: typeof fetch; urls: string[] } {
  const urls: string[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    const url = String(input);
    urls.push(url);
    const params = new URL(url, "http://x").searchParams;
    const limit = Math.min(Number(params.get("limit")), 100); // the server's clamp
    const offset = Number(params.get("offset"));
    const posts = Array.from({ length: Math.max(0, Math.min(limit, total - offset)) }, (_, i) => ({
      id: `p${offset + i}`,
    }));
    return new Response(JSON.stringify({ posts, total }), { status: 200 });
  }) as typeof fetch;
  return { fetchImpl, urls };
}

test("UI-01: 250 posts are all loaded across pages", async () => {
  const { fetchImpl, urls } = serverWith(250);
  const posts = await fetchAllPosts<{ id: string }>(fetchImpl);
  assert.equal(posts.length, 250);
  assert.equal(new Set(posts.map((p) => p.id)).size, 250);
  assert.equal(urls.length, 3);
});

test("UI-01: an exact multiple of the page size does not loop or over-fetch", async () => {
  const { fetchImpl, urls } = serverWith(POSTS_PAGE_SIZE * 2);
  const posts = await fetchAllPosts(fetchImpl);
  assert.equal(posts.length, 200);
  assert.equal(urls.length, 2);
});

test("UI-01: an empty workspace is one request and no posts", async () => {
  const { fetchImpl, urls } = serverWith(0);
  assert.deepEqual(await fetchAllPosts(fetchImpl), []);
  assert.equal(urls.length, 1);
});

test("UI-01: a failing page is an error, not a silently truncated list", async () => {
  const fetchImpl = (async () => new Response("{}", { status: 500 })) as typeof fetch;
  await assert.rejects(() => fetchAllPosts(fetchImpl), /Failed to load posts \(500\)/);
});

test("UI-01: Calendar and Queue use the paginated loader, not limit=500", () => {
  for (const page of ["calendar", "queue"]) {
    const src = fs.readFileSync(`src/app/(dashboard)/dashboard/${page}/page.tsx`, "utf8");
    assert.match(src, /fetchAllPosts/);
    assert.equal(src.includes("limit=500"), false, page);
  }
});

test("N-8: the list API reports the limit and offset it actually applied", () => {
  const route = fs.readFileSync("src/app/api/posts/route.ts", "utf8");
  assert.match(route, /limit: safeLimit,/);
  assert.match(route, /offset: safeOffset,/);
});

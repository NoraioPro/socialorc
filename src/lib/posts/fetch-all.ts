/**
 * Load every post the list API will return, one page at a time.
 *
 * `/api/posts` clamps `limit` to 100. The Calendar and Queue asked for 500 and
 * rendered whatever came back, so a workspace with more than 100 posts silently
 * lost scheduled posts from both views (audit UI-01). This follows `offset`
 * until the server reports the total, with a hard page cap so a misbehaving
 * response can never loop forever.
 */
export const POSTS_PAGE_SIZE = 100;
const MAX_PAGES = 50;

interface PostsPage<T> {
  posts: T[];
  total?: number;
}

export async function fetchAllPosts<T = unknown>(
  fetchImpl: typeof fetch = fetch,
  query = "",
): Promise<T[]> {
  const all: T[] = [];
  for (let page = 0; page < MAX_PAGES; page++) {
    const offset = page * POSTS_PAGE_SIZE;
    const sep = query ? `&${query}` : "";
    const res = await fetchImpl(`/api/posts?limit=${POSTS_PAGE_SIZE}&offset=${offset}${sep}`);
    if (!res.ok) throw new Error(`Failed to load posts (${res.status})`);
    const data = (await res.json()) as PostsPage<T>;
    const batch = Array.isArray(data.posts) ? data.posts : [];
    all.push(...batch);
    const total = typeof data.total === "number" ? data.total : null;
    if (batch.length < POSTS_PAGE_SIZE || (total !== null && all.length >= total)) break;
  }
  return all;
}

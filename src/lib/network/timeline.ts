/**
 * SocialOrc Network — the native timeline.
 *
 * The platform is its own social network: users post, friends see each other's
 * posts, and anyone can read what is public. Everything here is pure, so the two
 * properties that actually matter can be tested without a database:
 *
 *   1. **Visibility is enforced in the query.** `PUBLIC` is visible to anyone,
 *      `CONNECTIONS` only to accepted friends (in either direction), `PRIVATE`
 *      only to the author. A pending request grants nothing — that is the case
 *      that leaks in a naive implementation, so it is asserted explicitly.
 *   2. **Pagination is keyset-based** (`createdAt`, then `id`). Offset paging
 *      duplicates and skips rows as new posts arrive at the head; a keyset cursor
 *      does not. Ordering is total, so no post can be seen twice or missed.
 */

export type PostVisibility = "PUBLIC" | "CONNECTIONS" | "PRIVATE";

export const POST_VISIBILITIES: readonly PostVisibility[] = ["PUBLIC", "CONNECTIONS", "PRIVATE"];

export function isPostVisibility(value: unknown): value is PostVisibility {
  return typeof value === "string" && (POST_VISIBILITIES as readonly string[]).includes(value);
}

export interface TimelinePost {
  id: string;
  authorId: string;
  authorName?: string | null;
  body: string;
  visibility: PostVisibility;
  createdAt: Date;
  /** Soft-deleted posts are filtered out, never rendered. */
  deletedAt?: Date | null;
}

export type FriendshipStatus = "PENDING" | "ACCEPTED" | "DECLINED" | "BLOCKED";

/** An edge in either direction: `requesterId` asked `addresseeId`. */
export interface FriendshipEdge {
  requesterId: string;
  addresseeId: string;
  status: FriendshipStatus;
}

export const MAX_TIMELINE_LIMIT = 50;
export const DEFAULT_TIMELINE_LIMIT = 20;
export const MAX_POST_LENGTH = 5000;

/** The ids a viewer is friends with — accepted edges only, either direction. */
export function friendIdsOf(viewerId: string, edges: FriendshipEdge[]): Set<string> {
  const friends = new Set<string>();
  for (const edge of edges) {
    if (edge.status !== "ACCEPTED") continue;
    if (edge.requesterId === viewerId) friends.add(edge.addresseeId);
    else if (edge.addresseeId === viewerId) friends.add(edge.requesterId);
  }
  friends.delete(viewerId);
  return friends;
}

/** Can `viewerId` read this post? The single source of truth for visibility. */
export function canSee(post: TimelinePost, viewerId: string, friendIds: Set<string>): boolean {
  if (post.deletedAt) return false;
  if (post.authorId === viewerId) return true;
  switch (post.visibility) {
    case "PUBLIC":
      return true;
    case "CONNECTIONS":
      return friendIds.has(post.authorId);
    case "PRIVATE":
    default:
      return false;
  }
}

export interface TimelineCursor {
  createdAt: string;
  id: string;
}

export function encodeCursor(post: Pick<TimelinePost, "createdAt" | "id">): string {
  return Buffer.from(`${post.createdAt.toISOString()}|${post.id}`).toString("base64url");
}

export function decodeCursor(cursor: string | null | undefined): TimelineCursor | null {
  if (!cursor) return null;
  try {
    const [createdAt, id] = Buffer.from(cursor, "base64url").toString("utf8").split("|");
    if (!createdAt || !id) return null;
    if (Number.isNaN(new Date(createdAt).getTime())) return null;
    return { createdAt, id };
  } catch {
    return null;
  }
}

/** Newest first, with `id` as a total-order tiebreak. */
function compareDesc(a: TimelinePost, b: TimelinePost): number {
  const diff = b.createdAt.getTime() - a.createdAt.getTime();
  return diff !== 0 ? diff : b.id.localeCompare(a.id);
}

export interface TimelineQuery {
  viewerId: string;
  posts: TimelinePost[];
  edges: FriendshipEdge[];
  limit?: number;
  cursor?: string | null;
}

export interface TimelinePage {
  items: TimelinePost[];
  nextCursor: string | null;
  /** Candidates examined, before visibility filtering — useful for pagination tests. */
  considered: number;
}

/**
 * Build one page of the viewer's timeline: their own posts plus their friends',
 * newest first, with anything they may not read removed.
 *
 * Filtering happens *before* the limit is applied, so a page is never short
 * because the newest posts happened to be invisible to this viewer.
 */
export function buildTimeline(query: TimelineQuery): TimelinePage {
  const limit = Math.min(
    Math.max(1, query.limit ?? DEFAULT_TIMELINE_LIMIT),
    MAX_TIMELINE_LIMIT,
  );
  const friendIds = friendIdsOf(query.viewerId, query.edges);
  const cursor = decodeCursor(query.cursor ?? null);

  const visible = query.posts
    .filter((post) => canSee(post, query.viewerId, friendIds))
    .sort(compareDesc);

  const afterCursor = cursor
    ? visible.filter((post) => {
        const createdAt = post.createdAt.toISOString();
        if (createdAt < cursor.createdAt) return true;
        if (createdAt > cursor.createdAt) return false;
        return post.id < cursor.id;
      })
    : visible;

  const items = afterCursor.slice(0, limit);
  const hasMore = afterCursor.length > items.length;

  return {
    items,
    nextCursor: hasMore && items.length > 0 ? encodeCursor(items[items.length - 1]) : null,
    considered: query.posts.length,
  };
}

export interface PostInput {
  authorId: string;
  body: string;
  visibility?: string;
}

export interface PostValidation {
  ok: boolean;
  errors: string[];
  value?: { authorId: string; body: string; visibility: PostVisibility };
}

/** Validate a new post. Empty/oversized/whitespace-only bodies are rejected. */
export function validatePost(input: PostInput): PostValidation {
  const errors: string[] = [];
  const body = (input.body ?? "").trim();

  if (!input.authorId) errors.push("authorId is required");
  if (!body) errors.push("A post needs some text.");
  if (body.length > MAX_POST_LENGTH) {
    errors.push(`Posts are limited to ${MAX_POST_LENGTH} characters.`);
  }
  if (input.visibility !== undefined && !isPostVisibility(input.visibility)) {
    errors.push(`visibility must be one of ${POST_VISIBILITIES.join(", ")}.`);
  }

  if (errors.length > 0) return { ok: false, errors };
  return {
    ok: true,
    errors: [],
    value: {
      authorId: input.authorId,
      body,
      visibility: (input.visibility as PostVisibility | undefined) ?? "PUBLIC",
    },
  };
}

export interface FriendRequestState {
  /** idle | pending_outgoing | pending_incoming | friends | blocked */
  state:
    | "idle"
    | "pending_outgoing"
    | "pending_incoming"
    | "friends"
    | "blocked"
    | "self";
  /** What the UI should offer next. */
  action: "add_friend" | "cancel_request" | "accept_request" | "remove_friend" | "none";
}

/**
 * What the viewer's relationship to another user is, and the one action that
 * makes sense next. Kept here so the button and the API agree.
 */
export function friendRequestState(
  viewerId: string,
  otherUserId: string,
  edges: FriendshipEdge[],
): FriendRequestState {
  if (viewerId === otherUserId) return { state: "self", action: "none" };

  const edge = edges.find(
    (e) =>
      (e.requesterId === viewerId && e.addresseeId === otherUserId) ||
      (e.requesterId === otherUserId && e.addresseeId === viewerId),
  );
  if (!edge) return { state: "idle", action: "add_friend" };

  const outgoing = edge.requesterId === viewerId;
  switch (edge.status) {
    case "ACCEPTED":
      return { state: "friends", action: "remove_friend" };
    case "PENDING":
      return outgoing
        ? { state: "pending_outgoing", action: "cancel_request" }
        : { state: "pending_incoming", action: "accept_request" };
    case "BLOCKED":
      return { state: "blocked", action: "none" };
    case "DECLINED":
    default:
      // A declined request leaves both sides free to try again.
      return { state: "idle", action: "add_friend" };
  }
}

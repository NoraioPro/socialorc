/**
 * Native timeline: who can see what, and pagination that cannot duplicate or
 * skip.
 *
 * The leaks that matter in a social feed are asserted here explicitly:
 * a pending friend request grants nothing, a CONNECTIONS post is invisible to
 * strangers, a PRIVATE post is visible only to its author, and a soft-deleted
 * post is gone from every timeline. Pagination is tested against the failure
 * that offset paging has: new posts arriving at the head while paging.
 */

import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DEFAULT_TIMELINE_LIMIT,
  MAX_POST_LENGTH,
  MAX_TIMELINE_LIMIT,
  buildTimeline,
  canSee,
  decodeCursor,
  encodeCursor,
  friendIdsOf,
  friendRequestState,
  isPostVisibility,
  validatePost,
  type FriendshipEdge,
  type TimelinePost,
} from "../../src/lib/network/timeline";

const at = (minutes: number) => new Date(Date.UTC(2026, 8, 12, 12, minutes, 0));

function post(id: string, authorId: string, visibility: TimelinePost["visibility"], minutes: number, deleted = false): TimelinePost {
  return { id, authorId, body: `post ${id}`, visibility, createdAt: at(minutes), deletedAt: deleted ? at(minutes + 1) : null };
}

function edge(requesterId: string, addresseeId: string, status: FriendshipEdge["status"]): FriendshipEdge {
  return { requesterId, addresseeId, status };
}

// --- friends ---------------------------------------------------------------

test("only accepted friendships count as friends, in either direction", () => {
  const edges = [
    edge("me", "alice", "ACCEPTED"),
    edge("bob", "me", "ACCEPTED"),
    edge("me", "carol", "PENDING"),
    edge("dave", "me", "DECLINED"),
    edge("erin", "me", "BLOCKED"),
  ];
  const friends = friendIdsOf("me", edges);
  assert.deepEqual([...friends].sort(), ["alice", "bob"]);
  assert.ok(!friends.has("me"), "never your own friend");
});

test("an accepted friendship is visible from both sides", () => {
  const edges = [edge("me", "alice", "ACCEPTED")];
  assert.equal(friendIdsOf("alice", edges).has("me"), true);
});

// --- visibility ------------------------------------------------------------

test("PUBLIC posts are readable by strangers", () => {
  const p = post("p1", "alice", "PUBLIC", 0);
  assert.equal(canSee(p, "stranger", new Set()), true);
});

test("CONNECTIONS posts need an accepted friendship — a pending request is not enough", () => {
  const p = post("p1", "alice", "CONNECTIONS", 0);

  assert.equal(canSee(p, "stranger", new Set()), false);
  assert.equal(canSee(p, "alice", new Set(["bob"])), true, "the author always sees their own");

  const pendingOnly = friendIdsOf("bob", [edge("bob", "alice", "PENDING")]);
  assert.equal(pendingOnly.size, 0, "a pending request grants nothing");
  assert.equal(canSee(p, "bob", pendingOnly), false);

  const accepted = friendIdsOf("bob", [edge("bob", "alice", "ACCEPTED")]);
  assert.equal(canSee(p, "bob", accepted), true);
});

test("PRIVATE posts are readable only by their author", () => {
  const p = post("p1", "alice", "PRIVATE", 0);
  assert.equal(canSee(p, "alice", new Set(["bob"])), true);
  assert.equal(canSee(p, "bob", new Set(["alice"])), false, "even a friend");
});

test("a soft-deleted post is invisible to everyone, including its author", () => {
  const p = post("p1", "alice", "PUBLIC", 0, true);
  assert.equal(canSee(p, "alice", new Set()), false);
  assert.equal(canSee(p, "stranger", new Set()), false);

  const page = buildTimeline({ viewerId: "alice", posts: [p], edges: [] });
  assert.deepEqual(page.items, []);
});

test("visibility is parsed strictly and unknown values never pass", () => {
  assert.equal(isPostVisibility("PUBLIC"), true);
  assert.equal(isPostVisibility("CONNECTIONS"), true);
  assert.equal(isPostVisibility("PRIVATE"), true);
  assert.equal(isPostVisibility("public"), false, "case matters");
  assert.equal(isPostVisibility("EVERYONE"), false);
  assert.equal(isPostVisibility(undefined), false);
});

// --- timeline assembly -----------------------------------------------------

test("the timeline is newest-first and mixes your posts with friends'", () => {
  const edges = [edge("me", "alice", "ACCEPTED")];
  const posts = [
    post("mine-old", "me", "PUBLIC", 0),
    post("alice-new", "alice", "PUBLIC", 10),
    post("mine-new", "me", "PRIVATE", 20),
    post("stranger", "mallory", "PUBLIC", 30),
  ];

  const page = buildTimeline({ viewerId: "me", posts, edges });
  assert.deepEqual(page.items.map((p) => p.id), ["stranger", "mine-new", "alice-new", "mine-old"]);
});

test("invisible posts are removed before the page limit is applied", () => {
  // Five strangers' PRIVATE posts are newer than two visible ones: a page of 2
  // must still contain the two the viewer may read, not come back empty.
  const posts = [
    ...Array.from({ length: 5 }, (_, i) => post(`hidden${i}`, "mallory", "PRIVATE", 100 + i)),
    post("visible-new", "me", "PUBLIC", 10),
    post("visible-old", "me", "PUBLIC", 5),
  ];

  const page = buildTimeline({ viewerId: "me", posts, edges: [], limit: 2 });
  assert.deepEqual(page.items.map((p) => p.id), ["visible-new", "visible-old"]);
  assert.equal(page.nextCursor, null, "no more visible posts");
  assert.equal(page.considered, 7, "all candidates were examined");
});

test("the limit is clamped, so a client cannot ask for everything", () => {
  const many = Array.from({ length: 80 }, (_, i) => post(`p${i}`, "me", "PUBLIC", i));
  const page = buildTimeline({ viewerId: "me", posts: many, edges: [], limit: 10_000 });
  assert.equal(page.items.length, MAX_TIMELINE_LIMIT);

  const defaulted = buildTimeline({ viewerId: "me", posts: many, edges: [] });
  assert.equal(defaulted.items.length, DEFAULT_TIMELINE_LIMIT);

  const tiny = buildTimeline({ viewerId: "me", posts: many, edges: [], limit: 0 });
  assert.equal(tiny.items.length, 1, "0 becomes 1, never an empty page by accident");
});

// --- pagination ------------------------------------------------------------

test("paging covers every visible post exactly once, with no duplicates", () => {
  const posts = Array.from({ length: 25 }, (_, i) => post(`p${String(i).padStart(2, "0")}`, "me", "PUBLIC", i));

  const seen: string[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < 10; page++) {
    const result = buildTimeline({ viewerId: "me", posts, edges: [], limit: 10, cursor });
    seen.push(...result.items.map((p) => p.id));
    cursor = result.nextCursor;
    if (!cursor) break;
  }

  assert.equal(seen.length, 25);
  assert.equal(new Set(seen).size, 25, "no post delivered twice");

  // Newest first, and the order must hold ACROSS page boundaries, not just
  // within a page — that is the property offset paging breaks.
  const expected = Array.from({ length: 25 }, (_, i) => `p${String(i).padStart(2, "0")}`).reverse();
  assert.deepEqual(seen, expected);
});

test("a post arriving mid-paging does not duplicate or skip earlier pages", () => {
  const firstBatch = Array.from({ length: 6 }, (_, i) => post(`p${i}`, "me", "PUBLIC", i));
  const first = buildTimeline({ viewerId: "me", posts: firstBatch, edges: [], limit: 3, cursor: null });
  assert.deepEqual(first.items.map((p) => p.id), ["p5", "p4", "p3"]);

  // Someone posts while the viewer is still paging.
  const withNewPost = [...firstBatch, post("brand-new", "me", "PUBLIC", 99)];
  const second = buildTimeline({ viewerId: "me", posts: withNewPost, edges: [], limit: 3, cursor: first.nextCursor });

  assert.deepEqual(second.items.map((p) => p.id), ["p2", "p1", "p0"]);
  assert.ok(!second.items.some((p) => p.id === "brand-new"), "the new post belongs on page 1");
  assert.equal(second.nextCursor, null);
});

test("posts with identical timestamps still page deterministically", () => {
  const sameTime = Array.from({ length: 5 }, (_, i) => post(`p${i}`, "me", "PUBLIC", 7));
  const first = buildTimeline({ viewerId: "me", posts: sameTime, edges: [], limit: 2 });
  const second = buildTimeline({ viewerId: "me", posts: sameTime, edges: [], limit: 2, cursor: first.nextCursor });

  const all = [...first.items, ...second.items].map((p) => p.id);
  assert.equal(new Set(all).size, all.length, "id tiebreak keeps pages disjoint");
});

test("a corrupt or foreign cursor is treated as the start, not a crash", () => {
  assert.equal(decodeCursor("not-a-cursor"), null);
  assert.equal(decodeCursor(null), null);
  assert.equal(decodeCursor(""), null);

  const posts = [post("p1", "me", "PUBLIC", 1)];
  const page = buildTimeline({ viewerId: "me", posts, edges: [], cursor: "garbage" });
  assert.deepEqual(page.items.map((p) => p.id), ["p1"]);
});

test("cursors round-trip", () => {
  const p = post("abc", "me", "PUBLIC", 3);
  const decoded = decodeCursor(encodeCursor(p));
  assert.equal(decoded?.id, "abc");
  assert.equal(decoded?.createdAt, p.createdAt.toISOString());
});

// --- composer validation ---------------------------------------------------

test("post validation rejects empty, whitespace-only and oversized bodies", () => {
  assert.equal(validatePost({ authorId: "me", body: "" }).ok, false);
  assert.equal(validatePost({ authorId: "me", body: "   \n  " }).ok, false);
  assert.equal(validatePost({ authorId: "me", body: "x".repeat(MAX_POST_LENGTH + 1) }).ok, false);
  assert.equal(validatePost({ authorId: "", body: "hello" }).ok, false);
  assert.equal(validatePost({ authorId: "me", body: "hello", visibility: "FRIENDS" }).ok, false);
});

test("a valid post is trimmed and defaults to PUBLIC", () => {
  const result = validatePost({ authorId: "me", body: "  hello timeline  " });
  assert.equal(result.ok, true);
  assert.equal(result.value?.body, "hello timeline");
  assert.equal(result.value?.visibility, "PUBLIC");
  assert.equal(validatePost({ authorId: "me", body: "hi", visibility: "PRIVATE" }).value?.visibility, "PRIVATE");
});

// --- friend request state --------------------------------------------------

test("friend state drives the next sensible action", () => {
  assert.deepEqual(friendRequestState("me", "me", []), { state: "self", action: "none" });
  assert.deepEqual(friendRequestState("me", "alice", []), { state: "idle", action: "add_friend" });
  assert.deepEqual(friendRequestState("me", "alice", [edge("me", "alice", "PENDING")]), {
    state: "pending_outgoing",
    action: "cancel_request",
  });
  assert.deepEqual(friendRequestState("me", "alice", [edge("alice", "me", "PENDING")]), {
    state: "pending_incoming",
    action: "accept_request",
  });
  assert.deepEqual(friendRequestState("me", "alice", [edge("me", "alice", "ACCEPTED")]), {
    state: "friends",
    action: "remove_friend",
  });
  assert.deepEqual(friendRequestState("me", "alice", [edge("alice", "me", "ACCEPTED")]), {
    state: "friends",
    action: "remove_friend",
  });
  assert.deepEqual(friendRequestState("me", "alice", [edge("alice", "me", "BLOCKED")]), {
    state: "blocked",
    action: "none",
  });
});

test("a declined request can be retried", () => {
  assert.deepEqual(friendRequestState("me", "alice", [edge("me", "alice", "DECLINED")]), {
    state: "idle",
    action: "add_friend",
  });
});

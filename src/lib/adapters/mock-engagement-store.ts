import { Platform } from "@prisma/client";
import type { ReactionKind, SocialComment } from "@/types/platform";

type ThreadKey = string;

interface StoredComment extends SocialComment {
  reactions: Set<ReactionKind>;
}

const threads = new Map<ThreadKey, StoredComment[]>();
const postReactions = new Map<ThreadKey, Set<ReactionKind>>();
let idCounter = 1;

function threadKey(platform: Platform, platformPostId: string): ThreadKey {
  return `${platform}:${platformPostId}`;
}

function nextId(platform: Platform): string {
  return `mock_comment_${platform}_${idCounter++}`;
}

export function mockListComments(
  platform: Platform,
  platformPostId: string,
  cursor: string | null | undefined,
  limit: number,
): { items: SocialComment[]; nextCursor: string | null } {
  const all = threads.get(threadKey(platform, platformPostId)) ?? [];
  const start = cursor ? Number(cursor) : 0;
  const slice = all.slice(start, start + limit);
  const next = start + limit < all.length ? String(start + limit) : null;
  return {
    items: slice.map((comment) => ({
      ...comment,
      likeCount: comment.reactions.has("like") ? 1 : comment.likeCount ?? 0,
    })),
    nextCursor: next,
  };
}

export function mockCreateComment(
  platform: Platform,
  platformPostId: string,
  text: string,
  parentCommentId?: string,
): StoredComment {
  const comment: StoredComment = {
    id: nextId(platform),
    platform,
    platformPostId,
    authorId: `mock_author_${platform}`,
    authorName: `Mock ${platform} User`,
    text,
    createdAt: new Date("2026-01-01T12:00:00.000Z"),
    parentCommentId,
    canReply: true,
    canReact: true,
    canDelete: true,
    reactions: new Set(),
  };

  const key = threadKey(platform, platformPostId);
  const list = threads.get(key) ?? [];
  list.push(comment);
  threads.set(key, list);
  return comment;
}

export function mockDeleteComment(platform: Platform, platformPostId: string, commentId: string): boolean {
  const key = threadKey(platform, platformPostId);
  const list = threads.get(key);
  if (!list) return false;
  const index = list.findIndex((c) => c.id === commentId);
  if (index < 0) return false;
  list.splice(index, 1);
  return true;
}

export function mockFindComment(
  platform: Platform,
  commentId: string,
): StoredComment | undefined {
  for (const [key, list] of threads.entries()) {
    if (!key.startsWith(`${platform}:`)) continue;
    const found = list.find((c) => c.id === commentId);
    if (found) return found;
  }
  return undefined;
}

export function mockReact(
  platform: Platform,
  commentId: string,
  kind: ReactionKind,
  add: boolean,
): boolean {
  const comment = mockFindComment(platform, commentId);
  if (!comment) return false;
  if (add) {
    comment.reactions.add(kind);
  } else {
    comment.reactions.delete(kind);
  }
  return true;
}

export function mockReactToPost(
  platform: Platform,
  platformPostId: string,
  kind: ReactionKind,
  add: boolean,
): boolean {
  const key = threadKey(platform, platformPostId);
  const reactions = postReactions.get(key) ?? new Set<ReactionKind>();
  if (add) {
    reactions.add(kind);
  } else {
    reactions.delete(kind);
  }
  postReactions.set(key, reactions);
  return true;
}

export function mockResetEngagementStore(): void {
  threads.clear();
  postReactions.clear();
  idCounter = 1;
}

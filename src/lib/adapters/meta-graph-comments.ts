import { Platform } from "@prisma/client";
import type { SocialComment } from "@/types/platform";

type GraphCommentNode = {
  id: string;
  message?: string;
  text?: string;
  created_time?: string;
  timestamp?: string;
  like_count?: number;
  comment_count?: number;
  from?: { id: string; name?: string; username?: string };
  parent?: { id: string };
  permalink?: string;
};

export function mapGraphComment(
  platform: Platform,
  platformPostId: string,
  node: GraphCommentNode,
  options?: { canReact?: boolean },
): SocialComment {
  const text = node.message ?? node.text ?? "";
  const author = node.from;
  return {
    id: node.id,
    platform,
    platformPostId,
    authorId: author?.id ?? "unknown",
    authorName: author?.name ?? author?.username ?? "unknown",
    text,
    createdAt: new Date(node.created_time ?? node.timestamp ?? Date.now()),
    likeCount: node.like_count,
    replyCount: node.comment_count,
    parentCommentId: node.parent?.id,
    permalink: node.permalink,
    canReply: true,
    canReact: options?.canReact ?? false,
    canDelete: true,
    raw: node,
  };
}

export function graphPagingCursor(raw: {
  paging?: { cursors?: { after?: string } };
}): string | null {
  return raw.paging?.cursors?.after ?? null;
}

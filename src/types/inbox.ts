import type { Platform } from "@prisma/client";

/**
 * The unified inbox is built on the Engagement layer: it is the comments (and
 * replies to comments) on the workspace's own recent published posts, read
 * live through each adapter's `listComments`. Direct messages and mentions are
 * NOT covered — no adapter can read them — so there is no type for them.
 */
export type InboxItemType = "comment" | "reply";

export interface InboxItem {
  /** Unique within one inbox response: `${accountId}:${commentId}`. */
  id: string;
  /** The platform's own comment id (what a reply targets). */
  commentId: string;
  /** The connected account (SocialAccount.id) this comment was read through. */
  accountId: string;
  platform: Platform;
  /** "reply" when the comment answers another comment, else "comment". */
  type: InboxItemType;
  author: {
    id: string;
    name: string;
    avatarUrl?: string;
  };
  content: string;
  /** ISO timestamp from the platform. */
  createdAt: string;
  parentCommentId?: string;
  permalink?: string;
  /** The workspace post the comment was left on. */
  post: {
    id: string;
    platformPostId: string;
    platformPostUrl?: string | null;
    preview: string;
  };
  /** The account's platform lets this workspace reply to it from here. */
  canReply: boolean;
  /** Someone in the workspace marked it read (or replied from the inbox). */
  isRead: boolean;
  /** Replied from the inbox, or the account's own reply is in the thread. */
  isReplied: boolean;
}

/**
 * What happened when the inbox tried to read one connected account. A failure
 * here is shown next to that account; it never fails the whole inbox.
 */
export type InboxAccountState =
  | "ok"
  | "no_posts"
  | "unsupported"
  | "needs_reconnect"
  | "error"
  | "timeout"
  | "skipped";

export interface InboxAccountStatus {
  accountId: string;
  platform: Platform;
  name: string;
  state: InboxAccountState;
  message?: string;
  /** How many of the account's posts were actually read. */
  postsChecked: number;
  itemCount: number;
  canReply: boolean;
}

export interface InboxCoverage {
  /** What the inbox reads. */
  sources: string[];
  /** What it does not, stated plainly so the UI never implies otherwise. */
  notCovered: string[];
  maxPostsPerAccount: number;
  commentsPerPost: number;
}

export interface InboxResponse {
  items: InboxItem[];
  accounts: InboxAccountStatus[];
  coverage: InboxCoverage;
  /** Items before filters/limit were applied. */
  totalCount: number;
  unreadCount: number;
  generatedAt: string;
}

import { Platform } from "@prisma/client";

/**
 * Type of inbox item — matches spec for unified inbox (§60 M1.5).
 */
export type InboxItemType = "comment" | "mention" | "message" | "reply";

/**
 * A unified inbox item from any connected social platform.
 * All fields are normalized; platform-specific extras go in metadata.
 */
export interface InboxItem {
  id: string;
  platform: Platform;
  type: InboxItemType;
  
  /** The user/entity that sent/wrote this item. */
  author: {
    id: string;
    username?: string;
    displayName?: string;
    profileImageUrl?: string;
  };
  
  /** The content/text of the message/comment/mention. */
  content: string;
  
  /** ISO timestamp of when this was created on the platform. */
  createdAt: string;
  
  /** If this is a comment/reply on one of our posts, reference it. */
  postReference?: {
    platformPostId: string;
    platformPostUrl?: string;
    contentPreview?: string;
  };
  
  /** Whether this item has been read/handled. */
  isRead: boolean;
  
  /** Whether a reply has been sent. */
  isReplied: boolean;
  
  /** Platform-specific metadata (JSON). */
  metadata?: Record<string, unknown>;
}

/**
 * Options for fetching inbox items.
 */
export interface InboxFetchOptions {
  /** Filter by platform(s). */
  platforms?: Platform[];
  /** Filter by item type(s). */
  types?: InboxItemType[];
  /** Only unread items. */
  unreadOnly?: boolean;
  /** Maximum items to return. */
  limit?: number;
  /** Cursor for pagination. */
  cursor?: string;
  /** Sort order. */
  sortBy?: "newest" | "oldest";
}

/**
 * Result of fetching inbox items.
 */
export interface InboxFetchResult {
  items: InboxItem[];
  nextCursor?: string;
  totalCount: number;
  platforms: Platform[];
}

/**
 * Inbox adapter interface — each platform implements this to provide inbox items.
 */
export interface InboxAdapter {
  platform: Platform;
  
  /**
   * Fetch inbox items (comments, mentions, messages) from this platform.
   * Returns mock data when MOCK_SOCIAL_ADAPTERS=true.
   */
  fetchInboxItems(
    accessToken: string,
    options?: Omit<InboxFetchOptions, "platforms">
  ): Promise<InboxItem[]>;
  
  /**
   * Mark an item as read on the platform.
   */
  markAsRead(accessToken: string, itemId: string): Promise<boolean>;
  
  /**
   * Reply to an inbox item.
   */
  reply(
    accessToken: string,
    itemId: string,
    content: string
  ): Promise<{ success: boolean; replyId?: string; error?: string }>;
}

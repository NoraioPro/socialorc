import { Platform } from "@prisma/client";
import { InboxAdapter, InboxItem, InboxFetchOptions } from "@/types/inbox";
import { getMockInboxItems } from "./mock-data";

const MOCK_MODE = process.env.MOCK_SOCIAL_ADAPTERS === "true";

/**
 * Base mock inbox adapter — used for all platforms in mock mode.
 */
class MockInboxAdapter implements InboxAdapter {
  platform: Platform;

  constructor(platform: Platform) {
    this.platform = platform;
  }

  async fetchInboxItems(
    _accessToken: string,
    options?: Omit<InboxFetchOptions, "platforms">
  ): Promise<InboxItem[]> {
    let items = getMockInboxItems(this.platform);

    if (options?.types?.length) {
      items = items.filter((item) => options.types!.includes(item.type));
    }

    if (options?.unreadOnly) {
      items = items.filter((item) => !item.isRead);
    }

    if (options?.sortBy === "oldest") {
      items = [...items].sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    } else {
      items = [...items].sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }

    if (options?.limit) {
      items = items.slice(0, options.limit);
    }

    return items;
  }

  async markAsRead(_accessToken: string, itemId: string): Promise<boolean> {
    console.log(`[MOCK ${this.platform}] Marking item ${itemId} as read`);
    return true;
  }

  async reply(
    _accessToken: string,
    itemId: string,
    content: string
  ): Promise<{ success: boolean; replyId?: string; error?: string }> {
    console.log(`[MOCK ${this.platform}] Replying to ${itemId}: ${content.slice(0, 50)}...`);
    return {
      success: true,
      replyId: `mock_reply_${this.platform}_${Date.now()}`,
    };
  }
}

/**
 * Twitter inbox adapter — fetches mentions, replies, and DMs.
 */
class TwitterInboxAdapter implements InboxAdapter {
  platform = Platform.TWITTER;

  async fetchInboxItems(
    accessToken: string,
    options?: Omit<InboxFetchOptions, "platforms">
  ): Promise<InboxItem[]> {
    if (MOCK_MODE) {
      return new MockInboxAdapter(this.platform).fetchInboxItems(accessToken, options);
    }

    // Real implementation would call Twitter API:
    // - GET /2/users/:id/mentions
    // - GET /2/dm_events
    // For now, return empty array until real credentials are available
    console.log(`[TWITTER] Real inbox fetch not implemented yet`);
    return [];
  }

  async markAsRead(accessToken: string, itemId: string): Promise<boolean> {
    if (MOCK_MODE) {
      return new MockInboxAdapter(this.platform).markAsRead(accessToken, itemId);
    }
    console.log(`[TWITTER] Real markAsRead not implemented yet`);
    return false;
  }

  async reply(
    accessToken: string,
    itemId: string,
    content: string
  ): Promise<{ success: boolean; replyId?: string; error?: string }> {
    if (MOCK_MODE) {
      return new MockInboxAdapter(this.platform).reply(accessToken, itemId, content);
    }
    console.log(`[TWITTER] Real reply not implemented yet`);
    return { success: false, error: "Not implemented" };
  }
}

/**
 * LinkedIn inbox adapter — fetches comments and messages.
 */
class LinkedInInboxAdapter implements InboxAdapter {
  platform = Platform.LINKEDIN;

  async fetchInboxItems(
    accessToken: string,
    options?: Omit<InboxFetchOptions, "platforms">
  ): Promise<InboxItem[]> {
    if (MOCK_MODE) {
      return new MockInboxAdapter(this.platform).fetchInboxItems(accessToken, options);
    }

    // Real implementation would call LinkedIn API:
    // - GET /rest/socialActions/{postUrn}/comments
    // - GET /rest/conversations (requires messaging scope)
    console.log(`[LINKEDIN] Real inbox fetch not implemented yet`);
    return [];
  }

  async markAsRead(accessToken: string, itemId: string): Promise<boolean> {
    if (MOCK_MODE) {
      return new MockInboxAdapter(this.platform).markAsRead(accessToken, itemId);
    }
    return false;
  }

  async reply(
    accessToken: string,
    itemId: string,
    content: string
  ): Promise<{ success: boolean; replyId?: string; error?: string }> {
    if (MOCK_MODE) {
      return new MockInboxAdapter(this.platform).reply(accessToken, itemId, content);
    }
    return { success: false, error: "Not implemented" };
  }
}

/**
 * Instagram inbox adapter — fetches comments and mentions.
 */
class InstagramInboxAdapter implements InboxAdapter {
  platform = Platform.INSTAGRAM;

  async fetchInboxItems(
    accessToken: string,
    options?: Omit<InboxFetchOptions, "platforms">
  ): Promise<InboxItem[]> {
    if (MOCK_MODE) {
      return new MockInboxAdapter(this.platform).fetchInboxItems(accessToken, options);
    }
    return [];
  }

  async markAsRead(accessToken: string, itemId: string): Promise<boolean> {
    if (MOCK_MODE) {
      return new MockInboxAdapter(this.platform).markAsRead(accessToken, itemId);
    }
    return false;
  }

  async reply(
    accessToken: string,
    itemId: string,
    content: string
  ): Promise<{ success: boolean; replyId?: string; error?: string }> {
    if (MOCK_MODE) {
      return new MockInboxAdapter(this.platform).reply(accessToken, itemId, content);
    }
    return { success: false, error: "Not implemented" };
  }
}

/**
 * Facebook inbox adapter — fetches page comments and messages.
 */
class FacebookInboxAdapter implements InboxAdapter {
  platform = Platform.FACEBOOK;

  async fetchInboxItems(
    accessToken: string,
    options?: Omit<InboxFetchOptions, "platforms">
  ): Promise<InboxItem[]> {
    if (MOCK_MODE) {
      return new MockInboxAdapter(this.platform).fetchInboxItems(accessToken, options);
    }
    return [];
  }

  async markAsRead(accessToken: string, itemId: string): Promise<boolean> {
    if (MOCK_MODE) {
      return new MockInboxAdapter(this.platform).markAsRead(accessToken, itemId);
    }
    return false;
  }

  async reply(
    accessToken: string,
    itemId: string,
    content: string
  ): Promise<{ success: boolean; replyId?: string; error?: string }> {
    if (MOCK_MODE) {
      return new MockInboxAdapter(this.platform).reply(accessToken, itemId, content);
    }
    return { success: false, error: "Not implemented" };
  }
}

/**
 * TikTok inbox adapter — fetches video comments.
 */
class TikTokInboxAdapter implements InboxAdapter {
  platform = Platform.TIKTOK;

  async fetchInboxItems(
    accessToken: string,
    options?: Omit<InboxFetchOptions, "platforms">
  ): Promise<InboxItem[]> {
    if (MOCK_MODE) {
      return new MockInboxAdapter(this.platform).fetchInboxItems(accessToken, options);
    }
    return [];
  }

  async markAsRead(accessToken: string, itemId: string): Promise<boolean> {
    if (MOCK_MODE) {
      return new MockInboxAdapter(this.platform).markAsRead(accessToken, itemId);
    }
    return false;
  }

  async reply(
    accessToken: string,
    itemId: string,
    content: string
  ): Promise<{ success: boolean; replyId?: string; error?: string }> {
    if (MOCK_MODE) {
      return new MockInboxAdapter(this.platform).reply(accessToken, itemId, content);
    }
    return { success: false, error: "Not implemented" };
  }
}

/**
 * YouTube inbox adapter — fetches video comments.
 */
class YouTubeInboxAdapter implements InboxAdapter {
  platform = Platform.YOUTUBE;

  async fetchInboxItems(
    accessToken: string,
    options?: Omit<InboxFetchOptions, "platforms">
  ): Promise<InboxItem[]> {
    if (MOCK_MODE) {
      return new MockInboxAdapter(this.platform).fetchInboxItems(accessToken, options);
    }
    return [];
  }

  async markAsRead(accessToken: string, itemId: string): Promise<boolean> {
    if (MOCK_MODE) {
      return new MockInboxAdapter(this.platform).markAsRead(accessToken, itemId);
    }
    return false;
  }

  async reply(
    accessToken: string,
    itemId: string,
    content: string
  ): Promise<{ success: boolean; replyId?: string; error?: string }> {
    if (MOCK_MODE) {
      return new MockInboxAdapter(this.platform).reply(accessToken, itemId, content);
    }
    return { success: false, error: "Not implemented" };
  }
}

/**
 * Telegram inbox adapter — fetches channel/group messages.
 */
class TelegramInboxAdapter implements InboxAdapter {
  platform = Platform.TELEGRAM;

  async fetchInboxItems(
    accessToken: string,
    options?: Omit<InboxFetchOptions, "platforms">
  ): Promise<InboxItem[]> {
    if (MOCK_MODE) {
      return new MockInboxAdapter(this.platform).fetchInboxItems(accessToken, options);
    }
    return [];
  }

  async markAsRead(accessToken: string, itemId: string): Promise<boolean> {
    if (MOCK_MODE) {
      return new MockInboxAdapter(this.platform).markAsRead(accessToken, itemId);
    }
    return false;
  }

  async reply(
    accessToken: string,
    itemId: string,
    content: string
  ): Promise<{ success: boolean; replyId?: string; error?: string }> {
    if (MOCK_MODE) {
      return new MockInboxAdapter(this.platform).reply(accessToken, itemId, content);
    }
    return { success: false, error: "Not implemented" };
  }
}

/**
 * Registry of all inbox adapters.
 */
export const inboxAdapters: Record<Platform, InboxAdapter> = {
  TWITTER: new TwitterInboxAdapter(),
  LINKEDIN: new LinkedInInboxAdapter(),
  INSTAGRAM: new InstagramInboxAdapter(),
  FACEBOOK: new FacebookInboxAdapter(),
  TIKTOK: new TikTokInboxAdapter(),
  YOUTUBE: new YouTubeInboxAdapter(),
  TELEGRAM: new TelegramInboxAdapter(),
};

/**
 * Get inbox adapter for a platform.
 */
export function getInboxAdapter(platform: Platform): InboxAdapter {
  const adapter = inboxAdapters[platform];
  if (!adapter) {
    throw new Error(`No inbox adapter for platform: ${platform}`);
  }
  return adapter;
}

/**
 * Create a mock inbox adapter for testing.
 */
export function createMockInboxAdapter(platform: Platform): InboxAdapter {
  return new MockInboxAdapter(platform);
}

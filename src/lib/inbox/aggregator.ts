import { Platform } from "@prisma/client";
import { InboxItem, InboxFetchOptions, InboxFetchResult, InboxItemType } from "@/types/inbox";
import { getInboxAdapter } from "./adapters";

/**
 * Account info needed to fetch inbox items.
 */
export interface ConnectedAccount {
  platform: Platform;
  accessToken: string;
  platformUserId: string;
}

/**
 * Unified inbox aggregator — merges inbox items from multiple platforms
 * into a single sorted stream.
 */
export class UnifiedInboxAggregator {
  private accounts: ConnectedAccount[];

  constructor(accounts: ConnectedAccount[]) {
    this.accounts = accounts;
  }

  /**
   * Fetch and aggregate inbox items from all connected accounts.
   * Items are merged and sorted by creation time (newest first by default).
   */
  async fetchAll(options?: InboxFetchOptions): Promise<InboxFetchResult> {
    const targetPlatforms = options?.platforms ?? this.accounts.map((a) => a.platform);
    const relevantAccounts = this.accounts.filter((a) =>
      targetPlatforms.includes(a.platform)
    );

    if (relevantAccounts.length === 0) {
      return {
        items: [],
        totalCount: 0,
        platforms: [],
      };
    }

    const fetchPromises = relevantAccounts.map(async (account) => {
      const adapter = getInboxAdapter(account.platform);
      try {
        const items = await adapter.fetchInboxItems(account.accessToken, {
          types: options?.types,
          unreadOnly: options?.unreadOnly,
          limit: options?.limit ? options.limit * 2 : undefined,
          sortBy: options?.sortBy,
        });
        return { platform: account.platform, items, error: null };
      } catch (error) {
        console.error(`[UnifiedInbox] Failed to fetch from ${account.platform}:`, error);
        return { platform: account.platform, items: [], error };
      }
    });

    const results = await Promise.all(fetchPromises);

    let allItems: InboxItem[] = results.flatMap((r) => r.items);
    const platforms = [...new Set(results.filter((r) => r.items.length > 0).map((r) => r.platform))];

    if (options?.sortBy === "oldest") {
      allItems.sort(
        (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
      );
    } else {
      allItems.sort(
        (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    }

    const totalCount = allItems.length;

    if (options?.limit) {
      allItems = allItems.slice(0, options.limit);
    }

    return {
      items: allItems,
      totalCount,
      platforms,
    };
  }

  /**
   * Fetch inbox items filtered by type.
   */
  async fetchByType(type: InboxItemType, options?: Omit<InboxFetchOptions, "types">): Promise<InboxFetchResult> {
    return this.fetchAll({ ...options, types: [type] });
  }

  /**
   * Fetch only unread inbox items.
   */
  async fetchUnread(options?: Omit<InboxFetchOptions, "unreadOnly">): Promise<InboxFetchResult> {
    return this.fetchAll({ ...options, unreadOnly: true });
  }

  /**
   * Get count of items by platform.
   */
  async getCountsByPlatform(): Promise<Record<Platform, number>> {
    const result = await this.fetchAll();
    const counts: Partial<Record<Platform, number>> = {};

    for (const item of result.items) {
      counts[item.platform] = (counts[item.platform] || 0) + 1;
    }

    return counts as Record<Platform, number>;
  }

  /**
   * Get count of unread items by platform.
   */
  async getUnreadCountsByPlatform(): Promise<Record<Platform, number>> {
    const result = await this.fetchUnread();
    const counts: Partial<Record<Platform, number>> = {};

    for (const item of result.items) {
      counts[item.platform] = (counts[item.platform] || 0) + 1;
    }

    return counts as Record<Platform, number>;
  }

  /**
   * Mark an item as read.
   */
  async markAsRead(itemId: string, platform: Platform): Promise<boolean> {
    const account = this.accounts.find((a) => a.platform === platform);
    if (!account) {
      return false;
    }

    const adapter = getInboxAdapter(platform);
    return adapter.markAsRead(account.accessToken, itemId);
  }

  /**
   * Reply to an inbox item.
   */
  async reply(
    itemId: string,
    platform: Platform,
    content: string
  ): Promise<{ success: boolean; replyId?: string; error?: string }> {
    const account = this.accounts.find((a) => a.platform === platform);
    if (!account) {
      return { success: false, error: "Account not connected" };
    }

    const adapter = getInboxAdapter(platform);
    return adapter.reply(account.accessToken, itemId, content);
  }
}

/**
 * Create an aggregator from a list of connected accounts.
 */
export function createUnifiedInbox(accounts: ConnectedAccount[]): UnifiedInboxAggregator {
  return new UnifiedInboxAggregator(accounts);
}

/**
 * Aggregate inbox items from multiple sources (pure function for testing).
 */
export function aggregateInboxItems(
  itemsByPlatform: Map<Platform, InboxItem[]>,
  options?: InboxFetchOptions
): InboxItem[] {
  let items = Array.from(itemsByPlatform.values()).flat();

  if (options?.platforms?.length) {
    items = items.filter((item) => options.platforms!.includes(item.platform));
  }

  if (options?.types?.length) {
    items = items.filter((item) => options.types!.includes(item.type));
  }

  if (options?.unreadOnly) {
    items = items.filter((item) => !item.isRead);
  }

  if (options?.sortBy === "oldest") {
    items.sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  } else {
    items.sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }

  if (options?.limit) {
    items = items.slice(0, options.limit);
  }

  return items;
}

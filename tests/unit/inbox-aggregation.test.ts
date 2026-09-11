import { test } from "node:test";
import assert from "node:assert/strict";
import { Platform } from "@prisma/client";
import { InboxItem, InboxFetchOptions } from "../../src/types/inbox";
import { aggregateInboxItems } from "../../src/lib/inbox/aggregator";
import { MOCK_INBOX_ITEMS, getMockInboxItems } from "../../src/lib/inbox/mock-data";

test("getMockInboxItems returns items for a specific platform", () => {
  const twitterItems = getMockInboxItems(Platform.TWITTER);
  assert.ok(twitterItems.length > 0, "Twitter should have mock inbox items");
  for (const item of twitterItems) {
    assert.equal(item.platform, Platform.TWITTER);
  }

  const linkedInItems = getMockInboxItems(Platform.LINKEDIN);
  assert.ok(linkedInItems.length > 0, "LinkedIn should have mock inbox items");
  for (const item of linkedInItems) {
    assert.equal(item.platform, Platform.LINKEDIN);
  }
});

test("getMockInboxItems without platform returns all items", () => {
  const allItems = getMockInboxItems();
  const totalByPlatform = Object.values(MOCK_INBOX_ITEMS).reduce((sum, items) => sum + items.length, 0);
  assert.equal(allItems.length, totalByPlatform);
});

test("aggregateInboxItems merges items from multiple platforms", () => {
  const twitterItems = getMockInboxItems(Platform.TWITTER);
  const linkedInItems = getMockInboxItems(Platform.LINKEDIN);
  
  const itemsByPlatform = new Map<Platform, InboxItem[]>([
    [Platform.TWITTER, twitterItems],
    [Platform.LINKEDIN, linkedInItems],
  ]);

  const result = aggregateInboxItems(itemsByPlatform);
  
  assert.ok(result.length > 0, "Should have aggregated items");
  assert.ok(result.length === twitterItems.length + linkedInItems.length, "Should include all items");
  
  const platforms = new Set(result.map((item) => item.platform));
  assert.ok(platforms.has(Platform.TWITTER), "Should include Twitter items");
  assert.ok(platforms.has(Platform.LINKEDIN), "Should include LinkedIn items");
});

test("aggregateInboxItems sorts by newest first by default", () => {
  const items: InboxItem[] = [
    createMockItem("oldest", Platform.TWITTER, new Date(Date.now() - 3600000).toISOString()),
    createMockItem("newest", Platform.LINKEDIN, new Date().toISOString()),
    createMockItem("middle", Platform.INSTAGRAM, new Date(Date.now() - 1800000).toISOString()),
  ];

  const itemsByPlatform = new Map<Platform, InboxItem[]>([
    [Platform.TWITTER, [items[0]]],
    [Platform.LINKEDIN, [items[1]]],
    [Platform.INSTAGRAM, [items[2]]],
  ]);

  const result = aggregateInboxItems(itemsByPlatform);
  
  assert.equal(result[0].id, "newest");
  assert.equal(result[1].id, "middle");
  assert.equal(result[2].id, "oldest");
});

test("aggregateInboxItems sorts by oldest first when specified", () => {
  const items: InboxItem[] = [
    createMockItem("oldest", Platform.TWITTER, new Date(Date.now() - 3600000).toISOString()),
    createMockItem("newest", Platform.LINKEDIN, new Date().toISOString()),
    createMockItem("middle", Platform.INSTAGRAM, new Date(Date.now() - 1800000).toISOString()),
  ];

  const itemsByPlatform = new Map<Platform, InboxItem[]>([
    [Platform.TWITTER, [items[0]]],
    [Platform.LINKEDIN, [items[1]]],
    [Platform.INSTAGRAM, [items[2]]],
  ]);

  const result = aggregateInboxItems(itemsByPlatform, { sortBy: "oldest" });
  
  assert.equal(result[0].id, "oldest");
  assert.equal(result[1].id, "middle");
  assert.equal(result[2].id, "newest");
});

test("aggregateInboxItems filters by platform", () => {
  const twitterItems = getMockInboxItems(Platform.TWITTER);
  const linkedInItems = getMockInboxItems(Platform.LINKEDIN);
  
  const itemsByPlatform = new Map<Platform, InboxItem[]>([
    [Platform.TWITTER, twitterItems],
    [Platform.LINKEDIN, linkedInItems],
  ]);

  const options: InboxFetchOptions = { platforms: [Platform.TWITTER] };
  const result = aggregateInboxItems(itemsByPlatform, options);
  
  assert.equal(result.length, twitterItems.length);
  for (const item of result) {
    assert.equal(item.platform, Platform.TWITTER);
  }
});

test("aggregateInboxItems filters by type", () => {
  const itemsByPlatform = new Map<Platform, InboxItem[]>();
  
  for (const [platform, items] of Object.entries(MOCK_INBOX_ITEMS)) {
    itemsByPlatform.set(platform as Platform, items);
  }

  const options: InboxFetchOptions = { types: ["comment"] };
  const result = aggregateInboxItems(itemsByPlatform, options);
  
  assert.ok(result.length > 0, "Should have comment items");
  for (const item of result) {
    assert.equal(item.type, "comment");
  }
});

test("aggregateInboxItems filters unread only", () => {
  const itemsByPlatform = new Map<Platform, InboxItem[]>();
  for (const [platform, items] of Object.entries(MOCK_INBOX_ITEMS)) {
    itemsByPlatform.set(platform as Platform, items);
  }

  const options: InboxFetchOptions = { unreadOnly: true };
  const result = aggregateInboxItems(itemsByPlatform, options);
  
  for (const item of result) {
    assert.equal(item.isRead, false, `Item ${item.id} should be unread`);
  }
});

test("aggregateInboxItems respects limit", () => {
  const itemsByPlatform = new Map<Platform, InboxItem[]>();
  for (const [platform, items] of Object.entries(MOCK_INBOX_ITEMS)) {
    itemsByPlatform.set(platform as Platform, items);
  }

  const options: InboxFetchOptions = { limit: 3 };
  const result = aggregateInboxItems(itemsByPlatform, options);
  
  assert.equal(result.length, 3);
});

test("aggregateInboxItems combines multiple filters", () => {
  const itemsByPlatform = new Map<Platform, InboxItem[]>();
  for (const [platform, items] of Object.entries(MOCK_INBOX_ITEMS)) {
    itemsByPlatform.set(platform as Platform, items);
  }

  const options: InboxFetchOptions = {
    platforms: [Platform.TWITTER, Platform.LINKEDIN],
    types: ["comment", "mention"],
    unreadOnly: true,
    limit: 5,
  };
  
  const result = aggregateInboxItems(itemsByPlatform, options);
  
  assert.ok(result.length <= 5, "Should respect limit");
  const allowedPlatforms = [Platform.TWITTER, Platform.LINKEDIN] as const;
  const allowedTypes = ["comment", "mention"] as const;
  for (const item of result) {
    assert.ok(
      (allowedPlatforms as readonly Platform[]).includes(item.platform),
      `Item platform should be Twitter or LinkedIn, got ${item.platform}`
    );
    assert.ok(
      (allowedTypes as readonly string[]).includes(item.type),
      `Item type should be comment or mention, got ${item.type}`
    );
    assert.equal(item.isRead, false, "Item should be unread");
  }
});

test("mock data covers at least 2 platforms with items", () => {
  const platformsWithItems = Object.entries(MOCK_INBOX_ITEMS)
    .filter(([, items]) => items.length > 0)
    .map(([platform]) => platform);
  
  assert.ok(
    platformsWithItems.length >= 2,
    `Expected at least 2 platforms with mock items, got ${platformsWithItems.length}`
  );
});

test("mock data includes all item types", () => {
  const allItems = getMockInboxItems();
  const types = new Set(allItems.map((item) => item.type));
  
  assert.ok(types.has("comment"), "Mock data should include comments");
  assert.ok(types.has("mention"), "Mock data should include mentions");
  assert.ok(types.has("message"), "Mock data should include messages");
  assert.ok(types.has("reply"), "Mock data should include replies");
});

test("each inbox item has required fields", () => {
  const allItems = getMockInboxItems();
  
  for (const item of allItems) {
    assert.ok(item.id, `Item missing id`);
    assert.ok(item.platform, `Item ${item.id} missing platform`);
    assert.ok(item.type, `Item ${item.id} missing type`);
    assert.ok(item.author, `Item ${item.id} missing author`);
    assert.ok(item.author.id, `Item ${item.id} author missing id`);
    assert.ok(item.content, `Item ${item.id} missing content`);
    assert.ok(item.createdAt, `Item ${item.id} missing createdAt`);
    assert.equal(typeof item.isRead, "boolean", `Item ${item.id} isRead should be boolean`);
    assert.equal(typeof item.isReplied, "boolean", `Item ${item.id} isReplied should be boolean`);
  }
});

function createMockItem(id: string, platform: Platform, createdAt: string): InboxItem {
  return {
    id,
    platform,
    type: "comment" as const,
    author: { id: `author_${id}`, displayName: `Author ${id}` },
    content: `Test content for ${id}`,
    createdAt,
    isRead: false,
    isReplied: false,
  };
}

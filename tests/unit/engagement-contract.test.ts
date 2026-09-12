import { test } from "node:test";
import assert from "node:assert/strict";
import { Platform } from "@prisma/client";
import { PLATFORM_CONFIGS, type PlatformAdapter } from "../../src/types/platform";
import { adapters } from "../../src/lib/adapters";
import { createMockAdapter } from "../../src/lib/adapters/mock";
import {
  ENGAGEMENT_CAPABILITY_METHODS,
  adapterDeclaresEngagementMethod,
  engagementMethodsForCapability,
} from "../../src/lib/adapters/engagement-contract";
import { mockResetEngagementStore } from "../../src/lib/adapters/mock-engagement-store";

const allPlatforms = Object.values(Platform) as Platform[];

const engagementFlags = Object.keys(ENGAGEMENT_CAPABILITY_METHODS) as Array<
  keyof typeof ENGAGEMENT_CAPABILITY_METHODS
>;

function adapterImplementsCapability(adapter: PlatformAdapter, capability: keyof typeof ENGAGEMENT_CAPABILITY_METHODS): boolean {
  const methods = engagementMethodsForCapability(capability);
  return methods.some((method) => adapterDeclaresEngagementMethod(adapter, method));
}

test("engagement capability flags agree with declared adapter methods", () => {
  for (const platform of allPlatforms) {
    const adapter = adapters[platform];
    const caps = PLATFORM_CONFIGS[platform].capabilities;

    for (const flag of engagementFlags) {
      const declared = caps[flag];
      const implemented = adapterImplementsCapability(adapter, flag);

      if (declared) {
        assert.equal(
          implemented,
          true,
          `${platform}: ${flag} is true in PLATFORM_CONFIGS but no adapter method is implemented`,
        );
      } else {
        assert.equal(
          implemented,
          false,
          `${platform}: ${flag} is false but adapter declares ${engagementMethodsForCapability(flag).join(", ")}`,
        );
      }
    }
  }
});

test("mock connector engagement round trip", async () => {
  mockResetEngagementStore();
  const adapter = createMockAdapter(Platform.LINKEDIN);
  const token = "mock_token";
  const postId = "mock_post_engagement";

  const empty = await adapter.listComments!(token, { platformPostId: postId });
  assert.equal(empty.success, true);
  assert.deepEqual(empty.items, []);

  const created = await adapter.createComment!(token, {
    platformPostId: postId,
    text: "Top-level comment",
  });
  assert.equal(created.success, true);
  assert.ok(created.commentId);

  const replied = await adapter.replyToComment!(token, {
    commentId: created.commentId!,
    text: "Nested reply",
    platformPostId: postId,
  });
  assert.equal(replied.success, true);

  const listed = await adapter.listComments!(token, { platformPostId: postId, limit: 10 });
  assert.equal(listed.success, true);
  assert.equal(listed.items?.length, 2);

  const reacted = await adapter.reactToComment!(token, {
    commentId: created.commentId!,
    kind: "like",
  });
  assert.equal(reacted.success, true);

  const unreacted = await adapter.unreactToComment!(token, {
    commentId: created.commentId!,
    kind: "like",
  });
  assert.equal(unreacted.success, true);

  const deleted = await adapter.deleteComment!(token, { commentId: created.commentId! });
  assert.equal(deleted.success, true);

  const afterDelete = await adapter.listComments!(token, { platformPostId: postId });
  assert.equal(afterDelete.items?.length, 1);
  assert.equal(afterDelete.items?.[0].id, replied.commentId);
});

test("mock connector pagination uses opaque cursor offsets", async () => {
  mockResetEngagementStore();
  const adapter = createMockAdapter(Platform.FACEBOOK);
  const token = "mock_token";
  const postId = "mock_post_pagination";

  for (let i = 0; i < 5; i++) {
    const result = await adapter.createComment!(token, {
      platformPostId: postId,
      text: `Comment ${i}`,
    });
    assert.equal(result.success, true);
  }

  const page1 = await adapter.listComments!(token, { platformPostId: postId, limit: 2 });
  assert.equal(page1.items?.length, 2);
  assert.equal(page1.nextCursor, "2");

  const page2 = await adapter.listComments!(token, {
    platformPostId: postId,
    limit: 2,
    cursor: page1.nextCursor,
  });
  assert.equal(page2.items?.length, 2);
  assert.equal(page2.nextCursor, "4");

  const page3 = await adapter.listComments!(token, {
    platformPostId: postId,
    limit: 2,
    cursor: page2.nextCursor,
  });
  assert.equal(page3.items?.length, 1);
  assert.equal(page3.nextCursor, null);
});

test("undeclared engagement capability is never reported as available in PLATFORM_CONFIGS", () => {
  for (const platform of allPlatforms) {
    const caps = PLATFORM_CONFIGS[platform].capabilities;
    for (const flag of engagementFlags) {
      if (!caps[flag]) {
        const adapter = adapters[platform];
        assert.equal(
          adapterImplementsCapability(adapter, flag),
          false,
          `${platform} must not implement ${flag} when the static capability is false`,
        );
      }
    }
  }
});

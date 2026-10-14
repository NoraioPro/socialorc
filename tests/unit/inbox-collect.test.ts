import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { Platform, type SocialAccount } from "@prisma/client";
import { createMockAdapter } from "../../src/lib/adapters/mock";
import { linkedInAdapter } from "../../src/lib/adapters/linkedin";
import { adapterFailureResponse } from "../../src/lib/social/engagement-api";
import {
  applyInboxState,
  collectInbox,
  commentsToItems,
  filterInbox,
  type InboxDeps,
  type InboxLimits,
  type InboxSource,
} from "../../src/lib/inbox/collect";
import type { ListCommentsResult, PlatformAdapter, SocialComment } from "../../src/types/platform";

const LIMITS: InboxLimits = {
  concurrency: 2,
  perAccountTimeoutMs: 200,
  maxPostsPerAccount: 2,
  commentsPerPost: 10,
  maxAccounts: 10,
};

function account(id: string, platform: Platform, extra: Partial<SocialAccount> = {}): SocialAccount {
  return {
    id,
    userId: "u1",
    workspaceId: "ws1",
    brainId: null,
    platform,
    platformUserId: `me_${id}`,
    platformUsername: `user_${id}`,
    displayName: `Account ${id}`,
    profileImageUrl: null,
    accessToken: "enc",
    refreshToken: null,
    tokenExpiresAt: null,
    metadata: null,
    accountType: null,
    externalParentId: null,
    scopes: null,
    capabilities: null,
    refreshTokenExpiresAt: null,
    disconnectedAt: null,
    isActive: true,
    lastSyncAt: null,
    lastError: null,
    needsReconnect: false,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...extra,
  } as SocialAccount;
}

function post(n: number) {
  return { id: `post${n}`, platformPostId: `pp${n}`, platformPostUrl: null, content: `Post ${n} body` };
}

function comment(id: string, platformPostId: string, extra: Partial<SocialComment> = {}): SocialComment {
  return {
    id,
    platform: Platform.FACEBOOK,
    platformPostId,
    authorId: `fan_${id}`,
    authorName: `Fan ${id}`,
    text: `text ${id}`,
    createdAt: new Date(`2026-10-0${id.length % 9 || 1}T10:00:00Z`),
    canReply: true,
    canReact: true,
    canDelete: true,
    ...extra,
  };
}

/** Deps where every account's adapter answers with `list(account, postId)`. */
function deps(
  list: (accountId: string, platformPostId: string) => Promise<ListCommentsResult>,
  overrides: Partial<InboxDeps> = {},
): InboxDeps & { prepared: string[]; reported: string[] } {
  const prepared: string[] = [];
  const reported: string[] = [];
  return {
    prepared,
    reported,
    adapterFor: (platform) =>
      platform === Platform.LINKEDIN ? linkedInAdapter : createMockAdapter(platform),
    prepare: async (acc) => {
      prepared.push(acc.id);
      const adapter = createMockAdapter(acc.platform) as PlatformAdapter;
      adapter.listComments = (_token, options) => list(acc.id, options.platformPostId);
      return {
        ok: true,
        ctx: { account: acc, adapter, accessToken: "tok", destinationOptions: {} },
      };
    },
    reportFailure: async (accountId, platform, error) => {
      reported.push(accountId);
      return adapterFailureResponse(
        platform,
        error ?? "failed",
        /expired/i.test(error ?? "") ? "AUTH_EXPIRED" : "UNKNOWN",
      );
    },
    ...overrides,
  };
}

test("reads comments through the engagement adapter and maps them to items", async () => {
  const d = deps(async (_a, pp) => ({
    success: true,
    items: [comment(`c_${pp}`, pp), comment(`r_${pp}`, pp, { parentCommentId: `c_${pp}` })],
  }));
  const result = await collectInbox(
    [{ account: account("a1", Platform.FACEBOOK), posts: [post(1), post(2), post(3)] }],
    d,
    LIMITS,
  );

  assert.equal(result.accounts[0].state, "ok");
  // maxPostsPerAccount = 2: the third post is never read.
  assert.equal(result.accounts[0].postsChecked, 2);
  assert.equal(result.items.length, 4);
  const reply = result.items.find((i) => i.commentId === "r_pp1")!;
  assert.equal(reply.type, "reply");
  assert.equal(reply.parentCommentId, "c_pp1");
  assert.equal(reply.accountId, "a1");
  assert.equal(reply.post.id, "post1");
  assert.equal(reply.post.platformPostId, "pp1");
  assert.equal(reply.canReply, true);
  assert.equal(reply.isRead, false);
});

test("the account's own comments are not inbox items, but mark their parent replied", () => {
  const acc = account("a1", Platform.FACEBOOK);
  const items = commentsToItems(
    acc,
    post(1),
    [
      comment("c1", "pp1"),
      comment("mine", "pp1", { authorId: acc.platformUserId, parentCommentId: "c1" }),
      comment("c2", "pp1"),
    ],
    true,
  );
  assert.deepEqual(items.map((i) => i.commentId), ["c1", "c2"]);
  assert.equal(items[0].isReplied, true);
  assert.equal(items[1].isReplied, false);
});

test("a platform that cannot list comments is reported, never called", async () => {
  const d = deps(async () => ({ success: true, items: [] }));
  const result = await collectInbox(
    [{ account: account("li", Platform.LINKEDIN), posts: [post(1)] }],
    d,
    LIMITS,
  );
  assert.equal(result.accounts[0].state, "unsupported");
  assert.ok(result.accounts[0].message);
  assert.deepEqual(d.prepared, []);
});

test("an account flagged needsReconnect is not called; no posts is its own state", async () => {
  const d = deps(async () => ({ success: true, items: [] }));
  const result = await collectInbox(
    [
      { account: account("stale", Platform.FACEBOOK, { needsReconnect: true }), posts: [post(1)] },
      { account: account("fresh", Platform.FACEBOOK), posts: [] },
    ],
    d,
    LIMITS,
  );
  assert.equal(result.accounts[0].state, "needs_reconnect");
  assert.equal(result.accounts[1].state, "no_posts");
  assert.deepEqual(d.prepared, []);
});

test("one account failing does not fail the others", async () => {
  const d = deps(async (accountId, pp) =>
    accountId === "bad"
      ? { success: false, error: "Token expired" }
      : { success: true, items: [comment(`c_${pp}`, pp)] },
  );
  d.prepare = (async (acc: SocialAccount) => {
    if (acc.id === "refusing") {
      return { ok: false, status: 503, body: { error: "FACEBOOK connector is not configured" } };
    }
    const adapter = createMockAdapter(acc.platform) as PlatformAdapter;
    adapter.listComments = (_t, o) =>
      acc.id === "bad"
        ? Promise.resolve({ success: false, error: "Token expired" })
        : Promise.resolve({ success: true, items: [comment(`c_${o.platformPostId}`, o.platformPostId)] });
    return { ok: true, ctx: { account: acc, adapter, accessToken: "t", destinationOptions: {} } };
  }) as InboxDeps["prepare"];

  const result = await collectInbox(
    [
      { account: account("good", Platform.FACEBOOK), posts: [post(1)] },
      { account: account("bad", Platform.FACEBOOK), posts: [post(2)] },
      { account: account("refusing", Platform.FACEBOOK), posts: [post(3)] },
    ],
    d,
    LIMITS,
  );
  const byId = Object.fromEntries(result.accounts.map((a) => [a.accountId, a]));
  assert.equal(byId.good.state, "ok");
  assert.equal(byId.bad.state, "needs_reconnect");
  assert.equal(byId.refusing.state, "error");
  assert.match(byId.refusing.message ?? "", /not configured/);
  // The auth failure went through the shared reconnect bookkeeping.
  assert.deepEqual(d.reported, ["bad"]);
  assert.deepEqual(result.items.map((i) => i.accountId), ["good"]);
});

test("a slow account times out with what it read so far; the request stays bounded", async () => {
  const d = deps(async (accountId, pp) => {
    if (accountId === "slow" && pp === "pp2") await new Promise((r) => setTimeout(r, 2_000));
    return { success: true, items: [comment(`c_${accountId}_${pp}`, pp)] };
  });
  const started = Date.now();
  const result = await collectInbox(
    [
      { account: account("slow", Platform.FACEBOOK), posts: [post(1), post(2)] },
      { account: account("quick", Platform.FACEBOOK), posts: [post(1)] },
    ],
    d,
    LIMITS,
  );
  assert.ok(Date.now() - started < 1_000, "timeout must cut the slow account off");
  const slow = result.accounts.find((a) => a.accountId === "slow")!;
  assert.equal(slow.state, "timeout");
  assert.equal(slow.itemCount, 1);
  assert.equal(result.accounts.find((a) => a.accountId === "quick")!.state, "ok");
});

test("never more accounts in flight than the concurrency limit; extras are skipped", async () => {
  let inFlight = 0;
  let peak = 0;
  const d = deps(async (_a, pp) => {
    inFlight += 1;
    peak = Math.max(peak, inFlight);
    await new Promise((r) => setTimeout(r, 10));
    inFlight -= 1;
    return { success: true, items: [comment(`c_${pp}`, pp)] };
  });
  const sources: InboxSource[] = Array.from({ length: 6 }, (_, i) => ({
    account: account(`a${i}`, Platform.FACEBOOK),
    posts: [post(i)],
  }));
  const result = await collectInbox(sources, d, { ...LIMITS, maxAccounts: 5 });
  assert.ok(peak <= LIMITS.concurrency, `peak ${peak}`);
  assert.equal(result.accounts.length, 6);
  assert.equal(result.accounts[5].state, "skipped");
  assert.equal(d.prepared.length, 5);
});

test("stored read/replied state overlays live items; filters apply after", () => {
  const acc = account("a1", Platform.FACEBOOK);
  const items = commentsToItems(acc, post(1), [comment("c1", "pp1"), comment("c2", "pp1")], true);
  const merged = applyInboxState(items, [
    { socialAccountId: "a1", commentId: "c1", readAt: new Date(), repliedAt: null },
    // Same comment id on another account must not leak across.
    { socialAccountId: "a2", commentId: "c2", readAt: new Date(), repliedAt: new Date() },
  ]);
  assert.equal(merged[0].isRead, true);
  assert.equal(merged[1].isRead, false);
  assert.deepEqual(filterInbox(merged, { unreadOnly: true }).map((i) => i.commentId), ["c2"]);
  assert.equal(filterInbox(merged, { platforms: [Platform.TWITTER] }).length, 0);
  assert.equal(filterInbox(merged, { limit: 1 }).length, 1);

  const replied = applyInboxState(items, [
    // Replied, then marked unread again by a teammate.
    { socialAccountId: "a1", commentId: "c2", readAt: null, repliedAt: new Date() },
  ]);
  assert.equal(replied[1].isReplied, true);
  assert.equal(replied[1].isRead, false, "unread is whatever readAt says");
});

test("two Telegram chats reusing a message id keep separate read state", () => {
  const chatA = account("tg-a", Platform.TELEGRAM);
  const chatB = account("tg-b", Platform.TELEGRAM);
  const items = [
    ...commentsToItems(chatA, post(1), [comment("42", "pp1")], true),
    ...commentsToItems(chatB, post(2), [comment("42", "pp2")], true),
  ];
  const merged = applyInboxState(items, [
    { socialAccountId: "tg-a", commentId: "42", readAt: new Date(), repliedAt: new Date() },
  ]);
  assert.equal(merged[0].isRead, true);
  assert.equal(merged[0].isReplied, true);
  assert.equal(merged[1].isRead, false, "chat B's message 42 is a different message");
  assert.equal(merged[1].isReplied, false);
});

test("inbox read state is keyed by account + comment id, checked against the workspace", () => {
  const source = readFileSync("src/app/api/inbox/route.ts", "utf8");
  assert.match(source, /socialAccountId_commentId: \{ socialAccountId: account\.id, commentId: body\.commentId \}/);
  assert.doesNotMatch(source, /workspaceId_platform_commentId/);
  // The account is resolved (workspace + platform) before ANY write, read state included.
  const lookup = source.indexOf("loadWorkspaceAccount(workspaceId, body.accountId)");
  assert.ok(lookup > 0 && lookup < source.indexOf('body.action === "markRead"'));
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const model = schema.slice(schema.indexOf("model InboxItemState"));
  assert.match(model.slice(0, model.indexOf("}")), /@@unique\(\[socialAccountId, commentId\]\)/);
});

test("inbox posts are queried per account, so a busy account cannot starve the rest", () => {
  const source = readFileSync("src/app/api/inbox/route.ts", "utf8");
  const query = source.slice(source.indexOf("prisma.post.findMany("));
  const call = query.slice(0, query.indexOf("})") + 2);
  assert.match(call, /socialAccountId: account\.id/);
  assert.match(call, /take: DEFAULT_INBOX_LIMITS\.maxPostsPerAccount/);
  assert.doesNotMatch(source, /accounts\.length \* DEFAULT_INBOX_LIMITS/);
  // Bounded: only the accounts collectInbox will read are queried.
  assert.match(source, /accounts\.slice\(0, DEFAULT_INBOX_LIMITS\.maxAccounts\)/);
});

test("the inbox route is workspace-scoped and reuses the engagement write path", () => {
  const source = readFileSync("src/app/api/inbox/route.ts", "utf8");
  assert.match(source, /loadWorkspaceAccount\(workspaceId, body\.accountId\)/);
  assert.match(source, /sendEngagementComment\(/);
  assert.match(source, /prisma\.socialAccount\.findMany\(\{\s*where: \{\s*workspaceId,/);
  assert.match(source, /prisma\.post\.findMany\(\{\s*where: \{\s*workspaceId,/);
  assert.match(source, /inboxItemState\.findMany\(\{\s*where: \{\s*workspaceId,/);
  // The sample-data inbox is gone from the production path.
  assert.equal(existsSync("src/lib/inbox/mock-data.ts"), false);
  assert.doesNotMatch(source, /mock-data|createUnifiedInbox/);
});

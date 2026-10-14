/**
 * Unified inbox = the Engagement layer, fanned out.
 *
 * For every connected account in the workspace whose adapter can list comments,
 * read the comments on its most recent published posts through the very same
 * calls the Engagement API makes (`prepareEngagementContext` for token refresh
 * and reconnect bookkeeping, `adapter.listComments`, `handleEngagementResultFailure`).
 * Nothing here talks to a platform directly, and nothing is a fixture: with
 * MOCK_SOCIAL_ADAPTERS=true the mock adapter answers, exactly as it does for
 * Engagement.
 *
 * The fan-out is bounded so one request stays well inside a serverless budget:
 * a concurrency cap across accounts, a hard per-account deadline, and a cap on
 * how many posts each account reads. One account failing — or being slow —
 * becomes that account's status line; it never fails the inbox.
 */

import type { Platform, SocialAccount } from "@prisma/client";
import { getAdapter } from "@/lib/adapters";
import {
  engagementCapabilitiesForPlatform,
  engagementFailureStatus,
  handleEngagementResultFailure,
  prepareEngagementContext,
} from "@/lib/social/engagement-api";
import { PLATFORM_CONFIGS, type PlatformAdapter, type SocialComment } from "@/types/platform";
import type {
  InboxAccountStatus,
  InboxCoverage,
  InboxItem,
} from "@/types/inbox";

export interface InboxLimits {
  /** Accounts read at the same time. */
  concurrency: number;
  /** Hard deadline for one account (refresh + every post it reads). */
  perAccountTimeoutMs: number;
  /** Most recent published posts read per account. */
  maxPostsPerAccount: number;
  /** Comments requested per post (one page; no pagination). */
  commentsPerPost: number;
  /** Accounts read per request; the rest are reported as skipped. */
  maxAccounts: number;
}

/**
 * Worst case ≈ ceil(maxAccounts / concurrency) × perAccountTimeoutMs
 * = 5 × 6 s = 30 s; in practice accounts finish in well under a second each.
 */
export const DEFAULT_INBOX_LIMITS: InboxLimits = {
  concurrency: 5,
  perAccountTimeoutMs: 6_000,
  maxPostsPerAccount: 5,
  commentsPerPost: 25,
  maxAccounts: 25,
};

export function inboxCoverage(limits: InboxLimits = DEFAULT_INBOX_LIMITS): InboxCoverage {
  return {
    sources: ["Comments on your published posts", "Replies within those comment threads"],
    notCovered: ["Direct messages", "Mentions outside your own posts"],
    maxPostsPerAccount: limits.maxPostsPerAccount,
    commentsPerPost: limits.commentsPerPost,
  };
}

export interface InboxSourcePost {
  id: string;
  platformPostId: string;
  platformPostUrl: string | null;
  content: string;
}

export interface InboxSource {
  account: SocialAccount;
  /** Newest first; already restricted to this account and workspace. */
  posts: InboxSourcePost[];
}

export interface InboxDeps {
  adapterFor: (platform: Platform) => PlatformAdapter;
  prepare: typeof prepareEngagementContext;
  reportFailure: typeof handleEngagementResultFailure;
}

export const defaultInboxDeps: InboxDeps = {
  // Same adapter selection as prepareEngagementContext, so the capability
  // answer here matches the adapter that will actually be called.
  adapterFor: (platform) => getAdapter(platform, { useMockIfUnconfigured: true }),
  prepare: prepareEngagementContext,
  reportFailure: handleEngagementResultFailure,
};

export interface InboxCollection {
  items: InboxItem[];
  accounts: InboxAccountStatus[];
}

function accountName(account: SocialAccount): string {
  return (
    account.displayName ||
    account.platformUsername ||
    `${PLATFORM_CONFIGS[account.platform].name} account`
  );
}

function preview(content: string): string {
  const flat = content.replace(/\s+/g, " ").trim();
  return flat.length > 140 ? `${flat.slice(0, 137)}...` : flat;
}

function failureMessage(body: Record<string, unknown>): string {
  const error = body.error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  if (typeof error === "string") return error;
  if (typeof body.message === "string") return body.message;
  return "The platform rejected the request.";
}

function toIso(value: Date | string): string {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

/**
 * Turn one post's comments into inbox items. The account's own comments are
 * not inbox items (nobody needs to triage what they wrote), but an own reply
 * marks its parent as replied.
 */
export function commentsToItems(
  account: Pick<SocialAccount, "id" | "platform" | "platformUserId">,
  post: InboxSourcePost,
  comments: SocialComment[],
  canReply: boolean,
): InboxItem[] {
  const own = (c: SocialComment) => c.authorId === account.platformUserId;
  const answered = new Set(
    comments.filter((c) => own(c) && c.parentCommentId).map((c) => c.parentCommentId as string),
  );

  return comments
    .filter((c) => !own(c))
    .map((c) => ({
      id: `${account.id}:${c.id}`,
      commentId: c.id,
      accountId: account.id,
      platform: account.platform,
      type: c.parentCommentId ? ("reply" as const) : ("comment" as const),
      author: {
        id: c.authorId,
        name: c.authorName || "Unknown",
        ...(c.authorAvatarUrl ? { avatarUrl: c.authorAvatarUrl } : {}),
      },
      content: c.text,
      createdAt: toIso(c.createdAt),
      ...(c.parentCommentId ? { parentCommentId: c.parentCommentId } : {}),
      ...(c.permalink ? { permalink: c.permalink } : {}),
      post: {
        id: post.id,
        platformPostId: post.platformPostId,
        platformPostUrl: post.platformPostUrl,
        preview: preview(post.content),
      },
      canReply: canReply && c.canReply,
      isRead: false,
      isReplied: answered.has(c.id),
    }));
}

class InboxTimeout extends Error {}

/** Run `work` with a deadline; on timeout, `work` is told to stop at its next step. */
async function withDeadline<T>(
  ms: number,
  work: (expired: () => boolean) => Promise<T>,
): Promise<T> {
  let expired = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      reject(new InboxTimeout());
    }, ms);
  });
  try {
    return await Promise.race([work(() => expired), deadline]);
  } finally {
    clearTimeout(timer);
  }
}

async function mapWithConcurrency<T, R>(
  inputs: T[],
  limit: number,
  fn: (input: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(inputs.length);
  let next = 0;
  const workers = Array.from({ length: Math.max(1, Math.min(limit, inputs.length)) }, async () => {
    while (next < inputs.length) {
      const index = next++;
      results[index] = await fn(inputs[index]);
    }
  });
  await Promise.all(workers);
  return results;
}

async function collectAccount(
  source: InboxSource,
  deps: InboxDeps,
  limits: InboxLimits,
): Promise<InboxCollection> {
  const { account } = source;
  const status: InboxAccountStatus = {
    accountId: account.id,
    platform: account.platform,
    name: accountName(account),
    state: "ok",
    postsChecked: 0,
    itemCount: 0,
    canReply: false,
  };
  const done = (state: InboxAccountStatus["state"], message?: string, items: InboxItem[] = []) => ({
    items,
    accounts: [{ ...status, state, ...(message ? { message } : {}), itemCount: items.length }],
  });

  if (account.needsReconnect) {
    return done(
      "needs_reconnect",
      account.lastError
        ? `Reconnect this account in Settings. Last error: ${account.lastError}`
        : "Reconnect this account in Settings.",
    );
  }

  const capabilities = engagementCapabilitiesForPlatform(account.platform, deps.adapterFor(account.platform));
  if (!capabilities.readComments.available) {
    return done("unsupported", capabilities.readComments.message);
  }
  status.canReply = capabilities.replyToComments.available;

  const posts = source.posts.slice(0, limits.maxPostsPerAccount);
  if (posts.length === 0) {
    return done("no_posts", "No published posts from this account yet, so there are no comments to read.");
  }

  // Filled as the work progresses, so a timeout still returns what was read.
  const items: InboxItem[] = [];
  const errors: string[] = [];

  try {
    const outcome = await withDeadline(limits.perAccountTimeoutMs, async (expired) => {
      const prepared = await deps.prepare(account);
      if (!prepared.ok) {
        return {
          state: prepared.status === 401 ? ("needs_reconnect" as const) : ("error" as const),
          message: failureMessage(prepared.body),
        };
      }
      const { ctx } = prepared;

      for (const post of posts) {
        if (expired()) break;
        const result = await ctx.adapter.listComments!(ctx.accessToken, {
          platformPostId: post.platformPostId,
          limit: limits.commentsPerPost,
          additionalOptions: ctx.destinationOptions,
        });
        if (expired()) break;
        status.postsChecked += 1;

        if (!result.success) {
          const failure = await deps.reportFailure(account.id, account.platform, result.error);
          if (engagementFailureStatus(failure) === 401) {
            return { state: "needs_reconnect" as const, message: failure.error.message };
          }
          errors.push(failure.error.message);
          continue;
        }
        items.push(...commentsToItems(account, post, result.items ?? [], status.canReply));
      }

      if (errors.length > 0) {
        return {
          state: "error" as const,
          message: `${errors.length} of ${posts.length} posts could not be read: ${errors[0]}`,
        };
      }
      return { state: "ok" as const, message: undefined };
    });
    return done(outcome.state, outcome.message, [...items]);
  } catch (error) {
    if (error instanceof InboxTimeout) {
      return done(
        "timeout",
        `${PLATFORM_CONFIGS[account.platform].name} did not answer within ${Math.round(
          limits.perAccountTimeoutMs / 1000,
        )}s; showing what was read before that.`,
        [...items],
      );
    }
    return done("error", error instanceof Error ? error.message : "Reading comments failed", [...items]);
  }
}

/** Read every source with the limits above. Item order: newest first. */
export async function collectInbox(
  sources: InboxSource[],
  deps: InboxDeps = defaultInboxDeps,
  limits: InboxLimits = DEFAULT_INBOX_LIMITS,
): Promise<InboxCollection> {
  const read = sources.slice(0, limits.maxAccounts);
  const skipped = sources.slice(limits.maxAccounts);

  const collected = await mapWithConcurrency(read, limits.concurrency, (source) =>
    collectAccount(source, deps, limits),
  );

  const items = collected.flatMap((c) => c.items);
  items.sort((a, b) => b.createdAt.localeCompare(a.createdAt));

  return {
    items,
    accounts: [
      ...collected.flatMap((c) => c.accounts),
      ...skipped.map(({ account }) => ({
        accountId: account.id,
        platform: account.platform,
        name: accountName(account),
        state: "skipped" as const,
        message: `Only the first ${limits.maxAccounts} accounts are read per refresh.`,
        postsChecked: 0,
        itemCount: 0,
        canReply: false,
      })),
    ],
  };
}

export interface InboxStateRow {
  platform: Platform;
  commentId: string;
  readAt: Date | null;
  repliedAt: Date | null;
}

/** Overlay the workspace's stored read/replied state onto live items. */
export function applyInboxState(items: InboxItem[], states: InboxStateRow[]): InboxItem[] {
  const byKey = new Map(states.map((s) => [`${s.platform}:${s.commentId}`, s]));
  return items.map((item) => {
    const state = byKey.get(`${item.platform}:${item.commentId}`);
    if (!state) return item;
    // Replying from the inbox also sets readAt, so "mark unread" afterwards
    // still works: read is exactly readAt.
    return {
      ...item,
      isReplied: item.isReplied || Boolean(state.repliedAt),
      isRead: Boolean(state.readAt),
    };
  });
}

export interface InboxFilter {
  platforms?: Platform[];
  unreadOnly?: boolean;
  limit?: number;
}

export function filterInbox(items: InboxItem[], filter: InboxFilter): InboxItem[] {
  let out = items;
  if (filter.platforms && filter.platforms.length > 0) {
    const allowed = new Set(filter.platforms);
    out = out.filter((i) => allowed.has(i.platform));
  }
  if (filter.unreadOnly) out = out.filter((i) => !i.isRead);
  if (filter.limit && filter.limit > 0) out = out.slice(0, filter.limit);
  return out;
}

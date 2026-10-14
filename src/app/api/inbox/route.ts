import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { Platform } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireWorkspace } from "@/lib/tenancy/guard";
import {
  loadWorkspaceAccount,
  sendEngagementComment,
} from "@/lib/social/engagement-api";
import {
  applyInboxState,
  collectInbox,
  DEFAULT_INBOX_LIMITS,
  filterInbox,
  inboxCoverage,
  type InboxSource,
} from "@/lib/inbox/collect";
import type { InboxResponse } from "@/types/inbox";

/**
 * The unified inbox: comments on the workspace's recent published posts, read
 * live through the Engagement layer (src/lib/inbox/collect.ts). Every query is
 * scoped to the caller's workspace; an account, post or read-state row of
 * another workspace is never loaded.
 */

// Fan-out is bounded in collect.ts; this is the platform ceiling on top of it.
export const maxDuration = 60;
export const dynamic = "force-dynamic";

const PLATFORMS = new Set<string>(Object.values(Platform));

export async function GET(req: NextRequest) {
  // Reading the inbox is a view permission; acting on it is engagement:reply.
  const guard = await requireWorkspace("engagement:view");
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const { workspaceId } = guard;
  const params = req.nextUrl.searchParams;

  const platforms = (params.get("platforms") ?? "")
    .split(",")
    .filter((p): p is Platform => PLATFORMS.has(p));
  const unreadOnly = params.get("unreadOnly") === "true";
  const limitRaw = Number.parseInt(params.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 200;

  const accounts = await prisma.socialAccount.findMany({
    where: {
      workspaceId,
      isActive: true,
      ...(platforms.length > 0 ? { platform: { in: platforms } } : {}),
    },
    orderBy: { createdAt: "asc" },
  });

  const coverage = inboxCoverage();
  if (accounts.length === 0) {
    return NextResponse.json({
      items: [],
      accounts: [],
      coverage,
      totalCount: 0,
      unreadCount: 0,
      generatedAt: new Date().toISOString(),
    } satisfies InboxResponse);
  }

  // Newest published posts that the platform can be asked about. One query for
  // all accounts, trimmed per account below; the take bounds it either way.
  const posts = await prisma.post.findMany({
    where: {
      workspaceId,
      status: "PUBLISHED",
      platformPostId: { not: null },
      socialAccountId: { in: accounts.map((a) => a.id) },
    },
    orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
    take: accounts.length * DEFAULT_INBOX_LIMITS.maxPostsPerAccount * 4,
    select: {
      id: true,
      socialAccountId: true,
      platformPostId: true,
      platformPostUrl: true,
      content: true,
    },
  });

  const sources: InboxSource[] = accounts.map((account) => ({
    account,
    posts: posts
      .filter((p) => p.socialAccountId === account.id)
      .slice(0, DEFAULT_INBOX_LIMITS.maxPostsPerAccount)
      .map((p) => ({
        id: p.id,
        platformPostId: p.platformPostId as string,
        platformPostUrl: p.platformPostUrl,
        content: p.content,
      })),
  }));

  const collected = await collectInbox(sources);

  const states =
    collected.items.length === 0
      ? []
      : await prisma.inboxItemState.findMany({
          where: {
            workspaceId,
            socialAccountId: { in: accounts.map((a) => a.id) },
            commentId: { in: [...new Set(collected.items.map((i) => i.commentId))] },
          },
          select: { socialAccountId: true, commentId: true, readAt: true, repliedAt: true },
        });

  const all = applyInboxState(collected.items, states);
  const items = filterInbox(all, { unreadOnly, limit });

  return NextResponse.json({
    items,
    accounts: collected.accounts,
    coverage,
    totalCount: all.length,
    unreadCount: all.filter((i) => !i.isRead).length,
    generatedAt: new Date().toISOString(),
  } satisfies InboxResponse);
}

// An item is identified by the account it was read through plus its comment
// id: comment ids are only unique per account (Telegram message ids are per
// chat), so platform + comment id let two chats share one read state.
const itemRef = {
  platform: z.nativeEnum(Platform),
  commentId: z.string().min(1).max(512),
  accountId: z.string().min(1),
};

const patchSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("markRead"), ...itemRef }),
  z.object({ action: z.literal("markUnread"), ...itemRef }),
  z.object({
    action: z.literal("reply"),
    ...itemRef,
    platformPostId: z.string().min(1),
    content: z.string().trim().min(1).max(10_000),
  }),
]);

export async function PATCH(req: NextRequest) {
  // Triage and replies both act for the workspace: replying publishes a comment
  // on a real platform, and read state is shared by the whole team.
  const guard = await requireWorkspace("engagement:reply");
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }
  const { workspaceId } = guard;

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const parsed = patchSchema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid request", details: parsed.error.issues },
      { status: 400 },
    );
  }
  const body = parsed.data;

  // The account must be this workspace's, on the item's platform — for read
  // state as much as for replies, since it is now part of the key.
  const account = await loadWorkspaceAccount(workspaceId, body.accountId);
  if (!account || account.platform !== body.platform) {
    return NextResponse.json({ error: "Social account not found" }, { status: 404 });
  }

  const key = {
    socialAccountId_commentId: { socialAccountId: account.id, commentId: body.commentId },
  };
  const identity = {
    workspaceId,
    platform: body.platform,
    socialAccountId: account.id,
    commentId: body.commentId,
  };

  if (body.action === "markRead" || body.action === "markUnread") {
    const readAt = body.action === "markRead" ? new Date() : null;
    await prisma.inboxItemState.upsert({
      where: key,
      create: { ...identity, readAt },
      update: { readAt },
    });
    return NextResponse.json({ success: true, isRead: readAt !== null });
  }

  const sent = await sendEngagementComment(account, {
    platformPostId: body.platformPostId,
    text: body.content,
    parentCommentId: body.commentId,
  });
  if (!sent.ok) {
    return NextResponse.json(sent.body, { status: sent.status });
  }

  const now = new Date();
  await prisma.inboxItemState.upsert({
    where: key,
    create: { ...identity, readAt: now, repliedAt: now },
    update: { readAt: now, repliedAt: now },
  });

  return NextResponse.json({ success: true, commentId: sent.commentId }, { status: 201 });
}

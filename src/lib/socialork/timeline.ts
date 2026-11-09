import type { Platform, PostStatus } from "@prisma/client";
import prisma from "@/lib/prisma";
import type { TenantContext } from "@/lib/tenancy/guard";
import { activeBrainId } from "@/lib/tenancy/active-brain";

/**
 * The workspace Timeline: the team's posts that are in review, approved,
 * scheduled or published, plus team updates (NativePost rows stamped with the
 * workspace). Everything is scoped to the caller's workspace; posts also follow
 * the active brain, the same rule every other list uses.
 */

export const REACTION_TYPES = ["LIKE", "CELEBRATE", "INSIGHTFUL", "SUPPORT"] as const;
export type ReactionType = (typeof REACTION_TYPES)[number];

/** Who may see a team update: the whole workspace, or only its author. */
export const UPDATE_VISIBILITY = ["PUBLIC", "PRIVATE"] as const;
export type UpdateVisibility = (typeof UPDATE_VISIBILITY)[number];

export const TIMELINE_STATUSES: PostStatus[] = ["PUBLISHED", "SCHEDULED", "APPROVED", "PENDING_APPROVAL"];

export interface TimelinePerson { id: string; name: string; initials: string; headline: string | null }
export interface TimelineReaction { userId: string; type: string }
export interface TimelineComment { id: string; userId: string; body: string; at: string }

interface Base {
  id: string;
  authorId: string;
  /** ISO time the item is ordered and grouped by. */
  at: string;
  body: string;
  reactions: TimelineReaction[];
  comments: TimelineComment[];
}

export interface TimelinePost extends Base {
  kind: "post";
  title: string | null;
  platform: Platform;
  status: PostStatus;
  handle: string | null;
  url: string | null;
  scheduledFor: string | null;
  publishedAt: string | null;
  createdAt: string;
  approvedAt: string | null;
  approvedBy: string | null;
  media: { url: string; video: boolean; count: number } | null;
}

export interface TimelineUpdate extends Base {
  kind: "update";
  visibility: UpdateVisibility;
}

export type TimelineItem = TimelinePost | TimelineUpdate;

export interface UpNext { id: string; title: string; platform: Platform; status: PostStatus; at: string | null }

export interface TimelineData {
  viewerId: string;
  items: TimelineItem[];
  people: Record<string, TimelinePerson>;
  upNext: UpNext[];
  week: { published: number };
}

export function initialsOf(name: string): string {
  return (
    name
      .split(/[\s@._-]+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0]!.toUpperCase())
      .join("") || "?"
  );
}

const iso = (d: Date | null | undefined) => (d ? d.toISOString() : null);

export async function getTimeline(tenant: TenantContext, take = 40): Promise<TimelineData> {
  const brainId = await activeBrainId(tenant);
  const postWhere = {
    AND: [
      { OR: [{ workspaceId: tenant.workspaceId }, { userId: tenant.userId }] },
      { OR: [{ brainId }, { brainId: null }] },
    ],
  };
  const weekAgo = new Date(Date.now() - 7 * 864e5);

  const [posts, updates, upcoming, publishedThisWeek, members] = await Promise.all([
    prisma.post.findMany({
      where: { ...postWhere, status: { in: TIMELINE_STATUSES } },
      orderBy: [{ updatedAt: "desc" }],
      take,
      select: {
        id: true, userId: true, title: true, content: true, platform: true, status: true,
        createdAt: true, updatedAt: true, publishedAt: true, scheduledFor: true,
        approvedAt: true, approvedBy: true, platformPostUrl: true,
        socialAccount: { select: { platformUsername: true } },
        mediaAssets: { orderBy: { order: "asc" }, select: { mediaAsset: { select: { url: true, mimeType: true } } } },
        feedReactions: { select: { userId: true, type: true } },
        feedComments: { orderBy: { createdAt: "asc" }, take: 50, select: { id: true, userId: true, content: true, createdAt: true } },
      },
    }),
    prisma.nativePost.findMany({
      where: {
        workspaceId: tenant.workspaceId,
        deletedAt: null,
        OR: [{ visibility: "PUBLIC" }, { authorId: tenant.userId }],
      },
      orderBy: { createdAt: "desc" },
      take,
      select: {
        id: true, authorId: true, body: true, visibility: true, createdAt: true,
        reactions: { select: { userId: true, type: true } },
        comments: { orderBy: { createdAt: "asc" }, take: 50, select: { id: true, userId: true, content: true, createdAt: true } },
      },
    }),
    prisma.post.findMany({
      where: { ...postWhere, status: { in: ["SCHEDULED", "APPROVED"] } },
      orderBy: [{ scheduledFor: "asc" }, { updatedAt: "desc" }],
      take: 5,
      select: { id: true, title: true, content: true, platform: true, status: true, scheduledFor: true },
    }),
    prisma.post.count({ where: { ...postWhere, status: "PUBLISHED", publishedAt: { gte: weekAgo } } }),
    prisma.workspaceMember.findMany({
      where: { workspaceId: tenant.workspaceId },
      select: { user: { select: { id: true, name: true, email: true, headline: true } } },
    }),
  ]);

  const items: TimelineItem[] = [
    ...posts.map((p): TimelinePost => {
      const first = p.mediaAssets[0]?.mediaAsset;
      // A published post sorts by when it went out, a scheduled one by when it
      // will, everything else by its last change.
      const at = p.status === "PUBLISHED" ? p.publishedAt ?? p.updatedAt : p.status === "SCHEDULED" ? p.scheduledFor ?? p.updatedAt : p.updatedAt;
      return {
        kind: "post",
        id: p.id,
        authorId: p.userId,
        at: at.toISOString(),
        title: p.title,
        body: p.content,
        platform: p.platform,
        status: p.status,
        handle: p.socialAccount?.platformUsername ?? null,
        url: p.platformPostUrl,
        scheduledFor: iso(p.scheduledFor),
        publishedAt: iso(p.publishedAt),
        createdAt: p.createdAt.toISOString(),
        approvedAt: iso(p.approvedAt),
        approvedBy: p.approvedBy,
        media: first ? { url: first.url, video: first.mimeType.startsWith("video/"), count: p.mediaAssets.length } : null,
        reactions: p.feedReactions,
        comments: p.feedComments.map((c) => ({ id: c.id, userId: c.userId, body: c.content, at: c.createdAt.toISOString() })),
      };
    }),
    ...updates.map((u): TimelineUpdate => ({
      kind: "update",
      id: u.id,
      authorId: u.authorId,
      at: u.createdAt.toISOString(),
      body: u.body,
      visibility: u.visibility === "PRIVATE" ? "PRIVATE" : "PUBLIC",
      reactions: u.reactions,
      comments: u.comments.map((c) => ({ id: c.id, userId: c.userId, body: c.content, at: c.createdAt.toISOString() })),
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  // Everyone the screen may name: members, plus any author, commenter or
  // approver who has since left the workspace.
  const people: Record<string, TimelinePerson> = {};
  const add = (u: { id: string; name: string | null; email: string | null; headline: string | null }) => {
    const name = u.name || u.email || "A teammate";
    people[u.id] = { id: u.id, name, initials: initialsOf(name), headline: u.headline };
  };
  members.forEach((m) => add(m.user));
  const missing = new Set<string>();
  for (const it of items) {
    [it.authorId, ...it.reactions.map((r) => r.userId), ...it.comments.map((c) => c.userId)].forEach((id) => {
      if (!people[id]) missing.add(id);
    });
    if (it.kind === "post" && it.approvedBy && !people[it.approvedBy]) missing.add(it.approvedBy);
  }
  if (missing.size) {
    const rows = await prisma.user.findMany({
      where: { id: { in: [...missing] } },
      select: { id: true, name: true, email: true, headline: true },
    });
    rows.forEach(add);
  }

  return {
    viewerId: tenant.userId,
    items,
    people,
    upNext: upcoming.map((p) => ({
      id: p.id,
      title: p.title || p.content.slice(0, 80),
      platform: p.platform,
      status: p.status,
      at: iso(p.scheduledFor),
    })),
    week: { published: publishedThisWeek },
  };
}

/**
 * Server-side data for the SocialOrk screens.
 *
 * Every read is scoped to the caller's workspace (the tenant boundary in
 * `src/lib/tenancy/guard.ts`). Rows written before the workspace stamp existed
 * carry `workspaceId = null`; those are matched by their author so a fresh
 * workspace does not look emptier than it is. Nothing here mutates.
 */
import prisma from "@/lib/prisma";
import { tenantForUser, type TenantContext } from "@/lib/tenancy/guard";
import { PLATFORM_CONFIGS } from "@/types/platform";
import type { Platform, PostStatus } from "@prisma/client";

export type MaybeTenant = TenantContext | null;

export async function tenantFor(userId: string): Promise<MaybeTenant> {
  const t = await tenantForUser(userId);
  return t.ok ? t : null;
}

const postSelect = {
  id: true,
  title: true,
  content: true,
  platform: true,
  status: true,
  scheduledFor: true,
  publishedAt: true,
  approvedAt: true,
  approvedBy: true,
  platformPostUrl: true,
  errorMessage: true,
  retryCount: true,
  createdAt: true,
  updatedAt: true,
  socialAccount: { select: { platformUsername: true } },
} as const;

export type PostRow = {
  id: string;
  title: string | null;
  content: string;
  platform: Platform;
  status: PostStatus;
  scheduledFor: Date | null;
  publishedAt: Date | null;
  approvedAt: Date | null;
  approvedBy: string | null;
  platformPostUrl: string | null;
  errorMessage: string | null;
  retryCount: number;
  createdAt: Date;
  updatedAt: Date;
  socialAccount: { platformUsername: string | null } | null;
};

function scoped(tenant: TenantContext) {
  return { OR: [{ workspaceId: tenant.workspaceId }, { userId: tenant.userId }] };
}

export async function getShellData(tenant: TenantContext) {
  const where = scoped(tenant);
  const [workspace, brains, accounts, drafts, review, approved, scheduled, failed] =
    await Promise.all([
      prisma.workspace.findUnique({ where: { id: tenant.workspaceId }, select: { name: true, slug: true } }),
      prisma.brain.count({ where: { workspaceId: tenant.workspaceId } }),
      prisma.socialAccount.count({ where: { workspaceId: tenant.workspaceId, isActive: true } }),
      prisma.post.count({ where: { ...where, status: "DRAFT" } }),
      prisma.post.count({ where: { ...where, status: "PENDING_APPROVAL" } }),
      prisma.post.count({ where: { ...where, status: "APPROVED" } }),
      prisma.post.count({ where: { ...where, status: "SCHEDULED" } }),
      prisma.post.count({ where: { ...where, status: "FAILED" } }),
    ]);

  return {
    workspaceName: workspace?.name ?? "Workspace",
    brains,
    accounts,
    counts: { drafts, review, approved, scheduled, failed },
  };
}

export async function listPosts(tenant: TenantContext, statuses: PostStatus[], take = 50) {
  return prisma.post.findMany({
    where: { ...scoped(tenant), status: { in: statuses } },
    orderBy: [{ scheduledFor: "asc" }, { createdAt: "desc" }],
    take,
    select: postSelect,
  }) as Promise<PostRow[]>;
}

export async function getOverview(tenant: TenantContext) {
  const where = scoped(tenant);
  const [byStatus, published30, accounts, reconnect, recent] = await Promise.all([
    prisma.post.groupBy({ by: ["status"], where, _count: { _all: true } }),
    prisma.post.count({
      where: { ...where, status: "PUBLISHED", publishedAt: { gte: new Date(Date.now() - 30 * 864e5) } },
    }),
    prisma.socialAccount.findMany({
      where: { workspaceId: tenant.workspaceId },
      select: { id: true, platform: true, platformUsername: true, isActive: true, needsReconnect: true, lastError: true },
    }),
    prisma.socialAccount.count({ where: { workspaceId: tenant.workspaceId, needsReconnect: true } }),
    prisma.post.findMany({
      where: { ...where, status: { in: ["PENDING_APPROVAL", "APPROVED", "SCHEDULED", "FAILED"] } },
      orderBy: { updatedAt: "desc" },
      take: 6,
      select: postSelect,
    }) as Promise<PostRow[]>,
  ]);

  const counts = Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])) as Record<string, number>;
  return { counts, published30, accounts, reconnect, recent };
}

export async function getPublishing(tenant: TenantContext) {
  const [upcoming, failed, published, jobs] = await Promise.all([
    listPosts(tenant, ["SCHEDULED", "PUBLISHING"], 40),
    listPosts(tenant, ["FAILED"], 20),
    prisma.post.findMany({
      where: { ...scoped(tenant), status: "PUBLISHED" },
      orderBy: { publishedAt: "desc" },
      take: 10,
      select: postSelect,
    }) as Promise<PostRow[]>,
    prisma.publishingJob.findMany({
      where: { userId: tenant.userId },
      orderBy: { createdAt: "desc" },
      take: 20,
      select: {
        id: true, platform: true, status: true, attemptCount: true, postId: true,
        lastErrorCode: true, lastErrorMessage: true, createdAt: true,
      },
    }),
  ]);
  return { upcoming, failed, published, jobs };
}

export async function getAccounts(tenant: TenantContext) {
  return prisma.socialAccount.findMany({
    where: { workspaceId: tenant.workspaceId },
    select: {
      id: true, platform: true, platformUsername: true, isActive: true,
      needsReconnect: true, lastError: true, createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });
}

export function capabilityLabel(platform: Platform): string {
  const cfg = PLATFORM_CONFIGS[platform];
  const c = cfg?.capabilities;
  if (!c) return "Not available";
  if (c.directMessages && c.mentions) return "Read and reply";
  if (c.mentions) return "Read only";
  if (c.text) return "Read";
  return "Not available";
}

export async function getInsights(tenant: TenantContext) {
  const where = scoped(tenant);
  const [published, byPlatform, approvals] = await Promise.all([
    prisma.post.count({ where: { ...where, status: "PUBLISHED" } }),
    prisma.post.groupBy({ by: ["platform"], where: { ...where, status: "PUBLISHED" }, _count: { _all: true } }),
    prisma.post.findMany({
      where: { ...where, approvedAt: { not: null } },
      select: { createdAt: true, approvedAt: true },
      take: 200,
      orderBy: { approvedAt: "desc" },
    }),
  ]);

  const gaps = approvals
    .map((p) => (p.approvedAt!.getTime() - p.createdAt.getTime()) / 36e5)
    .filter((h) => Number.isFinite(h) && h >= 0)
    .sort((a, b) => a - b);
  const median = gaps.length ? gaps[Math.floor(gaps.length / 2)] : null;

  return {
    published,
    byPlatform: byPlatform.map((r) => ({ platform: r.platform, count: r._count._all })),
    medianApprovalHours: median,
  };
}

export async function getTeam(tenant: TenantContext) {
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId: tenant.workspaceId },
    select: { id: true, role: true, createdAt: true, user: { select: { id: true, name: true, email: true, image: true } } },
    orderBy: { createdAt: "asc" },
  });
  return members;
}

export async function getBrains(tenant: TenantContext) {
  return prisma.brain.findMany({
    where: { workspaceId: tenant.workspaceId },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
    select: { id: true, name: true, isDefault: true, _count: { select: { socialAccounts: true } } },
  });
}

export async function getCurrentUser(userId: string) {
  return prisma.user.findUnique({ where: { id: userId }, select: { name: true, email: true, image: true, role: true } });
}

export function relativeTime(date: Date | null): string {
  if (!date) return "—";
  const diff = Date.now() - date.getTime();
  const mins = Math.round(diff / 6e4);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 30) return `${days}d ago`;
  return date.toISOString().slice(0, 10);
}

export function formatWhen(date: Date | null): string {
  if (!date) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    weekday: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
    timeZone: "Europe/Oslo",
  }).format(date);
}

export const STATUS_TONE: Record<PostStatus, { label: string; tone: string }> = {
  DRAFT: { label: "Draft", tone: "draft" },
  PENDING_APPROVAL: { label: "In review", tone: "review" },
  APPROVED: { label: "Approved", tone: "approved" },
  SCHEDULED: { label: "Scheduled", tone: "scheduled" },
  PUBLISHING: { label: "Publishing…", tone: "publishing" },
  PUBLISHED: { label: "Published", tone: "published" },
  FAILED: { label: "Failed", tone: "failed" },
};

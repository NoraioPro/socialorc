import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { formatWhen, relativeTime, tenantFor } from "@/lib/socialork/queries";
import { activeBrainId } from "@/lib/tenancy/active-brain";
import { tenantCan } from "@/lib/tenancy/guard";
import { type ApprovalPost } from "@/components/socialork/approvals-board";
import { ApprovalsScreen } from "@/components/socialork/approvals-screen";
import { getClientSignOff } from "@/lib/socialork/approval-settings";
import { isSoleWorkspaceMember } from "@/lib/tenancy/solo";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  const tenant = await tenantFor(session.user.id);
  if (!tenant) redirect("/onboarding");

  const brainId = await activeBrainId(tenant);
  const rows = await prisma.post.findMany({
    where: {
      AND: [
        { OR: [{ workspaceId: tenant.workspaceId }, { userId: tenant.userId }] },
        { OR: [{ brainId }, { brainId: null }] },
        { status: { in: ["PENDING_APPROVAL", "DRAFT", "APPROVED"] } },
      ],
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 80,
    select: {
      id: true, title: true, content: true, platform: true, status: true,
      scheduledFor: true, approvedAt: true, approvedBy: true, rejectionReason: true,
      platformPostUrl: true, updatedAt: true, userId: true,
      socialAccount: { select: { platformUsername: true } },
      user: { select: { name: true, email: true } },
      _count: { select: { mediaAssets: true } },
    },
  });

  const approverIds = [...new Set(rows.map((r) => r.approvedBy).filter((v): v is string => Boolean(v)))];
  const approvers = approverIds.length
    ? await prisma.user.findMany({ where: { id: { in: approverIds } }, select: { id: true, name: true } })
    : [];
  const approverName = new Map(approvers.map((a) => [a.id, a.name ?? "a teammate"]));

  const posts: ApprovalPost[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    platform: r.platform,
    status: r.status,
    handle: r.socialAccount?.platformUsername ?? null,
    when: formatWhen(r.scheduledFor),
    changed: relativeTime(r.updatedAt),
    approvedBy: r.approvedBy ? approverName.get(r.approvedBy) ?? "a teammate" : null,
    rejectionReason: r.rejectionReason,
    url: r.platformPostUrl,
    authorId: r.userId,
    author: r.user?.name ?? r.user?.email ?? "a teammate",
    mediaCount: r._count.mediaAssets,
  }));

  const events = await prisma.auditEvent.findMany({ where: { workspaceId: tenant.workspaceId }, orderBy: { createdAt: "desc" }, take: 60 });
  const titles = new Map((await prisma.post.findMany({ where: { id: { in: events.filter((e) => e.subjectType === "POST" && e.subjectId).map((e) => e.subjectId!) } }, select: { id: true, title: true } })).map((p) => [p.id, p.title]));
  const LABEL: Record<string, string> = { APPROVED: "Approved", REJECTED: "Sent back", SUBMITTED: "Submitted for review", SCHEDULED: "Scheduled", PUBLISHED: "Published", PUBLISH_FAILED: "Publish failed", SELF_APPROVED_SOLO: "Self-approved (solo)", REVIEW_LINK_APPROVED: "Client approved", REVIEW_LINK_CHANGES: "Client asked for changes", ROLE_CHANGED: "Role changed", MEMBER_REMOVED: "Member removed", AUTOMATION_RUN: "Automation ran", AUTOMATION_TOGGLED: "Setting changed" };
  const audit = events.map((e) => {
    const d = (e.detail ?? {}) as { title?: string; message?: string; rule?: string; on?: boolean };
    return { id: e.id, label: LABEL[e.action] ?? e.action, actor: e.actorLabel ?? "System", at: e.createdAt.toISOString().slice(0, 16).replace("T", " "), ok: !["PUBLISH_FAILED", "REJECTED", "REVIEW_LINK_CHANGES"].includes(e.action),
      subject: e.subjectId && titles.get(e.subjectId) ? titles.get(e.subjectId)! : d.message ?? d.title ?? (d.rule ? `${d.rule} ${d.on === undefined ? "" : d.on ? "on" : "off"}` : "") };
  });

  return (
    <div className="so-page">
      <ApprovalsScreen
        posts={posts}
        canApprove={tenantCan(tenant, "posts:approve")}
        viewerId={tenant.userId}
        solo={await isSoleWorkspaceMember(tenant.userId)}
        audit={audit}
        clientSignOff={await getClientSignOff(tenant.workspaceId)}
      />
    </div>
  );
}

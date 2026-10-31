import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { formatWhen, relativeTime, tenantFor } from "@/lib/socialork/queries";
import { tenantCan } from "@/lib/tenancy/guard";
import { ApprovalsBoard, type ApprovalPost } from "@/components/socialork/approvals-board";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  const tenant = await tenantFor(session.user.id);
  if (!tenant) redirect("/onboarding");

  const rows = await prisma.post.findMany({
    where: {
      OR: [{ workspaceId: tenant.workspaceId }, { userId: tenant.userId }],
      status: { in: ["PENDING_APPROVAL", "DRAFT", "APPROVED"] },
    },
    orderBy: [{ updatedAt: "desc" }],
    take: 80,
    select: {
      id: true, title: true, content: true, platform: true, status: true,
      scheduledFor: true, approvedAt: true, approvedBy: true, rejectionReason: true,
      platformPostUrl: true, updatedAt: true,
      socialAccount: { select: { platformUsername: true } },
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
  }));

  return (
    <div className="so-page">
      <div style={{ display: "grid", gap: 6 }}>
        <h1 className="so-h1">Approvals</h1>
        <p className="so-sub">
          Every post needs a recorded approval before it can be scheduled. Editing a post clears its
          approval — that rule lives on the server, not on this screen.
        </p>
      </div>
      <ApprovalsBoard posts={posts} canApprove={tenantCan(tenant, "posts:approve")} />
    </div>
  );
}

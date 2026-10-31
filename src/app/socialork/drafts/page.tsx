import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { relativeTime, tenantFor } from "@/lib/socialork/queries";
import { DraftsTable, type DraftRow } from "@/components/socialork/drafts-table";
import { activeBrainId } from "@/lib/tenancy/active-brain";

export const dynamic = "force-dynamic";

export default async function DraftsPage() {
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
        { status: "DRAFT" },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: 60,
    select: {
      id: true, title: true, content: true, platform: true, status: true,
      updatedAt: true, rejectionReason: true,
      user: { select: { name: true, email: true } },
    },
  });

  const drafts: DraftRow[] = rows.map((r) => ({
    id: r.id,
    title: r.title,
    content: r.content,
    platform: r.platform,
    status: r.status,
    author: r.user?.name ?? r.user?.email ?? "—",
    updated: relativeTime(r.updatedAt),
    rejectionReason: r.rejectionReason,
  }));

  return (
    <div className="so-page">
      <div className="so-spread">
        <div style={{ display: "grid", gap: 6 }}>
          <h1 className="so-h1">Drafts</h1>
          <p className="so-sub">
            Posts that haven&apos;t been submitted yet, and posts sent back with changes. Nothing here
            is visible outside this workspace.
          </p>
        </div>
        <a href="/socialork/create" className="so-btn" data-variant="primary" style={{ textDecoration: "none" }}>
          New post
        </a>
      </div>
      <DraftsTable rows={drafts} />
    </div>
  );
}

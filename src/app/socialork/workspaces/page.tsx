import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { tenantFor } from "@/lib/socialork/queries";
import { WorkspacesManager, type WorkspaceRow } from "@/components/socialork/workspaces-manager";

export const dynamic = "force-dynamic";

export default async function WorkspacesPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  const tenant = await tenantFor(session.user.id);
  if (!tenant) redirect("/onboarding");

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: tenant.userId },
    orderBy: { createdAt: "asc" },
    select: { role: true, workspace: { select: { id: true, name: true, kind: true } } },
  });

  const rows: WorkspaceRow[] = await Promise.all(
    memberships.map(async (m) => {
      const id = m.workspace.id;
      const [members, brains, channels, posts] = await Promise.all([
        prisma.workspaceMember.count({ where: { workspaceId: id } }),
        prisma.brain.count({ where: { workspaceId: id } }),
        prisma.socialAccount.count({ where: { workspaceId: id } }),
        prisma.post.count({ where: { workspaceId: id } }),
      ]);
      return {
        id,
        name: m.workspace.name,
        kind: m.workspace.kind ?? "PERSONAL",
        role: String(m.role),
        isCurrent: id === tenant.workspaceId,
        members,
        brains,
        channels,
        posts,
      };
    }),
  );

  return (
    <div className="so-page">
      <div style={{ display: "grid", gap: 6 }}>
        <h1 className="so-h1">Workspaces</h1>
        <p className="so-sub">
          A workspace is the boundary: its own people, channels, brains and content. Switching here
          changes everything you see, and your role is per workspace — you can own one and be an
          editor in another.
        </p>
      </div>
      <WorkspacesManager rows={rows} />
    </div>
  );
}

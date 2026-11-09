import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { tenantFor } from "@/lib/socialork/queries";
import { activeBrainId } from "@/lib/tenancy/active-brain";
import { tenantCan } from "@/lib/tenancy/guard";
import { getOrCreateDefaultBrain } from "@/lib/brains";
import { readBrainProfile } from "@/lib/brains/profile";
import { BrainsBoard, type BrainRow } from "@/components/socialork/brains-board";

export const dynamic = "force-dynamic";

export default async function BrainsPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  const tenant = await tenantFor(session.user.id);
  if (!tenant) redirect("/onboarding");

  await getOrCreateDefaultBrain(tenant);
  const [brains, activeId] = await Promise.all([
    prisma.brain.findMany({
      where: { workspaceId: tenant.workspaceId },
      orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
      select: {
        id: true, name: true, isDefault: true, color: true, handle: true, profile: true,
        socialAccounts: { select: { platform: true, platformUsername: true, needsReconnect: true, isActive: true } },
        _count: { select: { posts: true } },
      },
    }),
    activeBrainId(tenant),
  ]);

  const rows: BrainRow[] = brains.map((b) => ({
    id: b.id,
    name: b.name,
    isDefault: b.isDefault,
    color: b.color,
    handle: b.handle,
    profile: readBrainProfile(b.profile),
    accounts: b.socialAccounts.map((a) => ({
      platform: a.platform,
      handle: a.platformUsername,
      ok: a.isActive && !a.needsReconnect,
    })),
    posts: b._count.posts,
  }));

  return (
    <BrainsBoard
      brains={rows}
      activeId={activeId}
      canManage={tenantCan(tenant, "brains:manage")}
      canConnect={tenantCan(tenant, "accounts:connect")}
    />
  );
}

import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { relativeTime, tenantFor } from "@/lib/socialork/queries";
import { TeamBoard } from "@/components/socialork/team-board";

export const dynamic = "force-dynamic";

export default async function TeamPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  const tenant = await tenantFor(session.user.id);
  if (!tenant) redirect("/onboarding");

  const { getTeam } = await import("@/lib/socialork/queries");
  const members = await getTeam(tenant);

  return (
    <div className="so-page">
      <div style={{ display: "grid", gap: 6 }}>
        <h1 className="so-h1">Team</h1>
        <p className="so-sub">
          Access comes from workspace membership. Changing a role or removing someone takes effect on
          their next request, not their next sign-in.
        </p>
      </div>
      <TeamBoard
        canInvite={String(tenant.role).toUpperCase() === "ADMIN"}
        members={members.map((m) => ({
          id: m.id,
          userId: m.user.id,
          name: m.user.name ?? "",
          email: m.user.email ?? "",
          role: String(m.role),
          joined: relativeTime(m.createdAt),
        }))}
      />
    </div>
  );
}

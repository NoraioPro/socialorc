import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { formatWhen, getTeam, relativeTime, tenantFor } from "@/lib/socialork/queries";
import { teamsEnabled } from "@/lib/features";
import { ROLES, ROLE_META, can, type Permission } from "@/lib/roles";
import { TeamBoard } from "@/components/socialork/team-board";
import { TeamTabs, type InviteRow } from "@/components/socialork/team-extras";

export const dynamic = "force-dynamic";

/** The permission matrix, in words people use, grouped the way the screens are. */
const MATRIX: { group: string; rows: [string, Permission][] }[] = [
  { group: "Content", rows: [["Write drafts", "posts:create"], ["Submit for review", "posts:submit"], ["Approve or send back", "posts:approve"], ["Schedule and publish", "posts:schedule"], ["Delete posts", "posts:delete"]] },
  { group: "Channels and media", rows: [["Connect accounts", "accounts:connect"], ["Upload media", "media:upload"], ["Delete media", "media:delete"]] },
  { group: "Brains", rows: [["Read brains", "brains:read"], ["Edit brains", "brains:manage"]] },
  { group: "Timeline and inbox", rows: [["Post, react and comment on the Timeline", "feed:post"], ["See the inbox", "engagement:view"], ["Reply", "engagement:reply"]] },
  { group: "Portfolio", rows: [["Edit own portfolio", "portfolio:edit"], ["Publish own portfolio", "portfolio:publish"]] },
  { group: "Workspace", rows: [["Invite people and change roles", "users:manage"]] },
];

export default async function TeamPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) redirect("/login");
  const tenant = await tenantFor(session.user.id);
  if (!tenant) redirect("/onboarding");

  const canManage = can(tenant.role, "users:manage");
  const teamsOn = teamsEnabled();
  const [members, invitations] = await Promise.all([
    getTeam(tenant),
    canManage && teamsOn
      ? prisma.invitation.findMany({
          where: { workspaceId: tenant.workspaceId, acceptedAt: null, expiresAt: { gt: new Date() } },
          select: { id: true, email: true, role: true, expiresAt: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
  ]);

  const invites: InviteRow[] = invitations.map((i) => ({
    id: i.id, email: i.email, role: String(i.role), sent: relativeTime(i.createdAt), expires: formatWhen(i.expiresAt),
  }));

  return (
    <div className="so-page">
      <TeamTabs
        canManage={canManage}
        memberCount={members.length}
        teamsOn={teamsOn}
        invites={invites}
        roles={ROLES.map((r) => ROLE_META[r].label)}
        myRole={ROLE_META[tenant.role]?.label ?? String(tenant.role)}
        matrix={MATRIX.map((g) => ({ group: g.group, rows: g.rows.map(([label, p]) => ({ label, allowed: ROLES.map((r) => can(r, p)) })) }))}
        members={
          <TeamBoard
            canInvite={String(tenant.role).toUpperCase() === "ADMIN"}
            members={members.map((m) => ({
              id: m.id,
              userId: m.user.id,
              name: m.user.name ?? "",
              email: m.user.email ?? "",
              role: String(m.role),
              joined: relativeTime(m.createdAt),
              isMe: m.user.id === session.user.id,
            }))}
          />
        }
      />
    </div>
  );
}

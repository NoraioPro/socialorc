import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthSession } from "@/lib/auth";

/**
 * The workspaces this user belongs to.
 *
 * The AI settings page has been calling this since it was written, to learn which
 * workspace scope to offer, and the route did not exist — so the request 404'd on
 * every visit and the Workspace tab stayed silently disabled. It answers with what
 * the membership table actually holds, which on most deployments is one workspace
 * per user (Phase 0: a new account starts its own).
 *
 * Note there is still no workspace *filtering* anywhere: this reports membership,
 * it does not isolate data. See src/lib/workspace.ts and docs/SAAS-PLAN.md.
 */
export async function GET() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const memberships = await prisma.workspaceMember.findMany({
    where: { userId: session.user.id },
    select: {
      role: true,
      workspace: { select: { id: true, name: true, createdAt: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  const workspaces = memberships
    .filter((membership) => membership.workspace)
    .map((membership) => ({
      id: membership.workspace.id,
      name: membership.workspace.name,
      membershipRole: membership.role,
      createdAt: membership.workspace.createdAt,
    }));

  return NextResponse.json({ workspaces });
}

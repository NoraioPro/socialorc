import { teamsDisabledResponse, teamsEnabled } from "@/lib/features";
import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireWorkspace } from "@/lib/tenancy/guard";
import { ROLE_VALUES } from "@/lib/invitations";

/**
 * The workspace member list: the people in the caller's workspace, and nobody
 * else's.
 */
export async function GET() {
  if (!teamsEnabled()) return teamsDisabledResponse();
  const guard = await requireWorkspace("users:manage");
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const users = await prisma.user.findMany({
    where: { workspaceMembers: { some: { workspaceId: guard.workspaceId } } },
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ users, roles: ROLE_VALUES });
}

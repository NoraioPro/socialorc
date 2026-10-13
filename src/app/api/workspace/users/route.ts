import { NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requirePermission } from "@/lib/auth";
import { ROLE_VALUES } from "@/lib/invitations";

/**
 * The workspace member list.
 *
 * There was no way to see who is in the workspace, which also meant there was no
 * way to change anyone's role: MANAGER and CLIENT existed in the database and
 * nowhere else. Multi-tenancy filtering (src/lib/workspace.ts) is still not
 * enforced anywhere in the app, so this lists every user — that is the current
 * truth about this deployment, not an oversight of this route.
 */
export async function GET() {
  const guard = await requirePermission("users:manage");
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ users, roles: ROLE_VALUES });
}

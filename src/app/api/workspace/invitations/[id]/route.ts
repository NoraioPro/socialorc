import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireWorkspace } from "@/lib/tenancy/guard";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/** Revoke a pending invitation. Accepted ones are history and stay. */
export async function DELETE(_req: NextRequest, context: RouteContext) {
  const guard = await requireWorkspace("users:manage");
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { id } = await context.params;

  // Guarded by `acceptedAt: null`: revoking an invitation somebody is in the
  // middle of accepting must not delete the record the register route is about to
  // stamp as used.
  // Scoped to the caller's workspace: another workspace's invitation is not found.
  const revoked = await prisma.invitation.deleteMany({
    where: { id, workspaceId: guard.workspaceId, acceptedAt: null },
  });
  if (revoked.count === 0) {
    return NextResponse.json({ error: "No pending invitation with that id" }, { status: 404 });
  }

  return NextResponse.json({ success: true, revoked: revoked.count });
}

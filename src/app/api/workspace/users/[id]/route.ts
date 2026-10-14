import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireWorkspace } from "@/lib/tenancy/guard";
import { roleChangeMessage, roleChangeProblem } from "@/lib/invitations";
import { workspaceRoleFor } from "@/lib/tenancy/workspace-role";
import { parseRole } from "@/lib/roles";

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * Change a member's role. ADMIN only (`users:manage`).
 *
 * Roles were previously only ever set once, at signup, by the signup policy —
 * which is why MANAGER and CLIENT could not be reached at all. Two refusals
 * matter here and both are decisions in src/lib/invitations.ts: an actor cannot
 * change their own role (they would lock themselves out of the page that undoes
 * it), and the last remaining ADMIN cannot be demoted (nobody could administer
 * the workspace afterwards).
 *
 * Only members of the caller's own workspace can be changed; anyone else is not
 * found. The change takes effect on the member's next request, because every
 * gate re-reads the role from the database (src/lib/tenancy/guard.ts).
 */
export async function PATCH(req: NextRequest, context: RouteContext) {
  const guard = await requireWorkspace("users:manage");
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { id } = await context.params;

  let body: { role?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const target = await prisma.user.findFirst({
    where: { id, workspaceMembers: { some: { workspaceId: guard.workspaceId } } },
    select: { id: true, role: true, name: true, email: true },
  });
  if (!target) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  // "The last admin" means the last admin of this workspace.
  const adminCount = await prisma.user.count({
    where: { role: "ADMIN", workspaceMembers: { some: { workspaceId: guard.workspaceId } } },
  });

  const problem = roleChangeProblem({
    actorId: guard.userId,
    targetId: target.id,
    targetRole: target.role,
    nextRole: body.role,
    adminCount,
  });
  if (problem) {
    return NextResponse.json({ error: roleChangeMessage(problem) }, { status: 400 });
  }

  // Guarded write: the reads above decided this was allowed, so the write
  // restates the state it decided about — the admin count can change in between,
  // and the role itself is what the decision was made about.
  const nextRole = body.role as string;
  const claimed = await prisma.$transaction(async (tx) => {
    const claim = await tx.user.updateMany({
      where: { id: target.id, role: target.role },
      data: { role: nextRole },
    });
    if (claim.count === 0) return false;
    // Keep the membership's recorded role in step (workspace vocabulary).
    await tx.workspaceMember.updateMany({
      where: { userId: target.id, workspaceId: guard.workspaceId },
      data: { role: workspaceRoleFor(parseRole(nextRole)) },
    });
    return true;
  });
  if (!claimed) {
    return NextResponse.json(
      { error: "This member's role changed while you were working on it. Reload and try again." },
      { status: 409 }
    );
  }

  const updated = await prisma.user.findUnique({
    where: { id: target.id },
    select: { id: true, name: true, email: true, role: true },
  });

  return NextResponse.json({ success: true, user: updated });
}

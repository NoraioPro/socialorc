import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAuthSession } from "@/lib/auth";

/**
 * Manage one workspace.
 *
 * These act on a workspace that may not be the session's active one, so the guard
 * here is the membership row for *that* id, not `requireWorkspace`.
 */
async function membership(userId: string, workspaceId: string) {
  return prisma.workspaceMember.findFirst({
    where: { userId, workspaceId },
    select: { id: true, role: true, workspace: { select: { id: true, name: true, slug: true, kind: true } } },
  });
}

const isManager = (role: string) => ["OWNER", "ADMIN"].includes(String(role).toUpperCase());

/** PATCH — rename (owner/admin of that workspace). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getAuthSession();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await membership(userId, id);
  if (!row) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  if (!isManager(row.role)) {
    return NextResponse.json({ error: "Only an owner or admin can rename this workspace." }, { status: 403 });
  }

  const body = (await req.json().catch(() => ({}))) as { name?: unknown };
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (name.length < 2) {
    return NextResponse.json({ error: "Give the workspace a name (at least 2 characters)." }, { status: 400 });
  }

  const workspace = await prisma.workspace.update({
    where: { id },
    data: { name },
    select: { id: true, name: true },
  });
  return NextResponse.json({ success: true, workspace });
}

/** DELETE — an owner deletes the workspace; anyone else can only leave (?leave=1). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getAuthSession();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const row = await membership(userId, id);
  if (!row) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

  const leave = req.nextUrl.searchParams.get("leave") === "1";
  const isOwner = String(row.role).toUpperCase() === "OWNER";

  if (!leave) {
    if (!isOwner) {
      return NextResponse.json(
        { error: "Only the owner can delete this workspace. You can leave it instead." },
        { status: 403 },
      );
    }
    const remaining = await prisma.workspaceMember.count({ where: { workspaceId: id } });
    if (remaining > 1) {
      return NextResponse.json(
        { error: `This workspace still has ${remaining - 1} other member(s). Remove them first, or leave it.` },
        { status: 400 },
      );
    }
    await prisma.workspace.delete({ where: { id } });
    return NextResponse.json({ success: true, deleted: true });
  }

  if (isOwner) {
    return NextResponse.json(
      { error: "You own this workspace, so you cannot leave it. Delete it instead." },
      { status: 400 },
    );
  }

  await prisma.workspaceMember.delete({ where: { id: row.id } });
  return NextResponse.json({ success: true, left: true });
}

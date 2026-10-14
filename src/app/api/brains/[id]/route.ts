import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireWorkspace } from "@/lib/tenancy/guard";

type RouteContext = { params: Promise<{ id: string }> };

/** Rename a brain (project). */
export async function PATCH(req: NextRequest, context: RouteContext) {
  // Editing a brain changes what every future generation is grounded in.
  const tenant = await requireWorkspace("brains:manage");
  if (!tenant.ok) {
    return NextResponse.json({ error: tenant.error }, { status: tenant.status });
  }

  const { id } = await context.params;
  // Workspace membership, not personal ownership: a teammate must be able to
  // rename a brain the team shares. A brain from another workspace is not found.
  const brain = await prisma.brain.findFirst({
    where: { id, workspaceId: tenant.workspaceId },
  });
  if (!brain) {
    return NextResponse.json({ error: "Brain not found" }, { status: 404 });
  }

  const body = await req.json().catch(() => ({}));
  const name = typeof body.name === "string" ? body.name.trim().slice(0, 80) : "";
  if (!name) {
    return NextResponse.json({ error: "A brain needs a name." }, { status: 400 });
  }

  const updated = await prisma.brain.update({ where: { id }, data: { name } });
  return NextResponse.json({ brain: { id: updated.id, name: updated.name, isDefault: updated.isDefault } });
}

/**
 * Delete a brain (project). Its connected platforms go with it (cascade) —
 * posts already made through them keep their content and just lose the
 * social-account link (Post.socialAccountId is nullable, set null on
 * delete), the same as disconnecting each of those accounts individually.
 */
export async function DELETE(req: NextRequest, context: RouteContext) {
  const tenant = await requireWorkspace("brains:manage");
  if (!tenant.ok) {
    return NextResponse.json({ error: tenant.error }, { status: tenant.status });
  }
  const { workspaceId } = tenant;

  const { id } = await context.params;
  const brain = await prisma.brain.findFirst({ where: { id, workspaceId } });
  if (!brain) {
    return NextResponse.json({ error: "Brain not found" }, { status: 404 });
  }

  // Deleting the only brain used to succeed and then immediately recreate an
  // empty "Default", which reads as "delete did nothing" while quietly
  // detaching every connected account. Refuse instead and say why.
  const brainCount = await prisma.brain.count({ where: { workspaceId } });
  if (brainCount <= 1) {
    return NextResponse.json(
      {
        error:
          "This is the only brain in your workspace, so it cannot be deleted — your team would have nowhere to connect platforms. Create another brain first.",
      },
      { status: 400 }
    );
  }

  // SocialAccount.brainId is SetNull, so a plain delete orphans the accounts:
  // they survive in the database but belong to no brain and vanish from the UI.
  // Move them to the brain the user is about to land on instead.
  const fallback = await prisma.brain.findFirst({
    where: { workspaceId, id: { not: id } },
    orderBy: [{ isDefault: "desc" }, { createdAt: "asc" }],
  });

  if (!fallback) {
    return NextResponse.json({ error: "No other brain to move connected accounts to." }, { status: 400 });
  }

  const moved = await prisma.socialAccount.updateMany({
    where: { brainId: id, workspaceId },
    data: { brainId: fallback.id },
  });

  await prisma.brain.delete({ where: { id } });

  return NextResponse.json({
    success: true,
    fallbackBrainId: fallback.id,
    movedAccounts: moved.count,
  });
}

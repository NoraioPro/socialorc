import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getOrCreateDefaultBrain } from "@/lib/brains";

type RouteContext = { params: Promise<{ id: string }> };

/** Rename a brain (project). */
export async function PATCH(req: NextRequest, context: RouteContext) {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const brain = await prisma.brain.findFirst({ where: { id, userId: session.user.id } });
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
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await context.params;
  const brain = await prisma.brain.findFirst({ where: { id, userId: session.user.id } });
  if (!brain) {
    return NextResponse.json({ error: "Brain not found" }, { status: 404 });
  }

  await prisma.brain.delete({ where: { id } });

  // A user always needs somewhere to connect platforms to — recreate the
  // default if that was the last brain standing.
  const fallback = await getOrCreateDefaultBrain(session.user.id);

  return NextResponse.json({ success: true, fallbackBrainId: fallback.id });
}

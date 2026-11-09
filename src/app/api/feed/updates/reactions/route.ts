import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireWorkspace } from "@/lib/tenancy/guard";

const schema = z.object({ updateId: z.string().min(1), type: z.enum(["LIKE", "CELEBRATE", "INSIGHTFUL", "SUPPORT"]) });

/** Toggle the caller's reaction on a team update they can see. Same rules as post reactions. */
export async function POST(request: Request) {
  const tenant = await requireWorkspace("feed:post");
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid reaction." }, { status: 400 });

  const update = await prisma.nativePost.findFirst({
    where: {
      id: parsed.data.updateId,
      workspaceId: tenant.workspaceId,
      deletedAt: null,
      OR: [{ visibility: "PUBLIC" }, { authorId: tenant.userId }],
    },
    select: { id: true },
  });
  if (!update) return NextResponse.json({ error: "Update not found." }, { status: 404 });

  const key = { nativePostId_userId: { nativePostId: update.id, userId: tenant.userId } };
  const existing = await prisma.nativePostReaction.findUnique({ where: key });
  if (existing?.type === parsed.data.type) {
    await prisma.nativePostReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.nativePostReaction.upsert({
      where: key,
      update: { type: parsed.data.type },
      create: { nativePostId: update.id, userId: tenant.userId, type: parsed.data.type },
    });
  }
  const reactions = await prisma.nativePostReaction.findMany({ where: { nativePostId: update.id }, select: { userId: true, type: true } });
  return NextResponse.json({ reactions });
}

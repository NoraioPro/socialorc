import { NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireWorkspace } from "@/lib/tenancy/guard";

const schema = z.object({ postId: z.string().min(1), type: z.enum(["LIKE", "CELEBRATE", "INSIGHTFUL", "SUPPORT"]) });

export async function POST(request: Request) {
  // Reacting writes a row against a teammate's post: any member who may post
  // into the feed may react to any post in their workspace, and to nothing else.
  const tenant = await requireWorkspace("feed:post");
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status });

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid reaction." }, { status: 400 });

  const post = await prisma.post.findFirst({
    where: { id: parsed.data.postId, workspaceId: tenant.workspaceId },
    select: { id: true },
  });
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });

  const key = { postId_userId: { postId: post.id, userId: tenant.userId } };
  const existing = await prisma.feedReaction.findUnique({ where: key });
  if (existing?.type === parsed.data.type) {
    await prisma.feedReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.feedReaction.upsert({
      where: key,
      update: { type: parsed.data.type },
      create: { postId: post.id, userId: tenant.userId, type: parsed.data.type },
    });
  }
  const reactions = await prisma.feedReaction.findMany({ where: { postId: post.id }, select: { userId: true, type: true } });
  return NextResponse.json({ reactions });
}

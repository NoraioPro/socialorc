import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";

const schema = z.object({ postId: z.string().min(1), type: z.enum(["LIKE", "CELEBRATE", "INSIGHTFUL", "SUPPORT"]) });

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid reaction." }, { status: 400 });

  const post = await prisma.post.findFirst({ where: { id: parsed.data.postId, userId: session.user.id }, select: { id: true } });
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });

  const existing = await prisma.feedReaction.findUnique({ where: { postId_userId: { postId: post.id, userId: session.user.id } } });
  if (existing?.type === parsed.data.type) {
    await prisma.feedReaction.delete({ where: { id: existing.id } });
  } else {
    await prisma.feedReaction.upsert({
      where: { postId_userId: { postId: post.id, userId: session.user.id } },
      update: { type: parsed.data.type },
      create: { postId: post.id, userId: session.user.id, type: parsed.data.type },
    });
  }
  const reactions = await prisma.feedReaction.findMany({ where: { postId: post.id }, select: { userId: true, type: true } });
  return NextResponse.json({ reactions });
}

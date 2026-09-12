import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";

const createSchema = z.object({ postId: z.string().min(1), content: z.string().trim().min(1).max(1000) });

export async function POST(request: Request) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Write a comment up to 1,000 characters." }, { status: 400 });
  const post = await prisma.post.findFirst({ where: { id: parsed.data.postId, userId: session.user.id }, select: { id: true } });
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  const comment = await prisma.feedComment.create({
    data: { postId: post.id, userId: session.user.id, content: parsed.data.content },
    include: { user: { select: { id: true, name: true, image: true } } },
  });
  return NextResponse.json({ comment }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Comment id is required." }, { status: 400 });
  const comment = await prisma.feedComment.findFirst({ where: { id, userId: session.user.id }, select: { id: true } });
  if (!comment) return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  await prisma.feedComment.delete({ where: { id } });
  return NextResponse.json({ success: true });
}

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireWorkspace } from "@/lib/tenancy/guard";

const createSchema = z.object({ postId: z.string().min(1), content: z.string().trim().min(1).max(1000) });

export async function POST(request: Request) {
  // Commenting in the workspace feed is a write teammates will see. Any post in
  // the caller's workspace can be commented on; a post elsewhere is not found.
  const tenant = await requireWorkspace("feed:post");
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Write a comment up to 1,000 characters." }, { status: 400 });
  const post = await prisma.post.findFirst({
    where: { id: parsed.data.postId, workspaceId: tenant.workspaceId },
    select: { id: true },
  });
  if (!post) return NextResponse.json({ error: "Post not found." }, { status: 404 });
  const comment = await prisma.feedComment.create({
    data: { postId: post.id, userId: tenant.userId, content: parsed.data.content },
    include: { user: { select: { id: true, name: true, image: true } } },
  });
  return NextResponse.json({ comment }, { status: 201 });
}

export async function DELETE(request: NextRequest) {
  // Deleting a comment is limited to its author, and to comments on posts in
  // the author's current workspace.
  const tenant = await requireWorkspace("dashboard:view");
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Comment id is required." }, { status: 400 });
  const deleted = await prisma.feedComment.deleteMany({
    where: { id, userId: tenant.userId, post: { workspaceId: tenant.workspaceId } },
  });
  if (deleted.count === 0) return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  return NextResponse.json({ success: true });
}

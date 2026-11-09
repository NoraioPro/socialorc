import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireWorkspace } from "@/lib/tenancy/guard";

const createSchema = z.object({ updateId: z.string().min(1), content: z.string().trim().min(1).max(1000) });

/** Comment on a team update the caller can see. */
export async function POST(request: Request) {
  const tenant = await requireWorkspace("feed:post");
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Write a comment up to 1,000 characters." }, { status: 400 });

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

  const comment = await prisma.nativePostComment.create({
    data: { nativePostId: update.id, userId: tenant.userId, content: parsed.data.content },
    select: { id: true, userId: true, content: true, createdAt: true },
  });
  return NextResponse.json({ comment }, { status: 201 });
}

/** Authors delete their own comments, on updates in their current workspace. */
export async function DELETE(request: NextRequest) {
  const tenant = await requireWorkspace("dashboard:view");
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Comment id is required." }, { status: 400 });
  const deleted = await prisma.nativePostComment.deleteMany({
    where: { id, userId: tenant.userId, nativePost: { workspaceId: tenant.workspaceId } },
  });
  if (deleted.count === 0) return NextResponse.json({ error: "Comment not found." }, { status: 404 });
  return NextResponse.json({ success: true });
}

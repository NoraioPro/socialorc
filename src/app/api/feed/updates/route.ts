import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireWorkspace } from "@/lib/tenancy/guard";

/**
 * Team updates on the Timeline. They live only inside the workspace and are
 * never sent to a social channel. PUBLIC is the whole workspace; PRIVATE is a
 * note only its author sees.
 */
const createSchema = z.object({
  body: z.string().trim().min(1).max(1000),
  visibility: z.enum(["PUBLIC", "PRIVATE"]).default("PUBLIC"),
});

export async function POST(request: Request) {
  const tenant = await requireWorkspace("feed:post");
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status });

  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Write an update up to 1,000 characters." }, { status: 400 });

  const update = await prisma.nativePost.create({
    data: {
      authorId: tenant.userId,
      workspaceId: tenant.workspaceId,
      body: parsed.data.body,
      visibility: parsed.data.visibility,
    },
    select: { id: true, authorId: true, body: true, visibility: true, createdAt: true },
  });
  return NextResponse.json({ update }, { status: 201 });
}

/** Only the author removes an update. It is soft-deleted, so it stays auditable. */
export async function DELETE(request: NextRequest) {
  const tenant = await requireWorkspace("dashboard:view");
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status });
  const id = request.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "Update id is required." }, { status: 400 });
  const done = await prisma.nativePost.updateMany({
    where: { id, authorId: tenant.userId, workspaceId: tenant.workspaceId, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  if (done.count === 0) return NextResponse.json({ error: "Update not found." }, { status: 404 });
  return NextResponse.json({ success: true });
}

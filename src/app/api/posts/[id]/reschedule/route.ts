import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { PostStatus, JobStatus } from "@prisma/client";
import { z } from "zod";

const rescheduleSchema = z.object({
  scheduledFor: z.string(),
});

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json();
    const validation = rescheduleSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validation.error.issues },
        { status: 400 }
      );
    }

    const post = await prisma.post.findFirst({
      where: { id, userId: session.user.id },
      include: { socialAccount: true },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (post.status !== PostStatus.SCHEDULED) {
      return NextResponse.json(
        { error: "Can only reschedule posts with SCHEDULED status" },
        { status: 400 }
      );
    }

    const scheduledFor = new Date(validation.data.scheduledFor);
    const now = new Date();

    if (scheduledFor <= now) {
      return NextResponse.json(
        { error: "Scheduled time must be in the future" },
        { status: 400 }
      );
    }

    const [updatedPost] = await prisma.$transaction([
      prisma.post.update({
        where: { id },
        data: {
          scheduledFor,
        },
        include: {
          socialAccount: true,
          mediaAssets: {
            include: { mediaAsset: true },
            orderBy: { order: "asc" },
          },
        },
      }),
      prisma.scheduledJob.update({
        where: { postId: id },
        data: {
          scheduledAt: scheduledFor,
          status: JobStatus.PENDING,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: "Post rescheduled successfully",
      post: updatedPost,
      scheduledFor: scheduledFor.toISOString(),
    });
  } catch (error) {
    console.error("Error rescheduling post:", error);
    return NextResponse.json(
      { error: "Failed to reschedule post" },
      { status: 500 }
    );
  }
}

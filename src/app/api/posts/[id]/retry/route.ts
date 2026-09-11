import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { JobStatus, PostStatus } from "@prisma/client";
import { z } from "zod";
import {
  canRetryFailedPublish,
  defaultRetrySchedule,
  getRetryBlockReason,
  retryBlockMessage,
} from "@/lib/failed-retry";

const retrySchema = z.object({
  scheduledFor: z.string().optional(),
});

/**
 * Re-queue a FAILED publish that already passed the approval gate.
 * Never schedules DRAFT / PENDING / unapproved posts (gate stays sacred).
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const validation = retrySchema.safeParse(body);
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

    const block = getRetryBlockReason(post);
    if (block) {
      return NextResponse.json(
        { error: retryBlockMessage(block), reason: block },
        { status: 400 }
      );
    }

    if (!canRetryFailedPublish(post)) {
      return NextResponse.json({ error: "Retry not allowed" }, { status: 400 });
    }

    const now = new Date();
    let scheduledFor = validation.data.scheduledFor
      ? new Date(validation.data.scheduledFor)
      : defaultRetrySchedule(now);

    if (Number.isNaN(scheduledFor.getTime()) || scheduledFor <= now) {
      scheduledFor = defaultRetrySchedule(now);
    }

    const [updatedPost] = await prisma.$transaction([
      prisma.post.update({
        where: { id },
        data: {
          status: PostStatus.SCHEDULED,
          scheduledFor,
          errorMessage: null,
        },
        include: {
          socialAccount: true,
          mediaAssets: {
            include: { mediaAsset: true },
            orderBy: { order: "asc" },
          },
        },
      }),
      prisma.scheduledJob.upsert({
        where: { postId: id },
        create: {
          postId: id,
          scheduledAt: scheduledFor,
          status: JobStatus.PENDING,
          attempts: 0,
          errorMessage: null,
          startedAt: null,
          completedAt: null,
        },
        update: {
          scheduledAt: scheduledFor,
          status: JobStatus.PENDING,
          attempts: 0,
          errorMessage: null,
          startedAt: null,
          completedAt: null,
        },
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: "Failed publish re-queued",
      post: updatedPost,
      scheduledFor: scheduledFor.toISOString(),
    });
  } catch (error) {
    console.error("Error retrying failed publish:", error);
    return NextResponse.json(
      { error: "Failed to retry publish" },
      { status: 500 }
    );
  }
}

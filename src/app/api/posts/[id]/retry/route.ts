import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireWorkspace } from "@/lib/tenancy/guard";
import { PostStatus } from "@prisma/client";
import { z } from "zod";
import {
  canRetryFailedPublish,
  defaultRetrySchedule,
  getRetryBlockReason,
  retryBlockMessage,
} from "@/lib/failed-retry";
import { requeueJobData } from "@/lib/jobs/pending-publish";
import { PUBLIC_SOCIAL_ACCOUNT_SELECT } from "@/lib/social/account-select";
import {
  POST_CONFLICT_MESSAGE,
  POST_CONFLICT_STATUS,
  retryGuardWhere,
} from "@/lib/posts/transitions";

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
    // Scheduling work — the same permission that gates /schedule. This route
    // was session-only, so a read-only CLIENT account could re-queue a publish.
    const guard = await requireWorkspace("posts:schedule");
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
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
      where: { id, workspaceId: guard.workspaceId },
      include: { socialAccount: { select: PUBLIC_SOCIAL_ACCOUNT_SELECT } },
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

    const requeued = await prisma.$transaction(async (tx) => {
      // Guarded claim: only the FAILED, approved post that was checked above may
      // be re-queued. `count === 0` means the row moved on (an edit, a delete, a
      // competing retry) and this must not force it back into the queue.
      const claim = await tx.post.updateMany({
        where: retryGuardWhere(id, guard.workspaceId),
        data: {
          status: PostStatus.SCHEDULED,
          scheduledFor,
          errorMessage: null,
        },
      });

      if (claim.count === 0) return null;

      // A fresh send: `requeueJobData` also clears any poll state a timed-out
      // pending publish left behind, or the worker would treat this job as a
      // poll and fail it ("Invalid post status: SCHEDULED").
      const jobData = requeueJobData(scheduledFor);
      await tx.scheduledJob.upsert({
        where: { postId: id },
        create: { workspaceId: guard.workspaceId, postId: id, ...jobData },
        update: jobData,
      });

      return tx.post.findUnique({
        where: { id },
        include: {
          socialAccount: { select: PUBLIC_SOCIAL_ACCOUNT_SELECT },
          mediaAssets: {
            include: { mediaAsset: true },
            orderBy: { order: "asc" },
          },
        },
      });
    });

    if (!requeued) {
      return NextResponse.json(
        { error: POST_CONFLICT_MESSAGE },
        { status: POST_CONFLICT_STATUS }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Failed publish re-queued",
      post: requeued,
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

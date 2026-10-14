import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/tenancy/guard";
import prisma from "@/lib/prisma";
import { PostStatus, JobStatus } from "@prisma/client";
import { z } from "zod";
import { PUBLIC_SOCIAL_ACCOUNT_SELECT } from "@/lib/social/account-select";
import {
  POST_CONFLICT_MESSAGE,
  POST_CONFLICT_STATUS,
  rescheduleGuardWhere,
  rescheduleJobWhere,
} from "@/lib/posts/transitions";

/** Thrown inside the transaction so a half-applied reschedule rolls back. */
class RescheduleConflict extends Error {}

const rescheduleSchema = z.object({
  scheduledFor: z.string(),
});

export async function PATCH(
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
    // A non-JSON body is a malformed request (400), not a server fault.
    const body = await req.json().catch(() => null);
    const validation = rescheduleSchema.safeParse(body);

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

    if (post.status !== PostStatus.SCHEDULED) {
      return NextResponse.json(
        { error: "Can only reschedule posts with SCHEDULED status" },
        { status: 400 }
      );
    }

    const scheduledFor = new Date(validation.data.scheduledFor);
    const now = new Date();

    // `Invalid Date <= now` is false, so an unparseable time used to pass the
    // future check and die in the database write as a 500.
    if (Number.isNaN(scheduledFor.getTime())) {
      return NextResponse.json(
        { error: "scheduledFor must be a valid date and time" },
        { status: 400 }
      );
    }

    if (scheduledFor <= now) {
      return NextResponse.json(
        { error: "Scheduled time must be in the future" },
        { status: 400 }
      );
    }

    // Guarded writes (src/lib/posts/transitions.ts). This was check-then-act:
    // an edit between the read above and the write left a DRAFT carrying the
    // new time, and the job was forced back to PENDING whatever its state —
    // including PROCESSING, i.e. while the worker was sending it.
    let updatedPost;
    try {
      updatedPost = await prisma.$transaction(async (tx) => {
        const claim = await tx.post.updateMany({
          where: rescheduleGuardWhere(id, guard.workspaceId),
          data: { scheduledFor },
        });
        if (claim.count === 0) throw new RescheduleConflict();

        const job = await tx.scheduledJob.updateMany({
          where: rescheduleJobWhere(id),
          data: { scheduledAt: scheduledFor, status: JobStatus.PENDING },
        });
        if (job.count === 0) throw new RescheduleConflict();

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
    } catch (error) {
      if (error instanceof RescheduleConflict) {
        return NextResponse.json({ error: POST_CONFLICT_MESSAGE }, { status: POST_CONFLICT_STATUS });
      }
      throw error;
    }

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

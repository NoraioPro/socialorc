import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { workspaceIdForWrite } from "@/lib/tenancy/workspace";
import { PostStatus, JobStatus } from "@prisma/client";
import { z } from "zod";
import { PUBLIC_SOCIAL_ACCOUNT_SELECT } from "@/lib/social/account-select";
import {
  POST_CONFLICT_MESSAGE,
  POST_CONFLICT_STATUS,
  scheduleBlockMessage,
  scheduleBlockReason,
  scheduleGuardWhere,
  unscheduleGuardWhere,
} from "@/lib/posts/transitions";

const scheduleSchema = z.object({
  scheduledFor: z.string(),
});

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requirePermission("posts:schedule");
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const { id } = await params;
    const body = await req.json();
    const validation = scheduleSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validation.error.issues },
        { status: 400 }
      );
    }

    const post = await prisma.post.findFirst({
      where: { id, userId: guard.userId },
      include: { socialAccount: { select: PUBLIC_SOCIAL_ACCOUNT_SELECT } },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    // Approval is checked here for the message, and again inside the write
    // below: the status alone is not proof of approval, and the row can change
    // between the two reads (see src/lib/posts/transitions.ts).
    if (scheduleBlockReason(post)) {
      return NextResponse.json(
        { error: scheduleBlockMessage(post.status) },
        { status: 400 }
      );
    }

    if (!post.socialAccountId || !post.socialAccount) {
      return NextResponse.json(
        { error: "Post must be linked to a social account before scheduling" },
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

    const scheduled = await prisma.$transaction(async (tx) => {
      // Guarded claim. Only a post that is still APPROVED *and* still carrying
      // its approval stamp may move to SCHEDULED. `count === 0` means an edit
      // (or a competing request) got there first, and this write must not
      // happen: otherwise an edited, unapproved post ends up SCHEDULED, and the
      // worker — which only reads the status — publishes it.
      const claim = await tx.post.updateMany({
        where: scheduleGuardWhere(id, guard.userId),
        data: {
          status: PostStatus.SCHEDULED,
          scheduledFor,
        },
      });

      if (claim.count === 0) return null;

      await tx.scheduledJob.upsert({
        where: { postId: id },
        create: {
          workspaceId: post.workspaceId ?? await workspaceIdForWrite(guard.userId),
          postId: id,
          scheduledAt: scheduledFor,
          status: JobStatus.PENDING,
        },
        update: {
          scheduledAt: scheduledFor,
          status: JobStatus.PENDING,
          attempts: 0,
          errorMessage: null,
        },
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

    if (!scheduled) {
      return NextResponse.json(
        { error: POST_CONFLICT_MESSAGE },
        { status: POST_CONFLICT_STATUS }
      );
    }

    return NextResponse.json({
      success: true,
      message: "Post scheduled successfully",
      post: scheduled,
      scheduledFor: scheduledFor.toISOString(),
    });
  } catch (error) {
    console.error("Error scheduling post:", error);
    return NextResponse.json(
      { error: "Failed to schedule post" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const guard = await requirePermission("posts:schedule");
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const { id } = await params;

    const post = await prisma.post.findFirst({
      where: { id, userId: guard.userId },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (post.status !== PostStatus.SCHEDULED) {
      return NextResponse.json(
        { error: "Can only unschedule posts with SCHEDULED status" },
        { status: 400 }
      );
    }

    await prisma.$transaction(async (tx) => {
      const claim = await tx.post.updateMany({
        where: unscheduleGuardWhere(id, guard.userId),
        data: {
          status: PostStatus.APPROVED,
          scheduledFor: null,
        },
      });

      if (claim.count === 0) return;

      await tx.scheduledJob.deleteMany({
        where: { postId: id },
      });
    });

    const updatedPost = await prisma.post.findUnique({
      where: { id },
      include: {
        socialAccount: { select: PUBLIC_SOCIAL_ACCOUNT_SELECT },
        mediaAssets: {
          include: { mediaAsset: true },
          orderBy: { order: "asc" },
        },
      },
    });

    return NextResponse.json({
      success: true,
      message: "Post unscheduled and returned to approved status",
      post: updatedPost,
    });
  } catch (error) {
    console.error("Error unscheduling post:", error);
    return NextResponse.json(
      { error: "Failed to unschedule post" },
      { status: 500 }
    );
  }
}

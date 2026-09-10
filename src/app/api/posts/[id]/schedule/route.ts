import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { PostStatus, JobStatus } from "@prisma/client";
import { z } from "zod";

const scheduleSchema = z.object({
  scheduledFor: z.string(),
});

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
    const body = await req.json();
    const validation = scheduleSchema.safeParse(body);

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

    if (post.status !== PostStatus.APPROVED) {
      return NextResponse.json(
        { error: "Post must be approved before scheduling. Current status: " + post.status },
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

    const [updatedPost] = await prisma.$transaction([
      prisma.post.update({
        where: { id },
        data: {
          status: PostStatus.SCHEDULED,
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
      prisma.scheduledJob.upsert({
        where: { postId: id },
        create: {
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
      }),
    ]);

    return NextResponse.json({
      success: true,
      message: "Post scheduled successfully",
      post: updatedPost,
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
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await params;

    const post = await prisma.post.findFirst({
      where: { id, userId: session.user.id },
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

    await prisma.$transaction([
      prisma.post.update({
        where: { id },
        data: {
          status: PostStatus.APPROVED,
          scheduledFor: null,
        },
      }),
      prisma.scheduledJob.deleteMany({
        where: { postId: id },
      }),
    ]);

    const updatedPost = await prisma.post.findUnique({
      where: { id },
      include: {
        socialAccount: true,
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

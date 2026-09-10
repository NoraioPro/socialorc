import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Platform } from "@prisma/client";
import { z } from "zod";

const updatePostSchema = z.object({
  title: z.string().optional(),
  content: z.string().min(1).optional(),
  platform: z.nativeEnum(Platform).optional(),
  socialAccountId: z.string().nullable().optional(),
  scheduledFor: z.string().nullable().optional(),
  platformContent: z.record(z.string(), z.unknown()).nullable().optional(),
  mediaAssetIds: z.array(z.string()).optional(),
});

type RouteContext = {
  params: Promise<{ id: string }>;
};

export async function GET(req: NextRequest, context: RouteContext) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    const post = await prisma.post.findFirst({
      where: { id, userId: session.user.id },
      include: {
        socialAccount: true,
        mediaAssets: {
          include: { mediaAsset: true },
          orderBy: { order: "asc" },
        },
      },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    return NextResponse.json(post);
  } catch (error) {
    console.error("Error fetching post:", error);
    return NextResponse.json(
      { error: "Failed to fetch post" },
      { status: 500 }
    );
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;
    const body = await req.json();
    const validation = updatePostSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid request", details: validation.error.issues },
        { status: 400 }
      );
    }

    const existingPost = await prisma.post.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!existingPost) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (["PUBLISHING", "PUBLISHED"].includes(existingPost.status)) {
      return NextResponse.json(
        { error: "Cannot edit a post that is publishing or published" },
        { status: 400 }
      );
    }

    const { mediaAssetIds, socialAccountId, scheduledFor, platformContent, ...restData } = validation.data;

    const updatePayload: Record<string, unknown> = {
      ...restData,
      status: "DRAFT",
      approvedAt: null,
      approvedBy: null,
    };

    if (scheduledFor !== undefined) {
      updatePayload.scheduledFor = scheduledFor ? new Date(scheduledFor) : null;
    }
    
    if (socialAccountId !== undefined) {
      updatePayload.socialAccountId = socialAccountId;
    }
    
    if (platformContent !== undefined) {
      updatePayload.platformContent = platformContent ?? undefined;
    }

    await prisma.post.update({
      where: { id },
      data: updatePayload,
      include: {
        socialAccount: true,
        mediaAssets: {
          include: { mediaAsset: true },
          orderBy: { order: "asc" },
        },
      },
    });

    if (mediaAssetIds !== undefined) {
      await prisma.postMedia.deleteMany({ where: { postId: id } });
      
      if (mediaAssetIds.length > 0) {
        await prisma.postMedia.createMany({
          data: mediaAssetIds.map((mediaAssetId, index) => ({
            postId: id,
            mediaAssetId,
            order: index,
          })),
        });
      }
    }

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

    return NextResponse.json(updatedPost);
  } catch (error) {
    console.error("Error updating post:", error);
    return NextResponse.json(
      { error: "Failed to update post" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest, context: RouteContext) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await context.params;

    const post = await prisma.post.findFirst({
      where: { id, userId: session.user.id },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (post.status === "PUBLISHING") {
      return NextResponse.json(
        { error: "Cannot delete a post that is currently publishing" },
        { status: 400 }
      );
    }

    await prisma.post.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting post:", error);
    return NextResponse.json(
      { error: "Failed to delete post" },
      { status: 500 }
    );
  }
}

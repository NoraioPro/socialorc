import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Platform } from "@prisma/client";
import { z } from "zod";
import {
  POST_SAFE_INCLUDE,
  findOwnedSocialAccount,
  unownedMediaAssetIds,
} from "@/lib/social/account-select";

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
    const session = await requirePermission("dashboard:view");
    if (!session.ok) {
      return NextResponse.json({ error: session.error }, { status: session.status });
    }

    const { id } = await context.params;

    const post = await prisma.post.findFirst({
      where: { id, userId: session.userId },
      include: POST_SAFE_INCLUDE,
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
    // Editing a post is authoring work: the same permission that lets you create
    // one. A CLIENT (read-only) account cannot rewrite somebody's draft.
    const guard = await requirePermission("posts:create");
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
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
      where: { id, userId: guard.userId },
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

    // A `socialAccountId` from the request body is a capability handle: writing
    // it unchecked let anyone point their own draft at another tenant's account
    // and publish through it. Refuse unless the caller owns that account.
    if (socialAccountId !== undefined && socialAccountId !== null) {
      const owned = await findOwnedSocialAccount(guard.userId, socialAccountId);
      if (!owned) {
        return NextResponse.json(
          { error: "Social account not found" },
          { status: 404 }
        );
      }
    }

    // Same for media: attaching someone else's asset leaked its URL back to the
    // caller and let them publish a file they never uploaded.
    if (mediaAssetIds !== undefined) {
      const unowned = await unownedMediaAssetIds(guard.userId, mediaAssetIds);
      if (unowned.length > 0) {
        return NextResponse.json(
          { error: "One or more media assets were not found" },
          { status: 404 }
        );
      }
    }

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
      include: POST_SAFE_INCLUDE,
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
      include: POST_SAFE_INCLUDE,
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
    // `posts:delete` exists in the role matrix (ADMIN only) but was never
    // enforced anywhere, so every signed-in account could delete any post.
    //
    // Enforcing it as-is broke a real workflow though: MANAGER and EDITOR lost
    // the ability to delete their own drafts, and the delete buttons in the
    // dashboard are not role-gated, so they would just see a 403. Deleting your
    // own draft is authoring work — the same permission that lets you write it.
    // `posts:delete` is required once a post has moved past draft.
    const authoring = await requirePermission("posts:create");
    let guard = authoring;
    if (!authoring.ok) {
      guard = await requirePermission("posts:delete");
    }
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const { id } = await context.params;

    const post = await prisma.post.findFirst({
      where: { id, userId: guard.userId },
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

    // DRAFT and PENDING_APPROVAL are still the author's own work-in-progress
    // (a rejection returns the post to DRAFT with a rejectionReason). Anything
    // further along is an admin action.
    const isOwnDraft = post.status === "DRAFT" || post.status === "PENDING_APPROVAL";
    if (!isOwnDraft) {
      const strong = await requirePermission("posts:delete");
      if (!strong.ok) {
        return NextResponse.json(
          { error: "Approved and scheduled posts can only be deleted by an admin" },
          { status: strong.status }
        );
      }
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

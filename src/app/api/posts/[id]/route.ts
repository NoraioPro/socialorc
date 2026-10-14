import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace, tenantCan } from "@/lib/tenancy/guard";
import prisma from "@/lib/prisma";
import { Platform } from "@prisma/client";
import { z } from "zod";
import {
  POST_SAFE_INCLUDE,
  POST_SAFE_INCLUDE_WITH_AUTHOR,
  findWorkspaceSocialAccount,
  foreignMediaAssetIds,
} from "@/lib/social/account-select";
import {
  ACCOUNT_PLATFORM_MISMATCH_CODE,
  accountPlatformMismatch,
  accountPlatformMismatchMessage,
  deleteGuardWhere,
  editGuardWhere,
  POST_CONFLICT_MESSAGE,
  POST_CONFLICT_STATUS,
} from "@/lib/posts/transitions";
import { discardInFlightMediaForPost } from "@/lib/adapters/in-flight-media";

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
    const tenant = await requireWorkspace("dashboard:view");
    if (!tenant.ok) {
      return NextResponse.json({ error: tenant.error }, { status: tenant.status });
    }

    const { id } = await context.params;

    const post = await prisma.post.findFirst({
      where: { id, workspaceId: tenant.workspaceId },
      include: POST_SAFE_INCLUDE_WITH_AUTHOR,
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
    // one. A CLIENT (read-only) account cannot rewrite somebody's draft. Posts
    // are the workspace's, so a teammate may edit a colleague's draft; editing
    // returns it to DRAFT and clears any approval either way.
    const guard = await requireWorkspace("posts:create");
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
      where: { id, workspaceId: guard.workspaceId },
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
    // and publish through it. Refuse unless it is in the caller's workspace.
    const effectivePlatform = restData.platform ?? existingPost.platform;
    // When only the platform changes, the old link points at the wrong network:
    // relink to the workspace's account for the new platform (as create does),
    // or unlink if there is none — never keep a mismatched account.
    let relinkAccountId: string | null | undefined;
    if (socialAccountId !== undefined && socialAccountId !== null) {
      const owned = await findWorkspaceSocialAccount(guard.workspaceId, socialAccountId);
      if (!owned) {
        return NextResponse.json(
          { error: "Social account not found" },
          { status: 404 }
        );
      }
      if (accountPlatformMismatch(effectivePlatform, owned)) {
        return NextResponse.json(
          {
            error: accountPlatformMismatchMessage(effectivePlatform, owned.platform),
            code: ACCOUNT_PLATFORM_MISMATCH_CODE,
          },
          { status: 400 }
        );
      }
    } else if (
      socialAccountId === undefined &&
      restData.platform !== undefined &&
      restData.platform !== existingPost.platform &&
      existingPost.socialAccountId
    ) {
      const replacement = await prisma.socialAccount.findFirst({
        where: { workspaceId: guard.workspaceId, platform: effectivePlatform, isActive: true },
        orderBy: { createdAt: "asc" },
        select: { id: true },
      });
      relinkAccountId = replacement?.id ?? null;
    }

    // Same for media: attaching someone else's asset leaked its URL back to the
    // caller and let them publish a file they never uploaded.
    if (mediaAssetIds !== undefined) {
      const unowned = await foreignMediaAssetIds(guard.workspaceId, mediaAssetIds);
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
    } else if (relinkAccountId !== undefined) {
      updatePayload.socialAccountId = relinkAccountId;
    }

    if (platformContent !== undefined) {
      updatePayload.platformContent = platformContent ?? undefined;
    }

    // Guarded write. The pre-check above refuses PUBLISHING/PUBLISHED with a
    // clear 400; this closes the window between that read and this write, where
    // the worker can claim the post and start sending it.
    const edited = await prisma.post.updateMany({
      where: editGuardWhere(id, guard.workspaceId),
      data: updatePayload,
    });

    if (edited.count === 0) {
      return NextResponse.json(
        { error: "Cannot edit a post that is publishing or published" },
        { status: 400 }
      );
    }

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

    // An async upload (Instagram Reel container, X video) still in flight was
    // made from the old caption/media. Drop it so no later attempt resumes and
    // publishes the pre-edit version.
    const contentChanged =
      (restData.content !== undefined && restData.content !== existingPost.content) ||
      mediaAssetIds !== undefined;
    if (contentChanged) {
      await discardInFlightMediaForPost(prisma, id);
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
    // `posts:delete` is required once a post has moved past draft, and for
    // deleting a teammate's draft.
    const guard = await requireWorkspace("dashboard:view");
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }
    if (!tenantCan(guard, "posts:create") && !tenantCan(guard, "posts:delete")) {
      return NextResponse.json(
        { error: `Your role (${guard.role}) is not allowed to posts:delete` },
        { status: 403 }
      );
    }

    const { id } = await context.params;

    const post = await prisma.post.findFirst({
      where: { id, workspaceId: guard.workspaceId },
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
    const isOwnDraft =
      post.userId === guard.userId &&
      (post.status === "DRAFT" || post.status === "PENDING_APPROVAL");
    if (!isOwnDraft && !tenantCan(guard, "posts:delete")) {
      return NextResponse.json(
        { error: "Approved and scheduled posts, and teammates' drafts, can only be deleted by an admin" },
        { status: 403 }
      );
    }

    // Guarded write (workspace + status), so the worker claiming the post, or an
    // approval landing, between the read above and here makes this a 409.
    const deleted = await prisma.post.deleteMany({
      where: deleteGuardWhere(id, guard.workspaceId, {
        draftOnly: !tenantCan(guard, "posts:delete"),
      }),
    });
    if (deleted.count === 0) {
      return NextResponse.json(
        { error: POST_CONFLICT_MESSAGE },
        { status: POST_CONFLICT_STATUS }
      );
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error deleting post:", error);
    return NextResponse.json(
      { error: "Failed to delete post" },
      { status: 500 }
    );
  }
}

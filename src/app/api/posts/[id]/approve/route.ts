import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/tenancy/guard";
import type { Permission } from "@/lib/roles";
import prisma from "@/lib/prisma";
import { PostStatus } from "@prisma/client";
import { PUBLIC_SOCIAL_ACCOUNT_SELECT } from "@/lib/social/account-select";
import {
  POST_CONFLICT_MESSAGE,
  POST_CONFLICT_STATUS,
  approveGuardWhere,
  submitGuardWhere,
} from "@/lib/posts/transitions";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const action = body.action || "approve";

    // Submitting a draft for review is an editor action; approving or
    // rejecting it is a manager/admin action. Gate per action, not per route.
    //
    // Scope is the workspace, not the author: any member holding
    // `posts:approve` may decide on any pending post in their workspace. That
    // is the point of an approval step — before this, only the author could
    // approve their own post, so an EDITOR's draft could never be approved by
    // anyone. A post in another workspace is simply not found.
    const requiredPermission: Permission =
      action === "submit" ? "posts:submit" : "posts:approve";

    const guard = await requireWorkspace(requiredPermission);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const post = await prisma.post.findFirst({
      where: { id, workspaceId: guard.workspaceId },
    });

    if (!post) {
      return NextResponse.json({ error: "Post not found" }, { status: 404 });
    }

    if (!["DRAFT", "PENDING_APPROVAL"].includes(post.status)) {
      return NextResponse.json(
        { error: `Cannot ${action} a post with status: ${post.status}` },
        { status: 400 }
      );
    }

    if (action === "approve") {
      const claim = await prisma.post.updateMany({
        where: approveGuardWhere(id, guard.workspaceId),
        data: {
          status: PostStatus.APPROVED,
          approvedAt: new Date(),
          approvedBy: guard.userId,
          rejectionReason: null,
        },
      });

      if (claim.count === 0) {
        return NextResponse.json(
          { error: POST_CONFLICT_MESSAGE },
          { status: POST_CONFLICT_STATUS }
        );
      }

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
        message: "Post approved successfully",
        post: updatedPost,
      });
    } else if (action === "reject") {
      const reason = body.reason || "No reason provided";

      const claim = await prisma.post.updateMany({
        where: approveGuardWhere(id, guard.workspaceId),
        data: {
          status: PostStatus.DRAFT,
          rejectionReason: reason,
          approvedAt: null,
          approvedBy: null,
        },
      });

      if (claim.count === 0) {
        return NextResponse.json(
          { error: POST_CONFLICT_MESSAGE },
          { status: POST_CONFLICT_STATUS }
        );
      }

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
        message: "Post rejected and returned to draft",
        post: updatedPost,
      });
    } else if (action === "submit") {
      const claim = await prisma.post.updateMany({
        where: submitGuardWhere(id, guard.workspaceId),
        data: {
          status: PostStatus.PENDING_APPROVAL,
          rejectionReason: null,
        },
      });

      if (claim.count === 0) {
        return NextResponse.json(
          { error: POST_CONFLICT_MESSAGE },
          { status: POST_CONFLICT_STATUS }
        );
      }

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
        message: "Post submitted for approval",
        post: updatedPost,
      });
    }

    return NextResponse.json(
      { error: "Invalid action. Use 'approve', 'reject', or 'submit'" },
      { status: 400 }
    );
  } catch (error) {
    console.error("Error processing approval:", error);
    return NextResponse.json(
      { error: "Failed to process approval" },
      { status: 500 }
    );
  }
}

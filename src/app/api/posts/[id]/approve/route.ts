import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import type { Permission } from "@/lib/roles";
import prisma from "@/lib/prisma";
import { PostStatus } from "@prisma/client";

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
    const requiredPermission: Permission =
      action === "submit" ? "posts:submit" : "posts:approve";

    const guard = await requirePermission(requiredPermission);
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const post = await prisma.post.findFirst({
      where: { id, userId: guard.userId },
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
      const updatedPost = await prisma.post.update({
        where: { id },
        data: {
          status: PostStatus.APPROVED,
          approvedAt: new Date(),
          approvedBy: guard.userId,
          rejectionReason: null,
        },
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
        message: "Post approved successfully",
        post: updatedPost,
      });
    } else if (action === "reject") {
      const reason = body.reason || "No reason provided";

      const updatedPost = await prisma.post.update({
        where: { id },
        data: {
          status: PostStatus.DRAFT,
          rejectionReason: reason,
          approvedAt: null,
          approvedBy: null,
        },
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
        message: "Post rejected and returned to draft",
        post: updatedPost,
      });
    } else if (action === "submit") {
      const updatedPost = await prisma.post.update({
        where: { id },
        data: {
          status: PostStatus.PENDING_APPROVAL,
          rejectionReason: null,
        },
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

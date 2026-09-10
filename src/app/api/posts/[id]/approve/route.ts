import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { PostStatus } from "@prisma/client";

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
    const action = body.action || "approve";

    const post = await prisma.post.findFirst({
      where: { id, userId: session.user.id },
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
          approvedBy: session.user.id,
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

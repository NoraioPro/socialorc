import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { PostStatus } from "@prisma/client";
import { clientIp, recordAudit } from "@/lib/audit";
import { verifyReviewToken } from "@/lib/review-link";

export const dynamic = "force-dynamic";

/**
 * POST /api/review/[token] — the client's decision, authenticated by the signed
 * link itself (no account). Only a pending or approved-before post can be
 * decided; the change is written to the audit trail with the link as the actor.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const verified = verifyReviewToken(token);
  if (!verified) {
    return NextResponse.json({ error: "This review link is invalid or has expired." }, { status: 401 });
  }

  let body: { action?: unknown; note?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const action = body.action === "approve" ? "approve" : body.action === "changes" ? "changes" : null;
  if (!action) return NextResponse.json({ error: "Choose approve or request changes." }, { status: 400 });

  const note = typeof body.note === "string" ? body.note.trim().slice(0, 1000) : "";
  if (action === "changes" && !note) {
    return NextResponse.json({ error: "Tell us what should change." }, { status: 400 });
  }

  const post = await prisma.post.findUnique({
    where: { id: verified.postId },
    select: { id: true, title: true, workspaceId: true, status: true, platform: true },
  });
  if (!post?.workspaceId) return NextResponse.json({ error: "Post not found." }, { status: 404 });

  if (!["PENDING_APPROVAL", "APPROVED"].includes(post.status)) {
    return NextResponse.json(
      { error: "This post is no longer open for review." },
      { status: 409 },
    );
  }

  if (action === "approve") {
    await prisma.post.update({
      where: { id: post.id },
      data: {
        status: PostStatus.APPROVED,
        approvedAt: new Date(),
        approvedBy: null,
        rejectionReason: null,
      },
    });
  } else {
    await prisma.post.update({
      where: { id: post.id },
      data: { status: PostStatus.DRAFT, rejectionReason: note, approvedAt: null, approvedBy: null },
    });
  }

  await recordAudit({
    workspaceId: post.workspaceId,
    actorId: null,
    actorLabel: "client via review link",
    action: action === "approve" ? "REVIEW_LINK_APPROVED" : "REVIEW_LINK_CHANGES",
    subjectType: "POST",
    subjectId: post.id,
    detail: { title: post.title, platform: post.platform, note: note || undefined },
    ip: clientIp(req.headers),
  });

  return NextResponse.json({
    success: true,
    message:
      action === "approve"
        ? "Thank you — the post is approved."
        : "Sent back to the team with your note.",
  });
}

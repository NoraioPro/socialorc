import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireWorkspace } from "@/lib/tenancy/guard";
import { appOrigin } from "@/lib/social/approval";
import { mintReviewToken, reviewPath } from "@/lib/review-link";

export const dynamic = "force-dynamic";

/** POST /api/posts/[id]/review-link — an internal reviewer mints a client link. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await requireWorkspace("posts:approve");
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });

  const post = await prisma.post.findFirst({
    where: { id, workspaceId: guard.workspaceId },
    select: { id: true, title: true },
  });
  if (!post) return NextResponse.json({ error: "Post not found" }, { status: 404 });

  // Prefer the origin the request actually arrived on: the link is opened in a
  // browser, so a mis-set APP_URL must not hand the client a dead host. Falls
  // back to the configured origin when no host header is present.
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const proto = req.headers.get("x-forwarded-proto") ?? "http";
  const origin = host ? `${proto}://${host}` : (appOrigin() ?? "");

  const token = mintReviewToken(post.id);
  return NextResponse.json({
    url: `${origin}${reviewPath(token)}`,
    token,
    expiresInHours: 72,
    post: { id: post.id, title: post.title },
  });
}

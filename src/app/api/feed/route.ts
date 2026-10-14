import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireWorkspace } from "@/lib/tenancy/guard";

/**
 * The workspace timeline.
 *
 * The feed used to be a "network": your own posts plus published posts from
 * accepted friendships. Nothing ever created a friendship, so in practice it was
 * your own posts only. Workspaces are the collaboration boundary now, so the
 * feed is the team's timeline: every post in the caller's workspace, whoever
 * wrote it, and nothing from any other workspace.
 */
export async function GET(request: NextRequest) {
  const tenant = await requireWorkspace("dashboard:view");
  if (!tenant.ok) return NextResponse.json({ error: tenant.error }, { status: tenant.status });

  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit")) || 20, 1), 50);
  const offset = Math.max(Number(request.nextUrl.searchParams.get("offset")) || 0, 0);
  try {
    const where = { workspaceId: tenant.workspaceId };
    const [posts, total, profile] = await Promise.all([
      prisma.post.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
        include: {
          user: { select: { id: true, name: true, image: true, headline: true, role: true } },
          mediaAssets: { include: { mediaAsset: true }, orderBy: { order: "asc" } },
          feedReactions: { select: { userId: true, type: true } },
          feedComments: {
            orderBy: { createdAt: "asc" },
            take: 20,
            include: { user: { select: { id: true, name: true, image: true } } },
          },
        },
      }),
      prisma.post.count({ where }),
      prisma.user.findUnique({
        where: { id: tenant.userId },
        select: { id: true, name: true, email: true, image: true, headline: true, bio: true, location: true, website: true, coverImageUrl: true, role: true },
      }),
    ]);

    return NextResponse.json({ posts, total, profile, viewerId: tenant.userId, limit, offset });
  } catch (error) {
    console.error("Feed load failed:", error);
    return NextResponse.json({ error: "Could not load your timeline." }, { status: 500 });
  }
}

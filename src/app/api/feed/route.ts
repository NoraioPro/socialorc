import { NextRequest, NextResponse } from "next/server";
import { PostStatus } from "@prisma/client";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit")) || 20, 1), 50);
  const offset = Math.max(Number(request.nextUrl.searchParams.get("offset")) || 0, 0);
  try {
    // The timeline is a shared network: keep private workflow drafts private,
    // while published posts from accepted connections join the viewer's feed.
    const friendships = await prisma.friendship.findMany({
      where: {
        status: "ACCEPTED",
        OR: [{ requesterId: session.user.id }, { addresseeId: session.user.id }],
      },
      select: { requesterId: true, addresseeId: true },
    });
    const friendIds = friendships.map(edge =>
      edge.requesterId === session.user.id ? edge.addresseeId : edge.requesterId,
    );
    const where = {
      OR: [
        { userId: session.user.id },
        ...(friendIds.length > 0 ? [{ userId: { in: friendIds }, status: PostStatus.PUBLISHED }] : []),
      ],
    };
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
        where: { id: session.user.id },
        select: { id: true, name: true, email: true, image: true, headline: true, bio: true, location: true, website: true, coverImageUrl: true, role: true },
      }),
    ]);

    return NextResponse.json({ posts, total, profile, viewerId: session.user.id, limit, offset });
  } catch (error) {
    console.error("Feed load failed:", error);
    return NextResponse.json({ error: "Could not load your timeline." }, { status: 500 });
  }
}

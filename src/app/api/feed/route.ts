import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";

export async function GET(request: NextRequest) {
  const session = await getAuthSession();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const limit = Math.min(Math.max(Number(request.nextUrl.searchParams.get("limit")) || 20, 1), 50);
  const offset = Math.max(Number(request.nextUrl.searchParams.get("offset")) || 0, 0);
  try {
    const where = { userId: session.user.id };
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

import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { computeTractionScore, computeMetricsFromPosts } from "@/lib/traction-score";

export async function GET() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const posts = await prisma.post.findMany({
    where: { userId: session.user.id },
    select: {
      status: true,
      createdAt: true,
      publishedAt: true,
      approvedAt: true,
    },
  });

  const metrics = computeMetricsFromPosts(posts);
  const tractionScore = computeTractionScore(metrics);

  return NextResponse.json(tractionScore);
}

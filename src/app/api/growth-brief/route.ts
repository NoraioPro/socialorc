import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { computeTractionScore, computeMetricsFromPosts } from "@/lib/traction-score";
import { generateGrowthBrief, generateMockPlatformStats } from "@/lib/growth-brief";

export async function GET() {
  const session = await getAuthSession();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const posts = await prisma.post.findMany({
    where: { userId: session.user.id },
    select: {
      status: true,
      platform: true,
      createdAt: true,
      publishedAt: true,
      approvedAt: true,
    },
  });

  const metrics = computeMetricsFromPosts(posts);
  const tractionScore = computeTractionScore(metrics);

  const platformStats = generateMockPlatformStats(
    posts.map((p) => ({ platform: p.platform, status: p.status }))
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayPostCount = posts.filter((p) => {
    const postDate = new Date(p.createdAt);
    postDate.setHours(0, 0, 0, 0);
    return postDate.getTime() === today.getTime();
  }).length;

  const growthBrief = generateGrowthBrief(tractionScore, platformStats, todayPostCount);

  return NextResponse.json(growthBrief);
}

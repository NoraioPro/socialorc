import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/tenancy/guard";
import prisma from "@/lib/prisma";
import { computeTractionScore, computeMetricsFromPosts } from "@/lib/traction-score";
import { computePlatformStats, generateGrowthBrief } from "@/lib/growth-brief";

export async function GET() {
  // The workspace's numbers: the team publishes together.
  const tenant = await requireWorkspace("dashboard:view");
  if (!tenant.ok) {
    return NextResponse.json({ error: tenant.error }, { status: tenant.status });
  }

  const posts = await prisma.post.findMany({
    where: { workspaceId: tenant.workspaceId },
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

  const platformStats = computePlatformStats(
    posts.map((p) => ({ platform: p.platform, status: p.status, createdAt: p.createdAt }))
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

import { NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/tenancy/guard";
import prisma from "@/lib/prisma";
import { computeTractionScore, computeMetricsFromPosts } from "@/lib/traction-score";

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
      createdAt: true,
      publishedAt: true,
      approvedAt: true,
    },
  });

  const metrics = computeMetricsFromPosts(posts);
  const tractionScore = computeTractionScore(metrics);

  return NextResponse.json(tractionScore);
}

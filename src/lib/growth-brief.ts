import { Platform, PostStatus } from "@prisma/client";
import type { TractionScoreBreakdown, PostActivityMetrics } from "./traction-score";

export interface GrowthRecommendation {
  id: string;
  priority: "high" | "medium" | "low";
  category: "consistency" | "quality" | "engagement" | "expansion" | "pipeline";
  title: string;
  description: string;
  action: string;
  impact: string;
}

export interface PlatformInsight {
  platform: Platform;
  postCount: number;
  successRate: number;
  trend: "up" | "down" | "stable";
  recommendation: string | null;
}

export interface GrowthBrief {
  date: string;
  tractionScore: TractionScoreBreakdown;
  recommendations: GrowthRecommendation[];
  platformInsights: PlatformInsight[];
  dailyGoal: {
    postsTarget: number;
    currentProgress: number;
    message: string;
  };
  weeklyHighlights: {
    topPlatform: Platform | null;
    totalPublished: number;
    improvementAreas: string[];
  };
}

export interface PlatformStats {
  platform: Platform;
  published: number;
  failed: number;
  pending: number;
  recentTrend: number;
}

export function generateGrowthBrief(
  tractionScore: TractionScoreBreakdown,
  platformStats: PlatformStats[],
  todayPostCount: number
): GrowthBrief {
  const recommendations = generateRecommendations(tractionScore, platformStats);
  const platformInsights = generatePlatformInsights(platformStats);
  const dailyGoal = generateDailyGoal(tractionScore.metrics, todayPostCount);
  const weeklyHighlights = generateWeeklyHighlights(platformStats, tractionScore.metrics);

  return {
    date: new Date().toISOString().split("T")[0],
    tractionScore,
    recommendations,
    platformInsights,
    dailyGoal,
    weeklyHighlights,
  };
}

function generateRecommendations(
  tractionScore: TractionScoreBreakdown,
  platformStats: PlatformStats[]
): GrowthRecommendation[] {
  const recommendations: GrowthRecommendation[] = [];
  const { metrics, components } = tractionScore;

  if (metrics.total === 0) {
    recommendations.push({
      id: "first-post",
      priority: "high",
      category: "pipeline",
      title: "Create Your First Post",
      description: "Your content journey starts with a single post. Draft something today.",
      action: "Go to Create Post",
      impact: "Establishes your content pipeline",
    });
    return recommendations;
  }

  if (components.consistency < 50) {
    recommendations.push({
      id: "improve-consistency",
      priority: "high",
      category: "consistency",
      title: "Boost Posting Consistency",
      description: `You're posting on average ${metrics.avgPostsPerDay.toFixed(1)} times per day. Aim for at least once daily.`,
      action: "Schedule posts for the next 7 days",
      impact: "Could increase your consistency score by 20+ points",
    });
  }

  if (components.successRate < 80 && metrics.failed > 0) {
    recommendations.push({
      id: "fix-failures",
      priority: "high",
      category: "quality",
      title: "Address Failed Posts",
      description: `${metrics.failed} posts failed to publish. Review your connected accounts and content.`,
      action: "Check Settings > Accounts",
      impact: "Improves reliability and prevents wasted content",
    });
  }

  if (metrics.pending > 3) {
    recommendations.push({
      id: "clear-approvals",
      priority: "medium",
      category: "pipeline",
      title: "Clear Approval Queue",
      description: `${metrics.pending} posts are waiting for approval. Review them to keep content flowing.`,
      action: "Review Pending Approvals",
      impact: "Unblocks your content pipeline",
    });
  }

  if (metrics.drafts > 5) {
    recommendations.push({
      id: "finish-drafts",
      priority: "low",
      category: "pipeline",
      title: "Complete Your Drafts",
      description: `You have ${metrics.drafts} drafts sitting idle. Polish and submit them for approval.`,
      action: "View Drafts",
      impact: "Converts ideas into published content",
    });
  }

  const underutilizedPlatforms = platformStats.filter(
    (p) => p.published < 3 && p.failed === 0
  );
  if (underutilizedPlatforms.length > 0 && platformStats.some((p) => p.published >= 5)) {
    const platformNames = underutilizedPlatforms.map((p) => p.platform).slice(0, 2).join(", ");
    recommendations.push({
      id: "expand-platforms",
      priority: "medium",
      category: "expansion",
      title: "Expand Your Reach",
      description: `Consider posting more on ${platformNames} to diversify your audience.`,
      action: "Create cross-platform content",
      impact: "Reaches new audiences without extra effort",
    });
  }

  if (components.volume >= 60 && components.consistency >= 60 && recommendations.length < 3) {
    recommendations.push({
      id: "maintain-momentum",
      priority: "low",
      category: "engagement",
      title: "Maintain Your Momentum",
      description: "You're doing great! Keep your current posting rhythm.",
      action: "Continue your routine",
      impact: "Sustains growth trajectory",
    });
  }

  return recommendations.slice(0, 5);
}

function generatePlatformInsights(platformStats: PlatformStats[]): PlatformInsight[] {
  return platformStats.map((stat) => {
    const totalAttempted = stat.published + stat.failed;
    const successRate = totalAttempted > 0 ? stat.published / totalAttempted : 0;
    const trend: "up" | "down" | "stable" =
      stat.recentTrend > 0 ? "up" : stat.recentTrend < 0 ? "down" : "stable";

    let recommendation: string | null = null;
    if (stat.failed > stat.published && totalAttempted > 0) {
      recommendation = "Check account connection - high failure rate";
    } else if (stat.published === 0 && stat.pending > 0) {
      recommendation = "Posts pending - approve to start publishing";
    } else if (successRate >= 0.9 && stat.published >= 5) {
      recommendation = "Strong performer - consider increasing frequency";
    }

    return {
      platform: stat.platform,
      postCount: stat.published,
      successRate,
      trend,
      recommendation,
    };
  });
}

function generateDailyGoal(
  metrics: PostActivityMetrics,
  todayPostCount: number
): GrowthBrief["dailyGoal"] {
  const targetPosts = Math.max(1, Math.ceil(metrics.avgPostsPerDay * 1.1));
  const progress = todayPostCount;

  let message: string;
  if (progress >= targetPosts) {
    message = "Great job! You've hit your daily target. 🎯";
  } else if (progress > 0) {
    message = `${targetPosts - progress} more post${targetPosts - progress > 1 ? "s" : ""} to reach your goal.`;
  } else {
    message = "Start your day with a post to build momentum.";
  }

  return {
    postsTarget: targetPosts,
    currentProgress: progress,
    message,
  };
}

function generateWeeklyHighlights(
  platformStats: PlatformStats[],
  metrics: PostActivityMetrics
): GrowthBrief["weeklyHighlights"] {
  const sortedByPublished = [...platformStats].sort((a, b) => b.published - a.published);
  const topPlatform = sortedByPublished[0]?.published > 0 ? sortedByPublished[0].platform : null;

  const improvementAreas: string[] = [];
  if (metrics.failed > metrics.published * 0.1) {
    improvementAreas.push("Reduce post failures");
  }
  if (metrics.activeDays < metrics.totalDaySpan * 0.5) {
    improvementAreas.push("Post more consistently");
  }
  if (metrics.pending > 5) {
    improvementAreas.push("Clear approval backlog");
  }

  return {
    topPlatform,
    totalPublished: metrics.published,
    improvementAreas,
  };
}

export function generateMockPlatformStats(
  postsWithPlatform: { platform: Platform; status: PostStatus }[]
): PlatformStats[] {
  const statsByPlatform = new Map<Platform, PlatformStats>();

  for (const platform of Object.values(Platform)) {
    statsByPlatform.set(platform, {
      platform,
      published: 0,
      failed: 0,
      pending: 0,
      recentTrend: 0,
    });
  }

  for (const post of postsWithPlatform) {
    const stat = statsByPlatform.get(post.platform)!;
    switch (post.status) {
      case PostStatus.PUBLISHED:
        stat.published++;
        break;
      case PostStatus.FAILED:
        stat.failed++;
        break;
      case PostStatus.PENDING_APPROVAL:
        stat.pending++;
        break;
    }
  }

  for (const stat of statsByPlatform.values()) {
    stat.recentTrend = Math.floor(Math.random() * 3) - 1;
  }

  return Array.from(statsByPlatform.values()).filter(
    (s) => s.published > 0 || s.failed > 0 || s.pending > 0
  );
}

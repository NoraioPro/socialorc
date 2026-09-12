import { PostStatus } from "@prisma/client";

export interface PostActivityMetrics {
  total: number;
  published: number;
  failed: number;
  pending: number;
  scheduled: number;
  drafts: number;
  approvalRate: number;
  publishSuccessRate: number;
  avgPostsPerDay: number;
  activeDays: number;
  totalDaySpan: number;
}

export interface TractionScoreBreakdown {
  score: number;
  components: {
    volume: number;
    consistency: number;
    successRate: number;
    pipelineHealth: number;
  };
  metrics: PostActivityMetrics;
  grade: "A" | "B" | "C" | "D" | "F";
  summary: string;
}

export function computeTractionScore(metrics: PostActivityMetrics): TractionScoreBreakdown {
  const volumeScore = computeVolumeScore(metrics);
  const consistencyScore = computeConsistencyScore(metrics);
  const successRateScore = computeSuccessRateScore(metrics);
  const pipelineHealthScore = computePipelineHealthScore(metrics);

  const weightedScore =
    volumeScore * 0.25 +
    consistencyScore * 0.25 +
    successRateScore * 0.3 +
    pipelineHealthScore * 0.2;

  const score = Math.round(Math.max(0, Math.min(100, weightedScore)));

  return {
    score,
    components: {
      volume: Math.round(volumeScore),
      consistency: Math.round(consistencyScore),
      successRate: Math.round(successRateScore),
      pipelineHealth: Math.round(pipelineHealthScore),
    },
    metrics,
    grade: scoreToGrade(score),
    summary: generateSummary(score, metrics),
  };
}

function computeVolumeScore(metrics: PostActivityMetrics): number {
  if (metrics.total === 0) return 0;
  const publishedWeight = Math.min(metrics.published / 10, 1) * 60;
  const scheduledWeight = Math.min(metrics.scheduled / 5, 1) * 20;
  const pipelineWeight = Math.min((metrics.pending + metrics.drafts) / 5, 1) * 20;
  return publishedWeight + scheduledWeight + pipelineWeight;
}

function computeConsistencyScore(metrics: PostActivityMetrics): number {
  if (metrics.totalDaySpan === 0 || metrics.activeDays === 0) return 0;
  const consistencyRatio = metrics.activeDays / Math.max(metrics.totalDaySpan, 1);
  const frequencyBonus = Math.min(metrics.avgPostsPerDay / 2, 1) * 30;
  return Math.min(consistencyRatio * 70 + frequencyBonus, 100);
}

function computeSuccessRateScore(metrics: PostActivityMetrics): number {
  if (metrics.total === 0) return 0;
  if (metrics.published + metrics.failed === 0) return 50;
  return metrics.publishSuccessRate * 100;
}

function computePipelineHealthScore(metrics: PostActivityMetrics): number {
  if (metrics.total === 0) return 0;
  const approvalBonus = metrics.approvalRate * 40;
  const noFailurePenalty = metrics.failed > 0 ? Math.min(metrics.failed * 10, 40) : 0;
  const activeQueueBonus = (metrics.scheduled + metrics.pending) > 0 ? 20 : 0;
  return Math.max(0, Math.min(100, 40 + approvalBonus + activeQueueBonus - noFailurePenalty));
}

function scoreToGrade(score: number): "A" | "B" | "C" | "D" | "F" {
  if (score >= 90) return "A";
  if (score >= 75) return "B";
  if (score >= 60) return "C";
  if (score >= 40) return "D";
  return "F";
}

function generateSummary(score: number, metrics: PostActivityMetrics): string {
  if (metrics.total === 0) {
    return "No posts yet. Create your first post to start building traction.";
  }
  if (metrics.failed > metrics.published && metrics.failed > 0) {
    return "High failure rate detected. Check your connected accounts and content.";
  }
  if (score >= 90) {
    return "Excellent traction! Your content pipeline is firing on all cylinders.";
  }
  if (score >= 75) {
    return "Strong performance. Keep up the consistent posting schedule.";
  }
  if (score >= 60) {
    return "Good progress. Consider increasing posting frequency for better reach.";
  }
  if (score >= 40) {
    return "Room for improvement. Focus on consistency and clearing your approval queue.";
  }
  return "Just getting started. Build momentum with regular, approved content.";
}

export interface PostActivityInput {
  status: PostStatus;
  createdAt: Date;
  publishedAt: Date | null;
  approvedAt: Date | null;
}

export function computeMetricsFromPosts(posts: PostActivityInput[]): PostActivityMetrics {
  if (posts.length === 0) {
    return {
      total: 0,
      published: 0,
      failed: 0,
      pending: 0,
      scheduled: 0,
      drafts: 0,
      approvalRate: 0,
      publishSuccessRate: 0,
      avgPostsPerDay: 0,
      activeDays: 0,
      totalDaySpan: 0,
    };
  }

  const counts = {
    published: 0,
    failed: 0,
    pending: 0,
    scheduled: 0,
    drafts: 0,
    approved: 0,
  };

  const publishDates = new Set<string>();
  let earliestDate: Date | null = null;
  let latestDate: Date | null = null;

  for (const post of posts) {
    switch (post.status) {
      case PostStatus.PUBLISHED:
        counts.published++;
        if (post.publishedAt) {
          publishDates.add(post.publishedAt.toISOString().split("T")[0]);
        }
        break;
      case PostStatus.FAILED:
        counts.failed++;
        break;
      case PostStatus.PENDING_APPROVAL:
        counts.pending++;
        break;
      case PostStatus.SCHEDULED:
      case PostStatus.PUBLISHING:
        counts.scheduled++;
        break;
      case PostStatus.DRAFT:
        counts.drafts++;
        break;
      case PostStatus.APPROVED:
        counts.scheduled++;
        break;
    }

    if (post.approvedAt) {
      counts.approved++;
    }

    const postDate = post.createdAt;
    if (!earliestDate || postDate < earliestDate) earliestDate = postDate;
    if (!latestDate || postDate > latestDate) latestDate = postDate;
  }

  const totalDaySpan =
    earliestDate && latestDate
      ? Math.max(1, Math.ceil((latestDate.getTime() - earliestDate.getTime()) / (1000 * 60 * 60 * 24)) + 1)
      : 0;

  const attemptedPublishes = counts.published + counts.failed;
  const needsApproval = counts.published + counts.failed + counts.scheduled + counts.pending;

  return {
    total: posts.length,
    published: counts.published,
    failed: counts.failed,
    pending: counts.pending,
    scheduled: counts.scheduled,
    drafts: counts.drafts,
    approvalRate: needsApproval > 0 ? counts.approved / needsApproval : 0,
    publishSuccessRate: attemptedPublishes > 0 ? counts.published / attemptedPublishes : 0,
    avgPostsPerDay: totalDaySpan > 0 ? posts.length / totalDaySpan : 0,
    activeDays: publishDates.size,
    totalDaySpan,
  };
}

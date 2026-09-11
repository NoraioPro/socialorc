import { Header } from "@/components/dashboard/header";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PostStatus } from "@prisma/client";
import Link from "next/link";
import { FileEdit, CheckSquare, AlertCircle, CheckCircle2, TrendingUp, Lightbulb, Target, ArrowRight } from "lucide-react";
import { computeTractionScore, computeMetricsFromPosts } from "@/lib/traction-score";
import { generateGrowthBrief, generateMockPlatformStats } from "@/lib/growth-brief";

const statusColors: Record<PostStatus, string> = {
  DRAFT: "bg-gray-500",
  PENDING_APPROVAL: "bg-yellow-500",
  APPROVED: "bg-blue-500",
  SCHEDULED: "bg-purple-500",
  PUBLISHING: "bg-orange-500",
  PUBLISHED: "bg-green-500",
  FAILED: "bg-red-500",
};

const gradeColors: Record<string, string> = {
  A: "text-green-500",
  B: "text-blue-500",
  C: "text-yellow-500",
  D: "text-orange-500",
  F: "text-red-500",
};

const priorityColors: Record<string, string> = {
  high: "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200",
  medium: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200",
  low: "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200",
};

async function getStats(userId: string) {
  const [drafts, pendingApproval, scheduled, published, failed, recentPosts, allPosts] = await Promise.all([
    prisma.post.count({ where: { userId, status: PostStatus.DRAFT } }),
    prisma.post.count({ where: { userId, status: PostStatus.PENDING_APPROVAL } }),
    prisma.post.count({ where: { userId, status: PostStatus.SCHEDULED } }),
    prisma.post.count({ where: { userId, status: PostStatus.PUBLISHED } }),
    prisma.post.count({ where: { userId, status: PostStatus.FAILED } }),
    prisma.post.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { socialAccount: true },
    }),
    prisma.post.findMany({
      where: { userId },
      select: {
        status: true,
        platform: true,
        createdAt: true,
        publishedAt: true,
        approvedAt: true,
      },
    }),
  ]);

  return { drafts, pendingApproval, scheduled, published, failed, recentPosts, allPosts };
}

export default async function DashboardPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) return null;

  const stats = await getStats(session.user.id);

  const metrics = computeMetricsFromPosts(stats.allPosts);
  const tractionScore = computeTractionScore(metrics);

  const platformStats = generateMockPlatformStats(
    stats.allPosts.map((p) => ({ platform: p.platform, status: p.status }))
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayPostCount = stats.allPosts.filter((p) => {
    const postDate = new Date(p.createdAt);
    postDate.setHours(0, 0, 0, 0);
    return postDate.getTime() === today.getTime();
  }).length;

  const growthBrief = generateGrowthBrief(tractionScore, platformStats, todayPostCount);

  return (
    <div className="flex flex-col">
      <Header 
        title="Dashboard" 
        description="Overview of your social media content pipeline"
      />
      
      <div className="flex-1 space-y-6 p-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
          <Card className="lg:col-span-2 bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Traction Score</CardTitle>
              <TrendingUp className="h-4 w-4 text-primary" />
            </CardHeader>
            <CardContent>
              <div className="flex items-baseline gap-2">
                <div className="text-4xl font-bold">{tractionScore.score}</div>
                <div className={`text-2xl font-bold ${gradeColors[tractionScore.grade]}`}>
                  {tractionScore.grade}
                </div>
              </div>
              <p className="text-xs text-muted-foreground mt-1">{tractionScore.summary}</p>
              <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Volume</span>
                  <span className="font-medium">{tractionScore.components.volume}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Consistency</span>
                  <span className="font-medium">{tractionScore.components.consistency}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Success Rate</span>
                  <span className="font-medium">{tractionScore.components.successRate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Pipeline</span>
                  <span className="font-medium">{tractionScore.components.pipelineHealth}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Drafts</CardTitle>
              <FileEdit className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.drafts}</div>
              <p className="text-xs text-muted-foreground">Posts in draft</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending</CardTitle>
              <CheckSquare className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pendingApproval}</div>
              <p className="text-xs text-muted-foreground">Awaiting review</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Published</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.published}</div>
              <p className="text-xs text-muted-foreground">Successfully posted</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Failed</CardTitle>
              <AlertCircle className="h-4 w-4 text-red-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.failed}</div>
              <p className="text-xs text-muted-foreground">Need attention</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          <Card className="lg:col-span-2">
            <CardHeader>
              <div className="flex items-center gap-2">
                <Lightbulb className="h-5 w-5 text-yellow-500" />
                <CardTitle>Growth Brief</CardTitle>
              </div>
              <CardDescription>Daily recommendations to boost your traction</CardDescription>
            </CardHeader>
            <CardContent>
              {growthBrief.recommendations.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  Great job! No immediate actions needed.
                </p>
              ) : (
                <div className="space-y-4">
                  {growthBrief.recommendations.map((rec) => (
                    <div
                      key={rec.id}
                      className="flex items-start gap-3 rounded-lg border p-3"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge className={priorityColors[rec.priority]}>
                            {rec.priority}
                          </Badge>
                          <span className="text-xs text-muted-foreground capitalize">
                            {rec.category}
                          </span>
                        </div>
                        <p className="font-medium text-sm">{rec.title}</p>
                        <p className="text-xs text-muted-foreground mt-1">
                          {rec.description}
                        </p>
                        <div className="flex items-center gap-1 mt-2 text-xs text-primary">
                          <ArrowRight className="h-3 w-3" />
                          <span>{rec.action}</span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                <CardTitle>Daily Goal</CardTitle>
              </div>
              <CardDescription>Today&apos;s posting target</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex items-center justify-center mb-4">
                <div className="relative w-24 h-24">
                  <svg className="w-24 h-24 transform -rotate-90" viewBox="0 0 36 36">
                    <circle
                      cx="18"
                      cy="18"
                      r="16"
                      fill="none"
                      className="stroke-muted"
                      strokeWidth="2"
                    />
                    <circle
                      cx="18"
                      cy="18"
                      r="16"
                      fill="none"
                      className="stroke-primary"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeDasharray={`${Math.min((growthBrief.dailyGoal.currentProgress / growthBrief.dailyGoal.postsTarget) * 100, 100)}, 100`}
                    />
                  </svg>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <span className="text-xl font-bold">
                      {growthBrief.dailyGoal.currentProgress}/{growthBrief.dailyGoal.postsTarget}
                    </span>
                  </div>
                </div>
              </div>
              <p className="text-sm text-center text-muted-foreground">
                {growthBrief.dailyGoal.message}
              </p>

              {growthBrief.weeklyHighlights.improvementAreas.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-xs font-medium mb-2">Focus Areas:</p>
                  <div className="flex flex-wrap gap-1">
                    {growthBrief.weeklyHighlights.improvementAreas.map((area) => (
                      <Badge key={area} variant="outline" className="text-xs">
                        {area}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Recent Activity</CardTitle>
              <CardDescription>Your latest posts and updates</CardDescription>
            </CardHeader>
            <CardContent>
              {stats.recentPosts.length === 0 ? (
                <p className="text-sm text-muted-foreground">
                  No posts yet.{" "}
                  <Link href="/dashboard/create" className="text-primary hover:underline">
                    Create your first post
                  </Link>
                </p>
              ) : (
                <div className="space-y-4">
                  {stats.recentPosts.map((post) => (
                    <Link
                      key={post.id}
                      href={`/dashboard/drafts/${post.id}`}
                      className="flex items-start gap-3 rounded-lg p-2 transition-colors hover:bg-accent"
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium truncate">
                          {post.title || post.content.slice(0, 50)}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="outline" className="text-xs">
                            {post.platform}
                          </Badge>
                          <Badge 
                            className={`text-xs text-white ${statusColors[post.status]}`}
                          >
                            {post.status.replace("_", " ")}
                          </Badge>
                        </div>
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Quick Actions</CardTitle>
              <CardDescription>Common tasks and shortcuts</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-2">
              <Link
                href="/dashboard/create"
                className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
              >
                <FileEdit className="h-5 w-5 text-primary" />
                <div>
                  <p className="font-medium">Create New Post</p>
                  <p className="text-sm text-muted-foreground">
                    Draft content with AI assistance
                  </p>
                </div>
              </Link>
              
              <Link
                href="/dashboard/approvals"
                className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
              >
                <CheckSquare className="h-5 w-5 text-yellow-500" />
                <div>
                  <p className="font-medium">Review Approvals</p>
                  <p className="text-sm text-muted-foreground">
                    {stats.pendingApproval} posts pending
                  </p>
                </div>
              </Link>

              <Link
                href="/settings/accounts"
                className="flex items-center gap-3 rounded-lg border p-3 transition-colors hover:bg-accent"
              >
                <svg className="h-5 w-5 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
                <div>
                  <p className="font-medium">Connect Accounts</p>
                  <p className="text-sm text-muted-foreground">
                    Link your social platforms
                  </p>
                </div>
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

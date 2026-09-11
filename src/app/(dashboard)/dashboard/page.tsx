import { Header } from "@/components/dashboard/header";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PostStatus } from "@prisma/client";
import Link from "next/link";
import { FileEdit, Clock, CheckSquare, AlertCircle, CheckCircle2 } from "lucide-react";
import { CampaignReadinessCard, CampaignReadinessCompact } from "@/components/dashboard/campaign-readiness";
import { CampaignReadinessInput } from "@/lib/campaign-readiness";

const statusColors: Record<PostStatus, string> = {
  DRAFT: "bg-gray-500",
  PENDING_APPROVAL: "bg-yellow-500",
  APPROVED: "bg-blue-500",
  SCHEDULED: "bg-purple-500",
  PUBLISHING: "bg-orange-500",
  PUBLISHED: "bg-green-500",
  FAILED: "bg-red-500",
};

async function getStats(userId: string) {
  const now = new Date();
  const next7Days = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const next30Days = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  const [
    drafts,
    pendingApproval,
    approved,
    scheduled,
    published,
    failed,
    recentPosts,
    socialAccounts,
    scheduledNext7Days,
    scheduledNext30Days,
  ] = await Promise.all([
    prisma.post.count({ where: { userId, status: PostStatus.DRAFT } }),
    prisma.post.count({ where: { userId, status: PostStatus.PENDING_APPROVAL } }),
    prisma.post.count({ where: { userId, status: PostStatus.APPROVED } }),
    prisma.post.count({ where: { userId, status: PostStatus.SCHEDULED } }),
    prisma.post.count({ where: { userId, status: PostStatus.PUBLISHED } }),
    prisma.post.count({ where: { userId, status: PostStatus.FAILED } }),
    prisma.post.findMany({
      where: { userId },
      orderBy: { updatedAt: "desc" },
      take: 5,
      include: { socialAccount: true },
    }),
    prisma.socialAccount.findMany({
      where: { userId },
      select: { platform: true, isActive: true, needsReconnect: true },
    }),
    prisma.post.count({
      where: {
        userId,
        status: PostStatus.SCHEDULED,
        scheduledFor: { gte: now, lte: next7Days },
      },
    }),
    prisma.post.count({
      where: {
        userId,
        status: PostStatus.SCHEDULED,
        scheduledFor: { gte: now, lte: next30Days },
      },
    }),
  ]);

  const campaignReadinessInput: CampaignReadinessInput = {
    postCounts: {
      draft: drafts,
      pendingApproval,
      approved,
      scheduled,
      published,
      failed,
    },
    connectedAccounts: socialAccounts,
    scheduledNext7Days,
    scheduledNext30Days,
  };

  return {
    drafts,
    pendingApproval,
    scheduled,
    published,
    failed,
    recentPosts,
    campaignReadinessInput,
  };
}

export default async function DashboardPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) return null;

  const stats = await getStats(session.user.id);

  return (
    <div className="flex flex-col">
      <Header 
        title="Dashboard" 
        description="Overview of your social media content pipeline"
      />
      
      <div className="flex-1 space-y-6 p-6">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-6">
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
              <CardTitle className="text-sm font-medium">Pending Approval</CardTitle>
              <CheckSquare className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pendingApproval}</div>
              <p className="text-xs text-muted-foreground">Awaiting review</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
              <Clock className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.scheduled}</div>
              <p className="text-xs text-muted-foreground">Ready to publish</p>
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

          <CampaignReadinessCompact input={stats.campaignReadinessInput} />
        </div>

        <CampaignReadinessCard input={stats.campaignReadinessInput} />

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

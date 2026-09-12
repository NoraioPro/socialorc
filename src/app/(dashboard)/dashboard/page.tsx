import { Header } from "@/components/dashboard/header";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { PostStatus } from "@prisma/client";
import Link from "next/link";
import { FileEdit, Clock, Check, CheckSquare, AlertCircle, CheckCircle2, Crown, Sparkles, Target, Trophy } from "lucide-react";

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
  const [drafts, pendingApproval, scheduled, published, failed, recentPosts] = await Promise.all([
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
  ]);

  return { drafts, pendingApproval, scheduled, published, failed, recentPosts };
}

export default async function DashboardPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) return null;

  const stats = await getStats(session.user.id);
  const campaignXp = stats.drafts * 10 + stats.pendingApproval * 20 + stats.scheduled * 40 + stats.published * 100;
  const rank = Math.floor(campaignXp / 250) + 1;
  const rankProgress = campaignXp % 250;
  const quests = [
    { label: "Forge a draft", value: stats.drafts, goal: 1, href: "/dashboard/create" },
    { label: "Send a post to review", value: stats.pendingApproval + stats.scheduled + stats.published, goal: 1, href: "/dashboard/drafts" },
    { label: "Publish your first victory", value: stats.published, goal: 1, href: "/dashboard/scheduled" },
  ];

  return (
    <div className="flex flex-col">
      <Header 
        title="Command Center"
        description="Manage your content. Build your presence. Stay in control."
      />
      
      <div className="flex-1 space-y-6 p-6">
        <section className="dashboard-welcome command-reveal"><div className="ember-field" aria-hidden="true"><i /><i /><i /><i /><i /></div><span className="eyebrow">WELCOME BACK, {session.user.name?.split(" ")[0] || "COMMANDER"}</span><h2>Command Center</h2><p>Your content strategy, all in one place.</p><div className="commander-rank"><Crown size={14} /><span>COMMANDER RANK {rank}</span><div className="rank-track"><i style={{ width: `${rankProgress / 250 * 100}%` }} /></div><small>{rankProgress} / 250 XP</small></div></section>
        <div className="command-stats grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          <Card className="game-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Drafts</CardTitle>
              <FileEdit className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.drafts}</div>
              <p className="text-xs text-muted-foreground">Posts in draft</p>
            </CardContent>
          </Card>

          <Card className="game-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Pending Approval</CardTitle>
              <CheckSquare className="h-4 w-4 text-yellow-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.pendingApproval}</div>
              <p className="text-xs text-muted-foreground">Awaiting review</p>
            </CardContent>
          </Card>

          <Card className="game-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Scheduled</CardTitle>
              <Clock className="h-4 w-4 text-purple-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.scheduled}</div>
              <p className="text-xs text-muted-foreground">Ready to publish</p>
            </CardContent>
          </Card>

          <Card className="game-card">
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Published</CardTitle>
              <CheckCircle2 className="h-4 w-4 text-green-500" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{stats.published}</div>
              <p className="text-xs text-muted-foreground">Successfully posted</p>
            </CardContent>
          </Card>

          <Card className="game-card">
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

        <section className="quest-board command-reveal" aria-labelledby="quest-title">
          <div className="quest-heading"><span><Trophy size={18} /></span><div><p>CAMPAIGN PROGRESS</p><h3 id="quest-title">Today&apos;s Quests</h3></div><strong><Sparkles size={13} /> {campaignXp} XP earned</strong></div>
          <div className="quest-list">{quests.map((quest, index) => {
            const complete = quest.value >= quest.goal;
            return <Link key={quest.label} href={quest.href} className={`quest-item ${complete ? "is-complete" : ""}`}><span className="quest-seal">{complete ? <Check size={15} /> : <Target size={15} />}</span><div><strong>{quest.label}</strong><small>{complete ? "Quest complete" : `${Math.min(quest.value, quest.goal)} / ${quest.goal} complete`}</small></div><span className="quest-xp">+{[10, 20, 100][index]} XP</span></Link>;
          })}</div>
        </section>

        <section className="command-intelligence" aria-label="Content intelligence and pipeline">
          <div className="intelligence-card command-reveal">
            <span className="eyebrow">✦ AI CONTENT ASSISTANT</span>
            <h3>{stats.pendingApproval > 0 ? "Your next move is ready for review." : "Turn your next idea into impact."}</h3>
            <p>{stats.pendingApproval > 0 ? `${stats.pendingApproval} posts are waiting for your approval. Give your content a final check before scheduling.` : "Start with an idea. Generate drafts for each channel, refine your message, and give every post your final approval."}</p>
            <Link className="cta cta-small" href={stats.pendingApproval > 0 ? "/dashboard/approvals" : "/dashboard/create"}>{stats.pendingApproval > 0 ? "Review approvals" : "Forge content"} <span aria-hidden="true">↗</span></Link>
          </div>
          <div className="command-pipeline command-reveal">
            <h3>Content Pipeline</h3><p>Live totals from your workspace</p>
            {[{name:"Drafts",value:stats.drafts},{name:"In review",value:stats.pendingApproval},{name:"Scheduled",value:stats.scheduled},{name:"Published",value:stats.published}].map(item => <div className="pipeline-row" key={item.name}><span>{item.name}</span><div className="pipeline-track"><span className="pipeline-fill" style={{width:`${item.value / Math.max(stats.drafts,stats.pendingApproval,stats.scheduled,stats.published,1)*100}%`}} /></div><strong>{item.value}</strong></div>)}
          </div>
        </section>
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

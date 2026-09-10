import { Header } from "@/components/dashboard/header";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { PostStatus } from "@prisma/client";
import { PostCard } from "@/components/posts/post-card";
import { format } from "date-fns";

async function getScheduledPosts(userId: string) {
  return prisma.post.findMany({
    where: { 
      userId, 
      status: PostStatus.SCHEDULED 
    },
    include: {
      socialAccount: true,
      mediaAssets: {
        include: { mediaAsset: true },
        orderBy: { order: "asc" },
      },
    },
    orderBy: { scheduledFor: "asc" },
  });
}

export default async function ScheduledPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) return null;

  const posts = await getScheduledPosts(session.user.id);

  const groupedByDate = posts.reduce((acc, post) => {
    const dateKey = post.scheduledFor 
      ? format(post.scheduledFor, "yyyy-MM-dd")
      : "unscheduled";
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(post);
    return acc;
  }, {} as Record<string, typeof posts>);

  return (
    <div className="flex flex-col">
      <Header 
        title="Scheduled Posts" 
        description="Posts queued for automatic publishing"
      />
      
      <div className="flex-1 p-6">
        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
            <h3 className="text-lg font-semibold">No scheduled posts</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Approved posts can be scheduled for future publishing
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {Object.entries(groupedByDate).map(([date, datePosts]) => (
              <div key={date}>
                <h2 className="text-lg font-semibold mb-4">
                  {date === "unscheduled" 
                    ? "Unscheduled" 
                    : format(new Date(date), "EEEE, MMMM d, yyyy")
                  }
                </h2>
                <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                  {datePosts.map((post) => (
                    <PostCard key={post.id} post={post} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

import { Header } from "@/components/dashboard/header";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { PostStatus } from "@prisma/client";
import { PostCard } from "@/components/posts/post-card";
import { format } from "date-fns";
import { canRetryFailedPublish } from "@/lib/failed-retry";

async function getQueuePosts(userId: string) {
  const [scheduled, failed] = await Promise.all([
    prisma.post.findMany({
      where: { userId, status: PostStatus.SCHEDULED },
      include: {
        socialAccount: true,
        mediaAssets: {
          include: { mediaAsset: true },
          orderBy: { order: "asc" },
        },
      },
      orderBy: { scheduledFor: "asc" },
    }),
    prisma.post.findMany({
      where: { userId, status: PostStatus.FAILED },
      include: {
        socialAccount: true,
        mediaAssets: {
          include: { mediaAsset: true },
          orderBy: { order: "asc" },
        },
      },
      orderBy: { updatedAt: "desc" },
    }),
  ]);
  return { scheduled, failed };
}

export default async function ScheduledPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) return null;

  const { scheduled, failed } = await getQueuePosts(session.user.id);
  const retryableFailed = failed.filter((post) => canRetryFailedPublish(post));

  const groupedByDate = scheduled.reduce(
    (acc, post) => {
      const dateKey = post.scheduledFor
        ? format(post.scheduledFor, "yyyy-MM-dd")
        : "unscheduled";
      if (!acc[dateKey]) acc[dateKey] = [];
      acc[dateKey].push(post);
      return acc;
    },
    {} as Record<string, typeof scheduled>
  );

  const empty = scheduled.length === 0 && failed.length === 0;

  return (
    <div className="flex flex-col">
      <Header
        title="Scheduled Posts"
        description="Queue + failed publishes (retry without re-approval when already approved)"
      />

      <div className="flex-1 space-y-10 p-6">
        {empty ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
            <h3 className="text-lg font-semibold">No scheduled posts</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Approved posts can be scheduled for future publishing
            </p>
          </div>
        ) : null}

        {retryableFailed.length > 0 && (
          <section className="space-y-4">
            <div>
              <h2 className="text-lg font-semibold text-destructive">Failed publishes</h2>
              <p className="text-sm text-muted-foreground">
                These already passed the approval gate. Retry re-queues them — it does not
                bypass approval for drafts.
              </p>
            </div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {retryableFailed.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          </section>
        )}

        {Object.entries(groupedByDate).map(([date, datePosts]) => (
          <div key={date}>
            <h2 className="mb-4 text-lg font-semibold">
              {date === "unscheduled"
                ? "Unscheduled"
                : format(new Date(date), "EEEE, MMMM d, yyyy")}
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {datePosts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

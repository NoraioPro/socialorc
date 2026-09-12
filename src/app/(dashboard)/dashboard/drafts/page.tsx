import { Header } from "@/components/dashboard/header";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { PostStatus } from "@prisma/client";
import { DraftsPostsGrid } from "@/components/posts/drafts-posts-grid";
import Link from "next/link";
import { Plus } from "lucide-react";

async function getDrafts(userId: string) {
  return prisma.post.findMany({
    where: {
      userId,
      status: {
        in: [PostStatus.DRAFT, PostStatus.PENDING_APPROVAL, PostStatus.APPROVED],
      },
    },
    include: {
      socialAccount: true,
      mediaAssets: {
        include: { mediaAsset: true },
        orderBy: { order: "asc" },
      },
    },
    orderBy: { updatedAt: "desc" },
  });
}

export default async function DraftsPage() {
  const session = await getAuthSession();
  if (!session?.user?.id) return null;

  const posts = await getDrafts(session.user.id);

  return (
    <div className="flex flex-col">
      <Header
        title="Drafts"
        description="Manage drafts, approved posts, and schedule with best-time tips"
      />

      <div className="flex-1 p-6">
        {posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
            <h3 className="text-lg font-semibold">No drafts yet</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              Create your first post to get started
            </p>
            <Link
              href="/dashboard/create"
              className="mt-4 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              <Plus className="mr-2 h-4 w-4" />
              Create Post
            </Link>
          </div>
        ) : (
          <DraftsPostsGrid posts={posts} />
        )}
      </div>
    </div>
  );
}

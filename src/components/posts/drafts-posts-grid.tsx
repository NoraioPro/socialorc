"use client";

import { useState } from "react";
import { Post, SocialAccount, PostMedia, MediaAsset } from "@prisma/client";
import { PostCard } from "@/components/posts/post-card";
import Link from "next/link";
import { Plus } from "lucide-react";

type PostWithRelations = Post & {
  socialAccount: SocialAccount | null;
  mediaAssets: (PostMedia & { mediaAsset: MediaAsset })[];
};

interface DraftsPostsGridProps {
  posts: PostWithRelations[];
}

export function DraftsPostsGrid({ posts }: DraftsPostsGridProps) {
  const [items, setItems] = useState(posts);

  if (items.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
        <h3 className="text-lg font-semibold">Nothing left here</h3>
        <p className="mt-2 text-sm text-muted-foreground">
          Approved posts you scheduled are on the scheduled queue.
        </p>
        <Link
          href="/dashboard/create"
          className="mt-4 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="mr-2 h-4 w-4" />
          Create Post
        </Link>
      </div>
    );
  }

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {items.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}

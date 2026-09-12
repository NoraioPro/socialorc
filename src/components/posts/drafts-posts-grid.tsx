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
  const [error, setError] = useState<string | null>(null);

  // The card has always rendered a Delete item; without a handler it did
  // nothing. Removing it from the list optimistically keeps the grid honest
  // while the request is in flight, and the item comes back if the server says no.
  const onDelete = async (id: string) => {
    const previous = items;
    setItems(current => current.filter(post => post.id !== id));
    setError(null);
    try {
      const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Could not delete this post.");
      }
    } catch (err) {
      setItems(previous);
      setError(err instanceof Error ? err.message : "Could not delete this post.");
    }
  };

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
    <>
      {error && (
        <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>
      )}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((post) => (
          <PostCard key={post.id} post={post} onDelete={onDelete} />
        ))}
      </div>
    </>
  );
}

"use client";

import { useState } from "react";
import { Post, SocialAccount, PostMedia, MediaAsset } from "@prisma/client";
import { PostCard } from "@/components/posts/post-card";

type PostWithRelations = Post & {
  socialAccount: SocialAccount | null;
  mediaAssets: (PostMedia & { mediaAsset: MediaAsset })[];
};

/**
 * A grid of post cards whose Delete actually deletes.
 *
 * Server components cannot hand a callback to PostCard, which is why the card's
 * Delete item was inert everywhere it was rendered from one. This wrapper owns
 * the list state so the pages can stay server components.
 */
export function DeletablePostGrid({ posts }: { posts: PostWithRelations[] }) {
  const [items, setItems] = useState(posts);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <>
      {error && <p role="alert" className="mb-3 text-sm text-destructive">{error}</p>}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {items.map((post) => (
          <PostCard key={post.id} post={post} onDelete={onDelete} />
        ))}
      </div>
    </>
  );
}

"use client";

import { Header } from "@/components/dashboard/header";
import { PostCard } from "@/components/posts/post-card";
import { useCallback, useEffect, useState } from "react";
import { Post, SocialAccount, PostMedia, MediaAsset, PostStatus } from "@prisma/client";

type PostWithRelations = Post & {
  socialAccount: SocialAccount | null;
  mediaAssets: (PostMedia & { mediaAsset: MediaAsset })[];
};

export default function ApprovalsPage() {
  const [posts, setPosts] = useState<PostWithRelations[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchPosts = useCallback(async () => {
    try {
      const res = await fetch(`/api/posts?status=${PostStatus.PENDING_APPROVAL}`);
      const data = await res.json();
      setPosts(data.posts || []);
    } catch (error) {
      console.error("Failed to fetch posts:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  async function handleApprove(id: string) {
    try {
      const res = await fetch(`/api/posts/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      
      if (res.ok) {
        setPosts(posts.filter((p) => p.id !== id));
      }
    } catch (error) {
      console.error("Failed to approve post:", error);
    }
  }

  async function handleReject(id: string) {
    const reason = prompt("Reason for rejection (optional):");
    
    try {
      const res = await fetch(`/api/posts/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "reject", reason }),
      });
      
      if (res.ok) {
        setPosts(posts.filter((p) => p.id !== id));
      }
    } catch (error) {
      console.error("Failed to reject post:", error);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("Are you sure you want to delete this post?")) return;
    
    try {
      const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
      if (res.ok) {
        setPosts(posts.filter((p) => p.id !== id));
      }
    } catch (error) {
      console.error("Failed to delete post:", error);
    }
  }

  return (
    <div className="flex flex-col">
      <Header 
        title="Pending Approvals" 
        description="Review and approve posts before they can be scheduled"
      />
      
      <div className="flex-1 p-6">
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : posts.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed p-12 text-center">
            <h3 className="text-lg font-semibold">No posts pending approval</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              All caught up! Posts submitted for review will appear here.
            </p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {posts.map((post) => (
              <PostCard 
                key={post.id} 
                post={post}
                onApprove={handleApprove}
                onReject={handleReject}
                onDelete={handleDelete}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

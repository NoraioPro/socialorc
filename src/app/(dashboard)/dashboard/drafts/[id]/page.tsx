"use client";

import { useState, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/dashboard/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Platform, PostStatus } from "@prisma/client";
import { PLATFORM_CONFIGS } from "@/types/platform";
import { 
  Loader2, 
  Save, 
  Send, 
  Check, 
  Trash2, 
  ArrowLeft,
  Layers,
  Sparkles,
} from "lucide-react";
import { platformIcons } from "@/components/icons/platform-icons";
import { CascadeDialog } from "@/components/posts/cascade-dialog";
import Link from "next/link";

interface Post {
  id: string;
  title: string | null;
  content: string;
  platform: Platform;
  status: PostStatus;
  socialAccountId: string | null;
  scheduledFor: string | null;
  createdAt: string;
  updatedAt: string;
  socialAccount: { id: string; displayName: string; platform: Platform } | null;
  mediaAssets: { mediaAsset: { id: string; url: string; mimeType: string } }[];
}

const statusColors: Record<PostStatus, { bg: string; text: string }> = {
  DRAFT: { bg: "bg-gray-100", text: "text-gray-700" },
  PENDING_APPROVAL: { bg: "bg-yellow-100", text: "text-yellow-700" },
  APPROVED: { bg: "bg-blue-100", text: "text-blue-700" },
  SCHEDULED: { bg: "bg-purple-100", text: "text-purple-700" },
  PUBLISHING: { bg: "bg-orange-100", text: "text-orange-700" },
  PUBLISHED: { bg: "bg-green-100", text: "text-green-700" },
  FAILED: { bg: "bg-red-100", text: "text-red-700" },
};

export default function PostDetailPage({ 
  params 
}: { 
  params: Promise<{ id: string }> 
}) {
  const { id } = use(params);
  const router = useRouter();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [platform, setPlatform] = useState<Platform | "">("");
  
  const [showCascade, setShowCascade] = useState(false);

  useEffect(() => {
    fetchPost();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const fetchPost = async () => {
    try {
      const res = await fetch(`/api/posts/${id}`);
      if (!res.ok) {
        if (res.status === 404) {
          router.push("/dashboard/drafts");
          return;
        }
        throw new Error("Failed to fetch post");
      }
      const data = await res.json();
      setPost(data);
      setContent(data.content);
      setTitle(data.title || "");
      setPlatform(data.platform);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load post");
    } finally {
      setLoading(false);
    }
  };

  const handleSave = async () => {
    if (!platform) return;
    
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/posts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          content, 
          title: title || null,
          platform 
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to save");
      }

      const updatedPost = await res.json();
      setPost(updatedPost);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitForApproval = async () => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/posts/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "submit" }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to submit");
      }

      const data = await res.json();
      setPost(data.post);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit for approval");
    } finally {
      setSaving(false);
    }
  };

  const handleApprove = async () => {
    setSaving(true);
    setError(null);

    try {
      const res = await fetch(`/api/posts/${id}/approve`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to approve");
      }

      const data = await res.json();
      setPost(data.post);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to approve");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to delete this post?")) return;

    try {
      const res = await fetch(`/api/posts/${id}`, {
        method: "DELETE",
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to delete");
      }

      router.push("/dashboard/drafts");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-96">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!post) {
    return (
      <div className="flex flex-col items-center justify-center h-96">
        <p className="text-muted-foreground">Post not found</p>
        <Link href="/dashboard/drafts" className="mt-4 text-primary hover:underline">
          Back to drafts
        </Link>
      </div>
    );
  }

  const selectedConfig = platform ? PLATFORM_CONFIGS[platform] : null;
  const PlatformIcon = platform ? platformIcons[platform] : null;
  const statusStyle = statusColors[post.status];
  const canEdit = ["DRAFT", "PENDING_APPROVAL"].includes(post.status);
  const canCascade = ["DRAFT", "PENDING_APPROVAL", "APPROVED"].includes(post.status);

  return (
    <div className="flex flex-col">
      <Header 
        title="Edit Post" 
        description="Make changes to your draft"
      />
      
      <div className="flex-1 p-6">
        <div className="mx-auto max-w-3xl space-y-6">
          <div className="flex items-center justify-between">
            <Link 
              href="/dashboard/drafts"
              className="inline-flex items-center justify-center rounded-lg h-7 gap-1 px-2.5 text-sm font-medium hover:bg-muted hover:text-foreground transition-all"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Drafts
            </Link>
            
            <div className="flex items-center gap-2">
              <Badge className={`${statusStyle.bg} ${statusStyle.text}`}>
                {post.status.replace("_", " ")}
              </Badge>
              {PlatformIcon && <PlatformIcon className="h-5 w-5" />}
            </div>
          </div>

          {error && (
            <div className="rounded-md bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Post Content</CardTitle>
              <CardDescription>
                Edit your post content and settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Title (optional)</Label>
                <input
                  id="title"
                  type="text"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Post title..."
                  disabled={!canEdit}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="platform">Platform</Label>
                <Select 
                  value={platform} 
                  onValueChange={(v) => setPlatform(v as Platform)}
                  disabled={!canEdit}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select platform..." />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.values(Platform).map((p) => {
                      const Icon = platformIcons[p];
                      return (
                        <SelectItem key={p} value={p}>
                          <div className="flex items-center gap-2">
                            <Icon className="h-4 w-4" />
                            {p === "TWITTER" ? "X (Twitter)" : p}
                          </div>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="content">Content</Label>
                  {selectedConfig && (
                    <span className={`text-xs ${
                      content.length > selectedConfig.maxTextLength 
                        ? "text-red-500" 
                        : "text-muted-foreground"
                    }`}>
                      {content.length}/{selectedConfig.maxTextLength}
                    </span>
                  )}
                </div>
                <Textarea
                  id="content"
                  placeholder="Write your post content..."
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  rows={8}
                  disabled={!canEdit}
                />
              </div>

              <div className="flex flex-wrap gap-2 pt-4">
                {canEdit && (
                  <Button onClick={handleSave} disabled={saving || !platform}>
                    {saving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    Save Changes
                  </Button>
                )}

                {post.status === "DRAFT" && (
                  <Button 
                    variant="outline" 
                    onClick={handleSubmitForApproval}
                    disabled={saving}
                  >
                    <Send className="mr-2 h-4 w-4" />
                    Submit for Approval
                  </Button>
                )}

                {post.status === "PENDING_APPROVAL" && (
                  <Button onClick={handleApprove} disabled={saving}>
                    <Check className="mr-2 h-4 w-4" />
                    Approve
                  </Button>
                )}

                {canCascade && (
                  <Button 
                    variant="secondary" 
                    onClick={() => setShowCascade(true)}
                    disabled={saving || content.length < 10}
                  >
                    <Layers className="mr-2 h-4 w-4" />
                    Cascade to Platforms
                  </Button>
                )}

                <Button 
                  variant="destructive" 
                  onClick={handleDelete}
                  disabled={saving}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>

          {canCascade && (
            <Card className="border-dashed">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-500" />
                  Content Cascade
                </CardTitle>
                <CardDescription>
                  Automatically adapt this post for other social platforms using AI
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground mb-4">
                  Cascade takes your content and intelligently adapts it for each platform&apos;s 
                  unique style, tone, and character limits. Save time while maintaining 
                  platform-specific best practices.
                </p>
                <Button 
                  onClick={() => setShowCascade(true)}
                  disabled={content.length < 10}
                  className="gap-2"
                >
                  <Layers className="h-4 w-4" />
                  Start Cascade
                </Button>
              </CardContent>
            </Card>
          )}
        </div>
      </div>

      <CascadeDialog
        open={showCascade}
        onClose={() => setShowCascade(false)}
        postId={post.id}
        sourcePlatform={post.platform}
        sourceContent={post.content}
      />
    </div>
  );
}

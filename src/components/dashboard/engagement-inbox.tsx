"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Header } from "@/components/dashboard/header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Loader2, MessageSquare, Heart, Trash2, Reply } from "lucide-react";
import { platformIcons } from "@/components/icons/platform-icons";
import type { Platform } from "@prisma/client";
import { formatDistanceToNow } from "date-fns";

interface PublishedPost {
  id: string;
  title: string | null;
  content: string;
  platform: Platform;
  platformPostId: string | null;
  socialAccountId: string | null;
  publishedAt: string | null;
}

interface CapabilityRow {
  accountId: string;
  platform: Platform;
  platformUsername: string | null;
  displayName: string | null;
  platformName: string;
  needsReconnect: boolean;
  notes: string[];
  capabilities: Record<
    string,
    { available: boolean; message?: string }
  >;
}

interface SocialComment {
  id: string;
  authorName: string;
  text: string;
  createdAt: string;
  likeCount?: number;
  parentCommentId?: string;
  canReply: boolean;
  canReact: boolean;
  canDelete: boolean;
}

export function EngagementInbox() {
  const [capabilities, setCapabilities] = useState<CapabilityRow[]>([]);
  const [posts, setPosts] = useState<PublishedPost[]>([]);
  const [accountId, setAccountId] = useState<string>("");
  const [postId, setPostId] = useState<string>("");
  const [comments, setComments] = useState<SocialComment[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingCaps, setLoadingCaps] = useState(true);
  const [loadingPosts, setLoadingPosts] = useState(true);
  const [loadingComments, setLoadingComments] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const selectedAccount = useMemo(
    () => capabilities.find((a) => a.accountId === accountId),
    [capabilities, accountId],
  );

  const selectedPost = useMemo(
    () => posts.find((p) => p.id === postId),
    [posts, postId],
  );

  const postsForAccount = useMemo(
    () =>
      posts.filter(
        (p) =>
          p.socialAccountId === accountId &&
          p.platformPostId &&
          p.platform === selectedAccount?.platform,
      ),
    [posts, accountId, selectedAccount?.platform],
  );

  const canRead = selectedAccount?.capabilities.readComments?.available ?? false;
  const canReply = selectedAccount?.capabilities.writeComments?.available ?? false;
  const canReactPost = selectedAccount?.capabilities.reactToPosts?.available ?? false;
  const canReactComment = selectedAccount?.capabilities.reactToComments?.available ?? false;
  const canDelete = selectedAccount?.capabilities.deleteComments?.available ?? false;

  const loadCapabilities = useCallback(async () => {
    setLoadingCaps(true);
    try {
      const res = await fetch("/api/social/engagement/capabilities");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load capabilities");
      setCapabilities(data.accounts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load capabilities");
    } finally {
      setLoadingCaps(false);
    }
  }, []);

  const loadPosts = useCallback(async () => {
    setLoadingPosts(true);
    try {
      const res = await fetch("/api/posts?status=PUBLISHED&limit=100");
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to load posts");
      setPosts(data.posts ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load posts");
    } finally {
      setLoadingPosts(false);
    }
  }, []);

  useEffect(() => {
    void loadCapabilities();
    void loadPosts();
  }, [loadCapabilities, loadPosts]);

  useEffect(() => {
    if (!accountId && capabilities.length > 0) {
      setAccountId(capabilities[0].accountId);
    }
  }, [capabilities, accountId]);

  useEffect(() => {
    setPostId("");
    setComments([]);
    setNextCursor(null);
    setReplyTo(null);
  }, [accountId]);

  const fetchComments = useCallback(
    async (cursor?: string | null, append = false) => {
      if (!accountId || !selectedPost?.platformPostId || !canRead) return;
      setLoadingComments(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          accountId,
          platformPostId: selectedPost.platformPostId,
        });
        if (cursor) params.set("cursor", cursor);
        const res = await fetch(`/api/social/engagement/comments?${params}`);
        const data = await res.json();
        if (res.status === 501) {
          setError(data.message ?? "Comments are not available on this platform.");
          setComments([]);
          return;
        }
        if (!res.ok) throw new Error(data.error?.message ?? data.error ?? "Failed to load comments");
        setComments((prev) => (append ? [...prev, ...(data.items ?? [])] : data.items ?? []));
        setNextCursor(data.nextCursor ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load comments");
      } finally {
        setLoadingComments(false);
      }
    },
    [accountId, selectedPost, canRead],
  );

  useEffect(() => {
    if (postId && selectedPost?.platformPostId) {
      void fetchComments(null, false);
    }
  }, [postId, selectedPost?.platformPostId, fetchComments]);

  async function submitComment(parentCommentId?: string) {
    if (!accountId || !selectedPost?.platformPostId || !draft.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/social/engagement/comments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          platformPostId: selectedPost.platformPostId,
          text: draft.trim(),
          parentCommentId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message ?? data.message ?? data.error ?? "Reply failed");
      }
      setDraft("");
      setReplyTo(null);
      await fetchComments(null, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to post comment");
    } finally {
      setSubmitting(false);
    }
  }

  async function toggleReaction(targetType: "post" | "comment", targetId: string, remove: boolean) {
    if (!accountId) return;
    setError(null);
    try {
      const res = await fetch("/api/social/engagement/reactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId,
          targetType,
          targetId,
          kind: "like",
          remove,
          platformPostId: selectedPost?.platformPostId ?? undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message ?? data.message ?? "Reaction failed");
      }
      if (targetType === "comment") await fetchComments(null, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reaction failed");
    }
  }

  async function deleteComment(commentId: string) {
    if (!accountId) return;
    setError(null);
    try {
      const res = await fetch("/api/social/engagement/comments", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ accountId, commentId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error?.message ?? data.error ?? "Delete failed");
      }
      await fetchComments(null, false);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Delete failed");
    }
  }

  function platformLimitationBanner() {
    if (!selectedAccount || canRead) return null;
    const msg =
      selectedAccount.capabilities.readComments?.message ??
      selectedAccount.notes.find((n) => /comment|engagement|like|react/i.test(n)) ??
      `${selectedAccount.platformName} does not support inbox engagement through the public API.`;
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-950" role="status">
        <p className="font-medium">{selectedAccount.platformName} — engagement unavailable</p>
        <p className="mt-1 text-amber-900/90">{msg}</p>
      </div>
    );
  }

  function partialLimitationNote() {
    if (!selectedAccount || !canRead) return null;
    const lacksReactions =
      !canReactPost &&
      !canReactComment &&
      (selectedAccount.platform === "TWITTER" ||
        selectedAccount.platform === "INSTAGRAM" ||
        selectedAccount.platform === "YOUTUBE");
    if (!lacksReactions) return null;
    const msg =
      selectedAccount.platform === "TWITTER"
        ? "Comments and replies work on X, but likes are not available on self-serve API tiers."
        : selectedAccount.capabilities.reactToPosts?.message ??
          "Reactions are not available for this platform via API.";
    return (
      <p className="text-sm text-muted-foreground" role="note">
        {msg}
      </p>
    );
  }

  const PlatformIcon = selectedAccount
    ? platformIcons[selectedAccount.platform]
    : MessageSquare;

  return (
    <div className="flex flex-col">
      <Header
        title="Engagement"
        description="Read and respond to comments on published posts"
      />

      <div className="flex-1 space-y-6 p-6">
        {error && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive" role="alert">
            {error}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="engagement-account">Connected account</Label>
            {loadingCaps ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Loading accounts…
              </div>
            ) : capabilities.length === 0 ? (
              <p className="text-sm text-muted-foreground">Connect an account in Settings to use the inbox.</p>
            ) : (
              <Select value={accountId} onValueChange={(v) => v && setAccountId(v)}>
                <SelectTrigger id="engagement-account" aria-label="Select connected account">
                  <SelectValue placeholder="Choose account" />
                </SelectTrigger>
                <SelectContent>
                  {capabilities.map((row) => {
                    const Icon = platformIcons[row.platform];
                    return (
                      <SelectItem key={row.accountId} value={row.accountId}>
                        <span className="flex items-center gap-2">
                          <Icon className="h-4 w-4" />
                          {row.displayName || row.platformUsername || row.platformName}
                          {row.needsReconnect && (
                            <Badge variant="outline" className="text-xs">
                              Reconnect
                            </Badge>
                          )}
                        </span>
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="engagement-post">Published post</Label>
            {loadingPosts ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                Loading posts…
              </div>
            ) : (
              <Select
                value={postId}
                onValueChange={(v) => v && setPostId(v)}
                disabled={!accountId || postsForAccount.length === 0}
              >
                <SelectTrigger id="engagement-post" aria-label="Select published post">
                  <SelectValue
                    placeholder={
                      postsForAccount.length === 0
                        ? "No published posts for this account"
                        : "Choose post"
                    }
                  />
                </SelectTrigger>
                <SelectContent>
                  {postsForAccount.map((post) => (
                    <SelectItem key={post.id} value={post.id}>
                      {(post.title || post.content).slice(0, 60)}
                      {(post.title || post.content).length > 60 ? "…" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {platformLimitationBanner()}
        {partialLimitationNote()}

        {selectedAccount && selectedPost && canRead && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-base font-medium flex items-center gap-2">
                <PlatformIcon className="h-4 w-4" aria-hidden />
                Comment thread
              </CardTitle>
              {canReactPost && selectedPost.platformPostId && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  aria-label="Like post"
                  onClick={() =>
                    void toggleReaction("post", selectedPost.platformPostId!, false)
                  }
                >
                  <Heart className="mr-1 h-4 w-4" />
                  Like post
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-4">
              {loadingComments && comments.length === 0 ? (
                <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  Loading comments…
                </div>
              ) : comments.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No comments yet on this post.
                </p>
              ) : (
                <ul className="space-y-4" aria-label="Comments">
                  {comments.map((comment) => (
                    <li
                      key={comment.id}
                      className="rounded-lg border bg-card p-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className="text-sm font-medium">{comment.authorName}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDistanceToNow(new Date(comment.createdAt), {
                              addSuffix: true,
                            })}
                          </p>
                        </div>
                        <div className="flex shrink-0 gap-1">
                          {canReactComment && comment.canReact && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Like comment from ${comment.authorName}`}
                              onClick={() =>
                                void toggleReaction("comment", comment.id, false)
                              }
                            >
                              <Heart className="h-4 w-4" />
                            </Button>
                          )}
                          {canDelete && comment.canDelete && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Delete comment from ${comment.authorName}`}
                              onClick={() => void deleteComment(comment.id)}
                            >
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          )}
                          {canReply && comment.canReply && (
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              aria-label={`Reply to ${comment.authorName}`}
                              onClick={() => setReplyTo(comment.id)}
                            >
                              <Reply className="h-4 w-4" />
                            </Button>
                          )}
                        </div>
                      </div>
                      <p className="mt-2 text-sm whitespace-pre-wrap">{comment.text}</p>
                      {typeof comment.likeCount === "number" && comment.likeCount > 0 && (
                        <p className="mt-1 text-xs text-muted-foreground">
                          {comment.likeCount} like{comment.likeCount === 1 ? "" : "s"}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}

              {nextCursor && (
                <Button
                  type="button"
                  variant="secondary"
                  disabled={loadingComments}
                  onClick={() => void fetchComments(nextCursor, true)}
                >
                  {loadingComments ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : null}
                  Load more
                </Button>
              )}

              {canReply && (
                <div className="space-y-2 border-t pt-4">
                  <Label htmlFor="engagement-reply">
                    {replyTo ? "Reply to comment" : "New comment"}
                  </Label>
                  <Textarea
                    id="engagement-reply"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder="Write a reply…"
                    rows={3}
                  />
                  <div className="flex flex-wrap gap-2">
                    <Button
                      type="button"
                      disabled={submitting || !draft.trim()}
                      onClick={() => void submitComment(replyTo ?? undefined)}
                    >
                      {submitting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      {replyTo ? "Send reply" : "Post comment"}
                    </Button>
                    {replyTo && (
                      <Button type="button" variant="ghost" onClick={() => setReplyTo(null)}>
                        Cancel reply
                      </Button>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

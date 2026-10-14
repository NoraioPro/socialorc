"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Platform } from "@prisma/client";
import { Header } from "@/components/dashboard/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { PlatformIcon } from "@/components/icons/platform-icons";
import type { InboxAccountStatus, InboxItem, InboxResponse } from "@/types/inbox";
import {
  AlertTriangle,
  Check,
  Info,
  Loader2,
  Mail,
  MessageCircle,
  RefreshCw,
  Reply,
} from "lucide-react";

const platformColors: Record<Platform, string> = {
  LINKEDIN: "bg-[#0A66C2]",
  TWITTER: "bg-black",
  INSTAGRAM: "bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#F77737]",
  FACEBOOK: "bg-[#1877F2]",
  TIKTOK: "bg-black",
  YOUTUBE: "bg-[#FF0000]",
  TELEGRAM: "bg-[#229ED9]",
};

const stateLabels: Record<InboxAccountStatus["state"], string> = {
  ok: "Read",
  no_posts: "No published posts",
  unsupported: "Not supported",
  needs_reconnect: "Reconnect needed",
  error: "Error",
  timeout: "Timed out",
  skipped: "Skipped",
};

function formatRelativeTime(dateString: string): string {
  const diffMs = Date.now() - new Date(dateString).getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(dateString).toLocaleDateString();
}

function errorMessage(data: unknown, fallback: string): string {
  if (data && typeof data === "object") {
    const d = data as { error?: unknown; message?: unknown };
    if (d.error && typeof d.error === "object" && "message" in d.error) {
      return String((d.error as { message: unknown }).message);
    }
    if (typeof d.error === "string") return d.error;
    if (typeof d.message === "string") return d.message;
  }
  return fallback;
}

export default function InboxPage() {
  const [data, setData] = useState<InboxResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | "all">("all");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [itemError, setItemError] = useState<{ id: string; message: string } | null>(null);

  const fetchInbox = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/inbox");
      const body = await res.json();
      if (!res.ok) throw new Error(errorMessage(body, "Failed to load the inbox"));
      setData(body as InboxResponse);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load the inbox");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void fetchInbox();
  }, [fetchInbox]);

  const updateItem = (id: string, patch: Partial<InboxItem>) =>
    setData((prev) =>
      prev ? { ...prev, items: prev.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) } : prev,
    );

  async function setRead(item: InboxItem, read: boolean) {
    setItemError(null);
    const res = await fetch("/api/inbox", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: read ? "markRead" : "markUnread",
        platform: item.platform,
        commentId: item.commentId,
        accountId: item.accountId,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => null);
      setItemError({ id: item.id, message: errorMessage(body, "Could not update read state") });
      return;
    }
    updateItem(item.id, { isRead: read });
  }

  async function sendReply(item: InboxItem) {
    if (!draft.trim()) return;
    setSending(true);
    setItemError(null);
    try {
      const res = await fetch("/api/inbox", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reply",
          platform: item.platform,
          commentId: item.commentId,
          accountId: item.accountId,
          platformPostId: item.post.platformPostId,
          content: draft.trim(),
        }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(errorMessage(body, "Reply failed"));
      updateItem(item.id, { isReplied: true, isRead: true });
      setReplyingTo(null);
      setDraft("");
    } catch (e) {
      setItemError({ id: item.id, message: e instanceof Error ? e.message : "Reply failed" });
    } finally {
      setSending(false);
    }
  }

  const accounts = useMemo(() => data?.accounts ?? [], [data]);
  const connectedPlatforms = useMemo(
    () => [...new Set(accounts.map((a) => a.platform))],
    [accounts],
  );
  const coveredAccounts = accounts.filter((a) => a.state !== "unsupported");
  const unsupportedAccounts = accounts.filter((a) => a.state === "unsupported");
  const problemAccounts = accounts.filter((a) =>
    ["needs_reconnect", "error", "timeout", "skipped"].includes(a.state),
  );

  const items = useMemo(() => {
    let list = data?.items ?? [];
    if (selectedPlatform !== "all") list = list.filter((i) => i.platform === selectedPlatform);
    if (showUnreadOnly) list = list.filter((i) => !i.isRead);
    return list;
  }, [data, selectedPlatform, showUnreadOnly]);
  const unreadCount = (data?.items ?? []).filter((i) => !i.isRead).length;

  return (
    <div className="flex flex-col">
      <Header
        title="Inbox"
        description="Comments and replies on your recent published posts, across connected accounts"
      />

      <div className="flex-1 space-y-4 p-6">
        {data && (
          <Card data-testid="inbox-coverage">
            <CardContent className="flex gap-3 py-4 text-sm">
              <Info className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="space-y-1">
                <p>
                  Covers <strong>{data.coverage.sources.join(" and ").toLowerCase()}</strong> — the{" "}
                  {data.coverage.maxPostsPerAccount} most recent published posts per account, up to{" "}
                  {data.coverage.commentsPerPost} comments each, read live from the platform on every refresh.
                </p>
                <p className="text-muted-foreground">
                  Not covered: {data.coverage.notCovered.join(", ").toLowerCase()}. No connected platform
                  exposes those to this app.
                  {coveredAccounts.length > 0 && (
                    <>
                      {" "}Reading from:{" "}
                      {[...new Set(coveredAccounts.map((a) => a.platform))]
                        .map((p) => p.charAt(0) + p.slice(1).toLowerCase())
                        .join(", ")}
                      .
                    </>
                  )}
                  {unsupportedAccounts.length > 0 && (
                    <>
                      {" "}Comments cannot be read for:{" "}
                      {[...new Set(unsupportedAccounts.map((a) => a.platform))]
                        .map((p) => p.charAt(0) + p.slice(1).toLowerCase())
                        .join(", ")}
                      .
                    </>
                  )}
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {problemAccounts.length > 0 && (
          <Card data-testid="inbox-account-errors" className="border-amber-500/50">
            <CardContent className="space-y-2 py-4 text-sm">
              {problemAccounts.map((a) => (
                <div key={a.accountId} className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <span>
                    <strong>{a.name}</strong> ({stateLabels[a.state]}){a.message ? `: ${a.message}` : ""}
                    {a.state === "needs_reconnect" && (
                      <>
                        {" "}
                        <Link href="/settings/accounts" className="text-primary hover:underline">
                          Reconnect
                        </Link>
                      </>
                    )}
                  </span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Platform"
            value={selectedPlatform}
            onChange={(e) => setSelectedPlatform(e.target.value as Platform | "all")}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            <option value="all">All platforms</option>
            {connectedPlatforms.map((p) => (
              <option key={p} value={p}>
                {p.charAt(0) + p.slice(1).toLowerCase()}
              </option>
            ))}
          </select>

          <Button
            variant={showUnreadOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setShowUnreadOnly(!showUnreadOnly)}
          >
            {showUnreadOnly ? "Showing unread" : "Show unread only"}
          </Button>

          <Button variant="outline" size="sm" onClick={() => fetchInbox(true)} disabled={refreshing}>
            <RefreshCw className={`mr-2 h-4 w-4 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>

          <Badge variant="secondary">{items.length} shown</Badge>
          {unreadCount > 0 && <Badge className="bg-red-500 text-white">{unreadCount} unread</Badge>}
        </div>

        {error && (
          <Card className="border-destructive/50">
            <CardContent className="py-4 text-sm text-destructive">{error}</CardContent>
          </Card>
        )}

        {loading ? (
          <div className="flex items-center justify-center p-12">
            <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Mail className="mb-4 h-12 w-12 text-muted-foreground" />
              <h3 className="text-lg font-semibold">
                {accounts.length === 0 ? "No connected accounts" : "Nothing here"}
              </h3>
              <p className="mt-2 max-w-md text-sm text-muted-foreground">
                {accounts.length === 0 ? (
                  <>
                    <Link href="/settings/accounts" className="text-primary hover:underline">
                      Connect an account
                    </Link>{" "}
                    and publish a post; comments on it will show up here.
                  </>
                ) : (data?.items.length ?? 0) > 0 ? (
                  "No comments match the current filters."
                ) : coveredAccounts.length === 0 ? (
                  "None of your connected platforms let this app read comments."
                ) : (
                  "No comments on your recent published posts yet."
                )}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3" data-testid="inbox-items">
            {items.map((item) => (
              <Card
                key={item.id}
                className={!item.isRead ? "border-l-4 border-l-primary bg-primary/5" : ""}
              >
                <CardHeader className="pb-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className={`rounded-full p-2 text-white ${platformColors[item.platform]}`}>
                        <PlatformIcon platform={item.platform} className="h-4 w-4" />
                      </div>
                      <div>
                        <CardTitle className="flex items-center gap-2 text-base">
                          {item.author.name}
                          {!item.isRead && <span className="h-2 w-2 rounded-full bg-blue-500" />}
                        </CardTitle>
                        <CardDescription className="text-xs">
                          {formatRelativeTime(item.createdAt)}
                        </CardDescription>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="flex items-center gap-1 text-xs">
                        {item.type === "reply" ? (
                          <Reply className="h-3 w-3" />
                        ) : (
                          <MessageCircle className="h-3 w-3" />
                        )}
                        {item.type === "reply" ? "Reply" : "Comment"}
                      </Badge>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRead(item, !item.isRead)}
                        title={item.isRead ? "Mark as unread" : "Mark as read"}
                      >
                        {item.isRead ? "Mark unread" : <Check className="h-4 w-4" />}
                      </Button>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <p className="whitespace-pre-wrap text-sm">{item.content}</p>
                  <div className="rounded-md bg-muted p-3 text-sm">
                    <p className="mb-1 text-xs text-muted-foreground">On your post:</p>
                    <p className="truncate text-muted-foreground">{item.post.preview}</p>
                    {(item.permalink || item.post.platformPostUrl) && (
                      <a
                        href={item.permalink || item.post.platformPostUrl || undefined}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-1 inline-block text-xs text-primary hover:underline"
                      >
                        View on {item.platform.charAt(0) + item.platform.slice(1).toLowerCase()}
                      </a>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {item.isReplied && (
                      <Badge variant="secondary" className="text-xs">
                        <Check className="mr-1 h-3 w-3" />
                        Replied
                      </Badge>
                    )}
                    {item.canReply ? (
                      replyingTo !== item.id && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setReplyingTo(item.id);
                            setDraft("");
                            setItemError(null);
                          }}
                        >
                          <Reply className="mr-1 h-3 w-3" />
                          Reply
                        </Button>
                      )
                    ) : (
                      <span className="text-xs text-muted-foreground">
                        Replying is not available for this platform.
                      </span>
                    )}
                  </div>

                  {replyingTo === item.id && (
                    <div className="space-y-2">
                      <Textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder={`Reply to ${item.author.name}`}
                        rows={3}
                      />
                      <div className="flex gap-2">
                        <Button size="sm" onClick={() => sendReply(item)} disabled={sending || !draft.trim()}>
                          {sending && <Loader2 className="mr-1 h-3 w-3 animate-spin" />}
                          Send reply
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setReplyingTo(null)}>
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                  {itemError?.id === item.id && (
                    <p className="text-sm text-destructive">{itemError.message}</p>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

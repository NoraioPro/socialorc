"use client";

import { Header } from "@/components/dashboard/header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { PlatformIcon } from "@/components/icons/platform-icons";
import { useCallback, useEffect, useState } from "react";
import { Platform } from "@prisma/client";
import { InboxItem, InboxItemType } from "@/types/inbox";
import { 
  MessageCircle, 
  AtSign, 
  Reply, 
  Mail,
  RefreshCw,
  Check,
  Filter
} from "lucide-react";

const typeIcons: Record<InboxItemType, React.ComponentType<{ className?: string }>> = {
  comment: MessageCircle,
  mention: AtSign,
  reply: Reply,
  message: Mail,
};

const typeLabels: Record<InboxItemType, string> = {
  comment: "Comment",
  mention: "Mention",
  reply: "Reply",
  message: "Message",
};

const platformColors: Record<Platform, string> = {
  LINKEDIN: "bg-[#0A66C2]",
  TWITTER: "bg-black",
  INSTAGRAM: "bg-gradient-to-r from-[#833AB4] via-[#FD1D1D] to-[#F77737]",
  FACEBOOK: "bg-[#1877F2]",
  TIKTOK: "bg-black",
  YOUTUBE: "bg-[#FF0000]",
  TELEGRAM: "bg-[#229ED9]",
};

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);

  if (diffMins < 1) return "just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return date.toLocaleDateString();
}

interface InboxResponse {
  items: InboxItem[];
  totalCount: number;
  platforms: Platform[];
  message?: string;
}

export default function InboxPage() {
  const [items, setItems] = useState<InboxItem[]>([]);
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedType, setSelectedType] = useState<InboxItemType | "all">("all");
  const [selectedPlatform, setSelectedPlatform] = useState<Platform | "all">("all");
  const [showUnreadOnly, setShowUnreadOnly] = useState(false);

  const fetchInbox = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    else setLoading(true);

    try {
      const params = new URLSearchParams();
      if (selectedType !== "all") params.set("types", selectedType);
      if (selectedPlatform !== "all") params.set("platforms", selectedPlatform);
      if (showUnreadOnly) params.set("unreadOnly", "true");

      const res = await fetch(`/api/inbox?${params.toString()}`);
      const data: InboxResponse = await res.json();
      setItems(data.items || []);
      setPlatforms(data.platforms || []);
    } catch (error) {
      console.error("Failed to fetch inbox:", error);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedType, selectedPlatform, showUnreadOnly]);

  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  const handleMarkAsRead = async (item: InboxItem) => {
    try {
      await fetch("/api/inbox", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: item.id,
          platform: item.platform,
          action: "markAsRead",
        }),
      });
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, isRead: true } : i))
      );
    } catch (error) {
      console.error("Failed to mark as read:", error);
    }
  };

  const unreadCount = items.filter((i) => !i.isRead).length;
  const uniquePlatformsInItems = [...new Set(items.map((i) => i.platform))];

  return (
    <div className="flex flex-col">
      <Header
        title="Unified Inbox"
        description="All your comments, mentions, and messages in one place"
      />

      <div className="flex-1 p-6">
        <div className="mb-6 flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <Filter className="h-4 w-4 text-muted-foreground" />
            <span className="text-sm font-medium">Filters:</span>
          </div>

          <Tabs value={selectedType} onValueChange={(v) => setSelectedType(v as InboxItemType | "all")}>
            <TabsList>
              <TabsTrigger value="all">All</TabsTrigger>
              <TabsTrigger value="comment">Comments</TabsTrigger>
              <TabsTrigger value="mention">Mentions</TabsTrigger>
              <TabsTrigger value="message">Messages</TabsTrigger>
              <TabsTrigger value="reply">Replies</TabsTrigger>
            </TabsList>
          </Tabs>

          <select
            value={selectedPlatform}
            onChange={(e) => setSelectedPlatform(e.target.value as Platform | "all")}
            className="rounded-md border bg-background px-3 py-1.5 text-sm"
          >
            <option value="all">All Platforms</option>
            {Object.values(Platform).map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>

          <Button
            variant={showUnreadOnly ? "default" : "outline"}
            size="sm"
            onClick={() => setShowUnreadOnly(!showUnreadOnly)}
          >
            {showUnreadOnly ? "Showing Unread" : "Show Unread Only"}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchInbox(true)}
            disabled={refreshing}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${refreshing ? "animate-spin" : ""}`} />
            Refresh
          </Button>
        </div>

        <div className="mb-4 flex items-center gap-4">
          <Badge variant="secondary" className="text-sm">
            {items.length} items
          </Badge>
          {unreadCount > 0 && (
            <Badge className="bg-red-500 text-white text-sm">
              {unreadCount} unread
            </Badge>
          )}
          {uniquePlatformsInItems.length > 0 && (
            <div className="flex items-center gap-1">
              <span className="text-sm text-muted-foreground">From:</span>
              {uniquePlatformsInItems.map((p) => (
                <div
                  key={p}
                  className={`rounded-full p-1 ${platformColors[p]} text-white`}
                  title={p}
                >
                  <PlatformIcon platform={p} className="h-3 w-3" />
                </div>
              ))}
            </div>
          )}
        </div>

        {loading ? (
          <div className="flex items-center justify-center p-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
          </div>
        ) : items.length === 0 ? (
          <Card>
            <CardContent className="flex flex-col items-center justify-center py-12 text-center">
              <Mail className="h-12 w-12 text-muted-foreground mb-4" />
              <h3 className="text-lg font-semibold">No messages yet</h3>
              <p className="mt-2 text-sm text-muted-foreground max-w-md">
                {platforms.length === 0
                  ? "Connect your social accounts to start seeing comments, mentions, and messages here."
                  : "No items match your current filters. Try adjusting the filters or check back later."}
              </p>
            </CardContent>
          </Card>
        ) : (
          <div className="space-y-3">
            {items.map((item) => {
              const TypeIcon = typeIcons[item.type];
              return (
                <Card
                  key={item.id}
                  className={`transition-colors ${!item.isRead ? "border-l-4 border-l-primary bg-primary/5" : ""}`}
                >
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`rounded-full p-2 ${platformColors[item.platform]} text-white`}
                        >
                          <PlatformIcon platform={item.platform} className="h-4 w-4" />
                        </div>
                        <div>
                          <CardTitle className="text-base flex items-center gap-2">
                            {item.author.displayName || item.author.username || "Unknown"}
                            {!item.isRead && (
                              <span className="h-2 w-2 rounded-full bg-blue-500" />
                            )}
                          </CardTitle>
                          <CardDescription className="flex items-center gap-2">
                            {item.author.username && (
                              <span className="text-xs">@{item.author.username}</span>
                            )}
                            <span className="text-xs">{formatRelativeTime(item.createdAt)}</span>
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="outline" className="text-xs flex items-center gap-1">
                          <TypeIcon className="h-3 w-3" />
                          {typeLabels[item.type]}
                        </Badge>
                        {!item.isRead && (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleMarkAsRead(item)}
                            title="Mark as read"
                          >
                            <Check className="h-4 w-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm whitespace-pre-wrap">{item.content}</p>
                    {item.postReference && (
                      <div className="mt-3 rounded-md bg-muted p-3 text-sm">
                        <p className="text-xs text-muted-foreground mb-1">In reply to your post:</p>
                        <p className="text-muted-foreground truncate">
                          {item.postReference.contentPreview}
                        </p>
                        {item.postReference.platformPostUrl && (
                          <a
                            href={item.postReference.platformPostUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-primary hover:underline mt-1 inline-block"
                          >
                            View on {item.platform.toLowerCase()}
                          </a>
                        )}
                      </div>
                    )}
                    {item.isReplied && (
                      <Badge variant="secondary" className="mt-2 text-xs">
                        <Check className="h-3 w-3 mr-1" />
                        Replied
                      </Badge>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

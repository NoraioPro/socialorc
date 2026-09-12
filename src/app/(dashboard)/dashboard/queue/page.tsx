"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Header } from "@/components/dashboard/header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Loader2,
  Clock,
  MoreHorizontal,
  Play,
  Pause,
  Trash2,
  Edit,
  Globe,
  CheckCircle,
  AlertCircle,
  Timer,
} from "lucide-react";
import { platformIcons } from "@/components/icons/platform-icons";
import { PostStatus, Post, SocialAccount, PostMedia, MediaAsset } from "@prisma/client";
import {
  getBrowserTimezone,
  formatInTimezone,
  getTimezoneAbbr,
  COMMON_TIMEZONES,
} from "@/lib/timezone";

type PostWithRelations = Post & {
  socialAccount: SocialAccount | null;
  mediaAssets: (PostMedia & { mediaAsset: MediaAsset })[];
};

const statusConfig: Record<PostStatus, { icon: typeof Clock; color: string; label: string }> = {
  DRAFT: { icon: Edit, color: "bg-gray-100 text-gray-700", label: "Draft" },
  PENDING_APPROVAL: { icon: Timer, color: "bg-yellow-100 text-yellow-700", label: "Pending Approval" },
  APPROVED: { icon: CheckCircle, color: "bg-blue-100 text-blue-700", label: "Approved" },
  SCHEDULED: { icon: Clock, color: "bg-purple-100 text-purple-700", label: "Scheduled" },
  PUBLISHING: { icon: Play, color: "bg-orange-100 text-orange-700", label: "Publishing" },
  PUBLISHED: { icon: CheckCircle, color: "bg-green-100 text-green-700", label: "Published" },
  FAILED: { icon: AlertCircle, color: "bg-red-100 text-red-700", label: "Failed" },
};

type QueueTab = "all" | "pending" | "scheduled" | "publishing";

export default function QueuePage() {
  const router = useRouter();
  const [posts, setPosts] = useState<PostWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [timezone, setTimezone] = useState<string>("UTC");
  const [activeTab, setActiveTab] = useState<QueueTab>("all");

  useEffect(() => {
    setTimezone(getBrowserTimezone());
  }, []);

  const fetchPosts = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/posts?limit=500");
      if (res.ok) {
        const data = await res.json();
        setPosts(data.posts);
      }
    } catch (error) {
      console.error("Failed to fetch posts:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const filterPosts = (tab: QueueTab): PostWithRelations[] => {
    switch (tab) {
      case "pending":
        return posts.filter((p) =>
          p.status === PostStatus.PENDING_APPROVAL || p.status === PostStatus.APPROVED
        );
      case "scheduled":
        return posts.filter((p) => p.status === PostStatus.SCHEDULED);
      case "publishing":
        return posts.filter((p) =>
          p.status === PostStatus.PUBLISHING || p.status === PostStatus.PUBLISHED || p.status === PostStatus.FAILED
        );
      case "all":
      default:
        return posts.filter((p) =>
          p.status === PostStatus.PENDING_APPROVAL ||
          p.status === PostStatus.APPROVED ||
          p.status === PostStatus.SCHEDULED ||
          p.status === PostStatus.PUBLISHING
        );
    }
  };

  const handleUnschedule = async (postId: string) => {
    try {
      const res = await fetch(`/api/posts/${postId}/schedule`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchPosts();
      }
    } catch (error) {
      console.error("Failed to unschedule:", error);
    }
  };

  const handleDelete = async (postId: string) => {
    if (!confirm("Are you sure you want to delete this post?")) return;
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchPosts();
      }
    } catch (error) {
      console.error("Failed to delete:", error);
    }
  };

  const filteredPosts = filterPosts(activeTab);

  const sortedPosts = [...filteredPosts].sort((a, b) => {
    if (a.scheduledFor && b.scheduledFor) {
      return new Date(a.scheduledFor).getTime() - new Date(b.scheduledFor).getTime();
    }
    if (a.scheduledFor) return -1;
    if (b.scheduledFor) return 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });

  const counts = {
    all: posts.filter((p) =>
      p.status === PostStatus.PENDING_APPROVAL ||
      p.status === PostStatus.APPROVED ||
      p.status === PostStatus.SCHEDULED ||
      p.status === PostStatus.PUBLISHING
    ).length,
    pending: posts.filter((p) =>
      p.status === PostStatus.PENDING_APPROVAL || p.status === PostStatus.APPROVED
    ).length,
    scheduled: posts.filter((p) => p.status === PostStatus.SCHEDULED).length,
    publishing: posts.filter((p) =>
      p.status === PostStatus.PUBLISHING || p.status === PostStatus.PUBLISHED || p.status === PostStatus.FAILED
    ).length,
  };

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Publishing Queue"
        description="Manage your content pipeline"
      />

      <div className="flex-1 p-6 overflow-auto">
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Queue Overview</CardTitle>
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <Globe className="h-4 w-4 text-muted-foreground" />
                  <Select value={timezone} onValueChange={(v) => v && setTimezone(v)}>
                    <SelectTrigger className="w-[200px] h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {COMMON_TIMEZONES.map((tz) => (
                        <SelectItem key={tz.value} value={tz.value}>
                          {tz.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={fetchPosts} variant="outline" size="sm" disabled={loading}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Refresh
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as QueueTab)}>
              <TabsList className="mb-4">
                <TabsTrigger value="all" className="gap-2">
                  All Active
                  <Badge variant="secondary" className="ml-1">
                    {counts.all}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="pending" className="gap-2">
                  Pending
                  <Badge variant="secondary" className="ml-1">
                    {counts.pending}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="scheduled" className="gap-2">
                  Scheduled
                  <Badge variant="secondary" className="ml-1">
                    {counts.scheduled}
                  </Badge>
                </TabsTrigger>
                <TabsTrigger value="publishing" className="gap-2">
                  Publishing
                  <Badge variant="secondary" className="ml-1">
                    {counts.publishing}
                  </Badge>
                </TabsTrigger>
              </TabsList>

              <TabsContent value={activeTab} className="mt-0">
                {loading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : sortedPosts.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-center">
                    <p className="text-muted-foreground">No posts in this queue</p>
                  </div>
                ) : (
                  <div className="rounded-md border">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[50px]">Platform</TableHead>
                          <TableHead>Content</TableHead>
                          <TableHead className="w-[130px]">Status</TableHead>
                          <TableHead className="w-[180px]">
                            Scheduled ({getTimezoneAbbr(timezone)})
                          </TableHead>
                          <TableHead className="w-[150px]">Account</TableHead>
                          <TableHead className="w-[50px]"></TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedPosts.map((post) => {
                          const PlatformIcon = platformIcons[post.platform];
                          const status = statusConfig[post.status];
                          const StatusIcon = status.icon;

                          return (
                            <TableRow key={post.id}>
                              <TableCell>
                                <PlatformIcon className="h-5 w-5" />
                              </TableCell>
                              <TableCell>
                                <div className="max-w-md">
                                  <p className="line-clamp-2 text-sm">{post.content}</p>
                                  {post.mediaAssets.length > 0 && (
                                    <span className="text-xs text-muted-foreground">
                                      +{post.mediaAssets.length} media
                                    </span>
                                  )}
                                </div>
                              </TableCell>
                              <TableCell>
                                <Badge className={`${status.color} gap-1`}>
                                  <StatusIcon className="h-3 w-3" />
                                  {status.label}
                                </Badge>
                              </TableCell>
                              <TableCell>
                                {post.scheduledFor ? (
                                  <div className="text-sm">
                                    <div>
                                      {formatInTimezone(post.scheduledFor, timezone, {
                                        month: "short",
                                        day: "numeric",
                                        year: "numeric",
                                      })}
                                    </div>
                                    <div className="text-muted-foreground">
                                      {formatInTimezone(post.scheduledFor, timezone, {
                                        hour: "2-digit",
                                        minute: "2-digit",
                                        hour12: true,
                                      })}
                                    </div>
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground text-sm">Not scheduled</span>
                                )}
                              </TableCell>
                              <TableCell>
                                {post.socialAccount ? (
                                  <div className="text-sm">
                                    <div className="font-medium truncate max-w-[120px]">
                                      {post.socialAccount.displayName ||
                                        post.socialAccount.platformUsername}
                                    </div>
                                    {post.socialAccount.platformUsername && (
                                      <div className="text-xs text-muted-foreground truncate max-w-[120px]">
                                        @{post.socialAccount.platformUsername}
                                      </div>
                                    )}
                                  </div>
                                ) : (
                                  <span className="text-muted-foreground text-sm">No account</span>
                                )}
                              </TableCell>
                              <TableCell>
                                <DropdownMenu>
                                  <DropdownMenuTrigger className="inline-flex items-center justify-center h-8 w-8 rounded-md hover:bg-accent">
                                    <MoreHorizontal className="h-4 w-4" />
                                  </DropdownMenuTrigger>
                                  <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                      onClick={() => router.push(`/dashboard/drafts/${post.id}`)}
                                    >
                                      <Edit className="mr-2 h-4 w-4" />
                                      Edit
                                    </DropdownMenuItem>
                                    {post.status === PostStatus.SCHEDULED && (
                                      <DropdownMenuItem onClick={() => handleUnschedule(post.id)}>
                                        <Pause className="mr-2 h-4 w-4" />
                                        Unschedule
                                      </DropdownMenuItem>
                                    )}
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                      variant="destructive"
                                      onClick={() => handleDelete(post.id)}
                                    >
                                      <Trash2 className="mr-2 h-4 w-4" />
                                      Delete
                                    </DropdownMenuItem>
                                  </DropdownMenuContent>
                                </DropdownMenu>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

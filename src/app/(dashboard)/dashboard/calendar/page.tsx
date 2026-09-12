"use client";

import { useState, useEffect, useCallback } from "react";
import { Header } from "@/components/dashboard/header";
import { Calendar } from "@/components/ui/calendar";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2, Clock, GripVertical, Globe } from "lucide-react";
import { format, isSameDay, startOfDay } from "date-fns";
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

const statusColors: Record<PostStatus, string> = {
  DRAFT: "bg-gray-100 text-gray-700",
  PENDING_APPROVAL: "bg-yellow-100 text-yellow-700",
  APPROVED: "bg-blue-100 text-blue-700",
  SCHEDULED: "bg-purple-100 text-purple-700",
  PUBLISHING: "bg-orange-100 text-orange-700",
  PUBLISHED: "bg-green-100 text-green-700",
  FAILED: "bg-red-100 text-red-700",
};

export default function CalendarPage() {
  const [posts, setPosts] = useState<PostWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [timezone, setTimezone] = useState<string>("UTC");
  const [draggedPost, setDraggedPost] = useState<PostWithRelations | null>(null);
  const [rescheduleDialogOpen, setRescheduleDialogOpen] = useState(false);
  const [rescheduleTarget, setRescheduleTarget] = useState<{
    post: PostWithRelations;
    targetDate: Date;
  } | null>(null);
  const [rescheduleTime, setRescheduleTime] = useState("12:00");
  const [rescheduling, setRescheduling] = useState(false);

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

  const scheduledPosts = posts.filter(
    (p) => p.status === PostStatus.SCHEDULED && p.scheduledFor
  );

  const postsForSelectedDate = selectedDate
    ? scheduledPosts.filter((post) => {
        if (!post.scheduledFor) return false;
        const postDate = new Date(post.scheduledFor);
        return isSameDay(postDate, selectedDate);
      })
    : [];

  const datesWithPosts = scheduledPosts.reduce((acc, post) => {
    if (!post.scheduledFor) return acc;
    const dateKey = format(startOfDay(new Date(post.scheduledFor)), "yyyy-MM-dd");
    if (!acc[dateKey]) acc[dateKey] = 0;
    acc[dateKey]++;
    return acc;
  }, {} as Record<string, number>);

  const handleDragStart = (e: React.DragEvent, post: PostWithRelations) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("postId", post.id);
    setDraggedPost(post);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  };

  const handleDrop = (e: React.DragEvent, targetDate: Date) => {
    e.preventDefault();
    if (!draggedPost) return;

    setRescheduleTarget({ post: draggedPost, targetDate });
    if (draggedPost.scheduledFor) {
      const existingTime = formatInTimezone(draggedPost.scheduledFor, timezone, {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
      });
      setRescheduleTime(existingTime);
    }
    setRescheduleDialogOpen(true);
    setDraggedPost(null);
  };

  const handleReschedule = async () => {
    if (!rescheduleTarget) return;

    setRescheduling(true);
    try {
      const [hours, minutes] = rescheduleTime.split(":").map(Number);
      const targetDate = new Date(rescheduleTarget.targetDate);
      targetDate.setHours(hours, minutes, 0, 0);

      const utcDate = new Date(
        targetDate.toLocaleString("en-US", { timeZone: "UTC" })
      );
      const localDate = new Date(
        targetDate.toLocaleString("en-US", { timeZone: timezone })
      );
      const offset = localDate.getTime() - utcDate.getTime();
      const scheduledForUtc = new Date(targetDate.getTime() + offset);

      const res = await fetch(`/api/posts/${rescheduleTarget.post.id}/reschedule`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledFor: scheduledForUtc.toISOString(),
        }),
      });

      if (res.ok) {
        await fetchPosts();
      } else {
        const data = await res.json();
        console.error("Reschedule failed:", data.error);
      }
    } catch (error) {
      console.error("Reschedule error:", error);
    } finally {
      setRescheduling(false);
      setRescheduleDialogOpen(false);
      setRescheduleTarget(null);
    }
  };

  const renderDayContent = (day: Date) => {
    const dateKey = format(startOfDay(day), "yyyy-MM-dd");
    const count = datesWithPosts[dateKey] || 0;
    
    if (count > 0) {
      return (
        <div className="relative w-full h-full flex flex-col items-center justify-center">
          <span>{day.getDate()}</span>
          <div className="absolute bottom-0.5 flex gap-0.5">
            {count <= 3 ? (
              Array.from({ length: count }).map((_, i) => (
                <div
                  key={i}
                  className="w-1 h-1 rounded-full bg-purple-500"
                />
              ))
            ) : (
              <span className="text-[8px] text-purple-600 font-medium">{count}</span>
            )}
          </div>
        </div>
      );
    }
    
    return <span>{day.getDate()}</span>;
  };

  return (
    <div className="flex flex-col h-full">
      <Header
        title="Content Calendar"
        description="View and reschedule your scheduled posts"
      />

      <div className="flex-1 p-6">
        <div className="flex gap-6 h-full">
          <div className="w-[350px] flex-shrink-0">
            <Card>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Calendar</CardTitle>
                  <div className="flex items-center gap-2">
                    <Globe className="h-4 w-4 text-muted-foreground" />
                    <Select value={timezone} onValueChange={(v) => v && setTimezone(v)}>
                      <SelectTrigger className="w-[180px] h-8 text-xs">
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
                </div>
              </CardHeader>
              <CardContent>
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={setSelectedDate}
                  className="rounded-md border"
                  components={{
                    DayButton: ({ day, ...props }) => (
                      <button
                        {...props}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, day.date)}
                        className={props.className}
                      >
                        {renderDayContent(day.date)}
                      </button>
                    ),
                  }}
                />
                <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                  <div className="w-2 h-2 rounded-full bg-purple-500" />
                  <span>Scheduled posts</span>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="flex-1 min-w-0">
            <Card className="h-full flex flex-col">
              <CardHeader className="pb-2 flex-shrink-0">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">
                    {selectedDate
                      ? format(selectedDate, "EEEE, MMMM d, yyyy")
                      : "Select a date"}
                  </CardTitle>
                  <Badge variant="outline" className="font-normal">
                    {getTimezoneAbbr(timezone)}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto">
                {loading ? (
                  <div className="flex items-center justify-center h-32">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : postsForSelectedDate.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-32 text-center">
                    <p className="text-muted-foreground">No scheduled posts for this date</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Drag a post from another date to reschedule it here
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {postsForSelectedDate
                      .sort((a, b) => {
                        const aTime = a.scheduledFor ? new Date(a.scheduledFor).getTime() : 0;
                        const bTime = b.scheduledFor ? new Date(b.scheduledFor).getTime() : 0;
                        return aTime - bTime;
                      })
                      .map((post) => {
                        const PlatformIcon = platformIcons[post.platform];
                        return (
                          <div
                            key={post.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, post)}
                            className="flex items-start gap-3 p-3 rounded-lg border bg-card hover:bg-accent/50 cursor-grab active:cursor-grabbing transition-colors"
                          >
                            <GripVertical className="h-5 w-5 text-muted-foreground flex-shrink-0 mt-0.5" />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <PlatformIcon className="h-4 w-4 flex-shrink-0" />
                                <Badge className={statusColors[post.status]}>
                                  {post.status.replace("_", " ")}
                                </Badge>
                                {post.scheduledFor && (
                                  <span className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Clock className="h-3 w-3" />
                                    {formatInTimezone(post.scheduledFor, timezone, {
                                      hour: "2-digit",
                                      minute: "2-digit",
                                      hour12: true,
                                    })}
                                  </span>
                                )}
                              </div>
                              <p className="text-sm line-clamp-2">{post.content}</p>
                              {post.socialAccount && (
                                <p className="text-xs text-muted-foreground mt-1">
                                  @{post.socialAccount.platformUsername || post.socialAccount.displayName}
                                </p>
                              )}
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="w-[280px] flex-shrink-0">
            <Card className="h-full flex flex-col">
              <CardHeader className="pb-2 flex-shrink-0">
                <CardTitle className="text-lg">Upcoming</CardTitle>
              </CardHeader>
              <CardContent className="flex-1 overflow-auto">
                <div className="space-y-2">
                  {scheduledPosts
                    .filter((post) => {
                      if (!post.scheduledFor) return false;
                      return new Date(post.scheduledFor) >= startOfDay(new Date());
                    })
                    .sort((a, b) => {
                      const aTime = a.scheduledFor ? new Date(a.scheduledFor).getTime() : 0;
                      const bTime = b.scheduledFor ? new Date(b.scheduledFor).getTime() : 0;
                      return aTime - bTime;
                    })
                    .slice(0, 10)
                    .map((post) => {
                      const PlatformIcon = platformIcons[post.platform];
                      return (
                        <div
                          key={post.id}
                          draggable
                          onDragStart={(e) => handleDragStart(e, post)}
                          onClick={() => {
                            if (post.scheduledFor) {
                              setSelectedDate(new Date(post.scheduledFor));
                            }
                          }}
                          className="p-2 rounded border text-xs hover:bg-accent/50 cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-2 mb-1">
                            <PlatformIcon className="h-3 w-3" />
                            <span className="text-muted-foreground">
                              {post.scheduledFor &&
                                formatInTimezone(post.scheduledFor, timezone, {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                  hour12: true,
                                })}
                            </span>
                          </div>
                          <p className="line-clamp-1">{post.content}</p>
                        </div>
                      );
                    })}
                  {scheduledPosts.filter((p) => p.scheduledFor && new Date(p.scheduledFor) >= startOfDay(new Date())).length === 0 && (
                    <p className="text-xs text-muted-foreground text-center py-4">
                      No upcoming posts
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>

      <Dialog open={rescheduleDialogOpen} onOpenChange={setRescheduleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reschedule Post</DialogTitle>
            <DialogDescription>
              {rescheduleTarget && (
                <>
                  Move this post to{" "}
                  <strong>
                    {format(rescheduleTarget.targetDate, "MMMM d, yyyy")}
                  </strong>
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="time">Time ({getTimezoneAbbr(timezone)})</Label>
              <Input
                id="time"
                type="time"
                value={rescheduleTime}
                onChange={(e) => setRescheduleTime(e.target.value)}
              />
            </div>
            {rescheduleTarget?.post.content && (
              <div className="p-3 rounded-lg bg-muted text-sm">
                <p className="line-clamp-3">{rescheduleTarget.post.content}</p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRescheduleDialogOpen(false)}
              disabled={rescheduling}
            >
              Cancel
            </Button>
            <Button onClick={handleReschedule} disabled={rescheduling}>
              {rescheduling && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Reschedule
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

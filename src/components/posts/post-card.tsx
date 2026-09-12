"use client";

import { Post, SocialAccount, PostMedia, MediaAsset, PostStatus } from "@prisma/client";
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { 
  MoreHorizontal, 
  Edit, 
  Trash2, 
  CheckCircle, 
  XCircle, 
  Clock, 
  ExternalLink,
} from "lucide-react";
import { format } from "date-fns";
import Link from "next/link";
import { platformIcons } from "@/components/icons/platform-icons";
import { ScheduleControl } from "@/components/posts/schedule-control";

type PostWithRelations = Post & {
  socialAccount: SocialAccount | null;
  mediaAssets: (PostMedia & { mediaAsset: MediaAsset })[];
};

interface PostCardProps {
  post: PostWithRelations;
  onApprove?: (id: string) => void;
  onReject?: (id: string) => void;
  onDelete?: (id: string) => void;
  onScheduled?: (id: string) => void;
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

export function PostCard({ post, onApprove, onReject, onDelete, onScheduled }: PostCardProps) {
  const PlatformIcon = platformIcons[post.platform];
  const statusStyle = statusColors[post.status];

  return (
    <Card className="overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-2">
            <PlatformIcon className="h-5 w-5" />
            <Badge className={`${statusStyle.bg} ${statusStyle.text} hover:${statusStyle.bg}`}>
              {post.status.replace("_", " ")}
            </Badge>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger className="inline-flex items-center justify-center rounded-lg h-8 w-8 hover:bg-accent">
              <MoreHorizontal className="h-4 w-4" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem>
                <Link href={`/dashboard/drafts/${post.id}`} className="flex items-center w-full">
                  <Edit className="mr-2 h-4 w-4" />
                  Edit
                </Link>
              </DropdownMenuItem>
              {post.platformPostUrl && (
                <DropdownMenuItem>
                  <a 
                    href={post.platformPostUrl} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center w-full"
                  >
                    <ExternalLink className="mr-2 h-4 w-4" />
                    View on {post.platform}
                  </a>
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive"
                onClick={() => onDelete?.(post.id)}
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        {post.title && (
          <h3 className="font-semibold mb-2">{post.title}</h3>
        )}
        <p className="text-sm text-muted-foreground line-clamp-3">
          {post.content}
        </p>

        {post.mediaAssets.length > 0 && (
          <div className="mt-3 flex gap-2">
            {post.mediaAssets.slice(0, 3).map((media) => (
              <div
                key={media.id}
                className="h-16 w-16 rounded-md bg-muted flex items-center justify-center overflow-hidden"
              >
                {media.mediaAsset.mimeType.startsWith("image/") ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={media.mediaAsset.url}
                    alt=""
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <span className="text-xs text-muted-foreground">Video</span>
                )}
              </div>
            ))}
            {post.mediaAssets.length > 3 && (
              <div className="h-16 w-16 rounded-md bg-muted flex items-center justify-center">
                <span className="text-sm text-muted-foreground">
                  +{post.mediaAssets.length - 3}
                </span>
              </div>
            )}
          </div>
        )}

        {post.scheduledFor && (
          <div className="mt-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            Scheduled for {format(post.scheduledFor, "MMM d, yyyy 'at' h:mm a")}
          </div>
        )}

        {post.errorMessage && (
          <div className="mt-3 rounded-md bg-red-50 p-2 text-sm text-red-700">
            {post.errorMessage}
          </div>
        )}
      </CardContent>

      {(post.status === "DRAFT" || post.status === "PENDING_APPROVAL" || post.status === "APPROVED") && (
        <CardFooter className="border-t pt-3">
          {post.status === "APPROVED" ? (
            <ScheduleControl
              postId={post.id}
              platform={post.platform}
              status={post.status}
              onScheduled={onScheduled}
            />
          ) : (
            <div className="flex w-full gap-2">
              {post.status === "PENDING_APPROVAL" && onApprove && (
                <Button
                  size="sm"
                  className="flex-1"
                  onClick={() => onApprove(post.id)}
                >
                  <CheckCircle className="mr-2 h-4 w-4" />
                  Approve
                </Button>
              )}
              {post.status === "PENDING_APPROVAL" && onReject && (
                <Button
                  size="sm"
                  variant="outline"
                  className="flex-1"
                  onClick={() => onReject(post.id)}
                >
                  <XCircle className="mr-2 h-4 w-4" />
                  Reject
                </Button>
              )}
              {post.status === "DRAFT" && (
                <Link 
                  href={`/dashboard/drafts/${post.id}`}
                  className="flex-1 inline-flex items-center justify-center rounded-lg border px-3 py-1.5 text-sm font-medium hover:bg-accent hover:text-accent-foreground transition-colors"
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Continue Editing
                </Link>
              )}
            </div>
          )}
        </CardFooter>
      )}
    </Card>
  );
}

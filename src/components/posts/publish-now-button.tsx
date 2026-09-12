"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Send, Loader2 } from "lucide-react";

/**
 * Publish this post to the platform right now.
 *
 * Scheduling exists for posts with a time; this is for the case the app had no
 * answer to - "put it out now" - which otherwise meant scheduling a minute
 * ahead and waiting for the cron worker to come round.
 */
export function PublishNowButton({ postId }: { postId: string }) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onPublish = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/posts/${postId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Publishing failed");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Publishing failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex w-full flex-col gap-1">
      <Button size="sm" className="w-full gap-2" onClick={onPublish} disabled={loading}>
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        {loading ? "Publishing…" : "Publish now"}
      </Button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

"use client";

import { useMemo, useState } from "react";
import { Platform, PostStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BestTimeChips } from "@/components/posts/best-time-chips";
import { Clock } from "lucide-react";

interface ScheduleControlProps {
  postId: string;
  platform: Platform;
  status: PostStatus;
  onScheduled?: (postId: string) => void;
}

function isFutureDatetimeLocal(value: string, now = new Date()): boolean {
  if (!value) return false;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return false;
  return parsed.getTime() > now.getTime();
}

export function ScheduleControl({
  postId,
  platform,
  status,
  onScheduled,
}: ScheduleControlProps) {
  const [scheduledFor, setScheduledFor] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSchedule = status === PostStatus.APPROVED;
  const futureOk = useMemo(
    () => isFutureDatetimeLocal(scheduledFor),
    [scheduledFor]
  );

  if (!canSchedule) {
    return null;
  }

  async function handleSchedule() {
    setError(null);
    if (!futureOk) {
      setError("Pick a future date and time");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/posts/${postId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledFor }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Schedule failed (${res.status})`);
      }
      onScheduled?.(postId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to schedule");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-3" data-testid="schedule-control">
      <BestTimeChips platform={platform} onSelect={setScheduledFor} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          type="datetime-local"
          value={scheduledFor}
          onChange={(e) => {
            setScheduledFor(e.target.value);
            setError(null);
          }}
          className="sm:flex-1"
          aria-label="Schedule datetime"
        />
        <Button
          type="button"
          size="sm"
          disabled={!futureOk || submitting}
          onClick={handleSchedule}
          className="shrink-0"
        >
          <Clock className="mr-2 h-4 w-4" />
          {submitting ? "Scheduling…" : "Schedule"}
        </Button>
      </div>
      {error && (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

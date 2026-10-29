"use client";

import { useMemo, useState } from "react";
import { Platform, PostStatus } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { BestTimeChips } from "@/components/posts/best-time-chips";
import { parseScheduleInput, scheduleInputMessage } from "@/lib/posts/schedule-time";
import { Clock } from "lucide-react";

interface ScheduleControlProps {
  postId: string;
  platform: Platform;
  status: PostStatus;
  /**
   * Approval is the proof, not the status: a status can outlive its stamp (any
   * edit clears `approvedAt`), and the schedule route refuses a post without it.
   */
  approvedAt?: Date | string | null;
  onScheduled?: (postId: string) => void;
}

export function ScheduleControl({
  postId,
  platform,
  status,
  approvedAt,
  onScheduled,
}: ScheduleControlProps) {
  const [scheduledFor, setScheduledFor] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Once the server has accepted the schedule the post is SCHEDULED, but this
  // card keeps its old APPROVED props until the parent refetches. Without this a
  // second click in that window is refused ("must be approved ... Current
  // status: SCHEDULED") and the error makes a post that is scheduled look failed.
  const [scheduled, setScheduled] = useState(false);

  const canSchedule = status === PostStatus.APPROVED && Boolean(approvedAt);
  const parsed = useMemo(() => parseScheduleInput(scheduledFor), [scheduledFor]);
  const futureOk = parsed.ok;

  if (!canSchedule) {
    return null;
  }

  if (scheduled) {
    return (
      <p className="text-xs text-muted-foreground" role="status" data-testid="schedule-control-done">
        Scheduled. It will be published at the time you chose.
      </p>
    );
  }

  async function handleSchedule() {
    setError(null);

    // Resolve the instant here, where the user's timezone is known, and send
    // that: the raw input value is a wall clock with no offset, so the server
    // would resolve it in its own zone (UTC on Vercel) and the post would go out
    // hours away from what the user picked.
    const resolved = parseScheduleInput(scheduledFor);
    if (!resolved.ok) {
      setError(scheduleInputMessage(resolved.reason));
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/posts/${postId}/schedule`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scheduledFor: resolved.iso }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || `Schedule failed (${res.status})`);
      }
      setScheduled(true);
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

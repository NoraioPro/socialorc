"use client";

import { useEffect, useState } from "react";
import { Platform } from "@prisma/client";
import { Button } from "@/components/ui/button";
import {
  bestTimeToDatetimeLocal,
  formatBestTimeChipLabel,
} from "@/lib/best-times";

type BestTime = { day: string; hour: number; score: number };

interface BestTimeChipsProps {
  platform: Platform;
  onSelect: (isoLocalDatetime: string) => void;
}

export function BestTimeChips({ platform, onSelect }: BestTimeChipsProps) {
  const [times, setTimes] = useState<BestTime[]>([]);
  const [notes, setNotes] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/posts/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "best-times", platform }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          throw new Error(data.error || `Failed to load best times (${res.status})`);
        }
        if (cancelled) return;
        setTimes(Array.isArray(data.times) ? data.times : []);
        setNotes(typeof data.notes === "string" ? data.notes : null);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load best times");
          setTimes([]);
          setNotes(null);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [platform]);

  if (loading) {
    return (
      <p className="text-xs text-muted-foreground" data-testid="best-time-chips-loading">
        Loading best times…
      </p>
    );
  }

  if (error) {
    return (
      <p className="text-xs text-destructive" data-testid="best-time-chips-error" role="alert">
        {error}
      </p>
    );
  }

  if (times.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2" data-testid="best-time-chips">
      <div className="flex flex-wrap gap-2">
        {times.map((t) => {
          const label = formatBestTimeChipLabel(t.day, t.hour, t.score);
          const value = bestTimeToDatetimeLocal(t.day, t.hour);
          return (
            <Button
              key={`${t.day}-${t.hour}-${t.score}`}
              type="button"
              size="sm"
              variant="outline"
              className="h-7 rounded-full px-3 text-xs"
              onClick={() => onSelect(value)}
            >
              {label}
            </Button>
          );
        })}
      </div>
      {notes && (
        <p className="text-xs text-muted-foreground line-clamp-2" title={notes}>
          {notes}
        </p>
      )}
    </div>
  );
}

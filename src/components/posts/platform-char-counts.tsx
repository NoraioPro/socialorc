"use client";

import { Platform } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import {
  countsForPlatforms,
  formatRemaining,
  type CharCountSnapshot,
} from "@/lib/char-counts";
import { PLATFORM_CONFIGS } from "@/types/platform";
import { platformIcons } from "@/components/icons/platform-icons";

export function PlatformCharCounts({
  text,
  platforms,
  hasMedia = false,
  title = "Remaining characters",
}: {
  text: string;
  platforms: Platform[];
  hasMedia?: boolean;
  title?: string;
}) {
  if (platforms.length === 0) return null;
  const snapshots: CharCountSnapshot[] = countsForPlatforms(text, platforms, hasMedia);

  return (
    <div className="space-y-2 rounded-md border bg-muted/30 p-3">
      <p className="text-xs font-medium text-muted-foreground">{title}</p>
      <div className="flex flex-wrap gap-2">
        {snapshots.map((snap) => {
          const Icon = platformIcons[snap.platform];
          const name =
            snap.platform === "TWITTER"
              ? "X"
              : PLATFORM_CONFIGS[snap.platform].name;
          return (
            <Badge
              key={snap.platform}
              variant={snap.withinLimit ? "secondary" : "destructive"}
              className="gap-1.5 font-normal"
              title={`${snap.used}/${snap.limit}`}
            >
              <Icon className="h-3 w-3" />
              <span>{name}</span>
              <span className="tabular-nums">{formatRemaining(snap)}</span>
            </Badge>
          );
        })}
      </div>
    </div>
  );
}

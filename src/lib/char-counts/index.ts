import { Platform } from "@prisma/client";
import { PLATFORM_CONFIGS } from "@/types/platform";

export type CharCountSnapshot = {
  platform: Platform;
  limit: number;
  used: number;
  remaining: number;
  withinLimit: boolean;
};

/** Effective text limit for a platform (caption cap when media is attached). */
export function effectiveTextLimit(
  platform: Platform,
  hasMedia = false
): number {
  const config = PLATFORM_CONFIGS[platform];
  if (hasMedia && config.capabilities.captionMaxWithMedia != null) {
    return Math.min(config.maxTextLength, config.capabilities.captionMaxWithMedia);
  }
  return config.maxTextLength;
}

export function countForPlatform(
  text: string,
  platform: Platform,
  hasMedia = false
): CharCountSnapshot {
  const limit = effectiveTextLimit(platform, hasMedia);
  const used = [...text].length; // code-point friendly enough for UI counts
  const remaining = limit - used;
  return {
    platform,
    limit,
    used,
    remaining,
    withinLimit: remaining >= 0,
  };
}

export function countsForPlatforms(
  text: string,
  platforms: Platform[],
  hasMedia = false
): CharCountSnapshot[] {
  return platforms.map((platform) => countForPlatform(text, platform, hasMedia));
}

export function formatRemaining(snapshot: CharCountSnapshot): string {
  if (snapshot.remaining >= 0) {
    return `${snapshot.remaining} left`;
  }
  return `${Math.abs(snapshot.remaining)} over`;
}

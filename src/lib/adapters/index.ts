import { Platform } from "@prisma/client";
import { PlatformAdapter } from "@/types/platform";
import { linkedInAdapter } from "./linkedin";
import { twitterAdapter } from "./twitter";
import { instagramAdapter } from "./instagram";
import { facebookAdapter } from "./facebook";
import { tiktokAdapter } from "./tiktok";
import { youtubeAdapter } from "./youtube";

export const adapters: Record<Platform, PlatformAdapter> = {
  LINKEDIN: linkedInAdapter,
  TWITTER: twitterAdapter,
  INSTAGRAM: instagramAdapter,
  FACEBOOK: facebookAdapter,
  TIKTOK: tiktokAdapter,
  YOUTUBE: youtubeAdapter,
};

export function getAdapter(platform: Platform): PlatformAdapter {
  const adapter = adapters[platform];
  if (!adapter) {
    throw new Error(`No adapter found for platform: ${platform}`);
  }
  return adapter;
}

export function getAdapterStatus(): Record<Platform, { configured: boolean; missing: string[] }> {
  const status: Record<Platform, { configured: boolean; missing: string[] }> = {} as Record<Platform, { configured: boolean; missing: string[] }>;
  
  for (const [platform, adapter] of Object.entries(adapters)) {
    const validation = adapter.validateCredentials();
    status[platform as Platform] = {
      configured: validation.valid,
      missing: validation.missing,
    };
  }
  
  return status;
}

export * from "./linkedin";
export * from "./twitter";
export * from "./instagram";
export * from "./facebook";
export * from "./tiktok";
export * from "./youtube";
export * from "./base";

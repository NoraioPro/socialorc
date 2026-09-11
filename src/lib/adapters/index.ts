import { Platform } from "@prisma/client";
import { PlatformAdapter } from "@/types/platform";
import { linkedInAdapter } from "./linkedin";
import { twitterAdapter } from "./twitter";
import { instagramAdapter } from "./instagram";
import { facebookAdapter } from "./facebook";
import { tiktokAdapter } from "./tiktok";
import { youtubeAdapter } from "./youtube";
import { createMockAdapter } from "./mock";

const MOCK_MODE = process.env.MOCK_SOCIAL_ADAPTERS === "true";

export const adapters: Record<Platform, PlatformAdapter> = {
  LINKEDIN: linkedInAdapter,
  TWITTER: twitterAdapter,
  INSTAGRAM: instagramAdapter,
  FACEBOOK: facebookAdapter,
  TIKTOK: tiktokAdapter,
  YOUTUBE: youtubeAdapter,
};

/**
 * Get adapter for a platform.
 * 
 * Behavior:
 * - If MOCK_SOCIAL_ADAPTERS=true, always returns mock adapter
 * - If useMockIfUnconfigured=true and platform credentials missing, returns mock adapter
 * - Otherwise returns real adapter
 */
export function getAdapter(platform: Platform, options?: { useMockIfUnconfigured?: boolean }): PlatformAdapter {
  const adapter = adapters[platform];
  if (!adapter) {
    throw new Error(`No adapter found for platform: ${platform}`);
  }

  if (MOCK_MODE) {
    return createMockAdapter(platform);
  }

  if (options?.useMockIfUnconfigured) {
    const validation = adapter.validateCredentials();
    if (!validation.valid) {
      console.log(`[${platform}] Using mock adapter (credentials not configured)`);
      return createMockAdapter(platform);
    }
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

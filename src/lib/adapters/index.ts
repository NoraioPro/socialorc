import { Platform } from "@prisma/client";
import { PlatformAdapter, PlatformCapabilities, PlatformConfig, PLATFORM_CONFIGS, AuthMethod } from "@/types/platform";
import { linkedInAdapter } from "./linkedin";
import { twitterAdapter } from "./twitter";
import { instagramAdapter } from "./instagram";
import { facebookAdapter } from "./facebook";
import { tiktokAdapter } from "./tiktok";
import { youtubeAdapter } from "./youtube";
import { telegramAdapter } from "./telegram";
import { createMockAdapter } from "./mock";

const MOCK_MODE = process.env.MOCK_SOCIAL_ADAPTERS === "true";

export const adapters: Record<Platform, PlatformAdapter> = {
  LINKEDIN: linkedInAdapter,
  TWITTER: twitterAdapter,
  INSTAGRAM: instagramAdapter,
  FACEBOOK: facebookAdapter,
  TIKTOK: tiktokAdapter,
  YOUTUBE: youtubeAdapter,
  TELEGRAM: telegramAdapter,
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

/**
 * Registry helper: get capabilities for a platform without instantiating an adapter.
 */
export function getCapabilities(platform: Platform): PlatformCapabilities {
  return PLATFORM_CONFIGS[platform].capabilities;
}

/**
 * Registry helper: get full config for a platform.
 */
export function getConfig(platform: Platform): PlatformConfig {
  return PLATFORM_CONFIGS[platform];
}

/**
 * Registry helper: check if a platform uses token-based auth (vs OAuth).
 */
export function isTokenBased(platform: Platform): boolean {
  return PLATFORM_CONFIGS[platform].capabilities.authMethod === "token";
}

/**
 * Registry helper: get the auth method for a platform.
 */
export function getAuthMethod(platform: Platform): AuthMethod {
  return PLATFORM_CONFIGS[platform].capabilities.authMethod;
}

/**
 * Registry helper: list platforms that match a capability predicate.
 */
export function filterByCapability(
  predicate: (caps: PlatformCapabilities) => boolean
): Platform[] {
  return (Object.values(Platform) as Platform[]).filter(
    (p) => predicate(PLATFORM_CONFIGS[p].capabilities)
  );
}

/**
 * Registry helper: list all platforms with a specific auth method.
 */
export function platformsByAuthMethod(method: AuthMethod): Platform[] {
  return filterByCapability((caps) => caps.authMethod === method);
}

/**
 * Registry helper: list platforms that support native scheduling.
 */
export function platformsWithNativeScheduling(): Platform[] {
  return filterByCapability((caps) => caps.nativeScheduling);
}

/**
 * Registry helper: list platforms that require media (no text-only posts).
 */
export function platformsRequiringMedia(): Platform[] {
  return filterByCapability((caps) => caps.mediaRequired);
}

/**
 * Registry helper: check if a platform is configured (credentials present).
 */
export function isConfigured(platform: Platform): boolean {
  return adapters[platform].validateCredentials().valid;
}

export * from "./linkedin";
export * from "./twitter";
export * from "./instagram";
export * from "./facebook";
export * from "./tiktok";
export * from "./youtube";
export * from "./base";
export * from "./credentials";
export * from "./errors";

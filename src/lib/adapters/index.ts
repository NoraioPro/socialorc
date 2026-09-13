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
 * Whether a mock adapter may stand in for a real platform.
 *
 * Mocks exist for local development and tests, where a success response is the
 * point. In production they are never acceptable as a substitute for a real
 * connector: `MockAdapter.createPost` returns `success: true` with a
 * `mock_post_*` id, which would mark an unpublished post as PUBLISHED and write
 * a fake platform URL. A missing credential is a configuration fault to
 * surface, not something to paper over.
 *
 * Gated on NODE_ENV rather than on the mock flag alone, so that a stale
 * `MOCK_SOCIAL_ADAPTERS=true` left in a production environment cannot fake a
 * publish. Tests run with NODE_ENV=test and keep full mock behaviour.
 */
export function isMockAdapterAllowed(): boolean {
  return process.env.NODE_ENV !== "production";
}

/**
 * Get adapter for a platform.
 *
 * Behavior:
 * - Mock adapters are only ever returned outside production (see
 *   `isMockAdapterAllowed`).
 * - Outside production, `MOCK_SOCIAL_ADAPTERS=true` returns the mock adapter
 *   unconditionally.
 * - Outside production, `useMockIfUnconfigured=true` returns the mock adapter
 *   when the platform has no credentials.
 * - Otherwise the real adapter is returned — even when unconfigured, so the
 *   caller can report exactly what is missing instead of quietly succeeding.
 */
export function getAdapter(platform: Platform, options?: { useMockIfUnconfigured?: boolean }): PlatformAdapter {
  const adapter = adapters[platform];
  if (!adapter) {
    throw new Error(`No adapter found for platform: ${platform}`);
  }

  if (!isMockAdapterAllowed()) {
    return adapter;
  }

  if (MOCK_MODE) {
    return createMockAdapter(platform);
  }

  if (options?.useMockIfUnconfigured) {
    const validation = adapter.validateCredentials();
    if (!validation.valid) {
      console.log(`[${platform}] Using mock adapter (credentials not configured, non-production)`);
      return createMockAdapter(platform);
    }
  }

  return adapter;
}

/** Why a platform cannot be published to right now. */
export type PublishAdapterResolution =
  | { ok: true; adapter: PlatformAdapter }
  | {
      ok: false;
      code: "PLATFORM_NOT_CONFIGURED";
      /** Variable NAMES only — never a value. */
      missing: string[];
      message: string;
    };

/**
 * Resolve the adapter a publish is allowed to use, or explain why none is.
 *
 * Every real publish path goes through this. It is deliberately incapable of
 * returning a mock in production: an unconfigured platform resolves to
 * `ok: false` so the caller can fail the post with PLATFORM_NOT_CONFIGURED and
 * leave it unpublished. Outside production the mock still resolves `ok: true`,
 * which keeps local development and the mock-driven tests working.
 */
export function resolvePublishAdapter(platform: Platform): PublishAdapterResolution {
  const adapter = getAdapter(platform);
  const validation = adapter.validateCredentials();

  if (!validation.valid) {
    return {
      ok: false,
      code: "PLATFORM_NOT_CONFIGURED",
      missing: validation.missing,
      message: `${platform} credentials are not configured`,
    };
  }

  return { ok: true, adapter };
}

export function getAdapterStatus(): Record<Platform, { configured: boolean; missing: string[] }> {
  const status: Record<Platform, { configured: boolean; missing: string[] }> = {} as Record<Platform, { configured: boolean; missing: string[] }>;
  
  for (const platform of Object.keys(adapters) as Platform[]) {
    // Always the REAL adapter, never a mock. Health has to describe what can
    // actually publish: MockAdapter reports valid:true for every platform, so
    // consulting it here would present an unconfigured platform as healthy.
    const validation = adapters[platform].validateCredentials();
    status[platform] = {
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

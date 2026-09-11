import { Platform } from "@prisma/client";
import { PLATFORM_CONFIGS } from "@/types/platform";

/**
 * Health reporting, kept as pure functions so the status logic is testable
 * without a database or a platform.
 *
 * Deliberately leak-free: it reports whether credentials are present and which
 * variable NAMES are missing — never a value.
 */

export interface PlatformReadiness {
  platform: Platform;
  name: string;
  configured: boolean;
  /** Names of the environment variables that still need a value. */
  missing: string[];
  /** Token-based connectors (Telegram) connect differently from OAuth ones. */
  auth: "oauth" | "token";
}

export interface HealthInput {
  databaseReachable: boolean;
  appliedMigrations: number | null;
  pendingJobs?: number | null;
  platforms: PlatformReadiness[];
}

export interface HealthReport {
  status: "ok" | "degraded" | "error";
  database: { reachable: boolean; appliedMigrations: number | null };
  worker: { pendingJobs: number | null };
  platforms: { configured: number; total: number; unconfigured: string[] };
  /** True when nothing can publish yet — the usual state before credentials exist. */
  needsCredentials: boolean;
}

export function summarizeHealth(input: HealthInput): HealthReport {
  const configured = input.platforms.filter((p) => p.configured);
  const unconfigured = input.platforms.filter((p) => !p.configured).map((p) => p.platform);

  let status: HealthReport["status"] = "ok";
  if (!input.databaseReachable) status = "error";
  else if (input.appliedMigrations === 0) status = "degraded";

  return {
    status,
    database: {
      reachable: input.databaseReachable,
      appliedMigrations: input.appliedMigrations,
    },
    worker: { pendingJobs: input.pendingJobs ?? null },
    platforms: {
      configured: configured.length,
      total: input.platforms.length,
      unconfigured,
    },
    needsCredentials: configured.length === 0,
  };
}

/**
 * Which connectors could actually publish right now. This is the question an
 * operator asks first ("why did nothing send?"), so it is answerable from one
 * call instead of a hunt through environment variables.
 */
export function platformReadiness(
  status: Record<string, { configured: boolean; missing: string[] }>,
): PlatformReadiness[] {
  return (Object.values(Platform) as Platform[]).map((platform) => {
    const entry = status[platform] ?? { configured: false, missing: [] };
    return {
      platform,
      name: PLATFORM_CONFIGS[platform].name,
      configured: entry.configured,
      missing: entry.missing,
      auth: PLATFORM_CONFIGS[platform].capabilities.tokenBasedAuth ? "token" : "oauth",
    };
  });
}

/**
 * Connection readiness — what a workspace owner needs to know before a
 * "Connect" button can work.
 *
 * One-click connect is a *product* property: for the click to succeed, the SaaS
 * owner must have registered an app with each platform and stored its
 * credentials server-side. So the honest state is per platform:
 *
 *   • is it configured at all, and which env vars are missing (names only)
 *   • which redirect URI that platform's portal must be told about
 *   • does it connect by OAuth redirect or bot token
 *   • what it can actually do once connected, and what the app is not yet
 *     approved for
 *
 * Two rules this module keeps:
 *   1. Secrets never leave the process. The report carries variable NAMES and
 *      the redirect URI, never a client id or secret.
 *   2. Nothing is reported as ready unless it truly is. An OAuth platform with
 *      missing credentials is `needs_setup`, not "ready" with a button that
 *      fails on click.
 */

import type { Platform } from "@prisma/client";
import type { CapabilityReport, ConnectionStatus } from "./types";

/** How a platform is connected. */
export type ConnectMethod = "oauth2" | "bot_token";

export type ReadinessState =
  /** Credentials present: the button can start a real connection. */
  | "ready"
  /** Credentials missing: the owner must register an app first. */
  | "needs_setup"
  /** Intentional local-only adapter, never offered to a user. */
  | "internal";

export interface PlatformReadiness {
  platform: Platform;
  method: ConnectMethod;
  state: ReadinessState;
  /** Credential variable NAMES that are not set. Never values. */
  missing: string[];
  /** Exactly what to paste into the provider's portal, when it has one. */
  redirectUri: string | null;
  /** What the platform can do once connected (capability-addressed). */
  capabilities: CapabilityReport["capabilities"] | Record<string, boolean>;
  limitations: string[];
  /** Whether the app still needs the platform's review for full publishing. */
  approval: { directPublish: boolean; draftUpload: boolean };
  /** One line a non-technical owner can act on. */
  summary: string;
}

export interface ReadinessReport {
  generatedAt: string;
  /** Base URL the redirect URIs are built from. */
  appUrl: string;
  platforms: PlatformReadiness[];
  totals: {
    platforms: number;
    ready: number;
    needsSetup: number;
    connected: number;
  };
}

/** Platforms a user can connect, in the order the UI shows them. */
export const CONNECTABLE_PLATFORMS: Platform[] = [
  "TIKTOK",
  "INSTAGRAM",
  "FACEBOOK",
  "YOUTUBE",
  "LINKEDIN",
  "TWITTER",
  "TELEGRAM",
] as Platform[];

/** Bot-token platforms have no redirect URI and no OAuth app to register. */
const BOT_TOKEN_PLATFORMS: Platform[] = ["TELEGRAM"] as Platform[];

export function connectMethodFor(platform: Platform): ConnectMethod {
  return BOT_TOKEN_PLATFORMS.includes(platform) ? "bot_token" : "oauth2";
}

/**
 * The callback URL a platform's developer portal must be configured with.
 *
 * Mirrors `PlatformAdapter.getRedirectUri()` (`${baseUrl}/api/social/<platform>/callback`).
 * It is derived from the same base URL so a portal mismatch — the single most
 * common cause of "connect fails after the user approves" — is visible in the UI
 * before anyone clicks.
 */
export function redirectUriFor(platform: Platform, appUrl: string): string | null {
  if (connectMethodFor(platform) === "bot_token") return null;
  const base = appUrl.replace(/\/+$/, "");
  return `${base}/api/social/${platform.toLowerCase()}/callback`;
}

export interface ReadinessDeps {
  credentialStatus: (platform: Platform) => { configured: boolean; missing: string[] };
  capabilities: (platform: Platform, approval: { directPublish: boolean; draftUpload: boolean }) =>
    | { capabilities: Record<string, boolean>; limitations: string[] }
    | { capabilities: Partial<CapabilityReport["capabilities"]>; limitations: CapabilityReport["limitations"] };
  approval: (platform: Platform) => { directPublish: boolean; draftUpload: boolean };
  appUrl: string;
}

/** Build the whole report. Pure: every input arrives through `deps`. */
export function buildReadinessReport(
  platforms: Platform[],
  deps: ReadinessDeps,
  connectedCounts: Partial<Record<Platform, number>> = {},
  now: Date = new Date(),
): ReadinessReport {
  const rows: PlatformReadiness[] = platforms.map((platform) => {
    const credentials = deps.credentialStatus(platform);
    const approval = deps.approval(platform);
    const capabilityReport = deps.capabilities(platform, approval);
    const method = connectMethodFor(platform);

    const state: ReadinessState = credentials.configured ? "ready" : "needs_setup";

    return {
      platform,
      method,
      state,
      missing: credentials.missing,
      redirectUri: redirectUriFor(platform, deps.appUrl),
      capabilities: capabilityReport.capabilities,
      limitations: capabilityReport.limitations.map((entry) =>
        typeof entry === "string" ? entry : entry.message,
      ),
      approval,
      summary: summarize(platform, state, method, credentials.missing, approval),
    };
  });

  const ready = rows.filter((row) => row.state === "ready").length;
  const connected = rows.reduce((sum, row) => sum + (connectedCounts[row.platform] ?? 0), 0);

  return {
    generatedAt: now.toISOString(),
    appUrl: deps.appUrl,
    platforms: rows,
    totals: {
      platforms: rows.length,
      ready,
      needsSetup: rows.length - ready,
      connected,
    },
  };
}

function summarize(
  platform: Platform,
  state: ReadinessState,
  method: ConnectMethod,
  missing: string[],
  approval: { directPublish: boolean; draftUpload: boolean },
): string {
  const label = platform.charAt(0) + platform.slice(1).toLowerCase();

  if (state === "needs_setup") {
    return method === "bot_token"
      ? `${label} needs ${missing.join(", ")} before it can be linked.`
      : `${label} needs an app registered with ${missing.join(", ")} set before anyone can connect.`;
  }

  if (method === "bot_token") {
    return `${label} is ready to link with the configured bot token.`;
  }

  if (!approval.directPublish && !approval.draftUpload) {
    return `${label} can connect, but the app is not yet approved for publishing — content will be drafted for review.`;
  }

  return `${label} is ready to connect and publish.`;
}

/** Connection state for one stored account, made explicit for the UI. */
export function accountStatusLabel(status: ConnectionStatus): string {
  switch (status) {
    case "connected":
      return "Connected";
    case "disconnected":
      return "Not connected";
    case "refresh_required":
      return "Reconnect required";
    case "permission_missing":
      return "Permissions missing";
    case "review_required":
      return "App review required";
    default:
      return "Unknown";
  }
}

/**
 * Capability computation — the answer to "what can this connection actually do
 * right now", derived from granted scopes, account type and app-review state.
 *
 * Pure on purpose: the UI, the publish gate and the tests all read the same
 * function, so a capability can never be true in the UI and false in the worker.
 */

import type { Platform } from "@prisma/client";
import {
  NO_CAPABILITIES,
  type AppApprovalState,
  type CapabilityLimitation,
  type CapabilityReport,
  type ConnectionStatus,
  type AccountCapabilities,
} from "./types";
import { TIKTOK_SCOPES } from "./tiktok/constants";

/** Scopes arrive from providers as a space- or comma-separated string. */
export function parseScopes(scope: string | null | undefined): string[] {
  if (!scope) return [];
  return scope
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function hasScope(scopes: string[], scope: string): boolean {
  return scopes.includes(scope);
}

/** True when any scope in `requested` is present. */
export function hasAnyScope(scopes: string[], requested: readonly string[]): boolean {
  return requested.some((scope) => scopes.includes(scope));
}

const TIKTOK_ACCOUNT_TYPE = "tiktok_creator";

/**
 * TikTok capabilities.
 *
 * Text and carousel are not supported by the Content Posting API at all; the
 * photo-post endpoint exists but is not implemented here, so `image` stays
 * false with a NOT_IMPLEMENTED_YET limitation rather than a guess.
 */
export function tiktokCapabilities(input: {
  scopes: string[];
  approval: AppApprovalState;
}): CapabilityReport {
  const { scopes, approval } = input;
  const limitations: CapabilityLimitation[] = [];

  const basic = hasScope(scopes, TIKTOK_SCOPES.basic);
  const uploadScope = hasScope(scopes, TIKTOK_SCOPES.upload);
  const publishScope = hasScope(scopes, TIKTOK_SCOPES.publish);

  const capabilities: AccountCapabilities = {
    ...NO_CAPABILITIES,
    // Video is the only content type this connector implements.
    video: basic || uploadScope || publishScope,
    shortVideo: basic || uploadScope || publishScope,
    // SocialOrc schedules everything through its own queue.
    scheduling: true,
    draftUpload: uploadScope,
    directPublish: publishScope && approval.directPublish,
  };

  if (!basic) {
    limitations.push({
      capability: "video",
      code: "SCOPE_NOT_GRANTED",
      message: "TikTok did not grant user.info.basic, so the account cannot be identified.",
    });
  }

  if (!uploadScope) {
    limitations.push({
      capability: "draftUpload",
      code: "SCOPE_NOT_GRANTED",
      message: "video.upload was not granted, so sending a draft to TikTok is unavailable.",
    });
  }

  if (publishScope && !approval.directPublish) {
    limitations.push({
      capability: "directPublish",
      code: "APP_REVIEW_REQUIRED",
      message:
        "Direct publishing requires TikTok app approval. Until then TikTok only accepts private (SELF_ONLY) posts.",
    });
  } else if (!publishScope) {
    limitations.push({
      capability: "directPublish",
      code: "SCOPE_NOT_GRANTED",
      message: "video.publish was not granted, so posting directly to TikTok is unavailable.",
    });
  }

  limitations.push(
    {
      capability: "text",
      code: "NOT_SUPPORTED_BY_PLATFORM",
      message: "TikTok has no text-only post in its Content Posting API.",
    },
    {
      capability: "image",
      code: "NOT_IMPLEMENTED_YET",
      message: "TikTok's photo-post endpoint is not wired up in this connector yet.",
    },
    {
      capability: "carousel",
      code: "NOT_IMPLEMENTED_YET",
      message: "TikTok photo carousels are not wired up in this connector yet.",
    },
    {
      capability: "analytics",
      code: "NOT_IMPLEMENTED_YET",
      message: "TikTok analytics are not collected yet.",
    },
    {
      capability: "comments",
      code: "NOT_IMPLEMENTED_YET",
      message: "TikTok comment access is not implemented yet.",
    },
  );

  return { platform: "TIKTOK" as Platform, capabilities, limitations, scopes };
}

export function capabilitiesFor(
  platform: Platform,
  input: { scopes: string[]; accountType?: string | null; approval: AppApprovalState },
): CapabilityReport {
  switch (platform) {
    case "TIKTOK":
      return tiktokCapabilities({ scopes: input.scopes, approval: input.approval });
    default:
      // Every other platform is still on the legacy adapter contract, so an
      // empty report is the honest answer until its provider lands.
      return {
        platform,
        capabilities: { ...NO_CAPABILITIES },
        limitations: [
          {
            capability: "directPublish",
            code: "NOT_IMPLEMENTED_YET",
            message: `${platform} capabilities are not implemented yet.`,
          },
        ],
        scopes: input.scopes,
      };
  }
}

/**
 * Connection state for the UI. `connected` is only true when the account is
 * usable; a live token without the scope an action needs is reported as
 * `permission_missing`, and an unreviewed app as `review_required`.
 */
export function deriveConnectionStatus(input: {
  isActive: boolean;
  needsReconnect?: boolean | null;
  tokenExpiresAt?: Date | null;
  hasRefreshToken: boolean;
  scopes: string[];
  platform: Platform;
  requiredScopes?: readonly string[];
  now?: Date;
}): ConnectionStatus {
  if (!input.isActive) return "disconnected";
  if (input.needsReconnect) return "refresh_required";

  const required = input.requiredScopes ?? [];
  if (required.length > 0 && !hasAnyScope(input.scopes, required)) {
    return "permission_missing";
  }

  if (input.tokenExpiresAt) {
    const now = (input.now ?? new Date()).getTime();
    const expires = input.tokenExpiresAt.getTime();
    if (expires <= now) {
      return input.hasRefreshToken ? "refresh_required" : "expired";
    }
  }

  return "connected";
}

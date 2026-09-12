/**
 * Shared engagement route logic: account ownership, token refresh, capability
 * checks, and normalized error responses. Keeps each HTTP handler thin.
 */

import prisma from "@/lib/prisma";
import { getAdapter } from "@/lib/adapters";
import { decryptTokens, encryptTokens } from "@/lib/encryption";
import { needsTokenRefresh, canRefresh } from "@/lib/adapters/tokens";
import {
  classifyAdapterError,
  requiresReconnect,
  type AdapterErrorCode,
} from "@/lib/adapters/errors";
import {
  adapterDeclaresEngagementMethod,
  ENGAGEMENT_CAPABILITY_METHODS,
} from "@/lib/adapters/engagement-contract";
import {
  PLATFORM_CONFIGS,
  type PlatformAdapter,
  type PlatformCapabilities,
  type ReactionKind,
} from "@/types/platform";
import type { Platform, SocialAccount } from "@prisma/client";
import { SocialError, type SocialErrorCode } from "@/lib/social/errors";

export type EngagementOperation =
  | "listComments"
  | "createComment"
  | "replyToComment"
  | "deleteComment"
  | "reactToPost"
  | "unreactToPost"
  | "reactToComment"
  | "unreactToComment";

const OPERATION_CAPABILITY: Record<
  EngagementOperation,
  keyof typeof ENGAGEMENT_CAPABILITY_METHODS
> = {
  listComments: "readComments",
  createComment: "writeComments",
  replyToComment: "replyToComments",
  deleteComment: "deleteComments",
  reactToPost: "reactToPosts",
  unreactToPost: "reactToPosts",
  reactToComment: "reactToComments",
  unreactToComment: "reactToComments",
};

const ENGAGEMENT_NOTE_HINTS: Partial<
  Record<keyof typeof ENGAGEMENT_CAPABILITY_METHODS, RegExp>
> = {
  readComments: /comment/i,
  writeComments: /comment/i,
  replyToComments: /comment|repl/i,
  deleteComments: /comment|moderat/i,
  reactToPosts: /like|react|rating/i,
  reactToComments: /like|react/i,
};

export function engagementLimitationMessage(
  platform: Platform,
  capability: keyof typeof ENGAGEMENT_CAPABILITY_METHODS,
): string {
  const notes = PLATFORM_CONFIGS[platform].notes;
  const hint = ENGAGEMENT_NOTE_HINTS[capability];
  if (hint) {
    const match = notes.find((note) => hint.test(note));
    if (match) return match;
  }
  return `${PLATFORM_CONFIGS[platform].name} does not expose this engagement action through its public API.`;
}

export function engagementNotImplementedBody(
  platform: Platform,
  operation: EngagementOperation,
  extra?: { adapterMethodMissing?: boolean },
) {
  const capability = OPERATION_CAPABILITY[operation];
  const capabilityDeclared = PLATFORM_CONFIGS[platform].capabilities[capability];
  return {
    success: false as const,
    code: "ENGAGEMENT_NOT_SUPPORTED",
    operation,
    capability,
    platform,
    capabilityDeclared,
    adapterMethodMissing: extra?.adapterMethodMissing ?? false,
    message: engagementLimitationMessage(platform, capability),
  };
}

export function checkEngagementSupported(
  adapter: PlatformAdapter,
  platform: Platform,
  operation: EngagementOperation,
): { ok: true } | { ok: false; status: 501; body: ReturnType<typeof engagementNotImplementedBody> } {
  const capability = OPERATION_CAPABILITY[operation];
  const caps = PLATFORM_CONFIGS[platform].capabilities;

  if (!caps[capability]) {
    return {
      ok: false,
      status: 501,
      body: engagementNotImplementedBody(platform, operation),
    };
  }

  if (!adapterDeclaresEngagementMethod(adapter, operation)) {
    return {
      ok: false,
      status: 501,
      body: engagementNotImplementedBody(platform, operation, { adapterMethodMissing: true }),
    };
  }

  return { ok: true };
}

export async function loadOwnedAccount(userId: string, accountId: string) {
  return prisma.socialAccount.findFirst({
    where: { id: accountId, userId, isActive: true },
  });
}

export interface EngagementContext {
  account: SocialAccount;
  adapter: PlatformAdapter;
  accessToken: string;
}

/**
 * Resolve a connected account and a fresh access token, mirroring the publish worker.
 */
export async function prepareEngagementContext(
  account: SocialAccount,
): Promise<
  | { ok: true; ctx: EngagementContext }
  | { ok: false; status: number; body: Record<string, unknown> }
> {
  const adapter = getAdapter(account.platform, { useMockIfUnconfigured: true });
  const validation = adapter.validateCredentials();

  if (!validation.valid && process.env.MOCK_SOCIAL_ADAPTERS !== "true") {
    return {
      ok: false,
      status: 503,
      body: {
        error: `${account.platform} connector is not configured`,
        missing: validation.missing,
      },
    };
  }

  const stored = decryptTokens({
    accessToken: account.accessToken,
    refreshToken: account.refreshToken,
  });
  let accessToken = stored.accessToken;

  if (needsTokenRefresh(account.tokenExpiresAt)) {
    const refreshable = canRefresh(
      Boolean(stored.refreshToken),
      adapter.config.capabilities.refreshableTokens,
    );

    if (!refreshable) {
      await markAccountNeedsReconnect(
        account.id,
        "Stored access token is expired and this connector cannot refresh it",
        "AUTH_EXPIRED",
      );
      return {
        ok: false,
        status: 401,
        body: new SocialError({
          code: "SOCIAL_AUTH_EXPIRED",
          platform: account.platform,
          message: "The access token has expired. Reconnect the account.",
        }).toResponse(),
      };
    }

    try {
      const refreshed = await adapter.refreshAccessToken(stored.refreshToken as string);
      const encrypted = encryptTokens({
        accessToken: refreshed.accessToken,
        refreshToken: refreshed.refreshToken ?? stored.refreshToken,
      });
      await prisma.socialAccount.update({
        where: { id: account.id },
        data: {
          accessToken: encrypted.accessToken,
          refreshToken: encrypted.refreshToken,
          tokenExpiresAt: refreshed.expiresAt ?? null,
          lastSyncAt: new Date(),
        },
      });
      accessToken = refreshed.accessToken;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Token refresh failed";
      const code = classifyAdapterError({ message });
      if (requiresReconnect(code)) {
        await markAccountNeedsReconnect(account.id, message, code);
      }
      return {
        ok: false,
        status: 401,
        body: adapterFailureResponse(account.platform, message, code),
      };
    }
  }

  return { ok: true, ctx: { account, adapter, accessToken } };
}

export async function markAccountNeedsReconnect(
  accountId: string,
  error: string,
  code: AdapterErrorCode,
) {
  await prisma.socialAccount.update({
    where: { id: accountId },
    data: { needsReconnect: true, lastError: `${error} (${code})` },
  });
}

function adapterCodeToSocial(code: AdapterErrorCode): SocialErrorCode {
  switch (code) {
    case "AUTH_INVALID":
    case "AUTH_EXPIRED":
      return "SOCIAL_AUTH_EXPIRED";
    case "PERMISSION_DENIED":
      return "SOCIAL_PERMISSION_REQUIRED";
    case "NOT_FOUND":
      return "SOCIAL_ACCOUNT_UNAVAILABLE";
    case "RATE_LIMITED":
      return "SOCIAL_RATE_LIMITED";
    case "PLATFORM_UNAVAILABLE":
      return "SOCIAL_PROVIDER_UNAVAILABLE";
    default:
      return "SOCIAL_PUBLISH_FAILED";
  }
}

export function adapterFailureResponse(
  platform: Platform,
  message: string,
  code: AdapterErrorCode = classifyAdapterError({ message }),
) {
  const socialCode = adapterCodeToSocial(code);
  return new SocialError({
    code: socialCode,
    platform,
    message:
      code === "AUTH_EXPIRED" || code === "AUTH_INVALID"
        ? "The platform rejected the stored credentials. Reconnect the account."
        : message || "The platform rejected the engagement request.",
    technical: { adapterCode: code, message },
  }).toResponse();
}

export async function handleEngagementResultFailure(
  accountId: string,
  platform: Platform,
  error: string | undefined,
) {
  const message = error || "Engagement request failed";
  const code = classifyAdapterError({ message });
  if (requiresReconnect(code)) {
    await markAccountNeedsReconnect(accountId, message, code);
  }
  return adapterFailureResponse(platform, message, code);
}

const REACTION_KINDS: ReactionKind[] = [
  "like",
  "dislike",
  "love",
  "haha",
  "wow",
  "sad",
  "angry",
  "care",
];

export function parseReactionKind(value: unknown): ReactionKind | null {
  if (typeof value !== "string") return null;
  return REACTION_KINDS.includes(value as ReactionKind) ? (value as ReactionKind) : null;
}

export function engagementCapabilitiesForPlatform(
  platform: Platform,
  adapter: PlatformAdapter,
): Record<
  keyof typeof ENGAGEMENT_CAPABILITY_METHODS,
  { available: boolean; message?: string }
> {
  const caps = PLATFORM_CONFIGS[platform].capabilities;
  const result = {} as Record<
    keyof typeof ENGAGEMENT_CAPABILITY_METHODS,
    { available: boolean; message?: string }
  >;

  for (const capability of Object.keys(
    ENGAGEMENT_CAPABILITY_METHODS,
  ) as (keyof typeof ENGAGEMENT_CAPABILITY_METHODS)[]) {
    const flag = caps[capability];
    const methods = ENGAGEMENT_CAPABILITY_METHODS[capability];
    const declared = methods.every((m) => adapterDeclaresEngagementMethod(adapter, m));
    const available = flag && declared;
    result[capability] = available
      ? { available: true }
      : { available: false, message: engagementLimitationMessage(platform, capability) };
  }

  return result;
}

export type PlatformCapabilityFlags = Pick<
  PlatformCapabilities,
  keyof typeof ENGAGEMENT_CAPABILITY_METHODS
>;

import { Platform } from "@prisma/client";
import prisma from "@/lib/prisma";
import { workspaceIdForWrite } from "@/lib/tenancy/workspace";
import { encryptTokens } from "@/lib/encryption";
import { sanitizeAccountMetadata } from "@/lib/social/account-metadata";
import type { AccountInfo, OAuthTokens, PlatformAdapter } from "@/types/platform";

/**
 * Store a finished connection: the one write every OAuth path ends in.
 *
 * Moved out of `createOAuthCallback` unchanged so the Page/Instagram picker
 * (`/api/social/pending`) finishes a connection through exactly the same
 * ownership rule, sanitising and capability snapshot as the callback does.
 */
export async function persistConnectedAccount(input: {
  platform: Platform;
  userId: string;
  brainId: string;
  adapter: PlatformAdapter;
  tokens: OAuthTokens;
  info: AccountInfo;
}): Promise<{ ok: true; accountId: string } | { ok: false; reason: "account_owned_elsewhere" }> {
  const { platform, userId, brainId, adapter, tokens, info } = input;
  const encrypted = encryptTokens(tokens);

  // Capabilities and scopes are stored with the connection: "connected" and
  // "allowed to publish" are different facts and the UI needs both.
  const scopes = tokens.scope ?? null;
  const accountType =
    (info.metadata?.accountType as string | undefined) ?? null;
  let capabilities: object | undefined;
  if (adapter.getCapabilities) {
    try {
      const report = adapter.getCapabilities({
        scopes: scopes ? scopes.split(/[\s,]+/).filter(Boolean) : [],
        accountType,
      });
      capabilities = {
        capabilities: report.capabilities,
        limitations: report.limitations,
        computedAt: new Date().toISOString(),
      };
    } catch (error) {
      console.error(`${platform} capability computation failed:`, error instanceof Error ? error.message : error);
    }
  }

  const shared = {
    workspaceId: await workspaceIdForWrite(userId),
    userId,
    brainId,
    platformUserId: info.platformUserId,
    platformUsername: info.platformUsername,
    displayName: info.displayName,
    profileImageUrl: info.profileImageUrl,
    accessToken: encrypted.accessToken,
    refreshToken: encrypted.refreshToken,
    tokenExpiresAt: tokens.expiresAt ?? null,
    refreshTokenExpiresAt: tokens.refreshExpiresAt ?? null,
    // Connector metadata can carry a Page access token (legacy Facebook /
    // Instagram path). The credential that is used lives encrypted in
    // `accessToken`; plaintext copies are dropped rather than persisted.
    metadata: sanitizeAccountMetadata(info.metadata) as object | undefined,
    accountType,
    externalParentId: info.metadata?.externalParentId as string | undefined,
    scopes,
    capabilities,
    isActive: true,
    lastSyncAt: new Date(),
    disconnectedAt: null,
    // Re-connecting is the operator's answer to a reconnect prompt.
    needsReconnect: false,
    lastError: null,
  };

  // An existing connection belongs to the user who authorised it. The
  // unique key is (platform, platformUserId) across the whole database, so a
  // second tenant connecting the *same* platform account — a co-admin of the
  // same Facebook Page, the same brand YouTube channel — matched that row
  // and the `update` branch rewrote `userId`/`brainId`: the account changed
  // hands with no warning to either side. Refuse, and leave it where it is.
  const existingAccount = await prisma.socialAccount.findUnique({
    where: {
      platform_platformUserId: { platform, platformUserId: info.platformUserId },
    },
    select: { id: true, userId: true },
  });

  if (existingAccount && existingAccount.userId !== userId) {
    console.error(
      `${platform} OAuth callback refused: ${info.platformUserId} is already connected by another user`,
    );
    return { ok: false, reason: "account_owned_elsewhere" };
  }

  const account = await prisma.socialAccount.upsert({
    where: {
      platform_platformUserId: { platform, platformUserId: info.platformUserId },
    },
    create: { platform, ...shared },
    // `userId` is deliberately not part of the update: ownership is decided
    // on create and a later connect may never rewrite it.
    update: { ...shared, userId: undefined },
  });

  return { ok: true, accountId: account.id };
}

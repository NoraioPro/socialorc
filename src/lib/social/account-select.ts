import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";

/**
 * Shared "safe" shapes for social accounts.
 *
 * `include: { socialAccount: true }` returns the whole row — including the
 * encrypted `accessToken` / `refreshToken` and the platform `metadata` — and
 * several routes hand that straight to `NextResponse.json()`, so the ciphertext
 * (and, on Facebook/Instagram, plaintext page tokens) reached the browser. Every
 * response-shaped query must select from here instead.
 *
 * Server-only paths that genuinely need the credentials (the publish route and
 * the cron worker) keep the full row and must strip it before responding.
 */
export const PUBLIC_SOCIAL_ACCOUNT_SELECT: Prisma.SocialAccountSelect = {
  id: true,
  platform: true,
  platformUserId: true,
  platformUsername: true,
  displayName: true,
  profileImageUrl: true,
  accountType: true,
  externalParentId: true,
  scopes: true,
  capabilities: true,
  isActive: true,
  tokenExpiresAt: true,
  refreshTokenExpiresAt: true,
  lastSyncAt: true,
  lastError: true,
  needsReconnect: true,
  createdAt: true,
  updatedAt: true,
};

/** Post relations as they may be serialised to a client. */
export const POST_SAFE_INCLUDE: Prisma.PostInclude = {
  socialAccount: { select: PUBLIC_SOCIAL_ACCOUNT_SELECT },
  mediaAssets: {
    include: { mediaAsset: true },
    orderBy: { order: "asc" },
  },
};

/** Post relations as they may be serialised to a client, plus who wrote it. */
export const POST_SAFE_INCLUDE_WITH_AUTHOR: Prisma.PostInclude = {
  ...POST_SAFE_INCLUDE,
  user: { select: { id: true, name: true } },
};

/**
 * Tenancy gates. A row id supplied by the client is never trusted: the account
 * (or the media asset) must belong to the caller's **workspace** before it can be
 * referenced, or the request is refused. Without this, `socialAccountId` on a
 * post was a capability handle — quoting another tenant's id let you publish
 * through their account, and attaching their asset leaked its URL. Teammates in
 * one workspace share accounts and media, so membership is the test, not
 * authorship. `workspaceId` comes from `requireWorkspace()`, never the request.
 */
export async function findWorkspaceSocialAccount(workspaceId: string, socialAccountId: string) {
  return prisma.socialAccount.findFirst({
    where: { id: socialAccountId, workspaceId },
    select: { id: true },
  });
}

/** Returns the subset of `ids` that are NOT in the workspace (empty = all fine). */
export async function foreignMediaAssetIds(workspaceId: string, ids: string[]): Promise<string[]> {
  if (ids.length === 0) return [];
  const owned = await prisma.mediaAsset.findMany({
    where: { id: { in: ids }, workspaceId },
    select: { id: true },
  });
  const ownedSet = new Set(owned.map((asset) => asset.id));
  return ids.filter((id) => !ownedSet.has(id));
}

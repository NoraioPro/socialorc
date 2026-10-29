import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/tenancy/guard";
import prisma from "@/lib/prisma";
import { Platform, PostStatus, JobStatus } from "@prisma/client";
import { getAdapterStatus, getAdapter } from "@/lib/adapters";
import { decrypt } from "@/lib/encryption";
import { attemptRemoteRevocation, type RemoteRevocation, type Revoker } from "@/lib/adapters/revoke";
import { PLATFORM_CONFIGS, type PlatformAdapter } from "@/types/platform";
import { resolveBrainForWorkspace } from "@/lib/brains";
import { getTokenStatus, formatExpiryTime } from "@/lib/adapters/tokens";

export async function GET(req: NextRequest) {
  try {
    const tenant = await requireWorkspace("dashboard:view");
    if (!tenant.ok) {
      return NextResponse.json({ error: tenant.error }, { status: tenant.status });
    }

    const { searchParams } = new URL(req.url);
    const platform = searchParams.get("platform")?.toUpperCase() as Platform | undefined;
    const brain = await resolveBrainForWorkspace(tenant, searchParams.get("brainId"));

    const where: { brainId: string; workspaceId: string; platform?: Platform } = {
      brainId: brain.id,
      workspaceId: tenant.workspaceId,
    };
    if (platform && Object.values(Platform).includes(platform)) {
      where.platform = platform;
    }

    const rawAccounts = await prisma.socialAccount.findMany({
      where,
      select: {
        id: true,
        platform: true,
        platformUserId: true,
        platformUsername: true,
        displayName: true,
        profileImageUrl: true,
        isActive: true,
        tokenExpiresAt: true,
        refreshToken: true,
        lastSyncAt: true,
        lastError: true,
        needsReconnect: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const now = new Date();
    const adapterStatus = getAdapterStatus();

    const accounts = rawAccounts.map((account) => {
      const config = PLATFORM_CONFIGS[account.platform];
      const tokenStatus = getTokenStatus(
        account.tokenExpiresAt,
        Boolean(account.refreshToken),
        config.capabilities.refreshableTokens,
        account.needsReconnect,
        now,
      );

      return {
        id: account.id,
        platform: account.platform,
        platformUserId: account.platformUserId,
        platformUsername: account.platformUsername,
        displayName: account.displayName,
        profileImageUrl: account.profileImageUrl,
        isActive: account.isActive,
        tokenExpiresAt: account.tokenExpiresAt?.toISOString() ?? null,
        lastSyncAt: account.lastSyncAt?.toISOString() ?? null,
        lastError: account.lastError,
        needsReconnect: account.needsReconnect,
        createdAt: account.createdAt.toISOString(),
        updatedAt: account.updatedAt.toISOString(),
        tokenStatus: {
          status: tokenStatus.status,
          expiresInMs: tokenStatus.expiresInMs,
          expiresInHuman: formatExpiryTime(tokenStatus.expiresInMs),
          needsRefresh: tokenStatus.needsRefresh,
          canAutoRefresh: tokenStatus.canAutoRefresh,
          requiresReconnect: tokenStatus.requiresReconnect,
        },
      };
    });

    const platformStatus = Object.values(Platform).map((p) => ({
      platform: p,
      config: PLATFORM_CONFIGS[p],
      configured: adapterStatus[p].configured,
      missingCredentials: adapterStatus[p].missing,
      connected: accounts.some((a) => a.platform === p && a.isActive),
      accounts: accounts.filter((a) => a.platform === p),
    }));

    return NextResponse.json({
      accounts,
      platformStatus,
      brain: { id: brain.id, name: brain.name },
    });
  } catch (error) {
    console.error("Error fetching accounts:", error);
    return NextResponse.json(
      { error: "Failed to fetch accounts" },
      { status: 500 }
    );
  }
}

export async function DELETE(req: NextRequest) {
  try {
    // Connecting and disconnecting are the same trust decision, and
    // `accounts:connect` existed in the role matrix but was enforced nowhere —
    // so any signed-in account, including a read-only CLIENT, could disconnect
    // a workspace's connection.
    const guard = await requireWorkspace("accounts:connect");
    if (!guard.ok) {
      return NextResponse.json({ error: guard.error }, { status: guard.status });
    }

    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get("id");

    if (!accountId) {
      return NextResponse.json(
        { error: "Account ID required" },
        { status: 400 }
      );
    }

    const account = await prisma.socialAccount.findFirst({
      where: { id: accountId, workspaceId: guard.workspaceId },
      include: { posts: { select: { id: true, status: true } } },
    });

    if (!account) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    // Read the tokens first, in memory only: once the row is gone they are the
    // only copy, and the provider call below needs them.
    let tokens: { accessToken: string | null; refreshToken: string | null } = {
      accessToken: null,
      refreshToken: null,
    };
    try {
      tokens = {
        accessToken: account.accessToken ? decrypt(account.accessToken) : null,
        refreshToken: account.refreshToken ? decrypt(account.refreshToken) : null,
      };
    } catch {
      // Unreadable ciphertext: nothing to revoke remotely, the local disconnect still proceeds.
    }

    // The disconnect takes effect inside SocialOrc first, in one transaction,
    // and does not depend on the provider: pending jobs are cancelled (the worker
    // would otherwise dead-letter a post the user believes they cancelled),
    // scheduled posts return to APPROVED (the content is the user's, so it survives
    // and can be pointed at another account) and the connection row, with its
    // stored tokens, is deleted. From this point no publish, refresh or
    // engagement call can use the account, whatever happens remotely.
    const postIds = account.posts.map((post) => post.id);
    const [cancelledJobs, releasedPosts] = await prisma.$transaction(async (tx) => {
      const jobs = postIds.length
        ? await tx.scheduledJob.deleteMany({
            where: {
              postId: { in: postIds },
              status: { in: [JobStatus.PENDING, JobStatus.PROCESSING] },
            },
          })
        : { count: 0 };
      const released = postIds.length
        ? await tx.post.updateMany({
            where: { id: { in: postIds }, status: PostStatus.SCHEDULED },
            data: { status: PostStatus.APPROVED, scheduledFor: null },
          })
        : { count: 0 };
      await tx.socialAccount.delete({ where: { id: accountId } });
      return [jobs, released] as const;
    });

    // Then revoke at the provider, best effort, and say honestly what happened.
    // Only platforms with a documented revocation endpoint have one (TikTok, X,
    // YouTube); LinkedIn does not, so its tokens simply expire at the provider.
    let remoteRevocation: RemoteRevocation;
    try {
      const adapter = getAdapter(account.platform) as PlatformAdapter & {
        revokeAccess?: Revoker;
      };
      remoteRevocation = await attemptRemoteRevocation(
        typeof adapter.revokeAccess === "function" ? adapter.revokeAccess.bind(adapter) : undefined,
        tokens,
      );
    } catch {
      // No adapter (the platform's app credentials were removed from the
      // deployment): the local disconnect already happened and nothing can be
      // revoked remotely.
      remoteRevocation = "failed";
    }

    return NextResponse.json({
      success: true,
      remoteRevocation,
      // Kept for existing callers: true only when the provider confirmed it.
      revokedAtPlatform: remoteRevocation === "revoked",
      cancelledJobs: cancelledJobs.count,
      releasedPosts: releasedPosts.count,
    });
  } catch (error) {
    console.error("Error disconnecting account:", error);
    return NextResponse.json(
      { error: "Failed to disconnect account" },
      { status: 500 }
    );
  }
}

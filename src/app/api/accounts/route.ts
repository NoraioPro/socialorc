import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Platform } from "@prisma/client";
import { getAdapterStatus } from "@/lib/adapters";
import { PLATFORM_CONFIGS } from "@/types/platform";
import { getTokenStatus, formatExpiryTime } from "@/lib/adapters/tokens";

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const platform = searchParams.get("platform")?.toUpperCase() as Platform | undefined;

    const where: { userId: string; platform?: Platform } = { userId: session.user.id };
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
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
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
      where: { id: accountId, userId: session.user.id },
    });

    if (!account) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    await prisma.socialAccount.delete({ where: { id: accountId } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error disconnecting account:", error);
    return NextResponse.json(
      { error: "Failed to disconnect account" },
      { status: 500 }
    );
  }
}

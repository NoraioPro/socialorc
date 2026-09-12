import { NextRequest, NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { Platform, PostStatus, JobStatus } from "@prisma/client";
import { getAdapterStatus, getAdapter } from "@/lib/adapters";
import { decrypt } from "@/lib/encryption";
import { PLATFORM_CONFIGS, type PlatformAdapter } from "@/types/platform";
import { resolveBrainForUser } from "@/lib/brains";

export async function GET(req: NextRequest) {
  try {
    const session = await getAuthSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const platform = searchParams.get("platform")?.toUpperCase() as Platform | undefined;
    const brain = await resolveBrainForUser(session.user.id, searchParams.get("brainId"));

    const where: { brainId: string; platform?: Platform } = { brainId: brain.id };
    if (platform && Object.values(Platform).includes(platform)) {
      where.platform = platform;
    }

    const accounts = await prisma.socialAccount.findMany({
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
        lastSyncAt: true,
        createdAt: true,
        updatedAt: true,
      },
      orderBy: { createdAt: "desc" },
    });

    const adapterStatus = getAdapterStatus();

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
      include: { posts: { select: { id: true, status: true } } },
    });

    if (!account) {
      return NextResponse.json(
        { error: "Account not found" },
        { status: 404 }
      );
    }

    // Disconnecting has to stop future publishing, not just drop the row:
    // otherwise the cron worker keeps a PENDING job whose account no longer
    // exists and dead-letters a post the user believes they cancelled.
    const postIds = account.posts.map((post) => post.id);
    const cancelledJobs = postIds.length
      ? await prisma.scheduledJob.deleteMany({
          where: {
            postId: { in: postIds },
            status: { in: [JobStatus.PENDING, JobStatus.PROCESSING] },
          },
        })
      : { count: 0 };

    // Content is the user's, so it survives: scheduled posts return to APPROVED
    // and can be pointed at another account instead of vanishing.
    const releasedPosts = postIds.length
      ? await prisma.post.updateMany({
          where: { id: { in: postIds }, status: PostStatus.SCHEDULED },
          data: { status: PostStatus.APPROVED, scheduledFor: null },
        })
      : { count: 0 };

    // Best-effort revocation at the platform. A provider outage must not leave
    // the user unable to disconnect, so this is logged rather than thrown.
    let revokedAtPlatform = false;
    try {
      const adapter = getAdapter(account.platform) as PlatformAdapter & {
        revokeAccess?: (accessToken: string) => Promise<void>;
      };
      if (typeof adapter.revokeAccess === "function") {
        await adapter.revokeAccess(decrypt(account.accessToken));
        revokedAtPlatform = true;
      }
    } catch (error) {
      console.error(
        `Disconnect: ${account.platform} revocation failed for account ${account.id}:`,
        error instanceof Error ? error.message : error
      );
    }

    await prisma.socialAccount.delete({ where: { id: accountId } });

    return NextResponse.json({
      success: true,
      revokedAtPlatform,
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

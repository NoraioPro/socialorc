import { NextRequest, NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { PostStatus } from "@prisma/client";
import { getAdapter } from "@/lib/adapters";
import { decryptTokens, encryptTokens } from "@/lib/encryption";
import { needsTokenRefresh, canRefresh } from "@/lib/adapters/tokens";
import { classifyAdapterError, requiresReconnect } from "@/lib/adapters/errors";

/**
 * Publish one post immediately, in the request.
 *
 * The cron worker owns *scheduled* publishing; this owns "post it now". They
 * share the token handling (refresh before send, one refresh-and-retry when the
 * platform reports a stale token) but not the queue: an immediate publish has a
 * human waiting on the answer, so it reports the platform's error straight back
 * instead of backing off and retrying later.
 *
 * A post carrying a platformPostId is never sent twice — the same idempotency
 * rule the worker holds, so a double-click cannot double-post.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requirePermission("posts:schedule");
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { id } = await params;

  const post = await prisma.post.findFirst({
    where: { id, userId: guard.userId },
    include: { socialAccount: true },
  });

  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  if (post.platformPostId) {
    return NextResponse.json(
      { error: "This post has already been published", platformPostUrl: post.platformPostUrl },
      { status: 409 }
    );
  }

  if (post.status === PostStatus.PUBLISHING) {
    return NextResponse.json({ error: "This post is already being published" }, { status: 409 });
  }

  // An unlinked post has nothing to publish to. Fall back to the user's active
  // account for the platform rather than refusing: the create form does not
  // always carry the choice, and there is exactly one account per platform.
  let account = post.socialAccount;
  if (!account) {
    account = await prisma.socialAccount.findFirst({
      where: { userId: guard.userId, platform: post.platform, isActive: true },
    });
    if (!account) {
      return NextResponse.json(
        { error: `No connected ${post.platform} account. Connect one in Settings first.` },
        { status: 400 }
      );
    }
    await prisma.post.update({ where: { id: post.id }, data: { socialAccountId: account.id } });
  }

  if (account.needsReconnect) {
    return NextResponse.json(
      { error: `Your ${post.platform} connection expired. Reconnect it in Settings.`, code: "RECONNECT_REQUIRED" },
      { status: 409 }
    );
  }

  const adapter = getAdapter(post.platform, { useMockIfUnconfigured: true });
  const stored = decryptTokens({
    accessToken: account.accessToken,
    refreshToken: account.refreshToken,
  });
  let accessToken = stored.accessToken;

  const refreshAndStore = async () => {
    const refreshed = await adapter.refreshAccessToken(stored.refreshToken as string);
    const encrypted = encryptTokens({
      accessToken: refreshed.accessToken,
      refreshToken: refreshed.refreshToken ?? stored.refreshToken,
    });
    await prisma.socialAccount.update({
      where: { id: account!.id },
      data: {
        accessToken: encrypted.accessToken,
        refreshToken: encrypted.refreshToken,
        tokenExpiresAt: refreshed.expiresAt ?? null,
        lastSyncAt: new Date(),
      },
    });
    return refreshed.accessToken;
  };

  const refreshable = canRefresh(
    Boolean(stored.refreshToken),
    adapter.config.capabilities.refreshableTokens
  );

  if (needsTokenRefresh(account.tokenExpiresAt)) {
    if (!refreshable) {
      await prisma.socialAccount.update({
        where: { id: account.id },
        data: { needsReconnect: true },
      });
      return NextResponse.json(
        { error: `Your ${post.platform} token expired and cannot be refreshed. Reconnect it in Settings.`, code: "RECONNECT_REQUIRED" },
        { status: 409 }
      );
    }
    try {
      accessToken = await refreshAndStore();
    } catch (error) {
      return NextResponse.json(
        { error: `Token refresh failed: ${error instanceof Error ? error.message : "unknown error"}` },
        { status: 502 }
      );
    }
  }

  await prisma.post.update({
    where: { id: post.id },
    data: { status: PostStatus.PUBLISHING },
  });

  const media = await prisma.postMedia.findMany({
    where: { postId: post.id },
    include: { mediaAsset: true },
    orderBy: { order: "asc" },
  });

  const sendOptions = {
    text: post.content,
    mediaUrls: media.map((m) => m.mediaAsset.url),
  };

  let result = await adapter.createPost(accessToken, sendOptions);

  if (!result.success && classifyAdapterError({ message: result.error }) === "AUTH_EXPIRED" && refreshable) {
    try {
      accessToken = await refreshAndStore();
      result = await adapter.createPost(accessToken, sendOptions);
    } catch {
      // Keep the original failure: the refresh error is not the useful one.
    }
  }

  if (result.success) {
    const published = await prisma.post.update({
      where: { id: post.id },
      data: {
        status: PostStatus.PUBLISHED,
        publishedAt: new Date(),
        platformPostId: result.platformPostId ?? null,
        platformPostUrl: result.platformPostUrl ?? null,
        errorMessage: null,
      },
    });

    return NextResponse.json({
      success: true,
      post: published,
      platformPostUrl: published.platformPostUrl,
    });
  }

  const code = classifyAdapterError({ message: result.error });

  await prisma.$transaction([
    prisma.post.update({
      where: { id: post.id },
      data: { status: PostStatus.FAILED, errorMessage: result.error ?? "Publishing failed" },
    }),
    ...(requiresReconnect(code)
      ? [prisma.socialAccount.update({ where: { id: account.id }, data: { needsReconnect: true } })]
      : []),
  ]);

  return NextResponse.json(
    { success: false, error: result.error ?? "Publishing failed", code },
    { status: 502 }
  );
}

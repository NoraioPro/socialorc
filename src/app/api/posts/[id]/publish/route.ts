import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/tenancy/guard";
import prisma from "@/lib/prisma";
import { PostStatus } from "@prisma/client";
import { resolvePublishAdapter } from "@/lib/adapters";
import { destinationForAccount } from "@/lib/adapters/destination";
import { decryptTokens, encryptTokens } from "@/lib/encryption";
import { needsTokenRefresh, canRefresh } from "@/lib/adapters/tokens";
import { classifyAdapterError, requiresReconnect, type AdapterErrorCode } from "@/lib/adapters/errors";
import {
  publishBlockCode,
  publishBlockMessage,
  publishBlockReason,
  publishBlockStatus,
} from "@/lib/posts/publish-gate";
import { handOffPendingPublish } from "@/lib/jobs/pending-publish";

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
/**
 * Vercel function ceiling for an immediate publish. A literal, because Next
 * reads segment config statically. 60s is what every Vercel plan allows; a Pro
 * plan can raise it. Unlike the worker this route has a human waiting, so a
 * timeout is reported as a failure rather than retried later.
 */
export const maxDuration = 60;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const guard = await requireWorkspace("posts:schedule");
  if (!guard.ok) {
    return NextResponse.json({ error: guard.error }, { status: guard.status });
  }

  const { id } = await params;

  const post = await prisma.post.findFirst({
    where: { id, workspaceId: guard.workspaceId },
    include: { socialAccount: true },
  });

  if (!post) {
    return NextResponse.json({ error: "Post not found" }, { status: 404 });
  }

  // The approval gate comes first: "publish now" is still a publish, so an
  // unapproved post must be refused here exactly as scheduling refuses it. This
  // route previously checked only `platformPostId`, so a DRAFT could be pushed
  // live with one click from the post card.
  const block = publishBlockReason({
    status: post.status,
    approvedAt: post.approvedAt,
    platformPostId: post.platformPostId,
  });
  if (block) {
    return NextResponse.json(
      {
        error: publishBlockMessage(block),
        code: publishBlockCode(block),
        ...(block === "already_published" ? { platformPostUrl: post.platformPostUrl } : {}),
      },
      { status: publishBlockStatus(block) }
    );
  }

  // An unlinked post has nothing to publish to. Fall back to the workspace's active
  // account for the platform rather than refusing: the create form does not
  // always carry the choice, and there is exactly one account per platform.
  let account = post.socialAccount;
  if (!account) {
    account = await prisma.socialAccount.findFirst({
      where: { workspaceId: guard.workspaceId, platform: post.platform, isActive: true },
    });
    if (!account) {
      return NextResponse.json(
        { error: `No connected ${post.platform} account. Connect one in Settings first.` },
        { status: 400 }
      );
    }
    await prisma.post.update({ where: { id: post.id }, data: { socialAccountId: account.id } });
  }

  // The linked account must belong to the caller's workspace. The post's own
  // tenancy was checked above, but `socialAccountId` is a separate row: before
  // this check, pointing a post at another tenant's account id decrypted
  // *their* token and published through their profile.
  if (account.workspaceId !== guard.workspaceId) {
    return NextResponse.json({ error: "Social account not found" }, { status: 404 });
  }

  if (account.needsReconnect) {
    return NextResponse.json(
      { error: `Your ${post.platform} connection expired. Reconnect it in Settings.`, code: "RECONNECT_REQUIRED" },
      { status: 409 }
    );
  }

  // Resolve the adapter allowed to publish. This can never hand back a mock in
  // production, so a platform with no credentials fails here instead of
  // returning a fake success and marking the post PUBLISHED.
  const resolution = resolvePublishAdapter(post.platform);
  if (!resolution.ok) {
    return NextResponse.json(
      {
        success: false,
        error: resolution.message,
        code: resolution.code,
        missing: resolution.missing,
      },
      { status: 503 }
    );
  }
  const adapter = resolution.adapter;
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

  // Claim the post atomically. A read-then-write let a double-click, or an edit
  // landing between the checks above and this line, send content that was no
  // longer approved; the loser of the race sends nothing at all.
  const claim = await prisma.post.updateMany({
    where: {
      id: post.id,
      workspaceId: guard.workspaceId,
      status: { in: [PostStatus.APPROVED, PostStatus.SCHEDULED] },
    },
    data: { status: PostStatus.PUBLISHING },
  });
  if (claim.count === 0) {
    return NextResponse.json(
      { error: "This post is no longer approved for publishing", code: "PUBLISH_CONFLICT" },
      { status: 409 }
    );
  }

  const media = await prisma.postMedia.findMany({
    where: { postId: post.id },
    include: { mediaAsset: true },
    orderBy: { order: "asc" },
  });

  const sendOptions = {
    text: post.content,
    // Resume an async upload (Instagram Reels, X video) left processing by an
    // earlier attempt — see src/lib/adapters/in-flight-media.ts.
    idempotencyKey: post.id,
    mediaUrls: media.map((m) => m.mediaAsset.url),
    // Real MIME type and byte size, so validation never has to guess from the
    // URL — guessing is what let `data:` URLs and unsupported types slip past.
    media: media.map((m) => ({
      url: m.mediaAsset.url,
      mimeType: m.mediaAsset.mimeType,
      sizeBytes: m.mediaAsset.size,
    })),
    // Same addressing the worker sends: Telegram publishes into the account's
    // own chat, and without it every "Publish now" failed with MISSING_CHAT.
    additionalOptions: {
      ...destinationForAccount(account.metadata),
      ...(account.platformUsername ? { accountUsername: account.platformUsername } : {}),
    },
  };

  let result: Awaited<ReturnType<typeof adapter.createPost>>;
  try {
    result = await adapter.createPost(accessToken, sendOptions);
  } catch (error) {
    // A thrown adapter call used to escape this route entirely, leaving the post
    // in PUBLISHING with no job to reclaim it — uneditable, undeletable and
    // unpublishable. Close it as FAILED with the reason instead: the retry path
    // (FAILED plus approvedAt) can then re-queue it deliberately.
    await prisma.post.update({
      where: { id: post.id },
      data: {
        status: PostStatus.FAILED,
        errorMessage: `Publishing failed before the platform confirmed: ${
          error instanceof Error ? error.message : "unknown error"
        }`,
      },
    });
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Publishing failed",
        code: "PUBLISH_THREW",
      },
      { status: 502 }
    );
  }

  /** Prefer the adapter's own code; fall back to classifying its message. */
  const failureCodeOf = (r: typeof result): AdapterErrorCode =>
    (r.code as AdapterErrorCode | undefined) ?? classifyAdapterError({ message: r.error });

  if (!result.success && failureCodeOf(result) === "AUTH_EXPIRED" && refreshable) {
    try {
      accessToken = await refreshAndStore();
      result = await adapter.createPost(accessToken, sendOptions);
    } catch {
      // Keep the original failure: the refresh error is not the useful one.
    }
  }

  // Accepted but still processing (TikTok): not published yet, and must not be
  // sent again. The worker polls the platform for the verdict; the post stays
  // PUBLISHING until then.
  if (result.success && result.pending && result.platformPostId) {
    await handOffPendingPublish(prisma, {
      postId: post.id,
      workspaceId: post.workspaceId ?? null,
      publishId: result.platformPostId,
    });
    return NextResponse.json(
      {
        success: true,
        pending: true,
        message: `${post.platform} accepted the post and is still processing it. It will show as published once the platform confirms.`,
      },
      { status: 202 }
    );
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

  const code = failureCodeOf(result);

  await prisma.$transaction([
    prisma.post.update({
      where: { id: post.id },
      data: { status: PostStatus.FAILED, errorMessage: result.error ?? "Publishing failed" },
    }),
    ...(requiresReconnect(code)
      ? [prisma.socialAccount.update({ where: { id: account.id }, data: { needsReconnect: true } })]
      : []),
  ]);

  // The content was the problem, not the platform — 422 tells the client to fix
  // the post instead of retrying it.
  const contentProblem =
    code === "UNSUPPORTED_MEDIA" || code === "MEDIA_INVALID" || code === "CONTENT_INVALID";

  return NextResponse.json(
    { success: false, error: result.error ?? "Publishing failed", code },
    { status: contentProblem ? 422 : 502 }
  );
}

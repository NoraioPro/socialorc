import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { PostStatus, JobStatus } from "@prisma/client";
import { resolvePublishAdapter } from "@/lib/adapters";
import { destinationForAccount } from "@/lib/adapters/destination";
import { recoverStaleProcessingJobs } from "@/lib/jobs/lease-recovery";
import { isAuthorizedCronRequest } from "@/lib/cron-auth";
import { decryptTokens, encryptTokens } from "@/lib/encryption";
import { needsTokenRefresh, canRefresh } from "@/lib/adapters/tokens";
import {
  classifyAdapterError,
  describeAdapterError,
  isRetryable,
  requiresReconnect,
  type AdapterErrorCode,
} from "@/lib/adapters/errors";
import {
  ACCOUNT_PLATFORM_MISMATCH_CODE,
  accountPlatformMismatch,
  accountPlatformMismatchMessage,
  jobClaimWhere,
  publishClaimWhere,
} from "@/lib/posts/transitions";
import {
  CLEARED_PENDING_PUBLISH,
  PENDING_TIMEOUT_MESSAGE,
  pendingExpired,
  pendingPollJobData,
} from "@/lib/jobs/pending-publish";
import type { PostResult } from "@/types/platform";

/**
 * Publishing worker (Vercel cron: every 5 minutes, see vercel.json).
 *
 * Guarantees this route must hold:
 *  1. Only SCHEDULED posts are ever published (the approval gate upstream).
 *  2. A retry is never immediate: failures back off exponentially, so a platform
 *     outage cannot hot-loop the worker.
 *  3. Publishing is idempotent: a post that already carries a platformPostId is
 *     never sent again, even if the previous run crashed after the send.
 *  4. Exhausted jobs dead-letter (FAILED) with the platform's error preserved.
 */

const MAX_ATTEMPTS = 3;
const BACKOFF_BASE_MS = 30_000; // 30s, then 1m, then dead-letter
const BACKOFF_CAP_MS = 15 * 60_000;

function backoffMs(attempts: number): number {
  const raw = BACKOFF_BASE_MS * Math.pow(2, Math.max(0, attempts - 1));
  return Math.min(raw, BACKOFF_CAP_MS);
}

/**
 * Vercel function ceiling for this route, and the point the worker stops taking
 * on new work. A literal, because Next reads segment config statically.
 *
 * This is 60s because that is what every Vercel plan allows; raising it to 300
 * is a one-line change and needs a Pro plan (Vercel refuses a larger value on
 * Hobby, which would break the deploy). Whatever it is, it must stay well below
 * `PROCESSING_LEASE_MS`: a function killed mid-send leaves the platform's answer
 * unknown, and the reclaim only happens after the lease expires.
 */
export const maxDuration = 60;

/** Stop claiming jobs this long before the function is cut off: a send started
 *  with no time left is exactly the state that produces an unknown outcome. */
const WORKER_TIME_BUDGET_MS = (maxDuration - 15) * 1000;

export async function GET(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers.get("authorization"), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const startedAt = Date.now();
  const results: {
    processed: number;
    published: number;
    retried: number;
    deduped: number;
    failed: number;
    /** Failures that were never retried because the error is permanent. */
    permanent: number;
    /** Stale PROCESSING jobs whose run died with retries left (failed, not retried). */
    deadRuns: number;
    /** Stale PROCESSING jobs whose retry budget was already spent. */
    abandoned: number;
    /** Posts pulled out of PUBLISHING and closed as FAILED with an unknown outcome. */
    released: number;
    /** Due jobs left unclaimed because this invocation ran out of time budget. */
    deferred: number;
    /** Sends the platform accepted but is still processing; polled next tick. */
    pending: number;
    errors: { postId: string; error: string; code?: AdapterErrorCode }[];
  } = {
    processed: 0,
    published: 0,
    retried: 0,
    deduped: 0,
    failed: 0,
    permanent: 0,
    deadRuns: 0,
    abandoned: 0,
    released: 0,
    deferred: 0,
    pending: 0,
    errors: [],
  };

  try {
    // --- Lease recovery -----------------------------------------------------
    // Return any job orphaned in PROCESSING by a stopped process to the queue,
    // so a deploy or crash mid-publish does not leave a post stuck in
    // PUBLISHING forever. See src/lib/jobs/lease-recovery.ts for why this
    // cannot double-publish.
    const recovery = await recoverStaleProcessingJobs(prisma, now, MAX_ATTEMPTS);
    results.deadRuns = recovery.deadRuns;
    results.abandoned = recovery.abandoned;
    results.released = recovery.released;

    if (recovery.deadRuns > 0 || recovery.abandoned > 0) {
      console.log(
        `[cron] lease recovery: deadRuns=${recovery.deadRuns} abandoned=${recovery.abandoned} released=${recovery.released}`
      );
    }

    const dueJobs = await prisma.scheduledJob.findMany({
      where: {
        status: JobStatus.PENDING,
        scheduledAt: { lte: now },
        // A pending publish is a status poll, not a send: it is due regardless
        // of the retry budget the send itself used.
        OR: [{ attempts: { lt: MAX_ATTEMPTS } }, { pendingPublishId: { not: null } }],
      },
      orderBy: { scheduledAt: "asc" }, // oldest first, so nothing starves
      take: 10,
    });

    for (const job of dueJobs) {
      // Time budget, checked before claiming: a job claimed with too little time
      // left is a send that gets cut off mid-flight, and this route cannot know
      // whether the platform accepted it. Unclaimed jobs stay PENDING and the
      // next tick picks them up, so deferring loses nothing.
      if (Date.now() - startedAt > WORKER_TIME_BUDGET_MS) {
        results.deferred += 1;
        continue;
      }

      try {
        // Atomic claim. The unconditional update this replaces let two
        // overlapping cron invocations (Vercel can overlap a 5-minute schedule)
        // both read the same PENDING job, both move it to PROCESSING, and both
        // publish the post. Only the run that actually wins the
        // PENDING -> PROCESSING transition owns the job; the loser skips it.
        const claim = await prisma.scheduledJob.updateMany({
          where: jobClaimWhere(job.id, now),
          data: {
            status: JobStatus.PROCESSING,
            startedAt: new Date(),
            attempts: { increment: 1 },
          },
        });

        if (claim.count === 0) {
          console.log(`[cron] job ${job.id} claimed by another run, skipping`);
          continue;
        }

        results.processed++;

        const attempt = job.attempts + 1;

        // Set when an earlier run handed the post to the platform and it was
        // still processing. This run then only asks for the outcome — it must
        // never send again, or a slow platform becomes a duplicate post.
        const resumePublishId = job.pendingPublishId;

        const post = await prisma.post.findUnique({
          where: { id: job.postId },
          include: { socialAccount: true },
        });

        if (!post) {
          await prisma.scheduledJob.update({
            where: { id: job.id },
            data: {
              status: JobStatus.FAILED,
              completedAt: new Date(),
              errorMessage: "Post not found",
            },
          });
          results.failed++;
          results.errors.push({ postId: job.postId, error: "Post not found" });
          continue;
        }

        // Idempotency: already published elsewhere/earlier -> complete the job
        // without touching the platform again.
        if (post.platformPostId) {
          await prisma.scheduledJob.update({
            where: { id: job.id },
            data: {
              status: JobStatus.COMPLETED,
              completedAt: new Date(),
              errorMessage: null,
            },
          });
          results.deduped++;
          continue;
        }

        const expectedStatus = resumePublishId ? PostStatus.PUBLISHING : PostStatus.SCHEDULED;
        if (post.status !== expectedStatus) {
          await prisma.scheduledJob.update({
            where: { id: job.id },
            data: {
              status: JobStatus.FAILED,
              completedAt: new Date(),
              errorMessage: `Invalid post status: ${post.status}`,
            },
          });
          results.failed++;
          results.errors.push({ postId: job.postId, error: `Invalid status: ${post.status}` });
          continue;
        }

        if (!post.socialAccount) {
          await prisma.$transaction([
            prisma.post.update({
              where: { id: post.id },
              data: { status: PostStatus.FAILED, errorMessage: "No social account linked" },
            }),
            prisma.scheduledJob.update({
              where: { id: job.id },
              data: {
                status: JobStatus.FAILED,
                completedAt: new Date(),
                errorMessage: "No social account linked",
              },
            }),
          ]);
          results.failed++;
          results.errors.push({ postId: job.postId, error: "No social account linked" });
          continue;
        }

        // The linked account must belong to the post's workspace. Teammates
        // share accounts, so the author need not be the one who connected it —
        // but `socialAccountId` was writable from the client and is a separate
        // row, so a post could be pointed at another tenant's account;
        // publishing it would decrypt and use *their* stored token. A row with
        // no tenant on either side cannot be proven and is refused too.
        // Permanent: retrying cannot fix ownership.
        if (
          !post.workspaceId ||
          post.socialAccount.workspaceId !== post.workspaceId
        ) {
          await prisma.$transaction([
            prisma.post.update({
              where: { id: post.id },
              data: {
                status: PostStatus.FAILED,
                errorMessage: "Linked social account does not belong to this post",
              },
            }),
            prisma.scheduledJob.update({
              where: { id: job.id },
              data: {
                status: JobStatus.FAILED,
                completedAt: new Date(),
                errorMessage: "Account ownership mismatch",
              },
            }),
          ]);
          results.permanent++;
          results.failed++;
          results.errors.push({ postId: job.postId, error: "Account ownership mismatch" });
          continue;
        }

        // The adapter is picked by the post's platform and fed the account's
        // token: they must be the same network. Permanent, and deliberately not
        // routed through handleFailure — the auth-shaped error a mismatched send
        // produces would flag a healthy account for reconnect.
        if (accountPlatformMismatch(post.platform, post.socialAccount)) {
          const message = accountPlatformMismatchMessage(post.platform, post.socialAccount.platform);
          await prisma.$transaction([
            prisma.post.update({
              where: { id: post.id },
              data: { status: PostStatus.FAILED, errorMessage: message },
            }),
            prisma.scheduledJob.update({
              where: { id: job.id },
              data: {
                status: JobStatus.FAILED,
                completedAt: new Date(),
                errorMessage: message,
                ...CLEARED_PENDING_PUBLISH,
              },
            }),
          ]);
          results.permanent++;
          results.failed++;
          results.errors.push({ postId: job.postId, error: ACCOUNT_PLATFORM_MISMATCH_CODE });
          continue;
        }

        // Claim the post for this attempt. The status was checked a few lines
        // above; guarding the write itself means an edit that landed in between
        // — which returns the post to DRAFT and clears `approvedAt` — cannot be
        // sent anyway.
        // A resumed poll already holds the post in PUBLISHING (checked above).
        const publishClaim = resumePublishId
          ? { count: 1 }
          : await prisma.post.updateMany({
              where: publishClaimWhere(post.id),
              data: { status: PostStatus.PUBLISHING },
            });

        if (publishClaim.count === 0) {
          await prisma.scheduledJob.update({
            where: { id: job.id },
            data: {
              status: JobStatus.FAILED,
              completedAt: new Date(),
              errorMessage: "Post changed before publish (no longer scheduled and approved)",
            },
          });
          results.failed++;
          results.errors.push({
            postId: post.id,
            error: "Post changed before publish",
          });
          continue;
        }

        // Configuration is checked before anything else. An unconfigured platform
        // must fail this post — never be papered over by a mock adapter that
        // reports success and writes a fake platform id.
        const resolution = resolvePublishAdapter(post.platform);
        if (!resolution.ok) {
          await handleFailure({
            postId: post.id,
            jobId: job.id,
            pending: pendingOf(job),
            accountId: post.socialAccount.id,
            attempt,
            error: `Not published: ${resolution.message}. Missing: ${resolution.missing.join(", ")}`,
            code: resolution.code,
            results,
            now: new Date(),
          });
          continue;
        }
        const adapter = resolution.adapter;
        const stored = decryptTokens({
          accessToken: post.socialAccount.accessToken,
          refreshToken: post.socialAccount.refreshToken,
        });
        let accessToken = stored.accessToken;

        // Refresh before publishing when the token is at or near expiry: a
        // publish that dies on an expired token wastes the schedule window, and
        // on short-lived platforms (TikTok: 24h) it is the normal case.
        if (needsTokenRefresh(post.socialAccount.tokenExpiresAt)) {
          const refreshable = canRefresh(
            Boolean(stored.refreshToken),
            adapter.config.capabilities.refreshableTokens,
          );

          if (!refreshable) {
            await handleFailure({
              postId: post.id,
              jobId: job.id,
              pending: pendingOf(job),
              // The account is what has to be reconnected, and `handleFailure`
              // only flags it when it is given this id: without it a dead token
              // was dead-lettered silently and the banner never appeared.
              accountId: post.socialAccount.id,
              attempt,
              error: "Stored access token is expired and this connector cannot refresh it",
              code: "AUTH_EXPIRED",
              results,
              now: new Date(),
            });
            continue;
          }

          try {
            const refreshed = await adapter.refreshAccessToken(stored.refreshToken as string);
            const encrypted = encryptTokens({
              accessToken: refreshed.accessToken,
              refreshToken: refreshed.refreshToken ?? stored.refreshToken,
            });
            await prisma.socialAccount.update({
              where: { id: post.socialAccount.id },
              data: {
                accessToken: encrypted.accessToken,
                refreshToken: encrypted.refreshToken,
                tokenExpiresAt: refreshed.expiresAt ?? null,
                lastSyncAt: new Date(),
              },
            });
            accessToken = refreshed.accessToken;
          } catch (error) {
            const message = error instanceof Error ? error.message : "Unknown refresh error";
            await handleFailure({
              postId: post.id,
              jobId: job.id,
              pending: pendingOf(job),
              attempt,
              error: `Token refresh failed: ${message}`,
              code: classifyAdapterError({ message }),
              results,
              now: new Date(),
            });
            continue;
          }
        }

        const mediaUrls = await prisma.postMedia.findMany({
          where: { postId: post.id },
          include: { mediaAsset: true },
          orderBy: { order: "asc" },
        });

        const sendOptions = {
          text: post.content,
          // Lets async-media adapters (Instagram Reels, X video) resume an
          // upload still processing from an earlier attempt instead of
          // re-uploading — see src/lib/adapters/in-flight-media.ts.
          idempotencyKey: post.id,
          mediaUrls: mediaUrls.map((m) => m.mediaAsset.url),
          // Addressing travels with the account, not with the process: a
          // Telegram account publishes into its own chat. Reaching for a global
          // env chat here is what made every tenant post into the owner's chat.
          additionalOptions: {
            ...destinationForAccount(post.socialAccount.metadata),
            // Lets an adapter build a public URL (TikTok: /@handle/video/id).
            ...(post.socialAccount.platformUsername
              ? { accountUsername: post.socialAccount.platformUsername }
              : {}),
          },
          // Real MIME type and byte size so validation cannot be fooled by a URL
          // whose extension is missing or is a `data:` payload.
          media: mediaUrls.map((m) => ({
            url: m.mediaAsset.url,
            mimeType: m.mediaAsset.mimeType,
            sizeBytes: m.mediaAsset.size,
          })),
        };

        // A resumed job only reads the outcome; everything else sends.
        const send = (): Promise<PostResult> => {
          if (!resumePublishId) return adapter.createPost(accessToken, sendOptions);
          if (!adapter.checkPublishStatus) {
            return Promise.resolve({
              success: false,
              error: "This connector cannot check the status of a pending publish.",
              code: "UNKNOWN",
            });
          }
          return adapter.checkPublishStatus(accessToken, resumePublishId, {
            additionalOptions: sendOptions.additionalOptions,
          });
        };

        let result = await send();

        /** Prefer the adapter's own code; fall back to classifying its message. */
        const failureCodeOf = (r: typeof result): AdapterErrorCode =>
          (r.code as AdapterErrorCode | undefined) ?? classifyAdapterError({ message: r.error });

        let code: AdapterErrorCode | null = result.success ? null : failureCodeOf(result);

        // One refresh-and-retry when the platform says the token is stale: the
        // pre-publish check cannot catch a token revoked mid-flight, and a
        // silent dead-letter here would be blamed on the content.
        if (
          !result.success &&
          code === "AUTH_EXPIRED" &&
          canRefresh(Boolean(stored.refreshToken), adapter.config.capabilities.refreshableTokens)
        ) {
          try {
            const refreshed = await adapter.refreshAccessToken(stored.refreshToken as string);
            const encrypted = encryptTokens({
              accessToken: refreshed.accessToken,
              refreshToken: refreshed.refreshToken ?? stored.refreshToken,
            });
            await prisma.socialAccount.update({
              where: { id: post.socialAccount.id },
              data: {
                accessToken: encrypted.accessToken,
                refreshToken: encrypted.refreshToken,
                tokenExpiresAt: refreshed.expiresAt ?? null,
                lastSyncAt: new Date(),
              },
            });
            accessToken = refreshed.accessToken;
            result = await send();
            code = result.success ? null : failureCodeOf(result);
          } catch {
            // Keep the original AUTH_EXPIRED failure; the refresh error itself is
            // not more informative for the operator.
          }
        }

        // Accepted but still processing: re-arm the job as a status poll. The post
        // stays PUBLISHING and nothing is sent again.
        if (result.success && result.pending) {
          if (result.platformPostId) {
            const pendingSince = resumePublishId ? job.pendingSince : null;
            const tickNow = new Date();
            if (pendingExpired(pendingSince, tickNow)) {
              await handleFailure({
                postId: post.id,
                jobId: job.id,
                pending: { publishId: result.platformPostId, since: pendingSince },
                accountId: post.socialAccount.id,
                attempt,
                error: "The platform is still processing this post",
                code: "PLATFORM_UNAVAILABLE",
                results,
                now: tickNow,
              });
            } else {
              await prisma.scheduledJob.update({
                where: { id: job.id },
                data: {
                  ...pendingPollJobData({
                    publishId: result.platformPostId,
                    pendingSince,
                    now: tickNow,
                  }),
                  // A status check is not a publish attempt; the send that
                  // started this keeps the attempt it was counted as.
                  attempts: resumePublishId ? job.attempts : attempt,
                },
              });
              results.pending++;
            }
            continue;
          }
          result = {
            success: false,
            error: "The platform reported the post as in progress but returned no reference to follow it by.",
            code: "UNKNOWN",
          };
          code = "UNKNOWN";
        }

        if (result.success) {
          await prisma.$transaction([
            prisma.post.update({
              where: { id: post.id },
              data: {
                status: PostStatus.PUBLISHED,
                publishedAt: new Date(),
                platformPostId: result.platformPostId,
                platformPostUrl: result.platformPostUrl,
                errorMessage: null,
              },
            }),
            prisma.scheduledJob.update({
              where: { id: job.id },
              data: { status: JobStatus.COMPLETED, completedAt: new Date(), errorMessage: null },
            }),
            // A successful publish proves the credentials work again.
            prisma.socialAccount.update({
              where: { id: post.socialAccount.id },
              data: { needsReconnect: false, lastError: null, lastSyncAt: new Date() },
            }),
          ]);
          results.published++;
          continue;
        }

        // Adapter reported failure -> classify it, then either back off and
        // retry, or dead-letter now if nothing about a retry could help.
        await handleFailure({
          postId: post.id,
          jobId: job.id,
          pending: pendingOf(job),
          accountId: post.socialAccount.id,
          attempt,
          error: result.error || "Unknown error",
          code: code ?? "UNKNOWN",
          results,
          now: new Date(),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        const attempt = job.attempts + 1;

        await handleFailure({
          postId: job.postId,
          jobId: job.id,
          pending: pendingOf(job),
          attempt,
          error: errorMessage,
          code: classifyAdapterError({ message: errorMessage }),
          results,
          now: new Date(),
        });
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
      maxAttempts: MAX_ATTEMPTS,
      ...results,
    });
  } catch (error) {
    console.error("Cron job error:", error);
    return NextResponse.json(
      { error: "Cron job failed", details: error instanceof Error ? error.message : "Unknown error" },
      { status: 500 }
    );
  }
}

function pendingOf(job: { pendingPublishId: string | null; pendingSince: Date | null }) {
  return job.pendingPublishId ? { publishId: job.pendingPublishId, since: job.pendingSince } : null;
}

/**
 * Record a failed publish attempt and decide what happens next.
 *
 * Retry policy is driven by the classified error, not by the attempt count
 * alone: a transient failure (platform down, rate limit, network) backs off and
 * tries again, while a permanent one (bad credentials, rejected content, gone
 * target) dead-letters immediately — retrying it only burns the schedule window
 * and hides the real cause. An unclassified failure is retried, conservatively.
 */
async function handleFailure(opts: {
  postId: string;
  jobId: string;
  accountId?: string | null;
  attempt: number;
  error: string;
  code: AdapterErrorCode;
  /** Set when the platform had already accepted the send (see pending-publish.ts). */
  pending?: { publishId: string; since: Date | null } | null;
  results: {
    retried: number;
    failed: number;
    permanent: number;
    pending: number;
    errors: { postId: string; error: string; code?: AdapterErrorCode }[];
  };
  now: Date;
}) {
  const { postId, jobId, accountId, attempt, error, code, results, now } = opts;
  const retryable = isRetryable(code) || code === "UNKNOWN";

  // The platform already has this post. A retry would SEND it again, so the
  // only safe moves are: keep polling (transient trouble reading the status),
  // or close it — as failed when the platform said so, otherwise as unknown.
  if (opts.pending) {
    const { publishId, since } = opts.pending;
    if (retryable && !pendingExpired(since, now)) {
      await prisma.scheduledJob.update({
        where: { id: jobId },
        data: {
          ...pendingPollJobData({
            publishId,
            pendingSince: since,
            now,
            note: `Could not read the publish status (${code}): ${error}. Checking again.`,
          }),
          // The claim counted this poll as an attempt; it was not one.
          attempts: Math.max(0, attempt - 1),
        },
      });
      results.pending++;
      return;
    }

    const platformRejected = code === "CONTENT_INVALID" || code === "MEDIA_INVALID";
    const message = platformRejected
      ? `${error} Not retried automatically (${code}).`
      : retryable
        ? PENDING_TIMEOUT_MESSAGE
        : `${error} (${code}). The platform had already accepted this post, so whether it went live is unknown — check the platform before publishing again.`;

    await prisma.$transaction([
      prisma.post.update({
        where: { id: postId },
        data: { status: PostStatus.FAILED, errorMessage: message, lastRetryAt: now },
      }),
      prisma.scheduledJob.update({
        where: { id: jobId },
        // Closed: the poll is over. Leaving the handle set would make a later
        // Retry/reschedule run as a poll and fail the re-queued post.
        data: {
          status: JobStatus.FAILED,
          completedAt: now,
          errorMessage: message,
          ...CLEARED_PENDING_PUBLISH,
        },
      }),
      ...(accountId && requiresReconnect(code)
        ? [
            prisma.socialAccount.update({
              where: { id: accountId },
              data: { needsReconnect: true, lastError: `${error} (${code})` },
            }),
          ]
        : []),
    ]);
    results.failed++;
    results.permanent++;
    results.errors.push({ postId, error: message, code });
    return;
  }

  const exhausted = !retryable || attempt >= MAX_ATTEMPTS;
  const nextAttemptAt = new Date(now.getTime() + backoffMs(attempt));

  const note = !retryable
    ? `${describeAdapterError(code)} Not retried (${code}).`
    : exhausted
      ? `Dead-lettered after ${attempt} attempts (${code}).`
      : `Attempt ${attempt}/${MAX_ATTEMPTS}, retry at ${nextAttemptAt.toISOString()} (${code}).`;

  await prisma.$transaction([
    prisma.post.update({
      where: { id: postId },
      data: {
        status: exhausted ? PostStatus.FAILED : PostStatus.SCHEDULED,
        errorMessage: `${error} — ${note}`,
        retryCount: { increment: 1 },
        lastRetryAt: now,
      },
    }),
    prisma.scheduledJob.update({
      where: { id: jobId },
      data: {
        status: exhausted ? JobStatus.FAILED : JobStatus.PENDING,
        // Backoff: a retry becomes due in the future, never immediately.
        scheduledAt: exhausted ? now : nextAttemptAt,
        completedAt: exhausted ? now : null,
        errorMessage: `${error} — ${note}`,
      },
    }),
    // Credential-shaped failures are not the post's fault: record them on the
    // account so the UI can offer a reconnect instead of a silent dead letter.
    ...(accountId && exhausted && requiresReconnect(code)
      ? [
          prisma.socialAccount.update({
            where: { id: accountId },
            data: { needsReconnect: true, lastError: `${error} (${code})` },
          }),
        ]
      : []),
  ]);

  if (exhausted) {
    results.failed++;
    if (!retryable) results.permanent++;
    results.errors.push({ postId, error, code });
  } else {
    results.retried++;
  }
}

export const dynamic = "force-dynamic";

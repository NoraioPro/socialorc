import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { PostStatus, JobStatus } from "@prisma/client";
import { getAdapter } from "@/lib/adapters";
import { decryptTokens } from "@/lib/encryption";

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

export async function GET(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  const results: {
    processed: number;
    published: number;
    retried: number;
    deduped: number;
    failed: number;
    errors: { postId: string; error: string }[];
  } = {
    processed: 0,
    published: 0,
    retried: 0,
    deduped: 0,
    failed: 0,
    errors: [],
  };

  try {
    const dueJobs = await prisma.scheduledJob.findMany({
      where: {
        status: JobStatus.PENDING,
        scheduledAt: { lte: now },
        attempts: { lt: MAX_ATTEMPTS },
      },
      orderBy: { scheduledAt: "asc" }, // oldest first, so nothing starves
      take: 10,
    });

    for (const job of dueJobs) {
      results.processed++;

      try {
        await prisma.scheduledJob.update({
          where: { id: job.id },
          data: {
            status: JobStatus.PROCESSING,
            startedAt: new Date(),
            attempts: { increment: 1 },
          },
        });

        const attempt = job.attempts + 1;

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

        if (post.status !== PostStatus.SCHEDULED) {
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

        await prisma.post.update({
          where: { id: post.id },
          data: { status: PostStatus.PUBLISHING },
        });

        const adapter = getAdapter(post.platform, { useMockIfUnconfigured: true });
        const { accessToken } = decryptTokens({
          accessToken: post.socialAccount.accessToken,
          refreshToken: post.socialAccount.refreshToken,
        });

        const mediaUrls = await prisma.postMedia.findMany({
          where: { postId: post.id },
          include: { mediaAsset: true },
          orderBy: { order: "asc" },
        });

        const result = await adapter.createPost(accessToken, {
          text: post.content,
          mediaUrls: mediaUrls.map((m) => m.mediaAsset.url),
        });

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
          ]);
          results.published++;
          continue;
        }

        // Adapter reported failure -> decide retry-with-backoff vs dead-letter.
        await handleFailure({
          postId: post.id,
          jobId: job.id,
          attempt,
          error: result.error || "Unknown error",
          results,
          now: new Date(),
        });
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";
        const attempt = job.attempts + 1;

        await handleFailure({
          postId: job.postId,
          jobId: job.id,
          attempt,
          error: errorMessage,
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

async function handleFailure(opts: {
  postId: string;
  jobId: string;
  attempt: number;
  error: string;
  results: {
    retried: number;
    failed: number;
    errors: { postId: string; error: string }[];
  };
  now: Date;
}) {
  const { postId, jobId, attempt, error, results, now } = opts;
  const exhausted = attempt >= MAX_ATTEMPTS;
  const nextAttemptAt = new Date(now.getTime() + backoffMs(attempt));

  await prisma.$transaction([
    prisma.post.update({
      where: { id: postId },
      data: {
        status: exhausted ? PostStatus.FAILED : PostStatus.SCHEDULED,
        errorMessage: error,
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
        errorMessage: exhausted
          ? `${error} (dead-lettered after ${attempt} attempts)`
          : `${error} (attempt ${attempt}/${MAX_ATTEMPTS}, retry at ${nextAttemptAt.toISOString()})`,
      },
    }),
  ]);

  if (exhausted) {
    results.failed++;
    results.errors.push({ postId, error });
  } else {
    results.retried++;
  }
}

export const dynamic = "force-dynamic";

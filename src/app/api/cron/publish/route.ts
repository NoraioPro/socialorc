import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { PostStatus, JobStatus } from "@prisma/client";
import { getAdapter } from "@/lib/adapters";
import { decryptTokens } from "@/lib/encryption";

const MAX_RETRIES = 3;

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
    failed: number;
    errors: { postId: string; error: string }[];
  } = {
    processed: 0,
    published: 0,
    failed: 0,
    errors: [],
  };

  try {
    const dueJobs = await prisma.scheduledJob.findMany({
      where: {
        status: JobStatus.PENDING,
        scheduledAt: { lte: now },
        attempts: { lt: MAX_RETRIES },
      },
      take: 10,
    });

    for (const job of dueJobs) {
      results.processed++;

      try {
        await prisma.scheduledJob.update({
          where: { id: job.id },
          data: {
            status: JobStatus.PROCESSING,
            startedAt: now,
            attempts: { increment: 1 },
          },
        });

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
          await prisma.scheduledJob.update({
            where: { id: job.id },
            data: {
              status: JobStatus.FAILED,
              completedAt: new Date(),
              errorMessage: "No social account linked",
            },
          });

          await prisma.post.update({
            where: { id: post.id },
            data: {
              status: PostStatus.FAILED,
              errorMessage: "No social account linked",
            },
          });

          results.failed++;
          results.errors.push({ postId: job.postId, error: "No social account linked" });
          continue;
        }

        await prisma.post.update({
          where: { id: post.id },
          data: { status: PostStatus.PUBLISHING },
        });

        const adapter = getAdapter(post.platform);
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
              data: {
                status: JobStatus.COMPLETED,
                completedAt: new Date(),
              },
            }),
          ]);

          results.published++;
        } else {
          const shouldRetry = job.attempts < MAX_RETRIES - 1;

          await prisma.$transaction([
            prisma.post.update({
              where: { id: post.id },
              data: {
                status: shouldRetry ? PostStatus.SCHEDULED : PostStatus.FAILED,
                errorMessage: result.error,
                retryCount: { increment: 1 },
                lastRetryAt: new Date(),
              },
            }),
            prisma.scheduledJob.update({
              where: { id: job.id },
              data: {
                status: shouldRetry ? JobStatus.PENDING : JobStatus.FAILED,
                completedAt: shouldRetry ? null : new Date(),
                errorMessage: result.error,
              },
            }),
          ]);

          if (!shouldRetry) {
            results.failed++;
            results.errors.push({ postId: job.postId, error: result.error || "Unknown error" });
          }
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : "Unknown error";

        await prisma.$transaction([
          prisma.post.update({
            where: { id: job.postId },
            data: {
              status: job.attempts >= MAX_RETRIES - 1 ? PostStatus.FAILED : PostStatus.SCHEDULED,
              errorMessage,
              retryCount: { increment: 1 },
              lastRetryAt: new Date(),
            },
          }),
          prisma.scheduledJob.update({
            where: { id: job.id },
            data: {
              status: job.attempts >= MAX_RETRIES - 1 ? JobStatus.FAILED : JobStatus.PENDING,
              completedAt: job.attempts >= MAX_RETRIES - 1 ? new Date() : null,
              errorMessage,
            },
          }),
        ]);

        if (job.attempts >= MAX_RETRIES - 1) {
          results.failed++;
          results.errors.push({ postId: job.postId, error: errorMessage });
        }
      }
    }

    return NextResponse.json({
      success: true,
      timestamp: now.toISOString(),
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

export const dynamic = "force-dynamic";

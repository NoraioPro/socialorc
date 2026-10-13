/**
 * Lease recovery for the publishing worker.
 *
 * The worker flips a ScheduledJob to `PROCESSING` and the post to `PUBLISHING`
 * before calling the platform. If the process stops mid-publish — a function
 * timeout, a deploy, an OOM — that job stays `PROCESSING` and nothing ever moves
 * it again, so the post is stuck `PUBLISHING`: uneditable, undeletable, and
 * unpublishable (the worker only publishes `SCHEDULED` posts) forever.
 *
 * This module finds those jobs and closes them out. What it deliberately does
 * NOT do is put them back in the queue:
 *
 * A stale `PROCESSING` job means the run that held it is gone, and the one fact
 * the database cannot tell us is whether the platform accepted the post before
 * it died. A process killed between "HTTP 200 from the platform" and "write the
 * platform post id" leaves a row that looks exactly like one killed before ever
 * sending. Re-queueing it re-arms a duplicate post — the same content published
 * twice, in public. So the post is closed as FAILED with the outcome recorded as
 * unknown, and a human decides: check the platform, then either delete it or
 * press Retry, which re-queues it deliberately (the retry path needs FAILED plus
 * `approvedAt`, and the approval was never revoked).
 *
 * The client is injectable and Prisma-free so the whole thing is testable
 * without a database.
 */

export const PROCESSING_LEASE_MS = 10 * 60_000;

/** Posts and jobs are only touched once their lease has definitely expired. */
export function leaseCutoff(now: Date, leaseMs: number = PROCESSING_LEASE_MS): Date {
  return new Date(now.getTime() - leaseMs);
}

/**
 * The note the operator needs and the database cannot supply: nothing here knows
 * whether the post is already live.
 */
export const LOST_RUN_MESSAGE =
  "The worker stopped mid-publish, so whether the platform accepted this post is unknown. Check the platform before publishing again — this post may already be public.";

/** Job-side reason for a run that died while it still had attempts left. */
export const DEAD_RUN_JOB_MESSAGE =
  "Worker stopped mid-publish (outcome unknown); not retried automatically to avoid a duplicate post";

/** Job-side reason for a run that died with its retry budget already spent. */
export const ABANDONED_JOB_MESSAGE =
  "Abandoned: the worker stopped mid-publish and the retry budget was already spent";

export interface LeaseRecoveryResult {
  /** Stale PROCESSING jobs whose run died with retries left: failed, not retried. */
  deadRuns: number;
  /** Stale PROCESSING jobs whose retry budget was already spent. */
  abandoned: number;
  /** Posts pulled out of PUBLISHING, every one of them closed as FAILED. */
  released: number;
}

export interface LeaseRecoveryClient {
  scheduledJob: {
    findMany(args: {
      where: Record<string, unknown>;
      select: { id: true; postId: true; attempts: true };
    }): Promise<{ id: string; postId: string; attempts: number }[]>;
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
  post: {
    updateMany(args: {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    }): Promise<{ count: number }>;
  };
}

export async function recoverStaleProcessingJobs(
  client: LeaseRecoveryClient,
  now: Date,
  maxAttempts: number
): Promise<LeaseRecoveryResult> {
  const stale = await client.scheduledJob.findMany({
    where: {
      status: "PROCESSING",
      startedAt: { lt: leaseCutoff(now) },
    },
    select: { id: true, postId: true, attempts: true },
  });

  if (stale.length === 0) {
    return { deadRuns: 0, abandoned: 0, released: 0 };
  }

  const deadRuns = stale.filter((job) => job.attempts < maxAttempts);
  const exhausted = stale.filter((job) => job.attempts >= maxAttempts);

  // Both branches fail the job. Neither returns it to PENDING: the run that held
  // it is gone, and the attempt it was making has an unknown outcome.
  const deadRunsClosed = deadRuns.length
    ? (
        await client.scheduledJob.updateMany({
          where: { id: { in: deadRuns.map((job) => job.id) }, status: "PROCESSING" },
          data: {
            status: "FAILED",
            completedAt: now,
            errorMessage: DEAD_RUN_JOB_MESSAGE,
          },
        })
      ).count
    : 0;

  const abandonedClosed = exhausted.length
    ? (
        await client.scheduledJob.updateMany({
          where: { id: { in: exhausted.map((job) => job.id) }, status: "PROCESSING" },
          data: {
            status: "FAILED",
            completedAt: now,
            errorMessage: ABANDONED_JOB_MESSAGE,
          },
        })
      ).count
    : 0;

  // The post leaves PUBLISHING for a state a human can act on. FAILED keeps the
  // content and the approval stamp (so Retry works) while making it obvious that
  // nobody knows whether it went out.
  const released = (
    await client.post.updateMany({
      where: {
        id: { in: stale.map((job) => job.postId) },
        status: "PUBLISHING",
      },
      data: {
        status: "FAILED",
        errorMessage: LOST_RUN_MESSAGE,
      },
    })
  ).count;

  return { deadRuns: deadRunsClosed, abandoned: abandonedClosed, released };
}

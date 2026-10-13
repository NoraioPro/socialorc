/**
 * Lease recovery for the publishing worker.
 *
 * The worker flips a ScheduledJob to `PROCESSING` and the post to `PUBLISHING`
 * before calling the platform. If the process stops mid-publish — a deploy
 * landing, a serverless timeout, an OOM — nothing would ever select that job
 * again, because the claim query only looks at `PENDING`, and the post would sit
 * in `PUBLISHING` forever: the worker refuses to publish anything that is not
 * `SCHEDULED`, PATCH refuses to edit it and DELETE refuses to remove it.
 *
 * Recovery therefore does two things per stale job:
 *   - returns the job to `PENDING` (retry budget left) or `FAILED` (budget spent);
 *   - returns the *post* to `SCHEDULED` in the first case, and closes it as
 *     `FAILED` in the second, so no post is left claiming to be mid-publish.
 *
 * What this can and cannot promise:
 *   - it never re-sends anything itself;
 *   - the attempt counter was already incremented when the job was claimed, so
 *     the worker's existing retry budget still bounds the number of attempts;
 *   - the worker completes (without re-sending) any job whose post already
 *     carries a `platformPostId`, which covers a crash *after* the platform
 *     accepted the post and the id was written;
 *   - it cannot cover a crash in the window between the platform accepting the
 *     post and the id being stored — that attempt is indistinguishable from one
 *     that never reached the platform, so it is retried and may duplicate. That
 *     window is the same one the queue's own retry has, and closing it needs a
 *     platform-side idempotency key (open defect).
 *
 * Kept free of Prisma so the recovery predicates can be unit-tested with a fake
 * client instead of a live database.
 */

/**
 * How long a job may stay in `PROCESSING` before it is considered abandoned.
 * One attempt is bounded by the platform's own request timeout and the cron
 * ticks every five minutes, so ten minutes is comfortably longer than any
 * healthy publish while still recovering a crashed one on the next tick.
 */
export const PROCESSING_LEASE_MS = 10 * 60_000;

/** The instant before which a `PROCESSING` job is stale. */
export function leaseCutoff(now: Date, leaseMs: number = PROCESSING_LEASE_MS): Date {
  return new Date(now.getTime() - leaseMs);
}

export interface LeaseRecoveryResult {
  /** Stale jobs returned to the queue for another attempt. */
  reclaimed: number;
  /** Stale jobs whose retry budget was already spent, dead-lettered instead. */
  abandoned: number;
  /** Posts returned from `PUBLISHING` to `SCHEDULED` so the reclaimed attempt can run. */
  resumed: number;
  /** Posts closed as `FAILED` because their job had no attempt left. */
  stranded: number;
}

/** Error message recorded when a job can never be retried again. */
export const ABANDONED_MESSAGE =
  "Abandoned: the worker stopped mid-publish and the retry budget was already spent";

/**
 * Message for a post whose job died with no attempt left. It says what a human
 * has to do — check the platform — because the app cannot know whether the post
 * reached it.
 */
export const STRANDED_MESSAGE =
  "The worker stopped mid-publish and this post cannot be retried automatically. Check the platform before publishing it again — it may already be public.";

/** A stale job, as much of it as recovery needs. */
export interface StaleJob {
  id: string;
  postId: string;
  attempts: number;
}

/**
 * The slice of the Prisma client this module needs, so tests can pass a fake.
 */
export interface LeaseRecoveryClient {
  scheduledJob: {
    findMany(args: {
      where: Record<string, unknown>;
      select: { id: true; postId: true; attempts: true };
    }): Promise<StaleJob[]>;
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
  maxAttempts: number,
): Promise<LeaseRecoveryResult> {
  const cutoff = leaseCutoff(now);

  const stale = await client.scheduledJob.findMany({
    where: { status: "PROCESSING", startedAt: { lt: cutoff } },
    select: { id: true, postId: true, attempts: true },
  });

  const retryable = stale.filter((job) => job.attempts < maxAttempts);
  const exhausted = stale.filter((job) => job.attempts >= maxAttempts);

  // The `status: PROCESSING` guard stays in the update: a job re-claimed by
  // another cron run between the read above and this write must not be touched.
  const reclaimed = retryable.length
    ? (
        await client.scheduledJob.updateMany({
          where: { id: { in: retryable.map((job) => job.id) }, status: "PROCESSING" },
          data: { status: "PENDING" },
        })
      ).count
    : 0;

  const abandoned = exhausted.length
    ? (
        await client.scheduledJob.updateMany({
          where: { id: { in: exhausted.map((job) => job.id) }, status: "PROCESSING" },
          data: {
            status: "FAILED",
            completedAt: now,
            errorMessage: ABANDONED_MESSAGE,
          },
        })
      ).count
    : 0;

  // The post has to move with the job. Only a PUBLISHING post is touched, so a
  // job orphaned after its post was already published, failed or edited away
  // never resurrects it.
  const resumed = retryable.length
    ? (
        await client.post.updateMany({
          where: { id: { in: retryable.map((job) => job.postId) }, status: "PUBLISHING" },
          data: { status: "SCHEDULED" },
        })
      ).count
    : 0;

  const stranded = exhausted.length
    ? (
        await client.post.updateMany({
          where: { id: { in: exhausted.map((job) => job.postId) }, status: "PUBLISHING" },
          data: { status: "FAILED", errorMessage: STRANDED_MESSAGE },
        })
      ).count
    : 0;

  return { reclaimed, abandoned, resumed, stranded };
}

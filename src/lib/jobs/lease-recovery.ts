/**
 * Lease recovery for the publishing worker.
 *
 * The worker flips a ScheduledJob to `PROCESSING` before calling the platform.
 * If the process stops mid-publish — a deploy landing, a serverless timeout, an
 * OOM — nothing would ever select that job again, because the claim query only
 * looks at `PENDING`. The post would sit in `PUBLISHING` forever with no retry
 * and no explanation.
 *
 * Recovery is deliberately safe against double-publishing:
 *   - it only returns a job to `PENDING`, it never re-sends anything itself;
 *   - the attempt counter was already incremented when the job was claimed, so
 *     the worker's existing retry budget still bounds the number of attempts;
 *   - the worker completes (without re-sending) any job whose post already
 *     carries a `platformPostId`, which covers the crash-after-publish case.
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
}

/** Error message recorded when a job can never be retried again. */
export const ABANDONED_MESSAGE =
  "Abandoned: the worker stopped mid-publish and the retry budget was already spent";

/**
 * The slice of the Prisma client this module needs, so tests can pass a fake.
 */
export interface LeaseRecoveryClient {
  scheduledJob: {
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

  const reclaimed = await client.scheduledJob.updateMany({
    where: {
      status: "PROCESSING",
      startedAt: { lt: cutoff },
      attempts: { lt: maxAttempts },
    },
    data: { status: "PENDING" },
  });

  const abandoned = await client.scheduledJob.updateMany({
    where: {
      status: "PROCESSING",
      startedAt: { lt: cutoff },
      attempts: { gte: maxAttempts },
    },
    data: {
      status: "FAILED",
      completedAt: now,
      errorMessage: ABANDONED_MESSAGE,
    },
  });

  return { reclaimed: reclaimed.count, abandoned: abandoned.count };
}

/**
 * Publishes the platform accepted but has not finished (TikTok processes a
 * video after the upload, sometimes for minutes).
 *
 * Such a post must be FOLLOWED, not re-sent: the bytes are already with the
 * platform, so treating "not finished yet" as a failure — or as a success —
 * is wrong both ways. A failure invites a retry that uploads the video again
 * (a duplicate post); a success records a post that may still be rejected.
 *
 * The state lives on the ScheduledJob: `pendingPublishId` is the platform's
 * handle, `pendingSince` bounds the wait. While it is set the worker only calls
 * the adapter's read-only `checkPublishStatus`.
 */

/**
 * How soon the next status check is due. The cron runs every 5 minutes, so in
 * production that is the effective interval; the env override exists so the
 * e2e harness can drive a pending publish without waiting a minute.
 */
export const PENDING_POLL_INTERVAL_MS = (() => {
  const fromEnv = Number(process.env.PENDING_POLL_INTERVAL_MS);
  return Number.isFinite(fromEnv) && fromEnv >= 1_000 ? fromEnv : 60_000;
})();

/** After this long without a verdict the post is closed as "outcome unknown". */
export const PENDING_PUBLISH_MAX_WAIT_MS = 2 * 60 * 60_000;

export const PENDING_NOTE = "Accepted by the platform; waiting for it to finish publishing.";

export const PENDING_TIMEOUT_MESSAGE =
  "The platform accepted this post but did not confirm it was published within 2 hours. " +
  "Check the platform before publishing again — it may already be live.";

export function pendingExpired(pendingSince: Date | null, now: Date): boolean {
  return pendingSince !== null && now.getTime() - pendingSince.getTime() > PENDING_PUBLISH_MAX_WAIT_MS;
}

/** ScheduledJob fields that (re-)arm a status poll. Never touches attempts. */
export function pendingPollJobData(input: {
  publishId: string;
  pendingSince: Date | null;
  now: Date;
  note?: string;
}) {
  return {
    status: "PENDING" as const,
    scheduledAt: new Date(input.now.getTime() + PENDING_POLL_INTERVAL_MS),
    startedAt: null,
    completedAt: null,
    pendingPublishId: input.publishId,
    pendingSince: input.pendingSince ?? input.now,
    errorMessage: input.note ?? PENDING_NOTE,
  };
}

/** Minimal client so the hand-off is testable without a database. */
type PendingPollJobData = ReturnType<typeof pendingPollJobData>;

export interface PendingHandOffClient {
  scheduledJob: {
    upsert(args: {
      where: { postId: string };
      create: PendingPollJobData & { postId: string; workspaceId: string | null; attempts: number };
      update: PendingPollJobData;
    }): PromiseLike<unknown>;
  };
}

/**
 * Give a pending immediate publish to the worker. The post stays PUBLISHING;
 * the job (created, or the post's existing one re-armed) polls until the
 * platform answers.
 */
export async function handOffPendingPublish(
  client: PendingHandOffClient,
  input: { postId: string; workspaceId: string | null; publishId: string; now?: Date },
): Promise<void> {
  const now = input.now ?? new Date();
  const data = pendingPollJobData({ publishId: input.publishId, pendingSince: now, now });
  await client.scheduledJob.upsert({
    where: { postId: input.postId },
    create: { postId: input.postId, workspaceId: input.workspaceId, attempts: 1, ...data },
    update: data,
  });
}

/**
 * Clears a status poll from a job. A job closed or re-queued while these are
 * still set would — on its next run — be taken for a poll (only reading an
 * outcome for a post in PUBLISHING) and fail "Invalid post status: SCHEDULED",
 * stranding a post the user deliberately retried or rescheduled.
 */
export const CLEARED_PENDING_PUBLISH = {
  pendingPublishId: null,
  pendingSince: null,
} as const;

/**
 * ScheduledJob fields for a deliberate (re-)queue: a fresh send at
 * `scheduledAt`, with a full retry budget and no leftover poll state. Used for
 * both the upsert's create and update so the two cannot drift apart.
 */
export function requeueJobData(scheduledAt: Date) {
  return {
    scheduledAt,
    status: "PENDING" as const,
    attempts: 0,
    errorMessage: null,
    startedAt: null,
    completedAt: null,
    ...CLEARED_PENDING_PUBLISH,
  };
}

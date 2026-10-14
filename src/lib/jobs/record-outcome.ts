/**
 * Recording what happened after a send.
 *
 * "Publish now" claims the post (PUBLISHING) and then talks to the platform.
 * Whatever the platform answered, the route must still write it down — the
 * PUBLISHED update, the pending-poll hand-off, or the FAILED close. If that
 * write throws (a dropped connection, a pool timeout), the post used to stay in
 * PUBLISHING with no job: uneditable, undeletable, invisible to the worker.
 *
 * So the write is retried once, and if it still fails the post is closed as
 * FAILED with an "outcome unknown" note, which a human can act on (Retry).
 * Closing is best effort too: if even that fails, the error is logged and the
 * caller reports the unknown outcome to the user.
 */

export const OUTCOME_UNKNOWN_CODE = "OUTCOME_UNKNOWN";

export function outcomeUnknownMessage(detail?: string): string {
  return (
    "Publishing outcome unknown — the platform was contacted but the result could not be recorded" +
    (detail ? ` (${detail})` : "") +
    ". Check the platform before publishing again; it may already be live."
  );
}

export type RecordResult<T> = { ok: true; value: T } | { ok: false; error: unknown };

export async function recordPublishOutcome<T>(
  write: () => Promise<T>,
  closeAsUnknown: () => Promise<unknown>,
  opts: { attempts?: number; label?: string } = {},
): Promise<RecordResult<T>> {
  const attempts = Math.max(1, opts.attempts ?? 2);
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    try {
      return { ok: true, value: await write() };
    } catch (error) {
      lastError = error;
    }
  }
  console.error(`[publish] could not record ${opts.label ?? "the outcome"}:`, lastError);
  try {
    await closeAsUnknown();
  } catch (closeError) {
    console.error("[publish] could not close the post as outcome-unknown either:", closeError);
  }
  return { ok: false, error: lastError };
}

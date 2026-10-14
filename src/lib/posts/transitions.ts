import type { PostStatus } from "@prisma/client";

/**
 * Every status change a post can make, and the state it must already be in.
 *
 * The routes were written check-then-act: read the post, decide it is allowed,
 * then `update({ where: { id } })`. Two requests interleaved turn that into a
 * gate bypass — a PATCH (which returns a post to DRAFT and clears `approvedAt`)
 * landing between the schedule route's read and its write leaves the row
 * `SCHEDULED` with `approvedAt = null`, and the worker only looks at `status`,
 * so unapproved content gets published.
 *
 * So every transition now carries the state it expects in the write itself
 * (`updateMany` with these guards) and treats `count === 0` as a conflict —
 * the write either applies to the state that was checked, or it does not happen.
 *
 * `approvedAt` is part of the guard wherever the transition depends on approval:
 * the status alone is not proof, because editing clears the stamp.
 *
 * Every guard is scoped by the caller's **workspace** (from `requireWorkspace()`
 * in src/lib/tenancy/guard.ts), not by the author: teammates share posts, so a
 * MANAGER approves an EDITOR's post, and a post in another workspace simply does
 * not match — the write affects nothing and the route answers 409/404.
 *
 * Pure and Prisma-free (the `PostStatus` import is a type only), so the guards
 * can be asserted in unit tests without a database.
 */

/** Returned whenever a guarded write found the row in a state that forbids it. */
export const POST_CONFLICT_MESSAGE =
  "This post changed while you were working on it. Reload and try again.";

export const POST_CONFLICT_STATUS = 409;

/** Statuses a user may still edit. */
export const EDIT_BLOCKED_STATUSES = ["PUBLISHING", "PUBLISHED"] as PostStatus[];

/** Approved but not yet scheduled — the only state that may be scheduled. */
export function scheduleBlockReason(post: {
  status: string;
  approvedAt: Date | null;
}): "not_approved" | null {
  if (post.status !== "APPROVED" || !post.approvedAt) return "not_approved";
  return null;
}

/** The 400 body's message, kept in one place so the copy cannot drift. */
export function scheduleBlockMessage(status: string): string {
  return `Post must be approved before scheduling. Current status: ${status}`;
}

/** APPROVED **and** carrying its approval stamp. */
export function scheduleGuardWhere(id: string, workspaceId: string) {
  return { id, workspaceId, status: "APPROVED" as PostStatus, approvedAt: { not: null } };
}

/** Only a scheduled post can be pulled back out of the queue. */
export function unscheduleGuardWhere(id: string, workspaceId: string) {
  return { id, workspaceId, status: "SCHEDULED" as PostStatus };
}

/** Approve/reject act on a post that is still awaiting a decision. */
export function approveGuardWhere(id: string, workspaceId: string) {
  return {
    id,
    workspaceId,
    status: { in: ["DRAFT", "PENDING_APPROVAL"] as PostStatus[] },
  };
}

/**
 * Submitting is allowed from either pre-decision state, which is what the
 * route has always accepted: a second submit on a PENDING_APPROVAL post is a
 * no-op, not an error.
 */
export function submitGuardWhere(id: string, workspaceId: string) {
  return {
    id,
    workspaceId,
    status: { in: ["DRAFT", "PENDING_APPROVAL"] as PostStatus[] },
  };
}

/**
 * Moving a scheduled post to another time: it must still be SCHEDULED and still
 * carry its approval when the write lands (an edit in between returns it to
 * DRAFT and clears `approvedAt`).
 */
export function rescheduleGuardWhere(id: string, workspaceId: string) {
  return { id, workspaceId, status: "SCHEDULED" as PostStatus, approvedAt: { not: null } };
}

/**
 * Only a job that is still waiting may be moved. One the worker has claimed
 * (PROCESSING) is mid-send; one with a `pendingPublishId` was already accepted
 * by the platform. Re-arming either could send the post twice.
 */
export function rescheduleJobWhere(postId: string) {
  return { postId, status: "PENDING" as const, pendingPublishId: null };
}

/** A failed publish may be re-queued only if it was approved in the first place. */
export function retryGuardWhere(id: string, workspaceId: string) {
  return { id, workspaceId, status: "FAILED" as PostStatus, approvedAt: { not: null } };
}

/** Editing is refused once the post is on its way out or already out. */
export function editGuardWhere(id: string, workspaceId: string) {
  return { id, workspaceId, status: { notIn: EDIT_BLOCKED_STATUSES } };
}

/**
 * The worker claims a post for publishing. The route already checked the status
 * a few lines earlier; this makes the write itself refuse to claim anything that
 * stopped being scheduled (or lost its approval) in between.
 */
export function publishClaimWhere(id: string) {
  return { id, status: "SCHEDULED" as PostStatus, approvedAt: { not: null } };
}

/**
 * The worker claims a due job (PENDING -> PROCESSING). `scheduledAt` is
 * restated in the claim: the job was read as due a moment earlier, but a
 * reschedule (or a retry's backoff) landing in between moves it into the
 * future, and claiming it anyway would publish early.
 */
export function jobClaimWhere(jobId: string, now: Date) {
  return { id: jobId, status: "PENDING" as const, scheduledAt: { lte: now } };
}

/**
 * A post goes out through its linked account, and the adapter is chosen by the
 * POST's platform. A post for INSTAGRAM linked to a TWITTER account would hand
 * the X token to the Instagram adapter: the send fails with an auth-shaped
 * error and the (perfectly healthy) account gets flagged for reconnect. So the
 * two must agree on every write and again before every send. This is never a
 * credential problem, so it must never set `needsReconnect`.
 */
export const ACCOUNT_PLATFORM_MISMATCH_CODE = "ACCOUNT_PLATFORM_MISMATCH";

export function accountPlatformMismatch(
  postPlatform: string,
  account: { platform: string } | null | undefined,
): boolean {
  return Boolean(account) && account!.platform !== postPlatform;
}

export function accountPlatformMismatchMessage(postPlatform: string, accountPlatform: string): string {
  return (
    `This post is for ${postPlatform}, but the linked account is a ${accountPlatform} account. ` +
    `Link a ${postPlatform} account to the post and try again.`
  );
}

/**
 * Deleting races the worker: a post read as SCHEDULED can be claimed
 * (PUBLISHING) a moment later, and deleting it mid-send loses the record of a
 * post that may go live. The write restates "not PUBLISHING". A caller without
 * `posts:delete` (deleting their own draft) restates that it is still a draft,
 * so an approval landing in between is not deleted out from under the approver.
 */
export function deleteGuardWhere(id: string, workspaceId: string, opts: { draftOnly: boolean }) {
  return {
    id,
    workspaceId,
    status: opts.draftOnly
      ? { in: ["DRAFT", "PENDING_APPROVAL"] as PostStatus[] }
      : { not: "PUBLISHING" as PostStatus },
  };
}

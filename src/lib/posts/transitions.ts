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
export function scheduleGuardWhere(id: string, userId: string) {
  return { id, userId, status: "APPROVED" as PostStatus, approvedAt: { not: null } };
}

/** Only a scheduled post can be pulled back out of the queue. */
export function unscheduleGuardWhere(id: string, userId: string) {
  return { id, userId, status: "SCHEDULED" as PostStatus };
}

/** Approve/reject act on a post that is still awaiting a decision. */
export function approveGuardWhere(id: string, userId: string) {
  return {
    id,
    userId,
    status: { in: ["DRAFT", "PENDING_APPROVAL"] as PostStatus[] },
  };
}

/**
 * Submitting is allowed from either pre-decision state, which is what the
 * route has always accepted: a second submit on a PENDING_APPROVAL post is a
 * no-op, not an error.
 */
export function submitGuardWhere(id: string, userId: string) {
  return {
    id,
    userId,
    status: { in: ["DRAFT", "PENDING_APPROVAL"] as PostStatus[] },
  };
}

/** A failed publish may be re-queued only if it was approved in the first place. */
export function retryGuardWhere(id: string, userId: string) {
  return { id, userId, status: "FAILED" as PostStatus, approvedAt: { not: null } };
}

/** Editing is refused once the post is on its way out or already out. */
export function editGuardWhere(id: string, userId: string) {
  return { id, userId, status: { notIn: EDIT_BLOCKED_STATUSES } };
}

/**
 * The worker claims a post for publishing. The route already checked the status
 * a few lines earlier; this makes the write itself refuse to claim anything that
 * stopped being scheduled (or lost its approval) in between.
 */
export function publishClaimWhere(id: string) {
  return { id, status: "SCHEDULED" as PostStatus, approvedAt: { not: null } };
}

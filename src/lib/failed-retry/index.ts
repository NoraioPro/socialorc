import { PostStatus } from "@prisma/client";

export type RetryEligiblePost = {
  status: PostStatus | string;
  approvedAt: Date | string | null;
  socialAccountId: string | null;
};

export type RetryBlockReason =
  | "not_failed"
  | "not_approved"
  | "missing_account"
  | null;

/** Gate-safe: only previously approved FAILED posts may re-enter the queue. */
export function getRetryBlockReason(post: RetryEligiblePost): RetryBlockReason {
  if (post.status !== PostStatus.FAILED && post.status !== "FAILED") {
    return "not_failed";
  }
  if (!post.approvedAt) {
    return "not_approved";
  }
  if (!post.socialAccountId) {
    return "missing_account";
  }
  return null;
}

export function canRetryFailedPublish(post: RetryEligiblePost): boolean {
  return getRetryBlockReason(post) === null;
}

export function defaultRetrySchedule(from: Date = new Date(), offsetMs = 60_000): Date {
  return new Date(from.getTime() + offsetMs);
}

export function retryBlockMessage(reason: Exclude<RetryBlockReason, null>): string {
  switch (reason) {
    case "not_failed":
      return "Only FAILED posts can be retried";
    case "not_approved":
      return "Post must have been approved before retry (approval gate)";
    case "missing_account":
      return "Post must be linked to a social account before retry";
  }
}

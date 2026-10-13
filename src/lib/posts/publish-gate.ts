/**
 * The approval gate, in one place, for the *immediate* publish path.
 *
 * `docs/AGENT-BRIEF.md` rule 1: only approved content may reach a platform, and
 * only scheduled content is published by the worker. Scheduling enforces this
 * (`schedule/route.ts` refuses anything that is not APPROVED), but
 * `POST /api/posts/[id]/publish` — "publish now" — shipped without the check, so
 * any DRAFT could be pushed live with one click from the post card.
 *
 * This predicate is the fix: pure, Prisma-free, and used by both the route and
 * the card that renders the button, so the UI and the server cannot disagree
 * about whether a post is publishable.
 *
 * `approvedAt` is the actual proof of approval. The status alone is not enough:
 * editing a post returns it to DRAFT and clears `approvedAt`
 * (`posts/[id]/route.ts`), and a status can be stale in a race.
 */

export type PublishGateInput = {
  status: string;
  approvedAt: Date | null;
  platformPostId?: string | null;
};

export type PublishBlock = "already_published" | "publishing" | "not_approved";

/** The only statuses a "publish now" click may claim a post out of. */
export const PUBLISHABLE_STATUSES = ["APPROVED", "SCHEDULED"] as const;

/** Why this post must not be sent right now; `null` means send it. */
export function publishBlockReason(post: PublishGateInput): PublishBlock | null {
  if (post.platformPostId) return "already_published";
  if (post.status === "PUBLISHING") return "publishing";
  if (!post.approvedAt) return "not_approved";
  if (!PUBLISHABLE_STATUSES.includes(post.status as (typeof PUBLISHABLE_STATUSES)[number])) {
    return "not_approved";
  }
  return null;
}

/** User-facing reason; the gate is never a silent 500. */
export function publishBlockMessage(reason: PublishBlock): string {
  switch (reason) {
    case "already_published":
      return "This post has already been published";
    case "publishing":
      return "This post is already being published";
    case "not_approved":
      return "Posts must be approved and submitted before they can be published";
  }
}

/** HTTP status for a blocked publish: only the approval refusal is a bad request. */
export function publishBlockStatus(reason: PublishBlock): number {
  return reason === "not_approved" ? 400 : 409;
}

/** Code returned to the client, so the UI can tell the cases apart. */
export function publishBlockCode(reason: PublishBlock): string {
  return reason === "not_approved" ? "APPROVAL_REQUIRED" : "PUBLISH_CONFLICT";
}

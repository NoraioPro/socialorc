import { createHash } from "node:crypto";
import type { Platform } from "@prisma/client";

/**
 * Remembers an upload a platform is still processing, across publish attempts.
 *
 * Instagram Reels and X video are asynchronous: the upload is accepted, then
 * processed for seconds to minutes before it can be published. A publish run
 * has a hard ceiling (`maxDuration = 60` on the publish routes), so an adapter
 * may only wait a few seconds; past that it reports `MEDIA_PROCESSING` and the
 * worker retries on a later tick. Without memory, that retry would upload the
 * video *again* and start the processing clock from zero — a long video would
 * never finish. With it, the retry resumes polling the same container.
 *
 * Nothing here can cause a duplicate post: what is remembered is an upload that
 * has NOT been published (a container / media id), and it is marked done the
 * moment the publish call succeeds.
 *
 * Keyed by the SocialOrc post id (`PostOptions.idempotencyKey`). Callers that
 * pass no key get no memory — they still never double-publish, they just
 * re-upload on retry.
 *
 * The post id alone does not identify *what* was uploaded: an edit between two
 * attempts changes the caption or media, and resuming the old container would
 * publish the stale version. So each entry carries a fingerprint of the content
 * it was made from (`inFlightFingerprint`), and `get` discards an entry whose
 * fingerprint does not match the content being published now. Editing a post
 * also drops its entries outright (`discardInFlightMediaForPost`).
 *
 * The default store uses the existing `PublishingJob` table (its unique
 * `idempotencyKey` is exactly this contract), loaded lazily so adapters stay
 * importable in unit tests without a database. Tests swap in a memory store.
 */

export interface InFlightMediaStore {
  /**
   * The remembered upload id, or null when none is pending, it went stale, or
   * it was made from different content (`fingerprint` mismatch — the entry is
   * discarded so the caller uploads afresh).
   */
  get(key: string, fingerprint: string): Promise<string | null>;
  put(
    key: string,
    value: string,
    ctx: { postId: string; platform: Platform; fingerprint: string },
  ): Promise<void>;
  /** The upload was published (or abandoned): forget it. */
  done(key: string, ctx: { publishedId?: string }): Promise<void>;
}

/** Instagram containers expire after 24h; X upload sessions after ~24h. Stay inside that. */
export const IN_FLIGHT_MAX_AGE_MS = 23 * 60 * 60_000;

/**
 * What an upload was made from: the caption and the media URLs, in order. Any
 * edit to either yields a different fingerprint.
 */
export function inFlightFingerprint(text: string, mediaUrls: readonly string[]): string {
  return createHash("sha256").update(JSON.stringify([text, mediaUrls])).digest("hex");
}

export function inFlightKey(platform: Platform, kind: string, postId: string): string {
  return `${platform.toLowerCase()}:${kind}:${postId}`;
}

let override: InFlightMediaStore | null = null;

/** Test hook: replace the store (pass null to restore the database store). */
export function setInFlightMediaStore(store: InFlightMediaStore | null): void {
  override = store;
}

export async function inFlightMediaStore(): Promise<InFlightMediaStore> {
  if (override) return override;
  return prismaStore;
}

export function createMemoryInFlightStore(): InFlightMediaStore & {
  entries: Map<string, string>;
  fingerprints: Map<string, string>;
} {
  const entries = new Map<string, string>();
  const fingerprints = new Map<string, string>();
  return {
    entries,
    fingerprints,
    async get(key, fingerprint) {
      const value = entries.get(key);
      if (value === undefined) return null;
      if (fingerprints.get(key) !== fingerprint) {
        entries.delete(key);
        fingerprints.delete(key);
        return null;
      }
      return value;
    },
    async put(key, value, ctx) {
      entries.set(key, value);
      fingerprints.set(key, ctx.fingerprint);
    },
    async done(key) {
      entries.delete(key);
      fingerprints.delete(key);
    },
  };
}

/** Minimal client so the edit-time discard is testable without a database. */
export interface InFlightDiscardClient {
  publishingJob: {
    updateMany(args: {
      where: { postId: string; status: string };
      data: { status: string; completedAt: Date };
    }): PromiseLike<{ count: number }>;
  };
}

/**
 * Forget every upload still in flight for a post. Called when an edit changes
 * the content or media, so no later attempt can resume an upload of the old
 * version. (The fingerprint check in `get` would catch it too; this keeps the
 * rows honest instead of leaving them "processing".)
 */
export async function discardInFlightMediaForPost(
  client: InFlightDiscardClient,
  postId: string,
  now: Date = new Date(),
): Promise<number> {
  const { count } = await client.publishingJob.updateMany({
    where: { postId, status: "processing" },
    data: { status: "cancelled", completedAt: now },
  });
  return count;
}

const prismaStore: InFlightMediaStore = {
  async get(key, fingerprint) {
    const { default: prisma } = await import("@/lib/prisma");
    const row = await prisma.publishingJob.findUnique({
      where: { idempotencyKey: key },
      select: { status: true, externalPostId: true, updatedAt: true, contentFingerprint: true },
    });
    if (!row || row.status !== "processing" || !row.externalPostId) return null;
    if (Date.now() - row.updatedAt.getTime() > IN_FLIGHT_MAX_AGE_MS) return null;
    if (row.contentFingerprint !== fingerprint) {
      // Made from content that has since been edited: never resume it.
      await prisma.publishingJob.updateMany({
        where: { idempotencyKey: key, status: "processing" },
        data: { status: "cancelled", completedAt: new Date() },
      });
      return null;
    }
    return row.externalPostId;
  },

  async put(key, value, ctx) {
    const { default: prisma } = await import("@/lib/prisma");
    const post = await prisma.post.findUnique({
      where: { id: ctx.postId },
      select: { userId: true, socialAccountId: true },
    });
    // No linked account means nothing can be published anyway; without the
    // row a retry simply re-uploads.
    if (!post?.socialAccountId) return;
    await prisma.publishingJob.upsert({
      where: { idempotencyKey: key },
      create: {
        idempotencyKey: key,
        userId: post.userId,
        socialAccountId: post.socialAccountId,
        postId: ctx.postId,
        platform: ctx.platform,
        publishMethod: "direct",
        status: "processing",
        externalPostId: value,
        contentFingerprint: ctx.fingerprint,
        attemptCount: 1,
        startedAt: new Date(),
      },
      update: {
        status: "processing",
        externalPostId: value,
        contentFingerprint: ctx.fingerprint,
        completedAt: null,
        attemptCount: { increment: 1 },
      },
    });
  },

  async done(key, ctx) {
    const { default: prisma } = await import("@/lib/prisma");
    await prisma.publishingJob.updateMany({
      where: { idempotencyKey: key },
      data: {
        status: "published",
        completedAt: new Date(),
        ...(ctx.publishedId ? { externalPostId: ctx.publishedId } : {}),
      },
    });
  },
};

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
 * The default store uses the existing `PublishingJob` table (its unique
 * `idempotencyKey` is exactly this contract), loaded lazily so adapters stay
 * importable in unit tests without a database. Tests swap in a memory store.
 */

export interface InFlightMediaStore {
  /** The remembered upload id, or null when none is pending (or it went stale). */
  get(key: string): Promise<string | null>;
  put(key: string, value: string, ctx: { postId: string; platform: Platform }): Promise<void>;
  /** The upload was published (or abandoned): forget it. */
  done(key: string, ctx: { publishedId?: string }): Promise<void>;
}

/** Instagram containers expire after 24h; X upload sessions after ~24h. Stay inside that. */
export const IN_FLIGHT_MAX_AGE_MS = 23 * 60 * 60_000;

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

export function createMemoryInFlightStore(): InFlightMediaStore & { entries: Map<string, string> } {
  const entries = new Map<string, string>();
  return {
    entries,
    async get(key) {
      return entries.get(key) ?? null;
    },
    async put(key, value) {
      entries.set(key, value);
    },
    async done(key) {
      entries.delete(key);
    },
  };
}

const prismaStore: InFlightMediaStore = {
  async get(key) {
    const { default: prisma } = await import("@/lib/prisma");
    const row = await prisma.publishingJob.findUnique({
      where: { idempotencyKey: key },
      select: { status: true, externalPostId: true, updatedAt: true },
    });
    if (!row || row.status !== "processing" || !row.externalPostId) return null;
    if (Date.now() - row.updatedAt.getTime() > IN_FLIGHT_MAX_AGE_MS) return null;
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
        attemptCount: 1,
        startedAt: new Date(),
      },
      update: { status: "processing", externalPostId: value, attemptCount: { increment: 1 } },
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

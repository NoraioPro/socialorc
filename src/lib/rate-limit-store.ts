/**
 * Counting the hits. Kept apart from the arithmetic so the rules stay testable
 * without a database and the storage stays swappable.
 *
 * The increment is one atomic upsert on a unique key: two requests landing in the
 * same window cannot both read "no hits yet" and both be allowed, which is the
 * failure mode of read-then-write counting.
 */
import prisma from "@/lib/prisma";
import {
  RATE_LIMITS,
  type RateLimitBucket,
  decideRateLimit,
  rateLimitKey,
  type RateLimitDecision,
  windowStart,
} from "@/lib/rate-limit";

export async function consumeRateLimit(
  bucket: RateLimitBucket,
  subject: string,
  now: Date = new Date()
): Promise<RateLimitDecision> {
  const policy = RATE_LIMITS[bucket];
  const window = windowStart(now, policy.windowMs);
  const key = rateLimitKey(bucket, subject, window);

  const counter = await prisma.rateLimitCounter.upsert({
    where: { key },
    create: { key, bucket, subject, windowStart: window, count: 1 },
    update: { count: { increment: 1 } },
    select: { count: true, windowStart: true },
  });

  return decideRateLimit({ count: counter.count, windowStart: counter.windowStart }, policy, now);
}

/**
 * Read the budget without spending any of it.
 *
 * Sign-in uses this and then spends only on a *failed* attempt, so somebody
 * hammering an account cannot lock the real owner out of it: the correct password
 * still goes through while the guesses are counted.
 */
export async function peekRateLimit(
  bucket: RateLimitBucket,
  subject: string,
  now: Date = new Date()
): Promise<RateLimitDecision> {
  const policy = RATE_LIMITS[bucket];
  const window = windowStart(now, policy.windowMs);
  const counter = await prisma.rateLimitCounter.findUnique({
    where: { key: rateLimitKey(bucket, subject, window) },
    select: { count: true, windowStart: true },
  });

  return decideRateLimit(
    { count: counter?.count ?? 0, windowStart: counter?.windowStart ?? window },
    policy,
    now
  );
}

/** Drop windows that can no longer be decided against. Called opportunistically. */
export async function pruneRateLimitCounters(now: Date = new Date()): Promise<number> {
  const oldest = new Date(now.getTime() - 24 * 60 * 60_000);
  const { count } = await prisma.rateLimitCounter.deleteMany({
    where: { windowStart: { lt: oldest } },
  });
  return count;
}

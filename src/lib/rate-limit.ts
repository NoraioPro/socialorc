/**
 * Inbound rate limiting, as arithmetic.
 *
 * Fixed windows, counted per (bucket, subject): a bucket is what is being
 * protected, a subject is who is asking — an IP for things that need no session,
 * a user id otherwise. Deliberately simple and deliberately local: it needs no
 * external service, and the number it enforces is in one place instead of being
 * implied by whatever the platform's edge happens to do.
 *
 * Pure, so the boundaries can be tested without a database or a clock.
 */

export interface RateLimitPolicy {
  /** Requests allowed per window, per subject. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
  /** What the caller is told when it runs out. */
  describe: string;
}

export const RATE_LIMITS = {
  /** Credential stuffing and password spraying live here. */
  login: { limit: 10, windowMs: 15 * 60_000, describe: "sign-in attempts" },
  /** Account creation is expensive (bcrypt 12) and a spam target. */
  register: { limit: 10, windowMs: 60 * 60_000, describe: "sign-ups" },
  /** Every call spends the customer's own AI credit. */
  ai: { limit: 60, windowMs: 60 * 60_000, describe: "AI generations" },
  /** Upload tokens mint write credentials. */
  upload: { limit: 120, windowMs: 60 * 60_000, describe: "uploads" },
} as const satisfies Record<string, RateLimitPolicy>;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

/** The window a moment belongs to, aligned to the window length. */
export function windowStart(now: Date, windowMs: number): Date {
  return new Date(Math.floor(now.getTime() / windowMs) * windowMs);
}

export interface RateLimitState {
  /** Hits recorded in this window, including the one being decided. */
  count: number;
  windowStart: Date;
}

export interface RateLimitDecision {
  allowed: boolean;
  remaining: number;
  /** Milliseconds until the next window, for a Retry-After header. */
  retryAfterMs: number;
}

export function decideRateLimit(
  state: RateLimitState,
  policy: RateLimitPolicy,
  now: Date = new Date()
): RateLimitDecision {
  const elapsed = now.getTime() - state.windowStart.getTime();
  const retryAfterMs = Math.max(0, policy.windowMs - elapsed);
  return {
    allowed: state.count <= policy.limit,
    // Never negative: a caller that is over the limit has nothing left, not a
    // negative allowance it could reason about.
    remaining: Math.max(0, policy.limit - state.count),
    retryAfterMs,
  };
}

export function rateLimitKey(bucket: RateLimitBucket, subject: string, window: Date): string {
  return `${bucket}:${subject}:${window.getTime()}`;
}

export function rateLimitMessage(bucket: RateLimitBucket, retryAfterMs: number): string {
  const policy = RATE_LIMITS[bucket];
  const minutes = Math.max(1, Math.ceil(retryAfterMs / 60_000));
  return `Too many ${policy.describe} (limit ${policy.limit} per ${Math.round(
    policy.windowMs / 60_000
  )} minutes). Try again in about ${minutes} minute${minutes === 1 ? "" : "s"}.`;
}

/**
 * Who is asking. Behind Vercel the client address is the first hop in
 * `x-forwarded-for`; falling back to a constant means a missing header shares one
 * budget instead of getting an unlimited one.
 */
export function rateLimitSubjectFromHeaders(headers: Headers, fallbackUserId?: string | null): string {
  if (fallbackUserId) return `user:${fallbackUserId}`;
  const forwarded = headers.get("x-forwarded-for") ?? "";
  const first = forwarded.split(",")[0]?.trim();
  if (first) return `ip:${first}`;
  const real = headers.get("x-real-ip")?.trim();
  return real ? `ip:${real}` : "ip:unknown";
}

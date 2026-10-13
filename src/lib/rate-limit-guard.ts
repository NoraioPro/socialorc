import { NextResponse } from "next/server";
import { consumeRateLimit } from "@/lib/rate-limit-store";
import { type RateLimitBucket, rateLimitMessage } from "@/lib/rate-limit";

/**
 * Enforce a bucket, or return nothing.
 *
 * Returns the 429 to send when the subject is over its budget, so a route reads as
 * one line: `const limited = await enforceRateLimit(...); if (limited) return limited;`
 * The message says what the limit is and how long to wait, because a bare 429 tells
 * the person nothing they can act on.
 */
export async function enforceRateLimit(
  bucket: RateLimitBucket,
  subject: string,
  now: Date = new Date()
): Promise<NextResponse | null> {
  const decision = await consumeRateLimit(bucket, subject, now);
  if (decision.allowed) return null;

  return NextResponse.json(
    {
      error: rateLimitMessage(bucket, decision.retryAfterMs),
      code: "RATE_LIMITED",
      retryAfterMs: decision.retryAfterMs,
    },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil(decision.retryAfterMs / 1000)),
        "X-RateLimit-Remaining": String(decision.remaining),
      },
    }
  );
}

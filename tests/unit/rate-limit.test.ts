import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  RATE_LIMITS,
  decideRateLimit,
  rateLimitKey,
  rateLimitMessage,
  rateLimitSubjectFromHeaders,
  windowStart,
} from "../../src/lib/rate-limit";

/**
 * There was no inbound rate limiting at all: sign-in, sign-up, upload tokens and
 * AI generation could be called in a loop. The numbers below are the whole policy,
 * so these assertions are what "the limit" means.
 */

const POLICY = { limit: 3, windowMs: 60_000, describe: "things" };
const WINDOW = new Date("2026-10-13T12:00:00.000Z");

test("windows are aligned, so two requests in the same window share a budget", () => {
  assert.equal(windowStart(new Date("2026-10-13T12:00:00.000Z"), 60_000).getTime(), WINDOW.getTime());
  assert.equal(windowStart(new Date("2026-10-13T12:00:59.999Z"), 60_000).getTime(), WINDOW.getTime());
  assert.equal(windowStart(new Date("2026-10-13T12:01:00.000Z"), 60_000).getTime(), WINDOW.getTime() + 60_000);
});

test("the limit is inclusive, and the next request is refused", () => {
  const at = (count: number) =>
    decideRateLimit({ count, windowStart: WINDOW }, POLICY, new Date("2026-10-13T12:00:10.000Z"));
  assert.equal(at(1).allowed, true);
  assert.equal(at(1).remaining, 2);
  assert.equal(at(3).allowed, true, "the third request is allowed");
  assert.equal(at(3).remaining, 0);
  assert.equal(at(4).allowed, false);
  assert.equal(at(4).remaining, 0, "remaining never goes negative");
});

test("an over-limit caller is told how long to wait, and it is not in the past", () => {
  const decision = decideRateLimit(
    { count: 9, windowStart: WINDOW },
    POLICY,
    new Date("2026-10-13T12:00:45.000Z")
  );
  assert.equal(decision.allowed, false);
  assert.equal(decision.retryAfterMs, 15_000);
  assert.ok(decision.retryAfterMs > 0);
});

test("keys separate bucket, subject and window", () => {
  assert.equal(
    rateLimitKey("login", "email:a@b.c", WINDOW),
    `login:email:a@b.c:${WINDOW.getTime()}`
  );
  assert.notEqual(
    rateLimitKey("login", "email:a@b.c", WINDOW),
    rateLimitKey("register", "email:a@b.c", WINDOW)
  );
  assert.notEqual(
    rateLimitKey("login", "email:a@b.c", WINDOW),
    rateLimitKey("login", "email:a@b.c", new Date(WINDOW.getTime() + 60_000))
  );
});

test("the subject is a user when signed in, else the client address", () => {
  const headers = new Headers({ "x-forwarded-for": "203.0.113.7, 70.41.3.18" });
  assert.equal(rateLimitSubjectFromHeaders(headers), "ip:203.0.113.7", "first hop only");
  assert.equal(rateLimitSubjectFromHeaders(headers, "user_1"), "user:user_1");
  assert.equal(rateLimitSubjectFromHeaders(new Headers()), "ip:unknown", "no header must not mean no limit");
  assert.equal(
    rateLimitSubjectFromHeaders(new Headers({ "x-real-ip": "198.51.100.9" })),
    "ip:198.51.100.9"
  );
});

test("the refusal says what the limit is, in words a person can act on", () => {
  const message = rateLimitMessage("login", 5 * 60_000);
  assert.match(message, /sign-in attempts/i);
  assert.match(message, /10 per 15 minutes/);
  assert.match(message, /5 minutes/);
  // A partial minute is still "1 minute", never "0 minutes".
  assert.match(rateLimitMessage("ai", 30_000), /1 minute\b/);
});

test("every route that spends money or credentials is limited", () => {
  for (const bucket of ["login", "register", "ai", "upload"] as const) {
    assert.ok(RATE_LIMITS[bucket].limit > 0, `${bucket} has no limit`);
    assert.ok(RATE_LIMITS[bucket].windowMs > 0, `${bucket} has no window`);
    assert.ok(RATE_LIMITS[bucket].describe.length > 0);
  }
});

test("the limits are wired into the routes, not just defined", () => {
  const wired: [string, string][] = [
    ["src/lib/auth.ts", 'peekRateLimit("login"'],
    ["src/app/api/auth/register/route.ts", 'enforceRateLimit("register"'],
    ["src/app/api/ai-studio/route.ts", 'enforceRateLimit("ai"'],
    ["src/app/api/posts/generate/route.ts", 'enforceRateLimit("ai"'],
    ["src/app/api/media/upload-token/route.ts", 'enforceRateLimit("upload"'],
  ];
  for (const [file, needle] of wired) {
    assert.ok(readFileSync(file, "utf8").includes(needle), `${file} does not call ${needle})`);
  }
});

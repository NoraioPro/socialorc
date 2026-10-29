import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  classifyAdapterError,
  isOutcomeAmbiguous,
  isRetryable,
  requiresReconnect,
} from "../../src/lib/adapters/errors";
import {
  LOST_RUN_MESSAGE,
  recoverStrandedPublishNow,
  type StrandedPublishClient,
} from "../../src/lib/jobs/lease-recovery";

/**
 * Regression tests for the publishing findings in docs/AUDIT-MVP-2026-10-29.md:
 * P-02 (ambiguous send retried), P-03 (publish-now stranded in PUBLISHING),
 * P-04 (refresh failure never flags the account), D-01 (orphan job on delete).
 */

test("P-02: an unclassified failure after the send is ambiguous", () => {
  assert.equal(isOutcomeAmbiguous("UNKNOWN", "something nobody has seen"), true);
});

test("P-02: a connection that may have been delivered is ambiguous; one that was refused is not", () => {
  assert.equal(isOutcomeAmbiguous("NETWORK", "fetch failed (ECONNRESET)"), true);
  assert.equal(isOutcomeAmbiguous("NETWORK", "fetch failed"), true);
  assert.equal(isOutcomeAmbiguous("NETWORK", "fetch failed (ECONNREFUSED)"), false);
  assert.equal(isOutcomeAmbiguous("NETWORK", "getaddrinfo ENOTFOUND api.example"), false);
  // undici refuses a blocked port before sending anything (the durability suite's dead API base).
  assert.equal(isOutcomeAmbiguous("NETWORK", "fetch failed (bad port)"), false);
});

test("P-02: explicit rejections stay retryable and are not ambiguous", () => {
  for (const code of ["RATE_LIMITED", "PLATFORM_UNAVAILABLE", "MEDIA_PROCESSING"] as const) {
    assert.equal(isOutcomeAmbiguous(code, "x"), false, code);
    assert.equal(isRetryable(code), true, code);
  }
});

test("P-02: the worker only auto-retries when the send is not ambiguous", () => {
  const cron = fs.readFileSync("src/app/api/cron/publish/route.ts", "utf8");
  assert.match(cron, /const ambiguous = Boolean\(opts\.sent\) && isOutcomeAmbiguous\(code, error\)/);
  assert.match(cron, /const retryable = !ambiguous && \(isRetryable\(code\) \|\| code === "UNKNOWN"\)/);
  // Both the adapter-failure path and the thrown-error path report that a send began.
  assert.match(cron, /sent: sendStarted && !resumePublishId/);
  assert.match(cron, /sent: sendStarted,/);
});

test("P-04: a revoked refresh grant is classified as a dead credential, not 'unknown'", () => {
  for (const message of [
    "invalid_grant",
    "Token refresh failed: refresh token has been revoked",
    "The refresh token is invalid",
  ]) {
    const code = classifyAdapterError({ message });
    assert.equal(code, "AUTH_INVALID", message);
    assert.equal(requiresReconnect(code), true, message);
  }
});

test("P-04: the pre-publish refresh failure passes the account so it can be flagged", () => {
  const cron = fs.readFileSync("src/app/api/cron/publish/route.ts", "utf8");
  const refreshCatch = cron.slice(cron.indexOf("Token refresh failed:") - 600, cron.indexOf("Token refresh failed:"));
  assert.match(refreshCatch, /accountId: post\.socialAccount\.id/);
});

function strandedClient(opts: {
  candidates: string[];
  owned: string[];
}): { client: StrandedPublishClient; writes: Record<string, unknown>[] } {
  const writes: Record<string, unknown>[] = [];
  return {
    writes,
    client: {
      post: {
        async findMany() {
          return opts.candidates.map((id) => ({ id }));
        },
        async updateMany(args) {
          writes.push(args as unknown as Record<string, unknown>);
          return { count: (args.where.id as { in: string[] }).in.length };
        },
      },
      scheduledJob: {
        async findMany() {
          return opts.owned.map((postId) => ({ postId }));
        },
      },
    },
  };
}

test("P-03: a publish-now post stranded in PUBLISHING with no job is closed as FAILED/unknown", async () => {
  const { client, writes } = strandedClient({ candidates: ["p1", "p2"], owned: [] });
  const closed = await recoverStrandedPublishNow(client, new Date("2026-10-29T12:00:00Z"));
  assert.equal(closed, 2);
  const write = writes[0] as { where: { status: string }; data: { status: string; errorMessage: string } };
  assert.equal(write.where.status, "PUBLISHING");
  assert.equal(write.data.status, "FAILED");
  assert.equal(write.data.errorMessage, LOST_RUN_MESSAGE);
});

test("P-03: a PUBLISHING post that a job still owns is left to the worker", async () => {
  const { client, writes } = strandedClient({ candidates: ["p1", "p2"], owned: ["p1"] });
  const closed = await recoverStrandedPublishNow(client, new Date("2026-10-29T12:00:00Z"));
  assert.equal(closed, 1);
  assert.deepEqual((writes[0] as { where: { id: { in: string[] } } }).where.id, { in: ["p2"] });
});

test("P-03: nothing stale means no write", async () => {
  const { client, writes } = strandedClient({ candidates: [], owned: [] });
  assert.equal(await recoverStrandedPublishNow(client, new Date()), 0);
  assert.equal(writes.length, 0);
});

test("P-03: the worker runs the stranded-post recovery every tick", () => {
  const cron = fs.readFileSync("src/app/api/cron/publish/route.ts", "utf8");
  assert.match(cron, /recoverStrandedPublishNow\(prisma, now\)/);
});

test("D-01: deleting a post removes its job in the same transaction", () => {
  const route = fs.readFileSync("src/app/api/posts/[id]/route.ts", "utf8");
  const del = route.slice(route.indexOf("export async function DELETE"));
  assert.match(del, /prisma\.\$transaction\(async \(tx\)/);
  assert.match(del, /tx\.scheduledJob\.deleteMany\(\{ where: \{ postId: id \} \}\)/);
});

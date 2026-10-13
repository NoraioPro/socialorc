import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PROCESSING_LEASE_MS } from "../../src/lib/jobs/lease-recovery";

/**
 * The worker's relationship with its function timeout.
 *
 * A function killed mid-send leaves the platform's answer unknown — the one
 * state the code cannot recover from, because it cannot tell "never sent" from
 * "sent and lost the id". So: an explicit ceiling, a budget that stops claiming
 * work before the ceiling, and a lease that is longer than the ceiling so a
 * killed run's job is not reclaimed while the first run might still be alive.
 */

const cron = readFileSync("src/app/api/cron/publish/route.ts", "utf8");
const publishNow = readFileSync("src/app/api/posts/[id]/publish/route.ts", "utf8");

function literalMaxDuration(source: string): number {
  const match = source.match(/export const maxDuration = (\d+);/);
  assert.ok(match, "route must export a literal maxDuration");
  return Number(match[1]);
}

test("the worker declares an explicit function ceiling", () => {
  const seconds = literalMaxDuration(cron);
  assert.ok(seconds >= 30 && seconds <= 300, `maxDuration ${seconds} looks wrong`);
});

test("an immediate publish declares the same ceiling", () => {
  assert.ok(literalMaxDuration(publishNow) >= 30);
});

test("the lease outlives the function, so a killed run is not reclaimed underneath", () => {
  const seconds = literalMaxDuration(cron);
  assert.ok(
    PROCESSING_LEASE_MS > seconds * 1000,
    `lease ${PROCESSING_LEASE_MS}ms must exceed the ${seconds}s function ceiling`
  );
});

test("the budget stops claiming work before the ceiling, not at it", () => {
  const seconds = literalMaxDuration(cron);
  const budget = cron.match(/const WORKER_TIME_BUDGET_MS = \(maxDuration - (\d+)\) \* 1000;/);
  assert.ok(budget, "the budget must be derived from maxDuration so the two cannot drift");
  const reserve = Number(budget[1]);
  assert.ok(reserve > 0, "claiming work with zero reserve is the bug being prevented");
  assert.ok(reserve < seconds, "the reserve must be smaller than the whole ceiling");
});

test("the budget is checked before the job is claimed, not after", () => {
  const guard = cron.indexOf("WORKER_TIME_BUDGET_MS)");
  const claim = cron.indexOf("const claim = await prisma.scheduledJob.updateMany(");
  assert.ok(guard > 0 && claim > 0, "both the budget check and the claim must exist");
  assert.ok(
    guard < claim,
    "the budget must be checked before the claim: a job claimed with no time left is a send cut off mid-flight"
  );
});

test("a deferred job is reported, so a starved queue is visible", () => {
  assert.match(cron, /results\.deferred \+= 1/);
  assert.match(cron, /deferred: number;/);
});

/**
 * A retry or reschedule after a pending-publish timeout must re-queue a SEND,
 * not a poll. Leftover `pendingPublishId`/`pendingSince` made the worker take
 * the poll-only path, expect PUBLISHING, and fail the SCHEDULED post with
 * "Invalid post status: SCHEDULED".
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  CLEARED_PENDING_PUBLISH,
  requeueJobData,
} from "../../src/lib/jobs/pending-publish";

const at = new Date("2026-10-15T12:00:00.000Z");

test("requeueJobData is a fresh send with no poll state", () => {
  const data = requeueJobData(at);
  assert.equal(data.status, "PENDING");
  assert.equal(data.scheduledAt, at);
  assert.equal(data.attempts, 0);
  assert.equal(data.pendingPublishId, null);
  assert.equal(data.pendingSince, null);
  assert.equal(data.startedAt, null);
  assert.equal(data.completedAt, null);
  assert.equal(data.errorMessage, null);
});

test("CLEARED_PENDING_PUBLISH nulls both poll fields", () => {
  assert.deepEqual({ ...CLEARED_PENDING_PUBLISH }, { pendingPublishId: null, pendingSince: null });
});

for (const route of ["retry", "schedule"]) {
  test(`${route} route uses requeueJobData for both upsert branches`, () => {
    const src = readFileSync(`src/app/api/posts/[id]/${route}/route.ts`, "utf8");
    const upsert = src.slice(src.indexOf("scheduledJob.upsert"));
    assert.match(src, /const jobData = requeueJobData\(scheduledFor\)/);
    assert.match(upsert, /create: \{[^}]*\.\.\.jobData \}/);
    assert.match(upsert, /update: jobData/);
  });
}

test("the worker clears poll state when it closes a pending publish as FAILED", () => {
  const src = readFileSync("src/app/api/cron/publish/route.ts", "utf8");
  const pendingBranch = src.slice(src.indexOf("if (opts.pending) {"), src.indexOf("const exhausted ="));
  assert.match(pendingBranch, /status: JobStatus\.FAILED,[\s\S]*?\.\.\.CLEARED_PENDING_PUBLISH/);
});

/**
 * A publish the platform accepted but has not finished is FOLLOWED, never
 * re-sent. These pin the job-state rules the worker and the publish-now route
 * share (src/lib/jobs/pending-publish.ts), and the lease-recovery exception for
 * jobs that were only polling.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import {
  PENDING_POLL_INTERVAL_MS,
  PENDING_PUBLISH_MAX_WAIT_MS,
  handOffPendingPublish,
  pendingExpired,
  pendingPollJobData,
} from "../../src/lib/jobs/pending-publish";
import {
  recoverStaleProcessingJobs,
  type LeaseRecoveryClient,
} from "../../src/lib/jobs/lease-recovery";

const now = new Date("2026-10-14T12:00:00.000Z");

test("a poll is re-armed in the future, keeps its first-accepted time, and sends nothing", () => {
  const since = new Date(now.getTime() - 5 * 60_000);
  const data = pendingPollJobData({ publishId: "pub_1", pendingSince: since, now });
  assert.equal(data.status, "PENDING");
  assert.equal(data.pendingPublishId, "pub_1");
  assert.equal(data.pendingSince, since);
  assert.equal(data.scheduledAt.getTime(), now.getTime() + PENDING_POLL_INTERVAL_MS);
  assert.equal(data.completedAt, null);
  assert.equal("attempts" in data, false, "re-arming must not touch the retry budget");
});

test("the first re-arm stamps pendingSince", () => {
  const data = pendingPollJobData({ publishId: "pub_1", pendingSince: null, now });
  assert.equal(data.pendingSince, now);
});

test("polling is bounded", () => {
  assert.equal(pendingExpired(null, now), false);
  assert.equal(pendingExpired(new Date(now.getTime() - 60_000), now), false);
  assert.equal(
    pendingExpired(new Date(now.getTime() - PENDING_PUBLISH_MAX_WAIT_MS - 1), now),
    true,
  );
});

test("publish-now hands a pending post to the worker via the post's job", async () => {
  const upserts: Array<{ where: unknown; create: Record<string, unknown>; update: Record<string, unknown> }> = [];
  await handOffPendingPublish(
    {
      scheduledJob: {
        async upsert(args) {
          upserts.push(args as never);
          return {};
        },
      },
    },
    { postId: "post_1", workspaceId: "ws_1", publishId: "pub_1", now },
  );
  assert.equal(upserts.length, 1);
  assert.deepEqual(upserts[0].where, { postId: "post_1" });
  assert.equal(upserts[0].create.pendingPublishId, "pub_1");
  assert.equal(upserts[0].create.workspaceId, "ws_1");
  assert.equal(upserts[0].update.pendingPublishId, "pub_1");
  assert.equal(upserts[0].update.status, "PENDING");
});

test("lease recovery resumes a dead POLL instead of failing it", async () => {
  const writes: Array<{ model: string; where: Record<string, unknown>; data: Record<string, unknown> }> = [];
  const client = {
    scheduledJob: {
      async findMany() {
        return [
          { id: "job_poll", postId: "post_poll", attempts: 3, pendingPublishId: "pub_1" },
          { id: "job_send", postId: "post_send", attempts: 1, pendingPublishId: null },
        ];
      },
      async updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }) {
        writes.push({ model: "job", ...args });
        return { count: (args.where.id as { in: string[] }).in.length };
      },
    },
    post: {
      async updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }) {
        writes.push({ model: "post", ...args });
        return { count: (args.where.id as { in: string[] }).in.length };
      },
    },
  };

  const result = await recoverStaleProcessingJobs(client as unknown as LeaseRecoveryClient, now, 3);
  assert.equal(result.resumed, 1);
  assert.equal(result.deadRuns, 1);

  const resume = writes.find((w) => w.model === "job" && w.data.status === "PENDING");
  assert.deepEqual(resume?.where.id, { in: ["job_poll"] });

  // The polling job's post stays PUBLISHING; only the dead SEND's post is released.
  const release = writes.find((w) => w.model === "post");
  assert.deepEqual(release?.where.id, { in: ["post_send"] });
});

test("the worker never calls createPost for a job that is polling", () => {
  // Wiring check on the route source: the resumed path reads status only.
  const cron = readFileSync("src/app/api/cron/publish/route.ts", "utf8");
  assert.match(cron, /if \(!resumePublishId\) return adapter\.createPost\(/);
  assert.match(cron, /adapter\.checkPublishStatus\(accessToken, resumePublishId/);
  // Pending jobs stay due even after the send used its retry budget.
  assert.match(cron, /pendingPublishId: \{ not: null \}/);
});

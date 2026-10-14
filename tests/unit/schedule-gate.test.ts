import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  EDIT_BLOCKED_STATUSES,
  POST_CONFLICT_MESSAGE,
  POST_CONFLICT_STATUS,
  approveGuardWhere,
  deleteGuardWhere,
  editGuardWhere,
  jobClaimWhere,
  publishClaimWhere,
  rescheduleGuardWhere,
  rescheduleJobWhere,
  retryGuardWhere,
  scheduleBlockMessage,
  scheduleBlockReason,
  scheduleGuardWhere,
  submitGuardWhere,
  unscheduleGuardWhere,
} from "../../src/lib/posts/transitions";

/**
 * The scheduling gate, tested against the real module.
 *
 * The previous version of this file defined its own `canSchedule`/`canReschedule`
 * and imported nothing from `src`, so it proved only that the test file agreed
 * with itself. These assertions are on the guards the routes actually pass to
 * Prisma — including the `approvedAt` requirement, which is what makes the
 * write itself refuse a post whose approval was cleared by an edit.
 */

const approved = new Date("2026-10-01T10:00:00.000Z");

test("only an approved post with its approval stamp may be scheduled", () => {
  assert.equal(scheduleBlockReason({ status: "APPROVED", approvedAt: approved }), null);
});

test("a DRAFT is refused, with the message the route returns", () => {
  assert.equal(scheduleBlockReason({ status: "DRAFT", approvedAt: null }), "not_approved");
  assert.match(scheduleBlockMessage("DRAFT"), /must be approved/i);
  assert.match(scheduleBlockMessage("DRAFT"), /DRAFT/);
});

test("APPROVED with no approvedAt is refused — the status alone is not proof", () => {
  assert.equal(scheduleBlockReason({ status: "APPROVED", approvedAt: null }), "not_approved");
});

test("the schedule write carries the state it checked", () => {
  assert.deepEqual(scheduleGuardWhere("post_1", "ws_1"), {
    id: "post_1",
    workspaceId: "ws_1",
    status: "APPROVED",
    approvedAt: { not: null },
  });
});

test("the worker's publish claim carries the same approval requirement", () => {
  assert.deepEqual(publishClaimWhere("post_1"), {
    id: "post_1",
    status: "SCHEDULED",
    approvedAt: { not: null },
  });
});

test("unschedule only applies to a scheduled post", () => {
  assert.deepEqual(unscheduleGuardWhere("post_1", "ws_1"), {
    id: "post_1",
    workspaceId: "ws_1",
    status: "SCHEDULED",
  });
});

test("approve and submit only apply while a decision is still pending", () => {
  assert.deepEqual(approveGuardWhere("post_1", "ws_1"), {
    id: "post_1",
    workspaceId: "ws_1",
    status: { in: ["DRAFT", "PENDING_APPROVAL"] },
  });
  assert.deepEqual(submitGuardWhere("post_1", "ws_1"), approveGuardWhere("post_1", "ws_1"));
});

test("a retry needs a failed post that was approved", () => {
  assert.deepEqual(retryGuardWhere("post_1", "ws_1"), {
    id: "post_1",
    workspaceId: "ws_1",
    status: "FAILED",
    approvedAt: { not: null },
  });
});

test("a reschedule needs a post still scheduled and approved, and a job still waiting", () => {
  assert.deepEqual(rescheduleGuardWhere("post_1", "ws_1"), {
    id: "post_1",
    workspaceId: "ws_1",
    status: "SCHEDULED",
    approvedAt: { not: null },
  });
  // Never a PROCESSING job (mid-send) or one the platform already accepted.
  assert.deepEqual(rescheduleJobWhere("post_1"), {
    postId: "post_1",
    status: "PENDING",
    pendingPublishId: null,
  });
});

test("editing is refused for a post that is publishing or published", () => {
  assert.deepEqual(editGuardWhere("post_1", "ws_1"), {
    id: "post_1",
    workspaceId: "ws_1",
    status: { notIn: ["PUBLISHING", "PUBLISHED"] },
  });
  assert.deepEqual([...EDIT_BLOCKED_STATUSES], ["PUBLISHING", "PUBLISHED"]);
});

test("a conflict is a 409 with a message that says what to do", () => {
  assert.equal(POST_CONFLICT_STATUS, 409);
  assert.match(POST_CONFLICT_MESSAGE, /reload/i);
});

test("every status-changing route uses a guard, not a bare update by id", () => {
  // A guard nobody calls is not a fix. Each of these reads as text so the test
  // needs no database, and each names the helper the route must use.
  const expectations: [string, string][] = [
    ["src/app/api/posts/[id]/schedule/route.ts", "scheduleGuardWhere"],
    ["src/app/api/posts/[id]/schedule/route.ts", "unscheduleGuardWhere"],
    ["src/app/api/posts/[id]/approve/route.ts", "approveGuardWhere"],
    ["src/app/api/posts/[id]/approve/route.ts", "submitGuardWhere"],
    ["src/app/api/posts/[id]/retry/route.ts", "retryGuardWhere"],
    ["src/app/api/posts/[id]/reschedule/route.ts", "rescheduleGuardWhere"],
    ["src/app/api/posts/[id]/reschedule/route.ts", "rescheduleJobWhere"],
    ["src/app/api/posts/[id]/route.ts", "editGuardWhere"],
    ["src/app/api/cron/publish/route.ts", "publishClaimWhere"],
    ["src/app/api/cron/publish/route.ts", "jobClaimWhere"],
    ["src/app/api/posts/[id]/route.ts", "deleteGuardWhere"],
  ];

  for (const [file, helper] of expectations) {
    const source = readFileSync(file, "utf8");
    assert.match(source, new RegExp(`${helper}\\(`), `${file} must use ${helper}`);
  }
});

test("the worker's job claim rechecks that the job is still due", () => {
  const now = new Date("2026-10-15T12:00:00.000Z");
  assert.deepEqual(jobClaimWhere("job-1", now), {
    id: "job-1",
    status: "PENDING",
    scheduledAt: { lte: now },
  });
});

test("delete never removes a post the worker is publishing", () => {
  assert.deepEqual(deleteGuardWhere("p1", "ws1", { draftOnly: false }), {
    id: "p1",
    workspaceId: "ws1",
    status: { not: "PUBLISHING" },
  });
});

test("a non-admin's delete only applies while the post is still a draft", () => {
  assert.deepEqual(deleteGuardWhere("p1", "ws1", { draftOnly: true }), {
    id: "p1",
    workspaceId: "ws1",
    status: { in: ["DRAFT", "PENDING_APPROVAL"] },
  });
});

test("a delete that lost the race is a 409, not a silent 404", () => {
  const src = readFileSync("src/app/api/posts/[id]/route.ts", "utf8");
  const del = src.slice(src.indexOf("export async function DELETE"));
  assert.match(del, /deleteGuardWhere\(id, guard\.workspaceId/);
  assert.match(del, /deleted\.count === 0\) \{\s*return NextResponse\.json\(\s*\{ error: POST_CONFLICT_MESSAGE \},\s*\{ status: POST_CONFLICT_STATUS \}/);
});

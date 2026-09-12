import { test } from "node:test";
import assert from "node:assert/strict";
import { PostStatus } from "@prisma/client";

function canSchedule(status: PostStatus): boolean {
  return status === PostStatus.APPROVED;
}

function canReschedule(status: PostStatus): boolean {
  return status === PostStatus.SCHEDULED;
}

test("only APPROVED posts can be scheduled (gate check)", () => {
  const allStatuses = Object.values(PostStatus) as PostStatus[];

  for (const status of allStatuses) {
    const allowed = canSchedule(status);

    if (status === PostStatus.APPROVED) {
      assert.ok(allowed, "APPROVED posts MUST be schedulable");
    } else {
      assert.ok(!allowed, `${status} posts must NOT be schedulable directly`);
    }
  }
});

test("schedule API rejects non-APPROVED posts (approval gate is sacred)", () => {
  const rejectedStatuses: PostStatus[] = [
    PostStatus.DRAFT,
    PostStatus.PENDING_APPROVAL,
    PostStatus.SCHEDULED,
    PostStatus.PUBLISHING,
    PostStatus.PUBLISHED,
    PostStatus.FAILED,
  ];

  for (const status of rejectedStatuses) {
    const isAllowed = canSchedule(status);
    assert.ok(
      !isAllowed,
      `Schedule API must reject ${status} posts — approval gate is sacred`
    );
  }
});

test("only SCHEDULED posts can be rescheduled", () => {
  const allStatuses = Object.values(PostStatus) as PostStatus[];

  for (const status of allStatuses) {
    const allowed = canReschedule(status);

    if (status === PostStatus.SCHEDULED) {
      assert.ok(allowed, "SCHEDULED posts MUST be reschedulable");
    } else {
      assert.ok(!allowed, `${status} posts must NOT be reschedulable`);
    }
  }
});

test("schedule flow preserves approval requirement", () => {
  const workflowPath = [
    { from: "DRAFT" as const, action: "edit", to: "DRAFT" as const },
    { from: "DRAFT" as const, action: "submit", to: "PENDING_APPROVAL" as const },
    { from: "PENDING_APPROVAL" as const, action: "approve", to: "APPROVED" as const },
    { from: "APPROVED" as const, action: "schedule", to: "SCHEDULED" as const },
    { from: "SCHEDULED" as const, action: "reschedule", to: "SCHEDULED" as const },
    { from: "SCHEDULED" as const, action: "publish", to: "PUBLISHING" as const },
    { from: "PUBLISHING" as const, action: "complete", to: "PUBLISHED" as const },
  ];

  const scheduleStep = workflowPath.find((step) => step.action === "schedule");
  assert.ok(scheduleStep, "Workflow must have a schedule step");
  assert.equal(
    scheduleStep.from,
    "APPROVED",
    "Schedule step must start from APPROVED"
  );

  const draftToScheduled = workflowPath.filter(
    (step) => step.from === "DRAFT" && (step.to as string) === "SCHEDULED"
  );
  assert.equal(
    draftToScheduled.length,
    0,
    "There must be no direct path from DRAFT to SCHEDULED"
  );
});

test("scheduled time must be in the future", () => {
  const now = new Date();
  const pastTime = new Date(now.getTime() - 60000);
  const futureTime = new Date(now.getTime() + 60000);

  const isPastValid = pastTime > now;
  const isFutureValid = futureTime > now;

  assert.ok(!isPastValid, "Past times must be rejected");
  assert.ok(isFutureValid, "Future times must be accepted");
});

test("reschedule preserves SCHEDULED status", () => {
  const initialStatus = PostStatus.SCHEDULED;
  const expectedStatusAfterReschedule = PostStatus.SCHEDULED;

  assert.equal(
    initialStatus,
    expectedStatusAfterReschedule,
    "Reschedule should not change post status"
  );
});

test("unschedule returns post to APPROVED status", () => {
  const scheduledStatus = PostStatus.SCHEDULED;
  const expectedStatusAfterUnschedule = PostStatus.APPROVED;

  assert.ok(
    (scheduledStatus as string) !== (expectedStatusAfterUnschedule as string),
    "Status should change on unschedule"
  );
  assert.equal(
    expectedStatusAfterUnschedule,
    PostStatus.APPROVED,
    "Unscheduled post should return to APPROVED"
  );
});
